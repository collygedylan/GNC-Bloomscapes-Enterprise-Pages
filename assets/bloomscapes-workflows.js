const BLOOMSCAPES_FIELD_KINDS = {
    'bloomscapes-field-jobs':['SEASON_Y_GRADING','HAUL','SHEAR','CAN_FILL'],
    'bloomscapes-grading':['SEASON_Y_GRADING','CAN_FILL'],
    'bloomscapes-hauling':['HAUL'],
    'bloomscapes-shearing':['SHEAR']
};

async function requireBloomscapesSession() {
    const client = getSupabaseBrowserClient();
    const session = await getNativeAuthSession();
    if (!client || !session?.user?.id || !nativeAuthSessionActive) throw new Error('Sign in to continue.');
    return {client, owner: session.user.id};
}

async function requireBloomscapesOwner(owner) {
    if ((await getNativeAuthSession())?.user?.id !== owner) throw new Error('Signed-in account changed.');
}

function bloomscapesData(result) {
    if (result.error) throw new Error('The isolated service could not complete this request.');
    return result.data;
}

async function readBloomscapesPanel(panel, inputs = {}) {
    const {client, owner} = await requireBloomscapesSession();
    const result = await bloomscapesPanelQuery(client, panel, {farm:getBloomscapesFarm(),...inputs});
    const current = await getNativeAuthSession();
    if (current?.user?.id !== owner) throw new Error('Signed-in account changed.');
    const data = bloomscapesData(result);
    if (panel !== 'bloomscapes-dock-approvals') return data;
    const rows = await addPrivateDockPhotoLinks(client, data);
    if ((await getNativeAuthSession())?.user?.id !== owner) throw new Error('Signed-in account changed.');
    return rows;
}

function bloomscapesPanelQuery(client, panel, input) {
    if (panel === 'architecture') return client.rpc('gnc_architecture_counts');
    if (panel === 'bloomscapes-sales-vault') return client.rpc('gnc_sales_vault',{p_farm:input.farm});
    if (panel === 'bloomscapes-inventory') return bloomscapesInventoryQuery(client, input.farm);
    if (panel === 'bloomscapes-replenishment') return client.rpc('gnc_hl_replenishment_rows');
    if (panel === 'bloomscapes-dock-approvals') {
        return client.from('gnc_10_ph_dock_approvals')
            .select('id,itemcode,dock,order_unique_id,candidate_locationcode,inspection_photo_paths,decision')
            .order('created_at', {ascending: false}).limit(100);
    }
    if (panel === 'bloomscapes-hl-keying') {
        return client.from('gnc_10_ph_hl_keying').select('itemcode,lotcode,locationcode,field_name,qty_delta,reason_code,actor_username')
            .order('created_at', {ascending:false}).limit(100);
    }
    if (BLOOMSCAPES_FIELD_KINDS[panel]) {
        return bloomscapesFieldQuery(client,panel,input.farm);
    }
    if (panel === 'bloomscapes-lab') {
        return client.from('gnc_00_core_lab_knowledge')
            .select('sample_id,warehouse_id,genus_name,itemcode,lotcode,locationcode,status')
            .eq('record_kind', 'SAMPLE').order('sample_id', {ascending: false}).limit(100);
    }
    if (panel === 'bloomscapes-vault') return bloomscapesVaultQuery(client, input);
    return client.rpc('gnc_email_sandbox_status');
}

async function bloomscapesFieldQuery(client,panel,farm) {
    const query = client.from('gnc_field_jobs_y_grading')
        .select('unique_id,warehouse_id,record_kind,itemcode,locationcode,new_locationcode,scheduled_qty,graded_qty,qty_hauled,shear_scope,shear_pct,job_status')
        .in('record_kind',BLOOMSCAPES_FIELD_KINDS[panel]).order('created_at',{ascending:false}).limit(100);
    if (['10-PH','60-HL'].includes(farm)) query.eq('warehouse_id',farm);
    const result = await query;
    if (result.error || panel !== 'bloomscapes-shearing') return result;
    const farms = farm === 'ALL' ? ['10-PH','60-HL'] : [farm];
    for (const selected of farms) {
        const recovery = await client.rpc('gnc_shear_recovery',{p_farm:selected});
        if (recovery.error) return recovery;
        result.data.push(...recovery.data.map(row => ({...row,recovery:true,warehouse_id:selected})));
    }
    return result;
}

