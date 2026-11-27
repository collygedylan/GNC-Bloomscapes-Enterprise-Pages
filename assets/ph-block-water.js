
const PH_WATER_READ = 'gnc_10_ph_read_block_water';
const PH_WATER_REQUEST = 'gnc_10_ph_log_prober_water_request';
const PH_WATER_TOGGLE = 'gnc_10_ph_toggle_block_water';
const PH_WATER_BATCH = 'gnc_10_ph_toggle_water_batch';
const phWaterEvents = new EventTarget();
let phWaterState;
let phWaterTimer;
let phWaterLifecycleRegistered = false;
let phWaterRealtimeRegistered = false;

/** @returns {object|null} Current Park Hill water state for the active owner. */
function currentPhWaterState() {
    const owner = phPlaceScope();
    if (!owner || borrowedHelpPreview()) {
        phWaterState = null;
        return null;
    }
    if (phWaterState?.owner !== owner) {
        phWaterState = {owner,warehouse:'10-PH',blockWaterStatus:{},hiddenCounts:{},today:'',canEdit:false,version:0,
            pending:new Set(),reading:null,failures:0,retryAt:0,fetchedAt:0,revision:0,targetRevision:0,error:''};
    }
    return phWaterState;
}

/** @returns {object|null|false} Water state available to the current view. */
function visiblePhWaterStatus() {
    return typeof phPlaceScope === 'function' && currentPhWaterState();
}

/** @returns {object|null} Water state with an exact dock urgency lookup. */
function phSuspendWaterStatus() {
    const state = visiblePhWaterStatus();
    if (!state || !currentBloomscapesDockBoard()) return null;
    return {...state,resolveDockStatus: tag => getBloomscapesUrgentSuspendTag(tag) ? 'Live Driver' : ''};
}

/** @returns {boolean} Whether this session can open the production Water view. */
function phWaterMayOpen() {
    return Boolean(visiblePhWaterStatus() && canAccessView('production'));
}

function publishPhWaterChange(state, membership = false, dispatch = false) {
    if (currentPhWaterState() !== state) return;
    if (membership) state.version++;
    phWaterEvents.dispatchEvent(new Event('change'));
    const view = getCurrentVisibleViewId();
    if (view === 'shipping' && (membership || dispatch)) {
        redrawPhShippingView();
        if (dispatch && !state.pending.size) void refreshPhShippingAfterWater(state.revision);
    }
    if (membership && view === 'request' && activeReqTab === 'suspend-tag') renderRequest();
}

/**
 * @param {Function} callback
 * @returns {Function} Unsubscribe callback for water state changes.
 */
function observePhWaterUpdates(callback) {
    phWaterEvents.addEventListener('change',callback);
    return () => phWaterEvents.removeEventListener('change',callback);
}

function phWaterActiveKeys(rows) {
    return Object.values(rows).filter(row => row.is_water_on).map(row => row.block_code).sort().join('|');
}

function phWaterRevision(receipt) {
    const revision = Number(receipt.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Water revision was incomplete.');
    return revision;
}

function applyPhWaterReceipt(state,receipt) {
    if (!Array.isArray(receipt.rows) || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.today)) {
        throw Error('Water schedule response was incomplete.');
    }
    const revision = phWaterRevision(receipt);
    if (revision < state.revision) return;
    const rows = Object.fromEntries(receipt.rows.map(row => [row.block_code,row]));
    const membership = phWaterActiveKeys(state.blockWaterStatus) !== phWaterActiveKeys(rows);
    const dispatch = revision > state.revision || membership;
    state.blockWaterStatus = rows;
    state.today = receipt.today;
    state.canEdit = receipt.can_edit === true;
    state.hiddenCounts = receipt.wet_hidden || {};
    state.revision = revision;
    state.fetchedAt = Date.now();
    state.error = '';
    publishPhWaterChange(state,membership,dispatch);
}

function refreshPhWaterStatus(state = currentPhWaterState(),force = false) {
    if (!state || state.pending.size || document.hidden || navigator.onLine === false) return Promise.resolve();
    if (state.reading) return state.reading;
    if (!force && (Date.now()-state.fetchedAt < 15000 || Date.now() < state.retryAt)) return Promise.resolve();
    const revision = state.revision;
    state.reading = requestPhPlaceReceipt(PH_WATER_READ).then(receipt => {
        if (currentPhWaterState() !== state || revision !== state.revision || state.pending.size) return;
        applyPhWaterReceipt(state,receipt);
        state.failures = 0;
        state.retryAt = 0;
    }).catch(error => {
        state.error = error.message || 'Water status could not load.';
        state.failures = Math.min(3,state.failures+1);
        state.retryAt = Date.now()+15000*2**state.failures;
        publishPhWaterChange(state);
    }).finally(() => { state.reading = null; });
    return state.reading;
}

function phWaterSurfaceOpen() {
    const view = getCurrentVisibleViewId();
    if (view === 'shipping') return canOpenPhShipping();
    if (view === 'request') return activeReqTab === 'suspend-tag';
    return view === 'production' && Boolean(document.querySelector('[data-ph-water],[data-ph-pull-work]'));
}

function stopPhWaterRefresh() {
    clearTimeout(phWaterTimer);
    phWaterTimer = null;
}

function receivePhWaterRevisions(events) {
    const state = currentPhWaterState();
    if (!state) return;
    for (const event of events) {
        if (event.kind !== 'ph-water' || event.payload?.warehouse !== '10-PH') continue;
        state.targetRevision = Math.max(state.targetRevision,Number(event.payload.revision) || 0);
    }
    if (phWaterSurfaceOpen() && state.targetRevision > state.revision && Date.now() >= state.retryAt) {
        void refreshPhWaterStatus(state,true);
    }
}

