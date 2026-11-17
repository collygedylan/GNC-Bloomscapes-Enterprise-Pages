
async function readBloomscapesFarmRevision(farm) {
    const {data,error} = await getSupabaseBrowserClient().rpc('gnc_read_farm_snapshot_revision',{p_farm:farm}).abortSignal(window.BloomscapesBatteryGovernor.viewSignal());
    if (error) throw error;
    if (data?.farm_code!==farm || typeof data.revision!=='string') throw new Error('Farm revision scope was not confirmed.');
    const status=await fetchDirectPostgrestReadPage('gnc_00_core_erp_sync_status',
        'select=target_key,last_synced_at&farm_code=eq.'+farm+'&order=target_key.asc',{count:false,signal:window.BloomscapesBatteryGovernor.viewSignal()},false);
    if (!status) throw new Error('ERP snapshot revision was not confirmed.');
    return JSON.stringify([data.revision,status.rows]);
}

async function readBloomscapesFarmSnapshot(farm,assertCurrent) {
    const lastSyncRevisionAt = await readBatteryRevisionPulse(farm, window.BloomscapesBatteryGovernor.viewSignal());
    const revision = await readBloomscapesFarmRevision(farm);
    assertCurrent();
    const entries = await Promise.all(getErpFarmReadContracts(farm).map(async ([key,table,column,order])=>
        [key,await readBloomscapesFarmTable(table,column,order,farm,assertCurrent)]));
    assertCurrent();
    if (await readBloomscapesFarmRevision(farm)!==revision) throw Object.assign(
        new Error('Farm changed during its snapshot read; previous inventory retained.'),{code:'FARM_SNAPSHOT_REVISION_CHANGED'});
    return {farm,revision,lastSyncRevisionAt,...Object.fromEntries(entries)};
}

async function readBloomscapesFarmTable(table,column,order,farm,assertCurrent,signal = window.BloomscapesBatteryGovernor.viewSignal()) {
    const rows = [];
    let total = null;
    for (let offset=0;offset<100000;offset+=1000) {
        assertCurrent();
        const page = await fetchDirectPostgrestReadPage(table,erpFarmReadQuery(table,column,order,farm,offset),{count:offset===0,signal},false);
        if (!page) throw new Error('Authenticated farm read unavailable.');
        const {rows:data,total:count}=page;
        assertCurrent();
        if (!Array.isArray(data) || offset===0 && !Number.isSafeInteger(count)) throw new Error('Farm snapshot count was not confirmed.');
        if (offset===0) total = count;
        rows.push(...data);
        if (rows.length===total) return rows;
        if (!data.length || rows.length>total) break;
    }
    throw new Error('Complete farm snapshot could not be verified; previous inventory retained.');
}
