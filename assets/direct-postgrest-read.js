async function sendPassiveNativeRead(send, headers, signal) {
    const owner = getSupabaseReadIdentityScope();
    const epoch = nativeAuthRecoveryEpoch;
    const permission = getPassiveNativeReadPermissionVersion();
    const current = () => !signal?.aborted && epoch === nativeAuthRecoveryEpoch && owner === getSupabaseReadIdentityScope()
        && permission === getPassiveNativeReadPermissionVersion();
    if (!current()) throw staleSupabaseReadScopeError();
    let response = await send(headers);
    if (response.status === 401 && headers?.Authorization && current()) {
        const failure = await response.clone().json().catch(() => null);
        if (current() && ['PGRST301','PGRST303','AUTH_REQUIRED'].includes(failure?.code)) {
            const passive = getPassiveNativeAuthRequestHeaders();
            const latest = passive?.Authorization !== headers.Authorization ? passive : null;
            const refreshed = latest || await getNativeAuthRequestHeaders(true);
            if (refreshed?.Authorization && current()) response = await send(refreshed);
        }
    }
    if (!current()) throw staleSupabaseReadScopeError();
    return response;
}

function getPassiveNativeReadPermissionVersion() {
    return typeof appAccessSnapshotState === 'undefined' ? '' : appAccessSnapshotState.snapshot?.dataPermissionVersion || '';
}

async function fetchDirectPostgrestReadPage(table, queryString = '', options = {}, allowAnonFallback = false) {
    const safeTable = normalizeAppTableName(table);
    const authenticatedOnlyTable = ['ph_itemcode_default_owners', 'ph_requests_pending', 'ph_active_request', 'ph_active_suspend', 'ph_request_queue_live_rows', 'ph_active_request_live_rows'].includes(safeTable) || safeTable === 'ph_master_inventory'
        || safeTable === 'ph_customer_consignee_sales_reps'
        || safeTable === 'ph_soc_master'
        || safeTable === WAREHOUSE_ASSIGNED_ITEMS_TABLE
        || safeTable === 'ph_warehouse_assigned_items';
    if (authenticatedOnlyTable && !hasAuthenticatedOperationalReadIdentity()) {
        throw Object.assign(new Error(`${safeTable} read requires the active authenticated account.`), { code: 'DATASET_AUTH_REQUIRED' });
    }
    const opts = options && typeof options === 'object' ? options : {};
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || SUPABASE_READ_TIMEOUT_MS);
    const nativeHeaders = opts.preferAnon === true ? null : getPassiveNativeAuthRequestHeaders();
    if (opts.signal?.aborted) throw Object.assign(new Error(`${safeTable} read cancelled.`), { code: 'REQUEST_ABORTED' });
    if (!nativeHeaders && authenticatedOnlyTable) throw nativeSessionRecoveryError();
    if (!nativeHeaders && !allowAnonFallback) return null;
    const headers = nativeHeaders ? { ...nativeHeaders } : {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
    };
    headers['Cache-Control'] = 'private, no-store';
    if (opts.count === true) headers.Prefer = 'count=exact';
    const inventoryCsvColumns = safeTable === 'ph_master_inventory' && Array.isArray(opts.inventoryCsvColumns)
        && window.GncDatabase.supportsInventoryCsv === true
        && typeof window.AgMetricInventoryList?.decodeCsvRows === 'function' ? opts.inventoryCsvColumns : null;
    if (inventoryCsvColumns) headers.Accept = 'text/csv';
    const send = (authorization) => window.GncDatabase.fetchTable(SUPABASE_URL, safeTable, String(queryString || '').trim(), {
        method: 'GET', headers: { ...headers, ...authorization }, signal: opts.signal, cache:'no-store', referrerPolicy:'no-referrer'
    }, timeoutMs, `${safeTable} direct read`);
    const response = nativeHeaders ? await sendPassiveNativeRead(send,nativeHeaders,opts.signal) : await send();
    if (!response.ok) throw Object.assign(await createSupabaseReadResponseError(response, 'Supabase direct read failed'),
        {tableName:safeTable,status:response.status});
    let rows = response.__gncValidatedData;
    if (!Array.isArray(rows)) {
        const text = await response.text();
        rows = text ? inventoryCsvColumns && String(response.headers?.get?.('Content-Type') || '').toLowerCase().includes('text/csv')
            ? window.AgMetricInventoryList.decodeCsvRows(text, inventoryCsvColumns) : JSON.parse(text) : [];
    }
    if (!Array.isArray(rows)) throw new Error(`${safeTable} returned an invalid row response; previous verified data was retained.`);
    return { rows, total: parseSupabaseContentRangeTotal(response), authSource: nativeHeaders ? 'native' : 'anon' };
}

async function readLegacySupabaseRows(table, query, options) {
    const readKey = `legacy:${table}:${String(query || '').trim()}`;
    try {
        return await runDedupeSupabaseRead(readKey, ({signal}) => readLegacySupabasePages(table,query,options,signal),
            { signal:options?.signal || null });
    } catch (error) {
        console.warn(`Supabase read failed for ${table}.`,error);
        throw error;
    }
}

async function readLegacySupabasePages(table,query,options,signal) {
    const headers = getPassiveNativeAuthRequestHeaders();
    const owner = getSupabaseReadIdentityScope();
    const permission = getPassiveNativeReadPermissionVersion();
    if (!headers && nativeReadRequiresRls()) throw nativeSessionRecoveryError();
    if (signal?.aborted) throw Object.assign(new Error(`${table} read cancelled.`), { code:'REQUEST_ABORTED' });
    const timeoutMs = Math.max(1000,Number(options?.timeoutMs) || SUPABASE_READ_TIMEOUT_MS);
    startGlobalProgress();
    try {
        if (headers && table==='ph_app_users') return await fetchNativeAppUserDirectory(headers,query,timeoutMs,signal || null);
        const rows = [];
        for (let offset=0;;offset=rows.length) {
            if (signal?.aborted || owner!==getSupabaseReadIdentityScope()
                || permission!==getPassiveNativeReadPermissionVersion()) throw staleSupabaseReadScopeError();
            const limit = 1000;
            const pageQuery = query ? `${query}&limit=${limit}&offset=${offset}` : `limit=${limit}&offset=${offset}`;
            const page = headers
                ? await sendLegacySupabasePage(table,pageQuery,getPassiveNativeAuthRequestHeaders() || headers,signal,timeoutMs)
                : await runAppApiSupabaseWrite(table,'GET',null,pageQuery,{timeoutMs,signal});
            if (!Array.isArray(page) || !page.length) return rows;
            rows.push(...page);
            if (page.length<limit) return rows;
        }
    } finally {
        stopGlobalProgress();
    }
}

async function sendLegacySupabasePage(table,query,headers,signal,timeoutMs) {
    return runWithFullJitter(async attempt => {
        const send = authorization => window.GncDatabase.fetchTable(SUPABASE_URL,table,query,{
            method:'GET',headers:{...authorization,'x-retry-count':String(attempt)},signal
        },timeoutMs,`${table} read`);
        const response = await sendPassiveNativeRead(send,headers,signal);
        if (!response.ok) throw await createSupabaseReadResponseError(response,'Supabase read failed');
        const text = await response.text();
        return text ? JSON.parse(text) : [];
    },0,500,8000);
}
