function bloomscapesFarmSnapshotSignal(background) {
    return background ? background.signal() : window.BloomscapesBatteryGovernor.viewSignal();
}

async function readBloomscapesFarmRevision(farm,background) {
    if (background) await background.checkpoint();
    const {data,error} = await getSupabaseBrowserClient().rpc('gnc_read_farm_snapshot_revision',{p_farm:farm}).abortSignal(bloomscapesFarmSnapshotSignal(background));
    if (error) throw error;
    if (data?.farm_code!==farm || typeof data.revision!=='string') throw new Error('Farm revision scope was not confirmed.');
    const status=await readBloomscapesFarmPage('gnc_00_core_erp_sync_status',
        'select=target_key,last_synced_at&farm_code=eq.'+farm+'&order=target_key.asc',false,bloomscapesFarmSnapshotSignal(background),background,farm);
    if (!status) throw new Error('ERP snapshot revision was not confirmed.');
    return JSON.stringify([data.revision,status.rows]);
}

async function readBloomscapesFarmSnapshot(farm,assertCurrent,background) {
    if (background) await background.checkpoint();
    const lastSyncRevisionAt = await readBatteryRevisionPulse(farm,bloomscapesFarmSnapshotSignal(background));
    const revision = await readBloomscapesFarmRevision(farm,background);
    assertCurrent();
    const entries = await readBloomscapesFarmSnapshotTables(farm,assertCurrent,background);
    assertCurrent();
    if (await readBloomscapesFarmRevision(farm,background)!==revision) throw Object.assign(
        new Error('Inventory was updated during the snapshot read.'),{code:'FARM_SNAPSHOT_REVISION_CHANGED'});
    return {farm,revision,lastSyncRevisionAt,...Object.fromEntries(entries)};
}

async function readBloomscapesFarmSnapshotTables(farm,assertCurrent,background) {
    const contracts = getErpFarmReadContracts(farm);
    const read = async ([key,table,column,order])=>[key,await readBloomscapesFarmTable(table,column,order,farm,assertCurrent,undefined,background)];
    const completed = [];
    for (let index=0;index<contracts.length;index++) {
        if (!background?.isSpeculative()) return completed.concat(await Promise.all(contracts.slice(index).map(read)));
        completed.push(await read(contracts[index]));
    }
    return completed;
}

async function readBloomscapesFarmTable(table,column,order,farm,assertCurrent,signal = window.BloomscapesBatteryGovernor.viewSignal(),background) {
    const rows = [];
    let total = null;
    for (let offset=0;offset<100000;offset+=1000) {
        assertCurrent();
        const query = erpFarmReadQuery(table,column,order,farm,offset);
        const page = await readBloomscapesFarmPage(table,query,offset===0,signal,background,farm);
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

function captureBloomscapesFarmPageOwner(farm,signal) {
    const identity=getSupabaseReadIdentityScope(),epoch=nativeAuthRecoveryEpoch;
    const permission=appAccessSnapshotState.snapshot?.dataPermissionVersion || '';
    return ()=>!signal?.aborted && nativeAuthSessionActive && epoch===nativeAuthRecoveryEpoch
        && identity===getSupabaseReadIdentityScope() && permission===(appAccessSnapshotState.snapshot?.dataPermissionVersion || '')
        && farm===getBloomscapesFarm() && getBloomscapesAllowedFarms().includes(farm);
}

async function readBloomscapesFarmPage(table,query,count,signal,background,farm) {
    if (background) await background.checkpoint();
    const activeSignal = background ? background.signal() : signal;
    const current = captureBloomscapesFarmPageOwner(farm,activeSignal);
    const read = () => fetchDirectPostgrestReadPage(table,query,{count,signal:background ? background.signal() : signal},false);
    try { return await read(); }
    catch (error) {
        if (background && error.code==='DATASET_READ_SCOPE_CHANGED') {
            await background.checkpoint();
            return read();
        }
        if (error.code!=='TRANSPORT_TIMEOUT' || background?.isSpeculative() || !current()
            || error.status===401 || error.status===403) throw error;
        const page=await read();
        if (!current()) throw staleSupabaseReadScopeError();
        return page;
    }
}
