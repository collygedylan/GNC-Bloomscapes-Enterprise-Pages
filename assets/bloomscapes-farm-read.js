function suspendItemCodeFilter(codes) {
    if (!Array.isArray(codes) || !codes.length || codes.length>32) throw Error('Invalid item read batch.');
    return 'in.('+codes.map(code=>JSON.stringify(String(code))).join(',')+')';
}

async function fetchDirectMasterInventoryItemRows(itemCode = '', options = {}) {
    const codes=Array.isArray(itemCode) ? itemCode : [String(itemCode || '').trim()].filter(Boolean);
    if (!codes.length) return [];
    const requested=new Set(codes), rows=[];
    const safeItemCode=codes.length===1 ? codes[0] : '';
    const readPage=opts=>safeItemCode ? fetchDirectMasterInventoryPage({ projection: 'full', itemCode: safeItemCode }, 100, 0, opts)
        : fetchDirectMasterInventoryPage({projection:'full',itemCodes:codes},500,0,opts);
    let afterUniqueId='';
    for (let pageNumber=0;pageNumber<100;pageNumber++) {
        if (options.signal?.aborted) throw Object.assign(new Error('Inventory item read cancelled.'),{code:'REQUEST_ABORTED'});
        const page=await readPage(afterUniqueId ? {...options,afterUniqueId} : options);
        validateInventoryReadProjection(page,{projection:'full'});
        if (page.rows.some(row=>!requested.has(String(row.itemcode || '').trim()))) throw Error('Inventory item response escaped its exact filter.');
        rows.push(...page.rows);
        if (page.rows.length<page.limit) {
            return verifyCompleteMasterItemRows(rows);
        }
        const next=String(page.rows.at(-1)?.unique_id || '').trim();
        if (!next || next===afterUniqueId) throw Error('Inventory item keyset boundary was invalid.');
        afterUniqueId=next;
        await yieldToUiFrame();
    }
    throw Error('Inventory item response exceeded the safe page limit.');
}

function verifyCompleteMasterItemRows(rows) {
    const ids=rows.map(row=>String(row.unique_id || '').trim());
    if (ids.some(id=>!id) || new Set(ids).size !== ids.length) throw Error('Inventory item rows could not be verified.');
    return rows;
}

async function readSuspendItemNotePages(codes,farm,signal) {
    const query=new URLSearchParams({select:'*',warehouse_id:'eq.'+farm,itemcode:suspendItemCodeFilter(codes),
        order:'unique_id.asc',limit:'500'});
    const requested=new Set(codes), rows=[];
    for (let page=0;page<100;page++) {
        query.set('offset',String(page*500));
        const result=await fetchAuthenticatedSupabaseReadPage('ph_location_sales_notes',query.toString(),{signal});
        if (!Array.isArray(result?.rows) || result.rows.some(row=>row.warehouse_id!==farm || !requested.has(row.itemcode))) {
            throw Error('Location evidence escaped the requested farm or items.');
        }
        rows.push(...result.rows);
        if (result.rows.length<500) return rows;
    }
    throw Error('Location evidence exceeded the safe page limit.');
}

async function readSuspendItemBatch(codes,farm) {
    const hasLocalMaster=hasCompleteRequestOptionSnapshot();
    const local=code=>getRequestSharedInventoryOptionRows({ITEMCODE:code}).filter(row=>getRequestItemCodeOptionItemCode(row)===code);
    const request={retainOnGenerationChange:true,signal:null,maxAttempts:1};
    const key=JSON.stringify([farm,codes]);
    const readMaster=({signal})=>fetchDirectMasterInventoryItemRows(codes,{signal});
    const master=hasLocalMaster ? codes.flatMap(local) : codes.length===1 ? fetchRequestItemCodeOptionRowsFromSupabase(codes[0])
        : runDedupeSupabaseRead('suspend-master:'+key,readMaster,request);
    const notes=runDedupeSupabaseRead('suspend-location-evidence:'+key,({signal})=>readSuspendItemNotePages(codes,farm,signal),request)
        .catch(error=>({error}));
    const [rows,evidence]=await Promise.all([master,notes]);
    return {rows,evidence,hasLocalMaster};
}

