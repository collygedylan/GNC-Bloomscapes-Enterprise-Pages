import { reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

/**
 * Deliver a user-requested message through the legacy app command.
 * @param {object} widget Mounted widget.
 * @param {object} intent Parsed chat intent.
 * @param {string} source Command source.
 * @returns {Promise<void>}
 */
export async function sendLegacyChat(widget, intent, source) {
  if (intent.recipientType === "department") {
    const unavailable = "Department recipients aren’t configured yet, so I didn’t send anything.";
    widget.setMessage(unavailable);
    widget.speakReply(unavailable);
    return;
  }
  if (typeof widget.options.sendMessage !== "function") {
    widget.setMessage("Messaging isn’t connected yet. I didn’t send anything.");
    return;
  }
  const signal = widget.newSignal();
  const key = globalThis.crypto?.randomUUID?.() || `aura-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  widget.setMessage(`Sending your message to ${intent.recipientName}…`);
  try {
    const response = await widget.options.sendMessage(intent, { signal, idempotencyKey: key, source });
    if (!widget.current() || signal.aborted) return;
    if (response?.ok === false) throw new Error(response.error?.message || response.message || "The message was not sent.");
    const recipient = response?.recipientName || intent.recipientName;
    const confirmation = `Message sent to ${recipient}.`;
    widget.setMessage(confirmation);
    widget.speakReply(confirmation);
  } catch (error) {
    if (!widget.current() || signal.aborted) return;
    widget.setMessage(error?.message || "The message was not sent. You can retry explicitly.");
  } finally { widget.finishSignal(signal); }
}

/**
 * Resolve the selected customer and open the local legacy draft.
 * @param {object} widget Mounted widget.
 * @param {object} intent Parsed customer request.
 * @returns {Promise<void>}
 */
export async function startLegacyDraft(widget, intent) {
  if (widget.conversation.party) { widget.setMessage("There’s already a request draft open. Review or cancel it before starting another."); return; }
  if (typeof widget.options.resolveOrderParty !== "function") { widget.setMessage("Bloom Picker customer lookup isn’t connected."); return; }
  const signal = widget.newSignal();
  widget.setMessage(`Finding ${intent.customerName}…`);
  try {
    const result = await widget.options.resolveOrderParty(intent.customerName, { signal });
    if (!widget.current() || signal.aborted) return;
    const parties = Array.isArray(result?.items) ? result.items : [];
    if (result?.hasMore || parties.length > 5) throw new Error("That customer search has more than five possible matches. Add more of the name.");
    if (!parties.length) throw new Error(`I couldn’t find an active Bloom Picker customer named ${intent.customerName}.`);
    if (parties.length === 1) {
      widget.selectedPrivacyParty = null;
      widget.partyRef = null;
      widget.conversation = reduceAuraConversation(widget.conversation, { type: "STARTED", party: parties[0] });
      const reply = `Request started for ${parties[0].label || parties[0].customerName}. What items would you like?`;
      widget.setMessage(reply); widget.speakReply(reply); return;
    }
    widget.pendingChoice = { intent };
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICES", kind: "party", intent, items: parties });
    widget.setMessage("Choose the exact customer, or say a number:");
    widget.renderChoiceButtons(parties, widget.selectChoice);
  } catch (error) { if (!signal.aborted) widget.setMessage(error?.message || "Customer lookup failed."); }
  finally { widget.finishSignal(signal); }
}

/**
 * Verify a customer locally before forwarding an inventory question.
 * @param {object} widget Mounted widget.
 * @param {object} customerReference Customer name candidate and privacy marker.
 * @returns {Promise<void>}
 */
export async function verifyLegacyCustomer(widget, customerReference) {
  if (!customerReference.candidate || typeof widget.options.resolveOrderParty !== "function") {
    widget.setMessage("Customer-related details stay local. Choose a customer with “start a request for…” before asking AURA about customer-specific inventory.");
    return;
  }
  const lookupSignal = widget.newSignal();
  widget.setMessage("Checking the customer picker locally. No customer details are being sent to AURA.");
  try {
    const result = await widget.options.resolveOrderParty(customerReference.candidate, { signal: lookupSignal });
    if (!widget.current() || lookupSignal.aborted) return;
    const parties = Array.isArray(result?.items) ? result.items : [];
    if (result?.hasMore || parties.length > 5) {
      widget.setMessage("That customer name has several matches. Add more of the customer or consignee name.");
    } else if (parties.length) {
      widget.pendingChoice = { kind: "privacy-party" };
      widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICES", kind: "privacy-party", intent: {}, items: parties });
      widget.setMessage("Choose the exact customer locally, then repeat the inventory question. No customer details have been sent to AURA.");
      widget.renderChoiceButtons(parties, widget.selectChoice);
    } else {
      widget.setMessage("I couldn’t match that customer locally, so I didn’t send this customer-related request to AURA. Start a request and choose a customer first.");
    }
  } catch (error) { if (!lookupSignal.aborted) widget.setMessage(error?.message || "The customer picker could not verify that name. No customer details were sent."); }
  finally { widget.finishSignal(lookupSignal); }
}
