/** @param {Array} items Current inventory or queue rows. @param {object|null} preparedState Previously computed AV filter state. @returns {object} The prepared AV filter state for the visible inventory. */
function renderAvTopControls(items = [], preparedState = null) {
    const container = document.getElementById('av-top-filters');
    if (!container) return preparedState || buildAvSharedFilterState(items);
    ensureAvControlsVisible(container);
    avFilterItemsCache = Array.isArray(items) ? items : [];
    const state = preparedState ? {...preparedState} : buildAvSharedFilterState(avFilterItemsCache);
    const filterState = resolveAvRailState(container, state);
    const { photoSummary, columnSummary, showSalesRepFilter, showRepCustomerFilter, salesRepSummary, repCustomerSummary } = filterState;
    const didMountShell = ensureAvTopControlsShell(container);
    syncAvValidPhotosButton(container);
    syncAvToolbarKioskButton(container.querySelector('#av-kiosk-toggle'));
    if (didMountShell) mountInventoryExcelFilters('av');
    ensureAvControlsVisible(container);
    const chips = document.getElementById('av-filter-chips');
    if (chips) {
        const active = [
            getAvPhotoMode() !== 'all' && photoSummary,
            showSalesRepFilter && selectedAvSalesRepName && salesRepSummary,
            showRepCustomerFilter && selectedAvRepCustomerKey && repCustomerSummary,
            getAvColumnFilterActiveCount() && columnSummary,
            avContSizeSelectionMode !== 'all' && getAvContSizeSummaryLabel(state.sizeOptions),
            avHoldFilterMode !== 'all' && getAvHoldFilterSummary(),
            avGenusSelectionMode !== 'all' && getAvGenusSummaryLabel(state.genusOptions),
            getAvSearchBoxValue()
        ].filter(Boolean);
        setContainerHtmlWithSignature(chips, active.map(value => '<span>' + escapeHtml(value) + '</span>').join(''), JSON.stringify(active));
    }
    const renderSignature = buildAvTopControlsSignature(state);
    const openDropdownActive = isAnyAvTopControlDropdownOpen();
    const openPanelNeedsBody = hasOpenAvTopControlPanelWithoutBody(container);
    if (!didMountShell && !openDropdownActive && !openPanelNeedsBody && renderSignature === lastAvTopControlsRenderSignature) {
        ensureAvControlsVisible(container);
        renderAvColumnFilterWindow(state);
        return state;
    }
    syncAvViewFilterPanels(container,filterState.sourceSummary);
    lastAvTopControlsRenderSignature = renderSignature;
    ensureAvControlsVisible(container);
    renderAvColumnFilterWindow(state);
    scheduleStickyRailOffsetSync('av-filter-strip', true);
    return state;
}


function isAnyAvTopControlDropdownOpen() {
    return !!(avSourceDropdownOpen || avSeasonDropdownOpen || avGenusFilterOpen || avContSizeFilterOpen
        || avHoldDropdownOpen || avPhotoDropdownOpen || avSalesRepDropdownOpen || avRepCustomerDropdownOpen
        || avColumnFilterDropdownOpen);
}

function hasOpenAvTopControlPanelWithoutBody(container) {
    return Array.from(container.querySelectorAll('[data-av-filter-shell]')).some(shell => {
        const panel = shell.querySelector('[data-role="panel"]');
        if (!panel || panel.classList.contains('hidden')) return false;
        return !shell.querySelector('[data-role="body"]')?.innerHTML.trim();
    });
}

