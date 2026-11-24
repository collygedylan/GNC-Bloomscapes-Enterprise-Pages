const BLOOMSCAPES_SHELL_ROUTE_ALIASES = Object.freeze({__proto__:null, office:'moves', 'inventory-office':'moves', qc:'request'});

const BLOOMSCAPES_FIELD_ENTRY_ROLES = Object.freeze({__proto__:null,manager:true,supervisor:true,foreman:true,crew:true});
const BLOOMSCAPES_HOME_MODULES = Object.freeze([
    {view:'drive', label:'Drive Mode', icon:'ph-car', action:"switchView('drive')"},
    {view:'av', label:'AV', icon:'ph-notebook', action:"switchView('av')"},
    {view:'studio', label:'Field Work Studio', icon:'ph-plant', action:'openBloomscapesFieldWorkStudio()'},
    {view:'field-work-consolidation', label:'Consolidate Inventory', icon:'ph-arrows-in-cardinal', action:"switchView('field-work-consolidation')"},
    {view:'production-schedule', label:'Production Schedule', icon:'ph-calendar-check', action:"openBloomscapesAreaManagerView('production-schedule')"},
    {view:'disease-pest', label:'QC', icon:'ph-shield-check', action:"switchView('disease-pest')"},
    {view:'inventory-office', label:'Inventory Office', icon:'ph-buildings', action:'openInventoryOfficeView()'},
    {view:'docks', label:'Docks', icon:'ph-truck', action:"switchView('docks')"},
    {view:'hl-order', label:'PO Management', icon:'ph-package', action:"openBloomscapesDepartmentModule('hl-order','bloomscapes-replenishment')"},
    {view:'sales', label:'Sales & Marketing Studio', icon:'ph-handshake', action:"switchView('sales')"},
    {view:'historical-requests', label:'Historical Requests', icon:'ph-clock-counter-clockwise', action:"switchView('historical-requests')"},
    {view:'smart-moves', label:'Smart Sales & Move Intelligence', icon:'ph-trend-up', action:"switchView('smart-moves')"},
    {view:'borrowed-work', label:'Borrowed Help', icon:'ph-users', action:"switchView('borrowed-work')"},
    {view:'time-cards', label:'Time Cards', icon:'ph-clock', action:"switchView('time-cards')"},
    {view:'managers', label:'Managers', icon:'ph-users-three', action:"switchView('managers')"},
    {view:'messages', label:'Messages', icon:'ph-chat-circle-text', action:'openBloomscapesMessages()'},
    {view:'walkie', label:'Push to Talk', icon:'ph-microphone', action:"openBloomscapesComm('voice')"},
    {view:'request', label:'Que', icon:'ph-list-checks', action:"switchView('request')"},
    {view:'reports', label:'Reports', icon:'ph-chart-bar', action:'openBloomscapesHomeReports()'}
]);

function openBloomscapesHomeReports() {
    return getActiveEvalReportsAccess().scope === 'legacy'
        ? openBloomscapesAreaManagerView('eval2') : switchView('reports');
}

