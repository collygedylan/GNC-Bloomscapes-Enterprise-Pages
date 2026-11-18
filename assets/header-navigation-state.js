const GLOBAL_HEADER_SEARCH_CONFIG = {
    communication:'communication-shared-search',
    'smart-moves':'smart-moves-shared-search', 'sales-office':'sales-office-shared-search',
    sales:'sales-shared-search', qc:'qc-shared-search', production:'production-shared-search',
    'sales-inventory':'sales-inventory-shared-search',
    av: 'av-search-container', 'hl-order':'hl-order-search-container',
    reserves: 'reserves-search-container',
    docks: 'docks-search-container',
    drive: 'drive-search-container',
    building: 'building-search-container',
    managers: 'managers-search-container',
    review: 'review-search-container',
    'move-up': 'move-up-search-container',
    request: 'request-search-container',
    tasks: 'tasks-search-container'
};

function getGlobalHeaderChromeState() {
    const backState = getGlobalBackState();
    const currentView = backState.currentView;
    mountBloomscapesViewSearch(currentView);
    ensureGlobalHeaderSearchPlaceholders();
    const baseMeta = AMAZON_HEADER_META[currentView] || { title: formatGlobalHeaderTitle(currentView) };
    const meta = currentView === 'moves' && activeMovesTab === 'office'
        ? { eyebrow: 'Location Move', title: 'Inventory Office' }
        : baseMeta;
    const moduleTitle = bloomscapesDepartmentTitle(currentView)
        || (currentView === 'managers' ? bloomscapesWorkflowTab(activeHomeTab)?.label : '');
    const resolvedTitle = moduleTitle || meta.title || formatGlobalHeaderTitle(currentView);
    const showHomeBack = currentView === 'home' && backState.showBack;
    const searchContainerId = currentView === 'tasks'
        ? (shouldShowTaskHeaderSearch() ? GLOBAL_HEADER_SEARCH_CONFIG.tasks : '')
        : GLOBAL_HEADER_SEARCH_CONFIG[currentView];
    const searchContainer = searchContainerId ? document.getElementById(searchContainerId) : null;
    const searchVisible = !!(searchContainer && !searchContainer.classList.contains('hidden'));
    return {
        currentView,
        meta,
        resolvedTitle,
        showHomeBack,
        searchContainerId,
        searchContainer,
        searchVisible,
        signature: [
            currentView,
            resolvedTitle,
            showHomeBack ? 'home-back' : 'no-home-back',
            cartPanelOpen ? 'cart-open' : 'cart-closed',
            bloomShareMenuOpen ? 'share-open' : 'share-closed',
            bloomCropUpdateModalOpen ? 'crop-update-open' : 'crop-update-closed',
            searchContainerId || 'no-search',
            searchVisible ? 'search-visible' : 'search-hidden',
            currentUserDisplay || currentUser || 'User',
            APP_VERSION
        ].join('|')
    };
}


function applyGlobalBackState(state) {
    const { currentView, modalBack, showBack } = state;
    syncHeaderBloomPlacement(currentView);
    const body = document.body;
    if (body) body.classList.toggle('global-back-active', showBack);
    if (body && (body.dataset.currentView !== currentView || !body.classList.contains(`current-view-${currentView}`)
        || (currentView !== 'home' && body.classList.contains('current-view-home')))) {
        syncCurrentViewBodyClass(currentView);
    }
    const searchRow = document.getElementById('global-header-search-row');
    if (searchRow) {
        const showHeader = showBack || !!currentUser;
        searchRow.classList.toggle('hidden', !showHeader);
        searchRow.hidden = !showHeader;
        searchRow.setAttribute('aria-hidden', showHeader ? 'false' : 'true');
        if (showHeader) ['display', 'visibility', 'pointer-events'].forEach(prop => searchRow.style.removeProperty(prop));
    }
    const legacyBack = document.getElementById('global-back-btn');
    if (legacyBack) legacyBack.classList.toggle('hidden', !showBack);
    const button = document.getElementById('global-header-inline-back');
    if (!button) return;
    // A closed popover is hidden by the browser even if our CSS makes
    // the button visible. Normal navigation must remove that mode.
    if (!modalBack || typeof button.showPopover !== 'function') {
        try {
            if (button.hasAttribute('popover') && button.matches(':popover-open') && typeof button.hidePopover === 'function') button.hidePopover();
        } catch { globalThis.reportHandledRuntimeIssue?.("applyGlobalBackState", 'HANDLED_OPERATION_FAILURE'); }
        button.removeAttribute('popover');
    }
    const visible = showBack || !!currentUser;
    button.classList.toggle('hidden', !visible);
    button.hidden = !visible;
    button.disabled = !showBack;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    button.setAttribute('aria-disabled', showBack ? 'false' : 'true');
    const accessBack=currentView==='managers' && getActiveBloomscapesUserDirectory()?.showingDetail();
    button.setAttribute('aria-label',accessBack?'Back to Users':'Back');
    button.title=accessBack?'Back to Users':'Back';
    if (visible) ['display', 'visibility', 'pointer-events'].forEach(prop => button.style.removeProperty(prop));
    if (modalBack && typeof button.showPopover === 'function') {
        button.setAttribute('popover', 'manual');
        try {
            if (!button.matches(':popover-open')) button.showPopover();
        } catch {
            // A detached/unsupported promotion must not leave a closed
            // popover attribute hiding the normal navigation control.
            button.removeAttribute('popover');
        }
    }
}


function mountBloomscapesViewSearch(view) {
    const supported=['smart-moves','sales-office','sales','qc','production','sales-inventory','communication'];
    if (!supported.includes(view)) return;
    const root=document.getElementById('view-'+view);
    const selector=view==='communication' ? '[data-comm-search]'
        : view==='smart-moves' ? '[aria-label="Search Smart Moves"]' : '[data-main-inventory-browse] [data-work-search]';
    const input=root?.querySelector(selector);
    if (!input) return;
    const id=GLOBAL_HEADER_SEARCH_CONFIG[view];
    const existing=document.getElementById(id);
    if (existing?.contains(input)) return;
    existing?.remove();
    const container=document.createElement('div');container.id=id;
    input.before(container);container.append(input);
    if (view === 'communication' && !input.dataset.headerSearchBound) {
        input.dataset.headerSearchBound = 'true';
        input.addEventListener('input', event => {event.stopPropagation();inputBloomscapesComm(event);});
    }
}
