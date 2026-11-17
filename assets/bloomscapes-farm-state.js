let bloomscapesFarmState = {owner:'',farm:'10-PH',busy:false,allowed:['10-PH'],confirmed:false,loaded:false};
const BLOOMSCAPES_FARM_SCOPES = ['10-PH','60-HL','20-TX','40-NC'];
const BLOOMSCAPES_SESSION_FARM_KEY = 'gnc_bloomscapes_session_farm_v1';

function getBloomscapesFarm() {
    const owner = String(typeof currentUser === 'undefined' ? '' : currentUser);
    if (owner !== bloomscapesFarmState.owner) bloomscapesFarmState = {
        owner,farm:'10-PH',busy:false,allowed:['10-PH'],confirmed:false,loaded:false
    };
    return bloomscapesFarmState.farm;
}

function bloomscapesFarmRowIsVisible(row) {
    const farm = getBloomscapesFarm();
    const rowFarm = bloomscapesRowFarm(row);
    return rowFarm === farm;
}

function selectBloomscapesFarm(farm) {
    getBloomscapesFarm();
    const state = bloomscapesFarmState;
    if (!state.loaded) return ensureBloomscapesFarmAccess().then(()=>selectBloomscapesFarm(farm));
    if (!state.allowed.includes(farm)) return Promise.reject(new Error('Choose one of your permitted farms.'));
    if (state.busy) return farm===state.farm ? state.selection : Promise.reject(new Error('Farm inventory is still loading.'));
    const previous = state.farm;
    rememberBloomscapesFarmPublication();
    state.farm = farm;
    state.confirmed = true;
    state.busy = true;
    persistBloomscapesSessionFarm(state);
    const selector = document.getElementById('bloomscapes-farm-selector');
    if (selector) selector.value = farm;
    if (previous!==farm) resetBloomscapesFarmNavigation();
    state.selection = hydrateBloomscapesChosenFarm(state,farm);
    return state.selection;
}

async function hydrateBloomscapesChosenFarm(state,farm) {
    try {
        const snapshot = getBloomscapesWarmFarm(farm) || await ensureBloomscapesWarmFarm(farm);
        if (state!==bloomscapesFarmState || state.farm!==farm) throw new Error('Signed-in account changed.');
        activateBloomscapesWarmFarm(snapshot);
        state.readyFarm = farm;
        globalThis.dispatchEvent?.(new CustomEvent('bloomscapes-farm-ready'));
        renderBloomscapesFarmNavigation();
        void refreshBloomscapesWarmFarm(farm);
        void prewarmBloomscapesFarms();
        if (typeof ensureBloomscapesFieldQueue==='function') void ensureBloomscapesFieldQueue(true).catch(error=>
            globalThis.reportHandledRuntimeIssue?.('field_work_queue',error.code || 'FIELD_WORK_READ_FAILED'));
        return farm;
    } finally {
        if (state===bloomscapesFarmState) { state.busy = false; state.selection = null; }
    }
}

function bloomscapesFarmNeedsHydration() {
    return !bloomscapesFarmState.busy && bloomscapesFarmState.readyFarm!==getBloomscapesFarm();
}

function getBloomscapesAllowedFarms() {
    getBloomscapesFarm();
    return [...bloomscapesFarmState.allowed];
}

function bloomscapesFarmNeedsConfirmation() {
    getBloomscapesFarm();
    return bloomscapesFarmState.loaded && bloomscapesFarmState.allowed.length > 1 && !bloomscapesFarmState.confirmed;
}

function confirmBloomscapesFarmSession(farm) {
    if (farm !== getBloomscapesFarm() || !bloomscapesFarmState.allowed.includes(farm)) return false;
    bloomscapesFarmState.confirmed = true;
    return true;
}

async function ensureBloomscapesFarmAccess() {
    getBloomscapesFarm();
    const state = bloomscapesFarmState;
    if (state.loaded) return state;
    if (state.pending) return state.pending;
    state.pending = readBloomscapesFarmAccess(state);
    try { return await state.pending; }
    finally { state.pending = null; }
}

async function readBloomscapesFarmAccess(state) {
    const client = getSupabaseBrowserClient();
    if (!nativeAuthSessionActive || !client || !state.owner) throw new Error('Sign in to choose your farm.');
    const {data,error} = await client.rpc('get_my_app_permissions_v1');
    if (state !== bloomscapesFarmState) throw new Error('Signed-in account changed.');
    const allowed = data?.allowed_farms;
    if (error || !Array.isArray(allowed) || !allowed.length
        || allowed.some(farm=>!BLOOMSCAPES_FARM_SCOPES.includes(farm))) throw new Error('Farm permissions could not load.');
    state.allowed = [...new Set(allowed)];
    const savedFarm = readBloomscapesSessionFarm(state);
    state.farm = savedFarm || (allowed.includes(data.default_farm) ? data.default_farm : allowed[0]);
    state.confirmed = allowed.length === 1 || Boolean(savedFarm);
    state.loaded = true;
    return state;
}


function readBloomscapesSessionFarm(state) {
    try {
        const saved = JSON.parse(globalThis.sessionStorage?.getItem(BLOOMSCAPES_SESSION_FARM_KEY)
            || globalThis.localStorage?.getItem(BLOOMSCAPES_SESSION_FARM_KEY) || 'null');
        return saved?.owner===state.owner && state.allowed.includes(saved.farm) ? saved.farm : '';
    } catch {
        globalThis.reportHandledRuntimeIssue?.('farm_session_restore','HANDLED_OPERATION_FAILURE');
        return '';
    }
}

