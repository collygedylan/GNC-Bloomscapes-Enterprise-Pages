function reclassCommandOverlay(overlay, entries) {
    const proposals = Array.isArray(overlay && overlay.proposals) ? overlay.proposals : [];
    const moveProposals = proposals.filter((proposal) => proposal && ['move_up', 'move_down'].includes(proposal.action));
    if (!moveProposals.length) return null;
    const uid = String(overlay.unique_id || '').trim();
    const entry = entries.find((candidate) => String(candidate && candidate.unique_id || '').trim() === uid);
    const row = entry && entry.sourceRow && (entry.sourceRow.__reclassIdentityRaw || entry.sourceRow);
    if (!entry || !row || !uid) throw new Error('A Reclass source row is no longer available. Refresh and review the worksheet.');
    const identity = {};
    ['unique_id', 'itemcode', 'contsize', 'locationcode', 'lotcode', 'season', 'ptronhand', 'ptravailable'].forEach((field) => {
        const raw = row[field] !== undefined ? row[field] : row[field.toUpperCase()];
        identity[field] = raw === undefined || raw === null ? null : String(raw);
    });
    identity.unique_id = uid;
    const lines = [];
    moveProposals.forEach((proposal) => {
        const splits = Array.isArray(proposal.splits) ? proposal.splits : [];
        splits.forEach((split) => lines.push({ direction: proposal.action,
            destinationSeason: String(split.destinationSeason || '').trim().toUpperCase(), quantity: Number(split.quantity),
            ...(split.destinationLocation ? { destinationLocation: normalizeReclassDestinationLocation(split.destinationLocation) } : {}) }));
    });
    return { source: { uniqueId: uid, identity }, lines, sourceRow: entry.sourceRow };
}

function validateReclassMoveUpLots(moves) {
    const moveUpLots = new Map();
    moves.forEach((move) => {
        const row = move.sourceRow || {};
        const itemcode = String(row.ITEMCODE ?? row.itemcode ?? '').trim().toUpperCase();
        const lotcode = String(row.LOTCODE ?? row.lotcode ?? '').trim().toUpperCase();
        const rawOpenStock = row.OPEN_STOCK ?? row.open_stock ?? row.S_LTS ?? row.s_lts ?? 0;
        const parsedOpenStock = Number(String(rawOpenStock ?? 0).trim().replace(/,/g, ''));
        const openStock = Number.isFinite(parsedOpenStock) ? Math.max(0, parsedOpenStock) : 0;
        const moveUp = move.lines.filter((line) => line.direction === 'move_up').reduce((sum, line) => sum + line.quantity, 0);
        if (!moveUp) return;
        const key = `${itemcode}|${lotcode}`;
        const current = moveUpLots.get(key) || { quantity: 0, openStock, lotcode };
        current.quantity += moveUp;
        current.openStock = Math.min(current.openStock, openStock);
        moveUpLots.set(key, current);
    });
    for (const lot of moveUpLots.values()) {
        if (lot.quantity > lot.openStock) throw new Error(`Cannot Move Up more than Open Stock (${lot.openStock}) for lot ${lot.lotcode}.`);
    }
}

function validateReclassMoveLineages(moves) {
    const lineageKey = (row, lotcode = null) => JSON.stringify([
        String(row.warehouseid ?? row.WAREHOUSEID ?? row.warehousei ?? row.WAREHOUSEI ?? ''),
        String(row.itemcode ?? row.ITEMCODE ?? ''), String(row.contsize ?? row.CONTSIZE ?? ''),
        String(row.locationcode ?? row.LOCATIONCODE ?? ''), String(lotcode ?? row.lotcode ?? row.LOTCODE ?? ''),
        String(row.source ?? row.SOURCE ?? ''), String(row.desigitem ?? row.DESIGITEM ?? ''),
        String(row.desigcust ?? row.DESIGCUST ?? ''), String(row.desigloc ?? row.DESIGLOC ?? '')
    ]);
    const claimedLineages = new Set(moves.map((move) => lineageKey(move.sourceRow)));
    for (const move of moves) {
        const row = move.sourceRow;
        for (const line of move.lines) {
            const targetRow = line.destinationLocation ? { ...row, locationcode: line.destinationLocation } : row;
            const destinationLineage = lineageKey(targetRow, reclassDestinationLot(row, line.destinationSeason));
            if (claimedLineages.has(destinationLineage)) {
                throw new Error('Two selected moves resolve to the same inventory row. Submit those sources separately and review the result.');
            }
            claimedLineages.add(destinationLineage);
        }
        delete move.sourceRow;
    }
}

