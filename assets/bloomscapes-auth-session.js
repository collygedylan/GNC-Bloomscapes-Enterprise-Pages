function nativeTokenHasLifetime(session) {
    return Number(session.expires_at) * 1000 > Date.now() + 15000;
}

function readCachedNativeAuthSession(allowExpired = false) {
    const session = nativeAuthSessionSnapshot;
    if (!nativeAuthSessionActive || !nativeAuthAccessToken || session?.access_token !== nativeAuthAccessToken
        || session.user?.id !== nativeAuthSessionUserId || nativeAuthProfile?.disabled_at || nativeAuthProfile?.active === false
        || (nativeAuthProfile && nativeAuthProfile.id !== nativeAuthSessionUserId)) return null;
    if (!allowExpired && !nativeTokenHasLifetime(session)) return null;
    return session;
}

async function getNativeAuthSession() {
    if (!NATIVE_AUTH_ENABLED) return null;
    const saved = readCachedNativeAuthSession(globalThis.navigator?.onLine === false);
    if (saved) return saved;
    if (nativeAuthSessionRead) return nativeAuthSessionRead;
    const epoch = nativeAuthRecoveryEpoch;
    const task = (async () => {
        const client = getSupabaseBrowserClient();
        if (!client || !client.auth) return null;
        let result;
        try {
            result = await (window.GncLoginTrace?.measure('session-read', () => client.auth.getSession()) ?? client.auth.getSession());
        } catch (error) {
            if (isTransientNativeAuthReadFailure(error)) throw nativeAuthReadRetryError(error);
            throw error;
        }
        const { data, error } = result || {};
        if (epoch !== nativeAuthRecoveryEpoch) return null;
        if (error) {
            if (isTransientNativeAuthReadFailure(error)) throw nativeAuthReadRetryError(error);
            if (isNativeAuthSessionRevoked(error)) throw error;
            return null;
        }
        if (!data?.session?.access_token || !data.session.user?.id) return null;
        if (!nativeTokenHasLifetime(data.session)) throw nativeAuthReadRetryError();
        if (nativeAuthProfile?.id && data.session.user?.id !== nativeAuthProfile.id) return null;
        nativeAuthReadRequired = true;
        nativeAuthSessionActive = true;
        nativeAuthAccessToken = String(data.session.access_token || '').trim();
        nativeAuthSessionUserId = String(data.session.user && data.session.user.id || '').trim();
        nativeAuthSessionSnapshot = data.session;
        return data.session;
    })();
    nativeAuthSessionRead = task;
    try { return await task; }
    finally { if (nativeAuthSessionRead === task) nativeAuthSessionRead = null; }
}

async function readNativeSdkAccessToken() {
    const current = readCachedNativeAuthSession();
    if (current) return current.access_token;
    const previous = readCachedNativeAuthSession(true);
    if (!previous || globalThis.navigator?.onLine === false) return null;
    const epoch = nativeAuthRecoveryEpoch;
    const fresh = await getNativeAuthSession();
    if (epoch !== nativeAuthRecoveryEpoch || fresh?.user?.id !== previous.user.id) throw nativeAuthReadRetryError();
    return readCachedNativeAuthSession()?.access_token || null;
}
