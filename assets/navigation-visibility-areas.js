const PERSONAL_MODULE_ROUTES = Object.freeze({
    'production':'studio','field-work-studio':'studio','production-workflow':'studio',
    'push-to-talk':'walkie','communication':'walkie',
    'queue-pending':'request','queue-suspend':'request',
    'po-management':'hl-order','moves':'inventory-office'
});

function bloomscapesPersonalScope() {
    const lens=typeof borrowedHelpPreview==='function' ? borrowedHelpPreview() : null;
    if (lens) return lens.module_access ? lens : null;
    const state=window.GncUserAccessControl?.getSelfState?.();
    if (state?.profile?.username!==currentUser || !state?.profile?.module_access) return null;
    return state.profile;
}

function bloomscapesPersonalRoute(view,scope=bloomscapesPersonalScope()) {
    if (!scope) return null;
    if (view==='home') return true;
    const key=Object.hasOwn(PERSONAL_MODULE_ROUTES,view) ? PERSONAL_MODULE_ROUTES[view] : view;
    return ['VIEW_ONLY','FULL_EDIT'].includes(scope.module_access?.[key]);
}

function rowsInBloomscapesPersonalScope(rows,scope=bloomscapesPersonalScope(),farm=getBloomscapesFarm()) {
    if (!scope) return rows;
    if (scope.allowed_warehouses && !scope.allowed_warehouses.includes(farm)) return [];
    return rows.filter(row=>{
        const group=String(row.PLANTGROUPCODE ?? row.plantgroupcode ?? '').trim().toUpperCase();
        return bloomscapesRowFarm(row,'')===farm
            && (!scope.allowed_plantgroupcodes || scope.allowed_plantgroupcodes.includes(group));
    });
}

function bloomscapesPersonalInventoryScopeKey() {
    const scope=bloomscapesPersonalScope();
    return scope ? JSON.stringify([scope.username,scope.allowed_warehouses,scope.allowed_plantgroupcodes]) : '';
}

function bloomscapesVisibleFarmChoices(farms) {
    const limited=bloomscapesPersonalScope()?.allowed_warehouses;
    return limited ? farms.filter(farm=>limited.includes(farm)) : farms;
}

function syncBloomscapesPersonalFooter(footer) {
    if (!footer) return;
    if (!bloomscapesPersonalScope()) {
        footer.querySelectorAll('[data-personal-footer]').forEach(button=>button.remove());
        return;
    }
    const container=footer.querySelector('[data-footer-view="drive"]')?.parentElement;
    if (!container || container.querySelector('[data-personal-footer]')) return;
    const routes=[
        ['studio','Field Work Studio','ph-plant','field-work-studio'],
        ['borrowed-work','Borrowed Help','ph-users','borrowed-work'],
        ['time-cards','Time Cards','ph-clock','time-cards']
    ];
    for (const [key,label,icon,view] of routes) {
        const button=container.appendChild(document.createElement('button'));
        button.type='button';
        button.dataset.personalFooter='';
        button.dataset.footerView=key;
        button.className='footer-nav-btn';
        button.setAttribute('aria-label',label);
        const mark=button.appendChild(document.createElement('i'));
        mark.className='ph-duotone '+icon;
        button.appendChild(document.createElement('span')).textContent=label;
        bindFastPressTarget(button,'invoke','switchView',[view],label);
    }
}

const BLOOMSCAPES_BUSINESS_AREAS = Object.freeze([
    {id:'INVENTORY', label:'Inventory & Evaluation', icon:'ph-plant', views:[
        ['drive','Drive Mode','drive'], ['av','Available Inventory (AV)','av'],
        ['eval2','Eval Reports #2','managers'], ['inventory-office','Inventory Office / Reclass','moves'],
        ['assigned-items','Assigned Items','managers']
    ]},
    {id:'PRODUCTION', label:'Production & Field Ops', icon:'ph-hammer', views:[
        ['studio','Field Work Studio','production'], ['production-schedule','Production Schedule','managers'],
        ['po','PO Management / Intercompany & CPB','hl-order']
    ]},
    {id:'QC', label:'Quality Control & Plant Health', icon:'ph-shield-check', views:[
        ['lab','Plant Health & Lab Reports','disease-pest'], ['weather','Weather / Hold & GDD Risk','weather-hold'],
        ['smart','Smart Sales & Move Intelligence','smart-moves'], ['scout','Grower Scout','grower'],
        ['take-back','Take Back','take-back']
    ]},
    {id:'DOCKS', label:'Shipping, Traffic & Order Pulling', icon:'ph-truck', views:[
        ['docks','Docks & Order Pulling Board','docks'], ['docks-issues','Order Pulling Issues','mistake-fix'],
        ['load-maximizer','Traffic & Load Maximizer','docks'],
        ['dock-credit-vault','Dock Credit Vault','docks'], ['suspend','Que Â· Suspend Tags','request']
    ]},
    {id:'SALES', label:'Sales & Marketing', icon:'ph-handshake', views:[
        ['sales-design','Design Studio','sales'], ['sales-flyer','Flyer Folders','sales'],
        ['sales-history','Flyer History Archive','sales'], ['sales-rep','Sales Rep Vault','sales'],
        ['sales-archive','Inquiry PDF Vault','sales'], ['requests','Que Â· Requests','request'],
        ['historical','Historical Archive','historical-requests']
    ]},
    {id:'ADMIN', label:'Management, HR & Communications', icon:'ph-users-three', views:[
        ['tables','Table Management','managers'], ['hr','HR & Labor','managers'],
        ['watchdog','Watchdog Monitor','managers'], ['messages','Messages','messages'],
        ['walkie','Push to Talk','push-to-talk']
    ]}
]);

