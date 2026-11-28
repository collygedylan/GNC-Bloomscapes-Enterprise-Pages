import { formatQuantity } from "./primitives.js?v=AgData%20v3.1.85";
import { canonicalAuraSize } from "../../../utils/auraLingo.js?v=AgData%20v3.1.85";
import { reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

async function matchProduct(widget, intent, signal) {
  const query = { operation: "match", commonName: intent.commonName, contSize: intent.contSize ? canonicalAuraSize(intent.contSize) : null,
    season: intent.season || undefined, locationCode: intent.locationCode || undefined,
    metric: widget.metricFor(intent), openStockOnly: intent.type === "ADD_REQUEST_ITEM" || intent.openStockOnly === true };
  const key = JSON.stringify(query);
  const cached = widget.matchCache.get(key);
  const response = cached && cached.expires > Date.now() ? cached.data : await widget.requestData(query, signal);
  const data = response?.data ?? response;
  if (data?.complete !== true || !Array.isArray(data.rows) || data.rows.length > 5) {
    throw new Error("Matching data is incomplete. Narrow the plant name or retry; no quantity has been assumed.");
  }
  const candidates = data.rows;
  if (candidates.some(row => !row?.itemcode || !row.commonname || !row.contsize ||
      (query.contSize && canonicalAuraSize(row.contsize) !== query.contSize))) {
    throw new Error("Matching returned an invalid item identity. No item was selected.");
  }
  widget.matchCache.set(key, { data: response, expires: Date.now() + 30_000 });
  if (widget.matchCache.size > 50) widget.matchCache.delete(widget.matchCache.keys().next().value);
  const exact = data.exactMatch === true && candidates.length === 1 && candidates[0].matchKind === "exact" && !data.additionalMatches;
  const result = { kind: exact ? "match" : candidates.length ? "choose" : "none", item: candidates[0], candidates };
  if (result.kind === "choose") {
    widget.pendingChoice = { intent };
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICES", kind: "product", intent, items: result.candidates });
    widget.setMessage(`${data.additionalMatches ? "More matches exist; narrow the name if yours is not shown. " : ""}Choose the exact item and size, or say a number:`);
    widget.renderChoiceButtons(result.candidates, (index) => widget.selectChoice(index));
    widget.renderCartControls();
    return null;
  }
  if (result.kind !== "match") throw new Error("I couldn’t match that plant name confidently. Try the exact common name.");
  return result.item;
}

function selectChoice(widget, index) {
  const choice = widget.conversation.choice;
  const selected = choice?.items?.[index];
  if (!selected || widget.conversation.auraMode !== "CHOOSING" || widget.busy || !widget.current()) { widget.setMessage("Choose one of the numbered options shown."); return; }
  const pending = widget.pendingChoice;
  widget.pendingChoice = null;
  if (choice.kind === "party") {
    widget.selectedPrivacyParty = null;
    widget.partyRef = null;
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "STARTED", party: selected });
    widget.setMessage(`Request started for ${selected.label || selected.customerName}. What items would you like?`);
    widget.renderCartControls();
    widget.speakReply("Request started. What items would you like?");
    return;
  }
  if (choice.kind === "privacy-party") {
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICE_CANCELLED" });
    widget.selectedPrivacyParty = selected;
    widget.partyRef = null;
    widget.setMessage(`Selected ${selected.label || selected.customerName} locally. Repeat your inventory question; the selected name will be kept out of the AURA request.`);
    widget.renderCartControls();
    return;
  }
  if (choice.kind === "router") {
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICE_CANCELLED" });
    widget.routerSelection = selected;
    const kind = choice.intent?.kind === "lot" ? `lot ${selected.lotcode || selected.unique_id}` : `${selected.commonname}, ${selected.contsize}`;
    widget.setMessage(`Selected ${kind}. Tell AURA what you’d like to do next.`);
    widget.renderCartControls();
    return;
  }
  widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICE_CANCELLED" });
  if (pending?.intent) void widget.continueMatchedIntent(pending.intent, selected);
}

async function addVerifiedLine(widget, intent, match, signal) {
  const existing = widget.conversation.lines.find(line => line.itemcode === match.itemcode && canonicalAuraSize(line.contsize) === canonicalAuraSize(match.contsize));
  const cumulativeQuantity = (existing?.quantity || 0) + intent.quantity;
  const response = await widget.requestData({ operation: "lots", itemcode: match.itemcode, contSize: match.contsize, quantity: cumulativeQuantity, metric: "ptravailable", openStockOnly: true, limit: 100 }, signal);
  const data = response?.data ?? response;
  if (response?.ok === false || data?.ok === false) throw new Error(response?.error?.message || "Eligible lots could not be checked.");
  if (data?.complete !== true) throw new Error("Lot availability is incomplete. No line was added.");
  const lots = Array.isArray(data.rows) ? data.rows.filter(row => row.ptravailable != null && String(row.ptravailable).trim() !== "" && Number.isFinite(Number(row.ptravailable)) && Number(row.ptravailable) >= cumulativeQuantity) : [];
  if (!lots.length) throw new Error(`No ${match.commonname} ${match.contsize} lot has ${cumulativeQuantity} available.`);
  const lot = lots[0];
  if (String(lot.itemcode) !== String(match.itemcode) || canonicalAuraSize(lot.contsize) !== canonicalAuraSize(match.contsize) || !lot.commonname) {
    throw new Error("The eligible lot did not match the catalog identity. No item was added.");
  }
  const line = { ...lot, quantity: cumulativeQuantity, ptravailable: Number(lot.ptravailable) };
  widget.conversation = reduceAuraConversation(widget.conversation, { type: "LINE_VERIFIED", line });
  widget.renderCartControls();
  const reply = existing
    ? `Updated the request to ${cumulativeQuantity} ${match.contsize} ${match.commonname}.`
    : `Added ${intent.quantity} ${match.contsize} ${match.commonname} from ${lot.locationcode || "the selected location"}.`;
  widget.setMessage(reply); widget.speakReply(reply);
}

