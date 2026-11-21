let bloomscapesWalkieCapture=null, bloomscapesWalkieEpoch=0, bloomscapesWalkiePhase='ready';
let bloomscapesWalkieTimers=[];

function bindBloomscapesWalkieButton(host) {
    const button=host.querySelector('[data-comm-talk]');
    let pointer=null, key='';
    function endPointer(event,cancel) {
        if (event.pointerId!==pointer) return;
        pointer=null;
        stopBloomscapesWalkie(cancel);
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    }
    button.addEventListener('pointerdown',event=>{
        if (pointer!==null || key || !event.isPrimary || event.button!==0 || button.disabled || bloomscapesWalkiePhase==='sending') return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        pointer=event.pointerId;
        void startBloomscapesWalkie();
    });
    button.addEventListener('pointerup',event=>endPointer(event,false));
    button.addEventListener('pointercancel',event=>endPointer(event,true));
    button.addEventListener('lostpointercapture',event=>endPointer(event,true));
    button.addEventListener('keydown',event=>{
        if (![' ','Enter'].includes(event.key)) return;
        event.preventDefault();
        if (event.repeat || key || pointer!==null || button.disabled || bloomscapesWalkiePhase==='sending') return;
        key=event.key;
        void startBloomscapesWalkie();
    });
    button.addEventListener('keyup',event=>{
        if (!key || event.key!==key) return;
        event.preventDefault();
        key='';
        stopBloomscapesWalkie(false);
    });
    button.addEventListener('blur',()=>{
        if (!key) return;
        key='';
        stopBloomscapesWalkie(true);
    });
}

async function startBloomscapesWalkie() {
    const state=bloomscapesCommState;
    if (!['ready','sent'].includes(bloomscapesWalkiePhase) || !state.selected || state.voiceAccess!=='FULL_EDIT' || state.opening) return;
    const epoch=++bloomscapesWalkieEpoch, generation=state.generation, channel=state.selected;
    const current=()=>epoch===bloomscapesWalkieEpoch && generation===state.generation && channel===state.selected;
    bloomscapesWalkiePhase='starting';
    syncBloomscapesWalkieRecording();
    showBloomscapesCommStatus('');
    try {
        const capture=await createBloomscapesWalkieSession(channel,(message,phase)=>{
            if (current()) statusBloomscapesWalkie(message,phase);
        });
        if (!current()) return;
        bloomscapesWalkieCapture=capture;
        await beginBloomscapesTransmission(capture);
        if (!current() || !capture.recording) return;
        bloomscapesWalkiePhase='live';
        startBloomscapesWalkieTranscript(capture);
        bloomscapesWalkieTimers=Array.from({length:30},(_,index)=>setTimeout(syncBloomscapesWalkieRecording,(index+1)*1000));
        syncBloomscapesWalkieRecording();
    } catch(error) {
        if (!current()) return;
        stopBloomscapesWalkie(true);
        showBloomscapesCommStatus(error.message);
    }
}

function statusBloomscapesWalkie(message,phase) {
    if (phase) bloomscapesWalkiePhase=phase;
    if (phase==='ready' || phase==='sent') bloomscapesWalkieCapture=null;
    showBloomscapesCommStatus(message);
    syncBloomscapesWalkieRecording();
    if (phase!=='sent') return;
    void refreshBloomscapesRadioInbox().catch(error=>showBloomscapesCommStatus(error.message));
}

function stopBloomscapesWalkie(cancel=false) {
    const capture=bloomscapesWalkieCapture, recorded=!!capture?.recording;
    if (!cancel && bloomscapesWalkiePhase==='sending') return;
    if (cancel || !recorded) {
        bloomscapesWalkieEpoch++;
        bloomscapesWalkieCapture=null;
        bloomscapesWalkiePhase='ready';
    }
    if (cancel && recorded) capture.recording.cancelled=true;
    if (capture?.speaking) endBloomscapesTransmission(capture);
    if (cancel && recorded) showBloomscapesCommStatus('Recording cancelled.');
    syncBloomscapesWalkieRecording();
}

