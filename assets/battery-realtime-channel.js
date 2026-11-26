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
    const dockAccess = typeof canBuildPhOrderPullWork === 'function' && canBuildPhOrderPullWork();
    if (state.channel && state.owner === owner && state.dockAccess === dockAccess) return;
    stopBatteryRealtime();
    state.owner = owner;
    state.dockAccess = dockAccess;
    state.client = getSupabaseBrowserClient();
    if (!state.client) return;
    state.channel = state.client.channel('bloomscapes-live');
    const channel = state.channel;
    const forward = (kind,event) => { if (state.channel === channel && state.owner === owner) queueBatteryRealtime(kind,event); };
    for (const table of ['gnc_radio_inbox', 'gnc_messages', 'gnc_radio_queue',
        'gnc_00_core_erp_sync_status', 'gnc_live_overrides_ledger', 'gnc_inventory_master',
        'gnc_soc_orders_reserves', 'gnc_fulfillment_work', 'gnc_field_work', 'gnc_field_jobs_y_grading']) {
        state.channel.on('postgres_changes', { event: '*', schema: 'public', table }, event => forward(table, event));
    }
    if (dockAccess) {
        channel.on('postgres_changes',{event:'*',schema:'public',table:'gnc_10_ph_pull_dock_revision',filter:'warehouse=eq.10-PH'},
            event => deliverPhDockRevision(channel,owner,event.new));
    }
    state.channel.subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        forward('connected',null);
        if (dockAccess) deliverPhDockRevision(channel,owner,null);
    });
}

function deliverPhDockRevision(channel,owner,row) {
    if (batteryRealtime.channel !== channel || owner !== getSupabaseReadIdentityScope()
        || !window.BloomscapesBatteryGovernor.visible() || !canBuildPhOrderPullWork()) return;
    if (!row) return publishPhPullDockStatus('10-PH',owner);
    if (row.warehouse === '10-PH' && typeof row.order_pull_status === 'string') {
        publishPhPullDockStatus('10-PH',owner,{dock:row.dock,trip:row.trip,effective:row.order_pull_status,revision:row.revision});
    }
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
            if (connected) void window.BloomscapesBatteryGovernor.wake('realtime-reconnect');
            connected = true;
        }
        if (events.some(event => ['gnc_soc_orders_reserves', 'gnc_fulfillment_work', 'gnc_field_work', 'gnc_field_jobs_y_grading'].includes(event.kind))) onReconnect();
    });
}
