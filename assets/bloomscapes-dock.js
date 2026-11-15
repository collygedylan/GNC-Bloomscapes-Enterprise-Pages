function requireBloomscapesDockPhoto(file) {
    if (!(file instanceof File) || !['image/jpeg','image/png','image/webp'].includes(file.type)
        || !file.size || file.size>10*1024*1024) throw new Error('Choose a JPEG, PNG or WebP photo under 10 MB.');
    return file;
}

async function uploadBloomscapesDockPhoto(client,bucket,requestId,file) {
    const extension = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type];
    const path = requestId+'/'+Date.now()+'-'+crypto.randomUUID()+'.'+extension;
    const result = await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
    if (result.error) throw new Error('Photo upload was not confirmed.');
    return path;
}

async function readBloomscapesDockChoices() {
    const {client,owner} = await requireBloomscapesSession();
    const result = await client.from('ph_soc_master').select('unique_id,itemcode,commonname,locationcode,dock,salesrepname')
        .order('unique_id').limit(200);
    await requireBloomscapesOwner(owner);
    return bloomscapesData(result);
}

async function publishBloomscapesDockCandidate(candidate,photo,input,owner) {
    await requireBloomscapesOwner(owner);
    if (candidate.DATE_COMPLETED || candidate.date_completed) {
        if (!await unlockCanonicalInventoryRow(candidate)) throw new Error('Candidate evaluation unlock was not confirmed.');
    }
    await requireBloomscapesOwner(owner);
    const links = String(candidate.PHOTO_LINK || candidate.photo_link || '').split(',').filter(Boolean);
    const names = String(candidate.PHOTO_NAME || candidate.photo_name || '').split(',').filter(Boolean);
    links.push(photo.url);
    names.push(photo.path.split('/').at(-1));
    const publication = await publishRowEvaluationToMasterAndNotes(candidate,{
        spec:input.spec,caliper:input.caliper,match:Number(input.match),comments:input.comments,
        photo_link:links.join(','),photo_name:names.join(',')
    },{prefix:'lsn-',scope:getSupabaseReadIdentityScope(),complete:true});
    if (!publication) throw new Error('Candidate publication was not confirmed.');
}

async function submitBloomscapesDockCandidate(input,progress) {
    requireBloomscapesDockPhoto(input.inspection);
    requireBloomscapesDockPhoto(input.candidatePhoto);
    const {client,owner} = await requireBloomscapesSession();
    const candidate = masterInventoryById.get(input.rowId) || await loadExactMasterDetailRow(input.rowId);
    if (!candidate || bloomscapesRowFarm(candidate)!=='10-PH') throw new Error('Choose the exact Park Hill candidate row.');
    const draft = bloomscapesData(await client.rpc('gnc_prepare_dock_candidate',{
        p_request_id:input.requestId,p_order_id:input.orderId,p_candidate_id:input.rowId
    }));
    if (draft.ready) return draft;
    progress('Uploading private Dock inspection…');
    const privatePath = await uploadBloomscapesDockPhoto(client,'bloomscapes-dock-inspections',draft.id,input.inspection);
    await requireBloomscapesOwner(owner);
    progress('Publishing candidate evaluation to AV…');
    const path = await uploadBloomscapesDockPhoto(client,'bloomscapes-evaluation-photos',draft.id,input.candidatePhoto);
    const url = client.storage.from('bloomscapes-evaluation-photos').getPublicUrl(path).data.publicUrl;
    await publishBloomscapesDockCandidate(candidate,{path,url},input,owner);
    await requireBloomscapesOwner(owner);
    return bloomscapesData(await client.rpc('gnc_finalize_dock_candidate',{
        p_request_id:draft.id,p_private_paths:[privatePath],p_candidate_path:path
    }));
}