function startBloomscapesWalkieTranscript(capture) {
    const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
    capture.transcript='';
    if (!Recognition) return;
    try {
        const recognition=new Recognition();
        capture.recognition=recognition;
        recognition.lang=navigator.language || 'en-US';
        recognition.continuous=true;
        recognition.interimResults=true;
        recognition.onresult=event=>{
            capture.transcript=[...event.results].map(result=>result[0].transcript).join(' ').slice(0,4000);
        };
        recognition.onend=()=>{if(capture.recognition===recognition)capture.recognition=null;};
        recognition.onerror=()=>{if(capture.speaking)showBloomscapesCommStatus('Transcription unavailable. Audio recording continues.');};
        recognition.start();
    } catch {showBloomscapesCommStatus('Transcription unavailable. Audio recording continues.');}
}

function syncBloomscapesWalkieRecording() {
    const phase=bloomscapesWalkiePhase, recording=bloomscapesWalkieCapture?.recording;
    if (phase!=='live') {
        for (const timer of bloomscapesWalkieTimers) clearTimeout(timer);
        bloomscapesWalkieTimers=[];
    }
    const host=bloomscapesCommHost();
    const button=host?.querySelector('[data-comm-talk]');
    if (!button) return;
    const labels={ready:'HOLD TO TALK',starting:'Opening mic…',sending:'Sending…',sent:'✓ Sent'};
    button.dataset.phase=phase;
    button.dataset.recording=String(phase==='live');
    const label=phase==='live' && recording?'🔴 LIVE · '+commDuration(Math.floor((Date.now()-recording.startedAt)/1000)*1000):labels[phase];
    button.querySelector('[data-talk-label]').textContent=label;
    button.setAttribute('aria-label',phase==='ready'?'Hold to talk, release to send':label);
    host.querySelector('[data-comm-cancel-record]').hidden=phase!=='live';
}

function dispatchBloomscapesWalkieClick(data) {
    if ('commCancelRecord' in data) return stopBloomscapesWalkie(true);
    if ('commPlay' in data) return void playBloomscapesCommVoice(data.commPlay).catch(error=>showBloomscapesCommStatus(error.message));
    if ('commRetry' in data) return void retryBloomscapesRadioDrafts().then(refreshBloomscapesComm).catch(error=>showBloomscapesCommStatus(error.message));
    if (!('commSpeed' in data)) return;
    const audio=bloomscapesRadioInbox.audio;
    if (!audio || bloomscapesCommPlayback?.id!==data.commSpeed) return;
    audio.playbackRate=audio.playbackRate===1?1.5:1;
    renderBloomscapesCommTimeline();
}

window.addEventListener('pagehide',()=>stopBloomscapesWalkie(true));
window.addEventListener('bloomscapes-farm-changing',()=>stopBloomscapesWalkie(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBloomscapesWalkie(true);});

function renderWalkieShell() {
    return '<section data-comm-hub data-radio-panel aria-label="Push to Talk"><header class="radio-channel-bar">'
        +'<div class="radio-identity"><strong data-radio-user></strong><span data-radio-title></span></div>'
        +'<label class="radio-speaker"><input type="checkbox" role="switch" data-comm-autoplay><i aria-hidden="true"></i>Live Speaker</label></header>'
        +'<nav data-radio-channels aria-label="Radio channels"></nav><label class="radio-recipient" hidden>Recipient<select data-radio-person aria-label="Direct radio recipient"></select></label>'
        +'<div class="radio-transmitter"><button type="button" data-comm-talk aria-label="Hold to talk, release to send">'
        +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">'
        +'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/></svg>'
        +'<span data-talk-label>HOLD TO TALK</span></button><button type="button" data-comm-cancel-record hidden>Cancel</button></div>'
        +'<p data-comm-status role="status"></p><button type="button" data-comm-retry hidden>Retry unsent calls</button>'
        +'<section class="radio-history" aria-label="Recent Transmissions"><h3>Recent Transmissions</h3><div data-radio-clips></div></section></section>';
}

