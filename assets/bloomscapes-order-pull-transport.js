const phPullDockStatusEvents = new EventTarget();

/** @param {string} farm @param {string} identity @param {object|null} change @returns {void} Emits a scoped Park Hill dock update. */
function publishPhPullDockStatus(farm,identity,change = null) {
    if (farm === '10-PH') phPullDockStatusEvents.dispatchEvent(new CustomEvent('commit',{detail:{identity,change}}));
}

/** @param {string} action @param {object} input @returns {Promise<object>} The verified pull command receipt. */
async function requestOrderPull(action, input = {}) {
    const {client,owner} = await requireBloomscapesSession();
    if (getBloomscapesFarm() !== '10-PH') throw new Error('Order Pulling is available at Park Hill.');
    const receipt = bloomscapesData(await client.rpc('gnc_order_pull',{p_action:action,p_input:{...input,warehouse:'10-PH'}}));
    await requireBloomscapesOwner(owner);
    const identityMatches = Object.entries(input).every(([key,value]) => receipt?.input?.[key] === value);
    if (getBloomscapesFarm() !== '10-PH' || !identityMatches || receipt?.ok !== true || receipt.warehouse !== '10-PH' || receipt.action !== action
        || !Array.isArray(receipt.rows) || receipt.buggy && Number(receipt.buggy.cap_wdu) !== 650) {
        throw new Error('The Order Pulling response did not match this request.');
    }
    return receipt;
}

/**
 * @param {object} profile The active, exact View As profile.
 * @returns {Promise<object>} The preview receipt bound to this puller and Park Hill.
 */
async function requestPhShippingPreview(profile) {
    const receipt = await readSuperAdminPreviewPage(borrowedHelpIdentity(),-Number(profile.id.slice(5)));
    const exact = receipt.users.find(user=>user.id === profile.id && user.username === profile.username);
    if (exact?.shipping_preview?.warehouse !== '10-PH'
        || normalizePullerId(exact.shipping_preview.username) !== normalizePullerId(profile.username)
        || !Array.isArray(exact.shipping_preview.rows)) throw Error('This Shipping preview is no longer available.');
    return exact.shipping_preview;
}

/** @param {string} rpc @param {object} input @returns {Promise<object>} The verified dispatch or team receipt. */
async function requestPhPullWork(rpc, input = {}) {
    const {client,owner} = await requireBloomscapesSession();
    if (getBloomscapesFarm() !== '10-PH') throw new Error('Choose Park Hill to manage Order Pulling.');
    const receipt = bloomscapesData(await client.rpc(rpc,{...input,p_warehouse:'10-PH'}));
    await requireBloomscapesOwner(owner);
    if (getBloomscapesFarm() !== '10-PH' || receipt?.ok !== true || receipt.warehouse !== '10-PH') {
        throw new Error('The Park Hill work receipt did not match this request.');
    }
    if (rpc === 'gnc_ph_pull_work_v1') {
        if (!hasPhPullWorkSnapshot(receipt)
            || input.p_team && (receipt.team_id !== input.p_team || !receipt.buggy_id
                || JSON.stringify(receipt.tag_ids) !== JSON.stringify(input.p_tags))) {
            throw new Error('The dispatch receipt did not match this batch.');
        }
    } else if (rpc === 'gnc_ph_pull_control_v1') {
        if (!matchesPhPullControlReceipt(receipt,input)) throw new Error('The load control receipt did not match this request.');
    } else if (!matchesPhPullTeamReceipt(receipt.team,input)) {
        throw new Error('The receipt did not match this buggy team.');
    }
    return receipt;
}

function hasPhPullWorkSnapshot(receipt) {
    if (![receipt.rows,receipt.units,receipt.pullers,receipt.teams].every(Array.isArray)) return false;
    if (receipt.auto_assign === undefined && receipt.assigned_loads === undefined && receipt.queued_loads === undefined) return true;
    return typeof receipt.auto_assign === 'boolean' && [receipt.assigned_loads,receipt.queued_loads].every(loads =>
        Array.isArray(loads) && loads.every(load => Array.isArray(load?.load_manifest)));
}

function matchesPhPullControlReceipt(receipt,{p_action,p_input}) {
    if (!hasPhPullWorkSnapshot(receipt) || !Array.isArray(receipt.assigned_loads) || receipt.action !== p_action
        || !Object.entries(p_input).every(([key,value]) => receipt.input?.[key] === value)) return false;
    if (p_action === 'set_auto') return receipt.auto_assign === p_input.enabled;
    const load = receipt.assigned_loads.find(row => row.buggy_id === p_input.buggy_id);
    if (p_action === 'unassign') return !load;
    if (p_action !== 'swap' || load?.team_id !== p_input.target_team_id) return false;
    return !p_input.target_buggy_id || receipt.assigned_loads.some(row =>
        row.buggy_id === p_input.target_buggy_id && row.team_id === p_input.team_id);
}

function matchesPhPullTeamReceipt(team,input) {
    if (!team?.team_id || team.warehouse !== '10-PH' || input.p_team && team.team_id !== input.p_team) return false;
    if (!input.p_unit) return team.active === false;
    return team.active === true && team.unit_number === input.p_unit
        && team.puller_primary === input.p_primary && team.puller_helper === input.p_helper;
}

