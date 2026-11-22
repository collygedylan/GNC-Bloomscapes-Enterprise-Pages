function createBloomscapesNurseryTransport(identity) {
    const request=command=>requestBloomscapesNurseryCommand(identity,command);
    return Object.assign(request,{publishedReferences:true});
}

async function requestBloomscapesNurseryCommand(identity, {table,operation,payload}) {
    if (identity !== getSupabaseReadIdentityScope() || !canViewNurseryCommandTables()) throw new Error('NURSERY_ACCESS_DENIED');
    const farm = getBloomscapesFarm();
    const {client,owner}=await requireBloomscapesSession();
    if (identity !== getSupabaseReadIdentityScope() || farm !== getBloomscapesFarm()) throw staleSupabaseReadScopeError();
    const response = await client.rpc('nursery_command_v23127', {
        p_operation:operation, p_payload:{...payload,table,farm}
    }).abortSignal(AbortSignal.timeout(30000));
    await requireBloomscapesOwner(owner);
    if (identity !== getSupabaseReadIdentityScope() || farm !== getBloomscapesFarm()) throw staleSupabaseReadScopeError();
    const result=bloomscapesData(response);
    if (operation === 'read' && (result?.farm !== farm || result.table !== table || result.offset !== payload.offset
        || !Array.isArray(result.rows))) throw new Error('Nursery reference scope was not confirmed.');
    if (operation === 'read' && table === 'ph_prod_schedule_active') {
        return {...result,rows:result.rows.map(row=>({...row,source:row.source ?? ''}))};
    }
    return result;
}

async function readBloomscapesPlanning(scope) {
    const {client,owner}=await requireBloomscapesSession();
    const rows=[];
    for (let offset=0;offset<=50000;offset+=1000) {
        const result=await client.rpc('gnc_read_planning_rows',{p_farm:scope.farm,p_block:scope.block || null,p_item:scope.item || null,p_offset:offset}).abortSignal(AbortSignal.timeout(8000));
        await requireBloomscapesOwner(owner);
        if (getBloomscapesFarm()!==scope.farm) return [];
        const data=bloomscapesData(result);
        if (data?.farm!==scope.farm || data.block!==(scope.block || null) || data.item!==(scope.item || null)
            || data.offset!==offset || !Array.isArray(data.rows)) throw new Error('Planning read scope was not confirmed.');
        rows.push(...data.rows);
        if (data.rows.length<1000) return rows;
    }
    throw new Error('Planning scope exceeds the bounded read limit.');
}
