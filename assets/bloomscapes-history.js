function canUseHistoricalRequests(profile = nativeAuthProfile) {
    const username = String(profile?.username || '');
    const role = String(profile?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (role.startsWith('EVAL')) return false;
    const locked = profile?.locked_until ? Date.parse(profile.locked_until) : 0;
    return !!(nativeAuthSessionActive && profile?.id && username === String(currentUser || '')
        && !profile.disabled_at && profile.must_change_password === false
        && (!profile.locked_until || (Number.isFinite(locked) && locked <= Date.now()))
        && ((typeof getCurrentVisibleViewId === 'function' && getCurrentVisibleViewId() === 'request-history' && canAccessView('request-history'))
            || isSuperAdminRoleValue(role) || ['ADMIN', 'ADMINISTRATOR', 'REP', 'SALESREP'].includes(role)));
}

function getHistoricalRequestsOwnerKey(profile = nativeAuthProfile) {
    return JSON.stringify([profile?.id, profile?.username, profile?.role, profile?.disabled_at,
        profile?.locked_until, profile?.must_change_password, currentUser, getBloomscapesFarm(), borrowedHelpPreview()?.id,
        typeof getCurrentVisibleViewId === 'function' ? getCurrentVisibleViewId() : 'historical-requests']);
}

function destroyHistoricalRequestsIsland() {
    historicalRequestsGeneration += 1;
    historicalRequestsMount?.destroy();
    historicalRequestsMount = null;
    historicalRequestsOwner = '';
    document.getElementById('historical-requests-content')?.replaceChildren();
    document.getElementById('request-history-content')?.replaceChildren();
}

async function historicalRequestsTransport(query, signal) {
    if (!canUseHistoricalRequests()) throw new Error('Sign in with an authorized account to view Historical Requests.');
    const owner = getHistoricalRequestsOwnerKey();
    const session = await getNativeAuthSession();
    if (!session?.user?.id || session.user.id !== nativeAuthProfile?.id || owner !== getHistoricalRequestsOwnerKey()) {
        destroyHistoricalRequestsIsland();
        throw new Error('Your session changed. Sign in again to view Historical Requests.');
    }
    if (signal?.aborted) throw new Error('Historical Requests was cancelled.');
    const view = typeof getCurrentVisibleViewId === 'function' ? getCurrentVisibleViewId() : 'historical-requests';
    const response = await postAppFunctionJson(APP_API_FUNCTION_URL, {
        action: 'historical_requests_read',
        query: { ...query, view, farmCode:getBloomscapesFarm() }
    }, { timeoutMs: 15000, label: 'Historical Requests', signal });
    if (!response?.ok || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        const error = new Error(response?.error || 'Historical Requests could not load for this account.');
        error.status = Number(response?.status || 0);
        error.code = String(response?.code || '').trim().toUpperCase();
        throw error;
    }
    const data = response.data;
    if (data.farmCode!==getBloomscapesFarm() || !['all','own'].includes(data.scope)) throw new Error('Archive farm response was not confirmed.');
    if (signal?.aborted || owner !== getHistoricalRequestsOwnerKey() || !canUseHistoricalRequests()) {
        throw new Error('Historical Requests was cancelled because the account changed.');
    }
    return data;
}

function retryHistoricalRequestsIsland() {
    historicalRequestsModulePromise = null;
    historicalRequestsModule = null;
    destroyHistoricalRequestsIsland();
    void ensureHistoricalRequestsIsland();
    return false;
}

function renderHistoricalRequestArchive() {
    const host=document.getElementById('historical-request-archive');
    if (host) {host.hidden=true;host.replaceChildren();}
}

async function ensureHistoricalRequestsIsland() {
    const view = getCurrentVisibleViewId();
    const host = document.getElementById(view + '-content');
    if (!['historical-requests', 'request-history'].includes(view) || !host || !isViewVisible(view) || !canAccessView(view)) {
        destroyHistoricalRequestsIsland();
        return;
    }
    const owner = getHistoricalRequestsOwnerKey();
    const revisionKey = JSON.stringify(['master', 'soc', 'reserves', 'requests', 'requestHistory', 'customerRepMap'].map(key => getDatasetState(key).liveVerifiedRevision || ''));
    if (!document.getElementById('historical-requests-stylesheet')) {
        const stylesheet = document.createElement('link');
        stylesheet.id = 'historical-requests-stylesheet';
        stylesheet.rel = 'stylesheet';
        stylesheet.href = new URL('./assets/historical-requests.css?v=' + encodeURIComponent(APP_SHELL_BUILD), document.baseURI).href;
        stylesheet.onerror = () => stylesheet.remove();
        document.head.appendChild(stylesheet);
    }
    if (historicalRequestsMount && historicalRequestsOwner === owner && historicalRequestsModule) {
        historicalRequestsMount.update(Object.assign(historicalRequestsModule.createHistoricalRequestsBridge({ scopeKey: owner, revisionKey, role: nativeAuthProfile?.role || '', transport: historicalRequestsTransport }),{archiveOnly:true}));
        renderHistoricalRequestArchive();
        syncRequestSalesImpactEntrypoints();
        return;
    }
    destroyHistoricalRequestsIsland();
    const generation = historicalRequestsGeneration;
    host.textContent = 'Loading Historical Requests…';
    try {
        if (!historicalRequestsModulePromise) historicalRequestsModulePromise = import(new URL('./assets/historical-requests.js?v=' + encodeURIComponent(APP_SHELL_BUILD), document.baseURI).href)
            .catch(error => { historicalRequestsModulePromise = null; throw error; });
        const module = await historicalRequestsModulePromise;
        if (generation !== historicalRequestsGeneration || !host.isConnected || !isViewVisible(view)
            || owner !== getHistoricalRequestsOwnerKey() || !canAccessView(view)) return;
        historicalRequestsModule = module;
        host.replaceChildren();
        const historyHost = document.createElement('div');
        host.appendChild(historyHost);
        if (view === 'historical-requests' && canCurrentUserArchiveRequestRows()) {
            const archiveHost = document.createElement('section');
            archiveHost.id = 'historical-request-archive';
            host.prepend(archiveHost);
        }
        historicalRequestsMount = module.mountHistoricalRequests(historyHost, Object.assign(module.createHistoricalRequestsBridge({ scopeKey: owner, revisionKey, role: nativeAuthProfile?.role || '', transport: historicalRequestsTransport }),{archiveOnly:true}));
        historicalRequestsOwner = owner;
        renderHistoricalRequestArchive();
        syncRequestSalesImpactEntrypoints();
    } catch (error) {
        if (generation !== historicalRequestsGeneration || !host.isConnected) return;
        host.innerHTML = `<div role="alert">${escapeHtml(error?.message || 'Historical Requests could not load.')} <button type="button">Retry Historical Requests</button></div>`;
        host.querySelector('button')?.addEventListener('click',retryHistoricalRequestsIsland);
        syncRequestSalesImpactEntrypoints();
    }
}
