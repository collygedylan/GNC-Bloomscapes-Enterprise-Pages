const bloomscapesHomeAreaOverrides = Object.freeze({
    INVENTORY:area => [...area.views.flatMap(view=>view[0] === 'assigned-items' ? []
        : [view[0] === 'eval2' ? ['reports','Reports','reports'] : view]),['queue','Que','request']],
    SALES:area => [...area.views,['sales-av','AV','av']]
});
const bloomscapesHomeAreas = BLOOMSCAPES_BUSINESS_AREAS.map(area=>({...area,
    views:bloomscapesHomeAreaOverrides[area.id]?.(area) || area.views
}));
/** @param {object} area Business area definition. @param {string} key Selected field or route key. @returns {unknown} The selected route's navigation result. */
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

/** @param {object} context Current navigation request. @returns {void} Prepares Manager, inventory and history state for entry. */
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

/** @param {string} view Target view identifier. @param {object} options Navigation or startup options. @returns {boolean} Whether the requested studio route may proceed. */
function preparePermittedStudioNavigation(view, options) {
    if (isFieldWorkConsolidationRoute(view,options.studioPhase)) return prepareFieldWorkConsolidationNavigation();
    if (options.fromHistory && view==='production' && bloomscapesDepartmentTabs.get(bloomscapesDepartmentKey(view))==='bloomscapes-consolidation') {
        return canViewFieldWorkConsolidation();
    }
    if (!canUseBloomscapesWorkStudio()) return true;
    const requested = view === 'production' && !options.fromHistory ? 'field-work-studio' : view;
    const phase = options.studioPhase || bloomscapesStudioRoute(requested);
    if (phase && !canDisplayFieldWorkSubview(phase)) return false;
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

/** @param {HTMLElement} grid Home tile grid. @returns {void} Synchronizes authorized Home and drawer choices. */
function mountBloomscapesAreaHubs(grid) {
    if (!nativeAuthSessionActive || !grid) return;
    syncBloomscapesHomeTileVisibility(grid);
    syncBloomscapesDrawerAreaHubs();
}

/** @returns {void} Refreshes the drawer for the current farm and permissions. */
function syncBloomscapesDrawerAreaHubs() {
    const drawer = queryBloomscapesStaticBody('side-drawer','[data-drawer-business-areas]');
    if (drawer) paintBloomscapesAreaHubs(drawer);
    const shipping = queryBloomscapesStaticBody('side-drawer','#drawer-shipping-btn');
    if (shipping) shipping.hidden = !canShowBloomscapesHomeTile('shipping');
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

/** @param {string} viewId Requested destination. @param {object} options Shell route options. @returns {string} Canonical route for the active profile. */
function resolvePrimaryShellRoute(viewId, options) {
    return String(BLOOMSCAPES_SHELL_ROUTE_ALIASES[viewId] || (viewId==='field-work-consolidation' && 'production')
        || (viewId === 'field-work-studio' && options.parkHillStudio === true && 'production')
        || (nativeAuthSessionActive && viewId === 'sales-office' && 'sales')
        || (nativeAuthSessionActive && viewId === 'production' && currentUser !== 'dylan_collyge' && currentUser !== 'megan_kelly'
            && !BLOOMSCAPES_FIELD_ENTRY_ROLES[nativeAuthProfile?.role] && 'drive')
        || (nativeAuthSessionActive && (currentUser === 'dylan_collyge' || currentUser === 'megan_kelly'
            || BLOOMSCAPES_FIELD_ENTRY_ROLES[nativeAuthProfile?.role]) && (
            viewId==='field-work-studio'
            || typeof BLOOMSCAPES_STUDIO_LEGACY_ROUTES !== 'undefined' && BLOOMSCAPES_STUDIO_LEGACY_ROUTES[viewId]!==undefined
            || viewId==='production-workflow' && productionWorkflowActive==='can-filling')
            ? 'production' : viewId==='chat' && nativeAuthSessionActive ? 'messages' : viewId || 'home')).trim();
}
