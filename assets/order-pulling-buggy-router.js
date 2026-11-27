const phLocationOrder = new Intl.Collator(undefined,{numeric:true});
const phRoutingNodes = new Map();
const phCorridorRadius = new Map();
const phMainRoads = ['AB','CD','E','FG','HI','JKL'];
for (const [code,orientation,permanent_shade,house_count,x_m,y_m,corridor_id,spine_group,sweep] of PH_NURSERY_BLOCKS) {
    const mainRoad = phMainRoads.find(road => road.includes(code[0]));
    const blockNumber = Number(code.slice(2));
    phRoutingNodes.set(code,Object.freeze({code,orientation,permanent_shade,house_count,x_m,y_m,corridor_id,spine_group,sweep,mainRoad,blockNumber}));
    phCorridorRadius.set(mainRoad,Math.max(phCorridorRadius.get(mainRoad) || 0,Math.abs(x_m)+Math.abs(y_m)));
}
for (const [code,landmark] of Object.entries(PH_YARD_LANDMARKS)) {
    phRoutingNodes.set(code,Object.freeze({code,...landmark}));
}

/**
 * @param {unknown} location Park Hill location or landmark alias.
 * @returns {object|null} Registered route node for a recognized place.
 */
function phRouteNode(location) {
    const key = String(location ?? '').trim().toUpperCase();
    if (phRoutingNodes.has(key)) return phRoutingNodes.get(key);
    if (/^PROP[ _-]OFFICE$/.test(key)) return phRoutingNodes.get('PROP_OFFICE');
    if (/^(?:PROP(?:AGATION)?(?:\b|[.])|P[.])/.test(key)) return phRoutingNodes.get('PROPAGATION');
    const block = parseCanonicalBlockKey(key,'route');
    return block ? phRoutingNodes.get(block.block_code) ?? null : null;
}

/**
 * @param {unknown} dock Dock number or label.
 * @returns {number|null} Physical dock number within the Park Hill range.
 */
function phDockNumber(dock) {
    return Number(normalizeDockKey(dock,true)) || null;
}

/**
 * @param {unknown} dock ERP dock number or label.
 * @returns {string} Shipping yard zone used by route planning.
 */
function phDockZone(dock) {
    const number = phDockNumber(dock);
    if (number && number <= 12) return 'DOCK_1_12';
    return number >= 50 ? 'DOCK_50_56' : 'DOCK_13_49';
}

/**
 * @param {unknown} previous Dock or zone from the last load.
 * @returns {object} Origin node for the next buggy route.
 */
function phRouteOrigin(previous) {
    if (PH_YARD_LANDMARKS[previous]?.dock_min) return phRouteNode(previous);
    return phRouteNode(phDockNumber(previous) ? phDockZone(previous) : 'TAG_HUT');
}

/**
 * @param {object} from Starting route node.
 * @param {object} to Ending route node.
 * @returns {number} Grid travel distance in meters.
 */
function phRoadMeters(from,to) {
    return Math.abs(from.x_m-to.x_m)+Math.abs(from.y_m-to.y_m);
}

/** @param {object} a First node. @param {string} zoneA Dock zone. @param {object} b Other node. @param {string} zoneB Dock zone. @returns {boolean} Whether a remainder can pick this neighboring stop. */
function phAdjacentShippingStop(a,zoneA,b,zoneB) {
    return Boolean(a?.mainRoad && a.mainRoad === b?.mainRoad && zoneA === zoneB && Math.abs(a.blockNumber-b.blockNumber)<=1);
}

function phBlockOrder(left,right) {
    return (phCorridorRadius.get(right.mainRoad) || 0)-(phCorridorRadius.get(left.mainRoad) || 0)
        || String(left.mainRoad ?? left.code).localeCompare(String(right.mainRoad ?? right.code))
        || right.blockNumber-left.blockNumber || left.code.localeCompare(right.code);
}