async function fetchAuthenticatedSupabaseReadPage(table, queryString = '', options = {}) {
    const safeTable = normalizeAppTableName(table);
    const farmRead=bloomscapesFarmReadContract(safeTable,getBloomscapesFarm());
    if (farmRead) {
        const query=new URLSearchParams(String(queryString || '').replace(/^\?/,''));
        if (farmRead.code) query.set(farmRead.column,'eq.'+farmRead.code);
        return fetchDirectPostgrestReadPage(farmRead.table,query.toString(),options,false);
    }
    if (safeTable === 'ph_customer_consignee_sales_reps' && !hasAuthenticatedOperationalReadIdentity()) {
        throw Object.assign(new Error('Customer mappings load after an authenticated session is ready.'), { code: 'DATASET_AUTH_REQUIRED' });
    }
    if (safeTable === 'ph_master_inventory' && /^\s*select=filename,last_updated(?:&|$)/i.test(String(queryString || ''))) {
        const freshness = await requestInventoryRead('source_freshness', {}, { signal: options.signal, timeoutMs: options.timeoutMs, label: 'Drive source freshness' });
        const hasFreshness = freshness && typeof freshness === 'object' && (freshness.filename != null || freshness.last_updated != null);
        const row = hasFreshness ? freshness : null;
        return { rows: row ? [row] : [], total: row ? 1 : 0, authSource: 'app-api' };
    }
    if (isDirectPostgrestReadTable(safeTable)) {
        return await fetchDirectPostgrestReadPage(safeTable, queryString, options, true);
    }
    if (getAuthorizedDatasetRead(safeTable)) {
        const params = new URLSearchParams(String(queryString || '').replace(/^\?/, ''));
        const requestedLimit = Math.max(1, Math.min(500, Number(params.get('limit')) || 500));
        const requestedOffset = Math.max(0, Number(params.get('offset')) || 0);
        return await requestAuthorizedDatasetReadPage(safeTable, queryString, requestedLimit, requestedOffset, options);
    }
    if (getAvReadDataset(safeTable, queryString)) return requestAvReadPage(safeTable, queryString, options);
    if (safeTable === 'ph_master_inventory') throw new Error('Raw browser inventory reads are disabled; use inventory_read operations.');
    const opts = options && typeof options === 'object' ? options : {};
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || SUPABASE_READ_TIMEOUT_MS);
    if (opts.signal?.aborted) throw Object.assign(new Error(`${safeTable} read cancelled.`), { code: 'REQUEST_ABORTED' });
    const direct = await fetchDirectPostgrestReadPage(safeTable, queryString, opts, false);
    if (direct) return direct;
    if (nativeReadRequiresRls()) throw nativeSessionRecoveryError();

    const rows = await runAppApiSupabaseWrite(safeTable, 'GET', null, String(queryString || '').trim(), { timeoutMs, signal: opts.signal });
    if (!Array.isArray(rows)) throw new Error(`${safeTable} returned an invalid row response; previous verified data was retained.`);
    return {
        rows,
        total: null,
        authSource: 'app-api'
    };
}

function bloomscapesFarmReadContract(table,farm) {
    if (['ph_inventory_row_assignments','ph_itemcode_default_owners','ph_dock_item_status'].includes(table)) {
        return {table,column:'farm_code',code:farm};
    }
    if (table==='ph_warehouse_assigned_items') return {table:'gnc_all_warehouse_assigned_items',column:'warehousei',code:farm.slice(0,2)};
    if (farm==='10-PH') return null;
    if (!['60-HL','20-TX','40-NC'].includes(farm)) throw new Error('Invalid inventory farm scope.');
    const contracts={
        ph_master_inventory:['gnc_all_master_inventory','warehousei'],
        ph_soc_master:['gnc_all_soc_master','warehouseid'],
        ph_reserves:['gnc_all_reserves','warehouseid'],
        ph_cav_import:['gnc_all_cav_import','warehouseid']
    };
    const contract=contracts[table];
    if (!contract) return null;
    return {table:contract[0],column:contract[1],code:farm.slice(0,2)};
}

