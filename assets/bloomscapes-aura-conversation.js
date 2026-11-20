function readBloomscapesLocalAuraCreation(body) {
    if (body?.mode!=='create' || !nativeAuthSessionActive || nativeAuthProfile?.username!=='dylan_collyge'
        || !isAuraRouterWidgetAuthorized()) return null;
    return {ok:true,conversationId:crypto.randomUUID(),revision:0,title:'Session conversation',
        source:{kind:'local-session',persistent:false}};
}

async function callAuraLlmRouter(body, options = {}) {
    const identity = getSupabaseReadIdentityScope();
    const accessDiscovery = body?.mode === 'capabilities';
    const authorized = () => accessDiscovery ? isAuraRouterProfileCandidate() : isAuraRouterWidgetAuthorized();
    if (!authorized()) throw Object.assign(new Error('AURA is unavailable to the active account.'), { status: 403 });
    if (typeof navigator!=='undefined' && navigator.onLine===false) {
        const draft=readBloomscapesLocalAuraCreation(body);
        if (draft) return draft;
    }
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener('abort', abort, { once: true });
    const deadlineAt = Number.isFinite(options.deadlineAt) ? Number(options.deadlineAt) : Date.now() + 35000;
    const remaining = () => Math.max(1, deadlineAt - Date.now());
    const timer = setTimeout(() => controller.abort(Object.assign(new Error('AURA command exceeded thirty-five seconds. Your conversation is still here. Retry when ready.'), { name: 'TimeoutError', code: 'AURA_DEADLINE_EXCEEDED' })), remaining());
    auraPendingRequests.add(controller);
    try {
        options.onStage?.('authentication');
        const nativeHeaders = await awaitAuraRead(() => getNativeAuthRequestHeaders(), controller.signal);
        if (!nativeHeaders?.Authorization || !authorized() || identity !== getSupabaseReadIdentityScope()) throw Object.assign(new Error('AURA session expired. Sign in again.'), { status: 401 });
        options.onStage?.('request');
        const payload = await awaitAuraRead(() => postAppFunctionJson(AURA_LLM_ROUTER_URL, body, {
            includeSession: false, nativeHeaders, timeoutMs: remaining(), requestId: options.requestId,
            label: 'AURA command', signal: controller.signal,
            idempotencyKey: `${options.requestId || 'aura'}:${body?.mode || 'command'}`
        }), controller.signal);
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!authorized() || identity !== getSupabaseReadIdentityScope()) throw Object.assign(new Error('AURA session changed.'), { status: 403 });
        if (!payload || payload.ok !== true) {
            const error = new Error(String(payload?.error?.message || payload?.error || 'AURA could not complete that request.'));
            error.status = Number(payload?.status || 0);
            error.code = String(payload?.code || '').toUpperCase();
            error.requestId = payload?.requestId || options.requestId;
            error.appContext = payload?.appContext ?? payload?.error?.appContext;
            throw error;
        }
        return payload;
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abort);
        auraPendingRequests.delete(controller);
    }
}