function resolveAvRailState(container, state) {
    const sourceSummary = getAvSalesBucketLabel();
    const photoSummary = getAvPhotoSummaryLabel();
    const columnSummary = getAvColumnFilterSummaryLabel();
    const showSalesRepFilter = canUseAvSalesRepFilter();
    const showRepCustomerFilter = shouldShowRepAvCustomerFilter();
    const needsSalesRepOptions = showSalesRepFilter && (avSalesRepDropdownOpen || !!selectedAvSalesRepName);
    const needsRepCustomerOptions = showRepCustomerFilter && (avRepCustomerDropdownOpen || !!selectedAvRepCustomerKey);
    const salesRepOptions = needsSalesRepOptions ? getAvSalesRepOptions() : [];
    const salesRepSummary = showSalesRepFilter
        ? (needsSalesRepOptions ? getAvSalesRepSummaryLabel(salesRepOptions) : 'All Reps')
        : '';
    const repCustomerOptions = needsRepCustomerOptions ? getAvRepCustomerOptions() : [];
    const repCustomerSummary = showRepCustomerFilter
        ? (needsRepCustomerOptions ? getAvRepCustomerSummaryLabel(repCustomerOptions) : 'All Customers')
        : '';
    const visibleFilterCount = 6 + (showSalesRepFilter ? 1 : 0) + (showRepCustomerFilter ? 1 : 0);
    state.detailFiltersCollapsed = false;
    container.classList.toggle('av-top-has-salesrep', showSalesRepFilter);
    container.classList.toggle('av-top-has-customer', showRepCustomerFilter);
    [3, 4, 5, 6, 7, 8].forEach((count) => container.classList.toggle(`av-top-filter-count-${count}`, visibleFilterCount === count));
    const salesRepSearchToken = normalizeRepMatchToken(avSalesRepSearchTerm || '');
    const filteredSalesRepOptions = avSalesRepDropdownOpen && salesRepSearchToken
        ? salesRepOptions.filter((option) => doesProgressiveSearchTextMatch(option.searchToken, salesRepSearchToken))
        : (avSalesRepDropdownOpen ? salesRepOptions : []);
    const repCustomerSearchToken = normalizeRepMatchToken(avRepCustomerSearchTerm || '');
    const filteredRepCustomerOptions = avRepCustomerDropdownOpen && repCustomerSearchToken
        ? repCustomerOptions.filter((option) => doesProgressiveSearchTextMatch(option.searchToken, repCustomerSearchToken))
        : (avRepCustomerDropdownOpen ? repCustomerOptions : []);
    state.salesRepCount = salesRepOptions.length;
    state.filteredSalesRepCount = filteredSalesRepOptions.length;
    state.repCustomerCount = repCustomerOptions.length;
    state.filteredRepCustomerCount = filteredRepCustomerOptions.length;
    return {sourceSummary,photoSummary,columnSummary,showSalesRepFilter,showRepCustomerFilter,salesRepSummary,repCustomerSummary};
}

function syncAvViewFilterPanels(container,sourceSummary) {
    const controlButtonClass = (isActive = false) => `task-top-control-button inline-flex w-full items-center gap-2 rounded-full border px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.11em] sm:px-3.5 sm:text-[10px] ${isActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white border-emerald-200 text-emerald-700 shadow-sm'}`;
    const sourceChoices = getAvViewChoices();
    const sourceOptionsHtml = buildAvSingleChoiceOptionsHtml(sourceChoices, getAvViewModeKey(), 'setAvSourceFilter');
    syncAvTopControlShell(container, 'source', {
        buttonClass: controlButtonClass(avSourceDropdownOpen),
        summary: sourceSummary,
        open: avSourceDropdownOpen,
        bodyHtml: avSourceDropdownOpen ? `${buildAvFilterOptionsScrollHtml(sourceOptionsHtml)}${buildAvFilterDoneFooterHtml('closeAvSourceDropdown')}` : '',
        bodySignature: `av-source:${getAvViewModeKey()}:${sourceChoices.map((option) => option.value).join('|')}:${avSourceDropdownOpen ? 'open' : 'closed'}`
    });
    syncAvTopControlShell(container,'season');
}

/** @param {string} mode Requested photo filter. @returns {boolean} The selection handler result. */
function setAvPhotoMode(mode = 'all') {
    beginDirectNavigationActivity();
    const nextMode = ['valid_photos','photos','no_photos'].includes(mode) ? mode : 'all';
    activeAvPhotoMode = nextMode;
    if (nextMode === 'valid_photos') { activeAVTab = 'open'; activeAvSalesBucket = 'current'; }
    if (activeAVTab === 'reserves') activeAvReserveMode = nextMode;
    else activeAvOpenTab = nextMode === 'photos' ? 'photos' : 'name';
    avPhotoDropdownOpen = false;
    avSeasonDropdownOpen = false;
    syncAvSecondaryTabs();
    avOpenLevel = 0;
    selectedAvOpenName = null;
    selectedAvOpenSize = null;
    selectedAvOpenSeason = null;
    selectedAvOpenLot = null;
    selectedAvReserveDetailCustomerKey = null;
    avResolvedBaseStateKey = '';
    avResolvedBaseStateCache = null;
    const current = getCurrentAVBaseItems();
    renderAvTopControls(current.filterBaseItems || [],current.avFilterState);
    updateAVExportButton(current.isPartial ? 0 : getAVVisibleExportCount(current.items));
    if (nextMode === 'valid_photos') renderAV();
    else scheduleAVRender(0);
    return false;
}


