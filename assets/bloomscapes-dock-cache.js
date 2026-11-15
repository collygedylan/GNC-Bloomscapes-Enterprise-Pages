function bloomscapesDockProgressKey(uniqueId,farm=getBloomscapesFarm()) {
    const uid = normalizeDockItemUniqueId(uniqueId);
    return uid ? farm+':'+uid : '';
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

