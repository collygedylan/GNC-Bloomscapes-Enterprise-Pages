const bloomscapesRadioCaptures=new Set(),bloomscapesRadioFinalizing=new Set();
function getBloomscapesRadioUpdateBlocker() {
    return bloomscapesRadioCaptures.size>0 || bloomscapesRadioFinalizing.size>0 || hasVolatileBloomscapesRadioDrafts()
        || typeof bloomscapesCommState!=='undefined' && bloomscapesCommState.cacheFailed===true;
}
function releaseBloomscapesHardwareStream(stream) {
    stream?.getTracks().forEach(track=>track.stop());
}
function radioRecordingMime() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || /Mac/.test(navigator.userAgent) && navigator.maxTouchPoints>1;
    const formats = ios ? ['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/ogg;codecs=opus']
        : ['audio/webm;codecs=opus','audio/mp4','audio/aac','audio/ogg;codecs=opus'];
    return formats
        .find(mime=>MediaRecorder.isTypeSupported(mime));
}
async function commitBloomscapesRecording(state,recording) {
    if (recording.cancelled || !recording.parts.length) {bloomscapesRadioFinalizing.delete(recording.id);return;}
    const draft={id:recording.id,owner:state.owner,channelId:state.channelId,farm:recording.farm,
        blob:new Blob(recording.parts,{type:recording.recorder.mimeType}),conversation:state.conversation===true,transcript:state.transcript || '',
        duration:Math.max(1,Math.min(31000,(recording.endedAt || Date.now())-recording.startedAt))};
    try {
        const storage=await saveBloomscapesRadioDraft(draft);
        const receipt=await publishBloomscapesRadioDraft(draft);
        state.callbacks.status('Radio call saved for '+(receipt.recipients ?? 'the')+' recipients.'
            +(receipt.localCleanupError?' Local draft cleanup will retry.':'')+(storage.persisted?'':' Device storage is unavailable.'));
    } catch (error) { state.callbacks.status(error.message+' Use Retry unsent calls when connected.'); }
    finally {bloomscapesRadioFinalizing.delete(recording.id);}
}
async function beginBloomscapesTransmission(state) {
    if (state.speaking || state.closed) return;
    assertBloomscapesRadioDraftCapacity();
    const farm=getBloomscapesFarm();
    state.speaking=true;
    bloomscapesRadioCaptures.add(state);
    const generation=state.captureGeneration=(state.captureGeneration || 0)+1;
    let allowed;
    try {allowed=await bloomscapesRadioRpc(state.client,'gnc_radio_can_transmit',{p_channel:state.channelId,p_farm:farm});}
    catch(error){if(state.captureGeneration===generation)endBloomscapesTransmission(state);throw error;}
    if(!state.speaking || state.closed || state.captureGeneration!==generation || getBloomscapesFarm()!==farm)return;
    if(!allowed){endBloomscapesTransmission(state);throw Error('Radio transmission is read-only for this account.');}
    let stream;
    try {stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});}
    catch(error){if(state.captureGeneration===generation)endBloomscapesTransmission(state);throw error;}
    if (!state.speaking || state.closed || state.captureGeneration!==generation || getBloomscapesFarm()!==farm) {
        releaseBloomscapesHardwareStream(stream);
        return;
    }
    state.stream=stream;
    try {
        await requireBloomscapesOwner(state.owner);
        const track=stream.getAudioTracks()[0];
        await Promise.all([...state.peers.values()].map(peer=>peer.sender.replaceTrack(track)));
        if (!state.speaking || state.closed || state.captureGeneration!==generation || getBloomscapesFarm()!==farm) return releaseBloomscapesHardwareStream(stream);
        startBloomscapesRadioRecorder(state,stream,farm);
    } catch (error) {
        endBloomscapesTransmission(state);
        throw error;
    }
}
function startBloomscapesRadioRecorder(state,stream,farm) {
    const mime=radioRecordingMime();
    if (!mime) throw Error('This browser cannot record radio calls.');
    const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});
    const recording={id:crypto.randomUUID(),recorder,parts:[],startedAt:Date.now(),farm};
    state.recording=recording;
    bloomscapesRadioFinalizing.add(recording.id);
    recorder.ondataavailable=event=>{if(event.data.size)recording.parts.push(event.data);};
    recorder.onstop=()=>{void commitBloomscapesRecording(state,recording);};
    try {recorder.start();}
    catch(error){bloomscapesRadioFinalizing.delete(recording.id);throw error;}
    state.speechDeadline=setTimeout(()=>{
        endBloomscapesTransmission(state);
        state.callbacks.status('Transmission stopped after 30 seconds.');
    },30000);
}
function endBloomscapesTransmission(state) {
    if (!state) return;
    stopBloomscapesTransmissionTranscript(state);
    state.speaking=false;
    bloomscapesRadioCaptures.delete(state);
    state.captureGeneration=(state.captureGeneration || 0)+1;
    clearTimeout(state.speechDeadline);
    if (state.recording?.recorder.state==='recording') {
        state.recording.endedAt=Date.now();
        state.recording.recorder.stop();
    }
    state.recording=null;
    releaseBloomscapesHardwareStream(state.stream);
    for(const peer of state.peers.values()) {
        void peer.sender.replaceTrack(null).catch(error=>state.callbacks.status(error.message));
    }
}

function stopBloomscapesTransmissionTranscript(state) {
    const recognition=state.recognition;
    if (!recognition) return;
    state.recognition=null;
    try {recognition.stop();}
    catch {state.callbacks.status('Speech transcription ended; your voice recording is retained.');}
}
