function bloomscapesDockProgressKey(uniqueId,farm=getBloomscapesFarm()) {
    const uid = normalizeDockItemUniqueId(uniqueId);
    return uid ? farm+':'+uid : '';
}

function getDocksSuspendSyncAudit() {
    const rows=dockIssueDataLoaded ? getDockResolvedState().rows : socInventory;
    const source=applyDockStructuredFilters(getScopedDocksItems(rows));
    const tags=Array.isArray(suspendTagInventory) ? suspendTagInventory : [];
    const ids=new Set(),keys=new Set();
    let duplicates=0,resurrected=0,mismatches=0;
    const orders=new Map(socInventory.map(row=>[getDockSuspendDcRequestSourceUid(row),row]));
    for(const row of tags) {
        const uid=getDockSuspendDcRequestSourceUid(row),key=getDockOrderBusinessKey(row);
        if(ids.has(uid) || key && keys.has(key)) duplicates++;
        ids.add(uid);if(key)keys.add(key);
        if(row.suspend_completed===true || row.completed===true || /^(complete|completed|deleted)$/i.test(row.status || row.STATUS || '')) resurrected++;
        const order=orders.get(uid);
        if(order && String(order.LOCATIONCODE || order.locationcode || '').trim()!==String(row.LOCATIONCODE || row.locationcode || '').trim()) mismatches++;
    }
    const container=document.getElementById('docks-content');
    const mounted=isViewVisible('docks') && container && !String(document.getElementById('docks-search')?.value || '').trim()
        && dockViewMode!=='mistakes' && dockViewMode!=='dropoff';
    const pending=!!(mounted && (ensureViewRenderState('docks').dirty || container.dataset?.activeChunkRenderKey
        || container.querySelector('[aria-busy="true"],[data-loading="true"]')));
    const selector=dockViewLevel===0?'data-docks-dock-card':dockViewLevel===1?'data-docks-drop-card':'data-docks-stop-card';
    const nodes=mounted ? [...container.querySelectorAll('['+selector+']')] : [];
    const shown=nodes.map(node=>node.getAttribute(selector));
    const expected=dockViewLevel===0 ? new Set(source.map(row=>normalizeDockViewDockKey(row.DOCK_NUM))).size
        : dockViewLevel===1 ? new Set(source.filter(row=>normalizeDockViewDockKey(row.DOCK_NUM)===normalizeDockViewDockKey(selectedDockNum)).map(row=>normalizeDockViewStopKey(row.STOPNUMBER))).size : null;
    return {duplicates,resurrected,mismatches,duplicateCards:shown.length-new Set(shown).size,
        hierarchyMismatch:!!(mounted && !pending && expected!==null && shown.length!==expected),pending};
}

function readLegacyDockItemProgress(uniqueId = '') {
    const normalizedUid = bloomscapesDockProgressKey(uniqueId);
    if (!normalizedUid) return getDefaultDockItemProgress();
    try {
        return normalizeDockItemProgress(JSON.parse(localStorage.getItem('gnc_dock_item_' + normalizedUid) || '{}'));
    } catch {
        return getDefaultDockItemProgress();
    }
}

function cacheDockItemProgress(uniqueId = '', progress = null) {
    const normalizedUid = bloomscapesDockProgressKey(uniqueId);
    if (!normalizedUid) return getDefaultDockItemProgress();
    const normalized = normalizeDockItemProgress(progress);
    dockItemProgressByUid.set(normalizedUid, normalized);
    localStorage.setItem('gnc_dock_item_' + normalizedUid, JSON.stringify(normalized));
    invalidateDockWorkflowResolvedState();
    return normalized;
}

function getDockItemProgress(uniqueId = '') {
    const normalizedUid = bloomscapesDockProgressKey(uniqueId);
    if (!normalizedUid) return getDefaultDockItemProgress();
    if (dockItemProgressByUid.has(normalizedUid)) return normalizeDockItemProgress(dockItemProgressByUid.get(normalizedUid));
    const legacy = readLegacyDockItemProgress(uniqueId);
    dockItemProgressByUid.set(normalizedUid, legacy);
    return legacy;
}

