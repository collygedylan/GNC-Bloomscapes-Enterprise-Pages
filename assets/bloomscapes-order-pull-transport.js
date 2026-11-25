async function requestOrderPull(action, input = {}) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_order_pull',{p_action:action,p_input:input}));
    await requireBloomscapesOwner(owner);
    const identityMatches = Object.entries(input).every(([key,value]) => receipt?.input?.[key] === value);
    if (!identityMatches || receipt?.ok !== true || receipt.warehouse !== '10-PH' || receipt.action !== action
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
        if (![receipt.rows,receipt.units,receipt.pullers,receipt.teams].every(Array.isArray)
            || input.p_team && (receipt.team_id !== input.p_team || !receipt.buggy_id
                || JSON.stringify(receipt.tag_ids) !== JSON.stringify(input.p_tags))) {
            throw new Error('The dispatch receipt did not match this batch.');
        }
    } else if (!matchesPhPullTeamReceipt(receipt.team,input)) {
        throw new Error('The receipt did not match this buggy team.');
    }
    return receipt;
}

function matchesPhPullTeamReceipt(team,input) {
    if (!team?.team_id || team.warehouse !== '10-PH' || input.p_team && team.team_id !== input.p_team) return false;
    if (!input.p_unit) return team.active === false;
    return team.active === true && team.unit_number === input.p_unit
        && team.puller_primary === input.p_primary && team.puller_helper === input.p_helper;
}
