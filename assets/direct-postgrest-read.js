function stageProductionCoreRows(plan,options) {
    const signal = options.docksVisit ? docksReadSignal(options.docksVisit,options.signal) : options.signal;
    return withProductionLiveSyncSignal(signal,transport=>readProductionCoreRows(plan,options,transport));
}

async function readProductionCoreRows({key,definition,projection,query,pageConcurrency},options,signal) {
    const preparationScope = key === 'master' ? getSupabaseReadIdentityScope() : '';
    const preparationPermission = key === 'master'
        ? String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '') : '';
    const preparationSeason = key === 'master' ? currentMasterPreparationSeasonKey() : '';
    const isAvOpenPreview = key === 'master' && typeof getCurrentVisibleViewId === 'function'
        && getCurrentVisibleViewId() === 'av' && activeAVTab === 'open';
    const readOptions = {
        docksVisit:options.docksVisit,
        signal,
        onFirstPage: options.preview ? (rows,meta)=>previewProductionCoreRows(rows,meta,{key,signal,isAvOpenPreview,
            preparationScope,preparationPermission,preparationSeason,preview:options.preview}) : null
    };
    const rows = key === 'master'
        ? await fetchAllInventoryReadRows('master_page', { dataset: 'master', projection }, {
            ...readOptions, requireComplete: true, limit: 1000,
            ...(options.preview && isAvOpenPreview ? { firstPageLimit: 200 } : {}), pageConcurrency
        })
        : key === 'requests' ? await fetchActiveRequestLiveRows('*', readOptions)
        : await fetchAllSupabaseRows(definition.table, query, { ...readOptions,
            ...(key === 'suspendTag' ? { count: true, requireComplete: true } : {}) });
    if (!Array.isArray(rows)) throw new Error(`${key} returned an invalid data snapshot.`);
    const fieldCoverage = key === 'master' ? String(rows.readMeta?.fieldCoverage || '') : 'full';
    const columns = key === 'master' ? (rows.readMeta?.columns || []) : [];
    if (key === 'master') validateInventoryReadProjection({ projection, fieldCoverage, columns }, { projection });
    const snapshot = key === 'master'
        ? await prepareProductionMasterSnapshot(rows, { signal, identity: preparationScope,
            permissionVersion: preparationPermission, seasonKey: preparationSeason })
        : { rawRows: JSON.parse(JSON.stringify(rows)), payload: buildDatasetPayload(key, rows), rowCount: rows.length };
    return { key, rawRows: snapshot.rawRows, payload: snapshot.payload, rowCount: snapshot.rowCount, projection, fieldCoverage, columns,
        rowCompleteness: 'complete',
        hlOrderInventory: key === 'master' && canUseHlOrder()
            ? { rows, rowCompleteness: 'complete', owner: captureHlOrderOwnership() } : null };
}

async function previewProductionCoreRows(rows,meta,{key,signal,isAvOpenPreview,preparationScope,preparationPermission,preparationSeason,preview}) {
    const previewRows = isAvOpenPreview ? rows.slice(0, 200) : rows;
    const previewSnapshot = key === 'master'
        ? await prepareProductionMasterSnapshot(previewRows, { signal, identity: preparationScope,
            permissionVersion: preparationPermission, seasonKey: preparationSeason, includeRawRows: false })
        : { payload: buildDatasetPayload(key, JSON.parse(JSON.stringify(previewRows))), rowCount: previewRows.length };
    return preview({ key, payload: previewSnapshot.payload, rowCount: previewSnapshot.rowCount,
        partial: true, rowCompleteness: 'partial', projection: meta.projection,
        fieldCoverage: meta.fieldCoverage, columns: meta.columns });
}

async function readWholeSupabaseTable(table,query,options) {
    const {signal}=options;
    if (signal?.aborted) throw Object.assign(new Error('Queued data snapshot read cancelled.'),{code:'REQUEST_ABORTED'});
    const started=beginInternalPerfMeasure();
    const requested=getFullDatasetPageLimit(table), concurrency=getFullDatasetPageConcurrency(table);
    startGlobalProgress();
    try {
        const first=await fetchSupabaseRowsPage(table,query,requested,0,options);
        signal?.throwIfAborted();
        const rows=[...(first.rows || [])], total=first.total;
        const snapshot={rows,pages:rows.length ? 1 : 0};
        if (rows.length) await continueTableSnapshot(snapshot,{table,query,total,requested,concurrency,options});
        signal?.throwIfAborted();
        incrementInternalPerfCounter('datasetFetchPages:'+table,snapshot.pages);
        recordInternalPerfDuration('datasetFetchDurations',started,table);
        if (options.requireComplete) verifyTableSnapshot(rows,total);
        return rows;
    } finally {
        stopGlobalProgress();
    }
}

async function continueTableSnapshot(snapshot,{table,query,total,requested,concurrency,options}) {
    const rows=snapshot.rows;
    await offerFirstTablePage(rows,table,query,total,requested,options);
    const capped=rows.length<requested && (total!=null && total>rows.length || rows.length>=1000);
    const limit=capped ? rows.length : requested;
    const batch=offsets=>fetchSupabaseRowsPageBatch(table,query,limit,offsets,concurrency,options);
    const append=page=>appendTableSnapshotPage(snapshot,page);
    if (total!=null) await readCountedTablePages(rows.length,total,limit,batch,append);
    else if (rows.length>=limit || table==='ph_master_inventory') await readUncountedTablePages(rows.length,limit,concurrency,batch,append);
}

function appendTableSnapshotPage(snapshot,page) {
    if (!page.rows?.length) return;
    for (const row of page.rows) snapshot.rows.push(row);
    snapshot.pages++;
}

async function offerFirstTablePage(rows,table,query,total,limit,options) {
    if (typeof options.onFirstPage==='function') {
        try { await options.onFirstPage(rows.slice(),{table,query,total,limit,loaded:rows.length}); }
        catch (error) {
            if (options.signal?.aborted) throw error;
            console.warn('First page render hydration failed.',error);
        }
    }
    await yieldToUiFrame();
}

async function readCountedTablePages(start,total,limit,batch,append) {
    if (start>=total) return;
    const offsets=[];
    for (let offset=limit;offset<total;offset+=limit) offsets.push(offset);
    for (const page of await batch(offsets)) append(page);
}

async function readUncountedTablePages(start,limit,concurrency,batch,append) {
    let offset=start;
    for (;;) {
        const offsets=Array.from({length:concurrency},(_,index)=>offset+index*limit);
        const pages=await batch(offsets);
        if (!pages.length) return;
        for (const page of pages) {
            append(page);
            if ((page.rows?.length || 0)<limit) return;
            offset=page.offset+limit;
        }
    }
}

function verifyTableSnapshot(rows,total) {
    const ids=rows.map(row=>String(row.unique_id || '').trim());
    if (total==null || total!==rows.length || ids.some(id=>!id) || new Set(ids).size!==ids.length) {
        throw new Error('Complete source rows could not be verified. Retry the report.');
    }
}

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