function buildInventoryReclassMoveCommand(payload = {}, state = null) {
    const overlays = Array.isArray(payload.rowOverlays) ? payload.rowOverlays : [];
    const entries = Array.isArray(state && state.inquiryModel && state.inquiryModel.locationRows) ? state.inquiryModel.locationRows : [];
    const moves = overlays.map(overlay => reclassCommandOverlay(overlay, entries)).filter(Boolean);
    if (!moves.length) return null;
    validateReclassMoveUpLots(moves);
    validateReclassMoveLineages(moves);
    if (readPendingArgosInventoryReclassMove(getArgosReclassLiveEditIdentityKey())) {
        throw new Error('Another inventory move is still being confirmed. Reopen its source row and retry the same move first.');
    }
    if (!state || !canUseProductionLiveSync()
        || state.verificationIdentityKey && state.verificationIdentityKey !== getArgosReclassLiveEditIdentityKey()
        || state.verifiedInquiryGroup && state.verifiedInquiryGroup.identityKey !== getArgosReclassLiveEditIdentityKey()) {
        throw new Error('Reclass access changed. Sign in to the original account before submitting this draft.');
    }
    // A known revision can be a hint; its absence never blocks a loaded
    // row. SQL locks and compares every submitted source identity.
    const revisionText = state.verifiedInquiryGroup ? getArgosReclassVerifiedInquiryRevision(state) : '';
    const revision = Number(revisionText);
    const expectedRevision = /^[1-9]\d*$/.test(revisionText) && Number.isSafeInteger(revision) ? revision : null;
    const commandId = String(state.pendingReclassMove && state.pendingReclassMove.command.commandId
        || state.moveCommandId || generateArgosInventoryTransactionId('inventory_reclass_move')).trim();
    state.moveCommandId = commandId;
    return { commandId, expectedRevision, moves, reclassExplanations: payload.reclassExplanations || {} };
}

function reclassStockSeason(row) {
    const lot = String(row && (row.LOTCODE ?? row.lotcode) || '').trim();
    return (lot.match(/\.([A-Z][0-9]?)$/i)?.[1] || String(row && (row.SEASON ?? row.season) || '')).trim().toUpperCase();
}

function buildOptimisticInventoryReclassMoveModel(state = null, command = null) {
    const model = state && state.inquiryModel;
    if (!model || !Array.isArray(model.rows) || !command) return null;
    const rows = model.rows.map((row) => ({ ...row }));
    const context = createReclassWorksheetContext(rows, command);
    command.moves.forEach((move, index) => applyReclassWorksheetMove(context, move, index));
    refreshReclassWorksheetStock(context);
    refreshReclassWorksheetLocations(rows);
    rows.forEach(projectReclassRowOpenStock);
    return { model: buildItemInquiryViewModel(state.item, rows), movedUids: context.movedUids };
}

