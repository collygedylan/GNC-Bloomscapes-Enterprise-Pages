let bloomscapesFieldQueueState = {owner:'',rows:[],views:[],roster:[],pending:null};
const BLOOMSCAPES_FIELD_WORK_TAB = 'work-field-work';
const BLOOMSCAPES_JOB_BOARD = [
    ['pending','REQUEST'],['suspend-tag','SUSPEND'],[BLOOMSCAPES_FIELD_WORK_TAB,'Field Work']
];

function bloomscapesJobBoardCategories() {
    const allowed = getAuthorizedRequestCategories();
    return BLOOMSCAPES_JOB_BOARD.filter(([tab])=>allowed.includes(tab));
}


function bloomscapesWorkTab(kind) {
    return 'work-'+String(kind).toLowerCase().replaceAll('_','-');
}

function bloomscapesWorkKind(tab) {
    if (tab===BLOOMSCAPES_FIELD_WORK_TAB) return 'FIELD_WORK';
    return Object.keys(BLOOMSCAPES_WORK_VIEWS).find(kind=>bloomscapesWorkTab(kind)===tab) || '';
}

function bloomscapesWorkQueueCategories() {
    const owner = getSupabaseReadIdentityScope();
    if (bloomscapesFieldQueueState.owner===owner && bloomscapesFieldQueueState.loaded) return bloomscapesFieldQueueState.views.length ? [BLOOMSCAPES_FIELD_WORK_TAB] : [];
    return isFullAppAdministrator() ? [BLOOMSCAPES_FIELD_WORK_TAB] : [];
}

function bloomscapesWorkQueueLabel(tab) {
    return tab===BLOOMSCAPES_FIELD_WORK_TAB ? 'Field Work' : BLOOMSCAPES_WORK_VIEWS[bloomscapesWorkKind(tab)] || '';
}

function bloomscapesWorkQueueCount(tab) {
    const kind = bloomscapesWorkKind(tab);
    if (bloomscapesFieldQueueState.owner!==getSupabaseReadIdentityScope()) return 0;
    if (tab===BLOOMSCAPES_FIELD_WORK_TAB) return Object.values(bloomscapesFieldQueueState.counts || {}).reduce((sum,count)=>sum+Number(count),0);
    return bloomscapesFieldQueueState.counts?.[kind] ?? bloomscapesFieldQueueState.rows.filter(row=>row.work_view===kind && row.status==='OPEN').length;
}

function applyBloomscapesFieldQueueSnapshot(data) {
    if (data.ownerScope!==getSupabaseReadIdentityScope() || data.farm_code!==getBloomscapesFarm()) return false;
    const state=bloomscapesFieldQueueState;
    const metadata=JSON.stringify([data.views,data.roster,data.can_create,data.recovery,data.block_lifecycle]);
    const unchanged=state.loaded && state.owner===data.ownerScope && state.farm===data.farm_code
        && data.revision && state.revision===data.revision && state.metadata===metadata;
    state.loadedAt=Date.now();
    if (unchanged) return true;
    Object.assign(state,{owner:data.ownerScope,farm:data.farm_code,rows:data.rows,views:data.views,roster:data.roster || [],
        canCreate:data.can_create || {},counts:data.counts,revision:data.revision,recovery:data.recovery || [],lifecycle:data.block_lifecycle || [],
        metadata,loaded:true});
    renderRequestCategoryToolbar();
    return true;
}

async function ensureBloomscapesFieldQueue(force=false) {
    const owner = getSupabaseReadIdentityScope();
    const farm=getBloomscapesFarm();
    if (bloomscapesFieldQueueState.owner!==owner || bloomscapesFieldQueueState.farm!==farm) {
        bloomscapesFieldQueueState = {owner,farm,rows:[],views:[],roster:[],pending:null};
    }
    const state = bloomscapesFieldQueueState;
    if (state.pending) return state.pending;
    if (state.loaded && !force && Date.now()-state.loadedAt<45000) return state;
    state.pending = readBloomscapesFieldWork().then(data=>{
        if (state!==bloomscapesFieldQueueState || owner!==getSupabaseReadIdentityScope()) return state;
        applyBloomscapesFieldQueueSnapshot(data);
        return state;
    });
    try { return await state.pending; }
    finally { state.pending = null; }
}

