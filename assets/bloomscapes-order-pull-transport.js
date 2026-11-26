const phPullDockStatusEvents = new EventTarget();

function publishPhPullDockStatus(farm,identity,change = null) {
    if (farm === '10-PH') phPullDockStatusEvents.dispatchEvent(new CustomEvent('commit',{detail:{identity,change}}));
}

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
