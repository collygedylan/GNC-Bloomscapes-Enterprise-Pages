async function readBloomscapesMessages(farm) {
    const {client,owner}=await requireBloomscapesSession();
    const data=bloomscapesData(await client.rpc('gnc_read_messages',{p_farm:farm}));
    await requireBloomscapesOwner(owner);
    if (data?.farm!==farm || !Array.isArray(data.rows) || !['VIEW_ONLY','FULL_EDIT'].includes(data.access)) throw new Error('Messages scope was not confirmed.');
    return data;
}

async function sendBloomscapesMessage(command) {
    const {client,owner}=await requireBloomscapesSession();
    const data=bloomscapesData(await client.rpc('gnc_send_message',{p_id:command.id,p_farm:command.farm,
        p_recipient:command.recipient,p_body:command.body}));
    await requireBloomscapesOwner(owner);
    if (data?.id!==command.id || data.farm_code!==command.farm || data.sender!==currentUser) throw new Error('Message was not confirmed.');
    return data;
}

async function acknowledgeBloomscapesMessages(farm,readAt) {
    const {client,owner}=await requireBloomscapesSession();
    const data=bloomscapesData(await client.rpc('gnc_mark_messages_read',{p_farm:farm,p_read_at:readAt}));
    await requireBloomscapesOwner(owner);
    if (data!==true) throw new Error('Message read receipt was not confirmed.');
}

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
    state.generation++;state.retryAt=0;state.channel=null;state.owner='';state.rows=[];state.unread=0;state.access='HIDDEN';state.pending=null;
    if (channel) await getSupabaseBrowserClient()?.removeChannel(channel);
    syncBloomscapesHomeBadges();
}
