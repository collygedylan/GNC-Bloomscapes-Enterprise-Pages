async function fetchLoginUser(username, password) {
    startGlobalProgress();
    try {
        const user = normalizeNativeAuthAlias(username).split('@')[0].replace(/^ben_harvison$/, 'ben_harveson');
        const code = String(password || '').trim();
        const saved = await getMatchingSavedSignIn(user, code);
        if (saved) return saved;
        if (navigator.onLine === false) return unavailableSignIn();
        return await (window.GncLoginTrace?.measure('remote-login', () => fetchRemoteLoginUser(user, code)) ?? fetchRemoteLoginUser(user, code));
    } catch {
        return unavailableSignIn();
    } finally {
        stopGlobalProgress();
    }
}

async function getMatchingSavedSignIn(user, code) {
    const access = window.GncUserAccessControl?.getSelfState?.();
    if (access?.denied === true && normalizeNativeAuthAlias(access.username).split('@')[0] === user) return null;
    const verified = await tryVerifiedLoginRecord(user, code);
    const cached = verified || await tryLocalCachedLoginRecord(user, code);
    if (!cached) return null;
    scheduleLoginCachePrefetch(cached);
    return { ok: true, user: cached, source: verified ? 'verified-cache' : 'local-cache', backgroundValidation: navigator.onLine !== false };
}

function unavailableSignIn() {
    return { ok: false, reason: 'network', error: new Error('Sign-in service is slow. Try again shortly.') };
}

let auraSessionLoad = null;

function auraSessionOwner() {
    return isAuraRouterProfileCandidate() ? String(nativeAuthProfile.id) + ':' + getSupabaseReadIdentityScope() : '';
}

function auraSessionIsCurrent(owner, ticket) {
    return ticket === auraLoadSequence && owner === auraSessionOwner();
}

function verifyAuraSessionCapabilities(access, profileId) {
    const capabilities = access.capabilities;
    if (!capabilities || String(capabilities.id || '') !== profileId
        || String(capabilities.username || '').trim().toLowerCase() !== String(nativeAuthProfile.username || '').trim().toLowerCase()
        || String(capabilities.role || '').trim().toUpperCase() !== String(nativeAuthProfile.role || '').trim().toUpperCase()) {
        throw Object.assign(new Error('AURA could not verify this account’s access.'), { status: 403, code: 'AURA_ACCESS_MISMATCH' });
    }
    return capabilities;
}

function mountVerifiedAuraWidget(module, access, profileId, owner) {
    if (typeof module?.mountAuraWidgetReact !== 'function') throw new Error('AURA React mount is incomplete.');
    let host = document.getElementById('aura-react-root');
    if (!host) {
        host = document.createElement('div');
        host.id = 'aura-react-root';
        document.body.append(host);
    }
    auraWidgetHandle = module.mountAuraWidgetReact(host, {
        userId: profileId,
        initialVoiceName: access.voiceName || 'Kore',
        voiceEngine: access.voiceEngine || 'browser',
        onVoicePreferenceChange: syncAuraVoiceSettings,
        onHandsFreePreferenceChange: syncAuraVoiceSettings,
        onReady: syncAuraVoiceSettings,
        isAuthorized: isAuraRouterWidgetAuthorized,
        requestAssistant: requestAuraQuery,
        openAssistantAction: openAuraRouterAction,
    });
    auraWidgetOwnerKey = owner;
    syncAuraVoiceSettings();
    updateFooterNavState();
    if (getCurrentVisibleViewId() === 'communication') renderCommunicationHub();
    if (getCurrentVisibleViewId() === 'managers' && activeHomeTab === 'dashboard') scheduleManagersRender(true);
}

async function loadAuraWidgetForActiveSession(owner, ticket) {
    const session = await getNativeAuthSession().catch(() => null);
    if (!auraSessionIsCurrent(owner, ticket)) return false;
    const profileId = String(session?.user?.id || '');
    if (!profileId || profileId !== nativeAuthProfile?.id) {
        disposeAuraWidget();
        return false;
    }
    try {
        const access = await callAuraLlmRouter({ mode: 'capabilities' }, { requestId: crypto.randomUUID() });
        if (!auraSessionIsCurrent(owner, ticket)) return false;
        const capabilities = verifyAuraSessionCapabilities(access, profileId);
        auraRouterCapabilities = { ...capabilities, configured: access.configured === true };
        auraRouterVerifiedProfileId = profileId;
        if (isAuraProfileCandidate()) auraVerifiedProfileId = profileId;
        const supported = ['inventory', 'history', 'drafts', 'socReserves', 'socOpenOrders'];
        if (!access.configured || !supported.some(key => capabilities[key] === true)) {
            disposeAuraRouterVoiceWidget();
            return false;
        }
        const module = await preloadAuraVoiceWidget();
        if (!auraSessionIsCurrent(owner, ticket) || !isAuraRouterWidgetAuthorized()) return false;
        if (!auraWidgetHandle) mountVerifiedAuraWidget(module, access, profileId, owner);
        return !!auraWidgetHandle;
    } catch (error) {
        if (!auraSessionIsCurrent(owner, ticket)) return false;
        if (error?.status === 403 || error?.code === 'AURA_FORBIDDEN') disposeAuraRouterVoiceWidget();
        else console.warn('AURA capability refresh deferred.', error);
        return false;
    }
}

function syncAuraWidgetForSession() {
    const owner = auraSessionOwner();
    const standby = document.getElementById('aura-standby-control');
    if (standby) {
        standby.hidden = !owner;
        standby.style.display = owner ? '' : 'none';
    }
    if (!owner) {
        if (auraWidgetHandle || auraRouterCapabilities || auraSessionLoad) disposeAuraWidget();
        return Promise.resolve(false);
    }
    if (auraWidgetHandle && auraWidgetOwnerKey === owner && isAuraRouterWidgetAuthorized()) return Promise.resolve(true);
    if (auraSessionLoad?.owner === owner && auraSessionLoad.ticket === auraLoadSequence) return auraSessionLoad.promise;
    if (auraWidgetHandle) disposeAuraWidget();
    const flight = { owner, ticket: ++auraLoadSequence, promise: null };
    flight.promise = loadAuraWidgetForActiveSession(owner, flight.ticket).finally(() => {
        if (auraSessionLoad === flight) auraSessionLoad = null;
    });
    auraSessionLoad = flight;
    return flight.promise;
}

function syncAuraAfterCanonicalAccess(detail) {
    if (detail?.reason !== 'self-settled') return;
    const self = detail.self;
    if (self?.denied || (self?.verified && self.profile?.id === nativeAuthProfile?.id
        && self.profile?.username === nativeAuthProfile?.username)) void syncAuraWidgetForSession();
}

function verifiedNativeLoginResult(result) {
    const bridge = ensureNativeAppSessionBridge(true);
    void bridge.catch(error => reportHandledRuntimeIssue('session-bridge',error?.message || 'Bridge unavailable'));
    const cached = readPersistedAppSessionRecord();
    return {
        ok: true,
        user: result.user,
        source: 'native-auth',
        session: cached?.displayProfileId === result.profile.id ? cached : null,
        nativeSession: result.session,
        homeSyncMetadata: null,
        mustChangePassword: result.mustChangePassword === true
    };
}
