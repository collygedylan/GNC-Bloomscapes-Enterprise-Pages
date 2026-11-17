async function requestInventoryRead(operation, params = {}, options = {}) {
    if (options.signal?.aborted) throw Object.assign(new Error('Inventory read cancelled.'), { code: 'REQUEST_ABORTED' });
    const safeOperation = String(operation || '').trim();
    if (!['master_page','master_identity_batch','master_delta','po_detail','recount_queue','ncr_queue','not_on_inventory_queue','verify_row','schema_capabilities','source_freshness'].includes(safeOperation)) {
        throw new Error('Unsupported inventory read operation.');
    }
    if (productionLiveSyncCoordinator?.isSourceReadSuspended?.()) {
        throw Object.assign(new Error('Inventory source verification is paused while readiness is rechecked.'), {
            code: 'LOC_SOURCE_READ_SUSPENDED', status: 423
        });
    }
    const identityScope = getSupabaseReadIdentityScope();
    const permissionVersion = String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '');
    const input = params && typeof params === 'object' ? params : {};
    const safeParams = bloomscapesInventoryScopedReadParameters(safeOperation,input);
    const retainRead = typeof hasAuthenticatedOperationalReadIdentity === 'function' && hasAuthenticatedOperationalReadIdentity();
    const readKey = `inventory_read:${safeOperation}:${JSON.stringify(safeParams)}`;
    return runDedupeSupabaseRead(readKey, async ({ signal }) => {
        let payload;
        try {
            payload = await postAppFunctionJson(APP_API_FUNCTION_URL, {
                action: 'inventory_read', operation: safeOperation, params: safeParams
            }, {
                timeoutMs: Math.max(1000, Number(options.timeoutMs) || SUPABASE_READ_TIMEOUT_MS),
                label: String(options.label || 'Inventory data'),
                signal
            });
        } catch (error) {
            suspendProductionInventoryReadForReadiness(error);
            throw error;
        }
        if (identityScope !== getSupabaseReadIdentityScope() || permissionVersion !== String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '')) throw staleSupabaseReadScopeError();
        if (!payload || payload.ok !== true || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
            const error = new Error(String(payload?.error || payload?.message || 'Inventory data is unavailable.'));
            error.status = Number(payload?.status || 0);
            error.code = String(payload?.code || '').trim().toUpperCase();
            error.payload = payload;
            suspendProductionInventoryReadForReadiness(error);
            throw error;
        }
        const inventoryRevision = String(payload.data?.inventoryRevision || payload.data?.rows?.find(row => row?.loc_on_hand_revision || row?.LOC_ON_HAND_REVISION)?.loc_on_hand_revision || payload.data?.rows?.find(row => row?.LOC_ON_HAND_REVISION)?.LOC_ON_HAND_REVISION || '');
        if (inventoryRevision && Array.isArray(payload.data?.rows) && acceptCardLocationOnHandSourceReceipt(identityScope, permissionVersion, inventoryRevision)) {
            payload.data.rows.forEach(row => stampCardLocationOnHandReceipt(row, identityScope, permissionVersion, inventoryRevision));
        }
        return payload.data;
    }, { signal: retainRead ? null : (options.signal || null), retainOnGenerationChange: retainRead });
}

function bloomscapesInventoryScopedReadParameters(operation,input) {
    if (operation==='master_page') return bloomscapesInventoryReadParameters(input);
    if (operation==='master_identity_batch' && Array.isArray(input.queueIdentities)) {
        return {...input,queueIdentities:input.queueIdentities.map(identity=>({...identity,farmCode:getBloomscapesFarm()}))};
    }
    return input;
}