function phBayOrder(row) {
    const location = String(row.locationcode ?? '').trim();
    const canonicalBay = phQrBayNumber(location,row.bay_number);
    if (canonicalBay) return Number(canonicalBay);
    const aliasBay = !row.bay_number && /^[a-l][.]?\d{1,2}[.](\d{1,3})$/i.exec(location);
    return aliasBay ? Number(aliasBay[1]) : -1;
}

function phTagsAtBlock(a,b) {
    const bay = phBayOrder(a);
    const sameBayDrop = bay < 0 ? 0 : phLocationOrder.compare(String(b.stopnumber ?? ''),String(a.stopnumber ?? ''));
    return bay-phBayOrder(b) || sameBayDrop || String(a.pull_tag_id).localeCompare(String(b.pull_tag_id));
}

function phBlocksAndTags(rows) {
    const blocks = new Map();
    const unknown = [];
    for (const row of rows) {
        const node = phRouteNode(row.locationcode);
        if (!node) { unknown.push(row); continue; }
        if (!blocks.has(node)) blocks.set(node,[]);
        blocks.get(node).push(row);
    }
    return {blocks,unknown};
}

function phPolishBand(stops,start,end,origin,zones) {
    const first = stops[start];
    const last = stops[end];
    const previous = stops[start-1] || origin;
    const next = stops[end+1];
    const exitMeters = node => next ? phRoadMeters(node,next) : phDockReturn(node,zones).meters;
    const before = phRoadMeters(previous,first)+exitMeters(last);
    const after = phRoadMeters(previous,last)+exitMeters(first);
    if (after < before) stops.splice(start,end-start+1,...stops.slice(start,end+1).reverse());
}

function phPolishCorridorRoute(stops,origin,zones) {
    for (let start=0;start<stops.length;) {
        const node = stops[start];
        let end = start;
        while (node.mainRoad && stops[end+1]?.mainRoad === node.mainRoad && stops[end+1].blockNumber === node.blockNumber) end++;
        if (end>start) phPolishBand(stops,start,end,origin,zones);
        start = end+1;
    }
}

/**
 * @param {Array<object>} rows Park Hill pull tags to route.
 * @param {string} [origin] Departure dock for constrained two-opt.
 * @returns {Array<object>} Each numbered band once, adjacent road twins together.
 */
function phSortPullStops(rows,origin = rows[0]?.load_origin) {
    if (rows.some(row => row.warehouse && row.warehouse !== '10-PH')) return [...rows];
    const {blocks,unknown} = phBlocksAndTags(rows);
    const stops = [...blocks.keys()].sort(phBlockOrder);
    const zones = new Set(rows.map(row => phDockZone(row.dock)));
    phPolishCorridorRoute(stops,phRouteOrigin(origin),zones);
    return stops.flatMap(node => blocks.get(node).sort(phTagsAtBlock)).concat(unknown);
}

function phDockOrders(zones) {
    if (zones.length <= 1) return [zones];
    return zones.flatMap(zone => phDockOrders(zones.filter(other => other !== zone)).map(rest => [zone,...rest]));
}

/**
 * @param {object} last Last field node.
 * @param {Iterable<string>} zones Required dock zones.
 * @returns {object} Shortest return order and distance.
 */
function phDockReturn(last,zones) {
    let best;
    for (const order of phDockOrders([...zones].sort())) {
        let from = last;
        let meters = 0;
        for (const zone of order) {
            const next = phRouteNode(zone);
            meters += phRoadMeters(from,next);
            from = next;
        }
        if (!best || meters < best.meters) best = {order,meters};
    }
    return best;
}

const PH_PULL_CAP = 650;
const PH_PULL_SUPERVISORS = new Set(['super-admin','admin','shipping-supervisor','supervisor','manager']);

/**
 * @param {object} profile
 * @param {string} farm
 * @param {boolean} preview
 * @returns {boolean} Whether the selected farm permits supervision from this profile.
 */
function phPullSupervisorAllowed(profile, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at || profile.must_change_password) return false;
    const farms = profile.allowed_warehouses ?? profile.allowed_farms ?? profile.farm_scopes;
    return (!Array.isArray(farms) || farms.includes(farm))
        && (profile.username === 'dylan_collyge' || PH_PULL_SUPERVISORS.has(profile.role));
}

