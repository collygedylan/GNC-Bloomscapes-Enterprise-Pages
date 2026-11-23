
const driveReport2MetricReaders = {
    PTRONHAND: row => getCardPtrOnHandValue(row, { preserveUnknown: true }),
    PTRAVAILABLE: row => getCardPtrAvailableValue(row, { preserveUnknown: true }),
    PTRREVIEWED: row => getCardPtrReviewedValue(row, { preserveUnknown: true }),
    OPENSTOCK: row => getCardOpenStockValue(row, { preserveUnknown: true }),
    LOC_MATCH_QTY: row => getDisplayLocMatchQtyValue(row, 'drive')
};

function projectDriveReport2Row(row) {
    let canonical;
    return { row, value: key => {
        if (key === 'SALEYEAR') return driveReport2Value(driveCardSalesYear(row));
        if (key === 'PRIORITY') return driveReport2Value(driveCardPriority(row));
        const readMetric = driveReport2MetricReaders[key];
        if (readMetric) return driveReport2Value(readMetric(canonical ||= resolveCanonicalInventoryRow(row) || row));
        return driveReport2Value(getDriveColumnItemValue(row, key));
    } };
}

function openDriveReport2Row(row) {
    const uid = row.UNIQUE_ID ?? row.unique_id;
    if (!uid) return;
    openDetail(uid, 'drive', { sourceDomId: row.DOM_ID ?? row.dom_id });
}

function getDriveSearchProfile() {
    if (driveReport2BrowseTab(activeDriveTab) && getActiveDriveReport2()) return 'drive_card';
    if (activeDriveTab === 'name') return 'drive_name';
    if (activeDriveTab === 'loc') return 'drive_loc';
    return 'drive_card';
}

function driveReport2Context() {
    return {
        owner: getSupabaseReadIdentityScope(), farm: getBloomscapesFarm(), authenticated: nativeAuthSessionActive,
        fields: driveReport2Fields(DRIVE_COLUMN_FILTER_ALLOWED_HEADERS), openRow: openDriveReport2Row
    };
}

function driveReport2Source(viewState) {
    return { rows: viewState.visibleItems, sourceKey: viewState.resolvedStateKey, projectRow: projectDriveReport2Row };
}

function renderDriveReport2Tab(container, crumb) {
    const mode = document.getElementById('drive-mobile-mode');
    if (mode) mode.value = 'reports-v2';
    hideDrivePlantFilters();
    renderDriveQuickRequestBar([]);
    const state = buildDriveVisibleItemsState();
    scheduleDriveTopControlsRender(state.baseSearchFilteredItems, state.drivePlantFilterState);
    if (!container) return;
    if (!container.querySelector('#drive-custom-reports-v2')) {
        resetDriveReportContent(container);
    }
    syncDriveCrumb(crumb, '');
    mountDriveReport2(container, { ...driveReport2Context(), ...driveReport2Source(state) });
}

function renderDriveRecordResults(tokenKey, container, crumb, rows, crumbText, renderKey = '', options = {}) {
    const input = Array.isArray(rows) ? rows : [];
    const safeRows = tokenKey === 'drive-loc-card' ? sortDriveLocationCards(input) : input;
    const nextOptions = options && typeof options === 'object' ? options : {};
    const browsePage = getClientBrowsePage('drive', renderKey || `${tokenKey}:${crumbText}`, safeRows);
    const useSpreadsheet = !nextOptions.reportCards && isDriveSpreadsheetGridMode();
    const continuous = tokenKey === 'drive-main-card' && !useSpreadsheet && !!window.GncCardWindow;
    const renderedRows = continuous ? safeRows : browsePage.rows;
    const pageFooter = continuous ? '' : renderClientBrowsePageFooter('drive', browsePage.key, safeRows.length, browsePage);
    const prefixHtml = String(nextOptions.prefixHtml || '');
    if (container && container.dataset) {
        container.dataset.driveDetailedRecords = 'true';
        container.dataset.driveDisplay = useSpreadsheet ? 'grid' : 'cards';
    }
    const evidenceKey = continuous ? getCanonicalInventoryRevision() : buildDriveRenderKey('drive:visible-card-evidence','',renderedRows);
    const displayRenderKey = `${String(renderKey || tokenKey)}::page:${browsePage.pageIndex}::${useSpreadsheet ? 'spreadsheet-v2' : 'cards-v1'}::${evidenceKey}`;
    if (useSpreadsheet) {
        cancelChunkRenderWorkForContainer(container, String(tokenKey || 'drive-grid'));
        applyDriveRenderMarkup(container, crumb, crumbText, `${prefixHtml}${buildDriveSpreadsheetTableHtml(renderedRows)}${pageFooter}`, displayRenderKey);
        return true;
    }
    const renderRow = typeof nextOptions.renderRow === 'function'
        ? nextOptions.renderRow
        : ((item) => generateCard(item, 'drive', getDriveCardStatusClass(item, nextOptions.fallbackStatusClass || 'status-green')));
    if (renderInventoryCardWindow(container, renderedRows, renderRow, {
        view:'drive', signature:displayRenderKey, estimatedHeight:Number(nextOptions.approxCardHeight)||310,
        prefixHtml, footerHtml:pageFooter, progressive:continuous
    })) { if(getCurrentVisibleViewId()==='drive'){syncDriveCrumb(crumb,crumbText);container.dataset.driveRenderKey=displayRenderKey;}return true; }
    if (shouldUseChunkedCardRender(renderedRows.length, 90, 170)) {
        syncDriveCrumb(crumb, crumbText);
        if (container.dataset && container.dataset.driveRenderKey === displayRenderKey) return true;
        if (container.dataset) container.dataset.driveRenderKey = displayRenderKey;
        renderMarkupChunkedByKey(tokenKey, container, crumb, renderedRows, crumbText, renderRow, {
            approxCardHeight: Number(nextOptions.approxCardHeight) || 310,
            prefixHtml,
            onComplete: () => { if (pageFooter && container.dataset.driveRenderKey === displayRenderKey) container.insertAdjacentHTML('beforeend', pageFooter); }
        });
        return true;
    }
    applyDriveRenderMarkup(container, crumb, crumbText, `${prefixHtml}${renderedRows.map((item) => renderRow(item)).join('')}${pageFooter}`, displayRenderKey);
    return true;
}

