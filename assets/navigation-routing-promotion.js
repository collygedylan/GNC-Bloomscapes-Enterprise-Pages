/**
 * @param {string} viewId Visible view identifier.
 * @param {object} options Configuration for this operation.
 * @returns {boolean} Navigation handler result after displaying cached state.
 */
function openDisplayOnlyNavigation(viewId, options = {}) {
    if (options.boot === true && shouldPreserveMountedBootView()) return false;
    const previous = getCurrentVisibleViewId();
    if (options.boot !== true && currentUser) getAppBootViewState().userHasNavigated = true;
    navTransitionSeq += 1;
    const identity = getNavigationVisibilityIdentity();
    pendingNavigationDisplay = { viewId, sequence: navTransitionSeq, owner: `${identity?.id}:${identity?.username}` };
    persistAppFilterStateNow();
    if (isDrawerOpen()) setMenuOpenState(false);
    if (previous && previous !== viewId) {
        cancelScheduledViewRenderWork(previous);
        cancelChunkRenderWorkForView(previous);
        if (previous !== 'detail') pushViewHistoryEntry(previous, getMainAreaScrollTop(), viewId);
    }
    if (previous === 'managers') cancelManagerModuleReads();
    showOnlyPrimaryView(viewId);
    const host = getViewElementById(viewId);
    syncNavigationDisplayStatus(host, ensureViewRenderState(viewId).initialized ? '' : 'Loading module accessâ€¦');
    updateFooterNavState(viewId);
    syncGlobalHeaderChrome({ reason: `view-display:${viewId}`, force: true });
    repairAppShellScrollState(`view-display:${viewId}`, { resetGestureState: previous !== viewId });
    if (options.targetScrollTop != null) setMainAreaScrollTop(Math.max(0, Number(options.targetScrollTop) || 0));
    else if (previous !== viewId) queueScrollMainAreaToTop(`view:${viewId}`);
    if (viewId !== 'home') ensureNativeBackGuard();
    return false;
}

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

function isNavigationDisplayPromotionCurrent(pending) {
    const identity = getNavigationVisibilityIdentity();
    return pendingNavigationDisplay === pending && identity
        && pending.owner === `${identity.id}:${identity.username}`
        && pending.sequence === navTransitionSeq && getCurrentVisibleViewId() === pending.viewId
        && pending.viewId !== 'detail' && canAccessView(pending.viewId);
}
/** @returns {boolean} Whether the verified view promotion was scheduled. */
function promoteNavigationDisplayAfterAccess() {
    const pending = pendingNavigationDisplay;
    if (!pending || !isNavigationDisplayPromotionCurrent(pending)) return false;
    scheduleUiRender(`navigation-access-ready:${pending.viewId}`, () => applyNavigationDisplayPromotion(pending));
    return true;
}
