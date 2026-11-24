async function prepareProductionMasterSnapshot(sourceRows = [], options = {}) {
    const identity = String(options.identity || getSupabaseReadIdentityScope());
    const permissionVersion = String(options.permissionVersion ?? appAccessSnapshotState.snapshot?.dataPermissionVersion ?? '');
    const seasonKey = String(options.seasonKey || currentMasterPreparationSeasonKey());
    const assertCurrent = options.assertCurrent || (() => assertMasterPreparationCurrent(identity,permissionVersion,seasonKey,options.signal));
    const context = {rawRows:[],displayRows:[],avOpenRows:[],avOpenByMasterId:new Map(),
        indexMaps:createMasterInventoryIndexMaps(),driveReportFacts:new WeakMap(),inheritanceCandidates:{ncr:[],moved:[]},
        reportYear:typeof normalizeEvalReportSalesYear === 'function' ? normalizeEvalReportSalesYear(getConfiguredCurrentSalesYearCode()) ?? 2027 : 2027};
    const rows = Array.isArray(sourceRows) ? sourceRows : [];
    const limit = Number.isInteger(options.limit) ? Math.max(0,Math.min(rows.length,options.limit)) : rows.length;
    await prepareMasterDisplayBatches(rows.slice(0,limit),context,assertCurrent,options);
    if (options.checkpoint) await options.checkpoint();
    await prepareMasterSeasonAssignments(context.displayRows,assertCurrent);
    if (options.checkpoint) await options.checkpoint();
    await prepareMasterAvBatches(context,assertCurrent,options.checkpoint);
    assertCurrent();
    preparedMasterRows.set(context.displayRows,{identity,permissionVersion,seasonKey,...context});
    return {rawRows:context.rawRows,payload:{data:context.displayRows},rowCount:context.displayRows.length};
}

async function prepareMasterDisplayBatches(rows,context,assertCurrent,{includeRawRows,checkpoint,isolatedRows}) {
    const yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    for (let offset=0;offset<rows.length;offset+=MASTER_PREPARATION_BATCH_SIZE) {
        assertCurrent();
        const batch = rows.slice(offset,offset+MASTER_PREPARATION_BATCH_SIZE);
        if (includeRawRows!==false) context.rawRows.push(...JSON.parse(JSON.stringify(batch)));
        const formatted = formatFetchedRows(isolatedRows ? batch : JSON.parse(JSON.stringify(batch)),'ph_master_inventory',offset);
        formatted.forEach((item,index) => {
            normalizePreparedInventoryText(item);
            prepareMasterDriveReportFacts(context,item);
            item.DOM_ID = 'fi_'+(offset+index);
            addMasterInventoryRowToIndexes(context.indexMaps,item);
            if (hasNcrLocationNote(item)) context.inheritanceCandidates.ncr.push(item);
            if (isMovedSeasonAvSourceSeason(item)) context.inheritanceCandidates.moved.push(item);
            context.displayRows.push(item);
        });
        const pause = yieldIfNeeded(batch.length);
        if (pause) {
            await pause;
            if (checkpoint) await checkpoint();
        }
    }
}

function prepareMasterDriveReportFacts(context,item) {
    if (typeof prepareEvalReportRowFacts !== 'function') return;
    const crop = prepareEvalReportRowFacts(item);
    stampEvalRoleReportMask(item,context.reportYear,crop);
    const cleanCommonName = getDrivePlantCommonName(item);
    const sizeKey = getDrivePlantContSize(item);
    if (typeof buildDriveSearchKey === 'function') item._searchKey = buildDriveSearchKey(item,cleanCommonName,sizeKey);
    context.driveReportFacts.set(item,{...crop,cleanCommonName,sizeKey});
}

function normalizePreparedInventoryText(item) {
    for (const field of ['COMMONNAME','DESCRIPTION','SPEC','AV_NOTE']) {
        const text = item[field];
        if (typeof text === 'string' && text.includes('\\')) item[field] = normalizeEscapedDisplayText(text);
    }
}

async function prepareMasterAvBatches(context,assertCurrent,checkpoint) {
    const masterById = new Map(context.displayRows.map(item=>[String(item?.UNIQUE_ID || '').trim(),item]));
    const yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    for (const master of context.displayRows) {
        assertCurrent();
        if (master && shouldIncludeMasterItemInAvSeasonView(master)) prepareMasterAvRow(master,masterById,context);
        const pause = yieldIfNeeded();
        if (pause) {
            await pause;
            if (checkpoint) await checkpoint();
        }
    }
}

