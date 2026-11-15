const bloomscapesRadioInbox={owner:'',farm:'',calls:[],count:0,channel:null,pending:null,generation:0,audio:null};
async function refreshBloomscapesRadioInbox() {
    const {client,owner}=await requireBloomscapesSession();
    await requireBloomscapesOwner(owner);
    const farm=getBloomscapesFarm(),state=bloomscapesRadioInbox;
    if (state.owner!==owner || state.farm!==farm) {
        state.generation++;
        releaseBloomscapesRadioPlayback();
        state.owner=owner;state.farm=farm;state.calls=[];state.count=0;state.pending=null;
    }
    if (state.pending) return state.pending;
    const generation=state.generation;
    state.pending=bloomscapesRadioRpc(client,'gnc_radio_unplayed',{p_farm:farm}).then(async receipt=>{
        await requireBloomscapesOwner(owner);
        if (generation!==state.generation || state.owner!==owner || getBloomscapesFarm()!==farm) return;
        if(!Array.isArray(receipt?.calls) || !Number.isSafeInteger(receipt.count) || receipt.count<0)throw Error('Radio inbox receipt unavailable; saved calls are retained.');
        state.calls=receipt.calls;state.count=receipt.count;
        renderBloomscapesRadioInbox();
        if (bloomscapesRadioAutoPlay() && !document.hidden && !state.audio && state.calls.length) void playNextBloomscapesRadioCall();
    }).finally(()=>{if(generation===state.generation)state.pending=null;});
    return state.pending;
}
async function connectBloomscapesRadioInbox() {
    if (!nativeAuthSessionActive || !currentUser) return disconnectBloomscapesRadioInbox();
    const {client,owner}=await requireBloomscapesSession(),state=bloomscapesRadioInbox;
    if (state.channel && state.owner!==owner) await disconnectBloomscapesRadioInbox();
    await requireBloomscapesOwner(owner);
    if (!state.channel) {
        state.owner=owner;
        state.channel=client.channel('bloomscapes-radio-inbox-'+owner)
            .on('postgres_changes',{event:'*',schema:'public',table:'gnc_radio_inbox',filter:'username=eq.'+currentUser},()=>{
                void refreshBloomscapesRadioInbox().catch(reportBloomscapesRadioInboxFailure);
            }).subscribe();
    }
    await refreshBloomscapesRadioInbox();
}
async function disconnectBloomscapesRadioInbox() {
    const state=bloomscapesRadioInbox,channel=state.channel;
    state.generation++;
    releaseBloomscapesRadioPlayback();
    state.channel=null;state.owner='';state.calls=[];state.count=0;state.pending=null;
    renderBloomscapesRadioInbox();
    if (channel) await getSupabaseBrowserClient()?.removeChannel(channel);
}
async function playNextBloomscapesRadioCall() {
    const state=bloomscapesRadioInbox,call=state.calls[0];
    if (!call || state.audio || document.hidden) return;
    const {client,owner}=await requireBloomscapesSession();
    if(state.owner!==owner || state.calls[0]?.id!==call.id)return;
    const generation=state.generation;
    const audio=new Audio();state.audio=audio;
    try {
        const result=await bloomscapesRadioRpc(client,'gnc_read_radio_call',{p_id:call.id});
        if(result?.id!==call.id)throw Error('Radio call receipt does not match the selected call.');
        await requireBloomscapesOwner(owner);
        if (state.generation!==generation) return;
        const bytes=Uint8Array.from(atob(result.audio),char=>char.charCodeAt(0));
        const objectUrl=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
        audio.src=objectUrl;
        audio.onended=()=>{void finishBloomscapesRadioPlayback(audio,objectUrl,call.id,owner,generation);};
        audio.onerror=()=>{URL.revokeObjectURL(objectUrl);state.audio=null;showBloomscapesRadioMessage('Call could not play. Tap Play Next to retry.');};
        await audio.play();
        mountBloomscapesRadioAudio(audio);
    } catch (error) {
        if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        if (state.audio===audio) state.audio=null;
        showBloomscapesRadioMessage(error.name==='NotAllowedError' ? 'Tap Play Next to listen.' : error.message);
    }
}
async function finishBloomscapesRadioPlayback(audio,url,id,owner,generation) {
    URL.revokeObjectURL(url);
    const state=bloomscapesRadioInbox;
    if (state.generation!==generation || state.audio!==audio) return;
    state.audio=null;
    try {
        const session=await requireBloomscapesSession();
        if(session.owner!==owner) return;
        const receipt=await bloomscapesRadioRpc(session.client,'gnc_radio_played',{p_id:id});
        if(receipt.id!==id || receipt.played!==true) throw Error('Playback receipt unavailable; the call is retained.');
        if(state.generation!==generation)return;
        await refreshBloomscapesRadioInbox();
    } catch(error) { showBloomscapesRadioMessage(error.message); }
}
function reportBloomscapesRadioInboxFailure(error) {
    showBloomscapesRadioMessage(error.message);
}

function releaseBloomscapesRadioPlayback() {
    const audio=bloomscapesRadioInbox.audio;
    if(!audio)return;
    audio.onended=null;audio.onerror=null;audio.pause();
    if(audio.src.startsWith('blob:'))URL.revokeObjectURL(audio.src);
    audio.removeAttribute('src');bloomscapesRadioInbox.audio=null;
}
