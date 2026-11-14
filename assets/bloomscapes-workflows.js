async function requireBloomscapesSession() {
    const client = getSupabaseBrowserClient();
    const session = await getNativeAuthSession();
    if (!client || !session?.user?.id || !nativeAuthSessionActive) throw new Error('Sign in to continue.');
    return {client, owner: session.user.id};
}

function bloomscapesData(result) {
    if (result.error) throw new Error('The isolated service could not complete this request.');
    return result.data;
}

async function readBloomscapesPanel(panel, inputs = {}) {
    const {client, owner} = await requireBloomscapesSession();
    const result = await bloomscapesPanelQuery(client, panel, inputs);
    const current = await getNativeAuthSession();
    if (current?.user?.id !== owner) throw new Error('Signed-in account changed.');
    const data = bloomscapesData(result);
    if (panel !== 'bloomscapes-dock-approvals') return data;
    const rows = await addPrivateDockPhotoLinks(client, data);
    if ((await getNativeAuthSession())?.user?.id !== owner) throw new Error('Signed-in account changed.');
    return rows;
}

function bloomscapesPanelQuery(client, panel, input) {
    if (panel === 'bloomscapes-inventory') return bloomscapesInventoryQuery(client, input.farm);
    if (panel === 'bloomscapes-replenishment') return client.rpc('gnc_hl_capacity_7day');
    if (panel === 'bloomscapes-dock-approvals') {
        return client.from('gnc_10_ph_dock_approvals')
            .select('id,itemcode,dock,order_unique_id,candidate_locationcode,inspection_photo_paths,decision')
            .order('created_at', {ascending: false}).limit(100);
    }
    if (panel === 'bloomscapes-hl-keying') {
        return client.from('gnc_10_ph_hl_keying').select('itemcode,lotcode,locationcode,field_name,qty_delta,reason_code,actor_username')
            .order('created_at', {ascending:false}).limit(100);
    }
    if (panel === 'bloomscapes-field-jobs') {
        return client.from('gnc_field_jobs_y_grading')
            .select('unique_id,warehouse_id,record_kind,itemcode,locationcode,new_locationcode,scheduled_qty,graded_qty,qty_hauled,shear_scope,shear_pct,job_status')
            .in('record_kind',['SEASON_Y_GRADING','HAUL','SHEAR','CAN_FILL'])
            .order('created_at',{ascending:false}).limit(100);
    }
    if (panel === 'bloomscapes-lab') {
        return client.from('gnc_00_core_lab_knowledge')
            .select('sample_id,warehouse_id,genus_name,itemcode,lotcode,locationcode,status')
            .eq('record_kind', 'SAMPLE').order('sample_id', {ascending: false}).limit(100);
    }
    if (panel === 'bloomscapes-vault') return bloomscapesVaultQuery(client, input);
    return client.rpc('gnc_email_sandbox_status');
}

function bloomscapesInventoryQuery(client, farm) {
    const query = client.from('gnc_inventory_master')
        .select('warehouse_id,unique_id,itemcode,commonname,locationcode,lotcode,ptronhand')
        .eq('source_record_kind', 'DRIVE').in('warehouse_id', ['10-PH', '60-HL']);
    if (['10-PH', '60-HL'].includes(farm)) query.eq('warehouse_id', farm);
    return query.order('warehouse_id').order('unique_id').limit(100);
}

function bloomscapesVaultQuery(client, input) {
    const query = client.from('gnc_00_core_work_inquiry_pdfs')
        .select('work_type,itemcode,locationcode,lotcode,drive_file_id,created_at')
        .order('created_at', {ascending: false}).limit(100);
    if (input.type) query.eq('work_type', input.type);
    if (input.from) query.gte('created_at', input.from);
    return query;
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
    if (command === 'dock') {
        return client.rpc('gnc_decide_dock_approval', {p_approval_id:input.id,p_decision:input.decision});
    }
    const params = {p_request_id:input.requestId,p_farm:input.farm};
    if (command === 'haul') {
        return client.rpc('gnc_complete_haul', {...params,p_source_id:input.rowId,
            p_destination_id:input.destinationId,p_quantity:Number(input.quantity)});
    }
    if (command === 'grading') {
        return client.rpc('gnc_complete_y_grading', {...params,p_row_id:input.rowId,
            p_scheduled:Number(input.scheduled),p_graded:Number(input.graded)});
    }
    if (command === 'shear') {
        return client.rpc('gnc_plan_shear', {...params,p_row_id:input.rowId,
            p_scope:input.scope,p_pct:Number(input.pct),p_acknowledge:input.acknowledge === 'yes'});
    }
    if (command === 'shear-complete') return client.rpc('gnc_complete_shear', {p_farm:input.farm,p_job_id:input.rowId});
    if (command === 'lab') return client.rpc('gnc_create_lab_sample', {...params,p_row_id:input.rowId});
    throw new Error('Unknown workflow command.');
}
