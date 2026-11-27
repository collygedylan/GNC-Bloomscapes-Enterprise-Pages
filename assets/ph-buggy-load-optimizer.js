function phRoundMetric(value,precision) {
    return Number(value.toFixed(precision));
}

function phRouteLegs(rows,origin) {
    const blocks = new Set();
    const zones = new Set();
    const dockStops = new Set();
    let current = phRouteOrigin(origin);
    let d_out_m = 0;
    for (const row of rows) {
        const stop = phRouteNode(row.locationcode);
        if (!stop) return null;
        d_out_m += phRoadMeters(current,stop);
        current = stop;
        blocks.add(stop.code);
        const zone = phDockZone(row.dock);
        const dockStop = String(row.stopnumber ?? '').trim();
        const normalizedStop = /^\d+$/.test(dockStop) ? String(Number(dockStop)) : dockStop;
        dockStops.add(JSON.stringify([phDockNumber(row.dock) ?? zone,normalizedStop]));
        zones.add(zone);
    }
    const {order,meters} = phDockReturn(current,zones);
    return {d_out_m,d_ret_m:meters,uniqueBlocks:blocks.size,uniqueDockStops:dockStops.size,dockZones:order};
}

function phEstimateBuggyLoad(tags,{hasPartner = false,origin} = {}) {
    if (!tags.length || tags.some(row => row.warehouse && row.warehouse !== '10-PH')) return null;
    if (tags.some(row => !(phPullTagWdu(row) > 0))) return null;
    const rows = phSortPullStops(tags);
    const totalWdu = rows.reduce((sum,row) => sum+phPullTagWdu(row),0)/1e12;
    const route = phRouteLegs(rows,origin);
    if (!route || totalWdu > PH_PULL_CAP) return null;
    const {d_out_m,d_ret_m,uniqueBlocks,uniqueDockStops,dockZones} = route;
    const crewFactor = hasPartner ? 1 : 1.65;
    const handLoadMin = (0.65*rows.length+0.028*totalWdu)*crewFactor;
    const getLoadMin = phRoundMetric(d_out_m/230+d_ret_m/195+0.35*uniqueBlocks+handLoadMin,1);
    const unloadMin = phRoundMetric((1.5+0.85*uniqueDockStops+0.020*totalWdu+1.5*(dockZones.length-1))*crewFactor,1);
    const fuelGal = phRoundMetric(d_out_m/1609.344*0.085+d_ret_m/1609.344
        *(0.085+0.045*Math.min(1,totalWdu/PH_PULL_CAP))+0.004*uniqueBlocks+0.0042*(handLoadMin+unloadMin),3);
    const dockLabel = dockZones.map(zone => phRouteNode(zone).label.replace(/^Shipping /,'')).join(' → ');
    return {...route,rows,totalWdu,handLoadMin,crewFactor,getLoadMin,unloadMin,fuelGal,dockLabel,
        finalDockZone:dockZones.at(-1),miles:(d_out_m+d_ret_m)/1609.344,totalCycleMin:phRoundMetric(getLoadMin+unloadMin,1)};
}

function phHeavyTripEstimate(row,options) {
    const totalWdu = Number(row.wingdingunits);
    if (!Number.isFinite(totalWdu) || Number(row.pull_qty ?? row.trip_qty) !== 1) return null;
    const route = phEstimateBuggyLoad([{...row,wingdingunits:PH_PULL_CAP}],options);
    if (!route) return null;
    const extra = totalWdu-PH_PULL_CAP;
    const handLoadMin = route.handLoadMin+extra*0.028*route.crewFactor;
    const unloadMin = Number(((2.35+0.020*totalWdu)*route.crewFactor).toFixed(1));
    const getLoadMin = Number((route.d_out_m/230+route.d_ret_m/195+0.35+handLoadMin).toFixed(1));
    const fuelGal = Number((route.d_out_m/1609.344*0.085+route.d_ret_m/1609.344*0.130
        +0.004+0.0042*(handLoadMin+unloadMin)).toFixed(3));
    return {...route,rows:[row],totalWdu,handLoadMin,unloadMin,getLoadMin,fuelGal,
        totalCycleMin:Number((getLoadMin+unloadMin).toFixed(1))};
}

