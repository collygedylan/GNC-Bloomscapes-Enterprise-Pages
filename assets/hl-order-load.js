async function loadHlOrderState(force = false) {
    if (nativeAuthSessionActive) return null;
    if (!canUseHlOrder() || navigator.onLine === false) return null;
    if (hlOrderTimeoutPaused) return null;
    scheduleHlOrderRefresh();
    if (hlOrderStatePending) return hlOrderStatePending;
    if (hlOrderBusy || (!force && Date.now() - hlOrderStateLoadedAt < 15000)) return hlOrderStateData;
    const owner = captureHlOrderOwnership();
    hlOrderStateLoadedAt = Date.now();
    const pending = fetchLegacyHlOrderState(owner);
    hlOrderStatePending = pending;
    try { return await pending; }
    finally {
        if (hlOrderStatePending === pending) {
            hlOrderStatePending = null;
            // Startup can establish the permission revision during this
            // read. A discarded response must not throttle its replacement.
            hlOrderStateLoadedAt = isHlOrderOwnershipCurrent(owner) ? Date.now() : 0;
        }
    }
}

async function fetchLegacyHlOrderState(owner) {
    try {
        const result = await supabaseRpc('hl_order_state', {});
        if (isHlOrderOwnershipCurrent(owner) && canUseHlOrder()) applyHlOrderState(result, { deferRender: true });
        return result;
    } catch (error) {
        if (isHlOrderOwnershipCurrent(owner)) {
            hlOrderTimeoutPaused = isHlOrderTimeout(error);
            hlOrderStateError = getHlOrderErrorMessage(error);
            refreshHlOrderWarning();
            scheduleHlOrderDisplayRefresh();
        }
        return null;
    }
}
