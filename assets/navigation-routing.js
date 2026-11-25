let pendingNavigationDisplay = null;
function switchView(viewId, options = {}) {
    const target = String(BLOOMSCAPES_SHELL_ROUTE_ALIASES[viewId] || (viewId==='field-work-consolidation' && 'production')
        || (viewId === 'field-work-studio' && options.parkHillStudio === true && 'production')
        || (nativeAuthSessionActive && viewId === 'sales-office' && 'sales')
        || (nativeAuthSessionActive && viewId === 'production' && currentUser !== 'dylan_collyge' && currentUser !== 'megan_kelly'
            && !BLOOMSCAPES_FIELD_ENTRY_ROLES[nativeAuthProfile?.role] && 'drive')
        || (nativeAuthSessionActive && (currentUser === 'dylan_collyge' || currentUser === 'megan_kelly'
            || BLOOMSCAPES_FIELD_ENTRY_ROLES[nativeAuthProfile?.role]) && (
            viewId==='field-work-studio'
            || typeof BLOOMSCAPES_STUDIO_LEGACY_ROUTES !== 'undefined' && BLOOMSCAPES_STUDIO_LEGACY_ROUTES[viewId]!==undefined
            || viewId==='production-workflow' && productionWorkflowActive==='can-filling')
            ? 'production' : viewId==='chat' && nativeAuthSessionActive ? 'messages' : viewId || 'home')).trim();
    if (!canDisplayNavigationView(target)) {
        viewId!=='field-work-consolidation' && showToast('Access unavailable', 'You do not have permission to open this view.', true);
        return false;
    }
    if (!canAccessView(target)) return openDisplayOnlyNavigation(target, options);
    if (denyFieldWorkConsolidationRoute(viewId,options.studioPhase)) return false;
    if (target==='time-cards' && borrowedHelpPreview()) return false;
    if (typeof closeBloomscapesDockCapacity === 'function') closeBloomscapesDockCapacity();
    if (typeof closeActiveModuleSubview === 'function') closeActiveModuleSubview();
    if (viewId === 'office' || viewId === 'inventory-office') return openInventoryOfficeView();
    if (nativeAuthSessionActive && target==='communication') {
        bloomscapesCommState.mode='voice';markViewDirty('communication');
    }
    pendingNavigationDisplay = null;
    syncNavigationDisplayStatus(getViewElementById(target));
    if (options.boot === true && shouldPreserveMountedBootView()) return false;
    if (target==='production' && !preparePermittedStudioNavigation(viewId, options)) return false;
    if (options.boot !== true && currentUser) getAppBootViewState().userHasNavigated = true;
    const navigationSeq = ++navTransitionSeq;
    if (viewId === 'home' && restoreCameraDetailSession()) return;
    if (typeof getManagerTableManagementKey === 'function' && getManagerTableManagementKey(viewId)) return openManagerTableManagement(getManagerTableManagementKey(viewId));
    if (target === 'home' && !options.fromHistory && clearBloomscapesHomeDepartment()) {
        syncBloomscapesHomeTileVisibility(document.getElementById('home-dashboard-grid'));
    }
    const context = beginPrimaryViewNavigation(target, options, navigationSeq);
    preparePrimaryNavigationTarget(context);
    if (!preparePrimaryNavigationOrigin(context)) return false;
    mountPrimaryNavigation(context);
    afterNavigationPaint(context.nextViewId, navigationSeq, () => {
        if (context.nextViewId === 'home') scheduleCanonicalInventoryPrewarm();
        if (reusePrimaryNavigation(context)) return;
        renderPrimaryNavigation(context);
        restorePrimaryNavigationScroll(context);
        activatePrimaryNavigation(context);
    });
    return false;
}