/** @param {string} tab Selected AV tab. @returns {unknown} The navigation dispatcher result. */
function setAVTab(tab) {
    lastViewSwitchAt = Date.now();
    const nextTab = tab === 'reserves' ? 'reserves' : 'open';
    return runDirectTrackedNavigation('av', `av-tab:${nextTab}`, () => {
        activeAVTab=nextTab;
        activeAvSalesBucket = nextTab === 'reserves' ? 'customer' : 'current';
        avResLevel=0; selectedAvResRep=null; selectedAvResDriveUid=null; selectedAvResItemCode=null; selectedAvResName=null; selectedAvResSize=null; selectedAvResCustomerKey=null; activeAvReserveMode='all'; activeAvReserveDetailTab='customer'; selectedAvReserveDetailCustomerKey=null;
        avOpenLevel=0; selectedAvOpenName=null; selectedAvOpenSize=null; selectedAvOpenSeason=null; selectedAvOpenLot=null;
        closeAvTopControlDropdowns(false);
        avResolvedBaseStateKey = '';
        avResolvedBaseStateCache = null;
        document.getElementById('tab-av-open').classList.toggle('active',nextTab==='open'); document.getElementById('tab-av-reserves').classList.toggle('active',nextTab==='reserves');
        syncAvSecondaryTabs();
    }, { delay: 0, typingDelay: 32, forceRender: true, resetScrollTopAfterRender: true, scrollResetKey: `av-tab:${nextTab}`, touchDelayMs: 8, interactionDelayMs: 8, scrollDelayMs: 48 });
}

/** @param {HTMLElement} container Mounted controls. @returns {void} Restores the visible inline control container. */
function ensureAvControlsVisible(container) {
    if (!container) return;
    container.classList.add('av-top-inline');
    container.classList.remove('hidden');
    container.removeAttribute('aria-hidden');
    container.style.removeProperty('display');
    container.style.removeProperty('visibility');
    container.style.removeProperty('opacity');

    const controls = container.closest('.av-secondary-controls');
    if (controls) {
        controls.classList.remove('hidden');
        controls.removeAttribute('aria-hidden');
        controls.style.removeProperty('display');
        controls.style.removeProperty('visibility');
        controls.style.removeProperty('opacity');
    }

}

/** @returns {string} The selected photo mode label. */
function getAvPhotoSummaryLabel() {
    return AV_PHOTO_VIEW_OPTIONS.find(option => option.value === getAvPhotoMode())?.label || 'No Photo / Expired';
}

/** @param {object} state Current view state. @returns {object} Matching genus and size choices for the current filters. */
function buildDependentAvFilterOptions(state) {
    return {
        filteredGenusOptions: avGenusFilterOpen
            ? getAvDependentChoices(state.baseItems, 'genus', state.genusOptions, avGenusSearchTerm, getAvFilterGenusFacetValue)
            : state.genusOptions,
        filteredSizeOptions: avContSizeFilterOpen
            ? getAvDependentChoices(state.baseItems, 'contsize', state.sizeOptions, avContSizeSearchTerm, getAvFilterContSizeFacetValue)
            : state.sizeOptions
    };
}

function getAvDependentChoices(rows, except, options, query, getValue) {
    const term = getAvSearchBoxValue();
    const profile = isAvCustomerSalesBucket(activeAvSalesBucket) ? 'av_reserves' : 'av_open';
    const eligible = applyAvColumnFiltersToItems(rows).filter(createAvTopFilterPredicate({ except }));
    const searchable = term ? filterBySearch(eligible, term, profile) : eligible;
    const state = getInventoryExcelState('av');
    const skipSeason = getAvPhotoMode() === 'valid_photos' ? 'season' : '';
    const matching = searchable.filter(row => inventoryExcelRowMatches(row, state, skipSeason));
    const values = new Set(matching.map(getValue));
    return options.filter(option => values.has(option) && (!query || doesExcelFilterSearchMatchStart(option, query)));
}

/** @param {Array} source Dock rows before facet filtering. @returns {object} Positive rep and customer choices and their signature. */
function buildDependentDockFilterOptions(source) {
    const eligible = applyDockColumnFiltersToItems(source);
    const repOptions = buildDockFilterOptions(applyDockRepCustomerFiltersOnly(eligible, 'rep'), getDockRepFilterValue);
    const customerOptions = buildDockFilterOptions(applyDockRepCustomerFiltersOnly(eligible, 'customer'), getDockCustomerFilterValue);
    const availableReps = new Set(source.map(getDockRepFilterValue));
    const availableCustomers = new Set(source.map(getDockCustomerFilterValue));
    let optionHash = 2166136261;
    for (const options of [repOptions, customerOptions]) {
        optionHash = updateRenderSignatureHash(optionHash, options.length);
        for (const value of options) optionHash = updateRenderSignatureHash(optionHash, value);
    }
    optionHash = updateRenderSignatureHash(optionHash, buildDockColumnFilterStateKey());
    return { repOptions, customerOptions, availableReps, availableCustomers, optionHash };
}