/**
 * @param {object} snapshot
 * @param {string} editingId
 * @param {string} [primary]
 * @returns {object} Available units, primary pullers and helpers.
 */
function phPullTeamChoices(snapshot, editingId, primary = '') {
    const occupied = snapshot.teams.filter(team => team.team_id !== editingId);
    const units = new Set(occupied.map(team => team.unit_number));
    const people = new Set(occupied.flatMap(team => [team.puller_primary,team.puller_helper]));
    const pullers = snapshot.pullers.filter(puller => !people.has(puller));
    return {
        units:snapshot.units.filter(unit => !units.has(unit)),
        primary:pullers,
        helper:pullers.filter(puller => puller !== primary)
    };
}

/**
 * @param {object} row
 * @returns {number} Tag WDU expressed in integer trillionths.
 */
function phPullTagWdu(row) {
    return Math.round(Number(row.wingdingunits)*1e12);
}

/**
 * @param {Array<object>} rows
 * @param {Set} selected
 * @returns {number} Total WDU trillionths for selected tag IDs.
 */
function phPullSelectedWdu(rows, selected) {
    return rows.reduce((total,row) => total+(selected.has(row.pull_tag_id) ? phPullTagWdu(row) : 0),0);
}

/**
 * @param {Array<object>} rows
 * @param {Set} selected
 * @param {unknown} id
 * @returns {boolean} Whether the selection changed within the load limit.
 */
function phPullToggleTag(rows, selected, id) {
    if (selected.delete(id)) return true;
    const row = rows.find(candidate => candidate.pull_tag_id === id);
    const wdu = row && phPullTagWdu(row);
    if (!(wdu>0) || row.shuttle_ready === false || row.warehouse && row.warehouse !== '10-PH') return false;
    const heavy = selected.size === 0 && Number(row.pull_qty) === 1;
    if (!heavy && phPullSelectedWdu(rows,selected)+wdu>PH_PULL_CAP*1e12) return false;
    const batch = rows.filter(candidate=>candidate===row || selected.has(candidate.pull_tag_id));
    if (!phShuttleSelectionFits(batch)) return false;
    selected.add(id);
    return true;
}

function phShuttleSelectionFits(batch) {
    if (batch.length===1) return true;
    const shuttles = batch.filter(row=>row.trip_total>1);
    if (shuttles.length===0) return true;
    const anchor = shuttles[0];
    if (shuttles.length>1 || anchor.trip_index!==anchor.trip_total) return false;
    const node = phRouteNode(anchor.locationcode);
    const zone = phDockZone(anchor.dock);
    return batch.every(row=>row===anchor || phAdjacentShippingStop(node,zone,phRouteNode(row.locationcode),phDockZone(row.dock)));
}

const phPullPriorityLabels = new Map(['Live Driver','Drop Trailer','Hold Trailer'].map(label => [label.toUpperCase(),label]));

/**
 * @param {unknown} value
 * @returns {string} Standard dock priority label when recognized.
 */
function phPullDockLabel(value) {
    const status = String(value ?? '').trim();
    return phPullPriorityLabels.get(status.toUpperCase()) ?? status;
}

/**
 * @param {object} row
 * @returns {number} Dispatch priority of the current physical tag.
 */
function phPullQueueRank(row) {
    if (row.shuttle_ready === false) return 5;
    if (phPullDockLabel(row.dock_status) === 'Live Driver') return 0;
    const priority = Number(row.priority ?? 3);
    return Number.isFinite(priority) ? priority : 3;
}

/**
 * @param {Array<object>} rows
 * @returns {Set} Tag IDs fitting one priority-ordered load.
 */
function phPullGroupBatch(rows) {
    const chosen = new Set();
    let available = PH_PULL_CAP*1e12;
    for (const row of [...rows].sort((a,b) => phPullQueueRank(a)-phPullQueueRank(b))) {
        if (phPullQueueRank(row) >= 5 || chosen.has(row.pull_tag_id)) continue;
        const wdu = phPullTagWdu(row);
        if (!(wdu>0) || wdu>available) continue;
        chosen.add(row.pull_tag_id);
        available -= wdu;
        if (!available) break;
    }
    return chosen;
}