function mountPrimaryNavigation(context) {
    const { nextViewId, currentViewId, rememberCurrentView, historyScroll } = context;
    const targetView = getViewElementById(nextViewId);
    if (targetView) {
        showOnlyPrimaryView(nextViewId);
        if (nextViewId === 'request') {
            if (currentViewId === 'home') mountHomeQueueCategoryControl();
            else mountQueCategoryControl();
        }
        if (nextViewId === 'drive') mountInventoryExcelFilters('drive');
        updateFooterNavState(nextViewId);
        if (nextViewId === 'docks') mountDocksFilterDisclosure(targetView);
    }
    if (window.__gncOpsPilot && typeof window.__gncOpsPilot.setActiveView === 'function') {
        window.__gncOpsPilot.setActiveView(nextViewId);
    }
    if (nextViewId === 'home') scheduleHomeDashboardFitSettle('view-switch-home');
    if (currentViewId && currentViewId !== nextViewId) {
        cancelScheduledViewRenderWork(currentViewId);
        cancelChunkRenderWorkForView(currentViewId);
        cancelScheduledUiRenderByPrefix(`view-enter:${currentViewId}`);
        cancelScheduledUiRenderByPrefix(`view-activate:${currentViewId}`);
        cancelScheduledUiRenderByPrefix(`view-chrome:${currentViewId}`);
    }
    cancelChunkRenderWorkForView(nextViewId);
    const nextState = ensureViewRenderState(nextViewId);
    if ((currentViewId === 'home' || currentViewId === 'managers') && nextViewId !== 'home' && nextViewId !== 'managers' && selectedProductivityUser) {
        selectedProductivityUser = '';
        markViewDirty(currentViewId);
    }
    if (rememberCurrentView) {
        pushViewHistoryEntry(currentViewId, historyScroll, nextViewId);
    }
    lastViewSwitchAt = Date.now();
    if (nextViewId !== 'home') ensureNativeBackGuard();
    Object.assign(context, { targetView, nextState });
}

function preparePrimaryNavigationOrigin(context) {
    const { nextViewId, currentViewId, switchOptions, fromHistory } = context;
    let targetScrollTop = switchOptions.targetScrollTop == null ? null : Math.max(0, Number(switchOptions.targetScrollTop) || 0);
    targetScrollTop = prepareManagerAssignedNavigation(currentViewId, nextViewId, targetScrollTop);
    if (shouldResetIosPhoneMainScrollForView(nextViewId)) targetScrollTop = 0;
    repairAppShellScrollState(`view-switch-start:${currentViewId || 'none'}:${nextViewId}`, { resetGestureState: currentViewId !== nextViewId });
    if (nextViewId === 'request') {
        clearIosPhoneRequestFlowState('request-switch-start', { resetScroll: true });
    }
    const switchGuardKey = `${currentViewId || 'none'}->${nextViewId}`;
    const switchNow = Date.now();
    if (!fromHistory && !switchOptions.force && currentViewId !== nextViewId && switchGuardKey === lastGuardedViewSwitchKey && (switchNow - lastGuardedViewSwitchAt) < VIEW_SWITCH_DUPLICATE_GUARD_MS) {
        return false;
    }
    lastGuardedViewSwitchKey = switchGuardKey;
    lastGuardedViewSwitchAt = switchNow;
    const rememberCurrentView = !fromHistory && currentViewId !== nextViewId && currentViewId && currentViewId !== 'detail';
    // Capture after scroll repair, before teardown/body writes invalidate
    // layout and can change the outgoing view's scroll anchoring.
    const leavingAssignedItems = currentViewId === 'managers' && activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW;
    const fittedHome = currentViewId === 'home' && document.getElementById('view-home')?.dataset.homeFitComplete === 'true';
    const originScrollTop = rememberCurrentView && !leavingAssignedItems ? (fittedHome ? 0 : getMainAreaScrollTop()) : null;
    const historyScroll = rememberCurrentView && leavingAssignedItems ? getManagerAssignedColumnState().scroll : originScrollTop;
    if (currentViewId === 'managers' && nextViewId !== 'managers') { cancelManagerModuleReads(); destroyManagerAssignedItemsView(); }
    if (currentViewId === 'communication' && nextViewId !== 'communication') unmountAlphaCommandCenter('communications');
    if (currentViewId === 'managers' && nextViewId !== 'managers' && activeHomeTab === MANAGER_HR_COMMAND_VIEW) unmountAlphaCommandCenter('hr');
    if (currentViewId === 'managers' && nextViewId !== 'managers' && activeHomeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) {
        window.GncProductionSchedule?.unmount();
    }
    Object.assign(context, { targetScrollTop, rememberCurrentView, historyScroll, originScrollTop });
    return true;
}

