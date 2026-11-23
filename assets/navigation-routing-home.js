const BLOOMSCAPES_SHELL_ROUTE_ALIASES = Object.freeze({__proto__:null, office:'moves', 'inventory-office':'moves', qc:'request'});

const BLOOMSCAPES_HOME_MODULES = Object.freeze([
    {view:'drive', label:'Drive Mode', icon:'ph-car', action:"switchView('drive')"},
    {view:'av', label:'AV', icon:'ph-notebook', action:"switchView('av')"},
    {view:'studio', label:'Field Work Studio', icon:'ph-plant', action:'openBloomscapesFieldWorkStudio()'},
    {view:'disease-pest', label:'QC', icon:'ph-shield-check', action:"switchView('disease-pest')"},
    {view:'inventory-office', label:'Inventory Office', icon:'ph-buildings', action:'openInventoryOfficeView()'},
    {view:'docks', label:'Docks', icon:'ph-truck', action:"switchView('docks')"},
    {view:'hl-order', label:'PO Management', icon:'ph-package', action:"openBloomscapesDepartmentModule('hl-order','bloomscapes-replenishment')"},
    {view:'sales', label:'Sales & Marketing Studio', icon:'ph-handshake', action:"switchView('sales')"},
    {view:'historical-requests', label:'Historical Requests', icon:'ph-clock-counter-clockwise', action:"switchView('historical-requests')"},
    {view:'smart-moves', label:'Smart Sales & Move Intelligence', icon:'ph-trend-up', action:"switchView('smart-moves')"},
    {view:'borrowed-work', label:'Borrowed Help', icon:'ph-users', action:"switchView('borrowed-work')"},
    {view:'managers', label:'Managers', icon:'ph-users-three', action:"switchView('managers')"},
    {view:'messages', label:'Messages', icon:'ph-chat-circle-text', action:'openBloomscapesMessages()'},
    {view:'walkie', label:'Push to Talk', icon:'ph-microphone', action:"openBloomscapesComm('voice')"},
    {view:'request', label:'Que', icon:'ph-list-checks', action:"switchView('request')"},
    {view:'reports', label:'Reports', icon:'ph-chart-bar', action:"switchView('reports')"}
]);

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
