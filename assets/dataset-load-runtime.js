async function ensureDatasetLoaded(key, mode = 'initial', options = {}) {
    if (RETIRED_DATASET_KEYS.has(String(key || '').trim())) return false;
    const definition = DATASET_DEFINITIONS[key];
    if (!definition) return false;
    if (!options.bypassLiveSyncCoordinator) {
        const coldLoad = getOwnedColdDatasetLoad(key,mode);
        if (coldLoad) return coldLoad;
        if (typeof canUseProductionLiveSync === 'function' && canUseProductionLiveSync()) return ensureCoordinatedDataset(key,mode,options);
    }
    const wantsFull = mode === 'full' || key === 'master' || key === 'avOpen';
    const state = getDatasetState(key);
    if (isDatasetFrozenDuringManualSync(key,mode)) return wantsFull ? !!state.fullLoaded : !!(state.initialLoaded || state.fullLoaded);
    if (options.force && !wantsFull && state.fullLoaded && !options.preserveRequestedMode) return ensureDatasetLoaded(key,'full',options);
    if (!options.force && datasetLoadAlreadyComplete(key,state,wantsFull)) return true;
    return loadOwnedDataset(key, definition, state, wantsFull, options);
}

function loadOwnedDataset(key, definition, state, wantsFull, options) {
    const owner = getSupabaseReadIdentityScope();
    const slot = wantsFull ? 'fullPromise' : 'initialPromise';
    const current = state[slot];
    if (options.docksVisit?.aborted) return false;
    const canJoin = candidate => candidate?.ownerIdentity === owner && (!candidate.docksVisit || candidate.docksVisit === options.docksVisit);
    if (canJoin(current)) return current;
    const initial = wantsFull && canJoin(state.initialPromise) ? state.initialPromise : null;
    const isCurrent = () => !options.docksVisit?.aborted && state[slot] === task
        && getDatasetState(key) === state && getSupabaseReadIdentityScope() === owner;
    const task = Promise.resolve(initial).catch(() => false)
        .then(() => runDatasetLoadWithRetry(key, definition, state, wantsFull, options, isCurrent))
        .finally(() => {
            if (state[slot] === task) state[slot] = null;
        });
    Object.defineProperty(task, 'ownerIdentity', { value: owner });
    Object.defineProperty(task, 'docksVisit', { value: options.docksVisit });
    state[slot] = task;
    return task;
}

function getOwnedColdDatasetLoad(key, mode) {
    if (mode !== 'full' || !coldSourceHydrations.has(key)) return null;
    const owner = getSupabaseReadIdentityScope();
    const state = getDatasetState(key);
    const cold = coldSourceHydrations.get(key);
    if (cold?.ownerIdentity !== owner || cold.docksVisit || !state.fullPromise) return null;
    return state.fullPromise.then(loaded => owner === getSupabaseReadIdentityScope() ? loaded : false);
}

async function ensureCoordinatedDataset(key, mode, options) {
    const adapterId = `core:${key === 'avOpen' ? 'master' : key}`;
    const foreground = getProductionLiveSyncContext().adapters.find(adapter => adapter.id === adapterId);
    // A browse preview joins the foreground full snapshot already paging.
    const adapter = mode !== 'full' && foreground?.projection === 'full'
        ? foreground : createProductionCoreLiveAdapter(key,mode === 'full' ? 'full' : 'browse');
    const loaded = await getProductionLiveSyncCoordinator().ensure(adapter,!!options.force);
    if (loaded || getDatasetRenderRowCount(key) > 0) return loaded;
    return ensureDatasetLoaded(key,mode,{...options,bypassLiveSyncCoordinator:true});
}

function datasetLoadAlreadyComplete(key, state, wantsFull) {
    if (wantsFull) return state.fullLoaded && ((key !== 'master' && key !== 'avOpen') || state.fieldCoverage === 'full');
    return (state.initialLoaded || state.fullLoaded) && !isMasterInitialLoadPartialForCurrentScope(state);
}

async function runDatasetLoadWithRetry(key, definition, state, wantsFull, options, isCurrent) {
    const maxRetries = options.retryOnCancellation === true ? 4 : 0;
    for (let attempt = 0; ; attempt += 1) {
        if (!isCurrent()) return false;
        try { return await runLegacyDatasetLoad(key,definition,state,wantsFull,options,isCurrent); }
        catch (error) {
            if (attempt >= maxRetries || getSupabaseReadErrorCode(error) !== 'REQUEST_ABORTED') throw error;
            await new Promise(resolve => setTimeout(resolve,600*(attempt+1)));
        }
    }
}