function phDispatchSlots(snapshot,visible) {
    const byId = new Map(visible.filter(row=>row.shuttle_ready!==false && phPullQueueRank(row)<5).map(row=>[row.pull_tag_id,row]));
    const slots = [];
    for (const queue of snapshot.queued_loads) {
        const rows = queue.load_manifest.map(row=>byId.get(row.pull_tag_id));
        if (!rows.length || rows.some(row=>!row || row.dispatch_slot!==queue.queue_position)) continue;
        slots.push({rows,slot:queue.queue_position,owner:rows.find(row=>row.shuttle_team_id)?.shuttle_team_id,
            rank:Math.min(...rows.map(phPullQueueRank))});
    }
    return slots.sort((a,b)=>a.rank-b.rank || a.slot-b.slot);
}

function phSlotReadyTeams(snapshot) {
    const ready = snapshot.teams.filter(team=>team.active!==false && !team.batch_open);
    const choices = phPullTeamChoices(snapshot,'');
    const people = choices.primary.filter(name=>/^puller_(?:00[1-9]|0[1-5]\d|060)$/.test(name));
    for (const unit of choices.units) {
        if (!people.length) break;
        if (Number(unit)<205 || Number(unit)>235) continue;
        ready.push({unit_number:unit,puller_primary:people.shift(),puller_helper:people.shift() || null});
    }
    return ready;
}

/**
 * @param {object} snapshot Full native pool, crew and queue receipt.
 * @param {object[]} visible Rows included by current water, search and priority filters.
 * @param {string|null} [chosen] Optional selected team.
 * @param {boolean} [preview] Allow a single unpinned manual selection without a ready crew.
 * @returns {object[]} Complete native trips paired with available crews.
 */
function phScheduledDispatchPlans(snapshot,visible,chosen=null,preview=false) {
    if (snapshot.warehouse!=='10-PH') return [];
    const slots = phDispatchSlots(snapshot,visible);
    const occupied = new Set(snapshot.rows.filter(row=>row.shuttle_team_id).map(row=>row.shuttle_team_id));
    const available = new Set(slots);
    const teams = phSlotReadyTeams(snapshot).filter(team=>!chosen || team.team_id===chosen);
    if (preview && !chosen && !teams.length) teams.push({});
    const result = [];
    for (const team of teams) {
        const reserved = team.shuttle_source || occupied.has(team.team_id);
        const slot = reserved ? slots.find(candidate=>candidate.owner===team.team_id)
            : slots.find(candidate=>!candidate.owner && available.has(candidate));
        if (!slot || !available.delete(slot)) continue;
        result.push({team,load:{rows:slot.rows}});
        if (preview) break;
    }
    return result;
}

async function reconcilePhDispatchFailure(error,dispatched,unit,isCurrent,acceptSnapshot) {
    const confirmed = dispatched+' load'+(dispatched === 1 ? '' : 's')+' confirmed. Unit '+unit+': ';
    const reason = error?.message || 'The server could not confirm the batch.';
    try {
        const latest = await requestPhPullWork('gnc_ph_pull_work_v1');
        if (isCurrent()) acceptSnapshot(latest);
    } catch (refreshError) {
        throw new Error(confirmed+reason+' Refresh failed: '+(refreshError?.message || 'Please refresh the work pool.'));
    }
    throw new Error(confirmed+reason);
}

/**
 * @param {object[]} plans Visible tag and team proposals.
 * @param {Function} isCurrent Account and farm scope check.
 * @param {Function} acceptSnapshot Publisher for verified assignment receipts.
 * @param {Function} [dockRevision] Current dock-priority revision.
 * @returns {Promise<number>} Confirmed load count.
 */
async function dispatchPhReadyTeams(plans, isCurrent, acceptSnapshot, dockRevision = () => 0) {
    let dispatched = 0;
    const plannedRevision = dockRevision();
    let confirmedRevision = plannedRevision;
    function requirePlannedPriority() {
        if (Math.max(dockRevision(),confirmedRevision) > plannedRevision) {
            throw new Error('Dock priority changed. Review the updated work queue before assigning more teams.');
        }
    }
    for (const {team,load} of plans) {
        if (!isCurrent()) break;
        try {
            requirePlannedPriority();
            const current = team.team_id ? team : (await requestPhPullWork('assign_ph_puller_buggy_team_v1',{
                p_unit:team.unit_number,p_primary:team.puller_primary,p_helper:team.puller_helper || null
            })).team;
            if (!isCurrent()) break;
            requirePlannedPriority();
            const receipt = await requestPhPullWork('gnc_ph_pull_work_v1',{
                p_team:current.team_id,p_expected:current.updated_at,p_tags:load.rows.map(row => row.pull_tag_id)
            });
            if (!isCurrent()) break;
            confirmedRevision = Number(receipt.dock_revision) || confirmedRevision;
            acceptSnapshot(receipt);
            dispatched++;
        } catch (error) {
            if (!isCurrent()) break;
            return reconcilePhDispatchFailure(error,dispatched,team.unit_number,isCurrent,acceptSnapshot);
        }
    }
    return dispatched;
}
