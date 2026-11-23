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
        ['dock-credit-vault','Dock Credit Vault','docks'], ['suspend','Que · Suspend Tags','request'], ['borrowed-help','🤝 Borrowed Help','borrowed-work']
    ]},
    {id:'SALES', label:'Sales & Marketing', icon:'ph-handshake', views:[
        ['sales-design','Design Studio','sales'], ['sales-flyer','Flyer Folders','sales'],
        ['sales-history','Flyer History Archive','sales'], ['sales-rep','Sales Rep Vault','sales'],
        ['sales-archive','Inquiry PDF Vault','sales'], ['requests','Que · Requests','request'],
        ['historical','Historical Archive','historical-requests']
    ]},
    {id:'ADMIN', label:'Management, HR & Communications', icon:'ph-users-three', views:[
        ['tables','Table Management','managers'], ['hr','HR & Labor','managers'], ['time-cards','Timecards','time-cards'],
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
    if (!['manager','supervisor'].includes(String(profile?.role || nativeAuthProfile?.role).toLowerCase())) return false;
    return !profile || Array.isArray(profile.area_scopes);
}

function filterBloomscapesAreaViews(area, profile, scoped, baseline) {
    if (scoped && !profile?.area_scopes?.includes(area.id)) return [];
    return area.views.filter(([key,,view]) => scoped
        ? allowedScopedAreaChoice(profile,key,view,baseline)
        : baseline(key, view));
}

function allowedScopedAreaChoice(profile,key,view,baseline) {
    if (key === 'borrowed-help') return baseline(key,view);
    const level = profile.area_access?.[key === 'docks-issues' ? 'docks' : key];
    return level === 'VIEW_ONLY' || level === 'FULL_EDIT';
}

function bloomscapesAreaChoices(area) {
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    if (preview) return area.views.filter(([key])=>previewShowsAreaView(preview,key));
    if (isBloomscapesAreaOwner()) return area.views;
    const profile = bloomscapesAreaProfile();
    return filterBloomscapesAreaViews(area, profile, isBloomscapesAreaScoped(profile), canUseBloomscapesAreaView);
}

function isBloomscapesAreaOwner() {
    return nativeAuthSessionActive && nativeAuthProfile?.username === 'dylan_collyge'
        && currentUser === nativeAuthProfile.username && nativeAuthProfile.role === 'super-admin';
}

function canUseBloomscapesAreaView(key, view) {
    if (key === 'borrowed-help') return canOpenBloomscapesDocksWorkspace(view)
        && ['manager','supervisor','admin','super-admin'].includes(nativeAuthProfile?.role);
    if (key === 'docks-issues') return canOpenBloomscapesDocksWorkspace(view);
    if (key === 'studio') return canUseBloomscapesWorkStudio();
    if (key === 'eval2') return canViewManagerEvalReports2();
    if (key === 'watchdog') return canAccessView(view) && ['dylan_collyge','jd_jones','megan_kelly'].includes(currentUser);
    if (key === 'tables') return canAccessView(view) && getManagersToolAccess().canViewTableManagement;
    if (key === 'assigned-items') return canAccessView(view) && getManagersToolAccess().canViewAssignedItemsExport;
    if (key === 'hr') return canAccessView(view) && getManagersToolAccess().canViewHrCommand;
    if (key === 'production-schedule') return canAccessView(view) && getManagersToolAccess().canViewProductionSchedule;
    if (key === 'suspend' || key === 'requests') {
        const category = key === 'suspend' ? 'suspend-tag' : 'pending';
        return canAccessView(view) && bloomscapesJobBoardCategories().some(([tab]) => tab === category);
    }
    return canAccessView(view);
}

function resolveBloomscapesAreaNavigation(view) {
    const profile = bloomscapesAreaProfile();
    const preview = typeof borrowedHelpPreview === 'function' && borrowedHelpPreview();
    if (!preview && view === 'borrowed-work' && typeof canOpenBloomscapesDocksWorkspace === 'function') {
        return canOpenBloomscapesDocksWorkspace(view);
    }
    if (!preview && view === 'request' && ['crew','eval','qc','rep'].includes(nativeAuthProfile?.role)
        && typeof canOpenBloomscapesDocksWorkspace === 'function' && canOpenBloomscapesDocksWorkspace('borrowed-work')) return true;
    if (!preview && !isBloomscapesAreaScoped(profile)) return null;
    if (preview && view === 'borrowed-work') return preview.borrowed || preview.loans?.length > 0;
    if (view === 'reports') return allowsBloomscapesAreaSubview('eval2');
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
    if (preview) return required === 'VIEW_ONLY' && previewShowsAreaView(preview,key);
    const profile = bloomscapesAreaProfile();
    if (!isBloomscapesAreaScoped(profile)) return true;
    const level = profile?.area_access?.[key];
    return level === 'FULL_EDIT' || required === 'VIEW_ONLY' && level === 'VIEW_ONLY';
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
