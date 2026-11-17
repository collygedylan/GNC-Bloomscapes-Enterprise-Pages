async function readBloomscapesFieldWork() {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm();
    const ownerScope = getSupabaseReadIdentityScope();
    const result = await client.rpc('gnc_read_job_board',{p_farm:farm});
    await requireBloomscapesOwner(owner);
    const data = bloomscapesData(result);
    if (data?.farm_code!==farm || !Array.isArray(data.rows) || !Array.isArray(data.views)
        || data.rows.some(row=>row.farm_code!==farm)) throw new Error('Work queue scope was not confirmed.');
    return {...data,ownerScope};
}

async function previewBloomscapesFieldWork(input) {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm();
    const result = await client.rpc('gnc_preview_field_work',{p_farm:farm,p_source:input.sourceId,p_scope:input.scope,
        p_quantity:input.quantity ? Number(input.quantity) : null,p_percent:input.percent ? Number(input.percent) : null,
        p_target:input.targetLocation || null,p_work_view:input.workView});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.farm_code!==farm || receipt.source_id!==input.sourceId || receipt.scope!==input.scope) {
        throw new Error('Work preview did not match the selected source and farm.');
    }
    return receipt;
}

async function readBloomscapesFieldRoster() {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.rpc('gnc_field_work_roster',{p_farm:getBloomscapesFarm()});
    await requireBloomscapesOwner(owner);
    return bloomscapesData(result);
}

async function createBloomscapesFieldWork(command) {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.rpc('gnc_create_field_work',{
        p_request_id:command.id,p_farm:command.farm,p_input:command.input
    });
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.id!==command.id || receipt.farm_code!==command.farm
        || receipt.work_view!==command.input.workView || receipt.scope!==command.input.scope) {
        throw new Error('Work creation was not confirmed for this farm and scope.');
    }
    const snapshot=receipt.source_snapshot;
    if (snapshot && (snapshot.source_record_kind!=='DRIVE' || snapshot.is_drive_row!==true
        || snapshot.warehouse_id!==command.farm || snapshot.unique_id!==command.input.sourceId)) {
        throw new Error('Work source snapshot did not match the exact Drive row.');
    }
    return receipt;
}

async function completeBloomscapesFieldWork(job,answers) {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.rpc('gnc_complete_field_work',{p_job_id:job.id,p_answers:answers});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.ok!==true || receipt.work_id!==job.id || receipt.farm_code!==job.farm_code
        || receipt.work_view!==job.work_view) throw new Error('Work completion receipt did not match.');
    applyBloomscapesFieldWorkReceipt(job,answers,receipt);
    await refreshBloomscapesWarmFarm(job.farm_code);
    const pdf = await client.functions.invoke('request-delivery-worker',{body:{operation:'work_pdf',
        requestId:job.id,farm:job.farm_code,rowId:job.id,workType:'FIELD_WORK'}});
    await requireBloomscapesOwner(owner);
    const archive = bloomscapesData(pdf);
    if (archive?.pdfId!==job.id || !/^[a-f0-9]{64}$/.test(String(archive?.sha256 || ''))
        || !archive.signedUrl) throw new Error('Work saved. PDF archive remains pending; retry this same completion.');
    return {...receipt,pdf:archive};
}

async function readBloomscapesJobBoardRevision() {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm(),ownerScope = getSupabaseReadIdentityScope();
    const result = await client.rpc('gnc_read_job_board_revision',{p_farm:farm}).abortSignal(window.BloomscapesBatteryGovernor.signal());
    await requireBloomscapesOwner(owner);
    const data = bloomscapesData(result);
    if (data?.farm_code!==farm || typeof data.revision!=='string' || !data.counts) throw new Error('Job counts scope was not confirmed.');
    return {...data,ownerScope};
}

async function createBloomscapesSuspendWork(command) {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.rpc('gnc_create_suspend_work',{p_request_id:command.id,p_farm:command.farm,
        p_source_id:command.sourceId,p_scope:command.scope,p_order_id:command.orderId,p_quantity:command.quantity});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.ok!==true || receipt.command_id!==command.id || receipt.farm_code!==command.farm
        || receipt.source_id!==command.sourceId || receipt.order_id!==command.orderId || receipt.scope!==command.scope) {
        throw new Error('Suspend creation receipt did not match the selected farm, stock and order.');
    }
    return receipt;
}

async function readBloomscapesConsolidationDestinations(sourceId) {
    const {client,owner}=await requireBloomscapesSession();
    const farm=getBloomscapesFarm();
    const result=await client.rpc('gnc_studio_consolidation_candidates',{p_farm:farm,p_source:sourceId});
    await requireBloomscapesOwner(owner);
    const data=bloomscapesData(result);
    if (data?.farm_code!==farm || data.source_id!==sourceId || !Array.isArray(data.rows)) {
        throw new Error('Consolidation destinations did not match this source and farm.');
    }
    return data.rows;
}
