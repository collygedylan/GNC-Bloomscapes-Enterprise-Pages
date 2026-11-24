function bloomscapesStrictRoleRoute(view, profile, preview) {
    const role = profile?.role;
    const evaluator = role === 'eval' || role === 'evaluator';
    if (role === 'rep' || role === 'sales_rep') {
        if (['home','detail','messages','push-to-talk','communication','av','bloom','historical-requests','request-history'].includes(view)) return null;
        if (view === 'docks') return bloomscapesAreaGrant(profile.area_access?.['dock-credit-vault']);
        return false;
    }
    if (evaluator && ['av','reports','manager-eval-reports','eval-reports-2'].includes(view)) return false;
    if (evaluator && ['request','queue-pending','queue-suspend'].includes(view)) {
        return preview ? Boolean(profile.username) && bloomscapesAreaGrant(profile.area_access?.queue) : true;
    }
    if (view !== 'drive' || !profile || evaluator) return null;
    if (['dylan_collyge','jd_jones','megan_kelly','mitch_kaiser','mitch_kasier'].includes(profile.username)) return null;
    if (!isBloomscapesLeadershipRole(role)) return false;
    const matrix = preview ? null : resolveUserAccessMatrix(profile.username);
    return preview ? bloomscapesAreaGrant(profile.area_access?.drive)
        : matrix?.verified === true && matrix.view_permissions?.view_drive_mode === 'Y';
}

const FULL_NAVIGATION_USERNAMES = new Set([
    'nelly_aguilar', 'dylan_collyge', 'megan_kelly', 'jd_jones',
    'mitch_kaiser', 'morgan_anderson', 'melissa_dowty'
]);
const NAVIGATION_DISPLAY_CACHE_PREFIX = 'gnc-navigation-access-display-v1:';
let navigationDisplayCache = { owner: '', row: null };

function getNavigationDisplayStorage() {
    try { return window.localStorage; }
    catch (error) { globalThis.GncRuntimeWatchdog?.capture?.(error, 'navigationDisplayStorage'); return null; }
}

function normalizeNavigationVisibilityUsername(value = '') {
    const username = String(value || '').trim().toLowerCase();
    return ['nally_aguilar', 'nellie_aguilar'].includes(username) ? 'nelly_aguilar' : username;
}

function getNavigationVisibilityIdentity(userOverride = '') {
    const username = normalizeNavigationVisibilityUsername(currentUser);
    if (!username || normalizeNavigationVisibilityUsername(userOverride || currentUser) !== username) return null;
    if (window.__agdataSessionBoundary === true || hasExplicitLogoutMarker() || hasConfirmedCurrentAccountRevocation()) return null;
    const profile = nativeAuthProfile;
    if (nativeAuthSessionActive === true && profile?.id) {
        if (profile.id !== nativeAuthSessionUserId || normalizeNavigationVisibilityUsername(profile.username) !== username) return null;
        return { id: profile.id, username, role: profile.role || currentRole || safeRole || '' };
    }
    if (!hasAuthenticatedOperationalReadIdentity()) return null;
    const record = typeof readPersistedAppSessionRecord === 'function' ? readPersistedAppSessionRecord() : null;
    const matchingRecord = record && normalizeNavigationVisibilityUsername(record.username) === username
        && typeof getCurrentAppSessionToken === 'function' && record.token === getCurrentAppSessionToken();
    const profileId = matchingRecord ? String(record.displayProfileId || '').trim() : '';
    return { id: profileId || `legacy:${username}`, username, role: currentRole || safeRole || '' };
}

function refreshNavigationDisplayCache() {
    const identity = getNavigationVisibilityIdentity();
    const owner = identity?.id ? `${identity.id}:${identity.username}` : '';
    if (!owner) { navigationDisplayCache = { owner: '', row: null }; return; }
    const storage = getNavigationDisplayStorage();
    if (navigationDisplayCache.owner !== owner) {
        navigationDisplayCache = { owner, row: readAccessDisplayCache(storage, identity, NAVIGATION_DISPLAY_CACHE_PREFIX) };
    }
    const source = getNavigationLiveDisplayRow(identity);
    const row = source ? sanitizeAccessDisplayMatrix({ ...source, username: identity.username }, identity.username) : null;
    if (!row || JSON.stringify(row) === JSON.stringify(navigationDisplayCache.row)) return;
    navigationDisplayCache.row = row;
    persistAccessDisplayCache(storage, identity, NAVIGATION_DISPLAY_CACHE_PREFIX, row);
}

