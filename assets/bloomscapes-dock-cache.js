function getDockOrderBusinessKey(row = {}) {
    const value = (...keys) => firstDockNonEmpty(...keys.map(key=>row[key]));
    const origin = value('SUSPEND_ORIGIN_UID','suspend_origin_uid','ORIG_LINE_KEY','orig_line_key');
    const uid = value('UNIQUE_ID','unique_id');
    if (origin && uid) return JSON.stringify(['soc',origin,uid]);
    const code = String(value('ITEMCODE','itemcode')).trim().toUpperCase().replace(/[.]+$/, '');
    const dock = normalizeDockViewDockKey(value('DOCK','dock','DOCK_NUM','dock_num'));
    const drop = normalizeDockViewStopKey(value('STOPNUMBER','stopnumber','STOP','stop','DROP_NUMBER','drop_number','DROP','drop'));
    const location = String(value('LOCATIONCODE','locationcode','LOCATION','location')).trim().toUpperCase();
    if (!code || dock === 'Unassigned' || drop === 'Unassigned') return '';
    const quantity = Number(String(value('QUANTITYORDERED','quantityordered','QTY','qty','ORDERED_QTY','ordered_qty') || 0).replace(/,/g,''));
    const group = ['CUSTOMERNAME','CONSIGNEENAME','SALESREPNAME','LOTCODE'].map(key=>
        String(value(key,key.toLowerCase(),key.replace(/NAME$/,''),key.toLowerCase().replace(/name$/,''))).trim().toUpperCase());
    return JSON.stringify([dock,drop,code,location,...group,Number.isFinite(quantity)?quantity:0]);
}

/** Select active Docks orders while the full SOC dataset loads.
 * @param {Array} items Available order rows.
 * @returns {Array} Rows used to render the Docks board.
 */
function dockScopedOrderSource(items) {
    if (typeof getCurrentVisibleViewId !== 'function' || getCurrentVisibleViewId() !== 'docks'
        || typeof isDatasetLoaded !== 'function' || isDatasetLoaded('soc','full')) return items;
    const hasAssigned = items.some(row=>normalizeDockViewDockKey(firstNonEmptyValue(
        row.DOCK,row.dock,row.DOCK_NUM,row.dock_num,'')) !== 'Unassigned' && bloomscapesFarmRowIsVisible(row));
    if (hasAssigned) return items;
    const board = currentBloomscapesDockBoard();
    return board?.tags.length ? dockBrowseRowsFromBoard(board) : items;
}

function firstDockValue(row, keys) {
    return firstDockNonEmpty(...keys.map(key => row[key]));
}

/**
 * @param {string} [value] Raw suspend status.
 * @returns {string} Uppercase status with word separators normalized.
 */
function normalizeDockSuspendRequestValue(value = '') {
    return String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
}

/**
 * @param {object} [item] Dock order row.
 * @returns {string} Normalized suspend status from its first populated alias.
 */
function getDockSuspendValue(item = null) {
    return normalizeDockSuspendRequestValue(firstDockValue(item || {}, ['SUSPEND', 'suspend', 'Suspend']));
}

/**
 * @param {object} [item] Source order row.
 * @returns {boolean} Whether the row is suspended on an assigned dock and remains open.
 */
function isDockSuspendDcRequestSource(item = null) {
    if (!item || !['SUSPEND', 'SUSPENDED'].includes(getDockSuspendValue(item))) return false;
    const dock = firstDockValue(item, ['DOCK_NUM', 'dock_num', 'DOCK', 'dock']);
    const closed = item.suspend_completed === true || item.SUSPEND_COMPLETED === true || item.completed === true;
    const candidate = String(item.suspend_candidate_state || item.SUSPEND_CANDIDATE_STATE || '').toLowerCase();
    const status = String(item.status || item.STATUS || '').toLowerCase();
    return normalizeDockViewDockKey(dock) !== 'Unassigned' && !closed
        && !['approved', 'rejected', 'replaced', 'denied', 'canceled', 'cancelled'].includes(candidate)
        && !['complete', 'completed', 'deleted'].includes(status);
}

/**
 * @param {object} [item] Order or mirrored request.
 * @returns {boolean} Whether its origin, tag, or request identity ties it to a dock suspension.
 */
