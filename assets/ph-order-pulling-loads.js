function phSelectNativeSlot(state,visible) {
    const chosen = state.root.querySelector('[data-ph-dispatch-team]').value;
    const [plan] = phScheduledDispatchPlans(state.snapshot,visible,chosen || null,true);
    state.selected = new Set(plan?.load.rows.map(row=>row.pull_tag_id));
    state.status.textContent = plan ? '' : 'No complete eligible load matches this selection.';
    paintPhWorkRows(state,visible);
}

async function phAssignNativeSlots(state,visible) {
    const plans = phScheduledDispatchPlans(state.snapshot,visible);
    if (!plans.length) {
        state.status.textContent = 'No ready teams and complete eligible loads match this selection.';
        return;
    }
    const current = ()=>phWorkScopeIsCurrent(state);
    state.status.textContent = 'Assigning ready teams…';
    state.pending = dispatchPhReadyTeams(plans,current,receipt=>phAcceptWorkSnapshot(state,receipt),()=>state.dockRevision);
    paintPhWorkState(state,phWorkVisibleRows(state));
    try {
        const count = await state.pending;
        if (current()) state.status.textContent = count+' buggy load'+(count===1 ? '' : 's')+' assigned.';
    } catch (error) {
        if (current()) state.status.textContent = error.message;
    } finally {
        state.pending = null;
        if (current()) {
            paintPhWorkLoadPanel(state);
            paintPhWorkState(state,phWorkVisibleRows(state));
            if (state.refreshAfterCommand) {
                state.refreshAfterCommand = false;
                refreshPhWorkAfterDockCommit(state);
            }
        }
    }
}

function phNativeSlotClick(state,action) {
    if (state.pending || !phWorkScopeIsCurrent(state)) return;
    const visible = phWorkVisibleRows(state);
    if (action==='auto') phSelectNativeSlot(state,visible);
    else void phAssignNativeSlots(state,visible);
}

/** @param {object} state Mounted Park Hill work screen. @returns {void} Connect native slot commands when the receipt supplies them. */
function phSyncNativeSlotControls(state) {
    if (!Array.isArray(state.snapshot.queued_loads)) return;
    const native = state.snapshot.rows.some(row=>Object.hasOwn(row,'dispatch_slot'));
    for (const action of ['auto','auto-dispatch']) {
        const selector = '[data-ph-slot-action="'+action+'"]';
        const control = state.root.querySelector(selector) || state.root.querySelector('[data-ph-action="'+action+'"]');
        if (!control || !native && !control.hasAttribute('data-ph-slot-action')) continue;
        if (!control.hasAttribute('data-ph-slot-action')) {
            control.removeAttribute('data-ph-action');
            control.dataset.phSlotAction = action;
            control.onclick = ()=>phNativeSlotClick(state,action);
        }
        control.disabled = Boolean(state.pending);
    }
}

/**
 * @param {object} receipt Current farm pull receipt.
 * @param {string} username Signed-in operator.
 * @param {boolean} manager Whether all teams are visible.
 * @returns {object} Routes and rows visible to this operator.
 */
function phShippingScopedReceipt(receipt,username,manager) {
    const routes = receipt.load_routes || {};
    const mine = receipt.buggy?.buggy_id;
    const ownRoute = routes[mine];
    const handle = normalizePullerId(username);
    const crew = [ownRoute?.lead_puller ?? ownRoute?.puller_primary,ownRoute?.partner_puller ?? ownRoute?.puller_helper];
    const member = Boolean(handle && crew.some(value=>normalizePullerId(value) === handle));
    const allowed = id => Boolean(id && routes[id] && (manager || id === mine && member));
    const load_routes = Object.fromEntries(Object.entries(routes).filter(([id])=>allowed(id)));
    const rows = receipt.rows.filter(row=>(!row.warehouse || row.warehouse === '10-PH') && allowed(row.buggy_id));
    return {...receipt,rows,load_routes,buggy:allowed(mine) ? receipt.buggy : null};
}

function phShippingGroupEntries(rows) {
    const result = new Map();
    for (const row of rows) {
        if (!row.buggy_id) continue;
        if (!result.has(row.buggy_id)) result.set(row.buggy_id,[]);
        result.get(row.buggy_id).push(row);
    }
    return result;
}

function phShippingSeries(runs,options) {
    if (!runs?.length) return null;
    const estimates = runs.map(run=>phEstimateShippingTrips(run.rows,{...options,origin:run.origin}));
    if (estimates.some(estimate=>!estimate)) return null;
    const sum = field=>estimates.reduce((total,estimate)=>total+estimate[field],0);
    return {fuelGal:sum('fuelGal'),getLoadMin:sum('getLoadMin'),unloadMin:sum('unloadMin'),trips:runs.length};
}