function normalizeNavigationAccessRows(result) {
    if (!Array.isArray(result?.data)) return result;
    return { ...result, data: result.data.map(row => ({ ...row, username: normalizeNavigationVisibilityUsername(row.username) })) };
}

function isNavigationFlagEnabled(value) {
    return /^(?:y|yes|true|1)$/i.test(String(value ?? '').trim());
}

function resolveNavigationViewFlag(view, flags = {}) {
    if (String(view).startsWith('production:')) return resolveNavigationViewFlag('production', flags);
    if (typeof getManagerTableManagementKey === 'function' && getManagerTableManagementKey(view)) return resolveNavigationNurseryFlag(flags);
    if (view === 'request') {
        if (flags.view_que_request == null && flags.view_que_suspend == null) return resolveNavigationFlagValue(flags, 'view_que');
        return isNavigationFlagEnabled(flags.view_que_request) || isNavigationFlagEnabled(flags.view_que_suspend) ? 'Y' : 'N';
    }
    const keys = {
        'push-to-talk':'walkie', drive:'drive_mode', communication:nativeAuthSessionActive?'walkie':'comm', chat:nativeAuthSessionActive?'messages':'comm', 'department-calendar':'comm',
        'sales-inventory':'inventory', 'inventory-suggestion':'inventory', 'inv-consolidation':'inventory',
        'hl-order':'hl_order', 'sales-office':'sales_office', 'historical-requests':'historical_requests',
        'request-history':'historical_requests', tasks:'flyers', flyer:'flyers',
        reports:'eval_reports', 'manager-eval-reports':'eval_reports', 'eval-reports-2':'eval_reports_2',
        'queue-suspend':'que_suspend', 'queue-pending':'que_request',
        'table-management':'nursery_command_tables', 'production-workflow':'production',
        'bunch-note':'inventory', moves:'inventory', 'move-up':'inventory', review:'qc', reserves:'sales_office'
    };
    const key = 'view_' + (keys[view] || String(view).replaceAll('-', '_'));
    if (Object.hasOwn(flags, key)) return isNavigationFlagEnabled(flags[key]) ? 'Y' : 'N';
    if (view === 'drive' && flags.view_drive != null) return isNavigationFlagEnabled(flags.view_drive) ? 'Y' : 'N';
    const nested = QUICK_ACCESS_NESTED_ROUTES[view];
    return nested && nested.parent !== view ? resolveNavigationViewFlag(nested.parent, flags) : null;
}

function resolveNavigationNurseryFlag(flags) {
    if (flags.view_nursery_command_tables == null) return null;
    return resolveNavigationFlagValue(flags, 'view_nursery_command_tables');
}

function resolveNavigationFlagValue(flags, key) {
    if (flags[key] == null) return null;
    return isNavigationFlagEnabled(flags[key]) ? 'Y' : 'N';
}

function getRoleNavigationDisplayDefaults(identity) {
    const catalog = window.GncUserAccessControl;
    const token = String(identity.role || '').trim().toLowerCase();
    const role = catalog?.normalizeRole?.(token === 'docks' ? 'dock' : token);
    if (role === 'dock_office') return new Set(['home', 'drive', 'av', 'request', 'docks', 'office', 'communication']);
    const sourceRole = token === 'production' ? 'grower' : identity.role || 'standard';
    const access = getRoleAccessState(sourceRole, currentUser);
    if (!role && token !== 'production') return new Set(['home', 'communication']);
    const defaults = new Set(access.allowedViews);
    // Presentation mirrors the canonical role_access_baselines seed; these are not action grants.
    const driveAv = ['admin', 'manager', 'supervisor', 'sales_rep', 'evaluator', 'kier', 'csr', 'data_entry'];
    if (driveAv.includes(role)) { defaults.add('drive'); defaults.add('av'); }
    if (['counter', 'qc_supervisor', 'foreman'].includes(role)) defaults.add('drive');
    defaults.add('request');
    return defaults;
}