function syncDriveNameCatalogCompleteness(container) {
    const complete = !canUseProductionLiveSync() || getDatasetState('master').rowCompleteness === 'complete'
        || productionDisplayMasterReceipt?.rows === fullInventory;
    if (complete) container.setAttribute('data-complete-name-catalog', 'true');
    else container.removeAttribute('data-complete-name-catalog');
}

function releaseDriveReport2Ui(container) {
    const grid = container?.querySelector('.drive-custom-reports-v2-grid');
    if (!grid) return;
    const state = activeDriveReport2State;
    if (state?.root?.contains(grid)) state.gridScrollTop = grid.scrollTop;
    closeInventoryExcelPopover('drive-custom-reports-v2');
}

function renderDriveReport2Browse(container, crumb, driveModeLabel) {
    if (!canUseDriveCustomReports()) {
        hideDriveReport2BrowseBar();
        return false;
    }
    const context = driveReport2Context();
    const state = getDriveReport2State(context);
    if (activeDriveTab !== 'card') scheduleDriveReport2Saved(state,context.authenticated);
    if (!state.scoped) {
        syncDriveReport2BrowseBar(crumb, state, null, activeDriveTab);
        return false;
    }
    const viewState = buildDriveVisibleItemsState(false);
    syncDriveReport2Rows(state, driveReport2Source(viewState));
    const rows = getDriveReport2PhysicalRows(state);
    if (driveViewLevel) reconcileDriveDrillSelectionWithVisibleItems(rows);
    const scopedView = { visibleItems: rows, reportCards: true, reportSort: state.layout.sorting.length > 0 };
    syncDriveReport2BrowseBar(crumb, state, rows, activeDriveTab);
    hideDrivePlantFilters();
    renderDriveQuickRequestBar(activeDriveTab === 'card' ? rows : []);
    if (activeDriveTab === 'name') {
        syncDriveNameCatalogCompleteness(container);
        renderDriveCommonNameDrill(container, crumb, driveModeLabel, scopedView);
    } else if (activeDriveTab === 'loc') {
        renderDriveLocationDrill(container, crumb, driveModeLabel, scopedView);
    } else if (!rows.length) {
        applyDriveRenderMarkup(container, crumb, driveModeLabel + ' > All Cards', '<p class="p-8">No rows match this report.</p>', 'drive:report:cards:empty');
    } else {
        const label = driveModeLabel + ' > All Cards (' + rows.length.toLocaleString() + ' items)';
        const renderKey = getDriveListSignature(rows, 'drive:report:cards', label);
        renderDriveRecordResults('drive-main-card', container, crumb, rows, label, renderKey, { reportCards: true });
    }
    scheduleDriveTopControlsRender(viewState.baseSearchFilteredItems, viewState.drivePlantFilterState);
    return true;
}

