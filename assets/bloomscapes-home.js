const BLOOMSCAPES_BASE_HOME = "<button type=\"button\" id=\"home-tile-drive\" data-home-module-view=\"drive\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('drive')\" aria-label=\"Open Drive Mode\"><i class=\"ph ph-car\" aria-hidden=\"true\"></i><span>Drive Mode</span></button>\n                                <button type=\"button\" id=\"home-tile-hl-order\" data-home-module-view=\"hl-order\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('hl-order')\" aria-label=\"Open PO Management\"><i class=\"ph ph-truck\" aria-hidden=\"true\"></i><span>PO Management</span></button>\n                                <button type=\"button\" id=\"home-tile-av\" data-home-module-view=\"av\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('av')\" aria-label=\"Open AV\"><i class=\"ph ph-notebook\" aria-hidden=\"true\"></i><span>AV</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-office\" data-home-module-view=\"sales-office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales-office')\" aria-label=\"Open Sales Office\"><svg class=\"home-module-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M9 7V4h6v3M3 7h18v14H3zM3 12h18M10 12v3h4v-3\"/></svg><span>Sales Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales\" data-home-module-view=\"sales\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales')\" aria-label=\"Open Sales\"><i class=\"ph ph-handshake\" aria-hidden=\"true\"></i><span>Sales</span></button>\n                                <button type=\"button\" id=\"home-tile-historical-requests\" data-home-module-view=\"historical-requests\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('historical-requests')\" aria-label=\"Open Historical Requests\"><i class=\"ph ph-clock-counter-clockwise\" aria-hidden=\"true\"></i><span>Historical Requests</span></button>\n                                <button type=\"button\" id=\"home-tile-managers\" data-home-module-view=\"managers\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('managers')\" aria-label=\"Open Managers\"><i class=\"ph ph-users-three\" aria-hidden=\"true\"></i><span>Managers</span></button>\n                                <button type=\"button\" id=\"home-tile-qc\" data-home-module-view=\"qc\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('qc')\" aria-label=\"Open QC\"><i class=\"ph ph-shield-check\" aria-hidden=\"true\"></i><span>QC</span></button>\n                                <button type=\"button\" id=\"home-tile-office\" data-home-module-view=\"office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('office')\" aria-label=\"Open Office\"><i class=\"ph ph-buildings\" aria-hidden=\"true\"></i><span>Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-inventory\" data-home-module-view=\"sales-inventory\" class=\"home-module-tile role-access hidden\" onclick=\"openInventoryHubView()\" aria-label=\"Open Inventory\"><i class=\"ph ph-storefront\" aria-hidden=\"true\"></i><span>Inventory</span></button>\n                                <button type=\"button\" id=\"home-tile-production\" data-home-module-view=\"production\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('production')\" aria-label=\"Open Production\"><i class=\"ph ph-plant\" aria-hidden=\"true\"></i><span>Production</span></button>";

function mountBloomscapesHomeModules(opening = false) {
    for (const id of ['header-version','app-release-version']) {
        const pill = document.getElementById(id);
        if (pill) pill.textContent = window.__APP_RELEASE_VERSION__;
    }
    mountBloomscapesFarmSelector();
    if (!opening) mountDivisionWeather();
    const grid = document.getElementById('home-dashboard-grid');
    if (!grid) return;
    grid.dataset.bloomscapesHome = 'true';
    if (!grid.querySelector('#home-tile-drive')) grid.innerHTML = BLOOMSCAPES_BASE_HOME;
    for (const tile of grid.querySelectorAll('[id^="home-bloomscapes-"]')) tile.remove();
    let studio=grid.querySelector('#home-tile-studio');
    if (!studio) {
        studio=document.createElement('button');studio.id='home-tile-studio';studio.type='button';
        studio.className='home-module-tile';studio.innerHTML='<i class="ph ph-hammer" aria-hidden="true"></i><span>Build Work Studio</span>';
        studio.addEventListener('click',()=>openBloomscapesDepartmentModule('production','studio'));grid.appendChild(studio);
    }
    studio.hidden=!canUseBloomscapesWorkStudio();
    grid.querySelector('#home-tile-bloom')?.remove();
    mountBloomscapesCommunicationTiles(grid);
    const order=['drive','hl-order','av','sales-office','sales','historical-requests','managers','qc','office','sales-inventory','production','studio','smart-moves','messages','walkie'];
    let previous = null;
    for (const id of order) {
        const tile = grid.querySelector('#home-tile-'+id);
        if (!tile) continue;
        const next = previous ? previous.nextElementSibling : grid.firstElementChild;
        if (tile!==next) grid.insertBefore(tile,next);
        previous = tile;
    }
    const orderTile=grid.querySelector('#home-tile-hl-order');
    if (orderTile) orderTile.setAttribute('onclick',"return openBloomscapesDepartmentModule('hl-order','bloomscapes-replenishment')");
}

