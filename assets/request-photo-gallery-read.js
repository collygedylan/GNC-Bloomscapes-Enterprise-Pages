function requestGalleryReadOwner() {
    return JSON.stringify([getSupabaseReadIdentityScope(), nativeAuthProfile?.id, getBloomscapesFarm()]);
}

function requireRequestGalleryAccount() {
    if (!nativeAuthSessionActive || !currentUser || !nativeAuthProfile?.id
        || nativeAuthProfile.disabled_at || nativeAuthProfile.active === false
        || nativeAuthProfile.username !== String(currentUser)) throw new Error('Sign in to view this Request gallery.');
    return requestGalleryReadOwner();
}

function requestGalleryText(row, ...names) {
    for (const name of names) {
        const value = row[name] ?? row[name.toUpperCase()];
        if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function requestGalleryPhotoUrls(row) {
    const links = [row.photos, row.req_photo_link, row.REQ_PHOTO_LINK, row.photo_link, row.PHOTO_LINK];
    const urls = links.flatMap(value => getPhotoUrlList(value));
    return [...new Set(urls)].filter(value => {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password
                && (!url.hostname.endsWith('.supabase.co') || url.origin === SUPABASE_URL);
        } catch { return false; }
    });
}

function normalizeRequestGalleryRow(row) {
    return {
        id: requestGalleryText(row, 'unique_id'),
        commonName: requestGalleryText(row, 'commonname', 'common_name', 'itemdescription', 'itemcode'),
        size: requestGalleryText(row, 'contsize', 'container_size'),
        location: requestGalleryText(row, 'locationcode', 'location'),
        spec: requestGalleryText(row, 'req_spec', 'spec'),
        match: requestGalleryText(row, 'req_match', 'loc_match', 'match'),
        avNote: requestGalleryText(row, 'av_note'),
        photos: requestGalleryPhotoUrls(row)
    };
}

async function readRequestPhotoGallery(folderId, rowId = '', options = {}) {
    if (!folderId || !rowId) throw new Error('Request gallery requires an exact completed row.');
    const owner = requireRequestGalleryAccount();
    const session = await getNativeAuthSession();
    if (owner !== requestGalleryReadOwner() || session?.user?.id !== nativeAuthProfile?.id) {
        throw new Error('Your signed-in account changed.');
    }
    const client = getSupabaseBrowserClient();
    if (!client || options.signal?.aborted) throw new Error('Request gallery cancelled.');
    const farm = getBloomscapesFarm();
    const {data, error} = await readRequestGalleryEvidence(client, folderId, rowId, farm, options);
    if (options.signal?.aborted || owner !== requireRequestGalleryAccount()) throw new Error('Request gallery cancelled.');
    if (error) throw new Error(error.message || 'This Request gallery is unavailable for your account.');
    if (data?.folder_id !== folderId || data.farm_code !== getBloomscapesFarm() || !Array.isArray(data.rows)) {
        throw new Error('The Request gallery account and farm could not be confirmed.');
    }
    const rows = data.rows.map(normalizeRequestGalleryRow);
    if (!rows.length || rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== rows.length
        || rowId && !rows.some(row => row.id === rowId)) throw new Error('The requested completed row is unavailable.');
    return {folderId, farm:data.farm_code, rows};
}

async function readRequestGalleryEvidence(client, folderId, rowId, farm, {signal,legacy}) {
    const request = await readRequestGalleryRows(client,folderId,farm,signal);
    if (request.error) return request;
    if (request.data?.length || !legacy) {
        return {data:{folder_id:folderId,farm_code:farm,rows:request.data}};
    }
    return withRequestGallerySignal(signal,deadline =>
        client.rpc('gnc_request_photo_gallery',{p_folder_id:folderId,p_row_id:rowId}).abortSignal(deadline));
}

const REQUEST_GALLERY_COLUMNS = 'unique_id,commonname,contsize,locationcode,req_spec,spec,req_match,'
    + 'av_note,photos,req_photo_link,photo_link,warehouse_id,client_batch_id';

async function readRequestGalleryRows(client,folderId,farm,signal) {
    const request = client.from('gnc_field_jobs_y_grading').select(REQUEST_GALLERY_COLUMNS)
        .eq('client_batch_id',folderId).eq('warehouse_id',farm).eq('record_kind','REQUEST_COMPLETED')
        .order('unique_id').limit(201);
    const result = await withRequestGallerySignal(signal,deadline=>request.abortSignal(deadline));
    if (result.error) return result;
    if (!Array.isArray(result.data) || result.data.length > 200
        || result.data.some(row=>row.client_batch_id!==folderId || row.warehouse_id!==farm)) {
        throw new Error('The completed Request gallery could not be verified.');
    }
    return result;
}

async function withRequestGallerySignal(signal,read) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    const deadline = setTimeout(cancel, 12000);
    signal?.addEventListener('abort', cancel, {once:true});
    try {
        if (signal?.aborted) throw new Error('Request gallery cancelled.');
        return await read(abort.signal);
    } finally {
        clearTimeout(deadline);
        signal?.removeEventListener('abort', cancel);
    }
}