function reusePrimaryNavigation(context) {
    const { nextViewId, currentViewId, nextState, targetScrollTop, navigationSeq, viewSwitchStartedAt } = context;
    if (currentViewId !== nextViewId || !nextState.initialized || nextState.dirty) return false;
    incrementInternalPerfCounter('warmViewReuseHits');
    if (nextViewId === 'home') repairHomeDashboardShell('home-warm-reuse');
    if (nextViewId === 'managers' && activeHomeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) {
        const scheduleRoot = document.getElementById('manager-production-schedule-root');
        if (scheduleRoot) window.GncProductionSchedule?.mount(scheduleRoot, (payload, signal) => postAppFunctionJson(APP_API_FUNCTION_URL, payload, { timeoutMs: 30000, label: 'Production Schedule', signal }), getSupabaseReadIdentityScope());
    }
    if (nextViewId === 'managers' && activeHomeTab === MANAGER_HR_COMMAND_VIEW) void mountAlphaCommandCenter('hr', document.getElementById('manager-hr-command-root'));
    if (nextViewId === 'communication') renderCommunicationHub();
    if (nextViewId === 'request') {
        scheduleRequestNavigationLiveWake('request-warm-reuse');
    }
    if (targetScrollTop != null) scheduleUiRender(`view-restore:${nextViewId}:${targetScrollTop}`, () => { if (isCurrentNavigationTransition(navigationSeq, nextViewId)) setMainAreaScrollTop(targetScrollTop); });
    syncGlobalHeaderChrome({ reason: `view-reuse:${nextViewId}`, force: true });
    scheduleStickyRailOffsetSync(`view-reuse:${nextViewId}`, true);
    if (isIosPhoneRequestFlowView(nextViewId)) scheduleIosPhoneRequestFlowAudit('view-reuse', { resetScroll: true });
    schedulePrimaryViewChromeRefresh(nextViewId, {
        delay: 0,
        requestSyncDelay: nextViewId === 'request' ? 120 : 0,
        passive: true,
        passiveDelay: isTouchConstrainedDevice() ? 20 : 6,
        skipStickySync: false,
        skipHeaderSync: true
    });
    repairAppShellScrollState(`view-reuse:${nextViewId}`);
    recordGncPerfStat('viewSwitches', {
        mode: 'reuse',
        from: currentViewId || 'none',
        to: nextViewId,
        duration: getAdaptivePerfElapsedMs(viewSwitchStartedAt)
    }, 80);
    reportPerformanceHealthEvent('view_switch', 'navigation', getAdaptivePerfElapsedMs(viewSwitchStartedAt), { reason: 'warm_reuse' });
    recordInternalPerfDuration('viewSwitchDurations', viewSwitchStartedAt, `${currentViewId || 'none'}->${nextViewId}`);
    return true;
}

function renderPrimaryNavigation(context) {
    const { nextViewId, nextState, targetView, switchOptions } = context;
    const managerCommandOwnsRender = nextViewId==='managers' && !!switchOptions?.quickAccessTab;
    const needsTargetRender = !managerCommandOwnsRender && (!nextState.initialized || nextState.dirty);
    const renderToken = needsTargetRender ? prepareLatestViewRender(nextViewId) : 0;
    if (!targetView) {
        if (needsTargetRender) queueViewRender(nextViewId);
        return;
    }
    const synchronous = needsTargetRender && shouldRenderViewSynchronouslyOnSwitch(nextViewId, nextState);
    if (synchronous) {
        runPrimaryNavigationTargetRender(context,renderToken,true);
        return;
    }
    syncGlobalHeaderChrome({reason:`view-switch:${nextViewId}`,force:true});
    scheduleStickyRailOffsetSync(`view-switch:${nextViewId}`,true);
    if (needsTargetRender) {
        scheduleUiRender(`view-switch-render:${nextViewId}`,()=>runPrimaryNavigationTargetRender(context,renderToken),isTouchConstrainedDevice()?12:4);
    }
}

function runPrimaryNavigationTargetRender({ nextViewId, navigationSeq }, renderToken, syncHeader = false) {
    if (!isLatestViewRenderToken(nextViewId, renderToken)) {
        incrementInternalPerfCounter('staleViewRenderSkips');
        return;
    }
    if (isCurrentNavigationTransition(navigationSeq, nextViewId)) renderViewContent(nextViewId, false, false, syncHeader);
}

function restorePrimaryNavigationScroll(context) {
    const { nextViewId, currentViewId, targetScrollTop, navigationSeq, originScrollTop } = context;
    if (targetScrollTop != null) return queueExplicitPrimaryNavigationScroll(context);
    if (currentViewId === nextViewId) return;
    if (originScrollTop != null) return queueScrollMainAreaToTop(`view:${nextViewId}`, originScrollTop);
    scheduleUiRender('view-scroll-reset', () => {
        if (isCurrentNavigationTransition(navigationSeq, nextViewId)) queueScrollMainAreaToTop(`view:${nextViewId}`);
    });
}

function queueExplicitPrimaryNavigationScroll(context) {
    const { nextViewId, targetScrollTop, navigationSeq } = context;
    scheduleUiRender(`view-restore:${nextViewId}:${targetScrollTop}`, () => {
        if (!isCurrentNavigationTransition(navigationSeq, nextViewId)) return;
        setMainAreaScrollTop(targetScrollTop);
        requestAnimationFrame(() => confirmPrimaryNavigationScroll(context));
    });
}

