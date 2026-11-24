const TREE_STAGE_LABELS=Object.freeze({GRADING:'Grading',HAULING:'Hauling',PLANTING:'Planting'});

function canCreateBloomscapesTreeGrading() {
    if (borrowedHelpPreview() || !['10-PH','60-HL'].includes(getBloomscapesFarm())) return false;
    const profile=bloomscapesAreaProfile() || nativeAuthProfile;
    return Boolean(profile?.username===currentUser && (profile.module_access
        ? profile.module_access.studio==='FULL_EDIT'
        : ['grower','data-entry','data-entry-supervisor','admin','super-admin'].includes(profile.role)));
}

function mountBloomscapesTreeGrading(host,source=null) {
    if (!canCreateBloomscapesTreeGrading()) return;
    const editor=document.createElement('section');
    if (source) {
        host.replaceChildren(editor);
        openTreeGradingForm(editor,source);
        return;
    }
    const browser=document.createElement('section');
    browser.dataset.workBrowser='true';
    host.replaceChildren(browser,editor);
    mountBloomscapesWorkBrowser(browser,row=>openTreeGradingForm(editor,row),{
        locationDrill:true,onPathChange:()=>editor.replaceChildren()
    });
}

function mountDriveTreeGradingAction(container,row) {
    const origin=activeDetailSourceView || lastView;
    const group=String(row?.PLANTGROUPCODE ?? row?.plantgroupcode ?? '').trim().toUpperCase();
    if (origin!=='drive' || group!=='330_TREES' || !canCreateBloomscapesTreeGrading()) return;
    const button=container.appendChild(document.createElement('button'));
    button.type='button';
    button.textContent='Grading';
    button.className='rounded-xl bg-[#113221] text-white px-4 py-3 font-bold';
    button.onclick=()=>{
        if (activeItem!==row || !container.isConnected) return;
        const host=document.createElement('section');
        container.after(host);
        mountBloomscapesTreeGrading(host,row);
        button.disabled=true;
    };
}

function openTreeGradingForm(editor,row) {
    const trees=String(row.PLANTGROUPCODE ?? row.plantgroupcode ?? '').trim().toUpperCase()==='330_TREES';
    if (!trees) { editor.textContent='Choose a tree inventory row.'; return; }
    const sourceId=String(row.UNIQUE_ID ?? row.unique_id ?? '');
    const form=document.createElement('form');
    const heading=document.createElement('h3');
    heading.textContent='Grading · '+String(row.COMMONNAME ?? row.commonname ?? row.ITEMCODE ?? row.itemcode);
    form.innerHTML='<label>Scheduled shift target <input name="target" type="number" min="1" step="1" required></label>'
        +'<label>Assigned crew member <select name="crew" required></select></label>'
        +'<button type="submit">Queue Grading</button><p role="status"></p>';
    editor.replaceChildren(heading,form);
    const id=crypto.randomUUID();
    const select=form.elements.crew;
    select.add(new Option(currentUser,currentUser));
    void populateTreeCrew(form,select);
    form.onsubmit=event=>{
        event.preventDefault();
        void runTreeStageForm(form,async()=>{
            await queueBloomscapesTreeGrading({id,sourceId,assignedTo:select.value,targetQty:Number(form.elements.target.value)});
            form.querySelector('button').disabled=true;
            form.querySelector('p').textContent='Grading queued.';
            return true;
        });
    };
}

async function populateTreeCrew(form,select) {
    try {
        const roster=await readBloomscapesFieldRoster();
        if (!form.isConnected) return;
        for (const user of roster.filter(user=>user.username!==currentUser)) {
            select.add(new Option(user.name,user.username));
        }
    } catch (error) {
        if (form.isConnected) form.querySelector('p').textContent=error.message;
    }
}

async function mountBloomscapesTreeStageQueue(host,notify='') {
    if (borrowedHelpPreview() || !['10-PH','60-HL'].includes(getBloomscapesFarm())) return;
    const owner=getSupabaseReadIdentityScope();
    const status=document.createElement('p');
    status.setAttribute('role','status');
    try {
        const rows=await readBloomscapesTreeStages();
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        const query=String(typeof requestSearchTerm==='undefined' ? '' : requestSearchTerm).trim().toLowerCase();
        const visible=rows.filter(job=>[job.step_type,job.common_name,job.itemcode,job.graded_locationcode,
            job.to_locationcode,job.assigned_crew].some(value=>String(value ?? '').toLowerCase().includes(query)));
        const list=document.createElement('div');
        list.className='space-y-3';
        status.textContent=notify;
        host.replaceChildren(status,list);
        mountChunkedList(list,visible,job=>createTreeStageCard(host,job));
    } catch (error) {
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        status.textContent=error.message;
        host.replaceChildren(status);
    }
}