function persistBloomscapesSessionFarm(state) {
    try {
        const saved=JSON.stringify({owner:state.owner,farm:state.farm});
        globalThis.sessionStorage?.setItem(BLOOMSCAPES_SESSION_FARM_KEY,saved);
        globalThis.localStorage?.setItem(BLOOMSCAPES_SESSION_FARM_KEY,saved);
    } catch {
        globalThis.reportHandledRuntimeIssue?.('farm_session_save','HANDLED_OPERATION_FAILURE');
    }
}

function getSupabaseReadIdentityScope() {
    return JSON.stringify([
        typeof SUPABASE_URL === 'string' ? SUPABASE_URL : '',
        typeof nativeAuthSessionActive !== 'undefined' && !!nativeAuthSessionActive,
        typeof nativeAuthProfile !== 'undefined' ? nativeAuthProfile?.id || '' : '',
        typeof currentUser !== 'undefined' ? String(currentUser || '').trim().toLowerCase() : '',
        typeof currentRole !== 'undefined' ? String(currentRole || '').trim().toLowerCase() : '',
        typeof currentUserDivision !== 'undefined' ? String(currentUserDivision || '') : '',
        typeof getCurrentLoginCacheScopeKey === 'function' ? getCurrentLoginCacheScopeKey() : '',
        // A learned revision hash is not a session boundary. Reads keep
        // their account owner while server-side permission checks refresh.
        productionLiveSyncReadAuthEpoch,
        getBloomscapesFarm()
    ]);
}


function getScopedDocksItems(items = socInventory, cacheScopeKey = '') {
    const { isAdmin, isRep, isQcSupervisor, isQc } = getRoleAccessState();
    // Docks is an operational snapshot, not a date report. A missing or
    // old PLANSTART value must never hide a currently imported dock row.
    let nextItems = getActiveSuspendDockRows(Array.isArray(items) ? items : []).filter((row) => {
        const dock = normalizeDockViewDockKey(firstNonEmptyValue(row && row.DOCK, row && row.dock, row && row.DOCK_NUM, row && row.dock_num, ''));
        return dock !== 'Unassigned' && bloomscapesFarmRowIsVisible(row);
    });
    const scopeKey = String(firstNonEmptyValue(cacheScopeKey, items === socInventory ? getDatasetLoadSignature('soc') : '', '')).trim();
    const canUseCache = !!scopeKey;
    const cacheKey = canUseCache ? [
        resolvedViewStateEpoch,
        dockWorkflowStateEpoch,
        scopeKey,
        getBloomscapesFarm(),
        currentUser,
        currentUserDisplay,
        isAdmin ? '1' : '0',
        isRep ? '1' : '0',
        isQcSupervisor ? '1' : '0',
        isQc ? '1' : '0'
    ].join('|') : '';
    if (canUseCache && docksScopedItemsCacheKey === cacheKey && Array.isArray(docksScopedItemsCache)) {
        incrementInternalPerfCounter('viewStateCacheHits');
        return docksScopedItemsCache.slice();
    }
    if (isRep) {
        nextItems = nextItems.filter(item => isMyRep(firstNonEmptyValue(item && item.SALESREPNAME, item && item.SALESREP, item && item.SALES_REP, item && item.SALESREPID, '')));
    }
    if (canUseCache) {
        docksScopedItemsCacheKey = cacheKey;
        docksScopedItemsCache = nextItems.slice();
    }
    return nextItems;
}

const bloomscapesJobBoardFilters = new Map();
function getBloomscapesJobBoardFilters(tab=activeReqTab) {
    const key = getSupabaseReadIdentityScope()+':'+tab;
    if (!bloomscapesJobBoardFilters.has(key)) bloomscapesJobBoardFilters.set(key,{assigned:'all',block:'',search:''});
    return bloomscapesJobBoardFilters.get(key);
}

function setBloomscapesJobBoardFilter(key,value) {
    if (!['assigned','block','search'].includes(key)) return;
    getBloomscapesJobBoardFilters()[key] = String(value || '');
    scheduleTrackedSearchViewRender('request','job-board-filter',String(value || ''),{force:true,debounceDelay:1,typingDelay:18});
}

function matchesBloomscapesJobBoardFilters(row) {
    const filter = getBloomscapesJobBoardFilters();
    const farm = row.farm_code || bloomscapesRowFarm(row);
    if (farm!==getBloomscapesFarm()) return false;
    const rawOwner = row.work_view ? row.assigned_to : typeof getAssignedQueueOwner==='function'
        ? getAssignedQueueOwner(row) : row.ASSIGNEDTO || row.assignedto || row.EVAL_USER || row.eval_user || '';
    const owner = String(typeof normalizeEvalAssignableUser==='function' ? normalizeEvalAssignableUser(rawOwner) : rawOwner || '').trim().toLowerCase();
    const selected = filter.assigned==='mine' ? String(currentUser).toLowerCase() : filter.assigned;
    if (selected==='unassigned' && owner && !['unassigned','none','null','n_a'].includes(owner)) return false;
    if (!['all','unassigned'].includes(selected) && owner!==selected) return false;
    const members = row.source_rows || [];
    const locations = [row.LOCATIONCODE,row.locationcode,row.target_location,...members.map(member=>member.locationcode)].filter(Boolean).join(' ').toLowerCase();
    if (filter.block && !locations.includes(filter.block.toLowerCase().trim())) return false;
    const text = [row.ITEMCODE,row.itemcode,row.COMMONNAME,row.commonname,row.action_type,row.instructions,locations,row.command?.media,row.command?.fertilizer].filter(Boolean).join(' ').toLowerCase();
    return filter.search.toLowerCase().trim().split(/\s+/).every(term=>text.includes(term));
}
