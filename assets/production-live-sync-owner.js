function getProductionLiveSyncCoordinator() {
    if (productionLiveSyncCoordinator) return productionLiveSyncCoordinator;
    if (!canUseProductionLiveSync()) return null;
    productionLiveSyncCoordinator = window.AgMetricLiveSync.createCoordinator({
    subscribe: (_onChange, onReconnect) => subscribeBatteryLiveRevisions(onReconnect),
    setTimeout: (fn, delay) => {
        const scope = window.AgMetricLifecycle.createScope({ lifetime: 'session', foreground: true });
        const cancel = scope.timeout(() => { try { fn(); } finally { scope.dispose(); } }, delay);
        return () => { cancel(); scope.dispose(); };
    },
    clearTimeout: cancel => cancel(),
    getContext: getProductionLiveSyncContext,
    eventDrivenRevisions: true,
    realtimeDebounceMs: 2500,
    connectionSourceKeys: () => ['ph_master_inventory'],
    onRevisionRead: recordDatasetRevisionConnection,
    readRevisions: readProductionLiveRevisions,
    readCachedSnapshot: readProductionVerifiedSnapshot,
    readDisplaySnapshot: readProductionDisplaySnapshot,
    previewSnapshots: previewProductionSnapshots,
    retainAppliedDisplay: retainAppliedProductionDisplay,
    writeCachedSnapshot: writeProductionVerifiedSnapshot,
    concurrency: isTouchConstrainedDevice() ? 1 : 2,
    getForegroundConcurrency: (context) => context.view === 'docks'
        || context.view === 'request' && context.surfaces.includes('request:suspend-tag') ? 2
        : isTouchConstrainedDevice() ? 1 : 2,
    onStageStart: (context, metadata) => {
        if (context.priority !== 'background') {
            productionLiveSyncReadGeneration += 1;
            abortSupabaseReadsBeforeGeneration();
        }
        const permissionVersion = String(metadata.permissionVersion || '');
        productionLiveSyncReadPermissionVersion = permissionVersion;
    },
    onStatus: publishProductionLiveSyncStatus,
    onPermissionChange: () => refreshNativeRoleAndCapabilities('live-permissions'),
    commitSnapshots: commitProductionLiveSnapshots,
    explicitNavigationOnly: false,
    recentlyActive: () => document.visibilityState === 'visible' && Date.now()-lastUserInteractionAt < 60000
});
    return productionLiveSyncCoordinator;
}