/**
 * @param {object[]} rows Physical UUID rows on the current dispatched trip.
 * @param {object} [options] Crew and departure dock for this trip.
 * @returns {object|null} Route and handling estimate for one actual round trip.
 */
function phEstimateShippingTrips(rows,options = {}) {
    if (rows.length === 1 && phPullTagWdu(rows[0]) > PH_PULL_CAP*1e12) {
        return phHeavyTripEstimate(rows[0],options);
    }
    if (!options.origin) return phEstimateBuggyLoad(rows,options);
    const originals = new Map(rows.map(row=>[{...row,load_origin:options.origin},row]));
    const route = phEstimateBuggyLoad([...originals.keys()],options);
    return route && {...route,rows:route.rows.map(row=>originals.get(row))};
}

function phCandidateTags(rows) {
    const candidates = new Map();
    for (const row of rows) {
        if (row.warehouse && row.warehouse !== '10-PH') continue;
        const urgency = phPullQueueRank(row);
        if (urgency >= 5 || row.manual_hold || row.buggy_id) continue;
        const node = phRouteNode(row.locationcode);
        const wdu = phPullTagWdu(row);
        if (!node || !row.pull_tag_id || !(wdu > 0 && wdu <= PH_PULL_CAP*1e12)) continue;
        candidates.set(row.pull_tag_id,{row,node,wdu,zone:phDockZone(row.dock),rank:urgency});
    }
    return [...candidates.values()];
}

function phSharedBlockPair(a,b) {
    const prefixes = a.code[0]+b.code[0];
    return ['GF','FG','IH','HI','BA','AB','KJ','JK'].includes(prefixes) && a.code.slice(1) === b.code.slice(1);
}

function phMarginalPickCost(seed,candidate) {
    const home = phRouteNode(seed.zone);
    const through = phRoadMeters(seed.node,candidate.node)+phRoadMeters(candidate.node,home);
    const detour = through-phRoadMeters(seed.node,home);
    const transfer = seed.zone === candidate.zone ? 0 : phRoadMeters(home,phRouteNode(candidate.zone))+195*1.5;
    const handling = seed.node === candidate.node ? 0 : 230*0.35;
    return detour+transfer+handling;
}

function phRankLoadChoices(seed,candidates) {
    const choices = candidates.map(item => ({
        item,cost:phMarginalPickCost(seed,item),sameBlock:item.node === seed.node,
        paired:phSharedBlockPair(seed.node,item.node),sameSpine:item.node.spine_group === seed.node.spine_group
    }));
    choices.sort((a,b) => a.item.rank-b.item.rank || Number(b.sameBlock)-Number(a.sameBlock)
        || Number(b.paired)-Number(a.paired) || Number(b.item.zone === seed.zone)-Number(a.item.zone === seed.zone)
        || a.cost-b.cost || Number(b.sameSpine)-Number(a.sameSpine) || b.item.wdu-a.item.wdu
        || String(a.item.row.pull_tag_id).localeCompare(String(b.item.row.pull_tag_id)));
    return choices.map(choice => choice.item);
}

function phSeedLoad(seed,pool) {
    const key = seed.node.code+'|'+seed.zone;
    if (!pool.ordered.has(key)) pool.ordered.set(key,phRankLoadChoices(seed,pool.items));
    const batch = [seed.row];
    let remaining = PH_PULL_CAP*1e12-seed.wdu;
    for (const item of pool.ordered.get(key)) {
        if (!remaining) break;
        if (item === seed || item.wdu > remaining || !pool.active.has(item)) continue;
        batch.push(item.row);
        remaining -= item.wdu;
    }
    return {batch,remaining};
}

function phLoadCandidatePool(rows) {
    const items = phCandidateTags(rows);
    return {items,active:new Set(items),ordered:new Map()};
}

function phPreferLoad(load,best) {
    if (!best || load.totalWdu !== best.totalWdu) return !best || load.totalWdu > best.totalWdu;
    return load.fuelGal < best.fuelGal || load.fuelGal === best.fuelGal && load.totalCycleMin < best.totalCycleMin;
}

