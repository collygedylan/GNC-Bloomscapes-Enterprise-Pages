const assignedOwnerMirrorFields = [
    'DEFAULT_ASSIGNEDTO','default_assignedto','DEFAULT_OWNER','default_owner',
    'ASSIGNEDTO','assignedto','effective_worker','EFFECTIVE_WORKER','zone_override_active','assignment_reason'
];
const optimisticAssignedOwnersByRow = new WeakMap();

function applyOptimisticAssignedDefaults(state, codes, assignee) {
    const defaults = state.defaultOwnersByCode ||= state.itemcodeDefaultOwners instanceof Map ? state.itemcodeDefaultOwners : new Map();
    state.itemcodeDefaultOwners = defaults;
    const farm = typeof getBloomscapesFarm === 'function' ? getBloomscapesFarm() : '';
    const undo = new Map();
    for (const code of codes) {
        const previous = defaults.get(code);
        const optimistic = {...previous, itemcode_normalized:code, assignedto:assignee, default_owner_username:assignee};
        if (farm) optimistic.farm_code = farm;
        defaults.set(code,optimistic);
        undo.set(code,{previous,optimistic});
    }
    return undo;
}

function optimisticAssignmentCandidates(state) {
    return [warehouseAssignedItemsInventory,fullInventory,state.warehouseAssignedItems,state.inventoryRowAssignments,
        state.fullInventory,state.rows,state.data,state.displayCache?.rows].filter(Array.isArray);
}

function stampOptimisticAssignedRow(row, assignee) {
    const fields = assignedOwnerMirrorFields;
    if (typeof nativeAuthSessionActive !== 'undefined' && nativeAuthSessionActive) {
        projectOptimisticAssignedItemOwner(row,fields,assignee);
        return;
    }
    fields.slice(0,8).forEach(field=>{ row[field] = assignee; });
    row.zone_override_active = false;
    row.assignment_reason = assignee ? 'itemcode_default' : 'unassigned';
}

function applyOptimisticAssignedRows(state, codes, assignee) {
    const snapshots = new Map();
    for (const rows of optimisticAssignmentCandidates(state)) {
        for (const row of rows) {
            const code = buildManagerEvalAssignmentKey(row.ITEMCODE || row.itemcode || row.itemcode_normalized);
            if (snapshots.has(row) || !codes.has(code)) continue;
            snapshots.set(row, captureOptimisticAssignedRow(row, assignee));
        }
    }
    return snapshots;
}

function assignedOwnerField(row, field) {
    return {exists: Object.hasOwn(row, field), value: row[field]};
}

function matchesAssignedOwnerField(row, field, expected) {
    return Object.hasOwn(row, field) === expected.exists && Object.is(row[field], expected.value);
}

function captureOptimisticAssignedRow(row, assignee) {
    const previous = optimisticAssignedOwnersByRow.get(row);
    const snapshots = assignedOwnerMirrorFields.map((field, index) => {
        const prior = previous?.[index];
        const before = prior && matchesAssignedOwnerField(row, field, prior.optimistic)
            ? prior.before : assignedOwnerField(row, field);
        return {field, before};
    });
    stampOptimisticAssignedRow(row, assignee);
    for (const snapshot of snapshots) snapshot.optimistic = assignedOwnerField(row, snapshot.field);
    optimisticAssignedOwnersByRow.set(row, snapshots);
    return snapshots;
}

function restoreOptimisticAssignedDefaults(state, undo) {
    const active = state.defaultOwnersByCode;
    for (const [code,{previous,optimistic}] of undo) {
        if (active?.get(code) !== optimistic) continue;
        if (previous === undefined) active.delete(code);
        else active.set(code,previous);
    }
}

function releaseOptimisticAssignedRows(snapshots, restore) {
    for (const [row, fields] of snapshots) {
        if (optimisticAssignedOwnersByRow.get(row) !== fields) continue;
        optimisticAssignedOwnersByRow.delete(row);
        if (restore) restoreAssignedOwnerFields(row, fields);
    }
}

function restoreAssignedOwnerFields(row, fields) {
    for (const {field, before, optimistic} of fields) {
        if (!matchesAssignedOwnerField(row, field, optimistic)) continue;
        if (before.exists) row[field] = before.value;
        else delete row[field];
    }
}

function refreshOptimisticAssignedOwners(state) {
    state.assignedFilterIndex = null;
    state.filteredCache = new Map();
    if (typeof getCardEvalOwnerIndex === 'function') getCardEvalOwnerIndex(state,true);
    if (state === getManagerAssignedColumnState() && typeof refreshSuspendOwnerViews === 'function') refreshSuspendOwnerViews();
}

/** @param {string[]} codes Exact item codes. @param {string} assignee Projected owner. @returns {Function} Scoped undo with a durable commit hook. */
function applyOptimisticItemcodeOwners(codes, assignee) {
    const state = getManagerAssignedColumnState(), wanted = new Set(codes);
    const defaults = applyOptimisticAssignedDefaults(state,wanted,assignee);
    const snapshots = applyOptimisticAssignedRows(state,wanted,assignee);
    state.dataEpoch = (state.dataEpoch || 0) + 1;
    clearWarehouseAssignedItemCaches();
    if (state.displayCache) {
        const {revision} = getManagerItemLowStockTargetsState();
        state.displayCache.signature = getManagerAssignedDisplaySignature(state,state.displayCache.input === fullInventory,revision);
    }
    invalidateManagerEvalReport2Cache();
    refreshOptimisticAssignedOwners(state);
    let settled = false;
    const undo = ({retired = false} = {}) => {
        if (settled) return;
        settled = true;
        restoreOptimisticAssignedDefaults(state,defaults);
        releaseOptimisticAssignedRows(snapshots,true);
        if (retired) return;
        state.dataEpoch++;
        clearWarehouseAssignedItemCaches();
        invalidateManagerEvalReport2Cache();
        refreshOptimisticAssignedOwners(state);
    };
    undo.commit = () => {
        if (settled) return;
        settled = true;
        releaseOptimisticAssignedRows(snapshots,false);
    };
    return undo;
}
