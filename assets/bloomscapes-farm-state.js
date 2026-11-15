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

async function selectBloomscapesFarm(farm) {
    await ensureBloomscapesFarmAccess();
    if (!bloomscapesFarmState.allowed.includes(farm)) throw new Error('Choose one of your permitted farms.');
    const previous = getBloomscapesFarm();
    const state = bloomscapesFarmState;
    if (state.busy) return previous;
    state.busy = true;
    state.farm = farm;
    if(previous!==farm)globalThis.dispatchEvent?.(new CustomEvent('bloomscapes-farm-changing'));
    try {
        const loaded = await ensureDatasetLoaded('master','full',{force:state.readyFarm!==farm,bypassLiveSyncCoordinator:true});
        if (bloomscapesFarmState !== state) throw new Error('Signed-in account changed.');
        if (!loaded) throw new Error('Farm data is unavailable; previous inventory retained.');
        await refreshBloomscapesFarmSupport(state);
        await ensureDatasetLoaded('warehouseAssignedItems','full',{force:state.readyFarm!==farm,bypassLiveSyncCoordinator:true});
        if (bloomscapesFarmState !== state) throw new Error('Signed-in account changed.');
        await refreshBloomscapesFarmOwners(state);
        state.readyFarm = farm;
        if (previous!==farm) pruneBloomscapesFarmInventoryCaches();
        state.confirmed = true;
        persistBloomscapesSessionFarm(state);
        globalThis.dispatchEvent?.(new CustomEvent('bloomscapes-farm-ready'));
        if (previous!==farm && typeof resetDockView==='function') resetDockView(false);
        refreshAffectedViews(['master','avOpen','requests','soc','reserves']);
        if (typeof ensureBloomscapesFieldQueue==='function') void ensureBloomscapesFieldQueue(true).catch(error=>globalThis.reportHandledRuntimeIssue?.('field_work_queue',error.code || 'FIELD_WORK_READ_FAILED'));
        return farm;
    } catch (error) {
        if (bloomscapesFarmState === state) state.farm = previous;
        throw error;
    } finally { state.busy = false; }
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


async function refreshBloomscapesFarmOwners(state) {
    const owners = getManagerAssignedColumnState();
    await owners.defaultOwnersPromise;
    if (bloomscapesFarmState!==state) throw new Error('Signed-in account changed.');
    owners.defaultOwnersByCode = new Map();
    owners.itemcodeDefaultOwners = owners.defaultOwnersByCode;
    owners.dataEpoch = (owners.dataEpoch || 0)+1;
    managerEvalAssignmentSelection.clear();
    await loadManagerItemcodeDefaultOwners(true);
    if (bloomscapesFarmState!==state) throw new Error('Signed-in account changed.');
}

function readBloomscapesSessionFarm(state) {
    try {
        const saved = JSON.parse(globalThis.sessionStorage?.getItem(BLOOMSCAPES_SESSION_FARM_KEY) || 'null');
        return saved?.owner===state.owner && state.allowed.includes(saved.farm) ? saved.farm : '';
    } catch {
        globalThis.reportHandledRuntimeIssue?.('farm_session_restore','HANDLED_OPERATION_FAILURE');
        return '';
    }
}

function persistBloomscapesSessionFarm(state) {
    try {
        globalThis.sessionStorage?.setItem(BLOOMSCAPES_SESSION_FARM_KEY,
            JSON.stringify({owner:state.owner,farm:state.farm}));
    } catch {
        globalThis.reportHandledRuntimeIssue?.('farm_session_save','HANDLED_OPERATION_FAILURE');
    }
}

async function refreshBloomscapesFarmSupport(state) {
    await Promise.allSettled(['soc','reserves'].map(key=>
        ensureDatasetLoaded(key,'full',{force:true,bypassLiveSyncCoordinator:true})));
    if (bloomscapesFarmState !== state) throw new Error('Signed-in account changed.');
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