function prepareMasterAvRow(master,masterById,context) {
    const item = {...master};
    const id = String(item.UNIQUE_ID || '').trim();
    syncMasterFieldsToRow(masterById.get(id) || findLinkedMasterRow(item) || master,item,EXACT_ROW_SYNC_KEYS,{attachMasterLink:false});
    if (!isEvalScopedDataRowVisibleToCurrentUser(item) || !shouldIncludeMasterItemInAvSeasonView(item)) return;
    item.DOM_ID = 'avo_'+(item.UNIQUE_ID || context.avOpenRows.length);
    context.avOpenByMasterId.set(id,item);
    context.avOpenRows.push(item);
}

function takePreparedMasterIndexMaps(prepared, rowsUnchanged = false) {
    if (!rowsUnchanged || !prepared?.indexMaps || prepared.indexesConsumed) return null;
    prepared.indexesConsumed = true;
    return prepared.indexMaps;
}

async function persistCompleteDirectMasterDisplay(rows) {
    const read = rows.readMeta;
    if (!rows.length || read?.rowCompleteness !== 'complete' || read.fieldCoverage !== 'full'
        || Number(read.total) !== rows.length || !nativeAuthSessionActive || hasConfirmedCurrentAccountRevocation()) return;
    const context = getProductionLiveSyncContext();
    if (!context.authenticated || context.accessDenied || !context.dataPermissionSnapshotFresh) return;
    const adapter = createProductionCoreLiveAdapter('master','full');
    const meta = {contractVersion:1,scope:context.scope,adapterId:adapter.id,cacheKey:adapter.cacheKey,
        dataPermissionVersion:context.dataPermissionVersion};
    const previous = await loadCacheValue(verifiedSnapshotCacheKey(meta));
    if (context.readIdentity !== getSupabaseReadIdentityScope()
        || context.dataPermissionVersion !== getAppAccessSnapshot()?.dataPermissionVersion
        || hasConfirmedCurrentAccountRevocation()) return;
    if (previous?.meta?.dataPermissionVersion === meta.dataPermissionVersion && previous.rowCompleteness === 'complete') return;
    await writeProductionVerifiedSnapshot(adapter,{...read,key:'master',rawRows:rows,rowCount:rows.length},meta);
}

function buildDirectMasterDatasetPayload(rows) {
    void persistCompleteDirectMasterDisplay(rows);
    const formatted = formatFetchedRows(rows,DATASET_DEFINITIONS.master.sourceTable);
    if (rows.readMeta) Object.defineProperty(formatted,'readMeta',{value:rows.readMeta,configurable:true});
    return {data:formatted};
}

function hasVerifiedBloomscapesFarmPermission() {
    const access = appAccessSnapshotState;
    return access.status==='ready' && !access.stale && access.snapshot?.dataPermissionVersion
        && access.profileId===nativeAuthProfile?.id && access.authEpoch===productionLiveSyncReadAuthEpoch
        && access.username===getRequestCapabilityUsernameKey(currentUser);
}

let bloomscapesBootMasterRead;

function restoreBloomscapesBootMaster() {
    if (!canUseProductionLiveSync() || !bloomscapesFarmState.loaded || !bloomscapesFarmState.confirmed
        || !canAccessView('drive') && !canAccessView('av') || getDatasetRenderRowCount('master') > 0) return false;
    const context = getProductionLiveSyncContext();
    if (!context.authenticated || context.accessDenied || !context.dataPermissionVersion) return false;
    const key = JSON.stringify([context.readIdentity,context.dataPermissionVersion]);
    if (bloomscapesBootMasterRead?.key === key) return bloomscapesBootMasterRead.promise;
    const flight = {key,promise:readBloomscapesBootMaster(context).finally(()=>{
        if (bloomscapesBootMasterRead === flight) bloomscapesBootMasterRead = null;
    })};
    bloomscapesBootMasterRead = flight;
    return flight.promise;
}

async function readBloomscapesBootMaster(context) {
    try {
        const adapter = createProductionCoreLiveAdapter('master','full');
        const meta = {contractVersion:1,scope:context.scope,adapterId:adapter.id,cacheKey:adapter.cacheKey,
            dataPermissionVersion:context.dataPermissionVersion};
        const saved = await readProductionDisplaySnapshot(adapter,meta,{boot:true});
        return applyColdOperationalDisplay('master',saved,context);
    } catch (error) {
        window.GncRuntimeWatchdog?.capture?.(error,'operational-display-cache');
        return false;
    }
}

async function startBloomscapesCachedBoot(view) {
    const owner = getSupabaseReadIdentityScope();
    if (!canUseProductionLiveSync()) return;
    try {
        if (bloomscapesFarmState.confirmed) {
            hydrateBloomscapesReferenceSnapshot();
            await restoreBloomscapesBootMaster();
        }
        await warmColdOperationalDisplay();
    } finally {
        if (owner === getSupabaseReadIdentityScope() && !hasConfirmedCurrentAccountRevocation()) {
            ensureColdOperationalHydration(view);
        }
    }
}

