
let bloomscapesDockBoardState = null;

const bloomscapesDockWorkspaceTitles = {
    'pull-tags':'Pull Tags',
    'mistake-fix':'Mistake Fix',
    'traffic-office':'Traffic Office'
};

function getBloomscapesDockBoardState() {
    const identity = getSupabaseReadIdentityScope();
    const farm = getBloomscapesFarm();
    if (bloomscapesDockBoardState?.identity !== identity || bloomscapesDockBoardState?.farm !== farm) {
        bloomscapesDockBoardState = {
            identity,farm,board:null,read:null,write:null,error:'',filters:{},revision:0,urgent:new Map(),drafts:new Map(),openDisclosures:new Set()
        };
    }
    return bloomscapesDockBoardState;
}

function isBloomscapesDockStateCurrent(state) {
    return getBloomscapesDockBoardState() === state && nativeAuthSessionActive;
}

function refreshBloomscapesDockBoard(force=false) {
    const state = getBloomscapesDockBoardState();
    if (!isBloomscapesDockStateCurrent(state)) return Promise.resolve();
    if (!force && state.board && Date.now()-(state.readyAt || 0)<45000) return Promise.resolve(state.board);
    if (!state.read) state.read = loadBloomscapesDockBoard(state);
    return state.read;
}

async function loadBloomscapesDockBoard(state) {
    let changed = false;
    try {
        const board = await readBloomscapesDockBoard(state.farm,state.identity);
        if (!isBloomscapesDockStateCurrent(state)) return;
        changed = !!state.error;
        state.error = '';
        state.readyAt = Date.now();
        if (JSON.stringify(state.board) !== JSON.stringify(board)) {
            changed = true;
            state.board = board;
            state.revision += 1;
            state.urgent = new Map(board.suspend.filter(tag => tag.urgent === true).map(tag => [String(tag.id),tag]));
            state.tagIndex = new Map(board.tags.map(tag=>[String(tag.id),tag]));
            state.tagsByDrop = pullTagsByDrop(board.tags);
            state.tripIndex = new Map(board.trips.map(trip=>[pullKey(trip),trip]));
            state.trafficIndex = new Map(board.traffic.map(receipt=>[pullTrafficKey(receipt),receipt]));
            state.hasPullers = board.people.some(person=>person.puller_eligible===true);
        }
    } catch (error) {
        if (!isBloomscapesDockStateCurrent(state)) return;
        changed = state.error!==error.message || (error.code==='42501' && !!state.board);
        state.error = error.message;
        if (error.code === '42501' && state.board) {
            state.board = null;
            state.urgent.clear();
            state.revision += 1;
        }
    } finally {
        state.read = null;
        if (changed && isBloomscapesDockStateCurrent(state)) publishBloomscapesDockBoard(state);
    }
}

function publishBloomscapesDockBoard(state) {
    const viewId = getCurrentVisibleViewId();
    const host = document.getElementById('view-'+viewId);
    if (host && Object.hasOwn(bloomscapesDockWorkspaceTitles,viewId)) paintBloomscapesDocksWorkspace(host,viewId,state);
    if (viewId === 'docks') scheduleDocksRender(0);
    if (viewId === 'request' && activeReqTab === 'suspend-tag') {
        markViewDirty('request');
        scheduleRequestRender(0);
    }
}

function currentBloomscapesDockBoard() {
    const state = getBloomscapesDockBoardState();
    return isBloomscapesDockStateCurrent(state) ? state.board : null;
}

function bloomscapesDockBoardRevision() {
    const state = getBloomscapesDockBoardState();
    return isBloomscapesDockStateCurrent(state) ? state.revision : 0;
}

function getBloomscapesUrgentSuspendTag(row) {
    const state = getBloomscapesDockBoardState();
    if (!isBloomscapesDockStateCurrent(state)) return null;
    return state.urgent.get(String(getItemUniqueId(row) || ''))
        || state.urgent.get(String(getDockSuspendDcRequestSourceUid(row) || ''));
}