function isDockSuspendDcRequestMirrorRow(item = null) {
    if (!item) return false;
    const text = (...keys) => String(firstDockValue(item, keys) || '').trim().toLowerCase();
    const isSuspendTag = item.IS_SUSPEND_TAG === true || item.is_suspend_tag === true
        || ['true', '1', 'yes'].includes(text('IS_SUSPEND_TAG', 'is_suspend_tag'));
    const uniqueId = String(firstDockValue(item, ['UNIQUE_ID', 'unique_id']) || '').trim();
    return isSuspendTag || text('REQUEST_TYPE', 'request_type') === 'suspend_tag' || isDockSuspendDcRequestSource(item)
        || item.DOCK_SUSPEND_DC_REQUEST === true
        || String(item.DOCK_SUSPEND_DC_REQUEST || '').trim().toLowerCase() === 'true'
        || /^dock_suspend_dc_/i.test(uniqueId) || !!(item.DOCK_SUSPEND_SOURCE_UID || item.dock_suspend_source_uid)
        || (text('SOURCE_TABLE', 'source_table') === 'ph_soc_master' && text('REQUEST_SOURCE', 'request_source') === 'docks');
}

// Pending commands are scoped to the authenticated session. Only RPC receipts enter SOC history.
const pendingDockFulfillments = new Map();

function dockFulfillmentOrigin(row) {
    return String(row.suspend_origin_uid || row.SUSPEND_ORIGIN_UID || getDockSuspendDcRequestSourceUid(row));
}

function dockFulfillmentPreviewRow(source, allocation, uid, origin) {
    const qty = allocation.qty;
    const original = source.orig_itemcode || source.ORIG_ITEMCODE || source.ITEMCODE || source.itemcode;
    const fields = {
        unique_id:uid, suspend_origin_uid:origin, orig_line_key:origin, orig_itemcode:original,
        subbed_from_itemcode:original === allocation.itemcode ? '' : original,
        suspend_candidate_state:'fulfilled', suspend:null, suspend_to:null, suspend_completed:true,
        itemcode:allocation.itemcode, locationcode:allocation.locationcode, lotcode:allocation.lotcode,
        description:allocation.description, commonname:allocation.description,
        qty, quantityordered:qty, order_qty:qty, ordered_qty:qty, dom_id:uid
    };
    const aliases = Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.toUpperCase(),value]));
    return {...source,...fields,...aliases};
}

function projectPendingDockFulfillments(rows, owner) {
    if (!pendingDockFulfillments.size) return rows;
    const scoped = [...pendingDockFulfillments.values()].filter(entry=>entry.owner === owner);
    if (!scoped.length) return rows;
    const origins = new Set(scoped.map(entry=>entry.origin));
    return rows.filter(row=>!origins.has(dockFulfillmentOrigin(row))).concat(scoped.flatMap(entry=>entry.rows));
}

function invalidateDockFulfillmentPreview() {
    docksScopedItemsCacheKey = '';
    markViewDirty('docks');
    if (isViewVisible('docks')) scheduleDocksRender(0);
    renderPendingSuspendPullAllocations();
}

function beginSuspendFulfillmentDocksProjection(source, allocations, requestId) {
    const owner = getSupabaseReadIdentityScope();
    const origin = dockFulfillmentOrigin(source);
    const rows = allocations.map((allocation,index)=>dockFulfillmentPreviewRow(source,allocation,
        index ? 'sfill:'+requestId+':'+(index+1) : origin,origin));
    const pending = {owner,origin,rows};
    pendingDockFulfillments.set(requestId,pending);
    invalidateDockFulfillmentPreview();
    function release() {
        if (pendingDockFulfillments.get(requestId) !== pending) return false;
        pendingDockFulfillments.delete(requestId);
        if (owner !== getSupabaseReadIdentityScope()) return false;
        invalidateDockFulfillmentPreview();
        return true;
    }
    return {
        confirm(receipt) {
            if (!receipt?.ok || receipt.command_id !== requestId || receipt.origin_uid !== origin) return false;
            if (!release()) return false;
            const changed = new Map((receipt.rows || []).map(row=>[row.unique_id,row]));
            for (const row of receipt.dock_rows) changed.set(row.unique_id,row);
            applySuspendCandidateRows([...changed.values()],{close:true});
            publishPhPullDockStatus('10-PH',owner);
            refreshMountedSuspendPullQueue(owner);
            return true;
        },
        rollback:release
    };
}

/** Build the per-farm key for one physical dock item.
 * @param {string} uniqueId
 * @param {string} farm
 * @returns {string}
 */
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
/** Return the maximum number of groups to show for a dock browse level. @param {string} key @returns {number|undefined} */
function dockBrowsePageLimit(key) {
    return {'docks-main':4,'docks-stops':16,'docks-stop-items':8}[key];
}
/** Identify the selected dock page by its level, farm, label and search.
 * @param {string} key
 * @param {string} label
 * @param {string} search
 * @returns {string}
 */