function getNavigationLiveDisplayRow(identity) {
    return window.GncUserAccessControl?.state?.userAccess?.find(row =>
        normalizeNavigationVisibilityUsername(row.username) === identity.username
        && (!row.profile_id || row.profile_id === identity.id));
}

function getNavigationDisplayMatrix(identity) {
    const source = getNavigationLiveDisplayRow(identity);
    if (source) return source;
    if (navigationDisplayCache.owner !== `${identity.id}:${identity.username}`) refreshNavigationDisplayCache();
    return navigationDisplayCache.owner === `${identity.id}:${identity.username}` ? navigationDisplayCache.row : null;
}

function hasFullNavigationVisibility(userOverride = '') {
    const identity = getNavigationVisibilityIdentity(userOverride);
    if (!identity || typeof borrowedHelpPreview === 'function' && borrowedHelpPreview()) return false;
    const role = String(identity.role || '').trim().toLowerCase().replace(/[-_\s]/g, '');
    return FULL_NAVIGATION_USERNAMES.has(identity.username) || ['admin', 'administrator', 'superadmin'].includes(role);
}

function canDisplayNavigationView(viewId = '', userOverride = '') {
    const view = String(viewId || '').trim();
    if (window.__agdataSessionBoundary === true || hasExplicitLogoutMarker() || hasConfirmedCurrentAccountRevocation()) return false;
    const identity = getNavigationVisibilityIdentity(userOverride);
    if (!identity || !view || ['crop-roll', 'manager-crop-roll'].includes(view)) return false;
    const areaAllowed = typeof resolveBloomscapesAreaNavigation === 'function' && (!userOverride || userOverride === currentUser)
        ? resolveBloomscapesAreaNavigation(view) : null;
    if (areaAllowed !== null) return areaAllowed && navigationPreferencesAllowed(view, true);
    if (view === 'inventory-office') return canAccessView('moves', userOverride);
    if (['messages','push-to-talk'].includes(view)) return canOpenCommunicationView(view,userOverride);
    if (isBloomscapesDockRoute(view)) return canOpenBloomscapesDocksWorkspace(view,userOverride);
    const row = window.GncUserAccessControl?.state?.userAccess?.find(value => normalizeNavigationVisibilityUsername(value.username) === identity.username);
    const staleProfile = row?.profile_id && row.profile_id !== identity.id;
    if (!staleProfile && (view === 'sales' || view === 'sales-office') && resolveBloomscapesSalesStudioView(userOverride)) return true;
    if (!staleProfile && canAccessView(view, userOverride)) return true;
    if (hasFullNavigationVisibility(userOverride)) {
        return view === 'home' || view === 'smart-moves' || ROLE_ACCESS_VIEWS.includes(view)
            || Object.prototype.hasOwnProperty.call(QUICK_ACCESS_NESTED_ROUTES, view);
    }
    if (view === 'home') return true;
    const matrix = getNavigationDisplayMatrix(identity);
    const flag = resolveNavigationViewFlag(view, matrix?.view_permissions);
    if (flag === 'N') return false;
    if (flag === 'Y') return navigationPreferencesAllowed(view, true);
    const defaults = getRoleNavigationDisplayDefaults(identity);
    const nested = QUICK_ACCESS_NESTED_ROUTES[view];
    return defaults.has(nested?.parent || view) && navigationPreferencesAllowed(view, true);
}

function getNavigationDisplayChoices() {
    const choices = [...getHomeModuleRegistry().map(module => module.view), 'tasks', 'take-back', 'weather-hold'];
    return [...new Set(choices)].filter(view => !['borrowed-work','time-cards'].includes(view) && canDisplayNavigationView(view));
}