function bloomscapesAreaProfile() {
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id) return null;
    const profile = window.GncUserAccessControl?.getSelfState()?.profile;
    return profile?.id === nativeAuthProfile.id && profile.username === currentUser ? profile : null;
}

function isBloomscapesAreaScoped(profile = bloomscapesAreaProfile()) {
    if (!['manager','supervisor','foreman'].includes(String(profile?.role || nativeAuthProfile?.role).toLowerCase())) return false;
    return !profile || Array.isArray(profile.area_scopes);
}

function filterBloomscapesAreaViews(area, profile, scoped, baseline) {
    if (scoped && !profile?.area_scopes?.includes(area.id)) return [];
    return area.views.filter(([key,,view]) => scoped
        ? allowedScopedAreaChoice(profile,key)
        : baseline(key, view));
}

function allowedScopedAreaChoice(profile,key) {
    if (key === 'reports') return allowsBloomscapesAreaSubview('eval2');
    if (key === 'queue') return ['suspend','requests','studio'].some(key=>bloomscapesAreaGrant(profile.area_access?.[key]));
    if (key === 'sales-av') return bloomscapesAreaGrant(profile.area_access?.av)
        && ['sales-design','sales-flyer','sales-history','sales-rep','sales-archive'].some(key=>bloomscapesAreaGrant(profile.area_access?.[key]));
    const level = profile.area_access?.[key === 'docks-issues' ? 'docks' : key];
    return level === 'VIEW_ONLY' || level === 'FULL_EDIT';
}

function bloomscapesAreaChoices(area) {
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    const verified = bloomscapesAreaProfile();
    if (!preview && !verified && isBloomscapesAreaScoped(verified)) return [];
    const access = getBloomscapesReclassAccess();
    const profile = preview || verified || nativeAuthProfile;
    const views = area.views.filter(([key,,view]) => {
        if (key === 'inventory-office' && access && !hasBloomscapesReclassScope(access)) return false;
        if (['rep','sales_rep'].includes(profile?.role) && view === 'docks' && key !== 'dock-credit-vault') return false;
        return bloomscapesStrictRoleRoute(key === 'eval2' ? 'reports' : view,profile,preview) !== false;
    });
    const restricted = bloomscapesRestrictedNavigationProfile(preview);
    if (restricted?.role === 'eval' && !bloomscapesEvalDepartmentGrant(area.id, restricted)) return [];
    if (preview) return views.filter(([key,,view])=>canPreviewBloomscapesAreaChoice(preview,key)
        || view === 'request' && ['eval','evaluator'].includes(preview.role) && bloomscapesAreaGrant(preview.area_access?.queue));
    if (restricted?.role === 'eval' && area.id === 'INVENTORY') return views.filter(([key,,view]) => key === 'inventory-office'
        || view === 'request' && bloomscapesAreaGrant(restricted.area_access?.queue) || bloomscapesAreaGrant(restricted.area_access?.[key]));
    if (restricted?.role === 'eval' && area.id === 'DOCKS') return views.filter(([key])=>bloomscapesAreaGrant(restricted.area_access?.[key]));
    if (isBloomscapesAreaOwner()) return views;
    if (access && isBloomscapesAreaScoped() && area.id === 'INVENTORY') {
        const permitted = filterBloomscapesAreaViews({...area,views:views.filter(([key]) => key !== 'inventory-office')},
            bloomscapesAreaProfile(),true,canUseBloomscapesAreaView);
        return views.filter(entry => entry[0] === 'inventory-office' || permitted.includes(entry));
    }
    if (['rep','sales_rep'].includes(restricted?.role)) {
        return views.filter(([key,,view]) => key === 'dock-credit-vault' || canAccessView(view));
    }
    return filterBloomscapesAreaViews({...area,views}, profile, isBloomscapesAreaScoped(profile), canUseBloomscapesAreaView);
}