/** @returns {void} Reconciles lifecycle, revision and bounded refresh scheduling. */
function syncPhWaterRefresh() {
    if (!phWaterLifecycleRegistered && typeof registerBloomscapesBatteryResource === 'function') {
        phWaterLifecycleRegistered = true;
        registerBloomscapesBatteryResource('ph-water',{pause:stopPhWaterRefresh,resume:syncPhWaterRefresh});
    }
    stopPhWaterRefresh();
    const state = currentPhWaterState();
    if (!state || document.hidden || navigator.onLine === false || !phWaterSurfaceOpen()) return;
    if (!phWaterRealtimeRegistered && typeof subscribeBatteryRealtime === 'function') {
        phWaterRealtimeRegistered = true;
        subscribeBatteryRealtime('ph-water',receivePhWaterRevisions);
    }
    const inFlight = state.reading || state.pending.size;
    const backoff = Date.now() < state.retryAt;
    if (!inFlight && !backoff) void refreshPhWaterStatus(state,state.targetRevision>state.revision);
    phWaterTimer = window.setTimeout(syncPhWaterRefresh,15000);
}

function optimisticPhWaterRow(row,command) {
    if (!Object.hasOwn(command,'on')) {
        const request = {schedule_date:command.date,requested_minutes:command.minutes,probed_by:currentUser,prober_note:command.note};
        const requests = (row.requests || []).filter(existing => existing.schedule_date !== command.date);
        return {...row,requests:[...requests,request].sort((a,b) => a.schedule_date.localeCompare(b.schedule_date))};
    }
    const slot = row.requests?.find(request => request.schedule_date === command.today);
    return {...row,is_water_on:command.on,
        water_on_at:command.on ? new Date().toISOString() : row.water_on_at,
        active_requested_minutes:command.on ? slot?.requested_minutes : null};
}

function phWaterCommandRows(receipt,prior,command) {
    if (prior.size===1 && receipt.block_code!==prior.keys().next().value) throw Error('Water receipt did not match this block.');
    const matched = new Map();
    for (const row of receipt.rows || []) {
        if (!prior.has(row.block_code)) continue;
        const valid = Object.hasOwn(command,'on') ? row.is_water_on===command.on
            : row.probed_at===receipt.probed_at && row.schedule_date===command.date && row.requested_minutes===command.minutes;
        if (!valid || matched.has(row.block_code)) throw Error('Water receipt did not match the requested state.');
        matched.set(row.block_code,row);
    }
    if (matched.size!==prior.size) throw Error('Water receipt was incomplete.');
    return matched;
}

function settlePhWaterRows(state,rows) {
    let membership = false;
    for (const [block,row] of rows) {
        membership ||= state.blockWaterStatus[block].is_water_on !== row.is_water_on;
        state.blockWaterStatus[block] = row;
        state.pending.delete(block);
    }
    return membership;
}

async function sendPhWaterCommand(state,prior,command,rpc,input) {
    state.error = '';
    for (const [block,row] of prior) {
        state.pending.add(block);
        state.blockWaterStatus[block] = optimisticPhWaterRow(row,{...command,today:state.today});
    }
    publishPhWaterChange(state,Object.hasOwn(command,'on'));
    try {
        const receipt = await requestPhPlaceReceipt(rpc,input);
        if (currentPhWaterState() !== state) return false;
        const rows = phWaterCommandRows(receipt,prior,command);
        const revision = phWaterRevision(receipt);
        if (revision >= state.revision) state.hiddenCounts = receipt.wet_hidden || {};
        state.revision = Math.max(state.revision,revision);
        publishPhWaterChange(state,settlePhWaterRows(state,rows),Object.hasOwn(command,'on'));
        return true;
    } catch (error) {
        if (currentPhWaterState() !== state) return false;
        state.error = error.message || 'Water change was not confirmed.';
        state.fetchedAt = 0;
        publishPhWaterChange(state,settlePhWaterRows(state,prior),true);
        return false;
    }
}

/**
 * @param {object} command
 * @returns {Promise} Sends a single block request and reconciles its receipt.
 */
function submitPhWaterCommand(command) {
    const state = currentPhWaterState();
    const block = parseCanonicalBlockKey(command.location)?.block_code;
    const row = state?.blockWaterStatus[block];
    if (!state?.canEdit || state.pending.has(block) || !row) return Promise.resolve(false);
    const toggle = Object.hasOwn(command,'on');
    const input = toggle ? {p_water_on:command.on,p_expected_at:row.updated_at}
        : {p_schedule_date:command.date,p_requested_minutes:command.minutes,p_note:command.note};
    return sendPhWaterCommand(state,new Map([[block,row]]),command,toggle ? PH_WATER_TOGGLE : PH_WATER_REQUEST,
        {...input,p_locationcode:block});
}

/**
 * @param {Array} blocks
 * @param {boolean} on
 * @returns {Promise} Sends the selected blocks and reconciles their receipts.
 */
function submitPhWaterBatch(blocks,on) {
    const state = currentPhWaterState();
    if (!state?.canEdit || !blocks.length || blocks.some(block=>state.pending.has(block))) return Promise.resolve(false);
    if (blocks.length===1) return submitPhWaterCommand({location:blocks[0],on});
    const prior = new Map(blocks.map(block=>[block,state.blockWaterStatus[block]]));
    const changes = [...prior].map(([block,row])=>({block_code:block,is_water_on:on,expected_at:row.updated_at}));
    return sendPhWaterCommand(state,prior,{on},PH_WATER_BATCH,{p_changes:changes});
}
