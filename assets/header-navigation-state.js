function getGlobalHeaderChromeState() {
    ensureGlobalHeaderSearchPlaceholders();
    const backState = getGlobalBackState();
    const currentView = backState.currentView;
    const baseMeta = AMAZON_HEADER_META[currentView] || { title: formatGlobalHeaderTitle(currentView) };
    const meta = currentView === 'moves' && activeMovesTab === 'office'
        ? { eyebrow: 'Location Move', title: 'Inventory Office' }
        : baseMeta;
    const moduleTitle = currentView === 'managers' ? bloomscapesWorkflowTab(activeHomeTab)?.label : '';
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