function mountBloomscapesFarmSelector() {
    void ensureBloomscapesFarmAccess().then(() => {
        syncBloomscapesFarmSelector();
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


function changeBloomscapesFarmSelection(select) {
    if (select.disabled) return;
    const next = select.value;
    if (next === getBloomscapesFarm() || getBloomscapesAllowedFarms().length <= 1) return;
    const owner = bloomscapesFarmState.owner;
    const selection = selectBloomscapesFarm(next);
    const token = bloomscapesFarmState.selectionToken;
    void selection.then(result => {
        if (result && isCurrentFarmSelection(owner,token)) refreshBloomscapesFarmPanel();
    }).catch(error => {
        if (isCurrentFarmSelection(owner,token)) showToast('Farm selection',error.message,true);
    }).finally(() => {
        if (isCurrentFarmSelection(owner,token) && select.isConnected) select.value = getBloomscapesFarm();
    });
}

function isCurrentFarmSelection(owner,token) {
    return owner === bloomscapesFarmState.owner && owner === currentUser && token === bloomscapesFarmState.selectionToken;
}

function refreshBloomscapesFarmPanel() {
    const container = document.getElementById('managers-content');
    const panel = container?.querySelector('[data-bloomscapes-workflow]');
    if (!panel || document.getElementById('view-managers')?.classList.contains('hidden')) return;
    panel.dispatchEvent(new Event('bloomscapes-farm-change'));
}

function resolveBloomscapesSalesStudioView(user = '') {
    return ['sales', 'sales-office'].find(view => canAccessView(view, user));
}

function mountDocksFilterDisclosure(view) {
    const controls = view.querySelector('.freeze-panel #docks-filter-controls');
    if (!controls || controls.parentElement.matches('.docks-filter-disclosure')) return;
    const disclosure = document.createElement('details');
    disclosure.className = 'docks-filter-disclosure';
    const summary = document.createElement('summary');
    summary.textContent = 'Filters';
    controls.before(disclosure);
    disclosure.append(summary, controls);
}

function getNavigationHomeModuleRegistry(base, smartMoves) {
    if (nativeAuthSessionActive) return BLOOMSCAPES_HOME_MODULES;
    const retired = new Set(['sales-office', 'office', 'qc', 'production', 'sales-inventory']);
    const modules = base.filter(module => !retired.has(module.view)).map(module =>
        module.view === 'sales' ? { ...module, label:'Sales & Marketing Studio' } : module);
    if (canAccessView('moves')) modules.push({
        view:'inventory-office', label:'Inventory Office', icon:'ph-storefront', action:'openInventoryOfficeView()'
    });
    if (hasFullNavigationVisibility() || isAuthenticatedExecutiveUser('view_smart_moves')) modules.push(smartMoves);
    const role = getNavigationVisibilityIdentity()?.role;
    const dockRole = window.GncUserAccessControl?.normalizeRole?.(String(role || '').toLowerCase() === 'docks' ? 'dock' : role) === 'dock_office';
    if (!dockRole || hasFullNavigationVisibility()) return modules;
    return [...modules, { view: 'docks', label: 'Docks', icon: 'ph-truck', action: "switchView('docks')" }];
}

function partitionSalesOfficeLiveAdapters(adapters = [], view = '', surfaces = []) {
    const source = Array.isArray(adapters) ? adapters : [];
    if (view === 'moves' && nativeAuthSessionActive) {
        return { foreground: source.filter(adapter => adapter?.id !== 'core:salesOffice'), background: [] };
    }
    const hasDialog = (Array.isArray(surfaces) ? surfaces : []).some(surface => String(surface || '').startsWith('dialog:'));
    if (view !== 'sales-office' || hasDialog) return { foreground: source, background: [] };
    const foreground = source.filter(adapter => adapter?.id === 'core:salesOffice');
    if (!foreground.length) return { foreground: source, background: [] };
    return { foreground, background: source.filter(adapter => adapter?.id !== 'core:salesOffice') };
}

function mountHomeQueueCategoryControl() {
    const toolbar = document.getElementById('request-filter-toolbar');
    if (!toolbar || toolbar.querySelector('[data-module-subview-trigger]')) return;
    const counts = requestTabQueueCountsSnapshotScope === getSupabaseReadIdentityScope()
        ? requestTabQueueCountsSnapshot : null;
    if (counts) syncQueCategoryControl(toolbar, counts);
    else mountQueCategoryControl();
}

function scheduleHomeQueueCategoryCounts() {
    if (!nativeAuthSessionActive || !canShowBloomscapesHomeTile('request')) return;
    const owner = getSupabaseReadIdentityScope();
    if (requestTabQueueCountsSnapshot && requestTabQueueCountsSnapshotScope === owner) return;
    scheduleUiRender('view-enter:home:que-counts', () => {
        if (getCurrentVisibleViewId() !== 'home' || owner !== getSupabaseReadIdentityScope()
            || !canShowBloomscapesHomeTile('request')) return;
        if (!requestTabQueueCountsSnapshot || requestTabQueueCountsSnapshotScope !== owner) syncRequestTabButtons();
    });
}

function openInventoryOfficeView() {
    if (!canAccessView('moves')) return switchView('home');
    activeMovesTab = 'office';
    activeInventoryOfficeApprovalType = normalizeInventoryOfficeApprovalType(activeInventoryOfficeApprovalType);
    movesViewLevel = 0;
    selectedMovesBlock = null;
    selectedMovesLocation = null;
    markViewDirty('moves');
    const result = switchView('moves');
    const sequence = navTransitionSeq;
    afterNavigationPaint('moves', sequence, () => void refreshInventoryOfficeDirectory(sequence));
    return result;
}

async function refreshInventoryOfficeDirectory(sequence) {
    try {
        await ensureAssignableAppUsers();
        if (isCurrentNavigationTransition(sequence, 'moves')) scheduleMovesRender(true);
    } catch (error) {
        if (isCurrentNavigationTransition(sequence, 'moves')) {
            globalThis.reportHandledRuntimeIssue?.('inventory-office-directory', error.code || 'DIRECTORY_READ_FAILED');
        }
    }
}

function resolveFooterNavigationSelection(buttons, currentView, access, personal) {
    let selected = null;
    let parent = null;
    for (const button of buttons) {
        const view = String(button.dataset.footerView || '').trim();
        syncBloomscapesFooterCaption(button, view);
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

function usesBloomscapesEffectiveNavigation() {
    return nativeAuthSessionActive;
}

function isBloomscapesNavigationPreview() {
    return nativeAuthSessionActive && Boolean(borrowedHelpPreview());
}

function beginPrimaryViewNavigation(viewId, options, navigationSeq) {
    if (viewId !== 'bunch-note') window.BunchNote?.disposeView();
    if (viewId !== 'request' && !(viewId === 'detail' && window.BunchQueueShell?.isDetailOpen())) window.BunchQueueShell?.destroy();
    if (String(viewId || '').trim() !== 'managers') cancelManagerSeasonPriorityRead();
    const viewSwitchStartedAt = beginInternalPerfMeasure();
    persistAppFilterStateNow();
    if (driveQuickFiltersModalOpen) closeDriveQuickFiltersModal();
    if (String(viewId || '').trim() !== 'tasks') closeTaskDropdowns(false);
    if (isDrawerOpen()) setMenuOpenState(false);
    beginDirectNavigationActivity();
    const switchOptions = (options && typeof options === 'object') ? options : {};
    const fromHistory = !!switchOptions.fromHistory;
    const requestedViewId = String(viewId || 'home').trim();
    if (typeof syncRequestSalesImpactOwnership === 'function') syncRequestSalesImpactOwnership();
    if (requestedViewId === 'request-sales-impact') ensureRequestSalesImpactViewElement();
    if (requestedViewId === 'request' && switchOptions.managerSalesReps !== true && requestSalesRepsManagerMode) {
        requestSalesRepsManagerMode = false;
        if (activeReqTab === 'reps') activeReqTab = 'pending';
        markViewDirty('request');
    }
    const nextViewId = canAccessView(requestedViewId) ? requestedViewId : 'home';
    const currentViewId = getCurrentVisibleViewId();
    return { navigationSeq, viewSwitchStartedAt, switchOptions, fromHistory, requestedViewId, nextViewId, currentViewId };
}


function canOpenCommunicationView(view, user) {
    if (!nativeAuthSessionActive || (user && user !== currentUser)) return false;
    const preview = borrowedHelpPreview();
    if (preview) return previewShowsAreaView(preview,view === 'messages' ? 'messages' : 'walkie');
    const key = view === 'messages' ? 'view_messages' : 'view_walkie';
    const grant=getAppAccessSnapshot()?.permissionMap?.[key];
    return grant ? grant.allowed===true : hasExplicitViewPermission(view,user);
}
