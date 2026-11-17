const MANAGER_APPROVAL_LIVE_REFRESH_MS = 300000;
let managerApprovalPoll = null;
let managerApprovalInFlight = false;

function managerApprovalPollingAllowed() {
    return document.visibilityState === 'visible' && navigator.onLine !== false
        && !!currentUser && !canUseProductionLiveSync() && isViewVisible('managers');
}

function managerApprovalPollContext() {
    if (!managerApprovalPollingAllowed()) return null;
    const tab = String(activeHomeTab || '').trim().toLowerCase();
    if (!isManagerApprovalTab(tab) || !canUseManagerApprovalTab(tab)) return null;
    const inventoryEdit = isInventoryChecksApprovalTaskView(tab) || isShearApprovalTaskView(tab);
    if (!inventoryEdit && useManagerReportPages('approval')) return null;
    const owner = getSupabaseReadIdentityScope();
    return { key: JSON.stringify([owner, tab]), tab, inventoryEdit };
}

function clearManagerApprovalLiveRefresh() {
    if (!managerApprovalPoll || managerApprovalPoll.timer === null) return;
    managerApprovalPoll.timer();
    managerApprovalPoll.timer = null;
}

async function refreshManagerApprovalPollingRows(context) {
    if (context.inventoryEdit) {
        const loaded = await ensureInventoryEditRequestsLoadedForShearListCatchup(true);
        if (loaded && managerApprovalPollContext()?.key === context.key) scheduleManagersRender(true);
        return loaded;
    }
    const options = { bypassThrottle: true, quiet: true };
    if (isNcrApprovalTaskView(context.tab)) return refreshNcrApprovalTaskRows(context.tab, options);
    return refreshNotOnInventoryApprovalTaskRows(context.tab, options);
}

function updateManagerApprovalPollBackoff(poll, completed) {
    if (managerApprovalPoll !== poll) return;
    poll.backoffMs = completed ? MANAGER_APPROVAL_LIVE_REFRESH_MS
        : Math.min(4 * MANAGER_APPROVAL_LIVE_REFRESH_MS, 2 * poll.backoffMs);
    poll.retryNotBefore = (completed ? poll.startedAt : Date.now()) + poll.backoffMs;
}

async function runManagerApprovalLiveRefresh() {
    const activeContext = managerApprovalPollContext();
    const poll = managerApprovalPoll;
    if (!poll || activeContext?.key !== poll.key) {
        clearManagerApprovalLiveRefresh();
        return;
    }
    const inFlight = managerApprovalInFlight;
    if (inFlight || Date.now() < poll.retryNotBefore) return;
    poll.startedAt = Date.now();
    managerApprovalInFlight = true;
    try {
        const completed = await refreshManagerApprovalPollingRows(activeContext);
        updateManagerApprovalPollBackoff(poll, completed);
    } catch (error) {
        updateManagerApprovalPollBackoff(poll, false);
        console.warn('Manager approval fallback refresh failed', error);
    } finally {
        managerApprovalInFlight = false;
    }
}

function scheduleManagerApprovalLiveRefresh() {
    const context = managerApprovalPollContext();
    if (!context) return clearManagerApprovalLiveRefresh();
    if (managerApprovalPoll?.key !== context.key) {
        clearManagerApprovalLiveRefresh();
        managerApprovalPoll = {
            key: context.key,
            backoffMs: MANAGER_APPROVAL_LIVE_REFRESH_MS,
            retryNotBefore: Date.now() + MANAGER_APPROVAL_LIVE_REFRESH_MS,
            timer: null
        };
    }
    if (managerApprovalPoll.timer === null) {
        managerApprovalPoll.timer = window.BloomscapesBatteryGovernor.schedule('manager-approval',runManagerApprovalLiveRefresh,MANAGER_APPROVAL_LIVE_REFRESH_MS);
    }
}