function renderBloomscapesDocksWorkspace(viewId) {
    if (!Object.hasOwn(bloomscapesDockWorkspaceTitles,viewId)) return false;
    const host = document.getElementById('view-'+viewId);
    if (!host) return false;
    mountBloomscapesDockWorkspaceEvents(host);
    const state = getBloomscapesDockBoardState();
    bindBloomscapesDockChoiceFields(host,state);
    paintBloomscapesDocksWorkspace(host,viewId,state);
    return true;
}

function activateBloomscapesDocksWorkspace(viewId) {
    if (!nativeAuthSessionActive) return;
    const supportView = ['docks','sales-office','bloomscapes-sales-vault'].includes(viewId)
        || (viewId === 'request' && activeReqTab === 'suspend-tag');
    if ((Object.hasOwn(bloomscapesDockWorkspaceTitles,viewId) && canOpenBloomscapesDocksWorkspace(viewId)) || supportView) {
        void refreshBloomscapesDockBoard();
    }
}

function openBloomscapesDockTrip(dock,trip,edit = '') {
    const state = getBloomscapesDockBoardState();
    state.filters = {dock, trip};
    state.edit = edit;
    markViewDirty('pull-tags');
    switchView('pull-tags');
    return false;
}

function mountBloomscapesDockWorkspaceEvents(host) {
    if (host.dataset.dockWorkspaceBound) return;
    host.dataset.dockWorkspaceBound = 'true';
    host.addEventListener('submit',handleBloomscapesDockSubmit);
    host.addEventListener('click',handleBloomscapesDockClick);
    host.addEventListener('change',handleBloomscapesDockFilter);
    host.addEventListener('input',saveBloomscapesDockDraft);
    host.addEventListener('toggle',handleBloomscapesDockDisclosure,true);
}

function handleBloomscapesDockDisclosure(event) {
    const details = event.target;
    if (!details.isConnected || !details.matches('[data-pull-disclosure],[data-pull-list-section]')) return;
    const state = getBloomscapesDockBoardState();
    if (details.matches('[data-pull-list-section]')) return paintBloomscapesDockListSection(details,state);
    const key=details.dataset.pullDisclosure+':'+details.dataset.pullDisclosureKey;
    if (details.open) state.openDisclosures.add(key);
    else state.openDisclosures.delete(key);
    paintBloomscapesDockDisclosure(details,state);
}

function mountBloomscapesDockDropEvents() {
    const host = document.getElementById('docks-content');
    if (!host) return;
    mountBloomscapesDockWorkspaceEvents(host);
    bindBloomscapesDockChoiceFields(host,getBloomscapesDockBoardState());
}

function handleBloomscapesDockClick(event) {
    const button = event.target.closest('[data-pull-click]');
    if (!button) return;
    const state = getBloomscapesDockBoardState();
    if (button.dataset.pullClick === 'refresh') void refreshBloomscapesDockBoard(true);
    if (button.dataset.pullClick === 'reset') {
        state.filters = {};
        state.edit = '';
        paintBloomscapesDocksWorkspace(event.currentTarget,'pull-tags',state);
    }
    if (button.dataset.pullClick === 'borrow') {
        const details = event.currentTarget.querySelector('[data-pull-borrow]');
        if (details) details.open = true;
        details?.querySelector('[data-bloom-choice-source]')?.focus();
    }
    if (button.dataset.pullClick === 'print') printBloomscapesCheckerCopy(button);
}

function handleBloomscapesDockFilter(event) {
    const filter = event.target.closest('[data-pull-filter]');
    if (!filter) {
        if (event.target.matches('[data-bloom-choice-value]')) saveBloomscapesDockDraft(event);
        return;
    }
    if (filter.name === 'route') return;
    const state = getBloomscapesDockBoardState();
    state.filters[filter.name] = filter.value;
    if (filter.name === 'dockDay') {
        delete state.filters.dock;
        delete state.filters.trip;
        state.edit = '';
    }
    paintBloomscapesDocksWorkspace(event.currentTarget,'pull-tags',state);
    const current = event.currentTarget.querySelector('[data-pull-filter][name="'+filter.name+'"]');
    (current?.matches('[data-bloom-choice-value]') ? current.previousElementSibling : current)?.focus();
}

