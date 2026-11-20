const WATCHDOG_RETRY_MS = 300000;
let watchdogReportInFlight = false;
let watchdogTransportBackoff = { owner: '', failures: 0, retryNotBefore: 0 };

function watchdogSessionError(code) {
    return Object.assign(new Error(code), { code });
}

function visibleWatchdogSession() {
    return document.visibilityState === 'visible' && navigator.onLine !== false;
}

function watchdogNativeOwner(username) {
    const current = String(currentUser || '').trim().toLowerCase();
    const profileId = String(nativeAuthProfile?.id || '');
    if (!nativeAuthSessionActive || !profileId || username !== current || nativeAuthSessionUserId !== profileId) return '';
    return JSON.stringify([username, profileId, nativeAuthRecoveryEpoch]);
}

async function sendNativeWatchdogReport(event, headers) {
    const transportEvent = window.GncRuntimeWatchdog.toTransportEvent?.(event) || event;
    const response = await fetchWithTimeout(SUPABASE_URL + '/rest/v1/rpc/record_bloomscapes_watchdog_event', {
        method: 'POST',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event: transportEvent })
    }, 5000, 'Runtime watchdog telemetry');
    if (!response.ok) throw watchdogSessionError('WATCHDOG_REPORT_HTTP_' + response.status);
    const receipt = await response.json();
    if (receipt?.ok !== true) throw watchdogSessionError('WATCHDOG_REPORT_UNCONFIRMED');
    return receipt;
}

async function reportWatchdogEvent(username, event) {
    if (!visibleWatchdogSession()) throw watchdogSessionError('WATCHDOG_REPORT_PAUSED');
    const owner = watchdogNativeOwner(username);
    if (!owner) throw watchdogSessionError('WATCHDOG_SESSION_NOT_READY');
    if (watchdogReportInFlight) throw watchdogSessionError('WATCHDOG_REPORT_IN_FLIGHT');
    if (watchdogTransportBackoff.owner !== owner) watchdogTransportBackoff = { owner, failures: 0, retryNotBefore: 0 };
    const backoff = watchdogTransportBackoff;
    if (Date.now() < backoff.retryNotBefore) throw watchdogSessionError('WATCHDOG_REPORT_BACKOFF');
    watchdogReportInFlight = true;
    try {
        const headers = await getNativeAuthRequestHeaders();
        if (watchdogNativeOwner(username) !== owner || !/^Bearer\s+\S+$/i.test(String(headers?.Authorization || ''))) {
            throw watchdogSessionError('WATCHDOG_SESSION_CHANGED');
        }
        if (!visibleWatchdogSession()) throw watchdogSessionError('WATCHDOG_REPORT_PAUSED');
        const receipt = await deliverWatchdogReport(event, headers, backoff);
        if (watchdogNativeOwner(username) !== owner) throw watchdogSessionError('WATCHDOG_SESSION_CHANGED');
        return receipt;
    } finally {
        watchdogReportInFlight = false;
    }
}

async function deliverWatchdogReport(event, headers, backoff) {
    try {
        const receipt = await sendNativeWatchdogReport(event, headers);
        backoff.failures = 0;
        backoff.retryNotBefore = 0;
        return receipt;
    } catch (error) {
        backoff.failures = Math.min(backoff.failures + 1, 3);
        backoff.retryNotBefore = Date.now() + WATCHDOG_RETRY_MS * 2 ** (backoff.failures - 1);
        throw error;
    }
}

function configureRuntimeWatchdogForCurrentSession() {
    runAfterShellInteractive(syncRuntimeWatchdogHeaderVisibility, 0);
    const username = String(currentUser || '').trim().toLowerCase();
    const role = String(currentRole || '').trim();
    if (!username || !role || typeof window.GncRuntimeWatchdog?.configure !== 'function') return false;
    window.GncRuntimeWatchdog.configure({
        memoryOnly: true,
        durableRuntimeErrors: true,
        getAvPhotoAudit: () => getAvCrossSeasonPhotoAudit(),
        recoverAvPhotoScope() {
            avResolvedBaseStateKey = '';
            avSharedFilteredRowsCacheKey = '';
            scheduleAVRender(0);
        },
        getExcelFilterAudit: () => getInventoryExcelParityAudit(),
        recoverExcelFilters() {
            for (const scope of getInventoryExcelState.cache?.scopes?.keys() || []) mountInventoryExcelFilters(scope);
        },
        filenameOrderValid: () => dashboardFilenameTimestamp('x-20200020261105202001.xlsx') === '20261105202000'
            && dashboardFilenameTimestamp('x-06383320261105063834.xlsx') > dashboardFilenameTimestamp('x-14383320261104143833.xlsx'),
        recoverFilenameOrder: () => refreshDashboardSyncMetadata(),
        recoverDocks() {
            if (getCurrentVisibleViewId() === 'docks') renderDocks();
        },
        getDocksSuspendAudit: () => getDocksSuspendSyncAudit(),
        getQueueAudit: root => getWatchdogQueueAudit(root),
        queueAtRoot: () => requestViewLevel === 0,
        recountQueue: paintFooterRequestBadgeOnly,
        recoverRead: () => queueVisibleDatasetCatchup(0),
        username,
        role,
        getSubModule: () => getCurrentVisibleViewId() === 'managers' ? activeHomeTab : '',
        reportEvent: event => reportWatchdogEvent(username, event)
    });
    return true;
}