function phPackCandidatePool(pool,options) {
    let priority = Infinity;
    for (const item of pool.active) priority = Math.min(priority,item.rank);
    const seenSeeds = new Set();
    const seenBatches = new Set();
    let best = null;
    for (const seed of pool.active) {
        if (seed.rank !== priority) continue;
        const seedKey = [seed.node.code,seed.zone,seed.row.dock,seed.row.stopnumber,seed.wdu].join('|');
        if (seenSeeds.has(seedKey)) continue;
        seenSeeds.add(seedKey);
        const {batch,remaining} = phSeedLoad(seed,pool);
        if (best && PH_PULL_CAP*1e12-remaining < Math.round(best.totalWdu*1e12)) continue;
        const key = JSON.stringify(batch.map(row => row.pull_tag_id).sort());
        if (seenBatches.has(key)) continue;
        seenBatches.add(key);
        const load = phEstimateBuggyLoad(batch,options);
        if (load && phPreferLoad(load,best)) best = load;
    }
    return best;
}

/**
 * @param {Array<object>} rows Available pull tags.
 * @param {object} [options] Crew and route origin used for estimates.
 * @returns {object|null} Highest ranked eligible load within 650 WDU.
 */
function phPackBuggyLoad(rows,options = {}) {
    return phPackCandidatePool(phLoadCandidatePool(rows),options);
}

function phReadyCrews(snapshot) {
    const ready = snapshot.teams.filter(team => team.active !== false && !team.batch_open);
    const choices = phPullTeamChoices(snapshot,'');
    const pullers = choices.primary.filter(name => /^puller_(?:00[1-9]|0[1-5]\d|060)$/.test(name));
    let index = 0;
    for (const unit of choices.units) {
        if (index >= pullers.length) break;
        if (!(Number(unit) >= 205 && Number(unit) <= 235)) continue;
        ready.push({unit_number:unit,puller_primary:pullers[index++],puller_helper:pullers[index++] || null});
    }
    return ready;
}

function phTeamWorkload(team) {
    let minutes = 0;
    let wdu = 0;
    for (const completed of team.completed_loads || []) {
        const load = phEstimateBuggyLoad(completed.rows,completed);
        if (!load) continue;
        minutes += load.totalCycleMin;
        wdu += load.totalWdu;
    }
    return {team,minutes,wdu};
}

function phNextTeamPlan(crews,pool) {
    const estimates = new Map();
    let best = null;
    for (const crew of crews) {
        const hasPartner = Boolean(crew.team.puller_helper);
        const origin = crew.team.previous_dock_zone;
        const key = JSON.stringify([origin ?? null,hasPartner]);
        if (!estimates.has(key)) estimates.set(key,phPackCandidatePool(pool,{origin,hasPartner}));
        const load = estimates.get(key);
        if (!load) continue;
        const minutes = crew.minutes+load.totalCycleMin;
        const wdu = crew.wdu+load.totalWdu;
        if (!best || minutes < best.minutes || minutes === best.minutes && wdu < best.wdu) {
            best = {crew,load,minutes,wdu};
        }
    }
    return best;
}

/**
 * @param {object} snapshot Farm, pull tags, teams, pullers and available units.
 * @returns {Array<object>} Ordered team assignments and estimated loads.
 */
function phPlanReadyTeams(snapshot) {
    if (snapshot.warehouse !== '10-PH') return [];
    const crews = new Set(phReadyCrews(snapshot).map(phTeamWorkload));
    const plan = [];
    const pool = phLoadCandidatePool(snapshot.rows);
    const byId = new Map(pool.items.map(item => [item.row.pull_tag_id,item]));
    while (crews.size && pool.active.size) {
        const next = phNextTeamPlan(crews,pool);
        if (!next) break;
        const {crew,load} = next;
        crews.delete(crew);
        plan.push({team:crew.team,load});
        for (const row of load.rows) pool.active.delete(byId.get(row.pull_tag_id));
    }
    return plan;
}
