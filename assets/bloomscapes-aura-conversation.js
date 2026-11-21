const AURA_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxKeOdEy-yg0pOF7qN7UznPXoRIwXIQuvhh0KOaVy5tD1QE9e9zJ6xgmGQg2ml8GLTmsw/exec';
const auraPanelSessions = new WeakMap();

function auraCloudPanelState() {
    const panel = document.querySelector('#aura-react-root .aura-panel');
    if (!panel) return null;
    const existing = auraPanelSessions.get(panel);
    if (existing) return existing;
    panel.id = 'view-aura';
    const badge = document.createElement('small');
    badge.setAttribute('role', 'status');
    badge.textContent = '🟡 SQL Fallback';
    panel.querySelector('.aura-title').after(badge);
    const state = {badge, history: []};
    auraPanelSessions.set(panel, state);
    return state;
}

function auraSupplementalContext(question) {
    if (/weather|gdd|degree.days/i.test(question) && canUseWeatherHoldRiskTools()) {
        return {station: 'park_hill_ok', daily: weatherHoldState.dailyWeatherRows.slice(0, 7)};
    }
    if (!/\bPOs?\b|purchase order/i.test(question) || !canAccessView('po-management')) return {};
    const words = question.toLowerCase().match(/[\w.-]+/g) || [];
    const rows = [];
    const deadline = performance.now() + 8;
    for (const row of poManagementState.rows) {
        if (performance.now() >= deadline || rows.length >= 8) break;
        const values = [row.itemcode, row.commonname, row.locationcode].map(value => String(value || '').toLowerCase());
        if (words.some(word => values.includes(word))) rows.push({itemcode: row.itemcode, name: row.commonname,
            location: row.locationcode, ordered: row.total_quantity_ordered});
    }
    return {partialPurchaseOrderSample: rows};
}

async function auraScopedRpc(name, body, headers, signal) {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST', headers, body: JSON.stringify(body), signal
    });
    if (!response.ok) throw Object.assign(new Error('AURA could not verify its data source.'), {status: response.status});
    return response.json();
}