function renderDrive() {
    ensureDriveToolbarControls();
    if (ensureViewDataForRender('drive')) return;
    if (activeDriveTab === 'season-sales-notes') activeDriveTab = 'card';
    syncDriveModeTabs();
    syncDriveTabPills();
    const container = document.getElementById('drive-content');
    const crumb = document.getElementById('drive-crumb');
    const driveModeLabel = DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode';
    const drillTabs = document.getElementById('drive-drill-tabs');
    if (drillTabs) drillTabs.classList.remove('hidden');
    const evaluator = getDriveEvaluatorReportState();
    mountDriveSavedReports(getDriveReport2State(driveReport2Context()),evaluator);
    if (mountDriveEvaluatorReports(container,evaluator)) {
        hideDriveReport2BrowseBar();
        return;
    }
    if (!canUseDriveCustomReports() && !driveReport2BrowseTab(activeDriveTab)) return setDriveTab('name',{exitReport:true});
    if (activeDriveMode === 'ok' && driveReport2BrowseTab(activeDriveTab)) {
        releaseDriveReport2Ui(container);
        if (renderDriveReport2Browse(container, crumb, driveModeLabel)) return;
    } else {
        hideDriveReport2BrowseBar();
        if (activeDriveTab === 'reports-v2' && activeDriveMode === 'ok') return renderDriveReport2Tab(container, crumb);
        releaseDriveReport2Ui(container);
    }
    renderDriveOrdinaryTab(container,crumb,driveModeLabel);
}

function renderDriveOrdinaryTab(container,crumb,driveModeLabel) {
    if (renderDriveUniversalSearchResultsOnly()) return;
    if (activeDriveMode !== 'ok') {
        syncDriveFilterStrip(document.getElementById('drive-season-filters'), '');
        hideDrivePlantFilters();
        renderDriveQuickRequestBar([]);
        applyDriveRenderMarkup(container, crumb, driveModeLabel, `<div class="p-8 text-center text-gray-400">No ${driveModeLabel} rows have been added yet.</div>`, `drive:mode-empty:${activeDriveMode}`);
        return;
    }
    hideDrivePlantFilters();
    const driveViewState = buildDriveVisibleItemsState();
    const syncControls = () => scheduleDriveTopControlsRender(driveViewState.baseSearchFilteredItems, driveViewState.drivePlantFilterState);
    if (activeDriveTab === 'name') {
        renderDriveQuickRequestBar([]);
        syncDriveNameCatalogCompleteness(container);
        renderDriveCommonNameDrill(container, crumb, driveModeLabel, driveViewState);
        syncControls();
        return;
    }
    if (activeDriveTab === 'loc') {
        renderDriveQuickRequestBar([]);
        renderDriveLocationDrill(container, crumb, driveModeLabel, driveViewState);
        syncControls();
        return;
    }
    if (activeDriveTab === 'hold') {
        renderDriveQuickRequestBar([]);
        renderDriveHoldStopCodeView(container, crumb, driveModeLabel, driveViewState);
        syncControls();
        return;
    }
    renderStandardDriveCards(container, crumb, driveModeLabel, driveViewState);
    syncControls();
}

function getDriveCurrentReturnedRows() {
    const driveView = document.getElementById('view-drive');
    if (!driveView || driveView.classList.contains('hidden')) return [];
    const evaluatorRows = getDriveEvaluatorReportRows();
    if (evaluatorRows) return evaluatorRows;
    if (activeDriveMode !== 'ok' || activeDriveTab !== 'card') return [];
    const driveModeLabel = DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode';
    const driveViewState = buildDriveVisibleItemsState();
    const report = canUseDriveCustomReports() && getActiveDriveReport2();
    if (report) {
        syncDriveReport2Rows(report, driveReport2Source(driveViewState));
        return getDriveReport2PhysicalRows(report);
    }
    const resolvedState = buildDriveResolvedCardState(driveModeLabel, driveViewState);
    return Array.isArray(resolvedState.finalItems) ? resolvedState.finalItems.filter(Boolean) : [];
}

function renderStandardDriveCards(container, crumb, driveModeLabel, driveViewState) {
    const { finalItems, crumbText, renderKey } = buildDriveResolvedCardState(driveModeLabel, driveViewState);
    renderDriveQuickRequestBar(finalItems);
    if (finalItems.length === 0) {
        const emptyMessage = hasActiveDriveQuickFilters()
            ? 'No rows match the current Drive filters.'
            : 'No items found matching the current search.';
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">${emptyMessage}</div>`, 'drive:cards:empty');
        return;
    }
    renderDriveRecordResults('drive-main-card', container, crumb, finalItems, crumbText, renderKey, {
        approxCardHeight: 310
    });
}

function getDriveFilteredItems(includeQuickFilters = false) {
    const candidates = filterBloomscapesPreviewInventoryRows(getDriveBaseFilteredItems());
    const baseItems = typeof applyInventoryExcelFilters === 'function' ? applyInventoryExcelFilters('drive',candidates) : candidates;
    if (!includeQuickFilters) return baseItems;
    return applyDriveQuickFiltersToItems(baseItems, `base:${driveBaseFilterCacheKey}`);
}
