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
    const nativeHeaders = opts.preferAnon === true ? null : await getNativeAuthRequestHeaders().catch(() => null);
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
    const response = await window.GncDatabase.fetchTable(SUPABASE_URL, safeTable, String(queryString || '').trim(), {
        method: 'GET', headers, signal: opts.signal, cache:'no-store', referrerPolicy:'no-referrer'
    }, timeoutMs, `${safeTable} direct read`);
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
