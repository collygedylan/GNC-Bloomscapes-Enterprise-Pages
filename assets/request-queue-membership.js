/** @param {string} reason @param {object} options @param {object} reconciled @param {boolean} immediate @returns {void} */
function refreshVisibleRequestQueue(reason, options, reconciled, immediate) {
    if (reason === 'request-complete-retry' && normalizeRequestTabValue(activeReqTab) === 'pending') {
        renderPendingRequestReceiptSnapshot(reconciled.items);
        return;
    }
    if (String(reason).startsWith('request-live-sync')) {
        scheduleHydratedViewRender('request');
        return;
    }
    if (immediate) {
        renderViewContent('request', false, true);
        return;
    }
    scheduleTrackedViewRender('request', `request:local:${String(reason || 'refresh').trim() || 'refresh'}`, {
        delay: 0,
        typingDelay: Math.max(32, Number(options.typingDelay) || 64),
        forceRender: options.forceRender === true || !!reconciled?.changed,
        preferImmediate: false,
        userAction: options.userAction !== false,
        yieldToPaint: true,
        paintYieldDelayMs: isTouchConstrainedDevice() ? 18 : 8,
        allowWhileTouching: true,
        allowWhileScrolling: true,
        allowDuringLiveGesture: true,
        allowDuringRecentInteraction: true,
        allowDuringExtendedBlock: true,
        touchDelayMs: 16,
        interactionDelayMs: 16,
        scrollDelayMs: 32,
        maxDeferMs: USER_VISIBLE_FORCE_RENDER_MAX_DEFER_MS
    });
}

function renderPendingRequestReceiptSnapshot(rows) {
    const container = document.getElementById('request-content');
    const crumb = document.getElementById('request-crumb');
    if (!container) return;
    cancelChunkRenderWorkForView('request');
    container.__pendingRequestStage = null;
    completedPendingRequestRender = null;
    const plan = buildPendingRequestRenderPlan(rows);
    const markup = plan.rows.map(row => generateCard(row,'request','status-purple')).join('')
        || '<div class="p-8 text-center text-gray-400">No pending requests.</div>';
    applyRequestRenderMarkup(container,crumb,plan.crumbText,markup,plan.renderSignature || 'request:pending:empty');
    decorateRequestRows();
    syncRequestBrowseFooter(container,plan.footerMarkup);
    scheduleDeferredCardPhotoHydration(container);
}

/** @param {string} [tab] @returns {object} */
function queueAccessScope(tab = 'suspend-tag') {
    const user = normalizeEvalAssignableUser(currentUser).replace(/^nally_aguilar$/, 'nelly_aguilar');
    const access = globalThis.GncUserAccessControl;
    const resolved = access?.resolveUserAccessMatrix(user);
    const matrix = resolved?.__pendingAccessWrite ? null : resolved;
    const role = String(matrix?.role || (typeof currentRole === 'string' ? currentRole : '')).toUpperCase().replace(/[^A-Z]/g, '');
    const preview = typeof borrowedHelpPreview === 'function' ? borrowedHelpPreview() : null;
    const effectiveRole = String(preview?.role || role).toUpperCase();
    if (['EVAL','EVALUATOR'].includes(effectiveRole)) {
        const owner = preview ? normalizeEvalAssignableUser(preview.username || '') : user;
        return {user:owner,all:false,initial:owner,exact:true};
    }
    const admin = ['ADMIN', 'ADMINISTRATOR', 'SUPERADMIN'].includes(role);
    if (tab === 'pending') {
        const all = !!user && (admin || role === 'MANAGER'
            || GLOBAL_LIVE_CHANGE_USER_KEYS.has(user) || matrix?.view_all_requests === 'Y'
            || matrix?.request_default_scope === 'ALL');
        return { user, all, initial: all ? 'ALL' : user };
    }
    const all = !!user && admin;
    const defaultsToOwner = ['dylan_collyge', 'megan_kelly'].includes(user);
    return { user, all, initial: all && !defaultsToOwner ? 'ALL' : user };
}

/** @param {string} tab @returns {object} */
function getQueueScopeFilter(tab) {
    const policy = queueAccessScope(tab);
    if (['pending','suspend-tag'].includes(tab) && typeof getBloomscapesJobBoardFilters==='function') {
        const assigned = getBloomscapesJobBoardFilters(tab).assigned;
        if (!policy.all) return policy.user;
        if (assigned==='all') return 'ALL';
        if (assigned==='mine') return policy.user;
        return assigned==='unassigned' ? 'Unassigned' : normalizeEvalAssignableUser(assigned);
    }
    const state = getManagerAssignedColumnState();
    const signature = [policy.user, policy.all, policy.initial].join('|');
    state.queueScopeFilters ||= {};
    let choice = state.queueScopeFilters[tab];
    if (!choice || choice.signature !== signature) {
        choice = { signature, value: policy.initial };
        state.queueScopeFilters[tab] = choice;
    }
    return policy.all ? choice.value : policy.user;
}