function canShowFooterViewButton(viewId = '', access = getRoleAccessState()) {
    const targetView = String(viewId || '').trim();
    if (!targetView || ['borrowed-work','time-cards'].includes(targetView)) return false;
    if (bloomscapesRestrictedNavigationProfile() || hasFullNavigationVisibility()) return canDisplayNavigationView(targetView);
    if (isSalesShellAccess(access)) return targetView === 'sales' || (['request', 'sales-inventory'].includes(targetView) && canDisplayNavigationView(targetView));
    if (targetView === 'sales') return false;
    return canDisplayNavigationView(targetView);
}

function canUseBloomscapesWorkStudio() {
    if (!nativeAuthSessionActive) return false;
    if (nativeAuthProfile?.username==='dylan_collyge' && currentUser==='dylan_collyge') return true;
    const profile = typeof bloomscapesAreaProfile === 'function' ? bloomscapesAreaProfile() : null;
    const level = profile?.area_access?.studio;
    return level === 'FULL_EDIT' || level === 'VIEW_ONLY';
}

function applyNavigationElementVisibility(element, visible) {
    if (!element) return;
    element.classList.toggle('hidden', !visible);
    element.hidden = !visible;
    element.style.display = '';
    if (!visible) element.classList.remove('active');
}

function syncRegisteredNavigationElements(access, userOverride, fullVisibility) {
    Object.entries(ROLE_VIEW_ELEMENT_IDS).forEach(([view, ids]) => {
        const salesHidden = !fullVisibility && isSalesShellAccess(access) && !['sales', 'sales-inventory'].includes(view);
        const visible = !salesHidden && canDisplayNavigationView(view, userOverride);
        const hideEvalInventory = !fullVisibility && access?.isEval && !access.isAdmin && !canUseInvBunchNotes();
        ids.forEach(id => applyNavigationElementVisibility(document.getElementById(id),
            visible && !(hideEvalInventory && ['drawer-sales-inventory-btn', 'home-tile-sales-inventory'].includes(id))));
    });
    applyNavigationElementVisibility(document.getElementById('drawer-home-btn'), fullVisibility || !isSalesShellAccess(access));
}

function syncHomeModuleVisibility(access, userOverride, fullVisibility, grid) {
    let authorized = 0;
    getHomeModuleRegistry().forEach(module => {
        const tile = document.getElementById(`home-tile-${module.view}`);
        if (!tile) return;
        const visible = canDisplayNavigationView(module.view, userOverride) && (fullVisibility || !isSalesShellAccess(access));
        applyNavigationElementVisibility(tile, visible);
        tile.setAttribute('aria-hidden', String(!visible));
        if (visible) authorized += 1;
    });
    if (!grid) return;
    grid.dataset.authorizedModuleCount = String(authorized);
    grid.dataset.renderedModuleCount = String(grid.querySelectorAll('[data-home-module-view]:not([hidden])').length);
    syncHomeAccountNavigation(grid, authorized);
    if (nativeAuthSessionActive) mountBloomscapesCommunicationTiles(grid);
}

function syncHomeAccountNavigation(grid, authorized) {
    let tile = grid.querySelector('[data-home-account-navigation]');
    if (authorized > 0 || !getNavigationVisibilityIdentity()) { tile?.remove(); return; }
    const target = ['communication', 'request'].find(view => canDisplayNavigationView(view)) || 'home';
    const label = { communication: 'Comm', request: 'Que', home: 'Menu' }[target];
    if (!tile) {
        tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'home-module-tile';
        tile.dataset.homeAccountNavigation = 'true';
        grid.append(tile);
    }
    tile.dataset.homeModuleView = target;
    tile.innerHTML = `<i class="ph ${target === 'home' ? 'ph-list' : 'ph-chat-circle-dots'}" aria-hidden="true"></i><span>${label}</span>`;
    tile.onclick = () => target === 'home' ? setMenuOpenState(true) : switchView(target);
    grid.dataset.authorizedModuleCount = '1';
    grid.dataset.renderedModuleCount = '1';
}

