const phRoutingNodes = new Map();
const phCorridorRadius = new Map();
for (const [code,orientation,permanent_shade,house_count,x_m,y_m,corridor_id,spine_group,sweep] of PH_NURSERY_BLOCKS) {
    phRoutingNodes.set(code,Object.freeze({code,orientation,permanent_shade,house_count,x_m,y_m,corridor_id,spine_group,sweep}));
    phCorridorRadius.set(corridor_id,Math.max(phCorridorRadius.get(corridor_id) || 0,Math.abs(x_m)+Math.abs(y_m)));
}
for (const [code,landmark] of Object.entries(PH_YARD_LANDMARKS)) {
    phRoutingNodes.set(code,Object.freeze({code,...landmark}));
}

function phRouteNode(location) {
    const key = String(location ?? '').trim().toUpperCase();
    if (phRoutingNodes.has(key)) return phRoutingNodes.get(key);
    if (/^PROP[ _-]OFFICE$/.test(key)) return phRoutingNodes.get('PROP_OFFICE');
    if (/^(?:PROP(?:AGATION)?(?:\b|[.])|P[.])/.test(key)) return phRoutingNodes.get('PROPAGATION');
    const forward = /^([A-L])[.]?(\d{1,2})(?:[.]\d{1,3})?$/.exec(key);
    const reverse = /^(\d{1,2})([A-L])$/.exec(key);
    const block = forward ? [forward[1],forward[2]] : reverse && [reverse[2],reverse[1]];
    return block ? phRoutingNodes.get(block[0]+'.'+block[1].padStart(2,'0')) ?? null : null;
}

function phDockNumber(dock) {
    const match = /^(?:DOCK\s*)?0*(\d{1,2})$/i.exec(String(dock ?? '').trim());
    const number = Number(match?.[1]);
    return number >= 1 && number <= 56 ? number : null;
}

function phDockZone(dock) {
    const number = phDockNumber(dock);
    if (number && number <= 12) return 'DOCK_1_12';
    return number >= 50 ? 'DOCK_50_56' : 'DOCK_13_49';
}

function phRouteOrigin(previous) {
    if (PH_YARD_LANDMARKS[previous]?.dock_min) return phRouteNode(previous);
    return phRouteNode(phDockNumber(previous) ? phDockZone(previous) : 'TAG_HUT');
}

function phRoadMeters(from,to) {
    return Math.abs(from.x_m-to.x_m)+Math.abs(from.y_m-to.y_m);
}

function phComparePullStops(a,b) {
    const left = phRouteNode(a.locationcode);
    const right = phRouteNode(b.locationcode);
    if (!left || !right) return Number(Boolean(right))-Number(Boolean(left));
    return (phCorridorRadius.get(right.corridor_id) || 0)-(phCorridorRadius.get(left.corridor_id) || 0)
        || String(left.corridor_id ?? '').localeCompare(String(right.corridor_id ?? ''))
        || (left.sweep ?? 0)-(right.sweep ?? 0) || left.code.localeCompare(right.code)
        || String(a.locationcode).localeCompare(String(b.locationcode),undefined,{numeric:true})
        || String(a.pull_tag_id).localeCompare(String(b.pull_tag_id));
}

function phSortPullStops(rows) {
    return [...rows].sort(phComparePullStops);
}

function phDockOrders(zones) {
    if (zones.length <= 1) return [zones];
    return zones.flatMap(zone => phDockOrders(zones.filter(other => other !== zone)).map(rest => [zone,...rest]));
}

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

function phPullSupervisorAllowed(profile, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at || profile.must_change_password) return false;
    const farms = profile.allowed_warehouses ?? profile.allowed_farms ?? profile.farm_scopes;
    return (!Array.isArray(farms) || farms.includes(farm))
        && (profile.username === 'dylan_collyge' || PH_PULL_SUPERVISORS.has(profile.role));
}

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

function phPullTagWdu(row) {
    return Math.round(Number(row.wingdingunits)*1e12);
}

function phPullSelectedWdu(rows, selected) {
    return rows.reduce((total,row) => total+(selected.has(row.pull_tag_id) ? phPullTagWdu(row) : 0),0);
}

function phPullToggleTag(rows, selected, id) {
    if (selected.delete(id)) return true;
    const row = rows.find(candidate => candidate.pull_tag_id === id);
    const wdu = row && phPullTagWdu(row);
    if (!(wdu>0) || phPullSelectedWdu(rows,selected)+wdu>PH_PULL_CAP*1e12) return false;
    selected.add(id);
    return true;
}

const phPullPriorityLabels = new Map(['Live Driver','Drop Trailer','Hold Trailer'].map(label => [label.toUpperCase(),label]));

function phPullDockLabel(value) {
    const status = String(value ?? '').trim();
    return phPullPriorityLabels.get(status.toUpperCase()) ?? status;
}

function phPullQueueRank(row) {
    if (phPullDockLabel(row.dock_status) === 'Live Driver') return 0;
    const priority = Number(row.priority ?? 3);
    return Number.isFinite(priority) ? priority : 3;
}

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

function isParkHillOrderPuller(profile = typeof nativeAuthProfile === 'undefined' ? null : nativeAuthProfile) {
    return profile?.role === 'order_puller' && !profile.disabled_at && !profile.must_change_password;
}

function orderPullEligible(profile, access, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at || profile.must_change_password) return false;
    const farms = profile.allowed_warehouses ?? profile.allowed_farms ?? profile.farm_scopes;
    if (Array.isArray(farms) && !farms.includes(farm)) return false;
    if (access?.view_shipping != null) return ['FULL_EDIT','VIEW_ONLY'].includes(access.view_shipping);
    if (profile.role === 'order_puller') return isParkHillOrderPuller(profile);
    const role = String(profile.role || '').toLowerCase().replace(/[-_\s]/g,'');
    if (['rep','salesrep'].includes(role)) return false;
    return !profile.must_change_password && (access?.que_order_pulling === 'Y' || profile.department === '161'
        || phPullSupervisorAllowed(profile,farm,preview));
}

function orderPullRows(receipt, mode, query, honorWater = true) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/);
    const water = honorWater && typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    return (receipt?.rows || []).filter(row => {
        if (water && isTagHiddenByActiveWater(row,water)) return false;
        if (mode === 'buggy' && (!receipt.buggy || row.buggy_id !== receipt.buggy.buggy_id)) return false;
        const search = [row.common_name,row.itemcode,row.container_size,row.locationcode,row.lotcode,row.dock,
            row.stopnumber,row.tripnumber,row.dock_status,row.consignee].join(' ').toLowerCase();
        return terms.every(term => search.includes(term));
    });
}

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
