function resolveTableDrivenAccessMatrix(input) {
    const {name,saved,display,roleValue,aliasPairs,yn,isSuperAdminRole,canonicalSalesRepAccess} = input;
    const sourceRole = saved?.role || roleValue || '';
    const role = String(sourceRole).replace(/[^a-z]/gi,'').toLowerCase();
    const verified = !!saved && saved.__pendingAccessWrite !== true;
    const superAdmin = verified && isSuperAdminRole(sourceRole);
    const admin = verified && ['superadmin','admin','administrator','manager'].includes(role);
    const requestRoles = ['csr','salesoffice','office','eval','evaluator'];
    const full = admin ? 'Y' : 'N', own = verified ? 'Y' : 'N';
    const result = {
        username:name,role:sourceRole,display_name:display?.display_name || name,
        make_request:own,can_make_request:own,request_all_reps:admin || verified && requestRoles.includes(role) ? 'Y' : 'N',
        view_all_requests:full,request_default_scope:admin ? 'ALL' : 'OWN',view_all_suspend:full,suspend_default_scope:'OWN',
        edit_any_row:full,can_edit_all_rows:full,
        edit_assigned_rows_only:verified && ['eval','evaluator'].includes(role) ? 'Y' : 'N',
        can_edit_assigned_items:verified && ['eval','evaluator'].includes(role) ? 'Y' : 'N',
        flyer_folder_access:verified && (admin || ['sales','salesrep','rep','csr'].includes(role)) ? 'Y' : 'N',
        can_manage_flyers:'N',create_project:own,submit_reclass:superAdmin ? 'Y' : 'N',
        complete_suspend_tag:superAdmin ? 'Y' : 'N',approve_suspend_tags:superAdmin ? 'Y' : 'N',
        manage_tables:superAdmin ? 'Y' : 'N',manage_user_access:superAdmin ? 'Y' : 'N',
        use_weather_hold_risk_tools:superAdmin ? 'Y' : 'N',use_aura_assistant:superAdmin ? 'Y' : 'N',
        sales_rep_access:{[name]:'Y'},allowed_request_reps:{[name]:'Y'},view_permissions:{},revision:0,...saved
    };
    result.can_manage_flyers = result.flyer_folder_access;
    for (const [primary,alias] of aliasPairs) {
        const flag = resolveMatrixAliasFlag(saved,primary,alias,result[primary],yn);
        result[primary] = result[alias] = flag;
    }
    result.sales_rep_access = canonicalSalesRepAccess(saved?.allowed_request_reps || result.allowed_request_reps,
        saved?.sales_rep_access || result.sales_rep_access);
    result.allowed_request_reps = {...result.sales_rep_access};
    const nursery = saved?.view_permissions?.view_nursery_command_tables ?? saved?.view_nursery_command_tables ?? (superAdmin ? 'Y' : 'N');
    result.view_nursery_command_tables = yn(nursery);
    result.view_permissions = {...result.view_permissions,view_nursery_command_tables:result.view_nursery_command_tables};
    result.verified = verified;
    return result;
}

function resolveMatrixAliasFlag(saved, primary, alias, fallback, yn) {
    const values = [saved?.[primary],saved?.[alias]].filter(value => value != null);
    if (!values.length) return fallback;
    return values.some(value => yn(value) === 'N') ? 'N' : 'Y';
}

function normalizeAccessProfile(value, {key,text,normalizeRole}) {
    const source = value && typeof value === 'object' ? value : {};
    const username = key(source.username);
    const id = text(source.id);
    if (!username || !id) return null;
    const aliases = source.salesrep_match_names || source.salesrepMatchNames;
    const names = Array.isArray(aliases) ? aliases.map(key).filter(Boolean) : [];
    const salesrepId = text(source.salesrep_id || source.salesrepId).toUpperCase();
    return {
        id, username,
        display_name: text(source.display_name || source.displayName || username),
        role: text(source.role), canonical_role: normalizeRole(source.role),
        area_scopes: Array.isArray(source.area_scopes) ? source.area_scopes.filter(area => typeof area === 'string') : null,
        area_access: source.area_access && typeof source.area_access === 'object' ? {...source.area_access} : {},
        email: text(source.email).toLowerCase(), salesrep_id: salesrepId,
        salesrep_match_names: [...new Set([...names, username, key(source.display_name), key(salesrepId)])]
    };
}

