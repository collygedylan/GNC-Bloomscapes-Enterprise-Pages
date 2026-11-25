function canWakeRequestQueueLiveData() {
    if (typeof isParkHillOrderPuller === 'function' && isParkHillOrderPuller()) return false;
    try {
        if (!currentUser || navigator.onLine === false || document.hidden) return false;
        const access = getRoleAccessState();
        const allowedViews = access && access.allowedViews && typeof access.allowedViews.has === 'function'
            ? access.allowedViews
            : new Set(access && access.allowedViews || []);
        return !!(canAccessView('request') || allowedViews.has('reports') || canUseRequestRepScopedAccess());
    } catch {
        return false;
    }
}

async function runRequestViewLiveSync(options = {}) {
    const navigationSeq = navTransitionSeq;
    if (typeof canUseProductionLiveSync === 'function' && canUseProductionLiveSync()) return getProductionLiveSyncCoordinator().check('request-check');
    const safeOptions = options && typeof options === 'object' ? options : {};
    if (isRequestViewReadTerminalForCurrentIdentity() && safeOptions.manualRetry !== true) return false;
    if (safeOptions.manualRetry === true) {
        clearSupabaseReadTerminalDenialsForIdentity();
        requestViewTerminalReadIdentityScope = '';
        clearRequestViewReadFailure();
    }
    if (requestViewLiveSyncInFlight) return false;
    if (!shouldRunRequestViewLiveSync(safeOptions)) {
        if (!safeOptions.once) clearRequestViewLiveSync();
        return false;
    }
    const readCooldown = requestViewReadCooldownRemaining();
    if (readCooldown > 0) {
        if (!safeOptions.once) syncRequestViewLiveSync(Math.max(readCooldown, getRequestViewLiveSyncInterval(safeOptions)), safeOptions);
        return false;
    }
    const pauseDelay = requestViewLiveSyncPausedUntil - Date.now();
    if (pauseDelay > 0) {
        if (!safeOptions.once) syncRequestViewLiveSync(pauseDelay + 120, safeOptions);
        return false;
    }
    if (!safeOptions.allowWhileInteractive && shouldDeferInteractiveBackgroundWork()) {
        if (!safeOptions.once) syncRequestViewLiveSync(INTERACTION_REFRESH_DEFER_MS, safeOptions);
        return false;
    }
    const minInterval = Math.max(0, Number(safeOptions.minIntervalMs) || 0);
    const now = Date.now();
    if (!safeOptions.force && minInterval && lastRequestViewSignatureSyncAt && (now - lastRequestViewSignatureSyncAt) < minInterval) return false;
    lastRequestViewSignatureSyncAt = now;
    requestViewLiveSyncInFlight = true;
    try {
        return await refreshBloomscapesPendingRequestState(safeOptions,navigationSeq);
    } catch (error) {
        recordRequestViewReadFailure(error);
        return false;
    } finally {
        requestViewLiveSyncInFlight = false;
        if (!safeOptions.once && !isRequestViewReadTerminalForCurrentIdentity() && shouldRunRequestViewLiveSync(safeOptions)) syncRequestViewLiveSync(getRequestViewLiveSyncInterval(safeOptions), safeOptions);
    }
}

