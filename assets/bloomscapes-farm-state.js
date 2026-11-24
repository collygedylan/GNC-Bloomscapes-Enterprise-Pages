const BLOOMSCAPES_IDLE_STAGGER_MS = 150;
const BLOOMSCAPES_IDLE_EXPIRY_MS = 120000;
const bloomscapesIdleJobs = new Map();
let bloomscapesIdleTimer;
let bloomscapesIdleRunning = false;

function scheduleBloomscapesIdleTask(key, run, current, delay = 0, discard) {
    bloomscapesIdleJobs.get(key)?.discard?.();
    bloomscapesIdleJobs.set(key,{run,current,discard,expires:Date.now()+BLOOMSCAPES_IDLE_EXPIRY_MS,due:Date.now()+delay});
    armBloomscapesIdleTasks(delay);
}

function armBloomscapesIdleTasks(delay = BLOOMSCAPES_IDLE_STAGGER_MS) {
    if (bloomscapesIdleTimer || bloomscapesIdleRunning || !bloomscapesIdleJobs.size) return;
    bloomscapesIdleTimer = setTimeout(drainBloomscapesIdleTasks,Math.max(BLOOMSCAPES_IDLE_STAGGER_MS,delay));
}

function busyBloomscapesIdleTasks() {
    return document.hidden || navigator.onLine === false || shouldDeferInteractiveBackgroundWork();
}

async function drainBloomscapesIdleTasks() {
    bloomscapesIdleTimer = null;
    const now = Date.now();
    for (const [key,job] of bloomscapesIdleJobs) {
        if (!job.current() || job.expires <= now) {
            bloomscapesIdleJobs.delete(key);
            job.discard?.();
        }
    }
    const next = [...bloomscapesIdleJobs].find(([,job])=>job.due <= now);
    if (!next || busyBloomscapesIdleTasks()) return armBloomscapesIdleTasks();
    bloomscapesIdleJobs.delete(next[0]);
    bloomscapesIdleRunning = true;
    try { await next[1].run(); }
    catch (error) { globalThis.GncRuntimeWatchdog?.capture(error,'idle-prewarm'); }
    finally {
        bloomscapesIdleRunning = false;
        armBloomscapesIdleTasks();
    }
}

function queueBloomscapesFarmPrewarm(cache) {
    const current = () => cache===getBloomscapesFarmCache() && nativeAuthSessionActive;
    scheduleBloomscapesIdleTask('farm-prewarm',()=>runBloomscapesFarmPrewarm(cache),current);
}

const SHORTCUT_WRITE_DEBOUNCE_MS = 800;

function createBloomscapesShortcutWriter(hooks) {
    const state = {hooks,pending:null,flight:false,timer:null};
    return (shortcuts,container,current) => {
        state.pending = {shortcuts,container,current,retries:0};
        scheduleBloomscapesShortcutWrite(state);
    };
}

function scheduleBloomscapesShortcutWrite(state) {
    clearTimeout(state.timer);
    if (state.flight || !state.pending) return;
    const delay = SHORTCUT_WRITE_DEBOUNCE_MS * 2 ** state.pending.retries;
    state.timer = setTimeout(()=>flushBloomscapesShortcutWrite(state),delay);
}

async function flushBloomscapesShortcutWrite(state) {
    const job = state.pending;
    state.pending = null;
    if (!job?.current() || state.hooks.revision() == null) return;
    state.flight = true;
    try {
        job.command ||= {commandId:state.hooks.commandId(),expectedRevision:state.hooks.revision()};
        const saved = await state.hooks.send(job.shortcuts,job.command);
        if (!job.current()) return;
        state.hooks.adopt(saved);
        if (!state.pending) state.hooks.status(job.container,'Shortcuts saved and the dock is updated.');
    } catch (error) {
        if (job.current() && !state.pending) retryBloomscapesShortcutWrite(state,job,error);
    } finally {
        state.flight = false;
        scheduleBloomscapesShortcutWrite(state);
    }
}

function retryBloomscapesShortcutWrite(state,job,error) {
    const transient = error.code==='TRANSPORT_TIMEOUT' || error.name==='TypeError';
    if (transient && job.retries < 3) {
        job.retries++;
        state.pending = job;
    } else {
        state.hooks.status(job.container,'Shortcuts kept on this device. '+state.hooks.message(error));
    }
}

let bloomscapesFarmState = {owner:'',farm:'10-PH',busy:false,allowed:['10-PH'],confirmed:false,loaded:false};
let warehouseSwitchSeq = 0;
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
    if (state.loaded && !state.allowed.includes(farm)) return Promise.reject(new Error('Choose one of your permitted farms.'));
    if (state.busy && farm===state.farm) return state.selection;
    const sequence = ++warehouseSwitchSeq;
    state.selectionToken = sequence;
    if (!state.loaded) return ensureBloomscapesFarmAccess().then(()=>{
        if (!isBloomscapesWarehouseSwitchCurrent(state,sequence)) return false;
        if (!state.allowed.includes(farm)) throw new Error('Choose one of your permitted farms.');
        return startBloomscapesFarmSelection(state,farm,sequence);
    });
    return startBloomscapesFarmSelection(state,farm,sequence);
}

