const bloomTimeCardPageSize=100;

function assertBloomTimeCardScope(farm, identity) {
    if (farm!==getBloomscapesFarm() || identity!==getSupabaseReadIdentityScope()) {
        throw new Error('The Time Cards account or farm changed.');
    }
}

async function bloomTimeCardRpc(farm, identity, name, payload) {
    const {client,owner}=await requireBloomscapesSession();
    assertBloomTimeCardScope(farm,identity);
    const response=await client.rpc(name,{p_farm:farm,...payload});
    await requireBloomscapesOwner(owner);
    assertBloomTimeCardScope(farm,identity);
    const data=bloomscapesData(response);
    if (data?.ok!==true || data.farm_code!==farm) throw new Error('The Time Cards receipt did not match this farm.');
    return data;
}

async function readBloomTimeCardBoard(farm,identity,window) {
    const data=await bloomTimeCardRpc(farm,identity,'gnc_timecard_board',window);
    if (!data.username || !data.today || !Array.isArray(data.rows) || !Array.isArray(data.codes) || !Array.isArray(data.contexts)) {
        throw new Error('The Time Cards response is incomplete.');
    }
    return data;
}

async function sendBloomTimeCardCommand(farm,identity,action,input) {
    const data=await bloomTimeCardRpc(farm,identity,'gnc_timecard_command',{p_action:action,p_input:input});
    const saved=action==='switch_code' ? data.closed_id : data.id;
    if (data.action!==action || !data.id || !data.revision || (input.id && input.id!==saved)) {
        throw new Error('The saved time card did not match this edit.');
    }
    return data;
}

async function readBloomTimeCardExport(farm,identity,range) {
    const rows=[];
    for (let offset=0; offset<=100000; offset+=bloomTimeCardPageSize) {
        const page=await bloomTimeCardRpc(farm,identity,'gnc_timecard_export',{...range,p_offset:offset});
        if (!Array.isArray(page.rows)) throw new Error('Time Cards export did not return rows.');
        rows.push(...page.rows);
        if (!page.has_more) return rows;
    }
    throw new Error('Choose a shorter export window.');
}
