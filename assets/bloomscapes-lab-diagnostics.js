const plantHealthFlights = new Map();
let plantHealthTail = Promise.resolve();
const plantHealthPhotoRoot = 'https://ozuligoikpyzgnmeccrw.supabase.co/storage/v1/object/public/bloomscapes-evaluation-photos/';

function plantHealthPublishedUrls(patch, baseline = {}) {
    const photos = row => ['photo_link','dock_photo_link','req_photo_link'].flatMap(key =>
        String(row?.[key] ?? row?.[key.toUpperCase()] ?? '').split(',').map(url => url.trim()));
    const previous = new Set(photos(baseline));
    return [...new Set(photos(patch))].filter(url => url.startsWith(plantHealthPhotoRoot) && !previous.has(url));
}

function plantHealthScopeMatches(job) {
    return nativeAuthSessionActive && job.scope === getSupabaseReadIdentityScope() && job.farm === getBloomscapesFarm();
}

function schedulePublishedPlantHealthPhoto(row, patch, baseline, scope) {
    if (!nativeAuthSessionActive || !row || !scope || scope !== getSupabaseReadIdentityScope()) return;
    const uid = String(row.unique_id || row.UNIQUE_ID || '').trim();
    const farm = bloomscapesRowFarm(row);
    if (!uid || farm !== getBloomscapesFarm()) return;
    for (const url of plantHealthPublishedUrls(patch, baseline)) {
        const job = {uid,farm,url,scope};
        const key = JSON.stringify([scope,farm,uid,url]);
        if (plantHealthFlights.has(key)) continue;
        plantHealthFlights.set(key,job);
        plantHealthTail = plantHealthTail.then(() => runPlantHealthPhotoJob(job))
            .catch(error => reportHandledRuntimeIssue('plantHealthPhotoAnalysis', error?.message || 'Photo analysis failed'))
            .finally(() => plantHealthFlights.delete(key));
    }
}

async function runPlantHealthPhotoJob(job) {
    if (!plantHealthScopeMatches(job)) return;
    const {client,owner} = await requireBloomscapesSession();
    await requireBloomscapesOwner(owner);
    if (!plantHealthScopeMatches(job)) return;
    bloomscapesData(await client.rpc('queue_plant_health_photo_v2',{p_farm:job.farm,p_uid:job.uid,p_url:job.url}));
}

async function readPlantHealthQueue(farm,offset) {
    const {client,owner} = await requireBloomscapesSession();
    const data = bloomscapesData(await client.from('plant_health_diagnostics_queue')
        .select('id,warehouse_id,row_uid,photo_url,diagnosis,confidence,analysis_source,calibration_cases,precedent,alternatives,verdict,corrected_diagnosis,sample_id')
        .eq('warehouse_id',farm).eq('analysis_state','flagged').order('created_at',{ascending:false}).order('id').range(offset,offset+50));
    await requireBloomscapesOwner(owner);
    const known = new Map();
    for (const {row_uid} of data) {
        const row = masterInventoryById.get(row_uid);
        if (row && bloomscapesRowFarm(row) === farm) known.set(row_uid,row);
    }
    const missing = data.filter(entry => !known.has(entry.row_uid));
    let fetched = [];
    if (missing.length) {
        const result = await client.from('gnc_all_master_inventory').select('*')
            .eq('warehousei',farm.slice(0,2)).in('unique_id',missing.map(entry => entry.row_uid));
        fetched = formatFetchedRows(bloomscapesData(result),'ph_master_inventory');
    }
    await requireBloomscapesOwner(owner);
    const fresh = new Map(fetched.map(row => [row.UNIQUE_ID,row]));
    return data.map(entry => ({...entry,inventory:known.get(entry.row_uid) || fresh.get(entry.row_uid)}));
}

async function submitPlantHealthReview(entry,verdict,corrected) {
    const {client,owner} = await requireBloomscapesSession();
    if (entry.warehouse_id !== getBloomscapesFarm()) throw new Error('The selected farm changed.');
    const p_queue_id = entry.id;
    const result = verdict === 'sample'
        ? await client.rpc('plant_health_accession_v1',{p_queue_id})
        : await client.rpc('record_plant_health_feedback_v1',{p_queue_id,p_verdict:verdict,
            p_corrected_diagnosis:corrected || null,p_reviewer:currentUser});
    const data = bloomscapesData(result);
    await requireBloomscapesOwner(owner);
    return verdict === 'sample' ? {...entry,sample_id:data} : data;
}

