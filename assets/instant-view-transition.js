function afterNavigationPaint(viewId, sequence, render) {
    const owner = bloomscapesStaticBodyScope();
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (isCurrentNavigationTransition(sequence, viewId) && owner === bloomscapesStaticBodyScope()
                && canAccessView(viewId)) render();
        }, 0);
    });
}

function attachTrackedScrollRestore(options, viewId, renderKey) {
    const {afterRender, restoreScrollTopAfterRender: saved, resetScrollTopAfterRender: reset} = options;
    const key = String(options.scrollResetKey || renderKey || viewId || 'tracked').trim() || viewId || 'tracked';
    const top = saved != null && Number.isFinite(Number(saved)) ? Math.max(0, Number(saved)) : null;
    delete options.resetScrollTopAfterRender;
    delete options.restoreScrollTopAfterRender;
    delete options.scrollResetKey;
    if (typeof afterRender !== 'function' && top === null && !reset) return;
    const callbacks = typeof afterRender === 'function' ? [afterRender] : [];
    if (top !== null) callbacks.push(() => schedulePostRenderMainAreaScrollRestore(viewId,key,top));
    else if (reset) callbacks.push(() => schedulePostRenderMainAreaTopReset(viewId,key));
    options.afterRender = () => callbacks.forEach(runTrackedNavigationCallback);
}

function runTrackedNavigationCallback(callback) {
    try { callback(); }
    catch { globalThis.reportHandledRuntimeIssue?.('runDirectTrackedNavigation','HANDLED_OPERATION_FAILURE'); }
}

function setDriveTab(tab) {
    closeDriveQuickFiltersModal();
    lastViewSwitchAt = Date.now();
    cancelDriveSearchRenderWork();
    const requestedTab = String(tab || '').trim();
    const nextTab = ['name', 'loc', 'card', 'hold', 'reports-v2'].includes(requestedTab) ? requestedTab : 'card';
    const preserveNameDrillSelection = shouldPreserveDriveNameDrillSelectionForCard(nextTab);
    return runDirectTrackedNavigation('drive', `drive-tab:${nextTab}`, () => {
        const previousTab = activeDriveTab;
        applyDriveTabColumnFilterScope(previousTab, nextTab);
        activeDriveTab = nextTab;
        const mobileMode = document.getElementById('drive-mobile-mode');
        if (mobileMode) mobileMode.value = nextTab;
        if (nextTab === 'hold' && previousTab !== 'hold') activeDriveHoldStopReport = 'hold-stop';
        driveQuickRequestCardMode = nextTab === 'card';
        driveViewDropdownOpen = false;
        driveSeasonDropdownOpen = false;
        driveGenusFilterOpen = false;
        driveContSizeFilterOpen = false;
        driveLocationFilterOpen = false;
        driveLotFilterOpen = false;
        driveColumnFilterDropdownOpen = false;
        driveQuickHoldStopOnly = false;
        if (!preserveNameDrillSelection) resetDriveDrillSelectionState();
        else {
            selectedDriveBlock = null;
            selectedDriveLoc = null;
        }
        setDriveSearchManualSelectionLock((nextTab === 'name' || nextTab === 'loc') && hasActiveDriveSearchTerm());
        syncDriveTabPills();
    }, {
        afterFirstPaint: true,
        preferImmediate: true,
        allowSameFrameRender: true,
        forceRender: true,
        resetScrollTopAfterRender: true,
        scrollResetKey: `drive-tab:${nextTab}`,
        touchDelayMs: 8,
        interactionDelayMs: 8,
        scrollDelayMs: 40
    });
}


function mountDriveLocationWindow(container, entries, modeKey, renderEntry) {
    const key = modeKey + ':' + selectedDriveBlock;
    const code = row => row.location;
    if (!window.GncCardWindow) {
        setContainerHtml(container, LocationCode.cards(key,entries,code,renderEntry));
        return;
    }
    const signature = buildDriveRenderKey(key,'',entries);
    LocationCode.windowCards(key,entries,code,renderEntry,(rows,renderRow,prefixHtml,selected) => {
        renderInventoryCardWindow(container,rows,renderRow,{
            view:'drive',signature:signature+'|'+selected,estimatedHeight:96,prefixHtml
        });
    });
}

function openQuickAccessTab(nested) {
    if (nested.parent === 'managers' && nested.tab) return setHomeTab(nested.tab);
    if (nested.parent === 'request' && nested.tab) return setReqTab(nested.tab);
    if (nested.parent === 'sales-office' && nested.tab) return setSalesOfficeTab(nested.tab);
    if (nested.archiveTab) document.querySelector(`[data-archive-tab="${nested.archiveTab}"]`)?.click();
}