function createDatasetReadPlan(key, definition, wantsFull, options, isCurrent) {
    const modeLabel = wantsFull ? 'full' : 'initial';
    const querySource = wantsFull ? definition.fullQuery : definition.initialQuery;
    const query = typeof querySource === 'function' ? querySource(modeLabel,options) : querySource || 'select=*';
    const initialLimitSource = definition.initialLimit;
    const limit = typeof initialLimitSource === 'function' ? initialLimitSource(modeLabel,options) : initialLimitSource || INITIAL_PAGE_LIMIT;
    const fetchAll = !wantsFull && definition.initialFetchAll === true && options.fastInitialPage !== true;
    const owner = getSupabaseReadIdentityScope();
    const firstPage = options.docksVisit ? { docksVisit:options.docksVisit, signal:options.docksVisit } : {};
    return {key,definition,wantsFull,options,modeLabel,query,limit,fetchAll,owner,firstPage,isCurrent};
}

async function fetchLegacyDatasetRows(plan) {
    const {key,definition,wantsFull,options,query,limit,fetchAll,firstPage} = plan;
    if (key === 'master' || key === 'avOpen') {
        const params = {dataset:key,projection:wantsFull ? 'full' : 'browse'};
        if (wantsFull || fetchAll) return fetchAllInventoryReadRows('master_page',params,{...firstPage,limit:5000,pageConcurrency:8,requireComplete:true});
        const page = await fetchInventoryReadPage('master_page',params,Math.min(limit,500),0,{...firstPage,label:'Inventory rows'});
        Object.defineProperty(page.rows,'readMeta',{value:{projection:page.projection,fieldCoverage:page.fieldCoverage,columns:page.columns},enumerable:false});
        return page.rows;
    }
    if (key === 'requests') return fetchActiveRequestLiveRows('*',options);
    if (wantsFull || fetchAll) return fetchAllSupabaseRows(definition.table,query,{
        ...firstPage,...(options.retainOnGenerationChange === true ? {retainOnGenerationChange:true} : {})
    });
    return fetchSupabasePage(definition.table,query,limit,0,firstPage);
}

async function retryFullLegacyMasterRead(plan, error) {
    console.warn('Fast master inventory load failed; retrying with full master rows.',error);
    try {
        return await fetchAllInventoryReadRows('master_page',{dataset:'master',projection:'full'},{...plan.firstPage,limit:500});
    } catch (fallbackError) {
        if (!plan.isCurrent()) return null;
        console.warn('Full master retry failed; showing first master page while background sync retries.',fallbackError);
        return (await fetchInventoryReadPage('master_page',{dataset:'master',projection:'full'},Math.min(plan.limit,500),0,{...plan.firstPage,label:'Inventory rows'})).rows;
    }
}

function recoverLegacyDatasetRows(plan, error) {
    const {key,definition,wantsFull,modeLabel,fetchAll,firstPage} = plan;
    const failure = classifyDatasetLoadFailureCode(error);
    if (failure === null) {
        if (!plan.options.docksVisit && error?.code === 'DATASET_READ_RETAINED' && !error.retryOnViewChange) queueDatasetLoad(key,modeLabel,3000);
        return null;
    }
    if (isInventorySourceReadinessError(error)) {
        suspendProductionInventoryReadForReadiness(error);
        reportSemanticHealthEvent('dataset_load_failed','data_sync',getSupabaseReadErrorCode(error) || 'DATASET_NOT_READY',{reason:`${key}:${modeLabel}`});
        throw error;
    }
    if (key === 'master' && !wantsFull && fetchAll && markMissingOptionalMasterInitialColumns(error)) {
        return fetchAllInventoryReadRows('master_page',{dataset:'master',projection:'initial_base'},{...firstPage,limit:500});
    }
    if (key === 'master' && fetchAll) return retryFullLegacyMasterRead(plan,error);
    if (key === 'requests' && isRequestQueueLiveRowsViewMissingError(error)) {
        return fetchAllSupabaseRows(ACTIVE_REQUEST_TABLE,'select=*&date_completed=is.null&order=unique_id.desc',firstPage);
    }
    if (key === 'flyerRows' && isOptionalFlyerRowsMissingError(error)) return handleMissingOptionalFlyerRowsTable(error);
    if (['requestHistory','flyerHistory'].includes(key) && isOptionalTableMissingError(error,definition.table)) return handleMissingOptionalHistoryTable(key,error);
    if (key === 'customerRepMap' && isOptionalTableMissingError(error,definition.table)) return [];
    reportSemanticHealthEvent('dataset_load_failed','data_sync',failure,{reason:`${key}:${modeLabel}`});
    throw error;
}

function updateLegacyDatasetLoadState(plan, state, rows) {
    const {key,wantsFull,fetchAll} = plan;
    const inventory = key === 'master' || key === 'avOpen';
    const partial = key === 'master' && (wantsFull || fetchAll) && masterRowsLookPartialForCurrentScope(rows);
    const fieldCoverage = inventory ? String(rows.readMeta?.fieldCoverage || '') : 'full';
    if (inventory && wantsFull && fieldCoverage !== 'full') throw new Error('Full inventory fields were not returned; the partial snapshot was discarded.');
    state.initialLoaded = true;
    state.fullLoaded = wantsFull ? !partial : inventory ? fieldCoverage === 'full' && !partial : state.fullLoaded;
    state.expectedRowCount = rows.readMeta?.total ?? rows.length;
    state.fieldCoverage = fieldCoverage;
    state.rowCompleteness = (wantsFull || fetchAll) && !partial ? 'complete' : 'partial';
    state.lastLoadedAt = new Date().toISOString();
    if (key === 'master' && wantsFull) state.firstPagePreviewLoaded = false;
    return partial;
}

