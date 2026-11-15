let bloomscapesFieldQueueState = {owner:'',rows:[],views:[],roster:[],pending:null};
const BLOOMSCAPES_JOB_BOARD = [
    ['pending','REQUEST'],['suspend-tag','SUSPEND'],['work-shearing','SHEAR LIST'],
    ['work-bunch-notes','BUNCH NOTES'],['work-can-filling','CAN FILLING'],
    ['work-hauling','HAULING & CONSOLIDATION'],['work-y-grading','.Y GRADING']
];

function bloomscapesJobBoardCategories() {
    const allowed = getAuthorizedRequestCategories();
    return BLOOMSCAPES_JOB_BOARD.filter(([tab])=>allowed.includes(tab));
}


function bloomscapesWorkTab(kind) {
    return 'work-'+String(kind).toLowerCase().replaceAll('_','-');
}

function bloomscapesWorkKind(tab) {
    return Object.keys(BLOOMSCAPES_WORK_VIEWS).find(kind=>bloomscapesWorkTab(kind)===tab) || '';
}

function bloomscapesWorkQueueCategories() {
    const owner = getSupabaseReadIdentityScope();
    if (bloomscapesFieldQueueState.owner===owner && bloomscapesFieldQueueState.loaded) return bloomscapesFieldQueueState.views.map(bloomscapesWorkTab);
    return isFullAppAdministrator() ? Object.keys(BLOOMSCAPES_WORK_VIEWS).map(bloomscapesWorkTab) : [];
}

function bloomscapesWorkQueueLabel(tab) {
    return BLOOMSCAPES_WORK_VIEWS[bloomscapesWorkKind(tab)] || '';
}

function bloomscapesWorkQueueCount(tab) {
    const kind = bloomscapesWorkKind(tab);
    return bloomscapesFieldQueueState.owner===getSupabaseReadIdentityScope()
        ? bloomscapesFieldQueueState.counts?.[kind] ?? bloomscapesFieldQueueState.rows.filter(row=>row.work_view===kind && row.status==='OPEN').length : 0;
}

function applyBloomscapesFieldQueueSnapshot(data) {
    if (data.ownerScope!==getSupabaseReadIdentityScope() || data.farm_code!==getBloomscapesFarm()) return false;
    Object.assign(bloomscapesFieldQueueState,{owner:data.ownerScope,rows:data.rows,views:data.views,roster:data.roster || [],
        canCreate:data.can_create || {},counts:data.counts,revision:data.revision,recovery:data.recovery || [],loaded:true});
    renderRequestCategoryToolbar();
    return true;
}

async function ensureBloomscapesFieldQueue(force=false) {
    const owner = getSupabaseReadIdentityScope();
    if (bloomscapesFieldQueueState.owner!==owner) bloomscapesFieldQueueState = {owner,rows:[],views:[],roster:[],pending:null};
    const state = bloomscapesFieldQueueState;
    if (state.pending) return state.pending;
    if (state.loaded && !force) return state;
    state.pending = readBloomscapesFieldWork().then(data=>{
        if (state!==bloomscapesFieldQueueState || owner!==getSupabaseReadIdentityScope()) return state;
        applyBloomscapesFieldQueueSnapshot(data);
        return state;
    });
    try { return await state.pending; }
    finally { state.pending = null; }
}

async function openBloomscapesWorkQueue(kind) {
    await ensureBloomscapesFieldQueue(true);
    const tab = bloomscapesWorkTab(kind);
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
    if (crumb) crumb.textContent = `${getBloomscapesFarm()} · ${BLOOMSCAPES_WORK_VIEWS[kind]}`;
    const status = host.appendChild(document.createElement('p'));
    status.setAttribute('role','status');
    try {
        const state = await ensureBloomscapesFieldQueue();
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope() || tab!==activeReqTab) return;
        const rows = state.rows.filter(row=>row.work_view===kind);
        const matches = rows.filter(matchesBloomscapesJobBoardFilters);
        status.textContent = `${matches.length} work cards · ${getBloomscapesFarm()}${notice ? ' · '+notice : ''}`;
        const list = host.appendChild(document.createElement('div'));
        renderBloomscapesWorkGroups(list,matches,status,kind);
    } catch (error) { if (host.isConnected) status.textContent = error.message; }
}

