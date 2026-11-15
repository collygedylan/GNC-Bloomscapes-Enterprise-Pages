function renderViewContent(viewId, forceReset = false, forceRender = false) {
    const state = ensureViewRenderState(viewId);
    if (!forceReset && !forceRender && state.initialized && !state.dirty) {
        incrementInternalPerfCounter('warmViewReuseHits');
        return;
    }
    const renderStartedAt = beginInternalPerfMeasure();

    if (!renderBloomscapesDepartmentWorkspace(viewId) && !renderCoreAppView(viewId, state, forceReset) && !renderRequestAndWorkspaceView(viewId, state, forceReset) && !renderHubAppView(viewId)) {
        renderAuxiliaryAppView(viewId, state, forceReset);
    }

    mountBloomscapesDepartmentShortcuts(viewId);
    state.initialized = true;
    state.dirty = false;
    scheduleIosPhoneTaskStyleModuleFlowCleanup(viewId, `render:${viewId}`, { resetScroll: false });
    recordInternalPerfDuration('viewRenderDurations', renderStartedAt, viewId || 'unknown');
    reportPerformanceHealthEvent('view_render', 'rendering', getAdaptivePerfElapsedMs(renderStartedAt), { reason: viewId || 'unknown' });
}