async function auraCloudAnswer(body, state, sql, headers, signal) {
    const payload = {action: 'AURA_GEMINI_QUERY', app_id: 'gnc-bloomscapes-enterprise',
        username: normalizeNativeAuthAlias(nativeAuthProfile?.username).split('@')[0], farm_code: sql.source.filters?.farm || 'ALL',
        query: body.text, authorization: headers.Authorization,
        history: state?.history || [], context_snapshot: {source: sql.source, summary: sql.reply, ...auraSupplementalContext(body.text)}};
    if (sql.data) payload.context_snapshot.records = sql.data.rows.slice(0, 8);
    if (sql.source.dataset === 'inventory') payload.context_snapshot.inventorySample = auraInventorySample(sql.data?.rows);
    const encoded = JSON.stringify(payload);
    if (new TextEncoder().encode(encoded).length > 24576 || navigator.onLine === false) return null;
    try {
        const response = await fetch(AURA_SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
            credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', body: encoded, signal});
        const reply = response.ok && await response.json();
        return reply?.ok && /^gemini-\d+(?:\.\d+)?-flash(?:-lite)?$/.test(reply.provider) && typeof reply.answer === 'string' && reply.answer.trim() ? reply : null;
    } catch (error) {
        if (signal.aborted) throw error;
        return null;
    }
}

async function callAuraLlmRouter(body, options = {}, cachedAnswer = buildAuraDeterministicInventoryAnswer) {
    const owner = getSupabaseReadIdentityScope();
    const access = body?.mode === 'capabilities';
    const authorized = access ? isAuraRouterProfileCandidate : isAuraRouterWidgetAuthorized;
    const verify = () => {
        if (!authorized() || owner !== getSupabaseReadIdentityScope()) throw new Error('AURA session changed.');
    };
    verify();
    const headers = getPassiveNativeAuthRequestHeaders();
    if (!headers?.Authorization) throw new Error('AURA requires a signed-in account.');
    const timeout = AbortSignal.timeout(body?.mode === 'command' ? 120000 : 35000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    const rpc = (name, args) => auraScopedRpc(name, args, headers, signal);
    if (access) {
        const capabilities = await rpc('gnc_bloomscapes_aura_access', {});
        verify();
        return {ok: true, configured: true, capabilities, voiceEngine: 'browser'};
    }
    const state = auraCloudPanelState();
    if (body.mode === 'create') {
        if (state) state.history = [];
        return {ok: true, conversationId: crypto.randomUUID(), revision: 0, title: 'Session conversation'};
    }
    if (body.mode !== 'command') return {ok: false, code: 'AURA_LOCAL_CONVERSATION_ONLY'};
    const sql = await auraGroundedAnswer(body.text, rpc, signal, cachedAnswer);
    verify();
    const reply = await auraCloudAnswer(body, state, sql, headers, signal);
    verify();
    signal.throwIfAborted();
    const answer = reply?.answer || sql.reply;
    if (state) {
        state.badge.textContent = reply ? '🟢 ' + reply.provider.replace('gemini-', 'Gemini ').replace('-flash', ' Flash').replace('-lite', '-Lite') + ' Live' : '🟡 SQL Fallback';
        state.history = [...state.history, {question: body.text.slice(0, 1000), answer: answer.slice(0, 1000)}].slice(-4);
    }
    return {...sql, reply: answer, speech: answer, provider: reply?.provider || 'sql', requestId: options.requestId,
        suggested_followups: reply?.suggested_followups || []};
}

function auraQuestionScope(text) {
    const farm = text.match(/\b(?:10-PH|60-HL|20-TX|40-NC)\b/i)?.[0]?.toUpperCase();
    const query = parseAuraDeterministicInventoryQuestion(text.replace(farm || '\u0000', ''));
    const dock = text.match(/\bdock\s*#?\s*(\d+)\b/i)?.[1];
    const dataset = /\breserves?\b/i.test(text) ? 'reserves' : /\bdocks?\b/i.test(text) ? 'docks'
        : /\bSOC\b/i.test(text) ? 'orders' : 'inventory';
    const filters = {farm: farm || 'ALL', dock, itemcode: query?.itemcode || undefined};
    if (dataset === 'inventory') Object.assign(filters, {name: query?.plantTerms?.join(' ') || undefined,
        size: query?.contSize || undefined, location: query?.locationCode || undefined, season: query?.season || undefined,
        salesYear: query?.salesYear || undefined, metric: query?.metric === 'onHand' ? 'ptronhand' : 'ptravailable'});
    return {dataset, filters, relevant: Boolean(query || dataset !== 'inventory' || /inventory|stock/i.test(text))};
}

async function auraSqlAnswer(question, rpc) {
    const {dataset, filters, relevant} = auraQuestionScope(question);
    const source = {kind: 'deterministic-sql', dataset, filters};
    if (!relevant) return {ok: true, source, reply: 'No matching SQL lookup is available for this question.'};
    const data = await rpc('gnc_bloomscapes_aura_read', {p_dataset: dataset, p_filters: filters});
    if (!Array.isArray(data?.rows) || !Number.isSafeInteger(data.matchedRows)) throw new Error('Invalid AURA SQL receipt.');
    const metric = dataset !== 'inventory' ? 'ordered' : filters.metric === 'ptronhand' ? 'on hand' : 'available';
    const quantity = Number.isFinite(data.quantity) ? ' · ' + data.quantity + ' ' + metric : '';
    const locations = [...new Set(data.rows.map(row => row.locationcode).filter(Boolean))].slice(0, 5);
    return {ok: true, source, data, reply: data.matchedRows + ' matching ' + dataset + ' rows' + quantity +
        (locations.length ? ' · Locations in sample: ' + locations.join(', ') : '')};
}

async function auraGroundedAnswer(question, rpc, signal, cachedAnswer) {
    try {
        return await auraSqlAnswer(question, rpc);
    } catch (error) {
        signal.throwIfAborted();
        if (error.status === 401 || error.status === 403) throw error;
        const query = parseAuraDeterministicInventoryQuestion(question);
        const cached = query && cachedAnswer(query, fullInventory, {
            source: 'cached inventory', complete: false
        });
        return cached || {ok: true, reply: 'The SQL source is unavailable for this question.',
            source: {kind: 'unavailable', complete: false}};
    }
}

function auraInventorySample(matches) {
    if (!matches?.length || !canAccessView('drive') || !Array.isArray(fullInventory)) return [];
    const ids = new Set(matches.map(row => String(row.unique_id)));
    const deadline = performance.now() + 5;
    const sample = [];
    for (const physical of fullInventory) {
        if (performance.now() >= deadline || sample.length >= 5) break;
        const id = physical.UNIQUE_ID ?? physical.unique_id;
        if (!ids.has(String(id)) || !bloomscapesFarmRowIsVisible(physical)) continue;
        const row = resolveCanonicalInventoryRow(physical);
        if (row) sample.push({id, itemcode: row.ITEMCODE ?? row.itemcode, location: row.LOCATIONCODE ?? row.locationcode,
            onHand: row.PTRONHAND ?? row.ptronhand, available: row.PTRAVAILABLE ?? row.ptravailable,
            locPhotoMatch: row.LOC_PHOTO_MATCH ?? row.loc_photo_match});
    }
    return sample;
}