function refreshRequestOptionsAfterDatasetLoad() {
    requestModalCustomerOptionsCacheKey = '';
    requestModalCustomerOptionsReady = areRequestModalCustomerDatasetsReady();
    if (requestModalCustomerOptionsReady) buildRequestModalCustomerOptionsCache(true);
    refreshRequestModalCustomerStepIfVisible();
}

async function commitLegacyDatasetRows(plan, state, rows) {
    const {key,definition,wantsFull,owner} = plan;
    if (key === 'reserves' && wantsFull) {
        const inventory = await buildReserveInventoryRowsAsync(formatFetchedRows(rows,definition.sourceTable));
        if (!plan.isCurrent()) return;
        reservesInventory = inventory;
        rebuildDetailLookupIndexes();
        invalidateResolvedViewStateCaches();
        refreshRequestOptionsAfterDatasetLoad();
        persistUserScopedDatasetCache('reserves').catch(() => {});
        return;
    }
    const payload = buildDatasetPayload(key,rows);
    if (key === 'master' && !wantsFull && definition.mergeInitialRows === true && Array.isArray(payload.data)) {
        payload.data = mergeInitialMasterRowsWithExisting(payload.data);
    }
    processAndLoadData(payload);
    if (key === 'customerRepMap') refreshRequestOptionsAfterDatasetLoad();
    if (key === 'master' && state.rowCompleteness === 'complete' && rows.readMeta?.rowCompleteness === 'complete' && Number(rows.readMeta.total) === rows.length) {
        productionDisplayMasterReceipt = {rows:fullInventory,readScope:owner,permission:String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '')};
    }
}

function refreshViewsAfterLegacyDatasetLoad(key, wantsFull) {
    const render = view => queueInteractiveViewRender(view,false,true,wantsFull ? 18 : 8,220);
    if (key === 'reserves') {
        if (isViewVisible('av') && (activeAVTab === 'reserves' || shouldPrepareAvRepCustomerFilterData())) render('av');
        if (isViewVisible('reserves')) render('reserves');
        if (isViewVisible('reports')) render('reports');
    }
    if (key === 'customerRepMap' && isViewVisible('av') && shouldPrepareAvRepCustomerFilterData()) render('av');
    if (['avOpen','master','avHotPriceKeys'].includes(key) && isViewVisible('av')) {
        avResolvedBaseStateKey = '';
        render('av');
    }
    if (key === 'avHotPriceKeys') {
        const filter = getActiveEvalSimpleTaskFilterValue();
        if (isViewVisible('tasks') && (activeTaskView === 'hot-price' || filter === 'hot-price' || filter === 'hot-price-ssn')) render('tasks');
    }
    if (key === 'cav' || key === 'cavAvBlankKeys') {
        const filter = getActiveEvalSimpleTaskFilterValue();
        if (isViewVisible('tasks') && (activeTaskView === 'av-blanks' || filter === 'av-blanks')) render('tasks');
    }
}

async function runLegacyDatasetLoad(key, definition, state, wantsFull, options, isCurrent) {
    const startedAt = beginInternalPerfMeasure();
    if (shouldPauseInterruptibleRefresh(options)) {
        options.interruptedDuringLoad = true;
        return false;
    }
    const plan = createDatasetReadPlan(key,definition,wantsFull,options,isCurrent);
    let rows;
    try { rows = await fetchLegacyDatasetRows(plan); }
    catch (error) {
        if (!isCurrent()) return false;
        rows = await recoverLegacyDatasetRows(plan,error);
    }
    if (!rows || !isCurrent()) return false;
    if (shouldPauseInterruptibleRefresh(options)) {
        options.interruptedDuringLoad = true;
        return false;
    }
    const partial = updateLegacyDatasetLoadState(plan,state,rows);
    await commitLegacyDatasetRows(plan,state,rows);
    if (!isCurrent()) return false;
    replayHydratedRowPatches();
    refreshViewsAfterLegacyDatasetLoad(key,wantsFull);
    if (key === 'master' && state.fullLoaded && (wantsFull || plan.fetchAll)) persistCurrentCache(true,'master-full');
    else persistCurrentCache();
    touchSyncTimestamp();
    if (partial) state.lastLoadedAt = '';
    if (partial && !options.docksVisit) {
        setTimeout(() => queueDatasetLoad('master','full',isTouchConstrainedDevice() ? 2200 : 900),80);
    }
    reportPerformanceHealthEvent('dataset_load','data_sync',getAdaptivePerfElapsedMs(startedAt),{
        reason:`${key}:${plan.modeLabel}`,affected_count:Array.isArray(rows) ? rows.length : 0
    });
    return true;
}
