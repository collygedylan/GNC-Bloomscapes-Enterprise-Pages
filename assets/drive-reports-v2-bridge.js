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

function renderDriveReport2Cards(container, rows, revision, filters) {
    const sorted = driveHasSeasonCardSort(filters) ? sortDriveSeasonCards(rows) : rows;
    if (!rows.length) {
        setContainerHtml(container, '<p>No matching cards</p>');
        return;
    }
    const signature = buildDriveRenderKey(`drive:reports-v2:${revision}`, '', sorted);
    const renderCard = row => generateCard(row, 'drive', getDriveCardStatusClass(row, 'status-green'));
    if (renderInventoryCardWindow(container, sorted, renderCard, { view: 'drive', signature, estimatedHeight: 310 })) return;
    renderMarkupChunkedByKey('drive-reports-v2-cards', container, null, sorted, '', renderCard, { approxCardHeight: 310 });
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
        cancelChunkRenderWorkForContainer(container, 'drive-report-v2');
        delete container.dataset.driveDetailedRecords;
        delete container.dataset.driveDisplay;
        delete container.dataset.driveRenderKey;
    }
    syncDriveCrumb(crumb, '');
    mountDriveReport2(container, {
        owner: getSupabaseReadIdentityScope(), farm: getBloomscapesFarm(), authenticated: nativeAuthSessionActive,
        rows: state.visibleItems, sourceKey: state.resolvedStateKey,
        fields: driveReport2Fields(DRIVE_COLUMN_FILTER_ALLOWED_HEADERS),
        projectRow: projectDriveReport2Row, openRow: openDriveReport2Row, renderCards: renderDriveReport2Cards
    });
}

function renderDriveRecordResults(tokenKey, container, crumb, rows, crumbText, renderKey = '', options = {}) {
    const input = Array.isArray(rows) ? rows : [];
    const safeRows = tokenKey === 'drive-loc-card' && driveHasSeasonCardSort() ? sortDriveSeasonCards(input) : input;
    const nextOptions = options && typeof options === 'object' ? options : {};
    const browsePage = getClientBrowsePage('drive', renderKey || `${tokenKey}:${crumbText}`, safeRows);
    const useSpreadsheet = isDriveSpreadsheetGridMode();
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
    const report = container?.querySelector('#drive-custom-reports-v2');
    if (!report) return;
    closeInventoryExcelPopover('drive-custom-reports-v2');
    window.GncCardWindow?.destroy(report.querySelector('.drive-custom-reports-v2-cards'));
}

function renderDrive() {
    ensureDriveToolbarControls();
    if (ensureViewDataForRender('drive')) return;
    if (activeDriveTab === 'season-sales-notes') activeDriveTab = 'card';
    syncDriveModeTabs();
    syncDriveTabPills();
    const container = document.getElementById('drive-content');
    const filtersDiv = document.getElementById('drive-season-filters');
    const crumb = document.getElementById('drive-crumb');
    const driveModeLabel = DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode';
    const drillTabs = document.getElementById('drive-drill-tabs');
    if (drillTabs) drillTabs.classList.remove('hidden');
    if (activeDriveTab === 'reports-v2' && activeDriveMode === 'ok') return renderDriveReport2Tab(container, crumb);
    releaseDriveReport2Ui(container);
    if (renderDriveUniversalSearchResultsOnly()) return;
    if (activeDriveMode !== 'ok') {
        syncDriveFilterStrip(filtersDiv, '');
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
    const { finalItems, crumbText, renderKey } = buildDriveResolvedCardState(driveModeLabel, driveViewState);
    renderDriveQuickRequestBar(finalItems);
    if (finalItems.length === 0) {
        const emptyMessage = hasActiveDriveQuickFilters()
            ? 'No rows match the current Drive filters.'
            : 'No items found matching the current search.';
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">${emptyMessage}</div>`, 'drive:cards:empty');
        syncControls();
        return;
    }
    renderDriveRecordResults('drive-main-card', container, crumb, finalItems, crumbText, renderKey, {
        approxCardHeight: 310
    });
    syncControls();
}