function confirmPrimaryNavigationScroll({ nextViewId, targetScrollTop, navigationSeq }) {
    if (!isCurrentNavigationTransition(navigationSeq, nextViewId)) return;
    if (Math.abs(getMainAreaScrollTop() - targetScrollTop) > 2) setMainAreaScrollTop(targetScrollTop);
    if (isIosPhoneRequestFlowView(nextViewId)) scheduleIosPhoneRequestFlowAudit('view-restore', { resetScroll: true });
}

function activatePrimaryNavigation(context) {
    const { nextViewId, currentViewId, nextState, targetView, viewSwitchStartedAt } = context;
    const shouldActivateImmediately = shouldRunImmediateViewActivation(nextViewId, nextState);
    const warmCleanTarget = nextState.initialized && !nextState.dirty && !shouldActivateImmediately;
    schedulePrimaryViewChromeRefresh(nextViewId, {
        delay: warmCleanTarget ? 0 : 0,
        requestSyncDelay: nextViewId === 'request' ? 120 : 0,
        passive: warmCleanTarget,
        passiveDelay: warmCleanTarget ? (isTouchConstrainedDevice() ? 22 : 8) : 0,
        skipStickySync: false,
        skipHeaderSync: false
    });
    if (nextViewId === 'smart-moves') warmSalesIntelligenceData();
    if (nextViewId === 'request') scheduleRequestNavigationLiveWake('request-switch');
    if (shouldActivateImmediately) {
        scheduleViewActivationWork(nextViewId);
    } else {
        scheduleWarmViewFollowup(nextViewId, nextState, {
            allowWarmRefresh: !warmCleanTarget,
            syncRealtime: true,
            delay: warmCleanTarget ? (isTouchConstrainedDevice() ? 64 : 32) : (isTouchConstrainedDevice() ? 56 : 28),
            backgroundDelay: warmCleanTarget ? (isTouchConstrainedDevice() ? 148 : 104) : (isTouchConstrainedDevice() ? 128 : 92)
        });
    }
    recordGncPerfStat('viewSwitches', {
        mode: targetView ? 'switch' : 'queued',
        from: currentViewId || 'none',
        to: nextViewId,
        duration: getAdaptivePerfElapsedMs(viewSwitchStartedAt)
    }, 80);
    reportPerformanceHealthEvent('view_switch', 'navigation', getAdaptivePerfElapsedMs(viewSwitchStartedAt), { reason: targetView ? 'switch' : 'queued' });
    recordInternalPerfDuration('viewSwitchDurations', viewSwitchStartedAt, `${currentViewId || 'none'}->${nextViewId}`);
    return false;

}


function shouldRenderViewSynchronouslyOnSwitch(viewId = '', state = null) {
    const targetViewId = String(viewId || '').trim();
    if (!targetViewId) return false;
    if (targetViewId === 'av' && canRenderWarmAvInventory()) return true;
    if (typeof canRenderNavigationSnapshot === 'function' && canRenderNavigationSnapshot(targetViewId)) return true;
    if (targetViewId === 'request') {
        const requestState = (state && typeof state === 'object') ? state : ensureViewRenderState(targetViewId);
        return !requestState.initialized || !!requestState.dirty;
    }
    if (targetViewId === 'managers' && activeHomeTab === 'dashboard') {
        const managerState = (state && typeof state === 'object') ? state : ensureViewRenderState(targetViewId);
        if (managerState.initialized && !managerState.dirty) return false;
        const managerConfig = getViewLoadingConfig(targetViewId);
        // The module picker is a small navigation shell with no required
        // dataset cohort. Render it in the click turn so touch devices
        // don't pay an extra timer and animation-frame hop.
        return !(managerConfig && Array.isArray(managerConfig.required) && managerConfig.required.length);
    }
    if (isTouchConstrainedDevice() || isIOSDevice()) return false;
    const lightViewIds = ['home', 'sales', 'qc', 'communication', 'production', 'sales-inventory', 'disease-pest', 'office', 'po-management'];
    if (!lightViewIds.includes(targetViewId)) return false;
    const safeState = (state && typeof state === 'object') ? state : ensureViewRenderState(targetViewId);
    if (safeState.initialized && !safeState.dirty) return false;
    const config = getViewLoadingConfig(targetViewId);
    return !(config && Array.isArray(config.required) && config.required.length);
}