function mountBloomscapesCommunicationTiles(grid) {
    const modules=[['smart-moves','Smart Sales & Move Intelligence','ph-chart-line-up',()=>switchView('smart-moves')],
        ['messages','Messages','ph-chat-circle-text',()=>openBloomscapesMessages()],
        ['walkie','Push to Talk Walkie','ph-microphone',()=>openBloomscapesComm('voice')]];
    for (const [id,title,icon,open] of modules) {
        let tile=grid.querySelector('#home-tile-'+id);
        if (!tile) {
            tile=document.createElement('button');tile.id='home-tile-'+id;tile.type='button';
            tile.className='home-module-tile';
            tile.innerHTML='<i class="ph '+icon+'" aria-hidden="true"></i><span>'+title+'</span><b data-home-count hidden></b>';
            tile.addEventListener('click',open);grid.appendChild(tile);
        }
        tile.hidden=!canAccessView(id==='messages'?'chat':id==='walkie'?'communication':id);
    }
    syncBloomscapesHomeBadges();
}

function syncBloomscapesHomeBadges() {
    const counts={messages:typeof bloomscapesMessagesState==='undefined'?0:bloomscapesMessagesState.unread,
        walkie:typeof bloomscapesRadioInbox==='undefined'?0:bloomscapesRadioInbox.count};
    for (const [id,count] of Object.entries(counts)) {
        const badge=document.querySelector('#home-tile-'+id+' [data-home-count]');
        if (badge) {badge.hidden=!(count>0);badge.textContent=String(count);}
    }
    updateFooterChatBadge();
}

function mountBloomscapesFarmSelector() {
    void ensureBloomscapesFarmAccess().then(() => {
        syncBloomscapesFarmSelector();
        mountDivisionWeather();
        void resumeRequestPhotoGalleryDeepLink();
    }).catch(error=>
        globalThis.reportHandledRuntimeIssue?.('farm_access',error.code || 'FARM_ACCESS_UNAVAILABLE'));
    const mounted = document.getElementById('bloomscapes-farm-selector');
    if (mounted) { mounted.value = getBloomscapesFarm(); return; }
    const header = document.getElementById('global-header-search-row');
    if (!header) return;
    const label = document.createElement('label');
    label.className = 'bloomscapes-farm-selector';
    const select = label.appendChild(document.createElement('select'));
    select.id = 'bloomscapes-farm-selector';
    select.setAttribute('aria-label','Farm');
    const choices = getBloomscapesAllowedFarms().map(farm=>[farm,farm]);
    for (const [farm,title] of choices) {
        const option = select.appendChild(document.createElement('option'));
        option.value = farm;
        option.textContent = title;
    }
    select.value = getBloomscapesFarm();
    select.addEventListener('change',()=>changeBloomscapesFarmSelection(select));
    header.appendChild(label);
    select.disabled = choices.length === 1;
}


async function changeBloomscapesFarmSelection(select) {
    if (select.disabled) return;
    const previous = getBloomscapesFarm();
    const next = select.value;
    select.value = previous;
    if (next===previous || getBloomscapesAllowedFarms().length===1) return;
    select.disabled = true;
    try {
        select.value = next;
        select.value = await selectBloomscapesFarm(next);
        refreshBloomscapesFarmPanel();
        mountDivisionWeather();
    } catch (error) {
        showToast('Farm selection',error.message,true);
    } finally {
        select.value = getBloomscapesFarm();
        select.disabled = getBloomscapesAllowedFarms().length <= 1;
    }
}

function refreshBloomscapesFarmPanel() {
    const container = document.getElementById('managers-content');
    const panel = container?.querySelector('[data-bloomscapes-workflow]');
    if (!panel || document.getElementById('view-managers')?.classList.contains('hidden')) return;
    panel.dispatchEvent(new Event('bloomscapes-farm-change'));
}

function openBloomscapesHomeModule(tab) {
    switchView('managers');
    return setHomeTab(tab);
}

const homeMarkupByNode = new WeakMap();
function renderHome(opening = false) {
    if (getCurrentVisibleViewId() !== 'home') return;
    mountBloomscapesHomeModules(opening);
    const dynamicContent = document.getElementById('home-dynamic-content');
    const dashboardContent = document.getElementById('home-dashboard-content');
    if (!dynamicContent || !dashboardContent) return;
    if (!opening) {
        syncGoogleScriptButton();
        refreshBloomscapesHomeStatus();
    }
    const dashboardSticky = document.getElementById('home-dashboard-sticky');
    const dashboardHero = document.getElementById('home-dashboard-hero');
    if (shouldUseRepSalesHomeHub()) {
        activeHomeTab = 'dashboard';
        selectedProductivityUser = '';
        if (dashboardSticky) dashboardSticky.classList.remove('hidden');
        if (dashboardHero) dashboardHero.classList.remove('hidden');
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
    if (dashboardSticky) dashboardSticky.classList.remove('hidden');
    if (dashboardHero) dashboardHero.classList.remove('hidden');
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
        mountDivisionWeather();
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
    if (shouldPreserveMountedBootView()) {
        finishInitialAppLoad();
        if (loginView) loginView.style.display='none';
        window.__agdataMarkBootComplete?.();
        void runAppUpdateRestoreAfterShell();
        return;
    }

    blurActiveField();
    revealBloomscapesLoginShell();
    runLoginInitializationStep('Home view',()=>showOnlyPrimaryView('home',{boot:true}));
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
