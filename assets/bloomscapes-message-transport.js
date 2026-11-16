async function connectBloomscapesMessages() {
    if (!nativeAuthSessionActive) return disconnectBloomscapesMessages();
    const state=bloomscapesMessagesState;
    const {client,owner}=await requireBloomscapesSession(),farm=getBloomscapesFarm();
    if (state.channel && (state.owner!==owner || state.farm!==farm)) await disconnectBloomscapesMessages();
    if (!state.channel) {
        state.owner=owner;state.farm=farm;
        state.channel=client.channel('bloomscapes-messages-'+owner+'-'+farm)
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'gnc_messages',filter:'farm_code=eq.'+farm},()=>{
                if (nativeAuthSessionActive && state.owner===owner && getBloomscapesFarm()===farm) void refreshBloomscapesMessages().catch(reportBloomscapesMessagesFailure);
            }).subscribe();
    }
    await refreshBloomscapesMessages();
}

async function disconnectBloomscapesMessages() {
    const state=bloomscapesMessagesState,channel=state.channel;
    state.channel=null;state.owner='';state.unread=0;
    scopeBloomscapesComm();
    if (channel) await getSupabaseBrowserClient()?.removeChannel(channel);
    syncBloomscapesHomeBadges();
}