function walkieChannelLabel(row) {
    if (!row) return 'Choose a channel';
    if (row.title===bloomscapesCommState.farm+' All' && row.is_group) return 'All Call';
    return commConversationName(row).replace('Shipping/Docks','Shipping / Docks');
}

function walkieChannelButton(slug,title,command,active,disabled=false) {
    return '<button type="button" data-radio-channel="'+slug+'" '+command+' aria-pressed="'+active+'"'+(disabled?' disabled':'')+'>'
        +'<i aria-hidden="true"></i><span>'+commEscape(title)+'</span></button>';
}

function renderWalkieControls(host) {
    const state=bloomscapesCommState;
    const selected=state.conversations.find(row=>row.id===state.selected);
    const self=getBloomscapesCommPerson(currentUser)?.name || (typeof currentUserDisplay==='string' && currentUserDisplay) || currentUser;
    host.querySelector('[data-radio-user]').textContent=self;
    host.querySelector('[data-radio-title]').textContent='Broadcasting → '+walkieChannelLabel(selected);
    host.querySelector('[data-comm-autoplay]').checked=bloomscapesRadioAutoPlay();
    host.querySelector('[data-comm-talk]').disabled=!selected || state.voiceAccess!=='FULL_EDIT' || state.opening;
    const all=state.conversations.find(row=>row.is_group && row.title===state.farm+' All' && !row.participant_usernames?.length);
    const channels=[{slug:'all_call',title:'All Call',id:all?.id},...standardRadioChannels];
    const nav=host.querySelector('[data-radio-channels]');
    nav.innerHTML=channels.map(channel=>{
        const available=state.conversations.some(row=>row.id===channel.id);
        const command=available?'data-comm-conversation="'+commEscape(channel.id)+'"':'';
        return walkieChannelButton(channel.slug,channel.title.replace('Shipping/Docks','Shipping / Docks'),command,available && channel.id===state.selected,!available);
    }).join('')+walkieChannelButton('direct_radio','Direct Radio','data-comm-direct',!!selected && !selected.is_group);
    const direct=host.querySelector('[data-radio-person]');
    direct.parentElement.hidden=selected?.is_group!==false && document.activeElement!==direct;
    direct.innerHTML='<option value="">Select person</option>'+state.people.filter(user=>user.username!==currentUser).map(user=>
        '<option value="'+commEscape(user.username)+'">'+commEscape(user.name)+'</option>').join('');
    direct.value=selected?.is_group?'':selected?.participant_usernames?.find(name=>name!==currentUser) || '';
    renderWalkieClips(host);
    host.querySelector('[data-comm-status]').textContent=state.status;
    host.querySelector('[data-comm-retry]').hidden=!state.status.includes('Retry unsent calls');
    syncBloomscapesWalkieRecording();
}

function renderWalkieClips(host) {
    const state=bloomscapesCommState;
    const selected=state.conversations.find(row=>row.id===state.selected);
    const clips=state.threads[state.selected]?.rows?.filter(row=>row.type==='voice').slice(-10).reverse() || [];
    const channel=commEscape(walkieChannelLabel(selected));
    const feed=host.querySelector('[data-radio-clips]');
    feed.innerHTML=clips.length?clips.map(row=>{
        const sender=getBloomscapesCommPerson(row.sender)?.name || row.sender;
        const active=bloomscapesCommPlayback?.id===row.id && !bloomscapesRadioInbox.audio?.paused;
        const id=commEscape(row.id);
        const audio=bloomscapesCommPlayback?.id===row.id?bloomscapesRadioInbox.audio:null;
        return '<article><div><strong>'+commEscape(sender)+'</strong><span>'+channel+' · <time>'+commTime(row.created_at)+'</time></span></div>'
            +'<button type="button" data-comm-play="'+id+'">'+(active?'Ⅱ Pause':'▶ Replay')+'</button>'
            +(audio?'<button type="button" aria-label="Change playback speed" data-comm-speed="'+id+'">'+audio.playbackRate+'×</button>':'')
            +(row.body?'<details><summary>Transcript</summary><p>'+commEscape(row.body)+'</p></details>':'')+'</article>';
    }).join(''):'<p>No transmissions in this channel yet.</p>';
}
