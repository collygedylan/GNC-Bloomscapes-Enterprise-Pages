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
    return observeHlOrderVerificationContext({ ...foregroundContext, progressive, previewAdapterIds, scope: context.scope, viewKey: JSON.stringify([view, foregroundContext.surfaces, productionLiveSyncNavigationGeneration, view === 'av' ? activeAVTab : null]), visible, online: navigator.onLine !== false, adapters, backgroundAdapters });
}


function describeProductionLiveAdapters(registry,targetView,targetContext) {
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
