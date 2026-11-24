const FARM_SNAPSHOT_PAGE_SIZE = 1000;
const INTERACTIVE_SOC_READ_WIDTH = 3;

function bloomscapesFarmSnapshotSignal(background) {
    return background ? background.signal() : window.BloomscapesBatteryGovernor.viewSignal();
}

async function readBloomscapesFarmRevision(farm,background) {
    if (background) await background.checkpoint();
    const signal = bloomscapesFarmSnapshotSignal(background);
    const revisionRead = getSupabaseBrowserClient().rpc('gnc_read_farm_snapshot_revision',{p_farm:farm}).abortSignal(signal);
    const statusRead = readBloomscapesFarmPage('gnc_00_core_erp_sync_status',
        'select=target_key,last_synced_at&farm_code=eq.'+farm+'&order=target_key.asc',false,signal,background,farm);
    const [{data,error},status] = await Promise.all([revisionRead,statusRead]);
    if (error) throw error;
    if (data?.farm_code!==farm || typeof data.revision!=='string') throw new Error('Farm revision scope was not confirmed.');
    if (!status) throw new Error('ERP snapshot revision was not confirmed.');
    return JSON.stringify([data.revision,status.rows]);
}

async function readBloomscapesFarmSnapshot(farm,assertCurrent,background,publishOwners) {
    if (background) await background.checkpoint();
    const [lastSyncRevisionAt,revision] = await Promise.all([
        readBatteryRevisionPulse(farm,bloomscapesFarmSnapshotSignal(background)),readBloomscapesFarmRevision(farm,background)
    ]);
    assertCurrent();
    const [entries,owners] = await Promise.all([
        readBloomscapesFarmSnapshotTables(farm,assertCurrent,background),
        readVerifiedBloomscapesFarmOwners(farm,revision,assertCurrent,background,publishOwners)
    ]);
    assertCurrent();
    const confirmedRevision = await readBloomscapesFarmRevision(farm,background);
    assertCurrent();
    if (confirmedRevision!==revision) throw Object.assign(
        new Error('Inventory was updated during the snapshot read.'),{code:'FARM_SNAPSHOT_REVISION_CHANGED'});
    return {farm,revision,lastSyncRevisionAt,...Object.fromEntries(entries),owners};
}

async function readVerifiedBloomscapesFarmOwners(farm,revision,assertCurrent,background,publish) {
    if (typeof appAccessSnapshotLoadPromise !== 'undefined' && appAccessSnapshotLoadPromise) {
        await appAccessSnapshotLoadPromise;
    }
    assertCurrent();
    const saved = publish && reusableBloomscapesOwnerReceipt(farm,revision);
    if (saved) return saved;
    const owners = await readBloomscapesAssignedOwnerSnapshot(farm,bloomscapesFarmSnapshotSignal(background),background);
    assertCurrent();
    publish?.(farm,owners,revision);
    return owners;
}

async function readBloomscapesFarmSnapshotTables(farm,assertCurrent,background) {
    const contracts = getErpFarmReadContracts(farm).filter(([key])=>key!=='assigned' && key!=='defaults');
    const read = async ([key,table,column,order])=>[key,await readBloomscapesFarmTable(table,column,order,farm,assertCurrent,undefined,background)];
    const completed = [];
    for (let index=0;index<contracts.length;index++) {
        completed.push(await read(contracts[index]));
        if (index + 1 < contracts.length) await new Promise(resolve=>setTimeout(resolve,150));
    }
    return completed;
}

async function readBloomscapesAssignedOwnerSnapshot(farm,signal,background) {
    if (!bloomscapesFarmState.confirmed) throw new DOMException('Session farm is not confirmed.','AbortError');
    if (background) await background.checkpoint();
    const active = background?.signal() || signal;
    const permission = getPassiveNativeReadPermissionVersion();
    return runDedupeSupabaseRead('farm-assigned-owners:'+farm+':'+permission,
        ({signal: shared}) => fetchBloomscapesAssignedOwners(farm,shared),{signal:active,maxAttempts:1});
}

async function fetchBloomscapesAssignedOwners(farm,signal) {
    const headers = getPassiveNativeAuthRequestHeaders() || await getNativeAuthRequestHeaders();
    if (!headers?.Authorization) throw nativeSessionRecoveryError();
    signal.throwIfAborted();
    const rpc = 'gnc_read_assigned_owner_snapshot';
    const send = authorization => window.GncDatabase.fetchRpc(SUPABASE_URL,rpc,{
        method:'POST',headers:authorization,body:JSON.stringify({p_farm:farm}),signal,
        cache:'no-store',referrerPolicy:'no-referrer'
    },10000,rpc);
    const response = await sendPassiveNativeRead(send,headers,signal);
    if (!response.ok) throw await createSupabaseReadResponseError(response,'Farm assigned owners unavailable');
    const data = await response.json();
    if (data?.farm!==farm || !Array.isArray(data.defaults) || !Array.isArray(data.blocks) || !Array.isArray(data.overrides)) {
        throw new Error('Farm owner snapshot was not confirmed.');
    }
    return data;
}