Object.assign(globalThis,{resolveTableDrivenAccessMatrix,normalizeAccessProfile});

function getBloomscapesWorkActionPermission(action) {
    if (['Consolidate','Consolidate Inventory','Whole-group Consolidation'].includes(action)) return ['consolidate-inventory'];
    if (action === 'Haul / Consolidate') return ['field-work-hauling','consolidate-inventory'];
    if (['Haul','Block Haul','Grade & Haul'].includes(action)) return ['field-work-hauling'];
    return [];
}

function sameAccessSession(left, right) {
    return !!(left && right && left.id === right.id && left.username === right.username && left.sessionKey === right.sessionKey);
}

function resolveVerifiedAccessSelf(record, identity) {
    if (!record?.verified || !identity || record.profile.username !== identity.username
        || record.sessionKey !== identity.sessionKey || !identity.legacy && record.profile.id !== identity.id) return null;
    return record;
}

function resolveAccessSelfState(input) {
    const {status,denied,error,identity} = input;
    const record = resolveVerifiedAccessSelf(input.record,identity);
    return {status,denied,verified:!!record && status === 'ready',error,
        profile:record?.profile ? {...record.profile} : null,role:record?.role || '',
        baseline:record ? {...record.baseline} : null,overrides:record ? {...record.permission_overrides} : null,
        permissions:record ? {...record.effective_permissions} : null,
        dataHydrationPolicy:record?.data_hydration_policy ? {...record.data_hydration_policy} : null,revision:record?.revision || 0};
}

Object.assign(globalThis,{sameAccessSession,resolveVerifiedAccessSelf,resolveAccessSelfState});

function reclassAccessKey(value) {
    return String(value || '').trim().toLowerCase();
}

function getBloomscapesReclassAccess() {
    if (typeof nativeAuthSessionActive === 'undefined' || !nativeAuthSessionActive) return null;
    const identity = getCanonicalAccessSessionIdentity();
    const user = reclassAccessKey(currentUser);
    const farm = getBloomscapesFarm();
    const preview = typeof borrowedHelpPreview === 'function' ? borrowedHelpPreview() : null;
    const denied = {scope:'hidden',username:'',farm,preview:Boolean(preview)};
    if (!identity?.authenticated || identity.legacy || identity.username !== user
        || identity.id !== nativeAuthProfile?.id || !getBloomscapesAllowedFarms().includes(farm)) return denied;
    if (preview) {
        if (!preview.username || !preview.farm_scopes?.includes(farm)) return denied;
        return {...denied,scope:preview.reclass_scope,username:reclassAccessKey(preview.username)};
    }
    const matrix = resolveUserAccessMatrix(user);
    if (!matrix?.verified || matrix.profile_id !== identity.id) return denied;
    return {...denied,scope:matrix.view_permissions?.reclass_scope,username:user};
}

function hasBloomscapesReclassScope(access = getBloomscapesReclassAccess()) {
    return access?.scope === 'all' || access?.scope === 'assigned';
}

function exactBloomscapesReclassOwner(row,farm) {
    const raw = row?.__reclassIdentityRaw || row;
    if (!raw || (raw.farm_code || raw.FARM_CODE || bloomscapesRowFarm(raw)) !== farm) return '';
    const code = String(raw.ITEMCODE || raw.itemcode || '').trim();
    if (!code) return '';
    const assignments = getManagerAssignedColumnState().defaultOwnersByCode;
    const assignment = assignments?.get(code.toUpperCase()) || assignments?.get(buildManagerEvalAssignmentKey(code));
    if (assignment?.farm_code !== farm || String(assignment.itemcode || '').trim() !== code) return '';
    return reclassAccessKey(assignment.effective_worker_username) || reclassAccessKey(assignment.default_owner_username);
}

function canShowBloomscapesReclassRow(row, access = getBloomscapesReclassAccess()) {
    if (!hasBloomscapesReclassScope(access) || !isArgosInventoryTransactionEligible(row)) return false;
    const raw = row.__reclassIdentityRaw || row;
    if ((raw.farm_code || raw.FARM_CODE || bloomscapesRowFarm(raw)) !== access.farm) return false;
    return access.scope === 'all' || Boolean(access.username) && exactBloomscapesReclassOwner(raw,access.farm) === access.username;
}