async function openBloomscapesWorkQueue() {
    const tab = BLOOMSCAPES_FIELD_WORK_TAB;
    if (!bloomscapesWorkQueueCategories().includes(tab)) await ensureBloomscapesFieldQueue();
    if (!bloomscapesWorkQueueCategories().includes(tab)) throw new Error('Work View access is unavailable.');
    switchView('request');
    setReqTab(tab);
}

async function renderBloomscapesFieldQueue(container,crumb,notice='') {
    const owner = getSupabaseReadIdentityScope();
    const tab = activeReqTab;
    const kind = bloomscapesWorkKind(tab);
    if (!kind || !container) return;
    const host = document.createElement('section');
    host.dataset.fieldWorkQueue = kind;
    container.replaceChildren(host);
    if (crumb) crumb.textContent = `${getBloomscapesFarm()} · ${bloomscapesWorkQueueLabel(tab)}`;
    const list=host.appendChild(document.createElement('div'));
    const status=list.appendChild(document.createElement('p'));
    status.setAttribute('role','status');
    if (isBloomscapesFieldQueueReviewer()) mountBloomscapesFieldAudit(host,list,status,kind,owner);
    const cached=bloomscapesFieldQueueState;
    const projected=cached.loaded && cached.owner===owner && cached.farm===getBloomscapesFarm() ? cached.rows : null;
    if (projected) paintBloomscapesFieldQueue(list,status,projected,kind,notice);
    try {
        const state = await ensureBloomscapesFieldQueue();
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope() || tab!==activeReqTab) return;
        if (!host.querySelector('[data-field-audit]:checked') && projected!==state.rows && !host.contains(document.activeElement)) {
            paintBloomscapesFieldQueue(list,status,state.rows,kind,notice);
        }
    } catch (error) { if (host.isConnected) status.textContent = error.message; }
}

function paintBloomscapesFieldQueue(host,status,queue,kind,notice,viewAll=false) {
    const rows = queue.filter(row=>(kind==='FIELD_WORK' || row.work_view===kind) && bloomscapesFieldJobVisible(row,viewAll));
    prepareBloomscapesJobFacets(rows);
    const matches = rows.filter(matchesBloomscapesJobBoardFilters);
    status.textContent = `${matches.length} work cards · ${getBloomscapesFarm()}${notice ? ' · '+notice : ''}`;
    host.replaceChildren(status);
    const list = host.appendChild(document.createElement('div'));
    renderBloomscapesWorkGroups(list,matches,status,kind);
}

function applyBloomscapesFieldWorkReceipt(job,answers,receipt) {
    if (job.farm_code!==getBloomscapesFarm() || bloomscapesFieldQueueState.owner!==getSupabaseReadIdentityScope()
        || receipt?.ok!==true || receipt.work_id!==job.id || receipt.farm_code!==job.farm_code
        || receipt.work_view!==job.work_view) return false;
    const canonical = bloomscapesFieldQueueState.rows.find(row=>row.id===job.id && row.farm_code===job.farm_code);
    if (!canonical) return false;
    const wasOpen = canonical.status==='OPEN';
    Object.assign(canonical,{status:'DONE',completion_answers:structuredClone(answers),completion_receipt:receipt});
    applyBloomscapesBlockLifecycleReceipt(receipt);
    for (const next of bloomscapesFieldQueueState.rows) {
        if (next.farm_code===job.farm_code && next.blocked_by===job.id) next.blocked=false;
    }
    if (wasOpen && bloomscapesFieldQueueState.counts) bloomscapesFieldQueueState.counts[job.work_view] = Math.max(0,(bloomscapesFieldQueueState.counts[job.work_view] || 0)-1);
    renderRequestCategoryToolbar();
    return true;
}