function renderBloomscapesFieldWorkCard(job,status) {
    const card = document.createElement('article');
    card.dataset.workId = job.id;
    card.className = 'bloomscapes-field-work-card';
    const source=findItemByUniqueId(job.source_id) || job.source_snapshot;
    if (source && bloomscapesFarmRowIsVisible(source)) {
        const identity=card.appendChild(document.createElement('div'));
        identity.innerHTML=bloomscapesWorkIdentityMarkup(source,{assignedTo:job.assigned_to});
    }
    const heading = card.appendChild(document.createElement('h3'));
    heading.textContent = `${job.work_view==='SHEARING' ? (job.status==='OPEN' ? '#? Needs Shear · ' : '#✓ Sheared · ') : ''}${job.action_type} · ${job.itemcode} · ${job.farm_code}`;
    appendBloomscapesJobFacts(card,job);
    const detail = card.appendChild(document.createElement('p'));
    detail.textContent = [job.scope,`${job.source_rows.length} rows`,`Qty ${job.quantity}`,job.assigned_to,
        job.due_on || 'No due date',job.instructions].join(' · ');
    const form = card.appendChild(document.createElement('form'));
    form.innerHTML = '<label>Actual Qty <input name="actualQuantity" type="number" min="1" step="1" required></label>'
        + '<label>Completion Notes <input name="notes" maxlength="1000"></label>'
        + '<label><input name="acknowledge" type="checkbox"> Confirm crew and outbound warnings reviewed</label>'
        + '<button type="submit">MARK DONE · Complete Work</button>';
    form.elements.actualQuantity.value = job.quantity;
    form.querySelector('label').firstChild.textContent = job.work_view==='HAULING' ? 'Qty Hauled ' : job.work_view==='Y_GRADING' ? 'GRADED # ' : 'Actual Qty ';
    if (job.work_view==='Y_GRADING') form.insertAdjacentHTML('afterbegin','<label>CF# <input name="canFillQuantity" type="number" min="0" step="1" value="0"></label>');
    configureBloomscapesCompletionForm(form,job);
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void completeBloomscapesFieldWorkCard(job,form,status);
    });
    return card;
}

async function completeBloomscapesFieldWorkCard(job,form,status) {
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    const owner = getSupabaseReadIdentityScope();
    const answers = job.completion_answers || {actualQuantity:form.elements.actualQuantity.value,
        notes:form.elements.notes.value,acknowledge:form.elements.acknowledge.checked,
        ...(form.elements.canFillQuantity ? {canFillQuantity:form.elements.canFillQuantity.value} : {})};
    try {
        const receipt = await completeBloomscapesFieldWork(job,answers);
        if (owner!==getSupabaseReadIdentityScope()) return;
        status.textContent = 'Work saved · PDF '+receipt.pdf.archiveStatus;
        await ensureBloomscapesFieldQueue(true);
        await renderBloomscapesFieldQueue(document.getElementById('request-content'),document.getElementById('request-crumb'));
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
        const saved = bloomscapesFieldQueueState.rows.find(row=>row.id===job.id && row.status==='DONE');
        if (saved && owner===getSupabaseReadIdentityScope()) await renderBloomscapesFieldQueue(
            document.getElementById('request-content'),document.getElementById('request-crumb'),error.message);
    }
    finally { button.disabled = false; }
}

function applyBloomscapesFieldWorkReceipt(job,answers,receipt) {
    if (job.farm_code!==getBloomscapesFarm() || bloomscapesFieldQueueState.owner!==getSupabaseReadIdentityScope()
        || receipt?.ok!==true || receipt.work_id!==job.id || receipt.farm_code!==job.farm_code
        || receipt.work_view!==job.work_view) return false;
    const canonical = bloomscapesFieldQueueState.rows.find(row=>row.id===job.id && row.farm_code===job.farm_code);
    if (!canonical) return false;
    const wasOpen = canonical.status==='OPEN';
    Object.assign(canonical,{status:'DONE',completion_answers:structuredClone(answers),completion_receipt:receipt});
    if (wasOpen && bloomscapesFieldQueueState.counts) bloomscapesFieldQueueState.counts[job.work_view] = Math.max(0,(bloomscapesFieldQueueState.counts[job.work_view] || 0)-1);
    renderRequestCategoryToolbar();
    return true;
}

