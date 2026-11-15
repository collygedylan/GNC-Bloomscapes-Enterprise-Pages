const BLOOMSCAPES_BASE_HOME = "<button type=\"button\" id=\"home-tile-drive\" data-home-module-view=\"drive\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('drive')\" aria-label=\"Open Drive Mode\"><i class=\"ph ph-car\" aria-hidden=\"true\"></i><span>Drive Mode</span></button>\n                                <button type=\"button\" id=\"home-tile-hl-order\" data-home-module-view=\"hl-order\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('hl-order')\" aria-label=\"Open HL Order\"><i class=\"ph ph-truck\" aria-hidden=\"true\"></i><span>HL Order</span></button>\n                                <button type=\"button\" id=\"home-tile-av\" data-home-module-view=\"av\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('av')\" aria-label=\"Open AV\"><i class=\"ph ph-notebook\" aria-hidden=\"true\"></i><span>AV</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-office\" data-home-module-view=\"sales-office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales-office')\" aria-label=\"Open Sales Office\"><svg class=\"home-module-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M9 7V4h6v3M3 7h18v14H3zM3 12h18M10 12v3h4v-3\"/></svg><span>Sales Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales\" data-home-module-view=\"sales\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales')\" aria-label=\"Open Sales\"><i class=\"ph ph-handshake\" aria-hidden=\"true\"></i><span>Sales</span></button>\n                                <button type=\"button\" id=\"home-tile-historical-requests\" data-home-module-view=\"historical-requests\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('historical-requests')\" aria-label=\"Open Historical Requests\"><i class=\"ph ph-clock-counter-clockwise\" aria-hidden=\"true\"></i><span>Historical Requests</span></button>\n                                <button type=\"button\" id=\"home-tile-managers\" data-home-module-view=\"managers\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('managers')\" aria-label=\"Open Managers\"><i class=\"ph ph-users-three\" aria-hidden=\"true\"></i><span>Managers</span></button>\n                                <button type=\"button\" id=\"home-tile-qc\" data-home-module-view=\"qc\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('qc')\" aria-label=\"Open QC\"><i class=\"ph ph-shield-check\" aria-hidden=\"true\"></i><span>QC</span></button>\n                                <button type=\"button\" id=\"home-tile-office\" data-home-module-view=\"office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('office')\" aria-label=\"Open Office\"><i class=\"ph ph-buildings\" aria-hidden=\"true\"></i><span>Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-inventory\" data-home-module-view=\"sales-inventory\" class=\"home-module-tile role-access hidden\" onclick=\"openInventoryHubView()\" aria-label=\"Open Inventory\"><i class=\"ph ph-storefront\" aria-hidden=\"true\"></i><span>Inventory</span></button>\n                                <button type=\"button\" id=\"home-tile-production\" data-home-module-view=\"production\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('production')\" aria-label=\"Open Production\"><i class=\"ph ph-plant\" aria-hidden=\"true\"></i><span>Production</span></button>\n                                <button type=\"button\" id=\"home-tile-smart-moves\" data-home-module-view=\"smart-moves\" data-module=\"smart-moves\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('smart-moves')\" aria-label=\"Open Smart Sales &amp; Move Intelligence\"><i class=\"ph ph-trend-up\" aria-hidden=\"true\"></i><span>Smart Sales &amp; Move Intelligence</span></button>";

const BLOOMSCAPES_HOME_MODULES = [
    ['bunch-notes','📝 Bunch Notes','bloomscapes-bunch-notes'],
    ['can-filling','🪴 Can Filling','bloomscapes-can-filling'],
    ['grading','🌾 Season .Y Shift Grading & CF#','bloomscapes-grading'],
    ['hauling','🚜 Hauling & Consolidation','bloomscapes-hauling'],
    ['shearing','✂️ Shear List & Crew Queue','bloomscapes-shearing'],
    ['replenishment','🚚 Intercompany & CPB','bloomscapes-replenishment'],
    ['lab','🔬 Plant Health & Lab Reports','bloomscapes-lab'],
    ['vault','📁 My Work & Inquiry PDF Vault','bloomscapes-vault'],
    ['sales-vault','💼 Sales Rep Vault','bloomscapes-sales-vault'],
    ['radio','🎙️ Walkie-Talkie & AURA Voice','bloomscapes-radio'],
    ['architecture','📖 System Architecture & Table Map','bloomscapes-architecture']
];

function mountBloomscapesHomeModules() {
    mountBloomscapesFarmSelector();
    const grid = document.getElementById('home-dashboard-grid');
    if (!grid) return;
    grid.dataset.bloomscapesHome = 'true';
    if (!grid.querySelector('#home-tile-drive')) grid.innerHTML = BLOOMSCAPES_BASE_HOME;
    for (const [id,label,tab] of BLOOMSCAPES_HOME_MODULES) {
        let button = document.getElementById('home-bloomscapes-' + id);
        if (!button) {
            button = document.createElement('button');
            button.id = 'home-bloomscapes-' + id;
            button.type = 'button';
            button.className = 'home-module-tile';
            button.dataset.homeModuleView = 'managers';
            button.dataset.moduleTileId = tab;
            const title = button.appendChild(document.createElement('span'));
            title.textContent = label;
            button.addEventListener('click', () => openBloomscapesHomeModule(tab));
            grid.appendChild(button);
        }
        button.hidden = !canAccessView('managers');
    }
}

function mountBloomscapesFarmSelector() {
    void ensureBloomscapesFarmAccess().then(syncBloomscapesFarmSelector).catch(error=>
        globalThis.reportHandledRuntimeIssue?.('farm_access',error.code || 'FARM_ACCESS_UNAVAILABLE'));
    const mounted = document.getElementById('bloomscapes-farm-selector');
    if (mounted) { mounted.value = getBloomscapesFarm(); return; }
    const header = document.getElementById('global-header-search-row');
    if (!header) return;
    const label = document.createElement('label');
    label.className = 'bloomscapes-farm-selector';
    label.textContent = 'Farm ';
    const select = label.appendChild(document.createElement('select'));
    select.id = 'bloomscapes-farm-selector';
    const choices = getBloomscapesAllowedFarms().map(farm=>[farm,farm]);
    for (const [farm,title] of choices) {
        const option = select.appendChild(document.createElement('option'));
        option.value = farm;
        option.textContent = title;
    }
    select.value = getBloomscapesFarm();
    select.addEventListener('change', async () => {
        select.disabled = true;
        try {
            if (!await confirmBloomscapesFarmSwitch(getBloomscapesFarm(),select.value)) return;
            select.value = await selectBloomscapesFarm(select.value);
            refreshBloomscapesFarmPanel();
        }
        catch (error) {
            select.value = getBloomscapesFarm();
            showToast('Farm selection',error.message,true);
        } finally { select.value = getBloomscapesFarm(); select.disabled = false; }
    });
    header.before(label);
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
function renderHome() {
    if (getCurrentVisibleViewId() !== 'home') return;
    mountBloomscapesHomeModules();
    const dynamicContent = document.getElementById('home-dynamic-content');
    const dashboardContent = document.getElementById('home-dashboard-content');
    if (!dynamicContent || !dashboardContent) return;
    syncGoogleScriptButton();
    if (typeof updateDashboardSyncSummary === 'function') updateDashboardSyncSummary();
    auditLocalRequestDurability('home').catch(() => {});
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
