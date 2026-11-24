function normalizeAppAccessSnapshot(value = null, expectedUsername = currentUser) {
    const source = Array.isArray(value) ? value.find((entry) => entry && typeof entry === 'object') : value;
    if (!source || typeof source !== 'object') return null;
    const username = getRequestCapabilityUsernameKey(firstNonEmptyValue(source.username, expectedUsername, ''));
    const expectedKey = getRequestCapabilityUsernameKey(expectedUsername);
    const contractVersion = String(firstNonEmptyValue(source.contractVersion, source.contract_version, '') || '').trim();
    const enforcementMode = String(firstNonEmptyValue(source.enforcementMode, source.enforcement_mode, '') || '').trim().toLowerCase();
    if (contractVersion !== APP_ACCESS_CONTRACT_VERSION || !username || (expectedKey && username !== expectedKey)) return null;
    if (!['audit', 'enforced'].includes(enforcementMode)) return null;
    const permissions = (Array.isArray(source.permissions) ? source.permissions : []).map((entry) => ({
        permissionKey: String(firstNonEmptyValue(entry && entry.permissionKey, entry && entry.permission_key, '') || '').trim().toLowerCase(),
        kind: String(firstNonEmptyValue(entry && entry.kind, entry && entry.permission_kind, '') || '').trim().toLowerCase(),
        moduleKey: String(firstNonEmptyValue(entry && entry.moduleKey, entry && entry.module_key, '') || '').trim().toLowerCase(),
        label: String(entry && entry.label || '').trim(),
        allowed: entry && entry.allowed === true,
        scope: String(entry && entry.scope || '').trim().toLowerCase(),
        source: String(entry && entry.source || 'default-deny').trim().toLowerCase()
    })).filter((entry) => entry.permissionKey);
    const permissionMap = Object.freeze(Object.fromEntries(permissions.map((entry) => [entry.permissionKey, Object.freeze(entry)])));
    return Object.freeze({
        contractVersion,
        enforcementMode,
        policyVersion: Number(firstNonEmptyValue(source.policyVersion, source.policy_version, 0)) || 0,
        policyRevision: Number(firstNonEmptyValue(source.policyRevision, source.policy_revision, 0)) || 0,
        dataPermissionVersion: String(firstNonEmptyValue(source.dataPermissionVersion, source.data_permission_version, '') || '').trim(),
        username,
        role: String(source.role || '').trim(),
        viewAsRoster: username === 'dylan_collyge' && source.role === 'super-admin'
            ? normalizeViewAsBootRoster(source.view_as_roster) : null,
        permissions: Object.freeze(permissions),
        permissionMap
    });
}

function appAccessIndexedKey(username,profileId) {
    return 'bloomscapes-access-v1:'+profileId+':'+username;
}

function persistAppAccessSnapshot(snapshot = null, loadedAt = Date.now()) {
    const profileId = nativeAuthProfile?.id || '';
    if (!snapshot?.username) return;
    const cached = {snapshot,loadedAt,profileId};
    try {
        localStorage.setItem(getAppAccessCacheKey(snapshot.username),JSON.stringify(cached));
    } catch { globalThis.safeIgnoreProbeError?.('persistAppAccessSnapshot'); }
    if (snapshot.viewAsRoster && typeof mountSuperAdminViewAs === 'function') mountSuperAdminViewAs();
    if (profileId) void saveCacheValue(appAccessIndexedKey(snapshot.username,profileId),cached);
}

async function hydrateIndexedAppAccess(username,profileId,isCurrentAccount) {
    if (!profileId || appAccessSnapshotState.snapshot) return;
    const cached = await loadCacheValue(appAccessIndexedKey(username,profileId));
    if (!isCurrentAccount() || !nativeAuthSessionActive || hasConfirmedCurrentAccountRevocation()
        || appAccessSnapshotState.snapshot || cached?.profileId !== profileId) return;
    const snapshot = normalizeAppAccessSnapshot(cached.snapshot,username);
    if (!snapshot || normalizeRoleAccessToken(snapshot.role) !== normalizeRoleAccessToken(currentRole)) return;
    Object.assign(appAccessSnapshotState,{snapshot,stale:true,loadedAt:Number(cached.loadedAt)||0});
    if (appAccessSnapshotState.status === 'error') appAccessSnapshotState.status = 'ready';
    if (snapshot.viewAsRoster && typeof mountSuperAdminViewAs === 'function') mountSuperAdminViewAs();
    if (typeof promoteNavigationDisplayAfterAccess === 'function') promoteNavigationDisplayAfterAccess();
}

