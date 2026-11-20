function bloomscapesDockProgressKey(uniqueId,farm=getBloomscapesFarm()) {
    const uid = normalizeDockItemUniqueId(uniqueId);
    return uid ? farm+':'+uid : '';
}

let dockSuspendAuditCache;

function readDockSuspendAuditTotals() {
    const tags=Array.isArray(suspendTagInventory) ? suspendTagInventory : [];
    const revision=JSON.stringify([getDockSuspendDcSourceRowLookupRevision(socInventory),getDatasetLoadSignature('suspendTag'),
        resolvedViewStateEpoch,dockWorkflowStateEpoch,tags.length,socInventory.length]);
    const prior=dockSuspendAuditCache;
    if (prior?.revision===revision && prior.tags===tags && prior.orders===socInventory) return prior.totals;
    const ids=new Set(),keys=new Set();
    let duplicates=0,resurrected=0,mismatches=0;
    const orders=new Map(socInventory.map(row=>[getDockSuspendDcRequestSourceUid(row),row]));
    for(const row of tags) {
        const uid=getDockSuspendDcRequestSourceUid(row),key=getDockOrderBusinessKey(row);
        if(ids.has(uid) || key && keys.has(key)) duplicates++;
        ids.add(uid);if(key)keys.add(key);
        if(isPhysicalSuspendTagClosed(row)) resurrected++;
        const order=orders.get(uid);
        if(order && String(order.LOCATIONCODE || order.locationcode || '').trim()!==String(row.LOCATIONCODE || row.locationcode || '').trim()) mismatches++;
    }
    const totals={duplicates,resurrected,mismatches};
    dockSuspendAuditCache={revision,tags,orders:socInventory,totals};
    return totals;
}

function countExpectedDockGroups() {
    const snapshot=dockIssueDataLoaded ? getDockResolvedState() : null;
    const scoped=snapshot ? getScopedDocksItems(snapshot.rows,'dock-display:'+snapshot.cacheKey) : getScopedDocksItems(socInventory);
    const source=applyDockStructuredFilters(scoped);
    if (dockViewLevel===0) return new Set(source.map(row=>normalizeDockViewDockKey(row.DOCK_NUM))).size;
    const selected=normalizeDockViewDockKey(selectedDockNum);
    return new Set(source.filter(row=>normalizeDockViewDockKey(row.DOCK_NUM)===selected).map(row=>normalizeDockViewStopKey(row.STOPNUMBER))).size;
}

function getDocksSuspendSyncAudit() {
    const container=document.getElementById('docks-content');
    const mounted=isViewVisible('docks') && container && !String(document.getElementById('docks-search')?.value || '').trim()
        && dockViewMode!=='mistakes' && dockViewMode!=='dropoff';
    const pending=!!(mounted && (ensureViewRenderState('docks').dirty || container.dataset?.activeChunkRenderKey
        || container.querySelector('[aria-busy="true"],[data-loading="true"]')));
    const selector=dockViewLevel===0?'data-docks-dock-card':dockViewLevel===1?'data-docks-drop-card':'data-docks-stop-card';
    const nodes=mounted ? [...container.querySelectorAll('['+selector+']')] : [];
    const shown=nodes.map(node=>node.getAttribute(selector));
    const expected=mounted && !pending && dockViewLevel<2 ? countExpectedDockGroups() : null;
    return {...readDockSuspendAuditTotals(),duplicateCards:shown.length-new Set(shown).size,
        hierarchyMismatch:expected!==null && shown.length!==expected,pending};
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


function invalidateDockWorkflowResolvedState() {
    dockWorkflowStateEpoch += 1;
    docksScopedItemsCacheKey = '';
    docksScopedItemsCache = null;
    dockResolvedStateCacheKey = '';
    dockResolvedStateCache = null;
    dockDisplayInventory = [];
    dockDisplayInventoryById = new Map();
    dockDisplayInventoryBySourceUid = new Map();
    dockFilterStateCacheKey = '';
    dockFilterStateCache = null;
    dockIssueSourceRowsCacheKey = '';
    dockIssueSourceRowsById = new Map();
    dockIssueSourceRowsByCurrentUid = new Map();
    dockIssueSourceRowsByMatchKey = new Map();
}

function getLatestSocImportFileWatermark(rows = socRawSourceRows, sourceFreshness = null) {
    if (sourceFreshness && sourceFreshness.loaded === true) {
        const filename = String(firstNonEmptyValue(sourceFreshness.filename, sourceFreshness.FILENAME, '') || '').trim();
        const timestamp = getValidIsoTimestamp(firstNonEmptyValue(sourceFreshness.lastUpdated, sourceFreshness.last_updated, sourceFreshness.LAST_UPDATED, ''));
        const timestampMs = timestamp ? Date.parse(timestamp) : -1;
        return timestampMs >= 0 && filename ? { filename, lastUpdated: timestamp, timestampMs } : { filename: '', lastUpdated: '', timestampMs: -1 };
    }
    let latest = { filename: '', lastUpdated: '', timestampMs: -1, filenameToken: '' };
    let previousFile, previousTime;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const filename = String(firstNonEmptyValue(row && row.FILENAME, row && row.filename, row && row.FILE_NAME, row && row.file_name, '') || '').trim();
        if (!filename) return;
        const time = firstNonEmptyValue(row && row.LAST_UPDATED, row && row.last_updated, '');
        if (filename === previousFile && time === previousTime) return;
        previousFile = filename;
        previousTime = time;
        const timestamp = getValidIsoTimestamp(time);
        const timestampMs = timestamp ? Date.parse(timestamp) : -1;
        if (timestampMs < 0) return;
        const filenameToken = dashboardFilenameTimestamp(filename, timestamp);
        if (filenameToken > latest.filenameToken || (filenameToken === latest.filenameToken && timestampMs > latest.timestampMs)) {
            latest = { filename, lastUpdated: timestamp, timestampMs, filenameToken };
        }
    });
    return { filename: latest.filename, lastUpdated: latest.lastUpdated, timestampMs: latest.timestampMs };
}

let suspendSocWatermarkReceipt;

function publishedSuspendSocWatermark(rows, freshness) {
    if (freshness?.loaded) return getLatestSocImportFileWatermark(rows, freshness);
    const revision = getDatasetLoadSignature('soc');
    const owner = getSupabaseReadIdentityScope();
    const cached = suspendSocWatermarkReceipt;
    if (cached?.rows === rows && cached.owner === owner && cached.revision === revision
        && cached.count === rows.length && cached.epoch === resolvedViewStateEpoch) return cached.value;
    const value = getLatestSocImportFileWatermark(rows);
    suspendSocWatermarkReceipt = {rows, revision, owner, count:rows.length, epoch:resolvedViewStateEpoch, value};
    return value;
}