async function readProductionDisplaySnapshot(adapter, meta, {boot = false} = {}) {
    if (!adapter.id.startsWith('core:') && !PRODUCTION_DISPLAY_CACHE_SIDE_ADAPTERS.has(adapter.id)) return null;
    const owner = getSupabaseReadIdentityScope();
    const saved = await loadCacheValue(verifiedSnapshotCacheKey(meta));
    if (owner !== getSupabaseReadIdentityScope() || !saved || saved.meta?.contractVersion !== meta.contractVersion
        || saved.meta?.scope !== meta.scope
        || saved.meta?.cacheKey !== meta.cacheKey || saved.meta?.adapterId !== meta.adapterId) return null;
    if (!meta.dataPermissionVersion || String(saved.meta.dataPermissionVersion || '') !== String(meta.dataPermissionVersion)) return null;
    const displayKey = productionDisplayGroupKey();
    const noteVerifiedAt = () => {
        if (!saved.verifiedAt || !Number.isFinite(Date.parse(saved.verifiedAt))) return;
        productionDisplaySnapshotTimes.set(`${displayKey}\u001f${adapter.id}`, String(saved.verifiedAt));
    };
    if (adapter.id.startsWith('side:')) {
        if (saved.format !== 'verified-display-v1' || !isBoundedProductionSideDisplayValue(adapter, saved.value)) return null;
        noteVerifiedAt();
        return deserializeProductionSideDisplayValue(adapter, saved.value);
    }
    if (saved.format !== 'verified-raw-v1' || !Array.isArray(saved.rawRows) || saved.rowCount !== saved.rawRows.length) return null;
    const key = adapter.id.slice(5);
    if (key === 'master') {
        if (saved.rowCompleteness !== 'complete' || (saved.sourceRowCount != null && saved.sourceRowCount !== saved.rawRows.length)) return null;
        try { validateInventoryReadProjection(saved, { projection: adapter.projection }); }
        catch { return null; }
    }
    noteVerifiedAt();
    let payload;
    if (key === 'master') {
        payload = await prepareCachedMasterDisplayPayload(saved.rawRows,owner,meta,boot);
        if (!payload) return null;
    } else payload = buildDatasetPayload(key, saved.rawRows);
    return { key, payload, rowCompleteness: String(saved.rowCompleteness || ''),
        projection: String(saved.projection || ''), fieldCoverage: String(saved.fieldCoverage || ''), columns: Array.isArray(saved.columns) ? saved.columns : [],
        rowCount: saved.rowCount, cached: true };
}

async function prepareCachedMasterDisplayPayload(rows,owner,meta,boot) {
    if (boot) return {data:formatFetchedRows(rows,DATASET_DEFINITIONS.master.sourceTable)};
    try {
        const prepared = await prepareProductionMasterSnapshot(rows, {identity:owner,
            permissionVersion:meta.dataPermissionVersion,seasonKey:currentMasterPreparationSeasonKey(),
            includeRawRows:false,isolatedRows:true,
            signal:typeof productionLiveSyncNavigation !== 'undefined' ? productionLiveSyncNavigation.signal : null});
        return owner === getSupabaseReadIdentityScope() ? prepared.payload : null;
    } catch (error) {
        if (error?.code === 'DATASET_READ_SCOPE_CHANGED' || error?.code === 'REQUEST_ABORTED') return null;
        throw error;
    }
}

function writeProductionVerifiedSnapshot(adapter, value, meta) {
    if (adapter.id.startsWith('side:')) {
        const displayValue = serializeProductionSideDisplayValue(adapter, value);
        if (!isBoundedProductionSideDisplayValue(adapter, displayValue)) return;
        return saveCacheValue(verifiedSnapshotCacheKey(meta), { format: 'verified-display-v1', meta, value: displayValue, verifiedAt: new Date().toISOString() });
    }
    if (!adapter.id.startsWith('core:') || !Array.isArray(value.rawRows) || value.rowCount !== value.rawRows.length) return;
    if (value.key === 'master') {
        if (value.rowCompleteness !== 'complete') return;
        try { validateInventoryReadProjection(value, { projection: adapter.projection }); }
        catch { return; }
    }
    return saveCacheValue(verifiedSnapshotCacheKey(meta), { format: 'verified-raw-v1', meta, rawRows: value.rawRows, rowCount: value.rowCount, sourceRowCount: value.rowCount, rowCompleteness: value.rowCompleteness || '',
        projection: value.projection || '', fieldCoverage: value.fieldCoverage || '', columns: Array.isArray(value.columns) ? value.columns : [], verifiedAt: new Date().toISOString() });
}
