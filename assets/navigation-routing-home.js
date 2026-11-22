const BLOOMSCAPES_SHELL_ROUTE_ALIASES = Object.freeze({__proto__:null, office:'moves', 'inventory-office':'moves', qc:'request'});

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
