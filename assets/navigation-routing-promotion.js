function applyNavigationDisplayPromotion(pending) {
    if (!isNavigationDisplayPromotionCurrent(pending)) return;
    const scrollTop = getMainAreaScrollTop();
    const state = ensureViewRenderState(pending.viewId);
    pendingNavigationDisplay = null;
    if (!state.initialized) {
        const token = prepareLatestViewRender(pending.viewId);
        runPrimaryNavigationTargetRender({ nextViewId: pending.viewId, navigationSeq: pending.sequence }, token);
    }
    syncNavigationDisplayStatus(getViewElementById(pending.viewId));
    scheduleViewActivationWork(pending.viewId);
    schedulePostRenderMainAreaScrollRestore(pending.viewId, 'navigation-access-ready', scrollTop);
}
