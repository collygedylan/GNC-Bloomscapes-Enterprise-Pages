function applyBatteryLivePatchBatch(patches) {
    if (!patches.length) return false;
    const anchor = captureProductionRefreshAnchor(getCurrentVisibleViewId());
    const draft = activeItem && (hasProductionLiveSyncDraft() || hasActiveTextEntryFocus()) ? { ...activeItem } : null;
    if (draft && fullInventory.includes(activeItem)) activeItem = { ...activeItem };
    const changed = new Set();
    try {
        for (const payload of patches) applyBatteryPatchRows(payload, changed);
        if (changed.size) flushRealtimeDatasetUpdates([...changed]);
        if (changed.has('ph_master_inventory')) {
            rebuildMasterInventoryIndexes();
            markViewDirty('docks');
            if (isViewVisible('docks')) scheduleDocksRender(0);
            if (cartPanelOpen) updateGlobalActionBar();
        }
    } finally {
        if (draft && activeItem) Object.assign(activeItem, draft);
        restoreProductionRefreshAnchor(anchor);
    }
    if (changed.size) scheduleProductionLiveSyncRender(true);
    return changed.size > 0;
}

function applyBatteryPatchRows(payload, changed) {
    for (const row of payload.rows) {
        const event = { eventType: payload.eventType, new: payload.eventType === 'DELETE' ? null : row,
            old: payload.eventType === 'DELETE' ? row : {} };
        if (applyRealtimeChange(payload.table, event, true)) changed.add(payload.table);
    }
}
