async function connectBloomscapesMessages() {
    if (!nativeAuthSessionActive) return disconnectBloomscapesMessages();
    if (!window.BloomscapesBatteryGovernor.visible()) return;
    const state=bloomscapesMessagesState;
    const {owner}=await requireBloomscapesSession(),farm=getBloomscapesFarm();
    if (state.channel && (state.owner!==owner || state.farm!==farm)) await disconnectBloomscapesMessages();
    if (!state.channel) {
        state.owner=owner;state.farm=farm;
        state.channel=subscribeBatteryRealtime('messages',events=>refreshBatteryMessages(events,owner,farm));
    }
    await refreshBloomscapesMessages();
}

async function disconnectBloomscapesMessages() {
    const state=bloomscapesMessagesState,channel=state.channel;
    state.channel=null;state.owner='';state.unread=0;
    scopeBloomscapesComm();
    if (channel) channel();
    syncBloomscapesHomeBadges();
}

function refreshBatteryMessages(events,owner,farm) {
    if (!events.some(event=>event.kind==='gnc_messages') || !nativeAuthSessionActive
        || bloomscapesMessagesState.owner!==owner || getBloomscapesFarm()!==farm) return;
    void refreshBloomscapesMessages().catch(reportBloomscapesMessagesFailure);
}