/** @param {object} row @param {string} [tab] @returns {boolean} */
function isQueueOwnerVisible(row, tab = isDockSuspendDcRequestMirrorRow(row) ? 'suspend-tag' : 'pending') {
    if (!bloomscapesFarmRowIsVisible(row)) return false;
    return queueOwnerMatchesSelection(row,tab,getQueueScopeFilter(tab),queueAccessScope(tab).exact);
}

function queueOwnerMatchesSelection(row,tab,selected,exact = false) {
    if (selected==='ALL') return true;
    if (!selected) return false;
    if (exact) return exactBloomscapesReclassOwner(row,getBloomscapesFarm()) === selected;
    const owner = getAssignedQueueOwner(row) || 'Unassigned';
    return (tab==='suspend-tag' ? normalizeSuspendQueueOwner(owner) : owner)===selected;
}

/** @param {string} [tab] @returns {function(object): boolean} */
function createQueueOwnerVisibilityPredicate(tab='') {
    if (tab) {
        const selection=getQueueScopeFilter(tab);
        const {exact} = queueAccessScope(tab);
        return row=>bloomscapesFarmRowIsVisible(row) && queueOwnerMatchesSelection(row,tab,selection,exact);
    }
    const pending=getQueueScopeFilter('pending'), suspend=getQueueScopeFilter('suspend-tag');
    const {exact} = queueAccessScope('pending');
    return row=>{
        if (!bloomscapesFarmRowIsVisible(row)) return false;
        return isDockSuspendDcRequestMirrorRow(row) ? queueOwnerMatchesSelection(row,'suspend-tag',suspend,exact) : queueOwnerMatchesSelection(row,'pending',pending,exact);
    };
}

/** @param {*} value @returns {string} */
function normalizeSuspendQueueOwner(value) {
    const owner = normalizeEvalAssignableUser(value);
    if (owner === 'dc') return 'dylan_collyge';
    if (owner === 'ms') return 'megan_kelly';
    return owner === 'unassigned' ? 'Unassigned' : owner;
}

function useAllSuspendOwnersIfPersonalEmpty(activeRows) {
    const scope = queueAccessScope('suspend-tag');
    if (!scope.all || getQueueScopeFilter('suspend-tag') !== scope.user || !activeRows.length) return;
    const choice = getManagerAssignedColumnState().queueScopeFilters['suspend-tag'];
    if (activeRows.some(createQueueOwnerVisibilityPredicate('suspend-tag'))) return;
    choice.value = 'ALL';
    requestScopedItemsCacheKey = '';
}

/** @param {Array<object>} rows @param {Array<object>} activeRows @returns {Array<object>} */
function suspendQueueRowsForOwner(rows, activeRows) {
    useAllSuspendOwnersIfPersonalEmpty(activeRows);
    return rows.filter(createQueueOwnerVisibilityPredicate('suspend-tag'));
}

/** @param {Array<object>} [rows] @returns {Array<object>} */
function applySuspendEvalUserFilter(rows = []) {
    return suspendQueueRowsForOwner(rows, []);
}

/** @param {Array<object>} rows @returns {boolean} */
function prunePendingRequestCards(rows) {
    if (normalizeRequestTabValue(activeReqTab) !== 'pending') return false;
    const container = document.getElementById('request-content');
    if (!container) return false;
    const pendingIds = new Set(rows.filter(isRequestPendingVisible).map(getItemUniqueId));
    const removed = new Set();
    for (const card of container.querySelectorAll('[data-request-uid]')) {
        if (pendingIds.delete(card.getAttribute('data-request-uid'))) continue;
        removed.add(card.closest('.request-swipe-row') || card);
    }
    if (!removed.size) return false;
    cancelChunkRenderWorkForView('request');
    container.__pendingRequestStage = null;
    completedPendingRequestRender = null;
    for (const card of removed) card.remove();
    setContainerRenderSignature(container, '');
    if (container.dataset) delete container.dataset.requestRenderKey;
    return true;
}

/** @param {string} tab @returns {void} */
function activateQueCategory(tab) {
    activeReqTab = tab;
    syncQueActiveCategory();
}

/** @param {string} tab @param {number} navigationSeq @returns {void} */
function scheduleQueCategoryRefresh(tab, navigationSeq) {
    runAfterShellInteractive(() => {
        if (!isCurrentNavigationTransition(navigationSeq, 'request') || activeReqTab !== tab) return;
        if (tab === 'projects') return void ensureQueueInventoryProjectsData(true);
        if (window.BunchQueueShell?.isTab(tab)) return;
        if (tab === 'eval-work') return void loadEvalWorkAssignments(true).catch(() => {});
        if (tab === 'suspend-tag') refreshQueSuspendCategory(navigationSeq);
        forceRefreshRequestsForView('request-tab', {
            force: false,
            allowWhileInteractive: true,
            minIntervalMs: 45000
        }).catch(() => {});
    });
}