function createTreeStageCard(host,job) {
    const card=document.createElement('article');
    card.className='rounded-xl border border-emerald-600 p-3';
    const label=TREE_STAGE_LABELS[job.step_type];
    const title=card.appendChild(document.createElement('h3'));
    title.textContent=label+' · '+(job.common_name || job.itemcode);
    const summary=card.appendChild(document.createElement('p'));
    summary.textContent=[job.warehouse,job.itemcode,job.container_size,job.assigned_crew,job.status]
        .filter(Boolean).join(' · ');
    if (job.variance_status) appendTreeStageEvidence(card,job);
    if (job.status==='queued') appendTreeStageCompletion(card,host,job);
    if (job.status==='completed' && job.completed_by===currentUser && !job.outbox_id) {
        const retry=card.appendChild(document.createElement('button'));
        retry.type='button';
        retry.textContent='Send signed '+label+' PDF';
        const status=card.appendChild(document.createElement('p'));
        status.setAttribute('role','status');
        retry.onclick=()=>void sendTreeStagePdfAndRefresh(host,job,status,retry);
    }
    return card;
}

function appendTreeStageEvidence(card,job) {
    const variance=Number(job.target_variance);
    const line=card.appendChild(document.createElement('p'));
    line.textContent=variance===0 ? '🟢 AT TARGET — CORRECT NUMBER'
        : variance<0 ? '🔴 SHORT BY '+Math.abs(variance) : '🟡 OVER BY +'+variance;
    const audit=card.appendChild(document.createElement('p'));
    audit.textContent='Season .Y · '+job.graded_locationcode+' · '+job.season_y_at_loc_qty+' on hand · '
        +(job.season_y_match?'Exact match':'Data Entry review · Delta '+job.season_y_delta);
    if (!job.from_locationcode && !job.data_entry_warehouse) return;
    const move=card.appendChild(document.createElement('p'));
    move.textContent=[job.from_locationcode,job.to_locationcode,job.planted_locationcode].filter(Boolean).join(' → ')
        +(job.data_entry_warehouse ? ' · '+job.data_entry_warehouse+' Data Entry / Argos' : '');
}

function appendTreeStageCompletion(card,host,job) {
    const form=card.appendChild(document.createElement('form'));
    const planting=job.step_type==='PLANTING';
    const location=planting ? 'Planting location' : job.step_type==='HAULING' ? 'To location' : 'Graded location';
    form.innerHTML='<label>Quantity <input type="number" min="1" step="1" name="quantity" required></label>'
        +'<label>'+location+' <input name="location" required></label>'
        +(planting ? '<label>Target item code <input name="targetItem" required></label>'
            +'<label>Target lot code <input name="targetLot" required></label>' : '')
        +'<button type="submit">Mark Done</button><p role="status"></p>';
    form.elements.quantity.value=job.qty ?? '';
    form.elements.location.value=planting ? job.to_locationcode : '';
    form.elements.location.readOnly=planting;
    form.onsubmit=event=>{
        event.preventDefault();
        void runTreeStageForm(form,()=>finishTreeStageForm(form,host,job));
    };
}

async function finishTreeStageForm(form,host,job) {
    const values=new FormData(form);
    const receipt=await completeBloomscapesTreeStage(job,{
        quantity:Number(values.get('quantity')),location:values.get('location'),
        targetItem:values.get('targetItem'),targetLot:values.get('targetLot')
    });
    const status=form.querySelector('p');
    status.textContent='Completion saved. Preparing signed PDF…';
    for (const input of form.querySelectorAll('input')) input.disabled=true;
    await sendTreeStagePdfAndRefresh(host,receipt,status,form.querySelector('button'));
    return true;
}

async function runTreeStageForm(form,submit) {
    const button=form.querySelector('button'),status=form.querySelector('p');
    if (button.disabled) return;
    button.disabled=true;
    try { if (await submit()) return; }
    catch (error) { if (form.isConnected) status.textContent=error.message; }
    if (form.isConnected) button.disabled=false;
}

async function sendTreeStagePdfAndRefresh(host,job,status,button) {
    button.disabled=true;
    let notice;
    try {
        await publishBloomscapesTreeStagePdf(job);
        notice='Completion saved. Signed PDF queued for delivery.';
    } catch (error) {
        notice='Completion saved. '+error.message+' Use the signed PDF action to retry.';
    }
    if (status.isConnected) status.textContent=notice;
    if (host.isConnected) await mountBloomscapesTreeStageQueue(host,notice);
}

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
    if (typeof bloomscapesPersonalRoute==='function' && bloomscapesPersonalRoute('studio')) return [BLOOMSCAPES_FIELD_WORK_TAB];
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
    if (kind==='FIELD_WORK' && typeof mountBloomscapesTreeStageQueue==='function') {
        const tree=host.appendChild(document.createElement('section'));
        void mountBloomscapesTreeStageQueue(tree);
        if (typeof bloomscapesPersonalScope==='function' && bloomscapesPersonalScope()) return;
    }
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
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    if (preview) return sourceItems.filter(row=>bloomscapesFarmRowIsVisible(row) && previewShowsQueueRow(preview,row,activeReqTab));
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