function retainCachedAppAccessAfterFailure(cached) {
    if (hasConfirmedCurrentAccountRevocation()) return null;
    return cached || (appAccessSnapshotState.snapshot ? appAccessSnapshotState : null);
}

function normalizeViewAsBootRoster(value) {
    if (!Array.isArray(value?.users) || value.users.length>150 || !value.roles) return null;
    const users = value.users.filter(profile=>/^user:[1-9][0-9]*$/.test(profile?.id)
        && typeof profile.username === 'string' && typeof profile.label === 'string');
    return Object.freeze({users:Object.freeze(users),roles:value.roles});
}
function readCachedAppAccessSnapshot(username = currentUser) {
    const usernameKey = getRequestCapabilityUsernameKey(username);
    if (!usernameKey) return null;
    try {
        const cacheKey = getAppAccessCacheKey(usernameKey);
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        const snapshot = normalizeAppAccessSnapshot(cached?.snapshot, usernameKey);
        if (!snapshot) return null;
        const binding = resolveCachedAccessProfile(cached,snapshot,usernameKey);
        if (!binding) return null;
        if (binding.adoptedLegacyProfileBinding && !cached.profileId) retainAdoptedAccessBinding(cacheKey,cached,binding);
        return {...binding,snapshot,loadedAt:Number(cached.loadedAt || 0)||0,
            stale:cached.stale === true || binding.adoptedLegacyProfileBinding};
    } catch {
        return null;
    }
}

function resolveCachedAccessProfile(cached,snapshot,usernameKey) {
    const profileId = String(cached?.profileId || '').trim();
    const adoptedLegacyProfileBinding = cached?.adoptedLegacyProfileBinding === true;
    if (!nativeAuthSessionActive) return {profileId,adoptedLegacyProfileBinding};
    const profile = nativeAuthProfile;
    const activeProfileId = String(profile?.id || '').trim();
    const lockedUntil = profile?.locked_until ? Date.parse(profile.locked_until) : 0;
    if (!activeProfileId || String(nativeAuthSessionUserId || '').trim() !== activeProfileId
        || profile.disabled_at != null || profile.must_change_password === true
        || (profile.locked_until && (!Number.isFinite(lockedUntil) || lockedUntil > Date.now()))) return null;
    if (profileId && profileId !== activeProfileId) return null;
    if ((!profileId || adoptedLegacyProfileBinding) && !matchesLegacyAccessOwner(cached,snapshot,profile,usernameKey)) return null;
    return {profileId:activeProfileId,adoptedLegacyProfileBinding:!profileId || adoptedLegacyProfileBinding};
}

function matchesLegacyAccessOwner(cached,snapshot,profile,usernameKey) {
    const rawSnapshot = Array.isArray(cached?.snapshot)
        ? cached.snapshot.find(entry=>entry && typeof entry === 'object') : cached?.snapshot;
    const cachedUsername = getRequestCapabilityUsernameKey(rawSnapshot?.username || '');
    const profileUsername = getRequestCapabilityUsernameKey(profile.username || '');
    const currentUsername = getRequestCapabilityUsernameKey(currentUser || '');
    const snapshotRole = normalizeRoleAccessToken(snapshot?.role || '');
    return cachedUsername && cachedUsername === profileUsername && cachedUsername === usernameKey
        && cachedUsername === currentUsername && snapshotRole && snapshotRole === normalizeRoleAccessToken(profile.role || '')
        && snapshotRole === normalizeRoleAccessToken(currentRole || '');
}

function retainAdoptedAccessBinding(cacheKey,cached,binding) {
    try {
        localStorage.setItem(cacheKey,JSON.stringify({...cached,...binding,stale:true}));
    } catch (error) {
        window.GncRuntimeWatchdog?.capture?.(error,'readCachedAppAccessSnapshot');
    }
}
