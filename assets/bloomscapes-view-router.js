function renderViewContent(viewId, forceReset = false, forceRender = false, syncHeader = false) {
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
        if (changedView && ['messages','push-to-talk'].includes(viewId)) renderBloomscapesMessagesView(viewId);
        renderBloomscapesDispatchWorkspaces(viewId);
        mountBloomscapesFieldBorrowing(viewId);
        mountBloomscapesInventoryBrowse(viewId);
        syncGlobalHeaderChrome({reason:syncHeader ? 'view-switch:'+viewId : 'view-content-ready',force:syncHeader});
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
    syncGlobalHeaderChrome({reason:syncHeader ? 'view-switch:'+viewId : 'view-content-ready',force:syncHeader});
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


function mountBloomscapesPrimaryView(viewId, previous) {
    const target = getViewElementById(viewId);
    if (!target) return null;
    for (const id of getPrimaryViewIds()) {
        const node = getViewElementById(id);
        if (node) node.classList.toggle('hidden', id !== viewId);
    }
    target.hidden = false;
    if (target.style.display === 'none') target.style.removeProperty('display');
    if (viewId !== previous) {
        releaseBloomscapesInactiveList(previous);
        observeBloomscapesFilterViewport(target);
        observeBloomscapesPhotoView(target);
    }
    return target;
}

function releaseBloomscapesInactiveList(viewId) {
    const dispatch = ['pull-tags','mistake-fix','traffic-office'].includes(viewId);
    const hosts = {drive:'drive-content',av:'av-content',docks:'docks-content',request:'request-content'};
    const root = dispatch ? getViewElementById(viewId) : document.getElementById(hosts[viewId] || '');
    if (!root?.firstChild || !nativeAuthSessionActive) return;
    if (viewId==='docks' && getContainerRenderSignature(root)) return;
    if (!dispatch && root.querySelector('form,textarea,input:not([type="checkbox"]):not([type="hidden"]),[contenteditable="true"]')) return;
    if (viewId==='request' && !['suspend-tag','pending'].includes(activeReqTab)) return;
    if (!dispatch && !isDatasetLoaded('master','full')) return;
    setContainerHtml(root,'');
    markViewDirty(viewId);
}

function observeBloomscapesFilterViewport(root) {
    const observer = mobileExcelFilterViewportObserver;
    if (!observer?.observe || !root) return;
    observer.disconnect();
    observer.observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
    observer.observe(document.body, {attributes:true, attributeFilter:['class']});
}

function decorateBloomscapesAddedImages(records) {
    for (const record of records) {
        for (const node of record.addedNodes) {
            if (node.nodeType===1 && !node.closest('[data-manager-assigned-desktop-table],[data-manager-assigned-mobile-list]')) ensurePhotoTakenDateBadges(node);
        }
    }
}

function observeBloomscapesPhotoView(root) {
    if (!root || typeof MutationObserver !== 'function') return;
    bloomscapesPhotoViewObserver?.disconnect();
    bloomscapesPhotoViewObserver ||= new MutationObserver(decorateBloomscapesAddedImages);
    bloomscapesPhotoViewObserver.observe(root, {childList:true, subtree:true});
    ensurePhotoTakenDateBadges(root);
}

function initializePhotoTakenDateBadgeObserver() {
    observeBloomscapesPhotoView(document.getElementById('view-'+(document.body?.dataset.currentView || 'home')));
    document.addEventListener('load',event=>{
        const image=event.target;
        if (image?.tagName==='IMG' && !image.closest('#view-wrapper')) ensurePhotoTakenDateBadges(image);
    },true);
}

var bloomscapesPhotoViewObserver;

function initializeMobileExcelFilterViewportSafety() {
    if (mobileExcelFilterViewportObserver) return;
    const isFilterInteractionTarget = (target = null) => !!(target && target.closest && target.closest('.excel-filter-panel, .task-top-control-shell, .drive-filter-shell, .av-filter-shell'));
    const schedule = (reason = 'filter-viewport') => scheduleMobileExcelFilterViewportSync(reason);
    const scheduleForEvent = (reason = 'filter-event', event = null) => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) return schedule(reason);
        if (event && isFilterInteractionTarget(event.target)) return schedule(reason);
        return false;
    };
    if (typeof MutationObserver !== 'undefined') {
        mobileExcelFilterViewportObserver = new MutationObserver((records) => {
            if (isMobileExcelFilterMutationRelevant(records)) schedule('mutation');
        });
        observeBloomscapesFilterViewport(document.getElementById('view-'+(document.body?.dataset.currentView || 'home')));
    } else {
        mobileExcelFilterViewportObserver = { legacy: true };
    }
    window.addEventListener('resize', () => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) schedule('window-resize');
    }, { passive: true });
    window.addEventListener('orientationchange', () => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) schedule('orientation');
    }, { passive: true });
    document.addEventListener('scroll', () => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) schedule('scroll');
    }, true);
    document.addEventListener('focusin', (event) => {
        if (event && event.target && isMobileFilterEntryTarget(event.target)) schedule('filter-focus');
    }, true);
    document.addEventListener('pointerdown', (event) => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) setTimeout(() => scheduleForEvent('pointerdown', event), 0);
        else scheduleForEvent('pointerdown', event);
    }, true);
    document.addEventListener('click', (event) => {
        if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) setTimeout(() => scheduleForEvent('click', event), 0);
        else scheduleForEvent('click', event);
    }, true);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) schedule('visual-resize');
        }, { passive: true });
        window.visualViewport.addEventListener('scroll', () => {
            if (document.body && document.body.classList.contains('mobile-excel-filter-panel-open')) schedule('visual-scroll');
        }, { passive: true });
    }
}

function getPrimaryViewIds() {
    return ['home', ...TRACKED_VIEW_IDS, 'detail'];
}
