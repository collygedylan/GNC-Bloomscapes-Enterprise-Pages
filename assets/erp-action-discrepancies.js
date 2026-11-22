let lastActionDiscrepancyRead = null;

async function requestBloomscapesManagerTable(operation, payload, signal) {
    const farm = getBloomscapesFarm();
    const {client, owner} = await requireBloomscapesSession();
    const deadline = AbortSignal.timeout(12000);
    const request = client.rpc('gnc_manager_table_data', {p_farm:farm, p_operation:operation, p_payload:payload});
    const result = await request.abortSignal(signal ? AbortSignal.any([signal, deadline]) : deadline);
    await requireBloomscapesOwner(owner);
    if (farm !== getBloomscapesFarm() || signal?.aborted) throw staleSupabaseReadScopeError();
    return bloomscapesData(result);
}

function createActionDiscrepancySource(identity) {
    const current = () => identity === getSupabaseReadIdentityScope() && canAccessView('managers');
    if (lastActionDiscrepancyRead?.identity !== identity) lastActionDiscrepancyRead = null;
    return {
        current,
        cached: () => current() && lastActionDiscrepancyRead?.rows || [],
        remember(rows) { if (current()) lastActionDiscrepancyRead = {identity, rows}; },
        async request(operation, payload, signal) {
            if (!current()) throw Error('Reopen the table with the current account.');
            if (nativeAuthSessionActive) return requestBloomscapesManagerTable('discrepancy_' + operation, payload, signal);
            const response = await postAppFunctionJson(APP_API_FUNCTION_URL, {
                action:'manager_table_management', table:'action-discrepancy', operation, payload
            }, {signal, timeoutMs:30000, label:'Action Discrepancy'});
            if (!current() || !response?.ok || !response.data) throw Error(response?.message || 'Action Discrepancy request failed.');
            return response.data;
        }
    };
}

function validDiscrepancyId(id, previous) {
    const valid = Number.isSafeInteger(id) ? id > 0 : typeof id === 'string' && /^[0-9a-f]{84}$/.test(id);
    return valid && (previous === undefined || typeof id === typeof previous && id < previous);
}

async function readActionDiscrepancyRows(source, signal, showFirstPage) {
    let cursor;
    const rows = [];
    do {
        const payload = cursor === undefined ? {limit:100} : {limit:100, before_id:cursor};
        const page = await source.request('read', payload, signal);
        if (signal.aborted || !source.current()) throw Error('Table or account changed.');
        if (!Array.isArray(page.rows) || page.rows.length > payload.limit) throw Error('Invalid discrepancy page.');
        for (const row of page.rows) {
            if (!validDiscrepancyId(row.id, rows.at(-1)?.id)) {
                throw Error('Invalid discrepancy row order.');
            }
            rows.push(row);
        }
        if (cursor === undefined && page.next_before_id !== null) showFirstPage(page.rows);
        cursor = page.next_before_id;
        if (cursor !== null && (!page.rows.length || cursor !== page.rows.at(-1).id)) throw Error('Invalid discrepancy cursor.');
    } while (cursor !== null);
    source.remember(rows);
    return rows;
}