function configureBloomscapesCompletionForm(form,job) {
    const done = job.status==='DONE';
    for (const input of form.querySelectorAll('input')) {
        if (done && Object.hasOwn(job.completion_answers || {},input.name)) {
            if (input.type==='checkbox') input.checked = job.completion_answers[input.name]===true;
            else input.value = job.completion_answers[input.name];
        }
        input.disabled = done;
    }
    const editable = bloomscapesFieldQueueState.canCreate?.[job.work_view]===true || isFullAppAdministrator();
    form.querySelector('button').textContent = done ? 'Work complete · Retry PDF archive' : 'MARK DONE · Complete Work';
    form.querySelector('button').hidden = !editable;
    if (!editable) form.querySelectorAll('input').forEach(input=>{input.disabled=true;});
}

function renderBloomscapesWorkGroups(list,rows,status,kind) {
    if (kind!=='CAN_FILLING') return list.replaceChildren(...rows.map(row=>renderBloomscapesFieldWorkCard(row,status)));
    const groups = new Map();
    for (const row of rows) {
        const key = [row.command?.media || 'Media not specified',row.command?.fertilizer || 'Fertilizer not specified',row.target_location || 'No target block'].join(' · ');
        if (!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(row);
    }
    for (const [recipe,jobs] of groups) {
        const section = list.appendChild(document.createElement('section'));
        section.appendChild(document.createElement('h3')).textContent = recipe+' · '+jobs.reduce((sum,job)=>sum+Number(job.quantity),0)+' cans required';
        section.append(...jobs.map(job=>renderBloomscapesFieldWorkCard(job,status)));
    }
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
    if (options.strictQueueVisibility === true) nextItems = nextItems.filter(row => isQueueOwnerVisible(row));
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

const bloomscapesJobBoardRefresh = {timer:null,pending:false,failures:0,bound:false};

function canRefreshBloomscapesJobBoard() {
    return Boolean(currentUser && nativeAuthSessionActive && !document.hidden && navigator.onLine!==false
        && document.getElementById('view-request')?.classList.contains('hidden')===false);
}

function stopBloomscapesJobBoardRefresh() {
    clearTimeout(bloomscapesJobBoardRefresh.timer);
    bloomscapesJobBoardRefresh.timer = null;
}

function startBloomscapesJobBoardRefresh() {
    const state = bloomscapesJobBoardRefresh;
    if (!state.bound) {
        state.bound = true;
        document.addEventListener('visibilitychange',()=>{
            if (document.hidden) stopBloomscapesJobBoardRefresh();
            else startBloomscapesJobBoardRefresh();
        });
        window.addEventListener('pagehide',stopBloomscapesJobBoardRefresh);
        window.addEventListener('online',startBloomscapesJobBoardRefresh);
        window.addEventListener('offline',stopBloomscapesJobBoardRefresh);
    }
    if (state.timer || state.pending || !canRefreshBloomscapesJobBoard()) return;
    const delay = Math.min(300000,45000*2**Math.min(state.failures,3));
    state.timer = setTimeout(refreshBloomscapesJobBoardRevision,delay);
}

async function refreshBloomscapesJobBoardRevision() {
    const state = bloomscapesJobBoardRefresh;
    state.timer = null;
    if (state.pending || !canRefreshBloomscapesJobBoard()) return;
    state.pending = true;
    const owner = getSupabaseReadIdentityScope();
    try {
        const next = await readBloomscapesJobBoardRevision();
        if (owner!==getSupabaseReadIdentityScope() || !canRefreshBloomscapesJobBoard()) return;
        if (next.revision!==bloomscapesFieldQueueState.revision) {
            await ensureBloomscapesFieldQueue(true);
            if (owner===getSupabaseReadIdentityScope()) scheduleTrackedSearchViewRender('request','job-board-revision','',{force:true,debounceDelay:1});
        }
        state.failures = 0;
    } catch (error) {
        state.failures = Math.min(3,state.failures+1);
        globalThis.reportHandledRuntimeIssue?.('job_board_revision',error.code || 'JOB_BOARD_REFRESH_FAILED');
    } finally {
        state.pending = false;
        startBloomscapesJobBoardRefresh();
    }
}
