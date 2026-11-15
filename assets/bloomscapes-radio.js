async function bloomscapesRadioRpc(client,name,parameters={}) {
    return bloomscapesData(await client.rpc(name,parameters).abortSignal(AbortSignal.timeout(8000)));
}

async function listBloomscapesRadioChannels() {
    const {client} = await requireBloomscapesSession();
    const channels=await bloomscapesRadioRpc(client,'gnc_radio_channels');
    return channels.filter(channel=>! /^(10-PH|60-HL|20-TX|40-NC) All$/.test(channel.title) || channel.title===getBloomscapesFarm()+' All');
}

async function createBloomscapesDirectRadio(username) {
    const {client} = await requireBloomscapesSession();
    return bloomscapesRadioRpc(client,'gnc_radio_direct',{p_username:username.trim().toLowerCase()});
}

async function joinBloomscapesRadio(channelId,callbacks) {
    const {client,owner} = await requireBloomscapesSession();
    const stream = new MediaStream();
    const state = {client,owner,stream,id:crypto.randomUUID(),channelId,callbacks,peers:new Map(),closed:false,
        queue:Promise.resolve(),subscription:null,expiry:null,speechDeadline:null};
    try {
        await subscribeBloomscapesRadio(state);
        await requireBloomscapesOwner(owner);
        const receipt = await bloomscapesRadioRpc(client,'gnc_join_radio',{p_channel:channelId,p_session:state.id});
        for (const peer of receipt.peers) {
            const connection = createBloomscapesRadioPeer(state,peer.id,peer.username);
            await connection.pc.setLocalDescription(await connection.pc.createOffer());
            await sendBloomscapesRadioSignal(state,peer.id,{kind:'offer',sdp:connection.pc.localDescription.toJSON()});
        }
        state.expiry = setTimeout(() => {
            callbacks.status('Radio session ended after 14 minutes. Join again to continue.');
            void closeBloomscapesRadio(state);
        },14*60*1000);
        return state;
    } catch (error) { await closeBloomscapesRadio(state); throw error; }
}

async function subscribeBloomscapesRadio(state) {
    const channel = state.client.channel('bloomscapes-radio-'+state.id);
    state.subscription = channel;
    channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'gnc_radio_signals',filter:'to_session=eq.'+state.id},event => {
        state.queue = state.queue.then(() => receiveBloomscapesRadioSignal(state,event.new))
            .catch(error => state.callbacks.status(error.message));
    });
    await new Promise((resolve,reject) => {
        const deadline = setTimeout(() => reject(new Error('Radio connection timed out.')),10000);
        channel.subscribe(status => finishBloomscapesRadioSubscription(status,deadline,resolve,reject));
    });
}

function finishBloomscapesRadioSubscription(status,deadline,resolve,reject) {
    if (status === 'SUBSCRIBED') { clearTimeout(deadline); resolve(); }
    else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
        clearTimeout(deadline);
        reject(new Error('Radio connection unavailable.'));
    }
}

function createBloomscapesRadioPeer(state,id,username) {
    if (state.peers.has(id)) return state.peers.get(id);
    if (state.closed || state.peers.size>=5) throw new Error('Radio listener limit reached.');
    const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const peer = {pc,id,username,pendingIce:[],iceSent:0,sender:pc.addTransceiver('audio',{direction:'sendrecv'}).sender};
    state.peers.set(id,peer);
    if(state.speaking)void peer.sender.replaceTrack(state.stream.getAudioTracks()[0] || null)
        .catch(error=>state.callbacks.status(error.message));
    pc.ontrack = event => { if (!state.closed) state.callbacks.stream(id,username,event.streams[0] || new MediaStream([event.track])); };
    pc.onicecandidate = event => {
        if (!event.candidate || state.closed || peer.iceSent>=32) return;
        peer.iceSent++;
        void sendBloomscapesRadioSignal(state,id,{kind:'ice',candidate:event.candidate.toJSON()})
            .catch(error => state.callbacks.status(error.message));
    };
    pc.onconnectionstatechange = () => {
        if (!state.closed) state.callbacks.status(username+' · '+pc.connectionState);
    };
    return peer;
}

async function sendBloomscapesRadioSignal(state,to,payload) {
    if (state.closed) return;
    await requireBloomscapesOwner(state.owner);
    await bloomscapesRadioRpc(state.client,'gnc_send_radio_signal',{p_from:state.id,p_to:to,p_payload:payload});
}

async function receiveBloomscapesRadioSignal(state,signal) {
    if (state.closed || signal.to_session!==state.id) return;
    await requireBloomscapesOwner(state.owner);
    const payload = signal.payload;
    if (payload.kind === 'card') return receiveBloomscapesRadioCard(state,signal);
    if (payload.kind === 'leave') return removeBloomscapesRadioPeer(state,signal.from_session);
    const peer = createBloomscapesRadioPeer(state,signal.from_session,signal.sender_username);
    if (payload.kind === 'ice') {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload.candidate);
        else if (peer.pendingIce.length<32) peer.pendingIce.push(payload.candidate);
        return;
    }
    await peer.pc.setRemoteDescription(payload.sdp);
    for (const candidate of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(candidate);
    if (payload.kind === 'offer') {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await sendBloomscapesRadioSignal(state,peer.id,{kind:'answer',sdp:peer.pc.localDescription.toJSON()});
    }
}

function removeBloomscapesRadioPeer(state,id) {
    const peer = state.peers.get(id);
    peer?.pc.close();
    state.peers.delete(id);
    state.callbacks.remove(id);
}

async function setBloomscapesRadioSpeaking(state,speaking) {
    if (!state || state.closed) return;
    if (speaking) return beginBloomscapesTransmission(state);
    endBloomscapesTransmission(state);
}

async function shareBloomscapesRadioCard(state,rowId,farm) {
    if (!state || state.closed) throw new Error('Join a radio channel first.');
    const result = await state.client.from('gnc_all_master_inventory').select('unique_id')
        .eq('unique_id',rowId).eq('warehousei',farm === '10-PH' ? '10' : '60').single();
    bloomscapesData(result);
    for (const id of state.peers.keys()) await sendBloomscapesRadioSignal(state,id,{kind:'card',rowId,farm});
}

async function receiveBloomscapesRadioCard(state,signal) {
    const result = await state.client.from('gnc_all_master_inventory')
        .select('unique_id,itemcode,commonname,locationcode,lotcode,ptronhand')
        .eq('unique_id',signal.payload.rowId).eq('warehousei',signal.payload.farm === '10-PH' ? '10' : '60').single();
    const row = bloomscapesData(result);
    await requireBloomscapesOwner(state.owner);
    if (!state.closed) state.callbacks.card(signal.sender_username,row);
}

async function closeBloomscapesRadio(state) {
    if (!state || state.closed) return;
    endBloomscapesTransmission(state);
    state.closed = true;
    state.stream.getTracks().forEach(track => track.stop());
    clearTimeout(state.expiry);
    clearTimeout(state.speechDeadline);
    const leaving = [];
    for (const id of state.peers.keys()) {
        leaving.push(bloomscapesRadioRpc(state.client,'gnc_send_radio_signal',{p_from:state.id,p_to:id,p_payload:{kind:'leave'}}));
        removeBloomscapesRadioPeer(state,id);
    }
    const results = await Promise.allSettled(leaving);
    results.filter(result => result.status === 'rejected').forEach(result => state.callbacks.status(result.reason.message));
    await state.client.removeChannel(state.subscription);
    await bloomscapesRadioRpc(state.client,'gnc_leave_radio',{p_session:state.id});
}
