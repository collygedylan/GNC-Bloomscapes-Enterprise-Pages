import { make, formatQuantity } from "./primitives.js?v=AgData%20v3.1.85";

function describeLegacyMaximum(data, intent, metric) {
  const season = intent.season || data.season || "current season";
  const scope = intent.locationCode ? ` in ${intent.locationCode}` : "";
  const winner = data.winner;
  if (!winner) return `No complete inventory result was available for ${season}${scope}.`;
  if (winner.total == null || String(winner.total).trim() === "" || !Number.isFinite(Number(winner.total))) {
    throw new Error("The maximum result did not include a verified quantity.");
  }
  const metricLabel = metric === "ptronhand" ? "on-hand" : "available";
  const otherItems = Number(data.tieCount) - 1;
  const tie = otherItems > 0 ? `, tied with ${otherItems} other item${otherItems === 1 ? "" : "s"}` : "";
  return `The largest ${season}${scope} ${metricLabel} value is ${winner.commonname}, ${winner.contsize}: ${formatQuantity(winner.total)}${tie}.`;
}

/**
 * Read the verified maximum from the legacy inventory provider.
 * @param {object} widget Mounted widget.
 * @param {object} intent Parsed maximum inventory query.
 * @returns {Promise<void>}
 */
export async function checkLegacyMaximum(widget, intent) {
  const signal = widget.newSignal({ inventory: true });
  const metric = widget.metricFor(intent);
  widget.setMessage(`Checking the largest ${intent.season || "current season"} ${metric === "ptronhand" ? "on-hand" : "available"} value…`);
  try {
    const response = await widget.requestData({ operation: "maximum", season: intent.season, locationCode: intent.locationCode || undefined, metric, openStockOnly: intent.openStockOnly, limit: 500 }, signal);
    const data = response?.data ?? response;
    if (response?.ok === false || data?.complete !== true) throw new Error(response?.error?.message || "The maximum result is incomplete.");
    const reply = describeLegacyMaximum(data, intent, metric);
    widget.setMessage(reply);
    widget.speakReply(reply);
  } catch (error) { widget.showCommandError(error, signal); }
  finally { widget.finishSignal(signal); }
}

/**
 * Verify the inventory match before revealing counts or changing a draft.
 * @param {object} widget Mounted widget.
 * @param {object} intent Parsed inventory match.
 * @param {string} message Visible progress message.
 * @returns {Promise<void>}
 */
export async function matchLegacyInventory(widget, intent, message) {
  const signal = widget.newSignal({ inventory: true });
  widget.setMessage(message);
  try {
    const match = await widget.matchProduct(intent, signal);
    if (match && widget.current() && !signal.aborted) await widget.continueMatchedIntent(intent, match, signal);
  } catch (error) { widget.showCommandError(error, signal); }
  finally { widget.finishSignal(signal); }
}

/**
 * Read and render authorized rows from the standard inventory provider.
 * @param {object} widget Mounted widget.
 * @param {object} intent Parsed inventory query.
 * @returns {Promise<void>}
 */
export async function checkLegacyRows(widget, intent) {
  if (typeof widget.options.requestInventory !== "function") {
    widget.setMessage("The inventory service is not connected yet. Your command is ready, but no data was requested.");
    return;
  }
  const signal = widget.newSignal({ inventory: true });
  widget.setMessage("Checking the live inventory…");
  try {
    const response = await widget.awaitCommand(() => widget.options.requestInventory(intent, widget.readOptions(signal)), signal);
    if (!widget.current() || signal.aborted) return;
    const data = response?.data ?? response;
    if (response?.ok === false || data?.ok === false) throw new Error(response?.error?.message || data?.error || "AURA could not verify this inventory request.");
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    widget.pendingRows = rows;
    renderLegacyRows(widget, intent, data, rows);
  } catch (error) {
    widget.showCommandError(error, signal);
  } finally { widget.finishSignal(signal); }
}

function renderLegacyRows(widget, intent, data, rows) {
  if (intent.type === "inventory") {
    const total = Number(data?.totalAvailable);
    if (data?.complete !== true || !Number.isFinite(total)) {
      widget.setMessage("The inventory result is incomplete, so I’m not presenting a total. Narrow the search or try again.");
      return;
    }
    const summary = rows.length
      ? `${formatQuantity(total)} available across matching open-stock inventory. I’ve pulled the matching rows below.`
      : "No matching open-stock rows came back for that item and size.";
    widget.setMessage(summary);
    if (data?.hasMore === true) {
      widget.content.append(make("p", "aura-message", `Showing ${rows.length} matching rows. More rows are available in the inventory view.`));
    }
    if (rows.length) widget.showRows(rows);
    widget.speakReply(summary);
    return;
  }
  if (!rows.length) {
    const summary = intent.type === "order" ? "No eligible lot has enough available quantity for that order." : "I couldn’t find an exact inventory row at that location.";
    widget.setMessage(summary);
    widget.speakReply(summary);
    return;
  }
  const noun = intent.type === "order" ? "eligible lot" : "matching location";
  widget.setMessage(rows.length === 1 ? `I found one ${noun}. Review the exact row below.` : `I found ${rows.length} ${noun}s. Choose the exact row before we continue.`);
  widget.showRows(rows, intent.type === "order" ? "Review order" : "Select row", (row) => widget.chooseRow(row));
}
