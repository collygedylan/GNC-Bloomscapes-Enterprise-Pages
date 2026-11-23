const bloomscapesHomeDepartmentNames = Object.freeze({
    INVENTORY:'Inventory',PRODUCTION:'Production',QC:'QC',DOCKS:'Docks',SALES:'Sales',ADMIN:'Managers'
});
const bloomscapesHomeDepartmentLabels = Object.freeze({
    requests:'Que → Requests',suspend:'Que → Suspend Tags',po:'PO Management',
    historical:'Historical Requests'
});
const bloomscapesHomeDetailOnly = new Set(['messages','walkie','docks-issues','sales-flyer','sales-history','sales-rep','sales-archive']);
const bloomscapesHomeAreaOverrides = Object.freeze({
    INVENTORY:area => [...area.views.flatMap(view=>view[0] === 'assigned-items' ? []
        : [view[0] === 'eval2' ? ['reports','Reports','reports'] : view]),['queue','Que','request']],
    SALES:area => [...area.views,['sales-av','AV','av']]
});
const bloomscapesHomeAreas = BLOOMSCAPES_BUSINESS_AREAS.map(area=>({...area,
    views:bloomscapesHomeAreaOverrides[area.id]?.(area) || area.views
}));
const bloomscapesHomeDepartmentState = new WeakMap();

function bloomscapesHomeDepartmentOwner() {
    return JSON.stringify([currentUser,nativeAuthProfile?.id,getBloomscapesFarm(),borrowedHelpPreview()?.id]);
}

function getBloomscapesHomeDepartment(grid = document.getElementById('home-dashboard-grid')) {
    const selected = grid && bloomscapesHomeDepartmentState.get(grid);
    return selected?.owner === bloomscapesHomeDepartmentOwner() ? selected.area : null;
}

function bloomscapesHomeChoices(area) {
    const choices = bloomscapesAreaChoices(area);
    const shown = choices.filter(([key]) => !bloomscapesHomeDetailOnly.has(key));
    const sales = choices.find(([key]) => key.startsWith('sales-') && key !== 'sales-av');
    if (sales && !shown.includes(sales)) shown.unshift(sales);
    return shown;
}

function bloomscapesHomeDepartmentTitle() {
    return bloomscapesHomeDepartmentNames[getBloomscapesHomeDepartment()?.id] || '';
}

function clearBloomscapesHomeDepartment() {
    const grid = document.getElementById('home-dashboard-grid');
    return Boolean(grid && bloomscapesHomeDepartmentState.delete(grid));
}

function selectBloomscapesHomeDepartment(grid, area) {
    if (getCurrentVisibleViewId() !== 'home' || !bloomscapesHomeChoices(area).length) return;
    bloomscapesHomeDepartmentState.set(grid,{area,owner:bloomscapesHomeDepartmentOwner()});
    syncBloomscapesHomeTileVisibility(grid);
    document.getElementById('view-home').scrollTop = 0;
    syncGlobalHeaderChrome({reason:'home-department',force:true});
    grid.querySelector('[data-home-department-module]')?.focus({preventScroll:true});
}

function backBloomscapesHomeDepartment() {
    const area = getBloomscapesHomeDepartment();
    if (!area || !clearBloomscapesHomeDepartment()) return false;
    const grid = document.getElementById('home-dashboard-grid');
    syncBloomscapesHomeTileVisibility(grid);
    syncGlobalHeaderChrome({reason:'home-department',force:true});
    grid.querySelector('[data-home-department="'+area.id+'"]')?.focus({preventScroll:true});
    return true;
}

function paintBloomscapesHomeDepartments(grid) {
    let area = getBloomscapesHomeDepartment(grid);
    const choices = area && bloomscapesHomeChoices(area);
    if (area && !choices.length) {
        bloomscapesHomeDepartmentState.delete(grid);
        area = null;
    }
    const tiles = area
        ? choices.map(([key,label])=>[key,key.startsWith('sales-') && key !== 'sales-av'
            ? 'Sales & Marketing Studio' : bloomscapesHomeDepartmentLabels[key] || label,area.icon])
        : bloomscapesHomeAreas.filter(department => bloomscapesHomeChoices(department).length)
            .map(department=>[department.id,bloomscapesHomeDepartmentNames[department.id],department.icon]);
    syncBloomscapesDepartmentButtons(grid,area,tiles);
    return tiles.length;
}

