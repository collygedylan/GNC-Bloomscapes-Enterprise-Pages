function buildOperationalSideBindings(api) {
    return {
        ...buildManagerReportMetadataBindings(),
        'side:homeSyncMetadata': {
            enabled: () => canViewDashboardSyncStatus(),
            scope: () => getSupabaseReadIdentityScope(),
            stage: ctx => stageHomeSyncMetadata(ctx,api),
            commit: snapshot => {
                const labels = Object.fromEntries(getDashboardSyncMetadataSources().map(source => [source.table, source.label]));
                const retained = dashboardSyncMetadataOwner === getSupabaseReadIdentityScope() ? dashboardSyncMetadataSummaries : [];
                dashboardSyncMetadataSummaries = mergeDashboardSyncSummaries([...retained, ...snapshot.entries
                    .map(entry => collectDashboardSyncSource(entry.rows, labels[entry.table]))
                    .filter(entry => entry.iso || entry.files.length)]);
                dashboardSyncMetadataFetchedAt = Date.now();
                dashboardSyncMetadataOwner = getSupabaseReadIdentityScope();
                updateDashboardSyncSummary();
            }
        }
    };
}

function buildManagerReportMetadataBindings() {
    const surfaces = {reportEval1:'eval1',reportEval2:'eval2',reportNcr:'ncr',reportAssigned:'assigned-items',
        reportSeason:'season-priority',reportApproval:'approval'};
    return Object.fromEntries(Object.entries(surfaces).map(([id,surface]) => ['side:'+id,createManagerReportMetadataBinding(surface)]));
}

function createManagerReportMetadataBinding(surface) {
    return {
        enabled:() => useManagerReportPages(surface),
        scope:() => buildManagerReportPageQuery(surface,'metadata'),
        stage:ctx => getManagerReportPageController().readPage(buildManagerReportPageQuery(surface,'metadata'),ctx.signal),
        commit:page => getManagerReportPageController().acceptMetadata(surface,page)
    };
}

async function stageHomeSyncMetadata(ctx, api) {
    const tables = ['ph_master_inventory','ph_soc_master','ph_reserves','ph_cav_import'];
    const entries = [];
    for (let offset = 0; offset < tables.length; offset += 2) {
        const batch = await Promise.all(tables.slice(offset,offset+2).map(table => readHomeSyncMetadataTable(table,ctx.signal,api)));
        entries.push(...batch);
    }
    return {entries};
}

async function readHomeSyncMetadataTable(table, signal, api) {
    try {
        const query = `select=filename,last_updated&last_updated=not.is.null&order=last_updated.desc&limit=${DASHBOARD_SYNC_METADATA_LIMIT}&offset=0`;
        const page = await runDedupeSupabaseRead(`home-sync-metadata:${table}:${query}`,
            ({signal:readSignal}) => fetchAuthenticatedSupabaseReadPage(table,query,{signal:readSignal,timeoutMs:SUPABASE_READ_TIMEOUT_MS}),{signal});
        const rows = api.rows(page?.rows,`Home ${table} metadata`);
        return {table,rows:rows.slice(0,DASHBOARD_SYNC_METADATA_LIMIT).map(row => ({
            filename:String(row?.filename || ''),last_updated:String(row?.last_updated || '')
        }))};
    } catch (error) {
        window.GncRuntimeWatchdog?.capture?.(error,`homeSyncMetadata:${table}`);
        return {table,rows:[],retained:true};
    }
}