function applyBloomscapesBlockLifecycleReceipt(receipt) {
    const row=receipt.block_lifecycle;
    if (!row || row.farm_code!==receipt.farm_code || row.work_id!==receipt.work_id || !row.blockalpha || !row.blocknumber
        || !['OPEN_FIELD','BUNCHED','BUNCH_COUNTED','POLY_COVERED','POLY_REMOVED','SPREAD','SPREAD_COUNTED'].includes(row.stage)
        || !Number.isFinite(Date.parse(row.updated_at))) return false;
    const rows=bloomscapesFieldQueueState.lifecycle ||= [];
    const index=rows.findIndex(item=>item.farm_code===row.farm_code && item.blockalpha===row.blockalpha && item.blocknumber===row.blocknumber);
    const current=rows[index];
    if (current && (Date.parse(current.updated_at)>Date.parse(row.updated_at)
        || Date.parse(current.updated_at)===Date.parse(row.updated_at) && current.work_id!==row.work_id)) return false;
    if (index<0) rows.push(structuredClone(row));
    else rows[index]=structuredClone(row);
    return true;
}

function getScopedRequestItems(items = requestsInventory, options = {}) {
    const sourceItems = Array.isArray(items) ? items : [];
    const capabilities = getRequestCapabilities();
    const requestScopeMode = capabilities ? capabilities.scope : 'none';
    const hasGlobalRequestAccess = canViewAllRequests();
    const queuePending = activeReqTab === 'pending' && capabilities?.canViewQueue;
    const needsLegacyScope = !options.strictQueueVisibility && !hasGlobalRequestAccess && (!queuePending || sourceItems.some(row => row && !row.REQUEST_ACTIVE && !row.REQUEST_HISTORY));
    const assignedItemcodes = needsLegacyScope ? getRequestAssignedItemcodeScope() : null;
    const canUseCache = items === requestsInventory;
    const includeDockSuspendMirrorRows = canUseCache && activeReqTab === 'suspend-tag' && options.includeDockSuspendMirrorRows !== false && canReadSuspendQueue();
    const useResultCache = canUseCache;
    const cacheKey = canUseCache ? [
        resolvedViewStateEpoch,
        getDatasetLoadSignature('requests'),
        includeDockSuspendMirrorRows ? canUseRequestSuspendTagAssignedToFilter() : '',
        includeDockSuspendMirrorRows ? getDatasetLoadSignature(activeReqTab === 'suspend-tag' ? 'suspendTag' : 'soc') : '',
        activeReqTab + (options.strictQueueVisibility === true ? '|strict-queue|' + getSuspendEvalUserFilter() + '|' + (getManagerAssignedColumnState().dataEpoch || 0) : '|legacy-scope'),
        requestScopeMode,
        hasGlobalRequestAccess ? '1' : '0',
        assignedItemcodes ? getManagerAssignedColumnState().dataEpoch || 0 : '',
        safeRole,
        currentUser,
        currentUserDisplay
    ].join('|') : '';
    if (useResultCache && requestScopedItemsCacheKey === cacheKey && Array.isArray(requestScopedItemsCache)) {
        incrementInternalPerfCounter('viewStateCacheHits');
        return requestScopedItemsCache.slice();
    }
    let nextItems = capabilities && capabilities.canViewQueue ? sourceItems.filter(bloomscapesFarmRowIsVisible) : [];
    if (options.strictQueueVisibility === true) nextItems = nextItems.filter(createQueueOwnerVisibilityPredicate());
    else if (!hasGlobalRequestAccess) {
        nextItems = nextItems.filter(item => (queuePending && item.REQUEST_ACTIVE === true)
            || doesCurrentUserOwnCreatedRequestItem(item)
            || assignedItemcodes?.has(String(item?.ITEMCODE || item?.itemcode || '').trim().toUpperCase()));
    }
    if (includeDockSuspendMirrorRows) {
        nextItems = appendDockSuspendDcRequestMirrorRows(nextItems).filter(row =>
            !isDockSuspendDcRequestMirrorRow(row) || canUseRequestSuspendTagAssignedToFilter() || isQueueOwnerVisible(row));
    }
    if (useResultCache) {
        requestScopedItemsCacheKey = cacheKey;
        requestScopedItemsCache = nextItems.slice();
    }
    return canUseCache && ['global', 'role'].includes(requestScopeMode) ? nextItems.slice() : nextItems;
}