function createReclassWorksheetContext(rows, command) {
    const movedUids = [];
    const stockDeltas = new Map();
    const seasonOpenStocks = new Map();
    const salesYear = row => normalizeNcrSalesYearValue(String(row.LOTCODE ?? row.lotcode ?? '').split('.')[0]) ?? getNcrExplicitSalesYear(row);
    const currentYear = normalizeNcrSalesYearValue(getConfiguredCurrentSalesYearCode());
    const currentSeason = String(getConfiguredCurrentSeasonCode()).toUpperCase();
    const stockKey = row => String(row.ITEMCODE ?? row.itemcode ?? '') + '|' + reclassStockSeason(row) + '|' + salesYear(row);
    const currentTargetPools = new Set();
    const physicalSeasonKeys = new Set(rows.map(stockKey));
    const cavRows = typeof cavInventory !== 'undefined' ? cavInventory : [];
    const recordStock = (key, raw) => {
        const value = parseAppNumber(raw);
        if (value != null && !seasonOpenStocks.has(key)) seasonOpenStocks.set(key, value);
    };
    for (const row of cavRows) {
        const key = stockKey({ ...row, LOTCODE: currentYear + '.' + reclassStockSeason(row) });
        recordStock(key, row.OPEN_STOCK ?? row.open_stock ?? row.PTRAVAILABLE ?? row.ptravailable);
    }
    for (const row of rows) recordStock(stockKey(row), row.S_LTS ?? row.s_lts);
    const effective = row => ['H','S'].includes(String(row.HOLDSTOPCODE ?? row.holdstopcode ?? '').toUpperCase()) ? 0 : 1;
    const physicalValue = (row, field) => row && (row[field] !== undefined ? row[field] : row[field.toUpperCase()]);
    // Match the RPC's item/location/lot lookup; priority and source aliases cannot create a second destination.
    const lineageKey = (row, lotcode = null) => JSON.stringify([
        physicalValue(row, 'itemcode'), physicalValue(row, 'locationcode'), lotcode ?? physicalValue(row, 'lotcode')
    ].map(value => String(value ?? '').trim().toUpperCase()));
    return { rows, command, movedUids, stockDeltas, seasonOpenStocks, salesYear, currentYear, currentSeason, stockKey, currentTargetPools, physicalSeasonKeys, effective, lineageKey };
}

function applyReclassWorksheetMove(context, move, moveIndex) {
    const { rows, command, movedUids, stockDeltas, stockKey, effective } = context;
    const uid = move.source.uniqueId;
    const sourceIndex = rows.findIndex((row) => String(row.UNIQUE_ID || row.unique_id || '') === uid);
    if (sourceIndex < 0) throw new Error('A Reclass source row is no longer in the verified worksheet. Refresh and try again.');
    const source = rows[sourceIndex];
    const total = move.lines.reduce((sum, line) => sum + line.quantity, 0);
    const onHand = parseAppNumber(source.PTRONHAND ?? source.ptronhand);
    const available = parseAppNumber(source.PTRAVAILABLE ?? source.ptravailable);
    if (onHand == null || available == null || total > onHand || total > available) {
        throw new Error('The source quantity is unknown or insufficient. Refresh the worksheet before moving stock.');
    }
    rows[sourceIndex] = { ...source, PTRONHAND: String(onHand - total), ptronhand: String(onHand - total),
        PTRAVAILABLE: String(available - total), ptravailable: String(available - total), __optimisticReclassMove: command.commandId };
    stockDeltas.set(stockKey(source), (stockDeltas.get(stockKey(source)) || 0) - total * effective(source));
    movedUids.push(uid);
    move.lines.forEach(line => applyReclassWorksheetTarget(context, source, moveIndex, line));
}

