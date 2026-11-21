function previewProductionSnapshots(snapshots, context) {
    if (!context.progressive || !context.visible || hasProductionLiveSyncDraft()) return;
    if (context.readIdentity && context.readIdentity !== getSupabaseReadIdentityScope()) return false;
    snapshots = snapshots.filter(({adapter,value}) => adapter.id !== 'core:master' || value?.rowCompleteness === 'complete');
    const previewCore = context.view === 'docks' ? 'core:soc' : 'core:master';
    if (context.partialCohort && (!['drive', 'av', 'tasks', 'docks'].includes(context.view)
        || snapshots.some(({ adapter }) => adapter.id !== previewCore))) return;
    snapshots = snapshots.filter(acceptDockInventoryPreview);
    snapshots = snapshots.filter(({ adapter, value }) => adapter.id !== 'core:warehouseAssignedItems'
        || value?.rowCompleteness === 'complete'
        || Number(value?.rowCount || 0) >= getDatasetRenderRowCount('warehouseAssignedItems'));
    if (!snapshots.length) return false;
    const payload = { _verifiedLiveSync: true, _fromCache: true };
    const confirmedRevision = confirmedArgosReclassLiveEditRevisions.get(getArgosReclassLiveEditIdentityKey()) || '';
    const pendingInventoryMove = (typeof argosInventoryTransactionState !== 'undefined'
        && !!argosInventoryTransactionState?.pendingReclassMove)
        || fullInventory.some(row => row.__optimisticReclassMove);
    const incomingMaster = snapshots.find(({ adapter }) => adapter.id === 'core:master')?.value;
    const retainCompleteMaster = productionDisplayMasterReceipt?.rows === fullInventory
        && productionDisplayMasterReceipt.readScope === getSupabaseReadIdentityScope()
        || globalThis.GncInventoryHydrationRecovery?.shouldRetainCompleteInventorySnapshot({ currentRows: fullInventory,
            currentState: getDatasetState('master'), incomingRows: incomingMaster?.payload?.data,
            incomingCompleteness: incomingMaster?.rowCompleteness });
    const previewEntries = snapshots.filter(({ adapter, value }) => adapter.id !== 'core:master'
        || !pendingInventoryMove && !(confirmedRevision && value?.cached === true)
            && !(retainCompleteMaster && value?.rowCompleteness !== 'complete'));
    const hasCompletePreview = previewEntries.length === snapshots.length;
    if (!context.partialCohort) previewEntries.filter(({ adapter }) => adapter.id.startsWith('side:')).forEach(({ adapter, value }) => adapter.commit(value));
    previewEntries.filter(({ adapter }) => adapter.id.startsWith('core:')).forEach(({ value }) => Object.assign(payload, value.payload));
    if (context.partialCohort && Array.isArray(payload.data)) {
        payload.data = mergeExactAvSearchRowsIntoPreview(payload.data, context);
    }
    const masterPreviewRows = payload.data;
    const alreadyDisplayedPreparedMaster = !!(masterPreviewRows && masterPreviewRows === fullInventory
        && getCurrentPreparedMasterRows(masterPreviewRows)?.avOpenRows === avOpenInventory);
    if (previewEntries.some(({ adapter }) => adapter.id.startsWith('core:')) && !alreadyDisplayedPreparedMaster) processAndLoadData(payload);
    const completeMasterDisplay = previewEntries.find(({ adapter, value }) => adapter.id === 'core:master'
        && value.rowCompleteness === 'complete' && Array.isArray(value.payload?.data));
    if (completeMasterDisplay) {
        productionDisplayMasterReceipt = { rows: fullInventory, readScope: getSupabaseReadIdentityScope(),
            permission: context.dataPermissionVersion };
    }
    if (!hasCompletePreview) {
        invalidateResolvedViewStateCaches();
        scheduleProductionLiveSyncRender(true, { cachedPreview: true });
        return;
    }
    finishCompleteInventoryPreview(snapshots, context, alreadyDisplayedPreparedMaster);
}

function acceptDockInventoryPreview({ adapter, value }) {
    if (adapter.id !== 'core:soc' || value?.rowCompleteness === 'complete') return true;
    if (suspendSocDisplayIdentity !== getSuspendSocDisplayIdentity()) return true;
    return Array.isArray(value?.payload?.socData) && value.payload.socData.length >= socInventory.length;
}

function finishCompleteInventoryPreview(snapshots, context, alreadyDisplayedPreparedMaster) {
    const displayKey = productionDisplayGroupKey(context);
    const cachedTimes = snapshots.map(({ adapter }) => productionDisplaySnapshotTimes.get(`${displayKey}\u001f${adapter.id}`)).filter(Boolean);
    if (!context.partialCohort && cachedTimes.length === snapshots.length && cachedTimes.length) {
        const oldest = cachedTimes.map(value => Date.parse(value)).reduce((min, value) => Math.min(min, value), Infinity);
        if (Number.isFinite(oldest)) productionDisplayVerifiedAt.set(displayKey, new Date(oldest).toISOString());
    }
    productionDisplayGroups.add(displayKey);
    renderProductionDataFreshness(productionLiveSyncCoordinator.getStatus());
    if (!alreadyDisplayedPreparedMaster) invalidateResolvedViewStateCaches();
    scheduleProductionLiveSyncRender(true, { cachedPreview: true });
}

async function recoverColdInventoryView(viewId, load) {
    if (!['drive', 'av'].includes(viewId) || load.recoveryStarted
        || productionLiveSyncViewLoad !== load || getCurrentVisibleViewId() !== viewId) return;
    load.recoveryStarted = true;
    const scope = window.AgMetricLifecycle.createScope({lifetime:'view',foreground:true});
    const owner = getSupabaseReadIdentityScope();
    const current = () => scope.isCurrent() && owner === getSupabaseReadIdentityScope()
        && productionLiveSyncViewLoad === load && getCurrentVisibleViewId() === viewId;
    try {
        await warmColdOperationalDisplay();
        if (!current()) return;
        await ensureDatasetLoaded('master', 'full', {bypassLiveSyncCoordinator:true, signal:scope.signal});
        if (current()) load.failed = false;
    } catch (error) {
        if (current()) {
            load.error = error;
            showAvReadUnavailableState(error, hasProgressiveViewData(getProductionLiveSyncContext()), viewId);
        }
    } finally { scope.dispose(); }
}
