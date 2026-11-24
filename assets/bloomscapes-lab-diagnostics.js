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

async function readPlantHealthQueue(farm,offset,selection) {
    const {client,owner} = await requireBloomscapesSession();
    let query = client.from('plant_health_diagnostics_queue')
        .select('id,warehouse_id,row_uid,photo_url,diagnosis,confidence,analysis_source,calibration_cases,precedent,alternatives,verdict,corrected_diagnosis,sample_id')
        .eq('warehouse_id',farm).eq('analysis_state','flagged');
    if (selection) query=query.in('row_uid',selection);
    const data=bloomscapesData(await query.order('created_at',{ascending:false}).order('id').range(offset,offset+50));
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

const plantPhotoScanRoles = new Set(['super-admin','admin','manager','grower','qc','qc-supervisor','eval','evaluator']);
const plantPhotoPageSize = 120;
const plantPhotoReadTtl = 60_000;
let plantPhotoState;

function bloomscapesPhotoScanScope() {
    if (!nativeAuthSessionActive || isBloomscapesDriveTour()) return null;
    const preview = borrowedHelpPreview();
    const profile = preview || nativeAuthProfile;
    const role = String(profile?.role || '').replaceAll('_','-');
    if (!plantPhotoScanRoles.has(role)) return null;
    const grant = profile?.area_access?.lab;
    const matrix = resolveUserAccessMatrix(profile.username);
    if (matrix?.view_permissions?.view_qc === 'N' || grant === 'HIDDEN') return null;
    if (preview && !['VIEW_ONLY','FULL_EDIT'].includes(grant)) return null;
    const farm = getBloomscapesFarm();
    const owner = getSupabaseReadIdentityScope();
    return farm && owner ? {farm,owner,key:JSON.stringify([owner,farm,preview?.id || '']),preview:Boolean(preview)} : null;
}

function currentBloomscapesPhotoScanState(scope = bloomscapesPhotoScanScope()) {
    if (!scope) return null;
    if (plantPhotoState?.key !== scope.key) {
        plantPhotoState = {...scope,rows:[],byRow:new Map(),canReview:false,refreshedAt:0,retryAt:0};
    }
    return plantPhotoState;
}

function plantPhotoStateCurrent(state) {
    return plantPhotoState === state && bloomscapesPhotoScanScope()?.key === state.key;
}

function reindexPlantPhotoScans(state,rows) {
    const byRow = new Map();
    for (const row of rows) {
        if (!row.row_uid) continue;
        if (!byRow.has(row.row_uid)) byRow.set(row.row_uid,[]);
        byRow.get(row.row_uid).push(row);
    }
    state.rows = rows;
    state.byRow = byRow;
}

async function readPlantPhotoScans(state,onFirstPage) {
    const {client,owner} = await requireBloomscapesSession();
    const rows = new Map();
    let offset = 0;
    let received;
    do {
        if (!plantPhotoStateCurrent(state)) return null;
        const receipt = bloomscapesData(await client.rpc('list_photo_ai_scans_v1',{
            p_warehouse:state.farm,p_offset:offset,p_limit:plantPhotoPageSize
        }));
        await requireBloomscapesOwner(owner);
        if (!plantPhotoStateCurrent(state)) return null;
        state.canReview = receipt.can_review === true && !state.preview;
        state.canSample = receipt.can_sample === true && state.canReview;
        if (!receipt.allowed) {
            reindexPlantPhotoScans(state,[]);
            return state;
        }
        received = receipt.rows;
        received.forEach(row => rows.set(row.scan_id,row));
        if (offset === 0 && !state.rows.length) {
            reindexPlantPhotoScans(state,[...rows.values()]);
            onFirstPage?.(state);
        }
        offset += received.length;
    } while (received.length === plantPhotoPageSize);
    reindexPlantPhotoScans(state,[...rows.values()]);
    return state;
}

function loadBloomscapesPhotoScans(state,onFirstPage) {
    if (!state || !plantPhotoStateCurrent(state)) return Promise.resolve(null);
    if (state.flight) return state.flight;
    if (Math.max(state.refreshedAt+plantPhotoReadTtl,state.retryAt)>Date.now()) return Promise.resolve(state);
    state.flight = readPlantPhotoScans(state,onFirstPage).then(receipt => {
        if (receipt) {
            state.refreshedAt = Date.now();
            state.error = '';
        }
        return receipt;
    }).catch(error => {
        if (!plantPhotoStateCurrent(state)) return null;
        state.error = error.message || 'Photo scans could not be refreshed.';
        state.retryAt = Date.now()+plantPhotoReadTtl;
        return state;
    }).finally(() => {state.flight = null;});
    return state.flight;
}

async function reviewBloomscapesPhotoScan(state,row,disposition) {
    if (!plantPhotoStateCurrent(state) || !state.canReview || row.warehouse!==state.farm) {
        throw new Error('Photo review access changed.');
    }
    const {client,owner} = await requireBloomscapesSession();
    const data = bloomscapesData(await client.rpc('update_photo_ai_scan_disposition_v1',{
        p_scan_id:row.scan_id,p_disposition:disposition
    }));
    await requireBloomscapesOwner(owner);
    if (!plantPhotoStateCurrent(state)) return null;
    if (data.scan_id !== row.scan_id || data.disposition !== disposition) throw new Error('Photo review receipt did not match.');
    const updated = {...row,...data};
    reindexPlantPhotoScans(state,state.rows.map(entry=>entry.scan_id===row.scan_id ? updated : entry));
    return updated;
}

async function getBloomscapesPhotoScanImage(state,row) {
    if (!plantPhotoStateCurrent(state) || row.warehouse!==state.farm) return '';
    if (row.storage_bucket==='bloomscapes-evaluation-photos') return row.photo_url;
    const {client,owner} = await requireBloomscapesSession();
    const link = bloomscapesData(await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path,120));
    await requireBloomscapesOwner(owner);
    return plantPhotoStateCurrent(state) ? link.signedUrl : '';
}