function syncNavigationDisplayStatus(host, message = '') {
    if (!host) return;
    let status = host.querySelector(':scope > [data-navigation-display-status]');
    if (!message) { status?.remove(); return; }
    if (!status) {
        status = document.createElement('p');
        status.dataset.navigationDisplayStatus = 'true';
        status.setAttribute('role', 'status');
        host.append(status);
    }
    status.textContent = message;
}

function syncInitialHomeNavigationVisibility(access, grid) {
    syncHomeModuleVisibility(access, '', hasFullNavigationVisibility(), grid);
}

function syncNavigationVisibilityUi(access, userOverride, grid) {
    const fullVisibility = hasFullNavigationVisibility(userOverride);
    syncRegisteredNavigationElements(access, userOverride, fullVisibility);
    syncHomeModuleVisibility(access, userOverride, fullVisibility, grid);
    document.querySelectorAll('#side-drawer [data-drawer-view]').forEach(element =>
        applyNavigationElementVisibility(element, canDisplayNavigationView(element.dataset.drawerView, userOverride)));
    applyNavigationElementVisibility(document.getElementById('drawer-bloom-picker-btn'), canDisplayNavigationView('bloom', userOverride));
    if (typeof syncRequestSalesImpactOwnership === 'function') syncRequestSalesImpactOwnership();
    scheduleHomeDashboardFitSettle('role-access-ui');
}

const bloomscapesDormantBodies = new WeakMap();
const bloomscapesDormantBodyIds = [
    'view-detail', 'view-advertisement', 'view-sales-inventory',
    'view-hours', 'view-reports', 'view-sales', 'view-smart-moves', 'view-qc', 'view-reserves',
    'view-hl-order', 'view-take-back', 'view-low-stock', 'view-production', 'view-inventory-suggestion',
    'view-inv-consolidation', 'view-weather-hold', 'view-shear-list', 'view-disease-pest',
    'view-office', 'view-po-management', 'view-sales-office', 'view-moves', 'view-review', 'view-move-up',
    'view-grower', 'view-pest-management', 'view-communication', 'view-messages', 'view-push-to-talk', 'view-managers', 'view-tasks',
    'view-docks', 'view-request',
    'bloom-picker-modal', 'eval-task-modal', 'hold-release-modal', 'request-rep-modal',
    'flyer-assignee-modal', 'pull-clown-tape-side-modal',
    'assign-modal', 'shear-list-modal', 'side-drawer',
    'inventory-edit-request-modal', 'bloom-email-purpose-modal', 'grouped-bloom-ncr-recipient-modal', 'bloom-action-row-form-modal',
    'dock-info-modal', 'dock-mistake-modal', 'ncr-email-modal', 'ncr-rep-outreach-modal', 'sales-office-av-modal'
];

const bloomscapesScopedProjectionHosts = [
    'reports-content','smart-moves-intelligence-panel','reserves-content','hl-order-content','take-back-content',
    'low-stock-content','inv-consolidation-content','weather-hold-content','shear-list-content','po-management-content',
    'sales-office-content','moves-content','review-content','move-up-content','grower-content','pest-management-content',
    'managers-content','task-content','docks-content','request-content',
    'production-inventory-counting-content','production-inventory-84rd-content',
    'advertisement-flyer-folders','advertisement-flyer-rows','advertisement-recipient-list'
];
const bloomscapesScopedProjectionSelector = bloomscapesScopedProjectionHosts.map(id=>'#'+id).join(',');

function bloomscapesStaticBodyScope() {
    const identity = typeof getSupabaseReadIdentityScope === 'function' ? getSupabaseReadIdentityScope() : '';
    const permission = typeof appAccessSnapshotState === 'undefined' ? '' : appAccessSnapshotState.snapshot?.dataPermissionVersion || '';
    return JSON.stringify([identity,permission]);
}

function queryBloomscapesStaticBody(id,selector) {
    const root = document.getElementById(id);
    if (!root) return null;
    return root.querySelector(selector) || bloomscapesDormantBodies.get(root)?.fragment.querySelector(selector) || null;
}

