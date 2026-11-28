import { make, formatQuantity } from "./primitives.js?v=AgData%20v3.1.85";
import { canonicalAuraSize } from "../../../utils/auraLingo.js?v=AgData%20v3.1.85";
import { reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

function stripSelectedParty(text, party) {
  let safeText = String(text || "").slice(0, 2000);
  const names = [party?.customerName, party?.consigneeName, party?.label]
    .map(value => String(value || "").trim()).filter(value => value.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safeText = safeText.replace(new RegExp(escaped, "ig"), "selected customer");
  }
  return safeText.trim();
}

function findCustomerReference(text) {
  const raw = String(text || "");
  const explicit = raw.match(/\b(?:customer|client|consignee)\s+(?:named\s+)?([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,3})/i);
  const possessive = raw.match(/\b([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,2})['’]s\b/);
  const relation = raw.match(/\b(?:for|to)\s+([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){1,3})\s*[?.!,]*$/);
  const marker = /\b(?:account|balance|credit|invoice|payment|owes?|owed|terms|order\s+(?:for|to)|request\s+(?:for|to))\b/i.test(raw);
  const candidate = String(explicit?.[1] || possessive?.[1] || relation?.[1] || "").trim();
  const generic = new Set(["open stock", "current season", "this season", "the largest", "on hand", "available stock"]);
  return { candidate: candidate && !generic.has(candidate.toLowerCase()) ? candidate : "", marker };
}

function privatePartySidecar(party) {
  if (!party) return null;
  return {
    customerIdentityId: String(party.customerIdentityId || ""),
    consigneeIdentityId: String(party.consigneeIdentityId || ""),
    customerName: String(party.customerName || ""),
    consigneeName: String(party.consigneeName || ""),
  };
}

function partyRefIsUsable(ref) {
  const expiry = String(ref || "").split(".", 1)[0];
  const expiresAt = /^\d{13}$/.test(expiry) ? Number(expiry) : 0;
  return Number.isSafeInteger(expiresAt) && expiresAt > Date.now() + 15_000;
}

function routerContext(widget) {
  return {
    draftLines: widget.conversation.lines.slice(0, 50).map(line => ({
      itemcode: String(line.itemcode || ""), commonname: String(line.commonname || ""),
      contsize: String(line.contsize || ""), locationcode: String(line.locationcode || ""), quantity: Number(line.quantity),
    })),
    selectedRows: widget.routerSelection ? [{
      unique_id: String(widget.routerSelection.unique_id || ""), itemcode: String(widget.routerSelection.itemcode || ""),
      commonname: String(widget.routerSelection.commonname || ""), contsize: String(widget.routerSelection.contsize || ""),
      locationcode: String(widget.routerSelection.locationcode || ""), lotcode: String(widget.routerSelection.lotcode || ""), quantity: null,
    }] : [],
    ...(widget.routerSelection ? {
      sku: String(widget.routerSelection.itemcode || ""), size: String(widget.routerSelection.contsize || ""),
      locationCode: String(widget.routerSelection.locationcode || ""),
    } : {}),
  };
}

function validProductChoice(row) {
  return !!row && typeof row === "object" && !!String(row.itemcode || "").trim()
    && !!String(row.commonname || "").trim() && !!String(row.contsize || "").trim();
}

function validInventoryRow(widget, row) {
  if (!widget.validProductChoice(row)) return false;
  for (const field of ["ptravailable", "ptronhand"]) {
    if (row[field] != null && String(row[field]).trim() !== "" && !Number.isFinite(Number(row[field]))) return false;
  }
  return true;
}

function validLotRow(widget, row) {
  return widget.validInventoryRow(row) && !!String(row.unique_id || "").trim()
    && !!String(row.itemcode || "").trim();
}

function validVerifiedDraftLine(widget, line) {
  return widget.validProductChoice(line) && !!String(line.unique_id || "").trim()
    && Number.isSafeInteger(line.quantity) && line.quantity > 0
    && typeof line.ptravailable === "number" && Number.isFinite(line.ptravailable) && line.ptravailable >= line.quantity;
}

async function bindRouterParty(widget, activeParty) {
  const bindingSignal = widget.commandController?.signal;
  widget.setMessage("Verifying the selected customer for this request…");
  const binding = await widget.awaitCommand(() => widget.options.bindParty(activeParty, widget.readOptions(bindingSignal)), bindingSignal);
  if (!widget.current() || bindingSignal?.aborted) return false;
  if (!binding?.partyRef || !widget.partyRefIsUsable(binding.partyRef)) throw new Error("The selected customer could not be verified. Reopen the request and choose the customer again.");
  widget.partyRef = String(binding.partyRef);
  return true;
}

function prepareRouterAction(widget, action) {
  if (action?.type === "choices") {
    if (!new Set(["inventory", "lot"]).has(action.kind) || !Array.isArray(action.items) || action.items.length > 100
        || action.items.length === 0 && action.complete === true
        || !action.items.every(action.kind === "inventory" ? widget.validProductChoice : widget.validLotRow)) {
      throw new Error("AURA returned invalid choices. No draft changed.");
    }
    return { type: "choices", kind: action.kind, items: action.items.slice(0, 5), complete: action.complete === true, hasMore: action.hasMore === true };
  }
  if (action?.type === "inventory_result") {
    const data = action.data;
    if (!new Set(["open_stock", "count", "maximum", "lot_lookup"]).has(action.operation) || !data || typeof data !== "object") {
      throw new Error("AURA returned an unsupported inventory result. No draft changed.");
    }
    if (data.rows != null && (!Array.isArray(data.rows) || data.rows.length > 100 || !data.rows.every(widget.validInventoryRow))) {
      throw new Error("AURA returned invalid inventory rows. No draft changed.");
    }
    const total = action.operation === "maximum" ? data.winner?.total : data.total ?? data.totalAvailable;
    const trustedTotal = data.complete === true && (total != null && String(total).trim() !== "" && Number.isFinite(Number(total))
      || action.operation === "maximum" && data.winner == null);
    if (action.operation === "maximum" && data.winner != null && (!widget.validProductChoice(data.winner)
        || data.complete === true && !Number.isFinite(Number(data.winner.total)))) {
      throw new Error("AURA returned an invalid maximum result. No draft changed.");
    }
    return { type: "inventory_result", operation: action.operation, data, trustedTotal };
  }
  if (action?.type === "draft_update" || action?.type === "draft_review") {
    const lines = action.type === "draft_update" ? action.lines : action.draft?.lines;
    if (!widget.conversation.party || !widget.partyRef || !Array.isArray(lines) || lines.length < 1 || lines.length > 50
        || !lines.every(widget.validVerifiedDraftLine)) throw new Error("AURA could not verify the proposed draft lines. Your current draft is unchanged.");
    const uniqueLines = new Set(lines.map(line => `${line.itemcode}\u0000${canonicalAuraSize(line.contsize)}`));
    if (uniqueLines.size !== lines.length) throw new Error("AURA returned duplicate product lines. Your current draft is unchanged.");
    return { type: "draft_update", lines };
  }
  throw new Error("AURA returned an unsupported action. No draft changed.");
}

function applyRouterResponse(widget, response, prepared) {
  let nextConversation = widget.conversation;
  for (const action of prepared) {
    if (action.type === "choices" && action.items.length) nextConversation = reduceAuraConversation(nextConversation, { type: "CHOICES", kind: "router", intent: { kind: action.kind }, items: action.items });
    if (action.type === "draft_update") {
      for (const line of action.lines) nextConversation = reduceAuraConversation(nextConversation, { type: "LINE_VERIFIED", line });
    }
  }
  widget.conversation = nextConversation;
  widget.routerSelection = null;
  const incompleteData = prepared.some(action => action.type === "choices" && !action.complete
    || action.type === "inventory_result" && action.operation !== "lot_lookup" && !action.trustedTotal);
  const reply = incompleteData
    ? "Some inventory details are incomplete, so I won’t report a total. Narrow the search or ask about an exact SKU and size."
    : String(response.reply || "I checked the current inventory.").slice(0, 1200);
  widget.setMessage(reply);
  const numericActions = prepared.filter(action => action.type === "inventory_result" && action.operation !== "lot_lookup");
  if (!incompleteData && !numericActions.some(action => !action.trustedTotal) && response.speech) widget.speakReply(String(response.speech));
  for (const action of prepared) renderRouterAction(widget, action);
}

function renderRouterAction(widget, action) {
  if (action.type === "inventory_result") return renderRouterInventory(widget, action);
  if (action.type === "choices") return renderRouterChoices(widget, action);
  widget.renderCartControls();
  widget.setMessage(`Draft updated for ${widget.conversation.party.label || widget.conversation.party.customerName}. Review it when you’re ready. Nothing has been submitted.`);
}

function renderRouterInventory(widget, action) {
  const data = action.data;
  widget.pendingRows = Array.isArray(data.rows) ? data.rows.slice(0, 50) : [];
  if (widget.pendingRows.length) widget.showRows(widget.pendingRows);
  if (action.operation === "maximum" && data.complete === true && data.winner && Number.isFinite(Number(data.winner.total))) {
    const winner = data.winner;
    widget.content.append(make("p", "aura-message", `Maximum: ${winner.commonname}, ${winner.contsize}: ${formatQuantity(winner.total)}.`));
  }
  if (data.hasMore === true || data.rows?.length > 50) widget.content.append(make("p", "aura-message", "Showing the first 50 verified rows. More matches are available in the inventory view."));
}

function renderRouterChoices(widget, action) {
  if (action.items.length) {
    widget.pendingChoice = { kind: "router" };
    if (widget.conversation.auraMode !== "CHOOSING") widget.conversation = reduceAuraConversation(widget.conversation, { type: "CHOICES", kind: "router", intent: { kind: action.kind }, items: action.items });
    widget.renderChoiceButtons(action.items, widget.selectChoice);
  } else widget.setMessage("I couldn’t verify an eligible match. Your current draft is unchanged; try a more exact SKU, size, or lot code.");
  if (!action.complete) widget.content.append(make("p", "aura-message", "These choices may be incomplete. Refine the product name or lot code before preparing a draft."));
  if (action.hasMore) widget.content.append(make("p", "aura-message", "More matches exist. Narrow the request if your item is not shown."));
}

async function runRouterCommand(widget, rawText, source) {
  if (typeof widget.options.requestLlm !== "function") throw Object.assign(new Error("AURA’s language service is not configured."), { status: 503, code: "AURA_LLM_UNAVAILABLE" });
  const activeParty = widget.conversation.party || widget.selectedPrivacyParty;
  if (activeParty && widget.partyRef && !widget.partyRefIsUsable(widget.partyRef)) widget.partyRef = null;
  if (activeParty && !widget.partyRef && typeof widget.options.bindParty === "function") {
    if (!await bindRouterParty(widget, activeParty)) return;
  }
  if (activeParty && !widget.partyRef) throw new Error("Choose a customer before adding request items.");
  const signal = widget.commandController?.signal;
  const requestId = widget.commandBudgets.get(signal)?.requestId;
  const textValue = activeParty ? widget.stripSelectedParty(rawText, activeParty) : String(rawText || "").slice(0, 2000).trim();
  const body = {
    mode: "command", text: textValue, source: source === "voice" ? "voice" : "typed", turnId: requestId,
    context: widget.routerContext(), ...(widget.partyRef ? { partyRef: widget.partyRef, partySidecar: widget.privatePartySidecar(activeParty) } : {}),
  };
  widget.setMessage("AURA is checking that request…");
  const response = await widget.awaitCommand(() => widget.options.requestLlm(body, widget.readOptions(signal)), signal);
  if (!widget.current() || signal?.aborted) return;
  if (response?.ok !== true || response.requestId && response.requestId !== requestId) {
    throw new Error(response?.error?.message || "AURA returned an invalid command response.");
  }
  const actions = Array.isArray(response.actions) ? response.actions : [];
  if (actions.length > 5) throw new Error("AURA returned too many actions. Please narrow the request.");
  const prepared = actions.map(action => prepareRouterAction(widget, action));
  applyRouterResponse(widget, response, prepared);
}

/**
 * Bind legacy router request validation and rendering.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraRouter(widget) {
  return {
    stripSelectedParty,
    findCustomerReference,
    privatePartySidecar,
    partyRefIsUsable,
    routerContext: routerContext.bind(null, widget),
    validProductChoice,
    validInventoryRow: validInventoryRow.bind(null, widget),
    validLotRow: validLotRow.bind(null, widget),
    validVerifiedDraftLine: validVerifiedDraftLine.bind(null, widget),
    runRouterCommand: runRouterCommand.bind(null, widget),
  };
}
