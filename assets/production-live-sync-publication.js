function publishProductionLiveSyncStatus(status) {

    if (!updateProductionLiveSyncProofFromStatus(status)) {
        const context = getProductionLiveSyncContext();
        if (hasCurrentProductionReadStatus(status, context)) {
            // A server-authorized read can render during a local
            // access refresh without granting exact write proof.
            scheduleProductionLiveSyncRender(true, { cachedPreview: true });
        }
        return;
    }
    if (status.state === 'Offline' || status.unavailableSources?.includes('ph_master_inventory')) inventoryStatusSync?.setSourceReady(false);
    if (applyCurrentVerifiedSyncTimestamp(status)) updateSyncDiagnostics();
    captureHlOrderVerificationStatus(status);
    renderProductionDataFreshness(status);
    if (status.unavailableSources?.length) {
        const currentView = getCurrentVisibleViewId();
        const retained = hasProgressiveViewData() && !hasConfirmedCurrentAccountRevocation();
        if (!retained && !['av', 'drive'].includes(currentView)) {
            productionDisplayGroups.clear(); productionDisplayVerifiedAt.clear(); productionDisplaySnapshotTimes.clear();
        }
        // Eval Reports #2 surfaces its own source status while
        // retaining its last complete index on a failed proof.
        if (!retained && VIEW_LOAD_UI[currentView] && !shouldLetManagerEvalReport2OwnLoadState(currentView)) {
            const statusError = Object.assign(new Error(status.message || 'This data is inaccessible. Please retry.'), {
                status: Number(status.status || 0), code: String(status.code || '').trim().toUpperCase()
            });
            showViewErrorState(currentView, status.message || 'This data is inaccessible. Please retry.', true, statusError);
        }
    }
    if (getCurrentVisibleViewId() === 'drive' && activeDriveTab === 'name' && ['Needs attention', 'Importing', 'Offline'].includes(status.state) && !hasProgressiveViewData()) {
        showViewErrorState('drive', status.message || 'Current inventory could not be verified. Please retry.', true);
    }

    finishProductionLiveSyncStatus(status);
}

function finishProductionLiveSyncStatus(status) {
    const failedView = getCurrentVisibleViewId();
    const failedUi = VIEW_LOAD_UI[failedView];
    if (failedUi && !shouldLetManagerEvalReport2OwnLoadState(failedView)
        && ['Needs attention', 'Importing', 'Offline'].includes(status.state)
        && getContainerUiState(document.getElementById(failedUi.container)) === 'loading'
        && !hasProgressiveViewData() && !hasProductionLiveSyncDraft()) {
        showViewErrorState(failedView, getProductionDataStatusMessage(status), true);
    }
    driveDemandStatus = status;
    const demand = getDriveDemandContext();
    if (demand) renderDriveDemandPanel(demand.kind);
    const waitingForDisplay = isProductionDisplayWaitingForRender(getCurrentVisibleViewId());
    if (['Up to date', 'Published data'].includes(status.state) && (waitingForDisplay || driveCommonNameNeedsPreparation()
        || (productionLiveSyncRenderPending && !productionLiveSyncActiveRender && !hasProductionLiveSyncDraft()))) {
        cancelScheduledUiRenderByPrefix(`view-switch-render:${getCurrentVisibleViewId()}`);
        scheduleProductionLiveSyncRender(true);
    }
    refreshProductionHlDisplay(status);
}

function refreshProductionHlDisplay(status) {
    if (!canUseHlOrder() || status.state !== 'Up to date' || getCurrentVisibleViewId() !== 'hl-order') return;
    void loadHlOrderState();
    const owner = captureHlOrderOwnership();
    scheduleTypingAwareUiRender('hl-drive-proof-display', () => {
        if (!isHlOrderOwnershipCurrent(owner) || getCurrentVisibleViewId() !== 'hl-order') return;
        const container = document.getElementById('hl-order-content');
        const anchor = captureProductionRefreshAnchor('hl-order');
        if (container) refreshHlOrderDriveRegions(container);
        restoreProductionRefreshAnchor(anchor);
    }, 0, 120, { deferUntilIdle: true, ignoreChunkDuringInteraction: true });
}

