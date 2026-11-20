const GLOBAL_HEADER_SEARCH_CONFIG = {
    po:'po-workspace-search', communication:'communication-shared-search',
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

function getGlobalHeaderChromeState(backState = getGlobalBackState()) {
    const currentView = backState.currentView;
    mountBloomscapesViewSearch(currentView);
    const baseMeta = AMAZON_HEADER_META[currentView] || { title: formatGlobalHeaderTitle(currentView) };
    const meta = currentView === 'moves' && activeMovesTab === 'office'
        ? { eyebrow: 'Location Move', title: 'Inventory Office' }
        : baseMeta;
    const moduleTitle = bloomscapesDepartmentTitle(currentView)
        || (currentView === 'managers' ? bloomscapesWorkflowTab(activeHomeTab)?.label : '');
    const resolvedTitle = moduleTitle || meta.title || formatGlobalHeaderTitle(currentView);
    const showHomeBack = currentView === 'home' && backState.modalBack;
    const po=document.getElementById('view-'+currentView)?.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    const searchContainerId = po && !po.closest('[hidden],.hidden') ? getBloomscapesPoHeaderSearch(po) : currentView === 'tasks'
        ? (shouldShowTaskHeaderSearch() ? GLOBAL_HEADER_SEARCH_CONFIG.tasks : '')
        : GLOBAL_HEADER_SEARCH_CONFIG[currentView];
    const searchContainer = searchContainerId ? document.getElementById(searchContainerId) : null;
    if (searchContainer) ensureHeaderSearchPlaceholder(searchContainer);
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
    const visible = (currentView !== 'home' || modalBack) && (showBack || !!currentUser);
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

function updateGlobalBackButton() {
    const state = getGlobalBackState();
    applyGlobalBackState(state);
    return state;
}

function getVisibleSecondaryBack(modalOnly = false) {
    const root = modalOnly ? document : document.getElementById('view-' + getCurrentVisibleViewId());
    if (!root) return undefined;
    const controls = root.querySelectorAll('[data-secondary-back]');
    for (let i=controls.length-1;i>=0;i--) {
        const control = controls[i];
        if (control.disabled || control.closest('.hidden,[hidden],details:not([open]),dialog:not([open])')) continue;
        if (modalOnly && !control.closest('[id$="-modal"],dialog,[role="dialog"]')) continue;
        if (typeof control.checkVisibility==='function' ? control.checkVisibility() : secondaryBackHasVisibleParents(control)) return control;
    }
    return undefined;
}

function secondaryBackHasVisibleParents(control) {
    for (let parent=control.parentElement;parent;parent=parent.parentElement) {
        if (getComputedStyle(parent).display==='none') return false;
    }
    return true;
}

const headerSearchOrigins = new WeakMap();

function ensureHeaderSearchPlaceholder(container) {
    const existing = headerSearchOrigins.get(container);
    if (existing?.parentNode) return existing;
    container.classList.add('amazon-search-host');
    let placeholder = document.querySelector('[data-header-search-placeholder="' + container.id + '"]');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'hidden';
        placeholder.dataset.headerSearchPlaceholder = container.id;
        container.parentNode.insertBefore(placeholder, container);
    }
    headerSearchOrigins.set(container, placeholder);
    return placeholder;
}

function ensureGlobalHeaderSearchPlaceholders() {
    for (const id of Object.values(GLOBAL_HEADER_SEARCH_CONFIG)) {
        const container = document.getElementById(id);
        if (container) ensureHeaderSearchPlaceholder(container);
    }
}

function restoreGlobalHeaderSearchContainers() {
    const slot = document.getElementById('global-header-search-slot');
    for (const container of Array.from(slot?.children || [])) {
        const origin = headerSearchOrigins.get(container);
        if (!origin?.parentNode) continue;
        container.classList.remove('global-header-search-mounted');
        container.removeAttribute('data-global-header-mounted');
        origin.after(container);
    }
}

function syncGlobalHeaderSearchOwnership(activeContainer = null) {
    const body = document.body;
    const id = activeContainer?.id || '';
    const previous = body?.dataset.globalHeaderSearchOwner || '';
    if (previous && previous !== id) {
        const old = document.getElementById(previous);
        old?.classList.remove('global-header-search-mounted');
        old?.removeAttribute('data-global-header-mounted');
    }
    if (body && previous !== id) {
        body.classList.toggle('global-header-search-active', Boolean(id));
        if (id) body.dataset.globalHeaderSearchOwner = id;
        else delete body.dataset.globalHeaderSearchOwner;
    }
    const slot = document.getElementById('global-header-search-slot');
    if (!activeContainer || !slot?.contains(activeContainer)) return;
    if (activeContainer.dataset.globalHeaderMounted !== 'true') {
        activeContainer.classList.add('global-header-search-mounted');
        activeContainer.dataset.globalHeaderMounted = 'true';
    }
    activeContainer.removeAttribute('aria-hidden');
    for (const key of ['display','visibility','height','min-height','max-height']) {
        if (activeContainer.style.getPropertyValue(key)) activeContainer.style.removeProperty(key);
    }
}

function formatGlobalHeaderTitle(viewId) {
    if (viewId === 'sales-credit') return 'Credit';
    if (viewId === 'historical-requests') return 'Historical Requests';
    if (viewId === 'request-history') return 'Request History';
    if (viewId === 'credit-request') return 'Credit Request';
    return String(viewId || 'home').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveFooterNavigationSelection(buttons, currentView, access, personal) {
    let selected = null;
    let parent = null;
    for (const button of buttons) {
        const view = String(button.dataset.footerView || '').trim();
        const allowed = personal || canShowFooterViewButton(view, access);
        if (!personal) button.classList.toggle('hidden', !allowed);
        if (!allowed || button.classList.contains('hidden')) continue;
        if (!selected && view === currentView) selected = button;
        if (view === 'communication' && ['communication','chat','department-calendar'].includes(currentView)) parent = button;
        if (!parent && view === 'sales' && currentView !== 'home' && isSalesShellAccess(access)) parent = button;
    }
    return selected || parent;
}

function syncFooterNavigationButtons(footer, currentView, access, personal) {
    const active = resolveFooterNavigationSelection(footer?.querySelectorAll('[data-footer-view]') || [], currentView, access, personal);
    const controls = footer?.querySelectorAll('button, .nav-item, [data-footer-view]') || [];
    for (const button of controls) {
        const selected = button === active;
        if (button.classList.contains('active') !== selected) button.classList.toggle('active', selected);
        if (selected && button.getAttribute('aria-current') !== 'page') button.setAttribute('aria-current', 'page');
        if (!selected && button.hasAttribute('aria-current')) button.removeAttribute('aria-current');
        if (button.style.touchAction !== 'manipulation') button.style.touchAction = 'manipulation';
    }
}

let stickyRailForceRequested = false;

function scheduleStickyRailOffsetSync(reason = 'default', force = false) {
    const syncReason = normalizeUiSyncReason(reason);
    if (!force && isIOSDevice() && isUserInLiveTouchScrollGesture()) {
        scheduleDeferredChromeSyncTask('sticky-rail-offset', () => scheduleStickyRailOffsetSync('settled:'+syncReason,true), ACTIVE_SCROLL_GRACE_MS + 120);
        return;
    }
    if (!force && shouldDeferChromeSyncWork(syncReason)) {
        scheduleDeferredChromeSyncTask('sticky-rail-offset', () => scheduleStickyRailOffsetSync('deferred:'+syncReason,true));
        return;
    }
    stickyRailForceRequested ||= force;
    if (stickyRailOffsetFrameQueued) return;
    stickyRailOffsetFrameQueued = true;
    requestAnimationFrame(flushStickyRailOffsetSync);
}

function flushStickyRailOffsetSync() {
    stickyRailOffsetFrameQueued = false;
    const forced = stickyRailForceRequested;
    stickyRailForceRequested = false;
    const signature = forced ? '' : buildStickyRailOffsetSignature();
    if (!forced && signature === lastStickyRailOffsetSignature) return;
    syncStickyRailOffsets();
    lastStickyRailOffsetSignature = signature;
}