function applyReclassWorksheetTarget(context, source, moveIndex, line) {
    const { quantity, destinationSeason: season } = line;
    const location = line.destinationLocation || source.locationcode || source.LOCATIONCODE;
    const { rows, command, stockDeltas, seasonOpenStocks, salesYear, currentYear, currentSeason, stockKey, currentTargetPools, physicalSeasonKeys, effective, lineageKey } = context;
    const targetLot = reclassDestinationLot(source, season);
    const targetKey = lineageKey({ ...source, locationcode: location }, targetLot);
    const targetIndexes = [];
    rows.forEach((row, index) => { if (lineageKey(row) === targetKey) targetIndexes.push(index); });
    if (targetIndexes.length > 1) throw new Error('The destination inventory row is ambiguous. Refresh the worksheet before moving stock.');
    const targetIndex = targetIndexes.length ? targetIndexes[0] : -1;
    const current = targetIndex >= 0 ? rows[targetIndex] : null;
    const targetOnHand = parseAppNumber(current && (current.PTRONHAND ?? current.ptronhand));
    const targetAvailable = parseAppNumber(current && (current.PTRAVAILABLE ?? current.ptravailable));
    if (current && (targetOnHand == null || targetAvailable == null)) {
        throw new Error('The destination quantity is unknown. Refresh the worksheet before moving stock.');
    }
    const baseOnHand = targetOnHand == null ? 0 : targetOnHand;
    const baseAvailable = targetAvailable == null ? 0 : targetAvailable;
    const pendingUid = current ? String(current.UNIQUE_ID || current.unique_id || '') : `pending-reclass-${command.commandId}-${moveIndex}-${season}-${location}`;
    const destinationSeasonKey = stockKey({ ...source, LOTCODE: targetLot, lotcode: targetLot });
    if (!current && !physicalSeasonKeys.has(destinationSeasonKey)) seasonOpenStocks.set(destinationSeasonKey, 0);
    const destinationOpenStock = current
        ? parseAppNumber(current.S_LTS ?? current.s_lts ?? current.OPEN_STOCK ?? current.open_stock)
        : parseAppNumber(seasonOpenStocks.get(destinationSeasonKey)) ?? 0;
    const target = { ...source, ...(current || {}), UNIQUE_ID: pendingUid, unique_id: pendingUid, LOTCODE: targetLot, lotcode: targetLot,
        LOCATIONCODE: location, locationcode: location,
        HOLDSTOPCODE: current ? (current.HOLDSTOPCODE ?? current.holdstopcode) : '', holdstopcode: current ? (current.holdstopcode ?? current.HOLDSTOPCODE) : '',
        HOLDSTOPREASON: current ? (current.HOLDSTOPREASON ?? current.holdstopreason) : '', holdstopreason: current ? (current.holdstopreason ?? current.HOLDSTOPREASON) : '',
        HOLDSTOPBEGINDATE: current ? (current.HOLDSTOPBEGINDATE ?? current.holdstopbegindate) : '', holdstopbegindate: current ? (current.holdstopbegindate ?? current.HOLDSTOPBEGINDATE) : '',
        HOLDSTOPENDDATE: current ? (current.HOLDSTOPENDDATE ?? current.holdstopenddate) : '', holdstopenddate: current ? (current.holdstopenddate ?? current.HOLDSTOPENDDATE) : '',
        PRIORITY: current ? (current.PRIORITY ?? current.priority) : (source.PRIORITY ?? source.priority ?? ''), priority: current ? (current.priority ?? current.PRIORITY) : (source.priority ?? source.PRIORITY ?? ''),
        PTRREVIEWED: current ? (current.PTRREVIEWED ?? current.ptrreviewed) : '0', ptrreviewed: current ? (current.ptrreviewed ?? current.PTRREVIEWED) : '0',
        SALEYEAR: String(salesYear(source)), saleyear: String(salesYear(source)), SEASON: season, season, PTRONHAND: String(baseOnHand + quantity), ptronhand: String(baseOnHand + quantity),
        PTRAVAILABLE: String(baseAvailable + quantity), ptravailable: String(baseAvailable + quantity),
        __optimisticReclassMove: command.commandId };
    if (targetIndex < 0) {
        target.S_LTS = target.s_lts = String(destinationOpenStock);
        target.RESERVED_QTY = target.reserved_qty = '0';
    }
    if (season === currentSeason && salesYear(target) != null && salesYear(target) <= currentYear) currentTargetPools.add(String(target.ITEMCODE ?? target.itemcode ?? ''));
    stockDeltas.set(stockKey(target), (stockDeltas.get(stockKey(target)) || 0) + quantity * effective(target));
    if (targetIndex >= 0) rows[targetIndex] = target;
    else rows.push(target);
}