function resetBloomscapesStaticBodyScope(root) {
    if (['view-push-to-talk','view-messages'].includes(root.id)) root.replaceChildren();
    root.querySelectorAll(bloomscapesScopedProjectionSelector).forEach(host=>{
        if (typeof setContainerHtml==='function') setContainerHtml(host,'');
        else {delete host.dataset.renderSignature;host.replaceChildren();}
    });
    root.querySelectorAll('input, textarea, select').forEach(control=>{
        if (control.tagName==='SELECT') control.selectedIndex = 0;
        else control.value = control.type==='file' ? '' : control.defaultValue;
        if (control.type==='checkbox' || control.type==='radio') control.checked = control.defaultChecked;
    });
    const viewId = root.id.startsWith('view-') ? root.id.slice(5) : '';
    if (viewId && typeof markViewDirty === 'function') markViewDirty(viewId);
}

function mountBloomscapesStaticBody(id,reset=false) {
    const root = document.getElementById(id);
    const body = root && bloomscapesDormantBodies.get(root);
    if (body) {
        root.append(body.fragment);
        bloomscapesDormantBodies.delete(root);
        if (reset || body.scope!==bloomscapesStaticBodyScope()) resetBloomscapesStaticBodyScope(root);
        if (id==='view-sales' && typeof syncRequestSalesImpactOwnership === 'function') syncRequestSalesImpactOwnership();
    }
    return root;
}

function detachBloomscapesStaticBody(id,scope=bloomscapesStaticBodyScope()) {
    const root = document.getElementById(id);
    if (!root?.firstChild || bloomscapesDormantBodies.has(root)) return;
    const inactive = id==='side-drawer' ? !root.classList.contains('open') : root.classList.contains('hidden');
    if (!inactive) return;
    restoreBloomscapesDormantHeaderSearch(root);
    if (root.contains(document.activeElement)) document.activeElement.blur();
    const body = document.createDocumentFragment();
    body.append(...root.childNodes);
    bloomscapesDormantBodies.set(root,{fragment:body,scope});
    if (['view-advertisement','view-sales-inventory'].includes(id) && typeof markViewDirty === 'function') markViewDirty(id.slice(5));
}

function restoreBloomscapesDormantHeaderSearch(root) {
    const slot = document.getElementById('global-header-search-slot');
    const container = slot?.querySelector('[data-global-header-mounted="true"]');
    if (!container?.id || typeof restoreGlobalHeaderSearchContainers !== 'function') return;
    const ownsSearch = Array.from(root.querySelectorAll('[data-header-search-placeholder]'))
        .some(placeholder=>placeholder.dataset.headerSearchPlaceholder===container.id);
    if (ownsSearch) restoreGlobalHeaderSearchContainers();
}

function detachInactiveBloomscapesStaticBodies() {
    const scope = bloomscapesStaticBodyScope();
    for (const id of bloomscapesDormantBodyIds) detachBloomscapesStaticBody(id,scope);
}

function restoreBloomscapesStaticBodiesForScopeReset() {
    for (const id of bloomscapesDormantBodyIds) mountBloomscapesStaticBody(id,true);
    document.querySelectorAll('#view-detail [id^="det-"][id$="-content"]').forEach(panel=>mountBloomscapesStaticBody(panel.id,true));
}

function mountBloomscapesDetailTabBody(activeId, panelIds) {
    const target = mountBloomscapesStaticBody(activeId);
    target?.classList.remove('hidden');
    for (const id of panelIds) {
        if (id===activeId) continue;
        const panel = document.getElementById(id);
        panel?.classList.add('hidden');
        if (id==='det-overview-content') document.getElementById('detail-overview-fields-list')?.replaceChildren();
        if (panel && canDetachInactiveBloomscapesDetailBody(panel)) {
            detachBloomscapesStaticBody(id);
        }
    }
}

function canDetachInactiveBloomscapesDetailBody(panel) {
    const tab = panel.id.replace(/^det-|-content$/g,'');
    const button = document.getElementById('dtab-'+tab);
    if (button?.classList.contains('hidden')) return true;
    return !panel.querySelector('form,input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}
