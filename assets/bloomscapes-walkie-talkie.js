let bloomscapesWalkieCapture=null,bloomscapesWalkieStarting=false,bloomscapesWalkieEpoch=0,bloomscapesWalkieTimer=null;

function bindBloomscapesWalkieButton(host) {
    let gesture=null;
    host.addEventListener('pointerdown',event=>{
        const button=event.target.closest('[data-comm-talk]');
        if (!button || button.disabled) return;
        event.preventDefault();button.setPointerCapture(event.pointerId);
        gesture={at:Date.now(),stop:!!bloomscapesWalkieCapture?.speaking};
        if (!gesture.stop) void startBloomscapesWalkie();
    });
    host.addEventListener('pointerup',event=>{
        if (!gesture) return;
        event.preventDefault();
        if (gesture.stop || Date.now()-gesture.at>=280) stopBloomscapesWalkie(false);
        gesture=null;
    });
    host.addEventListener('pointercancel',()=>{gesture=null;stopBloomscapesWalkie(true);});
    host.addEventListener('keydown',event=>{
        if (!event.target.matches('[data-comm-talk]') || ![' ','Enter'].includes(event.key) || event.repeat) return;
        event.preventDefault();
        if (bloomscapesWalkieCapture?.speaking) stopBloomscapesWalkie(false);
        else void startBloomscapesWalkie();
    });
}

async function startBloomscapesWalkie() {
    const state=bloomscapesCommState;
    if (bloomscapesWalkieStarting || bloomscapesWalkieCapture?.speaking || !state.selected || state.voiceAccess!=='FULL_EDIT') return;
    bloomscapesWalkieStarting=true;
    const epoch=++bloomscapesWalkieEpoch,generation=state.generation,channel=state.selected;
    try {
        const capture=await createBloomscapesWalkieSession(channel,statusBloomscapesWalkie);
        if (epoch!==bloomscapesWalkieEpoch || generation!==state.generation || channel!==state.selected) return;
        bloomscapesWalkieCapture=capture;
        await beginBloomscapesTransmission(capture);
        if (!capture.speaking) return;
        capture.startedAt=Date.now();
        attachBloomscapesWaveMeter(capture);
        startBloomscapesWalkieTranscript(capture);
        showBloomscapesCommStatus('Recording. Tap again or release a held button to send.');
        clearBloomscapesWalkieTimers();
        bloomscapesWalkieTimer=Array.from({length:31},(_,index)=>setTimeout(syncBloomscapesWalkieRecording,(index+1)*1000));
        syncBloomscapesWalkieRecording();
    } catch(error) {stopBloomscapesWalkie(true);showBloomscapesCommStatus(error.message);}
    finally {bloomscapesWalkieStarting=false;}
}

function statusBloomscapesWalkie(message) {
    showBloomscapesCommStatus(message);syncBloomscapesWalkieRecording();
    if (!message.startsWith('Radio call saved')) return;
    void refreshBloomscapesComm().then(refreshBloomscapesRadioInbox).catch(error=>showBloomscapesCommStatus(error.message));
}

function stopBloomscapesWalkie(cancel=false) {
    bloomscapesWalkieEpoch++;
    const capture=bloomscapesWalkieCapture;
    const wasRecording=capture?.speaking;
    if (cancel && capture?.recording) capture.recording.cancelled=true;
    if (capture) {releaseBloomscapesWaveMeter(capture);endBloomscapesTransmission(capture);}
    clearBloomscapesWalkieTimers();bloomscapesWalkieTimer=null;
    syncBloomscapesWalkieRecording();
    if (cancel && wasRecording) showBloomscapesCommStatus('Recording cancelled.');
}

function startBloomscapesWalkieTranscript(capture) {
    const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
    capture.transcript='';
    if (!Recognition) return;
    const recognition=new Recognition();capture.recognition=recognition;
    recognition.lang=navigator.language || 'en-US';recognition.continuous=true;recognition.interimResults=true;
    recognition.onresult=event=>{
        capture.transcript=[...event.results].map(result=>result[0].transcript).join(' ').slice(0,4000);
    };
    recognition.onend=()=>{if(capture.recognition===recognition)capture.recognition=null;};
    recognition.onerror=()=>showBloomscapesCommStatus('Speech transcription is unavailable. Your voice recording is retained.');
    try {recognition.start();}
    catch {showBloomscapesCommStatus('Speech transcription is unavailable in this browser.');}
}

function syncBloomscapesWalkieRecording() {
    const capture=bloomscapesWalkieCapture,recording=!!capture?.speaking;
    if (recording && Date.now()-capture.startedAt>31000) stopBloomscapesWalkie(false);
    const host=bloomscapesCommHost();
    if (!host) return;
    const button=host.querySelector('[data-comm-talk]'),cancel=host.querySelector('[data-comm-cancel-record]');
    if (!button) return;
    button.dataset.recording=String(recording);
    if (recording) button.textContent='● RECORDING '+commDuration(Date.now()-capture.startedAt)+' — TAP TO SEND';
    else if (button.dataset.recordingLabel) button.textContent=button.dataset.recordingLabel;
    else return;
    if (cancel) cancel.hidden=!recording;
    const timer=host.querySelector('[data-comm-recording]');
    if (timer) timer.textContent=recording?bloomscapesWaveReading(capture)+' '+commDuration(Date.now()-capture.startedAt):'';
    if (!recording && capture) releaseBloomscapesWaveMeter(capture);
    if (!recording) {clearBloomscapesWalkieTimers();bloomscapesWalkieTimer=null;}
}