function bloomscapesInventoryQuery(client, farm) {
    const query = client.from('gnc_effective_inventory')
        .select('warehouse_id,unique_id,itemcode,commonname,locationcode,lotcode,ptronhand')
        .eq('source_record_kind', 'DRIVE').in('warehouse_id', ['10-PH', '60-HL']);
    if (['10-PH', '60-HL'].includes(farm)) query.eq('warehouse_id', farm);
    return query.order('warehouse_id').order('unique_id').limit(100);
}

async function bloomscapesVaultQuery(client) {
    const data=[];
    for(let offset=0;offset<20000;offset+=500) {
        const page=await client.from('gnc_00_core_work_inquiry_pdfs')
            .select('pdf_id,username,farm_code,work_type,itemcode,locationcode,lotcode,drive_file_id,created_at,storage_bucket,storage_path,archive_status')
            .order('created_at',{ascending:false}).order('pdf_id').range(offset,offset+499);
        if(page.error) return page;
        data.push(...page.data);
        if(page.data.length<500) return {data,error:null};
    }
    throw new Error('Vault index exceeds 20,000 records. Contact the archive administrator.');
}

async function submitBloomscapesCommand(command, input) {
    const {client, owner} = await requireBloomscapesSession();
    const result = await bloomscapesCommandRequest(client, command, input);
    const current = await getNativeAuthSession();
    if (current?.user?.id !== owner) throw new Error('Signed-in account changed.');
    return bloomscapesData(result);
}

async function addPrivateDockPhotoLinks(client, rows) {
    const paths = [...new Set(rows.flatMap(row => row.inspection_photo_paths || []))];
    if (!paths.length) return rows;
    const result = await client.storage.from('bloomscapes-dock-inspections').createSignedUrls(paths, 120);
    const urlsByPath = new Map((result.data || []).map(receipt => [receipt.path, receipt.signedUrl]));
    return rows.map(row => ({
        ...row,
        temporaryPhotoLinks: (row.inspection_photo_paths || []).map(path => urlsByPath.get(path)).filter(Boolean)
    }));
}

function bloomscapesCommandRequest(client, command, input) {
    if (command === 'pdf-link') return bloomscapesWorkPdfLink(client,input.id);
    if (command === 'sales-substitutes') return client.rpc('gnc_sales_substitutes',{p_farm:input.farm,p_order_id:input.rowId});
    if (command === 'shuttle') return client.rpc('gnc_execute_hl_shuttle', {p_request_id:input.requestId,p_target_id:input.rowId});
    if (command === 'pdf') return client.functions.invoke('request-delivery-worker',{
        body:{operation:'work_pdf',requestId:input.requestId,farm:input.farm,rowId:input.rowId,workType:input.workType}});
    if (command === 'dock') {
        return client.rpc('gnc_decide_dock_approval', {p_approval_id:input.id,p_decision:input.decision});
    }
    const params = {p_request_id:input.requestId,p_farm:input.farm};
    if (command === 'haul') {
        return client.rpc('gnc_complete_haul_questionnaire', {...params,p_source_id:input.rowId,
            p_destination_id:input.destinationId,p_quantity:Number(input.quantity),p_tas:input.tas || ''});
    }
    if (command === 'grading') {
        return client.rpc('gnc_complete_y_grading', {...params,p_row_id:input.rowId,
            p_scheduled:Number(input.scheduled),p_graded:Number(input.graded)});
    }
    if (command === 'balance-split') {
        return client.rpc('gnc_split_y_balance', {...params,p_grading_id:input.gradingId,p_target_supply:input.targetSupply});
    }
    if (command === 'shear') {
        return client.rpc('gnc_plan_shear', {...params,p_row_id:input.rowId,
            p_scope:input.scope,p_pct:Number(input.pct),p_acknowledge:input.acknowledge === 'yes'});
    }
    if (command === 'shear-complete') return client.rpc('gnc_complete_shear', {p_farm:input.farm,p_job_id:input.rowId});
    if (command === 'lab') return client.rpc('gnc_create_lab_sample', {...params,p_row_id:input.rowId});
    throw new Error('Unknown workflow command.');
}

async function bloomscapesWorkPdfLink(client,id) {
    const receipt=await client.from('gnc_00_core_work_inquiry_pdfs')
        .select('storage_bucket,storage_path,content_sha256').eq('pdf_id',id).single();
    if(receipt.error || !receipt.data?.content_sha256) throw new Error('Verified PDF unavailable.');
    const {storage_bucket,storage_path}=receipt.data;
    return client.storage.from(storage_bucket).createSignedUrl(storage_path,120);
}
