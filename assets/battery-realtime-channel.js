const batteryRealtime = { channel: null, client: null, owner: '', listeners: new Map(), pending: [], timer: null };

function stopBatteryRealtime() {
    const state = batteryRealtime;
    clearTimeout(state.timer);
    state.timer = null;
    state.pending = [];
    const channel = state.channel;
    state.channel = null;
    if (channel) void state.client.removeChannel(channel).catch(batteryRuntimeError);
    state.client?.realtime?.disconnect();
}

function flushBatteryRealtime() {
    const state = batteryRealtime;
    state.timer = null;
    const events = state.pending.splice(0);
    if (!window.BloomscapesBatteryGovernor.visible() || state.owner !== getSupabaseReadIdentityScope()) return;
    for (const entry of state.listeners.values()) entry.listener(events);
}

function queueBatteryRealtime(kind, payload) {
    if (!window.BloomscapesBatteryGovernor.visible()) return;
    batteryRealtime.pending.push({ kind, payload });
    if (batteryRealtime.timer !== null) return;
    batteryRealtime.timer = setTimeout(flushBatteryRealtime, 300);
}

function connectBatteryRealtime() {
    const state = batteryRealtime;
    if (!window.BloomscapesBatteryGovernor.visible() || !currentUser || !state.listeners.size) return;
    const owner = getSupabaseReadIdentityScope();
    if (state.channel && state.owner === owner) return;
    stopBatteryRealtime();
    state.owner = owner;
    state.client = getSupabaseBrowserClient();
    if (!state.client) return;
    state.channel = state.client.channel('bloomscapes-live');
    const channel = state.channel;
    const forward = (kind,event) => { if (state.channel === channel && state.owner === owner) queueBatteryRealtime(kind,event); };
    for (const table of ['gnc_radio_inbox', 'gnc_messages']) {
        state.channel.on('postgres_changes', { event: '*', schema: 'public', table }, event => forward(table, event));
    }
    state.channel.subscribe(status => {
        if (status === 'SUBSCRIBED') forward('connected', null);
    });
}

function subscribeBatteryRealtime(name, listener) {
    const entry = { listener };
    batteryRealtime.listeners.set(name, entry);
    connectBatteryRealtime();
    return () => {
        if (batteryRealtime.listeners.get(name) !== entry) return;
        batteryRealtime.listeners.delete(name);
        if (!batteryRealtime.listeners.size) stopBatteryRealtime();
    };
}

function pauseBloomscapesCommunicationChannels() {
    stopBatteryRealtime();
    getSupabaseBrowserClient()?.auth?.stopAutoRefresh();
}

function subscribeBatteryLiveRevisions(onReconnect) {
    const owner = getSupabaseReadIdentityScope();
    let connected = false;
    return subscribeBatteryRealtime('inventory', events => {
        if (owner !== getSupabaseReadIdentityScope()) return;
        if (events.some(event => event.kind === 'connected')) {
            if (connected) onReconnect();
            connected = true;
        }
    });
}