function dockBrowsePageKey(key,label,search) {
    return [key,label,getBloomscapesFarm(),search].join('|');
}
/** Resolve the dock rows visible in the current farm's display snapshot. @returns {Array} */
function getBloomscapesDockBrowseSource() {
    const snapshot = dockIssueDataLoaded ? getDockResolvedState() : {
        rows:Array.isArray(socInventory) ? socInventory : [],
        cacheKey:`dock-fast:${getDatasetLoadSignature('soc')}:${dockWorkflowStateEpoch}`
    };
    const rows = projectPendingDockFulfillments(snapshot.rows,getSupabaseReadIdentityScope());
    return getScopedDocksItems(rows,`dock-display:${snapshot.cacheKey}`);
}

function expectedDockPageGroups() {
    const rows=applyDockStructuredFilters(getBloomscapesDockBrowseSource(),true);
    const root=dockViewLevel===0;
    const selected=normalizeDockViewDockKey(selectedDockNum);
    const groups=root ? rows.map(row=>normalizeDockViewDockKey(row.DOCK_NUM))
        : rows.filter(row=>normalizeDockViewDockKey(row.DOCK_NUM)===selected).map(row=>normalizeDockViewStopKey(row.STOPNUMBER));
    const ids=new Set(groups);
    const key=root ? 'docks-main' : 'docks-stops';
    const limit=dockBrowsePageLimit(key);
    if (ids.size<=limit) return ids;
    const label=root ? 'Select a Dock' : formatDockViewDockLabel(selectedDockNum);
    const sorted=[...ids].sort((a,b)=>root ? sortBloomscapesDockLabels(a,b) : sortBloomscapesDockLabels(b,a));
    return new Set(getClientBrowsePage('docks',dockBrowsePageKey(key,label,''),sorted,limit).rows);
}
/** Compare the visible Suspend cards with their source and hierarchy totals. @returns {object} */
function getDocksSuspendSyncAudit() {
    const container=document.getElementById('docks-content');
    const mounted=isViewVisible('docks') && container && !String(document.getElementById('docks-search')?.value || '').trim()
        && !Object.hasOwn(container.dataset || {},'dockPipelineActive')
        && dockViewMode!=='mistakes' && dockViewMode!=='dropoff';
    const pending=!!(mounted && (ensureViewRenderState('docks').dirty || container.dataset?.activeChunkRenderKey
        || container.querySelector('[aria-busy="true"],[data-loading="true"]')));
    const selector=dockViewLevel===0?'data-docks-dock-card':dockViewLevel===1?'data-docks-drop-card':'data-docks-stop-card';
    const nodes=mounted ? [...container.querySelectorAll('['+selector+']')] : [];
    const shown=nodes.map(node=>node.getAttribute(selector));
    const uniqueShown=new Set(shown);
    const expected=mounted && !pending && dockViewLevel<2 ? expectedDockPageGroups() : null;
    return {...readDockSuspendAuditTotals(),duplicateCards:shown.length-uniqueShown.size,
        hierarchyMismatch:expected!==null && (uniqueShown.size!==expected.size || shown.some(id=>!expected.has(id))),pending};
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
/** Normalize and cache one physical item's dock progress.
 * @param {string} uniqueId
 * @param {object|null} progress
 * @returns {object}
 */
function cacheDockItemProgress(uniqueId = '', progress = null) {
    const normalizedUid = bloomscapesDockProgressKey(uniqueId);
    if (!normalizedUid) return getDefaultDockItemProgress();
    const normalized = normalizeDockItemProgress(progress);
    dockItemProgressByUid.set(normalizedUid, normalized);
    localStorage.setItem('gnc_dock_item_' + normalizedUid, JSON.stringify(normalized));
    invalidateDockWorkflowResolvedState();
    return normalized;
}
/** Read the normalized progress for one physical dock item. @param {string} uniqueId @returns {object} */
function getDockItemProgress(uniqueId = '') {
    const normalizedUid = bloomscapesDockProgressKey(uniqueId);
    if (!normalizedUid) return getDefaultDockItemProgress();
    if (dockItemProgressByUid.has(normalizedUid)) return normalizeDockItemProgress(dockItemProgressByUid.get(normalizedUid));
    const legacy = readLegacyDockItemProgress(uniqueId);
    dockItemProgressByUid.set(normalizedUid, legacy);
    return legacy;
}

/** Invalidate resolved dock projections after a workflow change. @returns {void} */
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
/** Return the SOC import watermark for the published Suspend rows.
 * @param {Array} rows
 * @param {object|null} freshness
 * @returns {object}
 */
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