function phShippingLoad(receipt,id,rows) {
    const route = receipt.load_routes?.[id] || {};
    const manifest = route.load_manifest || receipt.rows.filter(row=>row.buggy_id === id);
    const water = typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    const hidden = new Set(receipt.rows.filter(row=>row.buggy_id===id && water && phShippingTagPaused(row,water)).map(row=>row.pull_tag_id));
    const visibleManifest = hidden.size ? manifest.filter(row=>!hidden.has(row.pull_tag_id)) : manifest;
    const options = {origin:route.load_origin,hasPartner:route.has_partner ?? Boolean(receipt.partner)};
    const estimate = phEstimateShippingTrips(visibleManifest,options);
    const stops = estimate?.rows || phSortPullStops(visibleManifest);
    const positions = new Map(stops.map((r,i)=>[r.pull_tag_id,i+1]));
    const sorted = [...rows].sort((a,b)=>positions.get(a.pull_tag_id)-positions.get(b.pull_tag_id));
    return {id,route,manifest:visibleManifest,estimate,series:phShippingSeries(route.shuttle_runs,options),positions,rows:sorted};
}

/**
 * @param {object} receipt Park Hill dispatch receipt.
 * @param {object[]} rows Visible pull tags.
 * @returns {object[]} Assigned loads in unit order.
 */
function phShippingLoads(receipt,rows) {
    if (receipt?.warehouse !== '10-PH') return [];
    const groups = phShippingGroupEntries(rows);
    return [...groups].map(([id,items])=>phShippingLoad(receipt,id,items))
        .sort((a,b)=>Number(a.route.unit_number)-Number(b.route.unit_number));
}

function decoratePhShippingStop(card,entry,state,activeScan) {
    if (!card || card.dataset.orderPullTag !== entry.row.pull_tag_id) return;
    const head = card.querySelector('header') || card;
    const label = document.createElement('strong');
    label.className = 'ph-pull-stop';
    label.textContent = 'STOP '+entry.stop+' OF '+entry.total;
    const side = phPullSideLabel(entry.row);
    if (side) label.textContent += ' · Pull Side: '+side;
    (head.firstElementChild || head).prepend(label);
    const water = typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    if (water && phWaterTagDisposition(entry.row,water) === 'override') head.insertAdjacentHTML('beforeend',phWetTagBadgeHtml());
    paintPhQrScanStop(card,entry.row,state,activeScan);
}

/**
 * @param {object} load Ordered load manifest.
 * @param {object[]} rows Tags in the visible window.
 * @param {Function} mount Existing window renderer.
 * @param {object} state Current dispatch view.
 * @returns {object} Visible stop entries and their mount callback.
 */
function phPullLoadWindow(load,rows,mount,state) {
    const entries = rows.map(row=>({row,stop:load.positions.get(row.pull_tag_id),total:load.manifest.length}));
    const activeScan = state.teamOnly && activePhQrSession(state.receipt,load.id);
    return {rows:entries,mount(section,items) {
        mount(section,items.map(entry=>entry.row));
        const cards = section.querySelectorAll('[data-order-pull-tag]');
        items.forEach((entry,index)=>decoratePhShippingStop(cards[index],entry,state,activeScan));
    }};
}

let stopPhWorkWater;
/**
 * @param {object} state Current dispatch view.
 * @returns {object[]} Tags eligible for loading under current water status.
 */
function phWorkDryRows(state) {
    phSyncNativeSlotControls(state);
    const water = currentPhWaterState();
    const rows = state.snapshot.rows.filter(row => !isTagHiddenByActiveWater(row,water));
    const paused = state.root.querySelector('[data-ph-wet-paused]');
    const count = state.snapshot.rows.length-rows.length;
    if (paused) {
        paused.hidden = !count;
        paused.textContent = '💧 Wet-Block Paused: '+count;
    }
    return rows;
}

/**
 * @param {object} state Mounted dispatch view.
 * @returns {void}
 */
function watchPhWorkWater(state) {
    stopPhWorkWater?.();
    const mounted = new WeakRef(state);
    stopPhWorkWater = observePhWaterUpdates(() => {
        const current = mounted.deref();
        if (!current?.root.isConnected) return stopPhWorkWater();
        if (!phWorkScopeIsCurrent(current)) return;
        const allowed = new Set(phWorkDryRows(current).map(row => row.pull_tag_id));
        current.selected = new Set([...current.selected].filter(tag => allowed.has(tag)));
        paintPhWorkRows(current,phWorkVisibleRows(current));
        paintPhWorkSelection(current);
    });
    syncPhWaterRefresh();
}