function refreshReclassWorksheetStock(context) {
    const { rows, stockDeltas, seasonOpenStocks, salesYear, currentYear, currentSeason, stockKey, currentTargetPools, effective } = context;
    rows.forEach(row => {
        const key = stockKey(row);
        const itemcode = String(row.ITEMCODE ?? row.itemcode ?? '');
        const pooled = currentTargetPools.has(itemcode) && reclassStockSeason(row) === currentSeason && salesYear(row) != null && salesYear(row) <= currentYear;
        const poolRows = pooled ? rows.filter(r => String(r.ITEMCODE ?? r.itemcode ?? '') === itemcode && reclassStockSeason(r) === currentSeason && salesYear(r) != null && salesYear(r) <= currentYear) : rows.filter(r => stockKey(r) === key);
        const delta = stockDeltas.get(key) || 0;
        const rowStock = parseAppNumber(row.S_LTS ?? row.s_lts);
        if (pooled) row.S_LTS = row.s_lts = row.OPEN_STOCK = row.open_stock = String(poolRows.reduce((sum, r) => sum + (parseAppNumber(r.PTRAVAILABLE ?? r.ptravailable) || 0) * effective(r), 0));
        else if (stockDeltas.has(key) && rowStock != null) {
            row.S_LTS = row.s_lts = String(rowStock + delta);
            row.OPEN_STOCK = row.open_stock = row.S_LTS;
        }
        if (pooled) row.__reclassSeasonOpenStock = row.S_LTS;
        else if (stockDeltas.has(key) && seasonOpenStocks.has(key)) row.__reclassSeasonOpenStock = String(seasonOpenStocks.get(key) + delta);
        row.SEASON_OH = row.season_oh = String(poolRows.reduce((sum, r) => sum + (parseAppNumber(r.PTRONHAND ?? r.ptronhand) || 0), 0));
    });
}

function refreshReclassWorksheetLocations(rows) {
    const locationRows = new Map();
    rows.forEach(row => {
        const key = JSON.stringify([String(row.ITEMCODE ?? row.itemcode ?? '').trim().toUpperCase(),
            String(row.LOCATIONCODE ?? row.locationcode ?? '').trim().toUpperCase()]);
        if (!locationRows.has(key)) locationRows.set(key, []);
        locationRows.get(key).push(row);
    });
    locationRows.forEach(group => {
        const quantities = group.map(row => parseAppNumber(row.PTRONHAND ?? row.ptronhand));
        if (quantities.some(value => value == null)) return;
        const total = String(quantities.reduce((sum, value) => sum + value, 0));
        group.forEach(row => { row.LOC_ON_HAND = row.loc_on_hand = total; });
    });
}

function projectReclassRowOpenStock(row) {
    if (!row.__optimisticReclassMove) return;
    const onHand = parseAppNumber(row.PTRONHAND ?? row.ptronhand);
    const review = parseAppNumber(row.PTRREVIEWED ?? row.ptrreviewed) ?? 0;
    const reserves = parseAppNumber(row.RESERVED_QTY ?? row.reserved_qty) ?? 0;
    if (onHand == null) return;
    row.OPEN_STOCK = row.open_stock = String(Math.max(0, onHand - review - reserves));
}

function isDepletedReclassRow(row) {
    return !!row && !!(row.__optimisticReclassMove || row.reclass_depleted === true || row.RECLASS_DEPLETED === true)
        && parseAppNumber(row.PTRONHAND ?? row.ptronhand) === 0
        && parseAppNumber(row.PTRAVAILABLE ?? row.ptravailable) === 0;
}

