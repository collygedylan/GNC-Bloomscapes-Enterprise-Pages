import { make } from "./primitives.js?v=AgData%20v3.1.85";

function newSignal(widget, { inventory = false, deadlineMs = inventory ? 5000 : null, operation = "inventory" } = {}) {
  widget.commandController?.abort();
  widget.commandController = new AbortController();
  const signal = widget.commandController.signal;
  if (inventory || deadlineMs) {
    const controller = widget.commandController;
    const budgetMs = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : 5000;
    const budget = { explicitRetry: widget.explicitReadRetry, deadlineAt: Date.now() + budgetMs, budgetMs, stage: "preparation", operation,
      requestId: globalThis.crypto?.randomUUID?.() || `aura-${Date.now().toString(36)}` };
    budget.timer = setTimeout(() => {
      controller.abort(Object.assign(new Error(operation === "llm" ? "AURA command exceeded fifteen seconds. Your command and draft are still here. Tap Retry." : "Inventory search exceeded five seconds. Your command and draft are still here. Tap Retry."),
        { name: "TimeoutError", code: "AURA_DEADLINE_EXCEEDED", stage: budget.stage }));
    }, budgetMs);
    signal.addEventListener("abort", () => clearTimeout(budget.timer), { once: true });
    widget.commandBudgets.set(signal, budget);
    widget.explicitReadRetry = false;
  }
  widget.busy = true;
  widget.setRecognitionBusy(true);
  return signal;
}

function awaitCommand(work, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw signal.reason || new DOMException("Cancelled", "AbortError");
      return work();
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function readOptions(widget, signal) {
  const budget = widget.commandBudgets.get(signal);
  return { signal, explicitRetry: budget?.explicitRetry === true, deadlineAt: budget?.deadlineAt, requestId: budget?.requestId,
    onStage: stage => { if (budget) budget.stage = stage; } };
}

function showCommandError(widget, error, signal, retry = () => widget.submitCommand(widget.currentCommandText, { source: "retry" })) {
  if (!widget.current() || widget.commandController?.signal !== signal) return;
  const timeout = signal.reason?.code === "AURA_DEADLINE_EXCEEDED";
  if (signal.aborted && !timeout) return;
  const failure = timeout ? signal.reason : error;
  const budget = widget.commandBudgets.get(signal);
  const diagnostic = { operation: budget?.operation || "inventory", requestId: failure?.requestId || budget?.requestId || "",
    durationMs: budget ? Math.max(0, Date.now() - (budget.deadlineAt - budget.budgetMs)) : 0,
    status: Number(failure?.status || 0), sqlState: /^[0-9A-Z]{5}$/.test(String(failure?.sqlState || failure?.code || "")) ? (failure.sqlState || failure.code) : null,
    timeoutStage: timeout || failure?.name === "TimeoutError" || failure?.code === "57014" || Number(failure?.status) === 504 ? budget?.stage : null };
  console.warn("AURA read failed", diagnostic);
  window.__gncOpsPilot?.captureFailure?.("aura_read", new Error(JSON.stringify(diagnostic)));
  widget.input.value = widget.currentCommandText;
  widget.setMessage(failure?.message || "The inventory lookup failed. Your draft is still here. Retry when ready.");
  widget.content.querySelectorAll(".aura-retry").forEach(node => node.remove());
  const button = make("button", "aura-action aura-retry", "Retry");
  button.type = "button";
  button.addEventListener("click", () => { if (!widget.busy && widget.current()) { button.remove(); widget.explicitReadRetry = true; void retry(); } });
  widget.content.append(button);
}

function finishSignal(widget, signal) {
  clearTimeout(widget.commandBudgets.get(signal)?.timer);
  if (widget.commandController?.signal !== signal) return;
  widget.busy = false;
  widget.setRecognitionBusy(false);
  if (widget.recognitionMode === "browser" && !widget.session.enabled && widget.voiceStatus.status !== "speaking") {
    widget.voiceStatus = { status: "idle", message: "" };
  }
  widget.renderStatus();
  widget.renderCartControls();
}

/**
 * Bind abortable command execution and its read budgets.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraCommandBudget(widget) {
  return {
    newSignal: newSignal.bind(null, widget),
    awaitCommand,
    readOptions: readOptions.bind(null, widget),
    showCommandError: showCommandError.bind(null, widget),
    finishSignal: finishSignal.bind(null, widget),
  };
}
