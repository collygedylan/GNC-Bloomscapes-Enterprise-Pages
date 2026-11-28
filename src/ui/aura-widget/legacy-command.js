import { make } from "./primitives.js?v=AgData%20v3.1.85";

import { checkLegacyMaximum, checkLegacyRows, matchLegacyInventory } from "./legacy-inventory.js?v=AgData%20v3.1.85";

import { sendLegacyChat, startLegacyDraft, verifyLegacyCustomer } from "./legacy-party.js?v=AgData%20v3.1.85";

import { parseAuraIntent } from "../../../utils/auraIntentParser.js?v=AgData%20v3.1.85";

import { acceptsAuraFollowUp, reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

function editLegacyDraft(widget, intent) {
  if (intent.type === "RESUME_REQUEST") {
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "RESUME" });
    if (widget.conversation.auraMode === "CHOOSING" && widget.conversation.choice) widget.renderChoiceButtons(widget.conversation.choice.items, widget.selectChoice);
    widget.renderCartControls();
    widget.armInactivityPause();
    if (acceptsAuraFollowUp(widget.conversation)) void widget.session.startIfAllowed();
    widget.setMessage(widget.conversation.auraMode === "CHOOSING" ? "Choose an option or say its number." : widget.conversation.auraMode === "BUILDING_REQUEST" ? "Request resumed. Add another item or say review request." : "There’s no paused request to resume.");
    return true;
  }
  if (intent.type === "CHOOSE_MATCH" && widget.conversation.auraMode === "CHOOSING") { widget.selectChoice(intent.index); return true; }
  if (intent.type !== "CHOOSE_MATCH" && widget.pendingChoice) {
    widget.pendingChoice = null;
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICE_CANCELLED" });
    widget.content.querySelectorAll(".aura-choice").forEach((node) => node.remove());
  }
  if (intent.type === "CANCEL_REQUEST") {
    widget.commandController?.abort(); widget.commandController = null; widget.busy = false; widget.setRecognitionBusy(false); widget.pendingChoice = null;
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CANCEL" }); widget.renderCartControls();
    widget.partyRef = null;
    widget.selectedPrivacyParty = null;
    widget.content.querySelectorAll(".aura-choice,.aura-row,.aura-actions").forEach((node) => node.remove());
    widget.setMessage("Request cancelled. Nothing was submitted."); return true;
  }
  if (widget.busy) return true;
  widget.armInactivityPause();
  if (intent.type === "UNDO_REQUEST_ITEM") {
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "UNDO" }); widget.renderCartControls();
    widget.setMessage(widget.conversation.lines.length ? "Last item removed from the draft." : "There’s nothing left in the draft."); return true;
  }
  return false;
}

function dispatchLegacyCommand(widget, rawText, intent, source) {
  const draftUtterance = intent.type === "ADD_REQUEST_ITEM" || /^(?:add|put|draft|request|order)\b/i.test(String(rawText || "").trim());
  if (source !== "fallback" && draftUtterance && !widget.conversation.party) {
    widget.setMessage("Start a Bloom Picker request and choose the customer before adding items.");
    return;
  }
  const customerReference = widget.findCustomerReference(rawText);
  if (source !== "fallback" && customerReference.marker && (widget.conversation.party || widget.selectedPrivacyParty)) {
    widget.setMessage("AURA can check inventory, but customer account, payment, invoice, and order-status details stay in the local customer workflows.");
    return;
  }
  if (source !== "fallback" && !widget.conversation.party && !widget.selectedPrivacyParty
      && (customerReference.marker || customerReference.candidate)) {
    return verifyLegacyCustomer(widget, customerReference);
  }
  const shouldRoute = source !== "fallback" && (intent.type === "unknown" || intent.type === "inventory"
    || intent.type === "CHECK_INVENTORY_COUNT" || intent.type === "ADD_REQUEST_ITEM" && !!widget.conversation.party);
  if (shouldRoute) return runLegacyRouter(widget, rawText, source);
  if (intent.type === "ADD_REQUEST_ITEM" && acceptsAuraFollowUp(widget.conversation)) {
    return matchLegacyInventory(widget, intent, "Matching the item and checking eligible lots…");
  }
  if (intent.type === "CHECK_INVENTORY_MAX") return checkLegacyMaximum(widget, intent);
  if (intent.type === "CHECK_INVENTORY_COUNT" && widget.options.requestV2) {
    return matchLegacyInventory(widget, intent, "Matching the item in live inventory…");
  }
  return checkLegacyRows(widget, intent);
}

function showLegacyFallback(widget, error) {
  widget.input.value = widget.currentCommandText;
  widget.setMessage(error?.message || "AURA’s language service is unavailable. You can use the standard inventory lookup instead.");
  const retry = make("button", "aura-action aura-retry", "Retry AURA");
  retry.type = "button";
  retry.addEventListener("click", () => {
    if (!widget.busy && widget.current()) { retry.remove(); void widget.submitCommand(widget.currentCommandText, { source: "retry" }); }
  }, { once: true });
  const fallback = make("button", "aura-action aura-retry", "Use standard lookup");
  fallback.type = "button";
  fallback.addEventListener("click", () => {
    if (widget.busy || !widget.current()) return;
    fallback.remove();
    void widget.submitCommand(widget.currentCommandText, { source: "fallback" });
  }, { once: true });
  widget.content.append(retry, fallback);
}

async function runLegacyRouter(widget, rawText, source) {
  const signal = widget.newSignal({ deadlineMs: 15000, operation: "llm" });
  try {
    await widget.runRouterCommand(rawText, source);
  } catch (error) {
    if (signal.aborted || !widget.current() || widget.commandController?.signal !== signal) return;
    if (Number(error?.status) === 503) showLegacyFallback(widget, error);
    else widget.showCommandError(error, signal);
  } finally {
    widget.finishSignal(signal);
  }
}

async function submitCommand(widget, rawText, { source = "typed" } = {}) {
  if (!widget.current()) return;
  widget.cancelAuraSpeech();
  widget.voiceReplyMode = source === "voice";
  if (widget.queryPanel) { await widget.queryPanel.submit(rawText, source); return; }
  if (String(rawText || "").length > 2000) {
    widget.setMessage("AURA commands can be up to 2,000 characters. Shorten the command and try again.");
    widget.input.value = String(rawText || "").slice(0, 2000);
    return;
  }
  const intent = parseAuraIntent(rawText, { auraMode: widget.conversation.auraMode });
  if (widget.busy && intent.type !== "CANCEL_REQUEST") return;
  widget.currentCommandText = String(rawText ?? "");
  widget.content.querySelectorAll(".aura-retry").forEach(node => node.remove());
  if (editLegacyDraft(widget, intent)) return;
  if (intent.type === "REVIEW_REQUEST") return widget.reviewRequest();
  widget.pendingIntent = intent;
  widget.pendingRows = [];
  widget.idempotencyKeys = new Map();
  widget.content.querySelectorAll(".aura-row,.aura-actions").forEach((node) => node.remove());
  if (intent.type === "chat") return sendLegacyChat(widget, intent, source);
  if (intent.type === "START_REQUEST") return startLegacyDraft(widget, intent);
  return dispatchLegacyCommand(widget, rawText, intent, source);
}

/**
 * Bind command dispatch to a mounted AURA instance.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraLegacyCommand(widget) {
  return {
    submitCommand: submitCommand.bind(null, widget),
  };
}