function canPreviewBloomscapesAreaChoice(preview, key) {
    if (key === 'inventory-office') return true;
    if (key === 'reports') return previewShowsAreaView(preview,'reports') || previewShowsAreaView(preview,'eval2');
    if (key === 'sales-av') return bloomscapesAreaGrant(preview.area_access?.av);
    return previewShowsAreaView(preview,key);
}

function bloomscapesEvalDepartmentGrant(area, profile) {
    const routes = {INVENTORY:'drive',QC:'qc',DOCKS:'docks',ADMIN:'managers'};
    return bloomscapesAreaGrant(profile.area_access?.[routes[area]]);
}

function isBloomscapesAreaOwner() {
    return nativeAuthSessionActive && nativeAuthProfile?.username === 'dylan_collyge'
        && currentUser === nativeAuthProfile.username && nativeAuthProfile.role === 'super-admin';
}

function canUseBloomscapesAreaView(key, view) {
    if (key === 'docks-issues') return canOpenBloomscapesDocksWorkspace(view);
    if (key === 'studio') return canUseBloomscapesWorkStudio();
    if (key === 'eval2') return canViewManagerEvalReports2();
    if (key === 'assigned-items') return canAccessView(view) && getManagersToolAccess().canViewAssignedItemsExport;
    if (key === 'reports') return getActiveEvalReportsAccess().scope !== 'legacy'
        ? canAccessView(view) : canViewManagerEvalReports2();
    if (key === 'sales-av') return Boolean(resolveBloomscapesSalesStudioView()) && canAccessView(view);
    if (key === 'queue') return !isBloomscapesAreaScoped() && canAccessView(view);
    if (key === 'watchdog') return canAccessView(view) && ['dylan_collyge','jd_jones','megan_kelly'].includes(currentUser);
    if (key === 'tables') return canAccessView(view) && getManagersToolAccess().canViewTableManagement;
    if (key === 'hr') return canAccessView(view) && getManagersToolAccess().canViewHrCommand;
    if (key === 'production-schedule') return canAccessView(view) && getManagersToolAccess().canViewProductionSchedule;
    if (key === 'suspend' || key === 'requests') {
        const category = key === 'suspend' ? 'suspend-tag' : 'pending';
        return canAccessView(view) && bloomscapesJobBoardCategories().some(([tab]) => tab === category);
    }
    return canAccessView(view);
}

function resolveBloomscapesAreaNavigation(view) {
    const personal = typeof bloomscapesPersonalRoute === 'function' ? bloomscapesPersonalRoute(view) : null;
    if (personal !== null && view !== 'detail') return personal;
    if (['moves','office','inventory-office'].includes(view)) {
        const access = getBloomscapesReclassAccess();
        if (access) return hasBloomscapesReclassScope(access);
    }
    const profile = bloomscapesAreaProfile();
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    const restricted = bloomscapesRestrictedViewGrant(view, preview);
    if (restricted !== null) return restricted;
    if (view === 'request' && typeof canOpenOrderPullQueue === 'function' && canOpenOrderPullQueue()) return true;
    if (view === 'reports' && !preview) {
        const {scope} = getActiveEvalReportsAccess();
        if (scope !== 'legacy') return scope === 'all';
    }
    if (nativeAuthSessionActive && view === 'communication') return canOpenCommunicationView('push-to-talk');
    if (!preview && !isBloomscapesAreaScoped(profile)) return null;
    if (view === 'reports') return preview
        ? previewShowsAreaView(preview,'reports') || previewShowsAreaView(preview,'eval2')
        : allowsBloomscapesAreaSubview('eval2');
    if (view === 'messages' || view === 'push-to-talk') return canOpenCommunicationView(view);
    if (preview && view === 'request' && previewShowsAreaView(preview,'queue')) return true;
    if (preview && view === 'aura') return previewShowsAreaView(preview,'aura');
    if (view === 'request-history') return allowsBloomscapesAreaSubview('historical');
    if (view === 'request' && (allowsBloomscapesAreaSubview('studio') || preview?.loans?.length)) return true;
    const target = bloomscapesAreaPrimaryRoute(view);
    const matching = BLOOMSCAPES_BUSINESS_AREAS.filter(area => area.views.some(([, , route]) => route === target));
    return matching.length ? matching.some(area => bloomscapesAreaChoices(area).some(([, , route]) => route === target)) : preview ? view === 'home' : null;
}

function bloomscapesAreaPrimaryRoute(view) {
    const aliases = {__proto__:null, office:'moves', 'inventory-office':'moves', 'sales-office':'sales',
        'field-work-studio':'production', 'production-workflow':'production', 'sales-inventory':'production',
        qc:'request', communication:'push-to-talk', 'po-management':'hl-order', chat:'messages'};
    return aliases[view] || view;
}

