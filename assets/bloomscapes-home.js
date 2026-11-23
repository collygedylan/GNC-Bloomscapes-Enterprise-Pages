function mountBloomscapesHomeModules() {
    for (const id of ['header-version','app-release-version']) {
        const pill = document.getElementById(id);
        if (pill) pill.textContent = window.__APP_RELEASE_VERSION__;
    }
    mountBloomscapesFarmSelector();
    if (typeof mountSuperAdminViewAs === 'function') mountSuperAdminViewAs();
    if (typeof primeBorrowedHelpRoutes === 'function') primeBorrowedHelpRoutes();
    const grid = ensureHomeModuleRegistry();
    if (!grid) return;
    grid.dataset.bloomscapesHome = 'tiles';
    grid.querySelector('#home-tile-field-work-consolidation')?.setAttribute('aria-description','Bed Space Advisor');
    mountBloomscapesAreaHubs(grid);
    scheduleHomeQueueCategoryCounts();
}

function mountBloomscapesCommunicationTiles(grid) {
    syncBloomscapesHomeTileVisibility(grid);
    syncBloomscapesHomeBadges();
}

function syncBloomscapesHomeBadges() {
    const counts={messages:typeof bloomscapesMessagesState==='undefined'?0:bloomscapesMessagesState.unread,
        walkie:typeof bloomscapesRadioInbox==='undefined'?0:bloomscapesRadioInbox.count};
    for (const [id,count] of Object.entries(counts)) {
        const tile = document.getElementById('home-tile-'+id);
        if (!tile) continue;
        let badge = tile.querySelector('[data-home-count]');
        if (!badge && count > 0) {
            badge = tile.appendChild(document.createElement('b'));
            badge.dataset.homeCount = '';
        }
        if (!badge) continue;
        badge.hidden = !(count > 0);
        badge.textContent = String(count);
    }
    const menu=queryBloomscapesStaticBody('side-drawer','[data-menu-unread]');
    if (menu) {menu.hidden=!counts.messages;menu.textContent=String(counts.messages);}
    updateFooterChatBadge();
}

function openBloomscapesHomeModule(tab) {
    const phase=bloomscapesStudioRoute(tab);
    if (phase!==undefined || tab==='bloomscapes-studio') return openBloomscapesFieldWorkStudio(phase);
    switchView('managers');
    return setHomeTab(tab);
}

const homeMarkupByNode = new WeakMap();
function renderHome(opening = false) {
    if (getCurrentVisibleViewId() !== 'home') return;
    mountBloomscapesHomeModules();
    const dynamicContent = document.getElementById('home-dynamic-content');
    const dashboardContent = document.getElementById('home-dashboard-content');
    if (!dynamicContent || !dashboardContent) return;
    if (!opening) {
        syncGoogleScriptButton();
        refreshBloomscapesHomeStatus();
    }
    if (!nativeAuthSessionActive && shouldUseRepSalesHomeHub()) {
        activeHomeTab = 'dashboard';
        selectedProductivityUser = '';
        dashboardContent.classList.add('hidden');
        const homeHtml = getRepHomeDashboardHtml();
        syncRequestChromeMarkup(dynamicContent, homeHtml || `<div class="request-capability-card request-capability-card--error" role="alert"><div><strong>Home could not load</strong><span>Retry your access check to restore authorized modules.</span></div><button type="button" onclick="return retryRequestCapabilities()">Retry</button></div>`, homeMarkupByNode);
        if (!homeHtml && Date.now() - lastHomeEmptyDiagnosticAt > 60000) {
            lastHomeEmptyDiagnosticAt = Date.now();
            reportSemanticHealthEvent('home_render_empty', 'home', 'HOME_RENDER_EMPTY', { role: String(currentRole || '').slice(0, 40) });
        }
        requestAnimationFrame(() => assertRepHomeModuleParity('render-home'));
        if (typeof syncHomeDashboardBodyMode === 'function') syncHomeDashboardBodyMode();
        return;
    }
    activeHomeTab = 'dashboard';
    selectedProductivityUser = '';
    dashboardContent.classList.remove('hidden');
    if (dynamicContent.firstChild) dynamicContent.replaceChildren();
    if (typeof syncCurrentViewBodyClass === 'function') syncCurrentViewBodyClass('home');
}

function synchronizeLoginRoleControls(access, initialHome = false) {
    document.querySelectorAll('.role-access').forEach(el => {
        const isAllowed =
            (access.isAdmin && el.classList.contains('role-admin')) ||
            (access.isRepLike && el.classList.contains('role-rep')) ||
            (access.isRequestRepScopedUser && el.classList.contains('role-request-enabled')) ||
            (access.isGrower && el.classList.contains('role-grower')) ||
            (access.isQcSupervisor && el.classList.contains('role-qc-supervisor')) ||
            (access.isQc && el.classList.contains('role-qc'));
        el.classList.toggle('hidden', !isAllowed);
        el.style.display = '';
    });
    if (initialHome) syncInitialHomeNavigationVisibility(access,ensureHomeModuleRegistry());
    else syncRoleAccessUi(access);
}

function runLoginInitializationStep(label, task) {
    try {
        const result = task();
        if (result && typeof result.catch === 'function') result.catch(error => console.warn(`${label} deferred after login.`, error));
        return result;
    } catch (error) {
        console.warn(`${label} deferred after login.`, error);
        return null;
    }
}

