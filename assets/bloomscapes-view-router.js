function renderViewContent(viewId, forceReset = false, forceRender = false) {
    mountBloomscapesCalendarShell(viewId);
    syncBloomscapesCommLifecycle(viewId);
    detachInactiveBloomscapesReceivingPanels(viewId);
    const changedView=bloomscapesThumbnailView!==viewId;
    if (changedView || forceReset) {
        activateBloomscapesDocksWorkspace(viewId);
        activateBloomscapesBorrowedField(viewId);
    }
    if (forceReset || changedView) abortBloomscapesCardThumbnails(document);
    bloomscapesThumbnailView=viewId;
    const state = ensureViewRenderState(viewId);
    if (!forceReset && !forceRender && state.initialized && !state.dirty) {
        renderBloomscapesDispatchWorkspaces(viewId);
        mountBloomscapesFieldBorrowing(viewId);
        mountBloomscapesInventoryBrowse(viewId);
        syncGlobalHeaderChrome({reason:'view-content-ready'});
        incrementInternalPerfCounter('warmViewReuseHits');
        if(changedView)scheduleDeferredCardPhotoHydration(document.getElementById('view-'+viewId));
        return;
    }
    const renderStartedAt = beginInternalPerfMeasure();

    if (!renderBloomscapesDispatchWorkspaces(viewId) && !renderBloomscapesNativeSalesOffice(viewId) && !renderBloomscapesMessagesView(viewId) && !renderBloomscapesDepartmentWorkspace(viewId) && !renderCoreAppView(viewId, state, forceReset) && !renderRequestAndWorkspaceView(viewId, state, forceReset) && !renderHubAppView(viewId)) {
        renderAuxiliaryAppView(viewId, state, forceReset);
    }

    if (viewId==='docks') mountBloomscapesDockLinks();
    if (viewId==='office') mountBloomscapesOrderDocuments(document.getElementById('view-office'),'office');
    mountBloomscapesDepartmentShortcuts(viewId);
    mountBloomscapesFieldBorrowing(viewId);
    mountBloomscapesInventoryBrowse(viewId);
    syncGlobalHeaderChrome({reason:'view-content-ready'});
    state.initialized = true;
    state.dirty = false;
    scheduleIosPhoneTaskStyleModuleFlowCleanup(viewId, `render:${viewId}`, { resetScroll: false });
    recordInternalPerfDuration('viewRenderDurations', renderStartedAt, viewId || 'unknown');
    reportPerformanceHealthEvent('view_render', 'rendering', getAdaptivePerfElapsedMs(renderStartedAt), { reason: viewId || 'unknown' });
}

let bloomscapesThumbnailView='';

function renderBloomscapesDispatchWorkspaces(viewId) {
    if (viewId==='time-cards') {renderBloomscapesTimeCards();return true;}
    return renderBloomscapesBorrowedField(viewId) || renderBloomscapesDocksWorkspace(viewId);
}
