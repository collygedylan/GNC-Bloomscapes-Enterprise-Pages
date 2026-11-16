function renderViewContent(viewId, forceReset = false, forceRender = false) {
    detachInactiveBloomscapesReceivingPanels(viewId);
    const changedView=bloomscapesThumbnailView!==viewId;
    if (forceReset || changedView) abortBloomscapesCardThumbnails(document);
    bloomscapesThumbnailView=viewId;
    const state = ensureViewRenderState(viewId);
    if (!forceReset && !forceRender && state.initialized && !state.dirty) {
        mountBloomscapesInventoryBrowse(viewId);
        incrementInternalPerfCounter('warmViewReuseHits');
        if(changedView)scheduleDeferredCardPhotoHydration(document.getElementById('view-'+viewId));
        return;
    }
    const renderStartedAt = beginInternalPerfMeasure();

    if (!renderBloomscapesNativeSalesOffice(viewId) && !renderBloomscapesMessagesView(viewId) && !renderBloomscapesDepartmentWorkspace(viewId) && !renderCoreAppView(viewId, state, forceReset) && !renderRequestAndWorkspaceView(viewId, state, forceReset) && !renderHubAppView(viewId)) {
        renderAuxiliaryAppView(viewId, state, forceReset);
    }

    mountBloomscapesDepartmentShortcuts(viewId);
    mountBloomscapesInventoryBrowse(viewId);
    state.initialized = true;
    state.dirty = false;
    scheduleIosPhoneTaskStyleModuleFlowCleanup(viewId, `render:${viewId}`, { resetScroll: false });
    recordInternalPerfDuration('viewRenderDurations', renderStartedAt, viewId || 'unknown');
    reportPerformanceHealthEvent('view_render', 'rendering', getAdaptivePerfElapsedMs(renderStartedAt), { reason: viewId || 'unknown' });
}

let bloomscapesThumbnailView='';