async function fetchDirectMasterInventoryPage(params = {}, limit = INITIAL_PAGE_LIMIT, offset = 0, options = {}) {
    const projection = String(params.projection || '').trim().toLowerCase();
    const contract = window.AgMetricInventoryList;
    const columns = projection === 'full' ? (contract?.readColumns || contract?.physicalColumns) : contract?.columns;
    if (!['browse', 'full'].includes(projection) || !Array.isArray(columns) || !columns.length) {
        throw new Error('Direct inventory projection is unavailable.');
    }
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit) || INITIAL_PAGE_LIMIT)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const afterUniqueId = String(options.afterUniqueId || '').trim();
    const itemCode = String(params.itemCode || '').trim();
    const pageBoundary = afterUniqueId
        ? `unique_id=gt.${encodeURIComponent(afterUniqueId)}`
        : `offset=${safeOffset}`;
    const itemFilter = params.itemCodes?.length ? '&itemcode='+encodeURIComponent(suspendItemCodeFilter(params.itemCodes))
        : itemCode ? `&itemcode=eq.${encodeURIComponent(itemCode)}` : '';
    const exactUid = String(params.uniqueId || '').trim();
    const uidFilter = exactUid ? '&unique_id=eq.' + encodeURIComponent(exactUid) : '';
    const seasonFilter = params.dataset === 'avOpen' ? '&season=in.(F1,S1,U1,U2)' : '';
    const query = `select=${columns.join(',')}&order=unique_id.asc&limit=${safeLimit}&${pageBoundary}${itemFilter}${uidFilter}${seasonFilter}`;
    const page = await fetchAuthenticatedSupabaseReadPage('ph_master_inventory', query, {
        timeoutMs: Number(options.timeoutMs) || SUPABASE_READ_TIMEOUT_MS,
        count: false,
        inventoryCsvColumns: columns,
        signal: options.signal
    });
    const total = exactUid && !safeOffset ? page.rows.length : page.total == null ? null : Number(page.total);
    return {
        rows: page.rows,
        total: Number.isFinite(total) ? total : null,
        offset: safeOffset,
        limit: safeLimit,
        hasMore: Number.isFinite(total) ? safeOffset + page.rows.length < total : page.rows.length === safeLimit,
        projection,
        fieldCoverage: projection,
        columns: columns.slice()
    };
}

async function fetchInventoryReadPage(operation, params = {}, limit = INITIAL_PAGE_LIMIT, offset = 0, options = {}) {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || INITIAL_PAGE_LIMIT)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const exactLookup = params.dataset === 'lookup' && !!String(params.uniqueId || '').trim() && nativeAuthSessionActive;
    if (operation === 'master_page' && (['master','avopen'].includes(String(params.dataset || '').trim().toLowerCase()) || exactLookup)
        && ['browse', 'full'].includes(String(params.projection || '').trim().toLowerCase())) {
        return fetchDirectMasterInventoryPage(params, limit, safeOffset, options);
    }
    const scopedParams = operation==='master_page' ? bloomscapesInventoryReadParameters(params) : params;
    const result = await requestInventoryRead(operation, { ...scopedParams, limit: safeLimit, offset: safeOffset }, options);
    if (!result || !Array.isArray(result.rows)) throw new Error('Inventory data returned an invalid page; verified cached rows were retained.');
    validateInventoryReadProjection(result, params);
    const total = result.total === null || result.total === undefined ? null : Number(result.total);
    return { rows: result.rows, total: Number.isFinite(total) ? total : null, offset: safeOffset, limit: safeLimit, hasMore: result.hasMore === true,
        projection: String(result.projection || params.projection || '').trim(),
        fieldCoverage: String(result.fieldCoverage || '').trim(),
        columns: Array.isArray(result.columns) ? result.columns.slice() : [] };
}

function bloomscapesInventoryReadParameters(params) {
    const contract = window.AgMetricInventoryList;
    const columns = params.projection==='full' ? contract?.readColumns || contract?.physicalColumns
        : params.projection==='browse' ? contract?.columns : null;
    return {...params,farm_code:getBloomscapesFarm(),...(columns ? {columns} : {})};
}