function buildDockWorkflowSideBindings(api, array, read) {
    return {
        'side:dockWorkflow': {
            stage: async (ctx) => {
                const [tripsResult, itemRows, issueRows, allocationRows] = await Promise.all([
                    runDockTripStatusRequest('list'), read('ph_dock_item_status', 'select=*&order=unique_id.asc',ctx),
                    read('ph_dock_issue_status', 'select=*&order=issue_source_unique_id.asc',ctx),
                    read('ph_dock_issue_allocations', 'select=*&order=allocation_unique_id.asc',ctx)
                ]);
                const trips = api.keyed(array(tripsResult.data, 'Dock trips'), normalizeDockTeamInfo, (row) => normalizeDockTeamTripKey(row.tripnumber));
                const items = new Map(itemRows.map((row) => [bloomscapesDockProgressKey(row.unique_id || row.UNIQUE_ID), normalizeDockItemProgress(row)]).filter(([key]) => key));
                const issues = api.keyed(issueRows, normalizeDockIssueStatusRow, (row) => row.issueSourceUniqueId);
                const allocations = api.keyed(allocationRows, normalizeDockIssueAllocationRow, (row) => row.allocationUniqueId);
                const bySource = new Map();
                allocations.forEach((row) => {
                    if (!bySource.has(row.issueSourceUniqueId)) bySource.set(row.issueSourceUniqueId, []);
                    bySource.get(row.issueSourceUniqueId).push(row);
                });
                return { trips, items, issues, allocations, bySource };
            },
            commit: (value) => {
                dockTeamStatusByTrip = value.trips; dockItemProgressByUid = value.items;
                dockIssueStatusByUid = value.issues; dockIssueAllocationsById = value.allocations; dockIssueAllocationsBySourceUid = value.bySource;
                dockTeamStatusLoaded = dockItemProgressLoaded = dockIssueDataLoaded = true;
                dockTeamSchemaReady = dockItemSchemaReady = true;
                dockTeamStatusRenderVersion += 1;
                invalidateDockWorkflowResolvedState();
            }
        }
    };
}

function getProductionLiveSyncContext() {
    const accessReady = appAccessSnapshotState.status === 'ready' && !appAccessSnapshotState.stale
        && appAccessSnapshotState.username === getRequestCapabilityUsernameKey(currentUser);
    const visible = !document.hidden && !productionLiveSyncNavigation.signal.aborted
        && (accessReady || hasRetainedAuthenticatedAppAccess())
        && document.body.classList.contains('role-access-ready');
    if (!canUseProductionLiveSync()) return observeHlOrderVerificationContext({ scope: '', visible, online: navigator.onLine !== false, adapters: [] });
    const context = getProductionLiveSyncSideContext();
    const pagedSurface = getActiveManagerReportPageSurface(context.view);
    if (pagedSurface && useManagerReportPages(pagedSurface)) context.pagedReportSurface = pagedSurface;
    if (context.view === 'sales-inventory') context.pagedReportSurface = 'inventory-hub';
    const registry = window.AgMetricLiveSyncRegistry;
    const view = registry.views[context.view] ? context.view : 'home';
    context.scope = JSON.stringify([nativeAuthProfile.id, currentUser, currentRole, getCurrentLoginCacheScopeKey(),getBloomscapesFarm()]);
    context.authenticated = nativeAuthSessionActive === true && nativeAuthSessionUserId === nativeAuthProfile.id;
    context.accessDenied = hasConfirmedCurrentAccountRevocation();
    context.accessDeniedConfirmed = context.accessDenied;
    context.readIdentity = getSupabaseReadIdentityScope();
    context.dataPermissionVersion = String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '');
    context.dataPermissionSnapshotFresh = accessReady;
    if (!productionLiveSyncSideAdapters) productionLiveSyncSideAdapters = createProductionLiveSyncSideAdapters();
    if (view==='docks') context.docksVisit = currentDocksReadVisit();
    const foregroundContext = { ...context, surfaces: context.surfaces.filter(id => !id.startsWith('badge:')) };
    const describedAdapters = describeProductionLiveAdapters(registry,view,foregroundContext);
    const salesOfficeAdapters = partitionSalesOfficeLiveAdapters(describedAdapters, view, foregroundContext.surfaces);
    const adapters = salesOfficeAdapters.foreground;
    if (view === 'home' && (canAccessView('drive') || canAccessView('av')) && !adapters.some(adapter => adapter.id === 'core:master')) {
        const projection = getProductionCoreLiveProjection('master', view, foregroundContext);
        adapters.unshift(createProductionCoreLiveAdapter('master', projection, {
            pageConcurrency: projection === 'full' ? 8 : 2,
        }));
    }
    const hasDataCohort = registry.views[view]?.kind === 'data'
        || view === 'managers' && adapters.length > 0
        || view === 'home' && adapters.length > 0;
    // Dialogs and all data tabs may display their same-account complete cohort
    // while refresh is pending. Display is separate from write authorization.
    const progressive = hasDataCohort;
    const previewAdapterIds = progressive && ['home', 'drive', 'av', 'tasks', 'docks'].includes(view)
        ? [view === 'docks' ? 'core:soc' : 'core:master'] : undefined;
    if (previewAdapterIds?.length) {
        adapters.sort((a, b) => Number(previewAdapterIds.includes(b.id)) - Number(previewAdapterIds.includes(a.id)));
    } else if (progressive && view !== 'docks' && !(view === 'request' && foregroundContext.surfaces.includes('request:suspend-tag'))) {
        adapters.sort((a, b) => Number(a.id.startsWith('core:')) - Number(b.id.startsWith('core:')));
    }
    const backgroundAdapters=buildProductionLiveBackgroundAdapters(context,view,adapters,foregroundContext,salesOfficeAdapters.background);
    return observeHlOrderVerificationContext({ ...foregroundContext, progressive, previewAdapterIds, scope: context.scope, viewKey: JSON.stringify([view, foregroundContext.surfaces, productionLiveSyncNavigationGeneration, view === 'av' ? activeAVTab : null]), visible, online: navigator.onLine !== false,
        adapters:context.docksVisit ? bindDocksAdapterVisit(adapters,context.docksVisit) : adapters,
        backgroundAdapters:context.docksVisit ? bindDocksAdapterVisit(backgroundAdapters,context.docksVisit) : backgroundAdapters });
}


