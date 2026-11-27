function phAssignedBuggyMetricPills(load) {
    if (!load) return '';
    return phBuggyMetricPills(load).replace('⛽ '+load.fuelGal.toFixed(3)+' gal','⛽ '+load.fuelGal.toFixed(2)+' gal');
}

function phShippingScopedReceipt(receipt,username,manager) {
    const routes = receipt.load_routes || {};
    const mine = receipt.buggy?.buggy_id;
    const ownRoute = routes[mine];
    const member = [ownRoute?.puller_primary,ownRoute?.puller_helper].includes(username);
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

function phShippingLoad(receipt,id,rows,unloads) {
    const route = receipt.load_routes?.[id] || {};
    const manifest = route.load_manifest || receipt.rows.filter(row=>row.buggy_id === id);
    const water = typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    const hidden = new Set(receipt.rows.filter(row=>row.buggy_id===id && water && phShippingTagPaused(row,water)).map(row=>row.pull_tag_id));
    const visibleManifest = hidden.size ? manifest.filter(row=>!hidden.has(row.pull_tag_id)) : manifest;
    const estimate = phEstimateBuggyLoad(visibleManifest,{origin:route.load_origin,hasPartner:route.has_partner ?? Boolean(receipt.partner)});
    const stops = estimate?.rows || phSortPullStops(visibleManifest);
    const positions = new Map(stops.map((r,i)=>[r.pull_tag_id,i+1]));
    const dropRank = r => unloads.get(JSON.stringify([r.dock,r.stopnumber])) ?? Number.MAX_SAFE_INTEGER;
    const sorted = [...rows].sort((a,b)=>dropRank(a)-dropRank(b) || positions.get(a.pull_tag_id)-positions.get(b.pull_tag_id));
    return {id,route,manifest:visibleManifest,estimate,positions,rows:sorted};
}

function phShippingLoads(receipt,rows) {
    if (receipt?.warehouse !== '10-PH') return [];
    const unloads = new Map(orderPullUnloadStops(receipt).map((s,i)=>[JSON.stringify([s.dock,s.stopnumber]),i]));
    const groups = phShippingGroupEntries(rows);
    return [...groups].map(([id,items])=>phShippingLoad(receipt,id,items,id === receipt.buggy?.buggy_id ? unloads : new Map()))
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
function phWorkDryRows(state) {
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
