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
    return formats.find(mime=>globalThis.MediaRecorder?.isTypeSupported(mime));
}
async function commitBloomscapesRecording(state,recording) {
    try {
        if (recording.cancelled) return;
        if (!recording.parts.length) return state.callbacks.status('No audio was captured. Hold to record again.','ready');
        const draft={id:recording.id,owner:state.owner,channelId:state.channelId,farm:recording.farm,
            blob:new Blob(recording.parts,{type:recording.recorder.mimeType}),conversation:state.conversation===true,transcript:state.transcript || '',
            duration:Math.max(1,Math.min(31000,(recording.endedAt || Date.now())-recording.startedAt))};
        const storage=await saveBloomscapesRadioDraft(draft);
        const receipt=await publishBloomscapesRadioDraft(draft);
        const count=receipt.recipients;
        const sent=Number.isSafeInteger(count)?'Sent to '+count+' recipient'+(count===1?'':'s'):'Transmission sent';
        state.callbacks.status(sent+(receipt.localCleanupError?'. Local draft cleanup will retry.':'')
            +(storage.persisted?'':'. Device storage is unavailable.'),'sent');
    } catch (error) {state.callbacks.status(error.message+' Use Retry unsent calls when connected.','ready');}
    finally {bloomscapesRadioFinalizing.delete(recording.id);}
}
function ownsRadioCapture(state,generation,farm) {
    return state.speaking && !state.closed && state.captureGeneration===generation && getBloomscapesFarm()===farm;
}
async function beginBloomscapesTransmission(state) {
    if (state.speaking || state.closed) return;
    assertBloomscapesRadioDraftCapacity();
    const farm=getBloomscapesFarm();
    state.speaking=true;
    bloomscapesRadioCaptures.add(state);
    const generation=state.captureGeneration=(state.captureGeneration || 0)+1;
    try {
        const allowed=await bloomscapesRadioRpc(state.client,'gnc_radio_can_transmit',{p_channel:state.channelId,p_farm:farm});
        if (!ownsRadioCapture(state,generation,farm)) return;
        if (!allowed) throw Error('Radio transmission is read-only for this account.');
        if (!navigator.mediaDevices?.getUserMedia) throw Error('Microphone capture is unavailable in this browser.');
        state.releaseAudio=globalThis.window?.GncAuraAudio?.claim('radio:'+crypto.randomUUID());
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});
        if (!ownsRadioCapture(state,generation,farm)) return releaseBloomscapesHardwareStream(stream);
        state.stream=stream;
        await requireBloomscapesOwner(state.owner);
        if (!ownsRadioCapture(state,generation,farm)) return;
        const track=stream.getAudioTracks()[0];
        await Promise.all([...state.peers.values()].map(peer=>peer.sender.replaceTrack(track)));
        if (ownsRadioCapture(state,generation,farm)) startBloomscapesRadioRecorder(state,stream,farm);
    } finally {
        if (state.captureGeneration===generation && !state.recording) endBloomscapesTransmission(state);
    }
}
function startBloomscapesRadioRecorder(state,stream,farm) {
    const mime=radioRecordingMime();
    if (!mime) throw Error('This browser cannot record radio calls.');
    const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});
    const recording={id:crypto.randomUUID(),recorder,parts:[],startedAt:Date.now(),farm};
    recorder.ondataavailable=event=>{if(event.data.size)recording.parts.push(event.data);};
    recorder.onstop=()=>{void commitBloomscapesRecording(state,recording);};
    recorder.onerror=event=>{
        recording.cancelled=true;
        endBloomscapesTransmission(state);
        state.callbacks.status(event.error?.message || 'Recording stopped. Hold to try again.','ready');
    };
    recorder.start();
    state.recording=recording;
    bloomscapesRadioFinalizing.add(recording.id);
    state.speechDeadline=setTimeout(()=>endBloomscapesTransmission(state),30000);
}
function endBloomscapesTransmission(state) {
    if (!state || !state.speaking) return;
    state.speaking=false;
    bloomscapesRadioCaptures.delete(state);
    state.captureGeneration=(state.captureGeneration || 0)+1;
    clearTimeout(state.speechDeadline);
    stopBloomscapesTransmissionTranscript(state);
    const recording=state.recording;
    state.recording=null;
    try {
        if (recording?.recorder.state==='recording') {
            recording.endedAt=Date.now();
            if (!recording.cancelled) state.callbacks.status('Sending…','sending');
            recording.recorder.stop();
        }
    } catch (error) {
        bloomscapesRadioFinalizing.delete(recording.id);
        state.callbacks.status(error.message,'ready');
    } finally {
        releaseBloomscapesHardwareStream(state.stream);
        state.releaseAudio?.();
        state.releaseAudio=null;
    }
    for(const peer of state.peers.values()) {
        void peer.sender.replaceTrack(null).catch(error=>state.callbacks.status(error.message));
    }
}

function stopBloomscapesTransmissionTranscript(state) {
    const recognition=state.recognition;
    if (!recognition) return;
    state.recognition=null;
    try {recognition.stop();}
    catch {state.callbacks.status('Speech transcription ended. Your voice recording is retained.');}
}
