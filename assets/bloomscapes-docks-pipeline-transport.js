async function requestDockPipeline(farm, action, input) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_dock_pipeline',{p_farm:farm,p_action:action,p_input:input}));
    await requireBloomscapesOwner(owner);
    if (receipt?.ok !== true || receipt.farm_code !== farm || receipt.action !== action
        || action === 'list' && (!Array.isArray(receipt.rows) || !Array.isArray(receipt.groups))
        || input.id && (receipt.id !== input.id || receipt.updated < 1)) {
        throw new Error('The Docks response did not match the requested work.');
    }
    return receipt;
}

async function readDockPipelineList(farm, query, current) {
    const first = await requestDockPipeline(farm,'list',query);
    if (first.rows.length <= 40 || !Object.hasOwn(query,'stopnumber')) return first;
    const rows = first.rows.slice(0,40);
    for (let offset = rows.length; current() && offset < first.summary?.total; offset = rows.length) {
        const next = await requestDockPipeline(farm,'list',{...query,offset});
        if (next.summary?.total !== first.summary?.total || next.summary?.completed !== first.summary?.completed) {
            throw new Error('The Docks stop changed while loading. Refresh to see the latest orders.');
        }
        rows.push(...next.rows.slice(0,40));
        if (next.rows.length <= 40) break;
    }
    if (new Set(rows.map(row => row.unique_id)).size !== rows.length) {
        throw new Error('The Docks stop changed while loading. Refresh to see the latest orders.');
    }
    return {...first,rows};
}

async function readDockPipelineTeam(farm) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_dock_pipeline_team',{p_farm:farm}));
    await requireBloomscapesOwner(owner);
    if (receipt?.farm_code !== farm || !Array.isArray(receipt.people)) throw new Error('Dock roster is unavailable.');
    return receipt.people;
}

async function requestDockPipelineSettings(type, subject, patch = null) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_dock_pipeline_settings',{
        p_type:type,p_subject:subject,p_patch:patch
    }));
    await requireBloomscapesOwner(owner);
    if (receipt?.subject_type !== type || receipt.subject_key !== subject || !receipt.permissions) {
        throw new Error('The Dock access response did not match the selected account or role.');
    }
    return receipt;
}