async function refreshBloomscapesPendingRequestState(safeOptions,navigationSeq) {

    const signatureRows = await fetchActiveRequestLiveRows(REQUEST_LIVE_SIGNATURE_SELECT_FIELDS);
    if (!safeOptions.allowWhileInteractive && shouldDeferInteractiveBackgroundWork()) {
        if (!safeOptions.once) syncRequestViewLiveSync(INTERACTION_REFRESH_DEFER_MS, safeOptions);
        return false;
    }
    const nextSignature = buildRequestLiveSyncSignature(signatureRows);
    if (nextSignature === requestViewLiveSyncSignature) return refreshBloomscapesUnchangedPendingQueue(navigationSeq);
    const formattedSignatureRows = formatFetchedRows(signatureRows || [], ACTIVE_REQUEST_TABLE);
    applyRequestStatusHintsToLocalRows(formattedSignatureRows.filter((row) => hasRequestCompletionState(row) || !!row.REQ_ARCHIVED), {
        reason: 'request-signature-status-hint',
        skipRefresh: !isCurrentNavigationTransition(navigationSeq, 'request')
    });
    const rows = await fetchActiveRequestLiveRows('*', { force_fresh: true, cache: 'no-store' });
    if (!safeOptions.allowWhileInteractive && shouldDeferInteractiveBackgroundWork()) {
        if (!safeOptions.once) syncRequestViewLiveSync(INTERACTION_REFRESH_DEFER_MS, safeOptions);
        return false;
    }
    const formattedRows = buildDatasetPayload('requests', rows).requestsData;
    requestViewRetryAttempts = 0;
    clearRequestViewReadFailure();
    if (requestViewForceRefreshRetryTimer) clearTimeout(requestViewForceRefreshRetryTimer);
    requestViewForceRefreshRetryTimer = null;
    processAndLoadData({ requestsData: formattedRows });
    await refreshActiveRequestQueueSideData('request-live-sync', {
        allowWhileInteractive: true,
        minIntervalMs: REQUEST_QUEUE_SIDE_REFRESH_MIN_INTERVAL_MS
    });
    const state = getDatasetState('requests');
    state.initialLoaded = true;
    state.fullLoaded = true;
    state.lastLoadedAt = new Date().toISOString();
    requestViewLiveSyncSignature = buildRequestLiveSyncSignature(formattedRows);
    updateFooterRequestBadge();
    refreshLocalRequestViewState('request-live-sync', {
        renderVisible: isCurrentNavigationTransition(navigationSeq, 'request'),
        forceRender: true,
        forceReportsRender: isCurrentNavigationTransition(navigationSeq, 'reports'),
        preferImmediate: true,
        typingDelay: REQUEST_REALTIME_UI_DELAY_MS
    });
    touchSyncTimestamp();
    return true;
}

async function refreshBloomscapesUnchangedPendingQueue(navigationSeq) {
    requestViewRetryAttempts = 0;
    clearRequestViewReadFailure();
    const sideDataChanged = await refreshActiveRequestQueueSideData('request-live-sync-unchanged', {
        allowWhileInteractive: true,
        minIntervalMs: REQUEST_QUEUE_SIDE_REFRESH_MIN_INTERVAL_MS
    });
    updateFooterRequestBadge();
    if (sideDataChanged) {
        refreshLocalRequestViewState('request-live-sync-side-data', {
            renderVisible: isCurrentNavigationTransition(navigationSeq, 'request'),
            forceRender: true,
            preferImmediate: true,
            typingDelay: REQUEST_REALTIME_UI_DELAY_MS
        });
    }
    return true;
}

async function fetchRequestCustomerMapRows() {
    if (!hasAuthenticatedOperationalReadIdentity()) {
        throw Object.assign(new Error('Customer mappings need an authenticated session.'), {code:'DATASET_AUTH_REQUIRED'});
    }
    const identity = getSupabaseReadIdentityScope();
    const key = JSON.stringify([identity, getDatasetLoadSignature('customerRepMap')]);
    const inflight = fetchRequestCustomerMapRows.inflight || (fetchRequestCustomerMapRows.inflight = new Map());
    if (inflight.has(key)) return inflight.get(key);
    const pending = supabaseRpc('gnc_request_customer_directory', {}, {timeoutMs:20000}).then(result => {
        if (identity !== getSupabaseReadIdentityScope()) throw new Error('Request customer account changed.');
        const rows = result?.rows;
        if (!result?.complete || !Array.isArray(rows) || result.total !== rows.length
            || !rows.every(isActiveRequestCustomerMapping) || new Set(rows.map(row => row.unique_id)).size !== rows.length) {
            throw new Error('Customer mapping snapshot is incomplete.');
        }
        for (const row of rows) row.salesrep_canonical_key = String(row.salesrepid).trim().toLowerCase();
        Object.defineProperty(rows, 'mappingRevision', {value:result.revision});
        return rows;
    }).finally(() => { if (inflight.get(key) === pending) inflight.delete(key); });
    inflight.set(key, pending);
    return pending;
}

function hasVerifiedRequestRepCanonicalDirectory(entry, owner = getRequestModalLookupOwnerSignature()) {
    if (!entry || entry.owner !== owner || entry.universal === true || !Array.isArray(entry.rows)) return false;
    const canonicalKey = String(entry.salesrepCanonicalKey || entry.rows[0]?.salesrep_canonical_key || '').trim().toLowerCase();
    if (!canonicalKey) return false;
    return entry.rows.filter(row => !isRequestNaCustomerValue(getCustomerRepMapCustomerValue(row))).every(row => {
        const rowKey = String(firstNonEmptyValue(row.SALESREP_CANONICAL_KEY, row.salesrep_canonical_key, '')).trim().toLowerCase();
        return rowKey === canonicalKey;
    });
}