function describeProductionLiveAdapters(registry,targetView,targetContext) {
    const nativeKeys=getBloomscapesNativeBrowseKeys(targetView);
    if (nativeKeys) return nativeKeys.map(key=>createProductionCoreLiveAdapter(key,'full',{pageConcurrency:1}));
    const fastPagedViews = targetView === 'tasks' || targetView === 'drive' || targetView === 'av' || targetView === 'docks'
        || targetView === 'request' && targetContext.surfaces.includes('request:suspend-tag');
    const result = [
        ...canonicalizeProductionCoreLiveKeys(registry.getCoreKeys(targetView, targetContext)).filter((key) => !RETIRED_DATASET_KEYS.has(key))
        .map((key) => createProductionCoreLiveAdapter(key, getProductionCoreLiveProjection(key, targetView, targetContext), {
            pageConcurrency: key === 'master' ? 2 : fastPagedViews ? 2 : 1
        })),
        ...productionLiveSyncSideAdapters.getViewAdapters(targetView, targetContext)
    ];
    if (targetView === 'docks' || targetView === 'request' && targetContext.surfaces.includes('request:suspend-tag')) {
        result.sort((a, b) => Number(b.id.startsWith('core:')) - Number(a.id.startsWith('core:')));
    }
    return result;
}

function buildProductionLiveBackgroundAdapters(context,view,adapters,foregroundContext,salesOfficeBackground) {
    const foregroundIds = new Set(adapters.map(adapter => adapter.id));
    const backgroundContext = { ...context, surfaces: context.surfaces.filter(id => id.startsWith('badge:')) };
    const backgroundAdapters = context.pagedReportSurface ? [] : describeProductionLiveAdapters(window.AgMetricLiveSyncRegistry,'home',backgroundContext).filter(adapter => !foregroundIds.has(adapter.id));
    if (!context.pagedReportSurface && canViewDashboardSyncStatus()) {
        for (const key of ['soc', 'reserves', 'cav']) {
            const id = `core:${key}`;
            if (missingBackgroundLiveAdapter(backgroundAdapters,foregroundIds,id)) {
                backgroundAdapters.push(createProductionCoreLiveAdapter(key, 'browse', { pageConcurrency: 1 }));
            }
        }
        const poAdapter = productionLiveSyncSideAdapters.getAdapter('side:po', foregroundContext);
        if (poAdapter && !foregroundIds.has(poAdapter.id) && !backgroundAdapters.some(adapter => adapter.id === poAdapter.id)) {
            backgroundAdapters.push(poAdapter);
        }
    }
    salesOfficeBackground.forEach((adapter) => {
        if (!foregroundIds.has(adapter.id) && !backgroundAdapters.some(item => item.id === adapter.id)) backgroundAdapters.push(adapter);
    });
    // Assignment reads authorize card actions, not catalog visibility.
    // Until loaded the existing action checks remain denied.
    if ((view === 'drive' || view === 'detail' && context.driveDetail) && context.driveAssignmentsRequired
        && (typeof nativeAuthSessionActive === 'undefined' || !nativeAuthSessionActive)
        && !foregroundIds.has('core:warehouseAssignedItems')) {
        backgroundAdapters.push(createProductionCoreLiveAdapter('warehouseAssignedItems', 'browse', { pageConcurrency: 1 }));
    }
    // Customer/rep names are a card enhancement, never a prerequisite
    // for opening the Suspend Tag queue.
    appendSuspendTagBackgroundCustomerRepMap(backgroundAdapters, foregroundIds, view, foregroundContext.surfaces,
        () => createProductionCoreLiveAdapter('customerRepMap',
            getProductionCoreLiveProjection('customerRepMap', view, foregroundContext), { pageConcurrency: 1 }));
    // Optional AV enhancements still refresh, but an unopened notes or
    // customer/hot-price surface must not hold the catalog at its preview.
    if (view === 'av') {
        for (const key of ['customerRepMap', 'avHotPriceKeys']) {
            if (missingBackgroundLiveAdapter(backgroundAdapters,foregroundIds,`core:${key}`)) {
                backgroundAdapters.push(createProductionCoreLiveAdapter(key,
                    getProductionCoreLiveProjection(key, view, foregroundContext), { pageConcurrency: 1 }));
            }
        }
    }
    return backgroundAdapters;
}

