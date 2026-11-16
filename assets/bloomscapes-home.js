const BLOOMSCAPES_BASE_HOME = "<button type=\"button\" id=\"home-tile-drive\" data-home-module-view=\"drive\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('drive')\" aria-label=\"Open Drive Mode\"><i class=\"ph ph-car\" aria-hidden=\"true\"></i><span>Drive Mode</span></button>\n                                <button type=\"button\" id=\"home-tile-hl-order\" data-home-module-view=\"hl-order\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('hl-order')\" aria-label=\"Open PO Management\"><i class=\"ph ph-truck\" aria-hidden=\"true\"></i><span>PO Management</span></button>\n                                <button type=\"button\" id=\"home-tile-av\" data-home-module-view=\"av\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('av')\" aria-label=\"Open AV\"><i class=\"ph ph-notebook\" aria-hidden=\"true\"></i><span>AV</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-office\" data-home-module-view=\"sales-office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales-office')\" aria-label=\"Open Sales Office\"><svg class=\"home-module-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M9 7V4h6v3M3 7h18v14H3zM3 12h18M10 12v3h4v-3\"/></svg><span>Sales Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales\" data-home-module-view=\"sales\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('sales')\" aria-label=\"Open Sales\"><i class=\"ph ph-handshake\" aria-hidden=\"true\"></i><span>Sales</span></button>\n                                <button type=\"button\" id=\"home-tile-historical-requests\" data-home-module-view=\"historical-requests\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('historical-requests')\" aria-label=\"Open Historical Requests\"><i class=\"ph ph-clock-counter-clockwise\" aria-hidden=\"true\"></i><span>Historical Requests</span></button>\n                                <button type=\"button\" id=\"home-tile-managers\" data-home-module-view=\"managers\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('managers')\" aria-label=\"Open Managers\"><i class=\"ph ph-users-three\" aria-hidden=\"true\"></i><span>Managers</span></button>\n                                <button type=\"button\" id=\"home-tile-qc\" data-home-module-view=\"qc\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('qc')\" aria-label=\"Open QC\"><i class=\"ph ph-shield-check\" aria-hidden=\"true\"></i><span>QC</span></button>\n                                <button type=\"button\" id=\"home-tile-office\" data-home-module-view=\"office\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('office')\" aria-label=\"Open Office\"><i class=\"ph ph-buildings\" aria-hidden=\"true\"></i><span>Office</span></button>\n                                <button type=\"button\" id=\"home-tile-sales-inventory\" data-home-module-view=\"sales-inventory\" class=\"home-module-tile role-access hidden\" onclick=\"openInventoryHubView()\" aria-label=\"Open Inventory\"><i class=\"ph ph-storefront\" aria-hidden=\"true\"></i><span>Inventory</span></button>\n                                <button type=\"button\" id=\"home-tile-production\" data-home-module-view=\"production\" class=\"home-module-tile role-access hidden\" onclick=\"switchView('production')\" aria-label=\"Open Production\"><i class=\"ph ph-plant\" aria-hidden=\"true\"></i><span>Production</span></button>";

function mountBloomscapesHomeModules() {
    for (const id of ['header-version','app-release-version']) {
        const pill = document.getElementById(id);
        if (pill) pill.textContent = window.__APP_RELEASE_VERSION__;
    }
    mountBloomscapesFarmSelector();
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
    studio.hidden=!isFullAppAdministrator();
    mountBloomscapesCommunicationTiles(grid);
    const order=['drive','hl-order','av','sales-office','sales','historical-requests','managers','qc','office','sales-inventory','production','studio','smart-moves','messages','walkie'];
    for (const id of order) {
        const tile=grid.querySelector('#home-tile-'+id);
        if (tile) grid.appendChild(tile);
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
    select.addEventListener('change',()=>changeBloomscapesFarmSelection(select));
    header.before(label);
}


async function changeBloomscapesFarmSelection(select) {
    if (select.disabled) return;
    const previous = getBloomscapesFarm();
    const next = select.value;
    select.value = previous;
    if (next===previous || getBloomscapesAllowedFarms().length===1) return;
    select.disabled = true;
    try {
        if (!await confirmBloomscapesFarmSwitch(previous,next)) return;
        select.value = next;
        select.value = await selectBloomscapesFarm(next);
        refreshBloomscapesFarmPanel();
    } catch (error) {
        showToast('Farm selection',error.message,true);
    } finally {
        select.value = getBloomscapesFarm();
        select.disabled = false;
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