function renderArgosReclassMoveProposal(rule, normalized, proposal, uid, entry, values) {
    const originalOh = Number(String(values.ptronhand == null ? '' : values.ptronhand).replace(/,/g, ''));
    const moveUpState = normalized === 'move_up' ? getArgosReclassMoveUpLotState(entry) : null;
    const inputMaximum = moveUpState ? moveUpState.rowMaximum : originalOh;
    const currentSeason = getArgosReclassRowCurrentSeason(entry);
    Object.assign(proposal, cloneArgosReclassProposal(proposal));
    const label = normalized === 'move_up' ? 'Move Up' : 'Move Down';
    const splitCursor = Math.min(argosInventoryTransactionState?.reclassSplitCursor?.[uid + ':' + normalized] || 0, proposal.splits.length - 1);
    const splitRows = proposal.splits.map((split, index) => {
        if (index !== splitCursor) return '';
        const options = RECLASS_ACTION_WORKFLOW_V2_SEASONS.filter((season) => season !== currentSeason).map((season) => `<option value="${escapeHtml(season)}" ${String(split.destinationSeason || '').toUpperCase() === season ? 'selected' : ''}>${escapeHtml(season)}</option>`).join('');
        const attrs = `data-reclass-v3-proposal-action="${normalized}" data-reclass-split-index="${index}"`;
        return `<div class="argos-reclass-move-split"><label class="argos-reclass-action-proposal"><span>Qty</span><input class="argos-reclass-row-input" type="number" inputmode="numeric" min="1" step="1" max="${escapeHtml(String(Number.isFinite(inputMaximum) ? inputMaximum : ''))}" aria-label="${label} quantity ${index + 1}" value="${escapeHtml(String(split.quantity ?? ''))}" ${attrs} data-reclass-v3-proposal-field="quantity" oninput="return handleArgosReclassV3ProposalInput(this)"></label><label class="argos-reclass-action-proposal"><span>Destination Lot / Season</span><select class="argos-reclass-row-input argos-reclass-destination-native" aria-label="${label} destination ${index + 1}" ${attrs} data-reclass-v3-proposal-field="destinationSeason" onchange="return handleArgosReclassV3ProposalInput(this)"><option value="">Select Destination</option>${options}</select><button type="button" class="argos-reclass-destination-trigger" onclick="return toggleArgosReclassDestinationMenu(this)">${escapeHtml(String(split.destinationSeason || 'Select Destination'))} <span>▾</span></button><div class="argos-reclass-destination-menu" hidden></div></label><label class="argos-reclass-action-proposal"><span>Destination Location</span><input class="argos-reclass-row-input" type="text" maxlength="8" placeholder="Source location" value="${escapeHtml(split.destinationLocation || '')}" ${attrs} data-reclass-v3-proposal-field="destinationLocation" oninput="return handleArgosReclassV3ProposalInput(this)"></label><button type="button" class="argos-reclass-action-btn" aria-label="Remove ${label} destination ${index + 1}" onclick="return changeArgosReclassMoveSplit(this,'${normalized}',${index})" ${proposal.splits.length === 1 ? 'disabled' : ''}>✕</button></div>`;
    }).join('');
    const holdHtml = proposal.applyHold
            ? '<p class="argos-reclass-action-scope-notice" role="alert">This saved move uses a retired Hold option. Remove and re-add the move, then select On Hold in the action grid.</p>'
            : '<p class="argos-reclass-action-scope-notice" role="note">Use On Hold or Off Hold in the action grid for hold changes.</p>';
    return `<fieldset class="argos-reclass-move-editor" data-reclass-move-action="${normalized}"><legend>${escapeHtml(rule.label)}</legend><div class="argos-reclass-move-heading"><p data-reclass-move-balance title="Open Stock (Max Move Up) is enforced separately from On Hand" data-over-limit="${getArgosReclassMoveBalance(entry).remaining < 0}" role="status">${escapeHtml(getArgosReclassMoveBalanceText(entry))}</p><button type="button" class="argos-reclass-action-btn" onclick="return changeArgosReclassMoveSplit(this,'${normalized}')" ${proposal.splits.length >= 100 ? 'disabled' : ''}>+ Add Split</button></div>${splitRows}${proposal.splits.length > 1 ? `<nav class="argos-reclass-split-pages" aria-label="Move split pages"><button type="button" onclick="return changeArgosReclassSplitPage(this,'${normalized}',${splitCursor - 1})" ${splitCursor === 0 ? 'disabled' : ''}>◂ Previous</button><span>Split ${splitCursor + 1} of ${proposal.splits.length}</span><button type="button" onclick="return changeArgosReclassSplitPage(this,'${normalized}',${splitCursor + 1})" ${splitCursor === proposal.splits.length - 1 ? 'disabled' : ''}>Next ▸</button></nav>` : ''}${proposal.applyHold ? holdHtml : ''}</fieldset>`;
}