function filterBloomscapesPreviewInventoryRows(rows) {
    const preview = typeof borrowedHelpPreview === 'function' ? borrowedHelpPreview() : null;
    if (!preview?.username || preview.reclass_scope !== 'assigned') return rows;
    const username = reclassAccessKey(preview.username);
    const farm = getBloomscapesFarm();
    if (!preview.farm_scopes?.includes(farm)) return [];
    return rows.filter(row => exactBloomscapesReclassOwner(row,farm) === username);
}

function canAccessOperationalView(targetView, userOverride) {
    if (targetView === 'historical-requests') return (!userOverride || userOverride === currentUser) && canUseHistoricalRequests() && navigationPreferencesAllowed(targetView, true);
    if (window.SalesWorkspace?.isView(targetView)) {
        const access = getRoleAccessState('', userOverride);
        const base = access.isRepLike || access.isAdmin || canViewManagerSalesReps();
        return navigationPreferencesAllowed(targetView, base);
    }
    if (targetView === 'bunch-note') return (!userOverride || userOverride === currentUser) && canUseInvBunchNotes() && navigationPreferencesAllowed(targetView, true);
    if (targetView === 'hl-order') return (!userOverride || userOverride === currentUser) && canUseHlOrder() && navigationPreferencesAllowed(targetView, true);
    if (targetView === 'managers' && isManagerViewDeniedUser(userOverride) && !getRoleAccessState('', userOverride).isAdmin) return false;
    const canonicalFlag = { drive: 'can_access_drive_mode', av: 'can_access_av', request: 'can_access_que', managers: 'can_access_manager_tab' }[targetView];
    const canonicalAllowed = canonicalFlag ? canonicalFeaturePermission(canonicalFlag, userOverride) : null;
    if (canonicalAllowed === false) return false;
    if (canonicalAllowed === true && targetView !== 'request') return navigationPreferencesAllowed(targetView, true);
    if (targetView === 'pest-management') return isExecutiveAccessUser() && navigationPreferencesAllowed(targetView, true);
    if (targetView === 'disease-pest') return isExecutiveAccessUser() && navigationPreferencesAllowed(targetView, true);
    if (targetView === 'request') {
        const capabilities = getRequestCapabilities();
        return (canonicalAllowed === true || !!(capabilities && capabilities.canViewQueue) || canSeeEvalWorkRequestTab() || ((!userOverride || userOverride === currentUser) && canUseInvBunchNotes())) && navigationPreferencesAllowed(targetView, true);
    }
    const access = getRoleAccessState('', userOverride);
    if (['sales-inventory','inventory-suggestion','inv-consolidation'].includes(targetView)) {
        return navigationPreferencesAllowed('sales-inventory', access.allowedViews.has('sales-inventory') || ((!userOverride || userOverride === currentUser) && canUseInvBunchNotes()));
    }
    if (targetView === 'moves') return navigationPreferencesAllowed(targetView, canUseMovesModule() || access.allowedViews.has('moves'));
    return navigationPreferencesAllowed(targetView, access.allowedViews.has(targetView));
}

const bloomscapesRestrictedRoles = new Set(['eval','evaluator','crew','rep','sales_rep','csr']);
const bloomscapesLeadershipRoles = new Set(['super-admin','admin','manager','supervisor','foreman']);
const bloomscapesSharedRoutes = new Set(['home','detail','request','messages','push-to-talk','communication']);
const bloomscapesSalesRoutes = Object.freeze({
    __proto__:null, sales:['sales-design','view_sales'], 'sales-office':['sales-design','view_sales_office'],
    av:['av','view_av'], drive:['drive','view_drive_mode'], bloom:['av','view_bloom_picker'],
    'historical-requests':['historical','view_historical_requests'], 'request-history':['historical','view_historical_requests']
});
const bloomscapesEvalRoutes = Object.freeze({
    __proto__:null, drive:['drive','view_drive_mode'], av:['av','view_av'],
    reports:['reports','view_reports'], bloom:['av','view_bloom_picker']
});
const bloomscapesCrewRoutes = Object.freeze({
    __proto__:null, docks:['docks','view_docks'], 'pull-tags':['docks','view_docks'],
    production:['studio','view_production'], 'field-work-studio':['studio','view_production']
});

