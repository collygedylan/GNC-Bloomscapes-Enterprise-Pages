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