async function continueMatchedIntent(widget, intent, match, parentSignal = null) {
  const signal = parentSignal || widget.newSignal({ inventory: true });
  try {
    if (intent.type === "ADD_REQUEST_ITEM") await widget.addVerifiedLine(intent, match, signal);
    else {
      const response = await widget.requestData({ operation: "count", itemcode: match.itemcode, contSize: match.contsize,
        locationCode: intent.locationCode || undefined, season: intent.season || undefined,
        metric: widget.metricFor(intent), openStockOnly: intent.openStockOnly === true, limit: 500 }, signal);
      const data = response?.data ?? response;
      if (response?.ok === false || data?.complete !== true || data.total == null || String(data.total).trim() === "" || !Number.isFinite(Number(data.total))) throw new Error(response?.error?.message || "The inventory count is incomplete, so I won’t guess.");
      const scope = `${intent.locationCode ? ` in ${intent.locationCode}` : ""} for ${intent.season || data.season || "the current season"}`;
      const kind = widget.metricFor(intent) === "ptronhand" ? "on hand" : "available";
      const reply = `${formatQuantity(data.total)} ${match.contsize} ${match.commonname}${scope} ${kind}.`;
      widget.setMessage(reply); widget.speakReply(reply);
      if (Array.isArray(data.rows) && data.rows.length) { widget.showRows(data.rows); widget.renderCartControls(); }
    }
  } catch (error) { widget.showCommandError(error, signal, () => widget.continueMatchedIntent(intent, match)); }
  finally { if (!parentSignal) widget.finishSignal(signal); }
}

async function reviewRequest(widget) {
  if (widget.busy || widget.conversation.auraMode !== "BUILDING_REQUEST" || !widget.conversation.party || !widget.conversation.lines.length || typeof widget.options.openDraft !== "function") { widget.setMessage("Add an item before reviewing the request."); return; }
  const signal = widget.newSignal({ inventory: true });
  try {
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "REVIEW" });
    widget.renderCartControls();
    const staged = await widget.awaitCommand(() => widget.options.openDraft({ party: widget.conversation.party, lines: widget.conversation.lines }, widget.readOptions(signal)), signal);
    if (!widget.current() || signal.aborted) return;
    if (staged?.ok === false) throw new Error(staged.message || "The request could not be staged for review.");
    const message = staged?.message || (typeof staged === "string" ? staged : "Draft opened in Bloom Picker. Review it there before submitting.");
    widget.setMessage(message); widget.speakReply("Draft is ready for your review. Nothing has been submitted.");
    widget.conversation = reduceAuraConversation(widget.conversation, { type: "HANDED_OFF" }); widget.renderCartControls();
    widget.partyRef = null;
    widget.togglePanel(false);
  } catch (error) {
    if (widget.current() && widget.commandController?.signal === signal && (!signal.aborted || signal.reason?.code === "AURA_DEADLINE_EXCEEDED")) widget.conversation = reduceAuraConversation(widget.conversation, { type: "REVIEW_FAILED" });
    widget.showCommandError(error, signal, widget.reviewRequest);
  } finally { widget.finishSignal(signal); }
}

async function requestData(widget, body, signal) {
  if (typeof widget.options.requestV2 !== "function") throw new Error("The inventory intelligence service is not connected.");
  const ownerSignal = signal || widget.commandController?.signal;
  try {
    const budget = widget.commandBudgets.get(ownerSignal);
    if (budget) { budget.operation = body.operation; budget.stage = "queue"; }
    const result = await widget.awaitCommand(() => widget.options.requestV2(body, widget.readOptions(ownerSignal)), ownerSignal);
    if (ownerSignal?.aborted || !widget.current() || widget.commandController?.signal !== ownerSignal) throw new DOMException("AURA request is no longer current.", "AbortError");
    const status = Number(result?.status ?? result?.error?.status);
    const code = String(result?.code ?? result?.error?.code ?? "");
    if ([401, 403].includes(status) || code === "42501") widget.matchCache.clear();
    return result;
  } catch (error) {
    const status = Number(error?.status ?? error?.statusCode ?? error?.context?.status);
    if ([401, 403].includes(status) || String(error?.code ?? "") === "42501") widget.matchCache.clear();
    throw error;
  }
}

function metricFor(intent) { return intent.metric === "ptronhand" ? "ptronhand" : "ptravailable"; }

/**
 * Bind legacy verified draft and inventory match interactions.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraDraft(widget) {
  return {
    matchProduct: matchProduct.bind(null, widget),
    selectChoice: selectChoice.bind(null, widget),
    addVerifiedLine: addVerifiedLine.bind(null, widget),
    continueMatchedIntent: continueMatchedIntent.bind(null, widget),
    reviewRequest: reviewRequest.bind(null, widget),
    requestData: requestData.bind(null, widget),
    metricFor,
  };
}