function commitProductionLiveSnapshots(snapshots, context, metadata) {

    const incomingMaster = snapshots.some(({ adapter }) => adapter.id === 'core:master');
    if (incomingMaster && !isConfirmedInventoryReadRevisionCurrent(metadata.sources.get('ph_master_inventory')?.revision)) {
        throw new Error('Inventory changed after this read started. Refreshing the confirmed changes.');
    }
    if (context.progressive) productionDisplayGroups.add(productionDisplayGroupKey(context));
    const locOnHandSource = metadata.sources.get('ph_master_inventory');
    acceptQueueInventorySourceRevision(locOnHandSource, metadata.permissionVersion);
    const payload = { _verifiedLiveSync: true, _locOnHandReceiptScope: getSupabaseReadIdentityScope(), _locOnHandReceiptPermission: metadata.permissionVersion,
        _locOnHandReceiptRevision: locOnHandSource?.revision || '' };
    const core = snapshots.filter(({ adapter }) => adapter.id.startsWith('core:'));
    // Settings and operational maps are applied in the same JS turn.
    snapshots.filter(({ adapter }) => adapter.id.startsWith('side:')).forEach(({ adapter, value }) => adapter.commit(value));
    core.forEach(({ value }) => Object.assign(payload, value.payload));
    const seasonChanged = snapshots.some(({ adapter }) => adapter.id === 'side:settings');
    const masterState = getDatasetState('master');
    const masterRevision = metadata.sources.get('ph_master_inventory');
    const canReuseMaster = masterState.rowCompleteness === 'complete' && masterState.liveVerifiedScope === context.scope
        && masterState.liveVerifiedPermission === metadata.permissionVersion
        && masterRevision?.state === 'ready' && masterState.liveVerifiedRevision === masterRevision.revision;
    if (seasonChanged && !Object.prototype.hasOwnProperty.call(payload, 'data') && canReuseMaster) {
        // Season changes alter derived AV/current-season collections,
        // not the already-verified all-season master snapshot itself.
        payload.data = fullInventory.map((row) => ({ ...row }));
    }
    core.forEach(({ value }) => Object.assign(getDatasetState(value.key), {
        initialLoaded: true, fullLoaded: value.fieldCoverage === 'full', fieldCoverage: value.fieldCoverage,
        rowCompleteness: value.rowCompleteness === 'complete' ? 'complete' : 'unknown', firstPagePreviewLoaded: false, lastLoadedAt: new Date().toISOString(),
        liveVerifiedScope: context.scope, liveVerifiedPermission: metadata.permissionVersion,
        liveVerifiedRevision: metadata.sources.get(DATASET_DEFINITIONS[value.key].sourceTable || DATASET_DEFINITIONS[value.key].table)?.revision
    }));
    core.forEach(({ value }) => {
        if (value.key === 'master') captureHlOrderInventorySnapshot(value.hlOrderInventory, context, metadata);
    });
    if (core.length || Object.prototype.hasOwnProperty.call(payload, 'data')) processAndLoadData(payload);
    if (core.some(({ value }) => value.key === 'master' && value.rowCompleteness === 'complete')) {
        productionDisplayMasterReceipt = { rows: fullInventory, readScope: getSupabaseReadIdentityScope(), permission: metadata.permissionVersion };
    }
    replayHydratedRowPatches();
    refreshLiveLocMatchQuantityPreviews();
    if (incomingMaster && inventoryFieldCountingMode) void ensureFieldCountingIsland();
    if (core.some(({ value }) => value.key === 'warehouseAssignedItems')) applyEvalRecipientUsersToRepGroups(getEvalAssignableUserList());
    if (core.some(({ value }) => value.key === 'master')) Object.assign(getDatasetState('avOpen'), getDatasetState('master'));
    invalidateResolvedViewStateCaches({ preserveAvPreparation: true });
    TRACKED_VIEW_IDS.forEach(markViewDirty);
    if (core.length) persistCurrentCache();
    const visibleAdapters = new Set(getProductionLiveSyncContext().adapters.map(adapter => adapter.id));
    if (snapshots.some(({ adapter }) => visibleAdapters.has(adapter.id))) {
        window.GncRuntimeWatchdog?.recoverReadTimeout?.();
        scheduleProductionLiveSyncRender();
    }
}

function acceptQueueInventorySourceRevision(source, permission) {
    if (!(source?.state === 'ready' || window.AgMetricLiveSync?.isPublishedReadable(source)) || !/^[1-9]\d*$/.test(String(source.revision || ''))) return;
    const next = { scope: getSupabaseReadIdentityScope(), permission: String(permission || ''), revision: String(source.revision) };
    if (!next.scope || !next.permission) return;
    if (JSON.stringify(queueCardInventoryRevisionReceipt) !== JSON.stringify(next)) {
        queueCardInventoryRevisionReceipt = next;
        queueCardInventoryHydrator?.invalidate();
        queueCardInventoryIndexRows = null;
        queueCardInventoryIndex = window.AgMetricQueueInventory.createIndex();
    }
}
