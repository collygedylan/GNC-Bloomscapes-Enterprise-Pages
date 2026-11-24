const DOCK_PIPELINE_PAGE_TTL_MS = 45000;
const DOCK_PIPELINE_PAGE_LIMIT = 24;
let dockPipelineState;

function currentDockPipelineState() {
    const identity = getSupabaseReadIdentityScope();
    const preview = borrowedHelpPreview()?.username || '';
    const farm = getBloomscapesFarm();
    const permission = appAccessSnapshotState.snapshot?.dataPermissionVersion || '';
    const key = JSON.stringify([identity,farm,preview,permission]);
    if (dockPipelineState?.key !== key) dockPipelineState = {key,farm,preview,view:'',trip:'',offset:0,pages:new Map()};
    return dockPipelineState;
}

function pipelineIsCurrent(state) {
    return state === currentDockPipelineState() && isViewVisible('docks');
}

function applyPipelinePermissions(state, rail) {
    if (state.permissions || state.meta || !nativeAuthSessionActive) return;
    const input = state.preview ? {preview:state.preview} : {};
    state.meta = requestDockPipeline(state.farm,'meta',input).then(receipt=>{
        if (!pipelineIsCurrent(state)) return;
        state.permissions = receipt.permissions;
        drawPipelineSelector(rail,state);
    }).catch(error=>{
        if (pipelineIsCurrent(state)) {
            window.GncRuntimeWatchdog?.capture?.(error,{rpcName:'gnc_dock_pipeline',action:'meta'});
            state.permissions = {};
        }
    }).finally(()=>{state.meta = null;});
}

function drawPipelineSelector(rail,state) {
    const select = rail.querySelector('select');
    const allowed = dockPipelineViews.filter(([key])=>state.permissions?.[key] === 'Y');
    const signature = allowed.map(([key])=>key).join('|');
    if (rail.dataset.allowedViews !== signature) {
        select.replaceChildren(new Option('Docks overview',''),...allowed.map(([key,label])=>new Option(label,key)));
        rail.dataset.allowedViews = signature;
    }
    select.value = state.view;
    rail.hidden = !allowed.length;
}

function mountPipelineSelector(container,state) {
    const upper = document.querySelector('#view-docks > .freeze-panel');
    let rail = upper.querySelector('[data-dock-pipeline-selector]');
    if (rail) return rail;
    rail = document.createElement('div');
    rail.dataset.dockPipelineSelector = '';
    rail.hidden = true;
    rail.innerHTML = '<label>View <select aria-label="Docks View" class="input-field"></select></label>'
        + '<button type="button" class="ml-2 rounded-lg border px-2 py-1" data-dock-pipeline-refresh hidden>Refresh</button>';
    upper.insertBefore(rail,upper.querySelector('#docks-crumb'));
    rail.addEventListener('change',selectPipelineView);
    rail.addEventListener('click',refreshPipelineSelection);
    container.addEventListener('click',handleDockPipelineClick);
    drawPipelineSelector(rail,state);
    return rail;
}

function selectPipelineView(event) {
    const state = currentDockPipelineState();
    state.view = event.target.value;
    state.trip = '';
    state.offset = 0;
    state.page = null;
    state.queryKey = '';
    resetDockView(false);
    scheduleDocksRender(0);
    updateGlobalBackButton();
}

function refreshPipelineSelection(event) {
    if (!event.target.closest('[data-dock-pipeline-refresh]')) return;
    const state = currentDockPipelineState();
    if (!state.view || state.read || state.writing) return;
    state.pages.delete(state.queryKey);
    scheduleDocksRender(0);
}

function pipelineInputs(state,term) {
    if (state.search !== term || state.level !== dockViewLevel) state.offset = 0;
    state.search = term;
    state.level = dockViewLevel;
    return dockPipelineQuery(state,term,{level:dockViewLevel,dock:selectedDockNum ?? '',stop:selectedDockStop ?? ''});
}

function renderBloomscapesDockPipeline(container,crumb,term) {
    const state = currentDockPipelineState();
    const rail = mountPipelineSelector(container,state);
    drawPipelineSelector(rail,state);
    applyPipelinePermissions(state,rail);
    const active = state.permissions?.[state.view] === 'Y' && dockViewMode === 'docks';
    rail.querySelector('[data-dock-pipeline-refresh]').hidden = !active;
    container.toggleAttribute('data-dock-pipeline-active',active);
    if (!active) {
        container.removeAttribute('aria-busy');
        return false;
    }
    const query = pipelineInputs(state,term);
    const read = getDockPipelinePage(state,query);
    paintDockPipeline(container,crumb,{...state,...read,query,readOnly:!!state.preview || !!state.writing});
    return true;
}

function getDockPipelinePage(state,query) {
    const key = JSON.stringify(query);
    state.queryKey = key;
    let entry = state.pages.get(key);
    if (!state.writing && !entry?.pending && !(entry?.expiresAt > Date.now())) {
        entry = loadDockPipelinePage(state,query,key,entry?.page);
    }
    state.page = entry?.page;
    state.read = entry?.pending && !entry.page;
    return {page:state.page,busy:!!entry?.pending,error:state.writeError || entry?.error};
}

function loadDockPipelinePage(state,query,key,page) {
    const entry = {page,expiresAt:0,pending:true};
    state.pages.delete(key);
    if (state.pages.size >= DOCK_PIPELINE_PAGE_LIMIT) state.pages.delete(state.pages.keys().next().value);
    state.pages.set(key,entry);
    void readDockPipelineList(state.farm,query,()=>pipelineIsCurrent(state) && state.queryKey === key).then(receipt=>{
        if (state.queryKey !== key || !pipelineIsCurrent(state)) return;
        entry.page = receipt;
        entry.expiresAt = Date.now() + DOCK_PIPELINE_PAGE_TTL_MS;
    }).catch(error=>{
        entry.error = error.message;
        entry.expiresAt = Date.now() + 5000;
    }).finally(()=>{
        entry.pending = false;
        if (state.pages.get(key) === entry && state.queryKey === key && pipelineIsCurrent(state)) scheduleDocksRender(0);
    });
    return entry;
}

function openDockPipelineGroup(state,group) {
    if (!group) return;
    state.offset = 0;
    state.trip = group.trip;
    const level = dockViewLevel === 0 ? 1 : 2;
    return runDirectTrackedNavigation('docks','dock-pipeline:'+JSON.stringify([group.dock,group.trip,group.stopnumber]),()=>{
        selectedDockNum = group.dock;
        selectedDockStop = level === 2 ? group.stopnumber : null;
        dockViewLevel = level;
    },{delay:0,typingDelay:180});
}

function handleDockPipelineClick(event) {
    const button = event.target.closest('button');
    const state = currentDockPipelineState();
    if (!button || !state.view || state.read || state.writing) return;
    const {dockPipelineGroup:group,dockPipelineAction:action,orderId:id} = button.dataset;
    if (group !== undefined) return openDockPipelineGroup(state,state.page?.groups[Number(group)]);
    if (action && id && !state.preview) void commitDockPipelineAction(state,action,id);
}

async function commitDockPipelineAction(state,action,id) {
    state.writing = true;
    state.writeError = '';
    scheduleDocksRender(0);
    try {
        await requestDockPipeline(state.farm,action,{id});
        state.pages.clear();
        state.page = null;
        state.offset = 0;
        if (state === currentDockPipelineState()) signalProductionLiveSync('dock-pipeline-receipt',0);
    } catch (error) {
        state.writeError = error.message;
    } finally {
        state.writing = false;
        if (pipelineIsCurrent(state)) scheduleDocksRender(0);
    }
}