function canDisplayQuickAccessView(view = '') {
    const route = String(view || '').trim();
    if (route.startsWith('production:')) return canDisplayNavigationView('production-workflow');
    return canDisplayNavigationView(route);
}

function navigateDisplayedQuickAccessView(view = '') {
    const route = String(view || '').trim();
    if (!canDisplayQuickAccessView(route)) return false;
    if (canAccessQuickAccessView(route)) return navigateQuickAccessView(route);
    const target = QUICK_ACCESS_NESTED_ROUTES[route]?.parent || (route.startsWith('production:') ? 'production-workflow' : route);
    return switchView(target);
}

function allowsBloomscapesAreaSubview(key, required = 'VIEW_ONLY') {
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    if (preview) {
        if (['queue','requests','suspend'].includes(key) && ['eval','evaluator'].includes(preview.role)) {
            return required === 'VIEW_ONLY' && Boolean(preview.username) && bloomscapesAreaGrant(preview.area_access?.queue);
        }
        return required === 'VIEW_ONLY' && previewShowsAreaView(preview,key);
    }
    const profile = bloomscapesAreaProfile();
    if (!isBloomscapesAreaScoped(profile)) return true;
    const level = profile?.area_access?.[key];
    return level === 'FULL_EDIT' || required === 'VIEW_ONLY' && level === 'VIEW_ONLY';
}

function canShowBloomscapesHomeTile(view) {
    const personal = typeof bloomscapesPersonalRoute === 'function' ? bloomscapesPersonalRoute(view) : null;
    if (personal !== null) return personal;
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    if (view === 'field-work-consolidation') return canViewFieldWorkConsolidation();
    if (view === 'studio') return preview ? previewShowsAreaView(preview, 'studio') : canUseBloomscapesWorkStudio();
    if (view === 'production-schedule') return false;
    if (view === 'reports' && !preview && getActiveEvalReportsAccess().scope === 'legacy') {
        return bloomscapesRestrictedViewGrant(view) !== false && canViewManagerEvalReports2();
    }
    if (['borrowed-work','time-cards'].includes(view)) return canOpenBloomscapesHomeLeadership(view,preview);
    const route = view === 'inventory-office' ? 'moves' : view === 'walkie' ? 'push-to-talk' : view;
    return canDisplayNavigationView(route) && (preview || canAccessView(route));
}

function syncBloomscapesHomeTileVisibility(grid) {
    if (typeof syncFieldWorkConsolidationVisibility==='function') syncFieldWorkConsolidationVisibility();
    if (!nativeAuthSessionActive || !grid) return;
    const schedule = document.getElementById('studio-production-schedule');
    if (schedule) schedule.hidden = !bloomscapesAreaChoices(BLOOMSCAPES_BUSINESS_AREAS[1])
        .some(([key])=>key === 'production-schedule') || !canAccessView('managers');
    grid.querySelector('[data-home-account-navigation]')?.remove();
    let visibleCount = 0;
    for (const tile of grid.querySelectorAll('[data-home-module-view]')) {
        const visible = Boolean(canShowBloomscapesHomeTile(tile.dataset.homeModuleView));
        tile.hidden = !visible;
        tile.classList.toggle('hidden', !visible);
        tile.setAttribute('aria-hidden', String(!visible));
        if (visible) visibleCount += 1;
    }
    synchronizeHistoricalArchiveLens(previewArchiveLensKey());
    grid.dataset.authorizedModuleCount = String(visibleCount);
    grid.dataset.renderedModuleCount = String(visibleCount);
    const drawerStudio = queryBloomscapesStaticBody('side-drawer','#drawer-field-work-studio-btn');
    if (drawerStudio) drawerStudio.hidden = !canShowBloomscapesHomeTile('studio');
}

let historicalArchiveLensKey = '';

function previewArchiveLensKey() {
    return typeof borrowedHelpPreview === 'function' ? borrowedHelpPreview()?.id || '' : '';
}

function synchronizeHistoricalArchiveLens(key) {
    if (historicalArchiveLensKey === key) return;
    historicalArchiveLensKey = key;
    syncRequestSalesImpactEntrypoints();
    syncRequestTabButtons();
    if (!['historical-requests','request-history'].includes(getCurrentVisibleViewId())) return;
    destroyHistoricalRequestsIsland();
    void ensureHistoricalRequestsIsland();
}

function canReadBloomscapesSuspendApprovals() {
    if (isBloomscapesAreaScoped()) return false;
    return canonicalFeaturePermission('can_access_que') !== false;
}

function bloomscapesAreaManagerKey(tab) {
    const keys = {
        'eval-reports-2':'eval2', 'production-schedule':'production-schedule',
        'table-management':'tables', 'assigned-items-export':'assigned-items',
        'hr-command':'hr', 'runtime-watchdog':'watchdog'
    };
    return keys[tab] || 'tables';
}