function isBloomscapesLeadershipRole(role) {
    return bloomscapesLeadershipRoles.has(role);
}

function canOpenBloomscapesHomeLeadership(view, preview = borrowedHelpPreview()) {
    const role = preview?.role ?? nativeAuthProfile?.role;
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id || !isBloomscapesLeadershipRole(role)) return false;
    if (!['borrowed-work','time-cards'].includes(view)) return false;
    return preview ? preview.borrowed === true : getBloomscapesAllowedFarms().includes(getBloomscapesFarm());
}

function restrictedBloomscapesRouteLevel(profile,route,preview) {
    if (!route) return false;
    const [area,flag] = route;
    if (preview || profile.role === 'eval' && profile.area_access) return bloomscapesAreaGrant(profile.area_access?.[area]);
    const matrix = resolveUserAccessMatrix(currentUser);
    return matrix?.verified === true && matrix.view_permissions?.[flag] === 'Y';
}

function bloomscapesAreaGrant(level) {
    return level === 'FULL_EDIT' || level === 'VIEW_ONLY';
}

function bloomscapesRestrictedNavigationProfile(preview = borrowedHelpPreview()) {
    if (!nativeAuthSessionActive) return null;
    const profile = preview || bloomscapesAreaProfile() || nativeAuthProfile;
    return bloomscapesRestrictedRoles.has(profile?.role) ? profile : null;
}

function bloomscapesRestrictedViewGrant(view, preview = borrowedHelpPreview()) {
    if (!nativeAuthSessionActive) return null;
    const profile = bloomscapesRestrictedNavigationProfile(preview);
    if (['borrowed-work','time-cards'].includes(view)) return canOpenBloomscapesHomeLeadership(view,preview);
    if (!profile && view === 'aura' && !preview) return window.GncUserAccessControl?.getSelfState()?.permissions?.use_aura_assistant === true
        || resolveUserAccessMatrix(currentUser)?.use_aura_assistant === 'Y';
    if (!profile || bloomscapesSharedRoutes.has(view)) return null;
    if (view === 'moves') return hasBloomscapesReclassScope();
    const routes = profile.role === 'crew' ? bloomscapesCrewRoutes
        : ['eval','evaluator'].includes(profile.role) ? bloomscapesEvalRoutes : bloomscapesSalesRoutes;
    return restrictedBloomscapesRouteLevel(profile,routes[view],preview);
}

function getActiveEvalReportsAccess() {
    if (!nativeAuthSessionActive) return {scope:'legacy'};
    const preview = borrowedHelpPreview();
    const expected = expectedEvalReportsScope(nativeAuthProfile, preview);
    if (preview && preview.role !== 'eval') return {scope:bloomscapesRestrictedRoles.has(preview.role) ? 'hidden' : 'legacy'};
    if (preview) {
        return expected === 'own' && bloomscapesAreaGrant(preview.area_access?.reports)
            ? {scope:'own', preview:preview.username} : {scope:'hidden'};
    }
    if (expected === 'hidden') return {scope:bloomscapesRestrictedRoles.has(nativeAuthProfile?.role) ? 'hidden' : 'legacy'};
    const matrix = resolveUserAccessMatrix(currentUser);
    const views = matrix?.view_permissions;
    const verified = matrix?.verified && matrix.profile_id === nativeAuthProfile?.id && currentUser === nativeAuthProfile.username;
    return {scope:verified && views?.view_reports === 'Y' && views.eval_reports_scope === expected ? expected : 'hidden'};
}

async function readEvalReportsScope(farm, preview = null) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_eval_reports_scope', {p_farm:farm,p_preview:preview}));
    await requireBloomscapesOwner(owner);
    if (receipt?.farm_code !== farm || !Array.isArray(receipt.evaluators)) throw new Error('Evaluator scope could not be verified.');
    if (preview && (receipt.scope !== 'own' || receipt.evaluators.length !== 1
        || receipt.evaluators[0].username !== preview)) throw new Error('Evaluator preview scope could not be verified.');
    return receipt;
}