function syncBloomscapesDepartmentButtons(grid, area, tiles) {
    const signature = JSON.stringify([area?.id,tiles]);
    if (grid.dataset.departmentTiles === signature && grid.querySelectorAll('[data-home-department], [data-home-department-module]').length === tiles.length) return;
    for (const button of grid.querySelectorAll('[data-home-department], [data-home-department-module]')) button.remove();
    const fragment = document.createDocumentFragment();
    for (const [key,label,icon] of tiles) fragment.append(bloomscapesDepartmentButton(grid,area,key,label,icon));
    grid.prepend(fragment);
    grid.dataset.departmentTiles = signature;
}

function bloomscapesDepartmentButton(grid, area, key, label, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-module-tile';
    button.setAttribute('aria-label','Open '+label);
    button.innerHTML = '<i class="ph '+icon+'" aria-hidden="true"></i>';
    const title = button.appendChild(document.createElement('span'));
    title.textContent = label;
    if (area) {
        button.dataset.homeDepartmentModule = key;
        button.onclick = () => openBloomscapesAreaView(area,key);
    } else {
        button.dataset.homeDepartment = key;
        button.onclick = () => selectBloomscapesHomeDepartment(grid,bloomscapesHomeAreas.find(entry=>entry.id===key));
    }
    return button;
}

function openBloomscapesAreaView(area, key) {
    const entry = bloomscapesAreaChoices(area).find(([id]) => id === key);
    if (!entry) return false;
    const [, , view] = entry;
    if (key === 'reports' && getActiveEvalReportsAccess().scope === 'legacy') return openBloomscapesAreaManagerView('eval2');
    if (view === 'sales') return openBloomscapesAreaSalesSection(key.slice('sales-'.length));
    if (key === 'sales-av') return switchView('av');
    if (view === 'managers') return openBloomscapesAreaManagerView(key);
    if (key === 'inventory-office') return openInventoryOfficeView();
    if (['docks','load-maximizer','dock-credit-vault'].includes(key)) return openBloomscapesAreaDockSubview(key);
    if (key === 'studio') return openBloomscapesFieldWorkStudio();
    if (key === 'po') return openBloomscapesDepartmentModule('hl-order','bloomscapes-replenishment');
    if (key === 'suspend' || key === 'requests') {
        switchView('request');
        if (getCurrentVisibleViewId() === 'request') setReqTab(key === 'suspend' ? 'suspend-tag' : 'pending');
        return false;
    }
    return switchView(view);
}

function preparePrimaryNavigationTarget(context) {
    const { nextViewId, currentViewId, switchOptions, fromHistory } = context;
    const plainManagersHubEntry = nextViewId === 'managers' && !fromHistory
        && !switchOptions.managerSubView && !switchOptions.quickAccessRoute;
    if (plainManagersHubEntry) {
        if (activeHomeTab !== 'dashboard') {
            if (typeof cancelManagerModuleReads === 'function') cancelManagerModuleReads();
            if (typeof destroyManagerAssignedItemsView === 'function') destroyManagerAssignedItemsView();
            window.GncProductionSchedule?.unmount();
            if (typeof unmountAlphaCommandCenter === 'function') unmountAlphaCommandCenter('hr');
        }
        activeHomeTab = 'dashboard';
        managersSearchTerm = '';
        selectedProductivityUser = '';
        if (typeof markViewDirty === 'function') markViewDirty('managers');
    }
    if (switchOptions.quickAccessRoute && currentViewId !== nextViewId) {
        quickAccessNestedBackState = {
            account: String(currentUser || '').trim().toLowerCase(),
            origin: String(switchOptions.quickAccessOrigin || currentViewId || 'home').trim(),
            parent: nextViewId,
            route: String(switchOptions.quickAccessRoute || '').trim(),
            tab: String(switchOptions.quickAccessTab || '').trim().toLowerCase()
        };
    } else if (!fromHistory && currentViewId !== nextViewId) quickAccessNestedBackState = null;
    if (nextViewId === 'av' && currentViewId === 'home') clearAvSearchForHomeEntry();
    if (!['historical-requests', 'request-history'].includes(nextViewId)) destroyHistoricalRequestsIsland();
    else markViewDirty('historical-requests');
    if (nextViewId !== 'sales-inventory' && inventoryFieldCountingMode) {
        inventoryFieldCountingMode = false;
        destroyFieldCountingIsland();
    }
}