function isBloomscapesWarehouseSwitchCurrent(state,sequence) {
    return state===bloomscapesFarmState && state.owner===String(currentUser) && state.selectionToken===sequence;
}

function startBloomscapesFarmSelection(state,farm,sequence) {
    const previous = state.readyFarm || state.farm;
    if (state.busy) cancelBloomscapesFarmRead(state.farm);
    rememberBloomscapesFarmPublication();
    state.farm = farm;
    state.confirmed = true;
    state.busy = true;
    const selector = document.getElementById('bloomscapes-farm-selector');
    if (selector) selector.value = farm;
    if (previous!==farm) resetBloomscapesFarmNavigation();
    const visit = typeof getCurrentVisibleViewId==='function' ? currentDocksReadVisit() : null;
    state.selection = hydrateBloomscapesChosenFarm(state,farm,previous,visit,sequence);
    return state.selection;
}

async function hydrateBloomscapesChosenFarm(state,farm,previous,visit,token = state.selectionToken) {
    const selectionIsCurrent = () => isBloomscapesWarehouseSwitchCurrent(state,token);
    try {
        const snapshot = getBloomscapesWarmFarm(farm) || await ensureBloomscapesWarmFarm(farm);
        if (!selectionIsCurrent() || state.farm!==farm) return false;
        activateBloomscapesWarmFarm(snapshot);
        state.readyFarm = farm;
        persistBloomscapesSessionFarm(state);
        globalThis.dispatchEvent?.(new CustomEvent('bloomscapes-farm-ready'));
        renderBloomscapesFarmNavigation();
        globalThis.prepareBloomscapesFarmAvBrowse?.(farm);
        scheduleBloomscapesFarmRevalidation(state,farm,visit,token);
        return farm;
    } catch (error) {
        if (!selectionIsCurrent() || document.hidden) return false;
        if (state.readyFarm!==farm) {
            state.farm=previous;
            if (farm!==previous) renderBloomscapesFarmNavigation();
        }
        if (error.name==='AbortError' || ['REQUEST_ABORTED','FARM_SNAPSHOT_SCOPE_CHANGED','DATASET_READ_SCOPE_CHANGED'].includes(error.code)) return false;
        if (globalThis.navigator?.onLine === false) return false;
        if (previous===farm && error.code==='FARM_SNAPSHOT_REVISION_CHANGED') return farm;
        throw error;
    } finally {
        if (selectionIsCurrent()) { state.busy = false; state.selection = null; }
    }
}

function scheduleBloomscapesFarmRevalidation(state,farm,visit,sequence) {
    const current = () => isBloomscapesWarehouseSwitchCurrent(state,sequence) && state.readyFarm===farm;
    if (!visit?.aborted) scheduleBloomscapesIdleTask('farm-revalidation',()=>refreshBloomscapesWarmFarm(farm,visit,current),current);
    prewarmBloomscapesFarms();
    if (typeof ensureBloomscapesFieldQueue==='function') {
        scheduleBloomscapesIdleTask('field-work-queue',ensureBloomscapesFieldQueue,current);
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
    const { owner } = await requireBloomscapesSession();
    const current = () => state === bloomscapesFarmState && currentUser === state.owner && nativeAuthProfile?.id === owner;
    if (!current()) throw new Error('Signed-in account changed.');
    const data = await supabaseRpc('get_my_app_permissions_v1', {}, { timeoutMs: 10000 });
    if (!current()) throw new Error('Signed-in account changed.');
    const allowed = data?.allowed_farms;
    if (!Array.isArray(allowed) || !allowed.length
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
    let nextItems = getActiveSuspendDockRows(Array.isArray(items) ? items : []).filter((row) => {
        const dock = normalizeDockViewDockKey(firstNonEmptyValue(row && row.DOCK, row && row.dock, row && row.DOCK_NUM, row && row.dock_num, ''));
        return dock !== 'Unassigned' && bloomscapesFarmRowIsVisible(row);
    });
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
    if (!['assigned','block','search','priorityStatus'].includes(key)) return;
    getBloomscapesJobBoardFilters()[key] = String(value || '');
    scheduleTrackedSearchViewRender('request','job-board-filter',String(value || ''),{force:true,debounceDelay:1,typingDelay:18});
}

function matchesBloomscapesJobBoardFilters(row) {
    const filter = getBloomscapesJobBoardFilters();
    const farm = row.farm_code || bloomscapesRowFarm(row);
    if (farm!==getBloomscapesFarm()) return false;
    if (filter.priorityStatus && !bloomscapesJobPriorityStatus(row).includes(filter.priorityStatus)) return false;
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

function bloomscapesJobPriorityStatus(row) {
    const priority = row.PRIORITY || row.priority || row.priority_code;
    const status = row.STATUS || row.status || row.workflow_status || row.REQUEST_STATUS;
    return [priority && 'Priority '+priority,status && 'Status '+status].filter(Boolean);
}
