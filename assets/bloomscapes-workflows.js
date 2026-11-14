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
    if (panel === 'bloomscapes-replenishment') {
        const due = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', {timeZone:'America/Chicago'});
        return client.from('gnc_10_ph_hl_po_and_staging')
            .select('itemcode,blockalpha,blocknumber,allocated_beds,cpb,current_ptronhand,remaining_po_qty,needed_on,open_can_space')
            .lte('needed_on', due).order('needed_on').limit(100);
    }
    if (panel === 'bloomscapes-dock-approvals') {
        return client.from('gnc_10_ph_dock_approvals')
            .select('id,itemcode,dock,order_unique_id,candidate_locationcode,inspection_photo_paths,decision')
            .order('created_at', {ascending: false}).limit(100);
    }
    if (panel === 'bloomscapes-hl-keying') {
        return client.from('gnc_10_ph_hl_keying').select('itemcode,lotcode,locationcode,field_name,qty_delta,reason_code,actor_username')
            .order('created_at', {ascending:false}).limit(100);
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
    const result = await (command === 'lab'
        ? client.rpc('gnc_create_lab_sample', {p_request_id: input.requestId, p_farm: input.farm, p_row_id: input.rowId})
        : client.rpc('gnc_decide_dock_approval', {p_approval_id: input.id, p_decision: input.decision}));
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