function preparePermittedStudioNavigation(view, options) {
    if (view==='field-work-consolidation' || options.studioPhase==='consolidation') return prepareFieldWorkConsolidationNavigation();
    if (view==='production' && bloomscapesDepartmentTabs.get(bloomscapesDepartmentKey(view))==='bloomscapes-consolidation') {
        return canViewFieldWorkConsolidation();
    }
    if (!canUseBloomscapesWorkStudio()) return true;
    const requested = view === 'production' && !options.fromHistory ? 'field-work-studio' : view;
    const phase = options.studioPhase || bloomscapesStudioRoute(requested);
    if (phase && !allowsBloomscapesAreaSubview(bloomscapesStudioPermission(phase))) return false;
    prepareBloomscapesStudioNavigation(requested, options);
    return true;
}

function openBloomscapesAreaDockSubview(key) {
    switchView('docks');
    const root = document.getElementById('view-docks');
    if (!root || getCurrentVisibleViewId() !== 'docks') return false;
    if (key === 'load-maximizer') return openBloomscapesDockCapacity(root);
    if (key === 'docks') return false;
    let vault = root.querySelector('[data-area-dock-credit]');
    if (!vault) {
        vault = document.createElement('section');
        vault.dataset.areaDockCredit = '';
        root.append(vault);
        mountBloomscapesDockCreditVault(vault);
    }
    vault.scrollIntoView({block:'nearest'});
    return false;
}

function openBloomscapesAreaManagerView(key) {
    if (key === 'assigned-items') return openManagerTableManagement('assigned-items');
    if (key === 'tables') return openManagerTableManagement();
    const tabs = {eval2:MANAGER_EVAL_REPORTS_2_VIEW, hr:MANAGER_HR_COMMAND_VIEW,
        'production-schedule':MANAGER_PRODUCTION_SCHEDULE_VIEW, watchdog:MANAGER_RUNTIME_WATCHDOG_VIEW};
    switchView('managers', {managerSubView:true});
    if (getCurrentVisibleViewId() === 'managers') setHomeTab(tabs[key]);
    return false;
}

function openBloomscapesAreaSalesSection(section) {
    const view = resolveBloomscapesSalesStudioView();
    if (!view) return false;
    switchView(view);
    if (getCurrentVisibleViewId() !== view) return false;
    renderBloomscapesNativeSalesOffice(view, section);
    const studio = document.querySelector('#view-' + view + ' [data-marketing-studio]');
    const choice = studio?.querySelector('[data-sales-section="' + section + '"]');
    if (choice && choice.getAttribute('aria-pressed') !== 'true') choice.click();
    return false;
}

function mountBloomscapesAreaHubs(grid) {
    if (!nativeAuthSessionActive || !grid) return;
    syncBloomscapesHomeTileVisibility(grid);
    syncBloomscapesDrawerAreaHubs();
}

function syncBloomscapesDrawerAreaHubs() {
    const drawer = queryBloomscapesStaticBody('side-drawer','[data-drawer-business-areas]');
    if (drawer) paintBloomscapesAreaHubs(drawer);
}

function paintBloomscapesAreaHubs(host) {
    for (const area of bloomscapesHomeAreas) {
        const choices = bloomscapesAreaChoices(area);
        let card = host.querySelector('[data-business-area="' + area.id + '"]');
        if (!choices.length) { card?.remove(); continue; }
        if (!card) card = insertBloomscapesAreaCard(host, area);
        mountModuleSubviewDropdown(card, {choices:choices.map(([key,label])=>[key,label]),
            select:key=>openBloomscapesAreaView(area,key)});
    }
}

function insertBloomscapesAreaCard(host, area) {
    const card = document.createElement('section');
    card.dataset.businessArea = area.id;
    const heading = document.createElement('h3');
    const icon = document.createElement('i');
    icon.className = 'ph ' + area.icon;
    icon.setAttribute('aria-hidden','true');
    heading.append(icon, ' ' + area.id);
    const description = document.createElement('p');
    description.textContent = area.label;
    card.append(heading, description);
    const nextArea = bloomscapesHomeAreas.slice(bloomscapesHomeAreas.indexOf(area) + 1)
        .map(({id})=>host.querySelector('[data-business-area="' + id + '"]')).find(Boolean);
    host.insertBefore(card, nextArea || null);
    return card;
}
