let reportPagesModulePromise = null;

function loadReportPagesModule() {
    if (!reportPagesModulePromise) {
        const moduleUrl = new URL('./assets/report-pages.js?v=' + encodeURIComponent(APP_VERSION), document.baseURI);
        reportPagesModulePromise = import(moduleUrl.href).catch(error => {
            reportPagesModulePromise = null;
            throw error;
        });
    }
    return reportPagesModulePromise;
}

function isManagerReportSurfaceAllowed(surface) {
    if (surface === 'eval1') return canViewManagerEvalReports();
    if (surface === 'eval2') return canViewManagerEvalReports2();
    if (surface === 'assigned-items') return canViewAssignedItemsExport();
    if (surface === 'season-priority') return canViewManagerSeasonPriority();
    if (surface === 'approval') return isManagerApprovalTab(activeHomeTab);
    return canAccessView('low-stock');
}

function stampManagerReportLocationReceipts(values, scope, permission, revision) {
    if (!Array.isArray(values)) return;
    for (const value of values) {
        if (!value || typeof value !== 'object') continue;
        if (Object.prototype.hasOwnProperty.call(value, 'loc_on_hand') || Object.prototype.hasOwnProperty.call(value, 'LOC_ON_HAND')) {
            stampCardLocationOnHandReceipt(value, scope, permission, revision);
        }
        stampManagerReportLocationReceipts(value.rows, scope, permission, revision);
        stampManagerReportLocationReceipts(value.reportRows, scope, permission, revision);
        if (value.representativeRow) stampManagerReportLocationReceipts([value.representativeRow], scope, permission, revision);
    }
}

function prepareManagerReportPageResponse(data, scope, permission) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const revisionRow = rows.find(row => row?.loc_on_hand_revision || row?.LOC_ON_HAND_REVISION);
    const inventoryRevision = String(data.inventoryRevision || revisionRow?.loc_on_hand_revision
        || rows.find(row => row?.LOC_ON_HAND_REVISION)?.LOC_ON_HAND_REVISION || '');
    if (inventoryRevision && acceptCardLocationOnHandSourceReceipt(scope, permission, inventoryRevision)) {
        stampManagerReportLocationReceipts(rows, scope, permission, inventoryRevision);
    }
    return data.inventoryRevision
        ? { ...data, metadata: { ...(data.metadata || {}), inventoryRevision: String(data.inventoryRevision) } }
        : data;
}

async function readManagerReportPage(query, signal) {
    const local = typeof getManagerEvalReport1ExcelPage === 'function' ? getManagerEvalReport1ExcelPage(query) : null;
    if (local) return local;
    const scope = getSupabaseReadIdentityScope();
    const permission = String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '');
    const response = await postAppFunctionJson(APP_API_FUNCTION_URL,
        query ? { action: 'report_read_v2', query } : { action: 'report_read_v2', operation: 'capabilities' },
        { signal, label: 'Report data', timeoutMs: SUPABASE_READ_TIMEOUT_MS });
    if (scope !== getSupabaseReadIdentityScope()) throw staleSupabaseReadScopeError();
    if (window.GncUserAccessControl?.getSelfState?.().denied === true || nativeAuthProfile?.active === false
        || nativeAuthProfile?.disabled_at != null) {
        throw Object.assign(new Error('Access to this report has been revoked.'), { status: 403, code: 'FORBIDDEN' });
    }
    if (!response?.ok || !response.data) {
        throw Object.assign(new Error(response?.error || 'Report data is unavailable.'), {
            status: Number(response?.status || 503), code: String(response?.code || '')
        });
    }
    return prepareManagerReportPageResponse(response.data, scope, permission);
}

function clearManagerReportPageState() {
    managerReportScopedRows.clear();
    managerReportVisibleRows.clear();
    managerEvalReport2Cache = null;
    managerEvalReport2CacheKey = '';
    managerPagedLocationBase = '';
    managerPagedLocationScroll.clear();
    managerReportGridFilters.clear();
    managerEvalReport2SelectedItemsByKey.clear();
    managerEvalReport2EditsByRowKey.clear();
    managerEvalReport2DetailItemKey = '';
    managerEvalAssignmentSelection.clear();
    resetManagerEvalReport2ProgressiveRowsState();
}

function onManagerReportPageReady() {
    signalProductionLiveSync('report-capabilities', 0);
    if (getCurrentVisibleViewId() === 'managers') scheduleManagersRender(true);
    else if (isViewVisible('low-stock')) scheduleLowStockRender();
}

function applyManagerEvalReportPageMetadata(state) {
    if (state.revision) {
        getManagerEvalReports2Api()?.browseSeedRows(state.metadata);
        managerEvalReport2Cache = createPagedManagerEvalIndex(state);
        managerEvalReport2CacheKey = state.revision;
    }
    managerEvalReport2LoadState.lastSourceUpdatedAt = state.metadata.latestSourceUpdatedAt || '';
    const progressive = managerEvalReport2ProgressiveRowsState;
    const incomingRevision = String(state.expectedRevision || state.revision || '');
    if (progressive && progressive.owner === getSupabaseReadIdentityScope() && progressive.revision
        && incomingRevision && incomingRevision !== progressive.revision && !progressive.refreshing) {
        void refreshManagerEvalReport2ProgressiveRows(progressive);
    }
}

function onManagerReportPageMetadata(surface, state) {
    if (state.metadata.settings) managerEvalReportSettings = { ...managerEvalReportSettings, ...state.metadata.settings };
    if (surface === 'eval2') applyManagerEvalReportPageMetadata(state);
    if (surface.startsWith('eval') && isViewVisible('managers')) scheduleManagersRender(true);
}

function onManagerReportPageState(surface, state) {
    if (surface !== 'eval2') return;
    managerEvalReport2LoadState.loading = state.loading && !state.page;
    managerEvalReport2LoadState.error = state.error;
    if (state.page) managerEvalReport2LoadState.lastLoadedAt = new Date().toISOString();
    syncManagerEvalReport2SelectionUi();
    const progressive = managerEvalReport2ProgressiveRowsState;
    if (progressive && progressive.owner === getSupabaseReadIdentityScope() && progressive.rows.length
        && !state.page && !state.loading && !state.error && !progressive.refreshing) {
        void refreshManagerEvalReport2ProgressiveRows(progressive);
    }
    if (!state.revision && isViewVisible('managers')) scheduleManagersRender(true);
}

function createManagerReportPageController() {
    return GncReportPagesLive.createController({
        scope: getSupabaseReadIdentityScope,
        // Read-only page sessions survive permission refresh; mutation and freshness receipts keep their permission hashes.
        permission: getSupabaseReadIdentityScope,
        variant: surface => surface === 'approval' ? activeHomeTab : '',
        allowed: isManagerReportSurfaceAllowed,
        serverAuthorizedSurfaces: nativeAuthSessionActive?[]:['eval2'],
        loadModule: loadReportPagesModule,
        onSuspend: () => managerReportVisibleRows.clear(),
        onClear: clearManagerReportPageState,
        transport: readManagerReportPage,
        onReady: onManagerReportPageReady,
        onMetadata: onManagerReportPageMetadata,
        onState: onManagerReportPageState
    });
}

function useManagerReportPages(surface) {
    if (nativeAuthSessionActive) return false;
    if (!window.GncReportPagesLive || !currentUser) return false;
    if (surface === 'eval2') return canViewManagerEvalReports2();
    return getManagerReportPageController().enabled(surface);
}