function confirmBloomscapesHomeMount() {
    setHomeDashboardModulesReady(!shouldUseRepSalesHomeHub());
    const grid = document.getElementById(shouldUseRepSalesHomeHub() ? 'home-rep-dashboard-grid' : 'home-dashboard-modules');
    if (!grid || grid.hidden || grid.classList.contains('hidden')
        || !grid.querySelector(':is(button,[data-home-module],a):not(.hidden):not([hidden])')) {
        ensureHomeDashboardReadyAfterLogin('login-shell-open');
        return;
    }
    window.__agdataHomeReadyUser = String(currentUser).trim().toLowerCase();
    window.__agdataMarkBootComplete?.();
    void window.GncRuntimeWatchdog?.flushPrebootRecoveries?.();
}

function finishBloomscapesShellStartup(touchShell) {
    runLoginInitializationStep('AURA widget', () => syncAuraWidgetForSession());
    if (getCurrentVisibleViewId() === 'home') {
        syncGoogleScriptButton();
        refreshBloomscapesHomeStatus();
    }
    document.body.classList.remove('detail-field-active');
    repairAppShellScrollState('login-shell-open', { resetGestureState: true });
    applyRolePermissions();
    updateFooterNavState();
    syncGlobalHeaderChrome({reason:'login-home-mount',force:true});
    runAfterShellInteractive(() => scheduleRequestModalReferencePrefetch(),touchShell ? 180 : 40);
    runAfterShellInteractive(() => scheduleGlobalReferencePrefetch(),touchShell ? 260 : 80);
    if (touchShell) {
        runAfterShellInteractive(() => {
            runAfterTouchInteraction(() => refreshRealtimeSubscriptionsForCurrentView(true), 2800, 'current-view-realtime-subscriptions');
        }, 220);
    } else {
        runLoginInitializationStep('Realtime subscriptions', () => refreshRealtimeSubscriptionsForCurrentView(true));
    }
    setTimeout(() => ensureHomeDashboardReadyAfterLogin('login-shell-watchdog-1'), 650);
    setTimeout(() => ensureHomeDashboardReadyAfterLogin('login-shell-watchdog-2'), 1800);
    void runAppUpdateRestoreAfterShell();
    if (canUseProductionLiveSync()) {
        runLoginInitializationStep('Production live sync', () => signalProductionLiveSync('login-shell-open', 0));
        return;
    }
    runAfterShellInteractive(() => {
        wakeRequestQueueLiveData('login-shell-open', {
            force: true,
            minIntervalMs: 0
        });
    }, touchShell ? 40 : 0);
}

function refreshBloomscapesHomeStatus() {
    if (typeof updateDashboardSyncSummary === 'function') updateDashboardSyncSummary();
    auditLocalRequestDurability('home').catch(error => reportHandledRuntimeIssue('home-request-audit',error.message));
}

function openAppShellAfterLogin() {
    window.__agdataSessionBoundary = false;
    document.documentElement.classList.remove('agdata-retained-prepaint','agdata-authenticated-boot');
    clearLoginStartupWatchdog();
    const loginView=document.getElementById('view-login');
    const retained = shouldPreserveMountedBootView() && getViewElementById(getCurrentVisibleViewId());
    if (retained && retained.getBoundingClientRect().height > 0 && !retained.classList.contains('hidden')) {
        finishInitialAppLoad();
        if (loginView) loginView.style.display='none';
        window.__agdataMarkBootComplete?.();
        void runAppUpdateRestoreAfterShell();
        return;
    }

    blurActiveField();
    revealBloomscapesLoginShell();
    runLoginInitializationStep('Home view',()=>showOnlyPrimaryView('home'));
    runLoginInitializationStep('Home render',()=>renderHome(true));
    runLoginInitializationStep('Role controls',()=>synchronizeLoginRoleControls(getRoleAccessState(),true));
    document.body.classList.add('role-access-ready');
    if (loginView) loginView.style.display='none';
    confirmBloomscapesHomeMount();
    finishInitialAppLoad();
    document.getElementById('login-inputs')?.classList.remove('hidden');
    document.getElementById('loading-spinner')?.classList.add('hidden');
    window.__agdataMarkBootComplete?.();
    try { window.GncLoginTrace?.finish('shell-ready'); }
    catch { globalThis.reportHandledRuntimeIssue?.('openAppShellAfterLogin','HANDLED_OPERATION_FAILURE'); }
    const owner=currentUser;
    runAfterShellInteractive(()=>{
        if (currentUser!==owner) return;
        runLoginInitializationStep('Menu reset',()=>setMenuOpenState(false));
        finishBloomscapesShellStartup(isTouchConstrainedDevice());
    });
}

function revealBloomscapesLoginShell() {
    const wrapper=document.getElementById('app-wrapper');
    if (wrapper) {
        wrapper.classList.remove('hidden');
        wrapper.hidden=false;
        if (wrapper.style.display==='none') wrapper.style.removeProperty('display');
        wrapper.style.pointerEvents='auto';
        wrapper.style.opacity='1';
    }
    const scrollArea=document.getElementById('main-scroll-area');
    if (scrollArea) {
        scrollArea.style.pointerEvents='auto';
        scrollArea.style.opacity='1';
    }
}
