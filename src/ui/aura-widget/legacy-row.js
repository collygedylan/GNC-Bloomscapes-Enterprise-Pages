import { make } from "./primitives.js?v=AgData%20v3.1.85";

async function reviewOrder(widget, row, review) {
  if (!widget.current() || widget.busy || typeof widget.options.openOrder !== "function") return;
  const signal = widget.newSignal();
  review.disabled = true;
  try {
    const result = await widget.options.openOrder(widget.pendingIntent, row, { signal });
    if (!widget.current() || signal.aborted) return;
    if (result?.ok === false) throw new Error(result.message || "Bloom Picker could not prepare that draft.");
    widget.setMessage(typeof result === "string" && result ? result : result?.message || "Order details are ready in Bloom Picker. Review them there, then submit when they look right.");
    widget.speakReply("Order draft is staged. Give it a quick review, then you’re clear to submit.");
    widget.togglePanel(false);
  } catch (error) { if (!signal.aborted) widget.setMessage(error?.message || "I couldn’t open the Bloom Picker draft."); }
  finally { widget.finishSignal(signal); review.disabled = false; }
}

async function confirmScoutLog(widget, row, confirm, actions) {
  if (!widget.current() || widget.busy || typeof widget.options.saveScout !== "function") return;
  const signal = widget.newSignal();
  const inventoryUid = String(row.unique_id || row.source_inventory_uid || `${row.itemcode || ""}|${row.locationcode || ""}|${row.lotcode || ""}`);
  if (!widget.idempotencyKeys.has(inventoryUid)) {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    widget.idempotencyKeys.set(inventoryUid, `aura-scout-${requestId}`);
  }
  confirm.disabled = true;
  widget.setMessage("Saving one scouting log for the selected row…");
  try {
    await widget.options.saveScout(widget.pendingIntent, row, { signal, idempotencyKey: widget.idempotencyKeys.get(inventoryUid) });
    if (!widget.current() || signal.aborted) return;
    widget.setMessage("Scouting log sent for review. No inventory was changed.");
    widget.speakReply("Scouting note logged for review. That row is flagged.");
    actions.remove();
  } catch (error) {
    if (!widget.current() || signal.aborted) return;
    confirm.disabled = false;
    widget.setMessage(error?.message || "The scouting log failed. Nothing was changed; you can retry explicitly.");
  } finally { widget.finishSignal(signal); }
}

function chooseRow(widget, row) {
  if (!widget.current() || widget.busy) return;
  widget.content.querySelectorAll(".aura-actions").forEach((node) => node.remove());
  const actions = make("div", "aura-actions");
  if (widget.pendingIntent?.type === "order") {
    const review = make("button", "aura-action primary", "Open prefilled order for review");
    review.type = "button";
    review.addEventListener("click", () => reviewOrder(widget, row, review));
    actions.append(review);
  } else if (widget.pendingIntent?.type === "scout") {
    const confirmation = make("p", "aura-message", `Log “${widget.pendingIntent.pestCode}” for ${row.commonname || widget.pendingIntent.commonName}, ${row.contsize || widget.pendingIntent.contSize}, ${row.locationcode || widget.pendingIntent.locationCode}, lot ${row.lotcode || "—"}?`);
    const confirm = make("button", "aura-action primary", "Confirm scouting log");
    confirm.type = "button";
    confirm.addEventListener("click", () => confirmScoutLog(widget, row, confirm, actions));
    actions.append(confirmation, confirm);
  }
  widget.content.append(actions);
}

/**
 * Bind reviewed legacy row actions.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraLegacyRow(widget) {
  return {
    chooseRow: chooseRow.bind(null, widget),
  };
}