function dispatchBloomscapesWalkieClick(data) {
    const actions={commPlay:value=>void playBloomscapesCommVoice(value),commSpeed:toggleBloomscapesCommSpeed,
        commCancelRecord:()=>stopBloomscapesWalkie(true),commMic:toggleBloomscapesWalkie,
        commRetry:()=>void retryBloomscapesRadioDrafts().then(refreshBloomscapesComm).catch(error=>showBloomscapesCommStatus(error.message))};
    const key=Object.keys(data).find(name=>actions[name]);
    if (key) actions[key](data[key]);
}

function toggleBloomscapesWalkie() {
    if (bloomscapesWalkieCapture?.speaking) stopBloomscapesWalkie(false);
    else void startBloomscapesWalkie();
}
function toggleBloomscapesCommSpeed(id) {
    const audio=bloomscapesRadioInbox.audio;
    if (!audio || bloomscapesCommPlayback?.id!==id) return;
    audio.playbackRate=audio.playbackRate===1?1.5:1;renderBloomscapesCommTimeline();
}

window.addEventListener('pagehide',()=>stopBloomscapesWalkie(true));
window.addEventListener('bloomscapes-farm-changing',()=>stopBloomscapesWalkie(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBloomscapesWalkie(true);});

function clearBloomscapesWalkieTimers() {
    for (const timer of bloomscapesWalkieTimer || []) clearTimeout(timer);
    bloomscapesWalkieTimer=null;
}

function attachBloomscapesWaveMeter(capture) {
    if (!window.AudioContext || !capture.stream?.active) return;
    try {
        const context=new AudioContext();
        capture.meterContext=context;
        const analyser=context.createAnalyser();
        analyser.fftSize=256;
        context.createMediaStreamSource(capture.stream).connect(analyser);
        capture.meter=analyser;
    } catch { releaseBloomscapesWaveMeter(capture); }
}

function bloomscapesWaveReading(capture) {
    if (!capture.meter) return '';
    const samples=new Uint8Array(capture.meter.fftSize);
    capture.meter.getByteTimeDomainData(samples);
    const bars='▁▂▃▄▅▆▇█';
    const levels=[];
    for (let offset=0;offset<samples.length;offset+=16) {
        const peak=Math.max(...samples.subarray(offset,offset+16).map(value=>Math.abs(value-128)));
        levels.push(bars[Math.min(7,Math.floor(peak/10))]);
    }
    return levels.join('');
}

function releaseBloomscapesWaveMeter(capture) {
    const context=capture.meterContext;
    capture.meterContext=null;
    capture.meter=null;
    if (context && context.state!=='closed') void context.close().catch(error=>showBloomscapesCommStatus(error.message));
}

function renderWalkieShell() {
    return '<section data-comm-hub data-radio-panel aria-label="Push to Talk"><h2>Push to Talk</h2>'
        +'<header class="radio-channel-bar"><strong data-radio-title></strong><label><input type="checkbox" data-comm-autoplay> 🔊 Live Speaker</label></header>'
        +'<nav data-radio-channels aria-label="Radio channels"></nav><label>Direct Radio <select data-radio-person aria-label="Direct radio recipient"></select></label>'
        +'<div class="radio-transmitter"><button type="button" data-comm-talk data-recording-label="Push to Talk">Push to Talk</button>'
        +'<output data-comm-recording></output><button type="button" data-comm-cancel-record hidden>Cancel</button></div>'
        +'<section data-radio-clips aria-label="Voice clips"></section><p data-comm-status role="status"></p></section>';
}

function renderWalkieControls(host) {
    const state=bloomscapesCommState;
    const selected=state.conversations.find(row=>row.id===state.selected);
    host.querySelector('[data-radio-title]').textContent=selected?commConversationName(selected):'Choose a channel';
    host.querySelector('[data-comm-autoplay]').checked=bloomscapesRadioAutoPlay();
    host.querySelector('[data-comm-talk]').disabled=!selected || state.voiceAccess!=='FULL_EDIT' || state.opening;
    const all=state.conversations.find(row=>row.is_group && row.title===state.farm+' All' && !row.participant_usernames?.length);
    const channels=[{slug:'all_call',title:'All Call',id:all?.id},...standardRadioChannels];
    const available=channels.filter(channel=>state.conversations.some(row=>row.id===channel.id));
    host.querySelector('[data-radio-channels]').innerHTML=available.map(channel=>
        '<button type="button" data-radio-channel="'+channel.slug+'" data-comm-conversation="'+commEscape(channel.id)+'" aria-pressed="'+(channel.id===state.selected)+'">'+channel.title+'</button>').join('')
        +'<button type="button" data-radio-channel="direct_radio" data-comm-direct>Direct Radio</button>';
    const direct=host.querySelector('[data-radio-person]');
    direct.innerHTML='<option value="">Select person</option>'+state.people.filter(user=>user.username!==currentUser).map(user=>
        '<option value="'+commEscape(user.username)+'">'+commEscape(user.name)+'</option>').join('');
    renderWalkieClips(host);
    syncBloomscapesWalkieRecording();
}

function renderWalkieClips(host) {
    const state=bloomscapesCommState;
    const clips=state.threads[state.selected]?.rows?.filter(row=>row.type==='voice') || [];
    host.querySelector('[data-radio-clips]').innerHTML=clips.map(renderBloomscapesCommBubble).join('');
}
