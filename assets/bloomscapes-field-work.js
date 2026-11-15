async function readBloomscapesFieldWork() {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm();
    const ownerScope = getSupabaseReadIdentityScope();
    const result = await client.rpc('gnc_read_field_work',{p_farm:farm});
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
    return receipt;
}

async function completeBloomscapesFieldWork(job,answers) {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.rpc('gnc_complete_field_work',{p_job_id:job.id,p_answers:answers});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.ok!==true || receipt.work_id!==job.id || receipt.farm_code!==job.farm_code
        || receipt.work_view!==job.work_view) throw new Error('Work completion receipt did not match.');
    const pdf = await client.functions.invoke('request-delivery-worker',{body:{operation:'work_pdf',
        requestId:job.id,farm:job.farm_code,rowId:job.id,workType:'FIELD_WORK'}});
    await requireBloomscapesOwner(owner);
    const archive = bloomscapesData(pdf);
    if (archive?.pdfId!==job.id || !/^[a-f0-9]{64}$/.test(String(archive?.sha256 || ''))
        || !archive.signedUrl) throw new Error('Work saved. PDF archive remains pending; retry this same completion.');
    return {...receipt,pdf:archive};
}
