async function saveBloomscapesDockProgress(row,stage) {
    const {client,owner} = await requireBloomscapesSession();
    const farm = bloomscapesRowFarm(row);
    const uid = String(row.UNIQUE_ID || row.unique_id || '');
    if (!uid || farm!==getBloomscapesFarm()) throw new Error('Choose a Dock row in the active farm.');
    const result = await client.rpc('gnc_save_dock_item_progress',{p_unique_id:uid,p_stage:stage,p_farm_code:farm,p_farm_code:farm});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.ok!==true || receipt.unique_id!==uid || receipt.farm_code!==farm
        || receipt.data?.unique_id!==uid || !receipt.data.checker_done
        || stage==='inspector' && !receipt.data.inspector_done) throw new Error('Dock progress was not confirmed.');
    return receipt.data;
}

async function runDockTripStatusRequest(operation='list',payload={}) {
    if (operation!=='list' && !requireCurrentDocksWriteProof()) throw new Error('Verify the current Dock rows before saving.');
    const {client,owner}=await requireBloomscapesSession();
    const farm=getBloomscapesFarm();
    const result=await client.rpc('gnc_dock_trip_progress',{p_farm:farm,p_operation:operation,p_input:payload});
    await requireBloomscapesOwner(owner);
    const receipt=bloomscapesData(result);
    if (receipt?.ok!==true || receipt.farm_code!==farm) throw new Error('Dock trip receipt did not match the active farm.');
    return receipt;
}