async function readBloomscapesFarmTable(table,column,order,farm,assertCurrent,signal = window.BloomscapesBatteryGovernor.viewSignal(),background) {
    const read = offset => readBloomscapesFarmPage(table,erpFarmReadQuery(table,column,order,farm,offset),offset===0,signal,background,farm);
    assertCurrent();
    const first = await read(0);
    assertCurrent();
    const total = first?.total;
    if (!Number.isSafeInteger(total) || total < 0 || total > 100000 || !isCompleteFarmSnapshotPage(first,0,total)) {
        throw new Error('Farm snapshot count was not confirmed.');
    }
    const rows = first.rows;
    for (let offset=FARM_SNAPSHOT_PAGE_SIZE;offset<total;) {
        const width = table === 'gnc_all_soc_master' && !background?.isSpeculative() ? INTERACTIVE_SOC_READ_WIDTH : 1;
        const count = Math.min(width,Math.ceil((total-offset)/FARM_SNAPSHOT_PAGE_SIZE));
        const offsets = Array.from({length:count},(_,index)=>offset+index*FARM_SNAPSHOT_PAGE_SIZE);
        const pages = await Promise.all(offsets.map(read));
        assertCurrent();
        if (!pages.every((page,index)=>isCompleteFarmSnapshotPage(page,offsets[index],total))) {
            throw new Error('Complete farm snapshot could not be verified; previous inventory retained.');
        }
        for (const page of pages) rows.push(...page.rows);
        offset += count * FARM_SNAPSHOT_PAGE_SIZE;
    }
    return rows;
}

function isCompleteFarmSnapshotPage(page,offset,total) {
    return Array.isArray(page?.rows) && page.rows.length === Math.min(FARM_SNAPSHOT_PAGE_SIZE,total-offset);
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
        if (activeSignal?.aborted) {
            const promoted = background?.signal();
            if (!promoted || promoted === activeSignal) activeSignal.throwIfAborted();
            await background.checkpoint();
            return read();
        }
        if (background && error.code==='DATASET_READ_SCOPE_CHANGED') {
            await background.checkpoint();
            return read();
        }
        if (!isRetryableFarmReadTransport(error) || background?.isSpeculative() || !current()
            || error.status===401 || error.status===403) throw error;
        const page=await read();
        if (!current()) throw staleSupabaseReadScopeError();
        return page;
    }
}

function isRetryableFarmReadTransport(error) {
    if (error?.name === 'AbortError' || [401,403].includes(Number(error?.status))) return false;
    return error?.code === 'TRANSPORT_TIMEOUT' || (!Number(error?.status) && /failed to fetch|networkerror|load failed/i.test(error?.message || ''));
}

const bloomscapesReferenceColumns = {
    ph_item_cpb:'itemcode,cpb,cpb_source',
    ph_location_beds:'locationcode,total_beds,reserved_2027_beds'
};

async function readBloomscapesReferencePages(client,table,signal) {
    const [identity] = bloomscapesReferenceColumns[table].split(',');
    const rows = [];
    for (let offset=0;offset<20000;offset+=1000) {
        let query = client.from(table).select(bloomscapesReferenceColumns[table]).order(identity);
        if (table === 'ph_location_beds') query = query.eq('active',true).eq('bay','000');
        const page = bloomscapesData(await query.range(offset,offset+999).abortSignal(signal));
        rows.push(...page);
        if (page.length < 1000) return rows;
    }
    throw new Error('Reference snapshot exceeds its read limit.');
}

async function readBloomscapesScheduleSummary(client,farm,signal) {
    const table = 'gnc_10_ph_production_schedule';
    const [count,latest] = await Promise.all([
        client.from(table).select('row_id',{count:'exact',head:true}).eq('farm_code',farm).abortSignal(signal),
        client.from(table).select('import_id,imported_at,source_file_name').eq('farm_code',farm)
            .order('imported_at',{ascending:false}).limit(1).abortSignal(signal)
    ]);
    if (count.error || !Number.isSafeInteger(count.count)) throw count.error || new Error('Schedule summary count unavailable.');
    return {count:count.count,latest:bloomscapesData(latest)[0] || null};
}

async function readBloomscapesReferenceSnapshot(farm,withCapacity) {
    const {client,owner} = await requireBloomscapesSession();
    const signal = AbortSignal.timeout(15000);
    const replies = await Promise.allSettled([
        readBloomscapesScheduleSummary(client,farm,signal),
        withCapacity ? readBloomscapesReferencePages(client,'ph_item_cpb',signal) : null,
        withCapacity ? readBloomscapesReferencePages(client,'ph_location_beds',signal) : null
    ]);
    await requireBloomscapesOwner(owner);
    const value = index=>replies[index].status === 'fulfilled' ? replies[index].value : null;
    return {scheduleSummary:value(0),cpb:value(1),beds:value(2)};
}