/**
 * @param {unknown} value Puller handle or name.
 * @returns {string} The normalized handle used for team membership.
 */
function normalizePullerId(value) {
    return String(value || '').trim().toLowerCase().replace(/^@+/, '').replace(/[\s-]+/g, '_');
}

/**
 * @param {object|null} profile Effective profile by default.
 * @returns {boolean} Whether the profile is a dedicated Park Hill puller.
 */
function isParkHillOrderPuller(profile = effectivePhShippingProfile()) {
    return Boolean(profile && !profile.disabled_at && profile.active !== false && !profile.must_change_password
        && (profile.role === 'order_puller' || /^puller_(00[1-9]|0[1-5][0-9]|060)$/.test(normalizePullerId(profile.username))));
}

/**
 * @returns {object|null} The exact View As profile or authenticated profile.
 */
function effectivePhShippingProfile() {
    return (typeof borrowedHelpPreview === 'function' && borrowedHelpPreview())
        || (typeof nativeAuthProfile === 'undefined' ? null : nativeAuthProfile);
}

/** @param {object} profile @param {object} access @param {string} farm @param {object|null} preview @returns {boolean} Whether the native actor can open Shipping. */
function orderPullEligible(profile, access, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at || profile.must_change_password) return false;
    const farms = profile.allowed_warehouses ?? profile.allowed_farms ?? profile.farm_scopes;
    if (Array.isArray(farms) && !farms.includes(farm)) return false;
    if (access?.view_shipping != null) return ['FULL_EDIT','VIEW_ONLY'].includes(access.view_shipping);
    if (isParkHillOrderPuller(profile)) return true;
    const role = String(profile.role || '').toLowerCase().replace(/[-_\s]/g,'');
    if (['rep','salesrep'].includes(role)) return false;
    return !profile.must_change_password && (access?.que_order_pulling === 'Y' || profile.department === '161'
        || phPullSupervisorAllowed(profile,farm,preview));
}

/** @param {object} receipt @param {string} mode @param {string} query @param {boolean} honorWater @returns {object[]} The visible tags for the current route query. */
function orderPullRows(receipt, mode, query, honorWater = true) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/);
    const water = honorWater && typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    return (receipt?.rows || []).filter(row => {
        if (water && phShippingTagPaused(row,water)) return false;
        if (mode === 'buggy' && (!receipt.buggy || row.buggy_id !== receipt.buggy.buggy_id)) return false;
        const search = [row.common_name,row.itemcode,row.container_size,row.locationcode,row.lotcode,row.dock,
            row.stopnumber,row.tripnumber,row.dock_status,row.consignee].join(' ').toLowerCase();
        return terms.every(term => search.includes(term));
    });
}

/** @param {object} receipt @returns {object[]} Exact loaded dock and stop groups in unload order. */
function orderPullUnloadStops(receipt) {
    if (receipt?.buggy?.status !== 'ready_to_unload') return [];
    const stops = new Map();
    for (const row of orderPullRows(receipt,'buggy','',false)) {
        if (row.pull_status !== 'on_buggy') continue;
        const key = JSON.stringify([row.dock,row.stopnumber]);
        stops.set(key,{dock:row.dock,stopnumber:row.stopnumber,buggy_id:receipt.buggy.buggy_id});
    }
    return [...stops.values()].sort(compareOrderPullStops);
}

function compareOrderPullStops(a,b) {
    if (a.dock !== b.dock) return a.dock.localeCompare(b.dock,undefined,{numeric:true});
    const number = stop => /^\d{1,9}(\.\d{1,12})?$/.test(stop) ? Number(stop) : -1;
    const byNumber = number(b.stopnumber)-number(a.stopnumber);
    if (byNumber) return byNumber;
    return a.stopnumber === b.stopnumber ? 0 : a.stopnumber < b.stopnumber ? 1 : -1;
}
