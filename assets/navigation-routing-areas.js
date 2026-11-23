function openBloomscapesAreaView(area, key) {
    const entry = bloomscapesAreaChoices(area).find(([id]) => id === key);
    if (!entry) return false;
    const [, , view] = entry;
    if (view === 'sales') return openBloomscapesAreaSalesSection(key.slice('sales-'.length));
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

function preparePermittedStudioNavigation(view, options) {
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
    const home = getBloomscapesAreaHost(grid);
    paintBloomscapesAreaHubs(home);
    const drawer = queryBloomscapesStaticBody('side-drawer','[data-drawer-business-areas]');
    if (drawer) paintBloomscapesAreaHubs(drawer);
}

function getBloomscapesAreaHost(grid) {
    const previous = grid.previousElementSibling;
    if (previous?.hasAttribute('data-home-business-areas')) return previous;
    const host = document.createElement('div');
    host.dataset.homeBusinessAreas = '';
    grid.before(host);
    return host;
}

function paintBloomscapesAreaHubs(host) {
    for (const area of BLOOMSCAPES_BUSINESS_AREAS) {
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
    const nextArea = BLOOMSCAPES_BUSINESS_AREAS.slice(BLOOMSCAPES_BUSINESS_AREAS.indexOf(area) + 1)
        .map(({id})=>host.querySelector('[data-business-area="' + id + '"]')).find(Boolean);
    host.insertBefore(card, nextArea || null);
    return card;
}