function refreshQueSuspendCategory(navigationSeq) {
    const targets = [{ key: 'suspendTag', mode: 'full' }, { key: 'master', mode: 'initial' }, { key: 'soc', mode: 'full' }]
        .filter(({key,mode}) => !isDatasetLoaded(key,mode) || shouldRefreshQueueDataset(key,45000));
    if (!targets.length) return;
    loadDatasetTargetsWithLimit(targets, {
        force: true,
        preserveRequestedMode: true,
        allowWhileInteractive: true,
        retryReason: 'request-tab-suspend'
    }, 2).then(() => {
        if (isCurrentNavigationTransition(navigationSeq, 'request') && activeReqTab === 'suspend-tag') {
            scheduleRequestRender(0, 0, true);
        }
    }).catch(() => {});
}

/** @param {string} nextTab @returns {void} */
function resetQueCategoryDrills(nextTab) {
    activeReqTab = nextTab;
    if (nextTab === 'eval-work') subscribeEvalWorkRealtime();
    activeLocationMoveQueDetailUid = '';
    activeLocationWorkJobId = '';
    activeShearQueDetailId = '';
    activeAvOptionEvalDetailId = '';
    if (nextTab !== 'eval-work') activeEvalWorkDetailId = '';
    requestViewLevel = 0;
    selectedReqFolder = null;
    selectedReqRepView = null;
    selectedReqCustView = null;
    selectedReqConsigneeView = null;
    selectedReqFolderView = null;
    requestFolderSearchTerm = '';
    requestRepSearchTerm = '';
    requestCustomerSearchTerm = '';
    requestConsigneeSearchTerm = '';
    requestFolderDateFilter = '';
    if (nextTab === 'suspend-tag') {
        requestDylanFilterMode = 'all';
        requestDylanFilterValue = '';
        requestDylanSalesRepValue = '';
        requestDylanFilterMenuOpen = '';
    }
    clearSelection();
}

/** @param {string} [reason] @param {object} [options] @returns {void} */
function refreshLocalRequestViewState(reason = 'request-local', options = {}) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const renderVisible = safeOptions.renderVisible !== false;
    const allowSameFrameRender = safeOptions.allowSameFrameRender === true;
    const renderImmediate = safeOptions.immediate === true && allowSameFrameRender && !isTouchConstrainedDevice() && !isIOSDevice();
    invalidateResolvedViewStateCaches();
    prunePendingRequestCards(requestsInventory);
    const reconciledState = reconcileRequestDrillState(requestsInventory);
    updateFooterRequestBadge();
    requestViewLiveSyncSignature = buildRequestLiveSyncSignature(requestsInventory);
    persistCurrentCache(safeOptions.persistImmediate === true, reason);
    markViewDirty('request');
    markViewDirty('reports');
    const requestVisible = isViewVisible('request');
    if (!renderVisible) return;
    if (requestVisible) refreshVisibleRequestQueue(reason,safeOptions,reconciledState,renderImmediate);
    if (isViewVisible('reports')) queueInteractiveViewRender('reports', false, !!safeOptions.forceReportsRender, 0, 140);
}

/** @param {object} options @param {boolean} includeDockSuspendMirrorRows @param {string} requestScopeMode @param {boolean} hasGlobalRequestAccess @param {Set<string>|null} assignedItemcodes @returns {string} Cache key for the current account, queue and assignment revision. */
function scopedRequestCacheKey(options,includeDockSuspendMirrorRows,requestScopeMode,hasGlobalRequestAccess,assignedItemcodes) {
    return [
        resolvedViewStateEpoch,
        getDatasetLoadSignature('requests'),
        includeDockSuspendMirrorRows ? canUseRequestSuspendTagAssignedToFilter() : '',
        includeDockSuspendMirrorRows ? getDatasetLoadSignature(activeReqTab === 'suspend-tag' ? 'suspendTag' : 'soc') : '',
        activeReqTab + (options.strictQueueVisibility === true ? '|strict-queue|' + getSuspendEvalUserFilter() + '|' + (getManagerAssignedColumnState().dataEpoch || 0) : '|legacy-scope'),
        requestScopeMode,
        hasGlobalRequestAccess ? '1' : '0',
        assignedItemcodes ? getManagerAssignedColumnState().dataEpoch || 0 : '',
        safeRole,
        currentUser,
        currentUserDisplay
    ].join('|');
}