function handleBloomscapesDockSubmit(event) {
    const form = event.target.closest('form[data-pull-command]');
    if (!form) return;
    event.preventDefault();
    const state = getBloomscapesDockBoardState();
    if (!state.board || state.write) return;
    const input = Object.fromEntries(new FormData(form));
    const action = form.dataset.pullCommand;
    const key = bloomscapesDockDraftKey(form);
    if (action === 'borrow' && input.id) {
        const tag = state.tagIndex.get(String(input.id));
        if (!tag) return;
        Object.assign(input,{dock:tag.dock,trip:tag.trip,drop:tag.drop});
    }
    if (action === 'fix_mistake') {
        const draft = storeBloomscapesDockDraft(state,form,key);
        draft.requestId ||= crypto.randomUUID();
        input.request_id = draft.requestId;
    }
    void applyBloomscapesDockCommand({state,form,input,action,key,host:event.currentTarget});
}

function bloomscapesDockDraftKey(form) {
    return JSON.stringify([form.dataset.pullCommand,...Array.from(form.elements)
        .filter(control => control.name && control.type === 'hidden').map(control => [control.name,control.value])]);
}

function storeBloomscapesDockDraft(state, form, key) {
    const fields = Array.from(form.elements).filter(control => control.name && control.type !== 'hidden');
    const values = Object.fromEntries(fields.map(control => [control.name,control.value]));
    const previous = state.drafts.get(key);
    const requestId = JSON.stringify(previous?.values) === JSON.stringify(values) ? previous.requestId : '';
    const draft = {values,requestId};
    state.drafts.set(key,draft);
    return draft;
}

function saveBloomscapesDockDraft(event) {
    const form = event.target.closest('form[data-pull-command]');
    if (form) storeBloomscapesDockDraft(getBloomscapesDockBoardState(),form,bloomscapesDockDraftKey(form));
}

function restoreBloomscapesDockDrafts(host) {
    const drafts = getBloomscapesDockBoardState().drafts;
    for (const form of host.querySelectorAll('form[data-pull-command]')) {
        const draft = drafts.get(bloomscapesDockDraftKey(form));
        if (!draft) continue;
        const details = form.closest('details');
        if (details) details.open = true;
        for (const [name,value] of Object.entries(draft.values)) {
            const control = form.elements.namedItem(name);
            if (!control) continue;
            if (control.matches('[data-bloom-choice-value]')) setBloomscapesChoiceFieldValue(control,value);
            else control.value = value;
        }
    }
}

async function applyBloomscapesDockCommand({state,form,input,action,key,host}) {
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    const status = host.querySelector('[data-pull-status]');
    if (status) status.textContent = 'Saving…';
    const submittedDraft = state.drafts.get(key);
    state.write = sendBloomscapesDockCommand(state.farm,state.identity,action,input);
    try {
        await state.write;
        if (state.drafts.get(key) === submittedDraft) state.drafts.delete(key);
        await state.read;
        if (!isBloomscapesDockStateCurrent(state)) return;
        await refreshBloomscapesDockBoard(true);
        if (action !== 'set_team' && action !== 'set_truck' && action !== 'auto_assign') void refreshBloomscapesBorrowedRoutes();
        if (isBloomscapesDockStateCurrent(state)) showToast('Docks','Saved.');
    } catch (error) {
        if (isBloomscapesDockStateCurrent(state)) {
            if (status) status.textContent = error.message;
            showToast('Docks',error.message,true);
        }
    } finally {
        state.write = null;
        if (submit) submit.disabled = false;
    }
}
