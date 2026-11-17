const BLOOMSCAPES_SNAPSHOT_READS = [
    ['inventory','gnc_all_master_inventory','warehousei','unique_id'],
    ['soc','gnc_all_soc_master','warehouseid','unique_id'],
    ['reserves','gnc_all_reserves','warehouseid','unique_id'],
    ['assigned','ph_inventory_row_assignments','farm_code','master_unique_id'],
    ['defaults','ph_itemcode_default_owners','farm_code','itemcode_normalized']
];

async function readBloomscapesFarmRevision(farm) {
    const {data,error} = await getSupabaseBrowserClient().rpc('gnc_read_farm_snapshot_revision',{p_farm:farm});
    if (error) throw error;
    if (data?.farm_code!==farm || typeof data.revision!=='string') throw new Error('Farm revision scope was not confirmed.');
    return data.revision;
}

async function readBloomscapesFarmSnapshot(farm,assertCurrent) {
    const revision = await readBloomscapesFarmRevision(farm);
    assertCurrent();
    const entries = await Promise.all(BLOOMSCAPES_SNAPSHOT_READS.map(async ([key,table,column,order])=>
        [key,await readBloomscapesFarmTable(table,column,order,farm,assertCurrent)]));
    assertCurrent();
    if (await readBloomscapesFarmRevision(farm)!==revision) throw Object.assign(
        new Error('Farm changed during its snapshot read; previous inventory retained.'),{code:'FARM_SNAPSHOT_REVISION_CHANGED'});
    return {farm,revision,...Object.fromEntries(entries)};
}

async function readBloomscapesFarmTable(table,column,order,farm,assertCurrent) {
    const client = getSupabaseBrowserClient(), rows = [];
    let total = null;
    for (let offset=0;offset<100000;offset+=1000) {
        assertCurrent();
        const {data,error,count} = await client.from(table).select('*',offset===0 ? {count:'exact'} : {})
            .eq(column,column==='farm_code' ? farm : farm.slice(0,2)).order(order).range(offset,offset+999);
        if (error) throw error;
        assertCurrent();
        if (!Array.isArray(data) || offset===0 && !Number.isSafeInteger(count)) throw new Error('Farm snapshot count was not confirmed.');
        if (offset===0) total = count;
        rows.push(...data);
        if (rows.length===total) return rows;
        if (!data.length || rows.length>total) break;
    }
    throw new Error('Complete farm snapshot could not be verified; previous inventory retained.');
}