function missingBackgroundLiveAdapter(background,foregroundIds,id) {
    return !foregroundIds.has(id) && !background.some(adapter=>adapter.id===id);
}

function createProductionCoreLiveAdapter(key, requestedMode = 'browse', stageOptions = {}) {
    // AV is a projection of the same all-season master already needed by
    // its joined views. Read it once, then derive AV in processAndLoadData.
    key = canonicalizeProductionCoreLiveKeys([key])[0] || key;
    const definition = DATASET_DEFINITIONS[key];
    if (!definition) throw new Error(`Unknown live dataset: ${key}`);
    const projection = requestedMode === 'full' ? 'full' : 'browse';
    // Navigation and direct ensures share the same bounded Eval2 snapshot reader.
    const pageConcurrency = key === 'master' && projection === 'full'
        && typeof getCurrentVisibleViewId === 'function'
        && getCurrentVisibleViewId() === 'managers' && activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW
        ? 2 : key === 'master'
            ? coldSourceHydrations.has('master')
                ? Math.min(8, Math.max(1, Math.floor(Number(stageOptions.pageConcurrency) || 8)))
                : Math.min(2, Math.max(1, Math.floor(Number(stageOptions.pageConcurrency) || 1)))
            : stageOptions.pageConcurrency;
    const querySource = projection === 'full' ? definition.fullQuery || definition.initialQuery || 'select=*' : definition.initialQuery || 'select=*';
    const query = typeof querySource === 'function' ? querySource(projection, {}) : querySource;
    const season = key === 'master' ? getCurrentAppSeasonSettings() : null;
    return {
        // An off-screen settings refresh may not have a master revision
        // to validate. Re-entering inventory must then recheck its
        // season-derived collections even if physical stock is unchanged.
        id: `core:${key}`, projection, cacheKey: JSON.stringify([key, definition.table, query, projection, season && [season.seasonCode, season.salesYear], ...(key === 'master' ? ['complete-identity-v3'] : [])]),
        // Both master projections read the same complete all-season rows.
        // Full adds fields; it may retain same-revision browse proof without
        // authorizing reuse across another season or filtered side adapter.
        projectionFamily: key === 'master' ? JSON.stringify([key, definition.table, season && [season.seasonCode, season.salesYear], 'complete-identity-v3']) : '',
        sourceKeys: window.AgMetricLiveSyncRegistry.getSourceKeys([`core:${key}`]),
        stage: (options = {}) => stageProductionCoreRows({key,definition,projection,query,pageConcurrency},options)
    };
}
