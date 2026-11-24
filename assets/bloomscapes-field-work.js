const TREE_STAGE_COLUMNS='job_id,chain_id,step_order,step_type,warehouse,source_row_id,itemcode,target_itemcode,target_lotcode,'
    +'common_name,container_size,plantgroupcode,graded_locationcode,from_locationcode,to_locationcode,planted_locationcode,'
    +'qty,season_y_at_loc_qty,season_y_delta,season_y_match,target_shift_qty,cumulative_graded_qty,target_variance,'
    +'variance_status,assigned_crew,created_by,completed_by,status,outbox_id,data_entry_warehouse';

async function requestBloomscapesTreeStage(execute) {
    if (borrowedHelpPreview()) throw new Error('View As is read-only.');
    const {client,owner}=await requireBloomscapesSession();
    const farm=getBloomscapesFarm();
    const result=await execute(client,farm);
    await requireBloomscapesOwner(owner);
    if (farm!==getBloomscapesFarm()) throw staleSupabaseReadScopeError();
    return bloomscapesData(result);
}

function readBloomscapesTreeStages() {
    return requestBloomscapesTreeStage((client,farm)=>client.from('gnc_00_core_tree_stage_jobs')
        .select(TREE_STAGE_COLUMNS).or('warehouse.eq.'+farm+',data_entry_warehouse.eq.'+farm)
        .order('status',{ascending:false}).order('created_at',{ascending:false}).limit(200));
}

async function queueBloomscapesTreeGrading(input) {
    const receipt=await requestBloomscapesTreeStage((client,farm)=>client.rpc('create_tree_grading_job_v1',{
        p_job_id:input.id,p_warehouse:farm,p_source_row_id:input.sourceId,
        p_assigned_crew:input.assignedTo,p_target_shift_qty:input.targetQty
    }));
    if (receipt?.job_id!==input.id || receipt.source_row_id!==input.sourceId
        || receipt.step_type!=='GRADING' || receipt.warehouse!==getBloomscapesFarm()) {
        throw new Error('The grading receipt did not match the selected tree row.');
    }
    return receipt;
}

async function completeBloomscapesTreeStage(job,input) {
    const receipt=await requestBloomscapesTreeStage(client=>client.rpc('complete_tree_stage_step_v1',{
        p_job_id:job.job_id,p_qty:input.quantity,p_location:input.location,
        p_target_itemcode:input.targetItem,p_target_lotcode:input.targetLot
    }));
    if (receipt?.job_id!==job.job_id || receipt.chain_id!==job.chain_id
        || receipt.step_type!==job.step_type || receipt.status!=='completed') {
        throw new Error('The completion receipt did not match this tree stage.');
    }
    return receipt;
}

async function publishBloomscapesTreeStagePdf(job) {
    const receipt=await requestBloomscapesTreeStage(client=>client.functions.invoke('request-delivery-worker',
        {body:{operation:'work_pdf',requestId:job.job_id,rowId:job.job_id,farm:job.warehouse,workType:job.step_type}}));
    if (receipt?.ok!==true || receipt.pdfId!==job.job_id || !/^[a-f0-9]{64}$/.test(receipt.sha256)
        || !receipt.signedUrl) throw new Error('The signed PDF receipt has not arrived.');
    return receipt;
}

async function readBloomscapesFieldWork(viewAll=false) {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm();
    const ownerScope = getSupabaseReadIdentityScope();
    const result = await client.rpc('gnc_list_que_field_work',{p_farm:farm,p_view_all:viewAll});
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
        p_target:input.targetLocation || null,p_work_view:input.workView,p_action_type:input.actionType || null});
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (receipt?.farm_code!==farm || receipt.source_id!==input.sourceId || receipt.scope!==input.scope) {
        throw new Error('Work preview did not match the selected source and farm.');
    }
    return receipt;
}

async function readBloomscapesFieldRoster() {
    const {client,owner} = await requireBloomscapesSession();
    const farm=getBloomscapesFarm();
    const [result]=await Promise.all([client.rpc('gnc_field_work_roster',{p_farm:farm}),readEligibleModuleDirectory(farm)]);
    await requireBloomscapesOwner(owner);
    return eligiblePickerRows(bloomscapesData(result),'queue');
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

async function pickupBloomscapesFieldWork(job) {
    const {client,owner}=await requireBloomscapesSession();
    const actor=String(currentUser);
    const result=await client.rpc('gnc_pickup_field_work',{p_job_id:job.id,p_farm:job.farm_code});
    await requireBloomscapesOwner(owner);
    const receipt=bloomscapesData(result);
    if (receipt?.work_id!==job.id || receipt.farm_code!==job.farm_code
        || receipt.assigned_to_username!==actor || receipt.picked_up_by_username!==actor
        || !Number.isFinite(Date.parse(receipt.picked_up_at))) {
        throw new Error('Crew pickup receipt did not match the active user and work.');
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

async function readBloomscapesJobBoardRevision(signal = window.BloomscapesBatteryGovernor.viewSignal()) {
    const {client,owner} = await requireBloomscapesSession();
    const farm = getBloomscapesFarm(),ownerScope = getSupabaseReadIdentityScope();
    const result = await client.rpc('gnc_read_job_board_revision',{p_farm:farm}).abortSignal(signal);
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

async function readBloomscapesWorkJobCodes(farm) {
    if (!['10-PH','60-HL','20-TX'].includes(farm)) return [];
    const {client,owner}=await requireBloomscapesSession();
    const result=await client.rpc('gnc_work_job_codes',{p_farm:farm});
    await requireBloomscapesOwner(owner);
    return bloomscapesData(result);
}