function navigateQuickAccessView(view = '') {
    if (!canAccessQuickAccessView(view)) { showToast('Access unavailable','You do not have permission to open this view.',true); return false; }
    const safeView = String(view || '').trim();
    if (safeView === 'bloom') return toggleCartPanel();
    if (safeView.startsWith('production:')) return openProductionWorkflow(safeView.split(':')[1]);
    const nested = QUICK_ACCESS_NESTED_ROUTES[safeView];
    if (!nested) return switchView(safeView);
    const navigationGeneration = ++quickAccessNavigationGeneration;
    const originView = getCurrentVisibleViewId();
    const identity = getSupabaseReadIdentityScope();
    switchView(nested.parent, { quickAccessRoute: safeView, quickAccessOrigin: originView, quickAccessTab: nested.tab || nested.archiveTab || '' });
    const historicalOwner = nested.archiveTab ? getHistoricalRequestsOwnerKey() : '';
    if (!nested.archiveTab || nested.parent !== 'historical-requests') {
        afterNavigationPaint(nested.parent, navTransitionSeq, () => {
            if (navigationGeneration === quickAccessNavigationGeneration && canAccessQuickAccessView(safeView)) openQuickAccessTab(nested);
        });
        return false;
    }
    void (async () => {
        try { await ensureHistoricalRequestsIsland(); } catch { return; }
        const host = document.getElementById('historical-requests-content');
        if (!host) return;
        const isCurrentOwner = () => navigationGeneration === quickAccessNavigationGeneration
            && getCurrentVisibleViewId() === nested.parent && isViewVisible(nested.parent)
            && identity === getSupabaseReadIdentityScope() && historicalOwner === getHistoricalRequestsOwnerKey()
            && canAccessQuickAccessView(safeView);
        const tabSelector = `[data-archive-tab="${nested.archiveTab}"]`;
        let observer = null;
        let timeout = null;
        const cleanup = () => {
            if (observer) observer.disconnect();
            observer = null;
            if (timeout != null) clearTimeout(timeout);
            timeout = null;
        };
        const selectWhenReady = () => {
            if (!isCurrentOwner()) { cleanup(); return true; }
            const button = host.querySelector(tabSelector);
            if (!button) return false;
            cleanup();
            button.click();
            return true;
        };
        if (selectWhenReady()) return;
        if (typeof MutationObserver !== 'function') return;
        observer = new MutationObserver(selectWhenReady);
        observer.observe(host, { childList: true, subtree: true });
        if (selectWhenReady()) return;
        timeout = setTimeout(cleanup, 5000);
    })();
    return false;
}

function renderDriveDrillEntries(container, crumb, crumbText, entries, modeKey, renderEntry, options = {}) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (container && container.dataset) {
        delete container.dataset.driveDetailedRecords;
        container.dataset.driveDisplay = isDriveSpreadsheetGridMode() ? 'grid' : 'cards';
    }
    if(modeKey==='drive:loc:blocknumbers' && !isDriveSpreadsheetGridMode()) {
        syncDriveCrumb(crumb,crumbText);
        mountDriveLocationWindow(container,safeEntries,modeKey,renderEntry);
        return;
    }
    const emptyMessage = String(options.emptyMessage || 'No matching Drive rows.');
    if (!safeEntries.length) {
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">${emptyMessage}</div>`, `${modeKey}:empty`);
        if (modeKey === 'drive:name:list') { container.dataset.driveCommonnameState = 'complete'; container.dataset.driveCommonnameCount = '0'; }
        return;
    }
    const renderKey = buildDriveRenderKey(modeKey, crumbText, safeEntries);
    if (modeKey === 'drive:name:list' && !isDriveSpreadsheetGridMode()) {
        renderDriveCompleteCommonNames(container, crumb, crumbText, safeEntries, renderEntry, renderKey);
        return;
    }
    if (isDriveSpreadsheetGridMode()) {
        applyDriveRenderMarkup(container, crumb, crumbText, buildDriveGroupSpreadsheetTableHtml(safeEntries, modeKey), `${renderKey}::spreadsheet-v2`);
        if (modeKey === 'drive:name:list') { container.dataset.driveCommonnameState = 'complete'; container.dataset.driveCommonnameCount = String(safeEntries.length); }
        return;
    }
    if (renderInventoryCardWindow(container,safeEntries,renderEntry,{
        view:'drive',signature:renderKey,estimatedHeight:Number(options.approxCardHeight)||96
    })) { if(getCurrentVisibleViewId()==='drive'){syncDriveCrumb(crumb,crumbText);container.dataset.driveRenderKey=renderKey;}return; }
    if (shouldUseChunkedCardRender(safeEntries.length, options.threshold || 110, options.chunkThreshold || 190)) {
        syncDriveCrumb(crumb, crumbText);
        if (container.dataset && container.dataset.driveRenderKey === renderKey) return;
        if (container.dataset) container.dataset.driveRenderKey = renderKey;
        renderMarkupChunkedByKey(modeKey, container, crumb, safeEntries, crumbText, renderEntry, {
            approxCardHeight: options.approxCardHeight || 96
        });
        return;
    }
    const html = safeEntries.map((entry) => renderEntry(entry)).join('');
    applyDriveRenderMarkup(container, crumb, crumbText, html, renderKey);
}


function renderDriveCommonNameGroupCard(group) {
    return `<div class="drive-card bg-white border border-green-200 rounded-xl shadow-sm mb-3 p-4 flex items-center justify-between gap-3 cursor-pointer active:scale-95 transition-transform" ${buildFastInvokeAttrs('selectDriveName', [group.name], `Open ${normalizeEscapedDisplayText(group.name)}`)}><div class="min-w-0"><div class="text-lg font-black text-[#007a4d] leading-tight truncate">${esc(normalizeEscapedDisplayText(group.name))}</div><div class="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">${group.rowCount} Rows &bull; ${group.sizeCount} Sizes</div></div><i class="ph-bold ph-caret-right text-lg text-emerald-500"></i></div>`;
}
