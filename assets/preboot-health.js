function createPrebootHealthReporter(env) {
    const state = {owner:'',confirmed:false,inFlight:null,attempts:0,retryAt:0};
    return async function(runtime) {
        const owner = runtime.username+':'+runtime.reportGeneration;
        if (!runtime.configured || !runtime.username || env.document.hidden
            || env.__agdataHomeReadyUser!==runtime.username) return false;
        if (state.owner!==owner) Object.assign(state,{owner,confirmed:false,inFlight:null,attempts:0,retryAt:0});
        if (state.confirmed) return true;
        if (state.inFlight) return state.inFlight;
        if (state.attempts>=3 || Date.now()<state.retryAt) return false;
        state.attempts++;
        state.inFlight = sendPrebootHealthReceipt(env,{...runtime}).then(confirmed => {
            if (state.owner===owner && runtime.username+':'+runtime.reportGeneration===owner) state.confirmed = confirmed;
            return confirmed;
        }).catch(() => {
            if (state.owner===owner) state.retryAt = Date.now()+30000*state.attempts;
            return false;
        }).finally(() => { if (state.owner===owner) state.inFlight = null; });
        return state.inFlight;
    };
}

async function sendPrebootHealthReceipt(env,runtime) {
    const client = env.getSupabaseBrowserClient?.();
    const session = await env.getNativeAuthSession?.();
    if (!client || !session?.user?.id) throw new Error('Native health session unavailable');
    const version = String(env.__APP_RELEASE_VERSION__ || '').match(/(\d+\.\d+\.\d+)/)?.[1];
    const result = await client.rpc('report_app_health_event',{
        event_name:'shell_ready',area:'home',severity:'info',sanitized_code:'SHELL_READY',
        duration_ms:0,sample_rate:1,app_build:version || null,
        metadata:{username:runtime.username,reportGeneration:runtime.reportGeneration}
    }).abortSignal(AbortSignal.timeout(8000));
    if (result.error || !result.data) throw new Error('Shell health receipt unconfirmed');
    return true;
}
