let bloomscapesCommPlayback=null;

function releaseBloomscapesCommAudio() {
    bloomscapesCommPlayback=null;
    releaseBloomscapesRadioPlayback();
}

async function playBloomscapesCommVoice(id) {
    const state=bloomscapesCommState,entry=state.threads[state.selected]?.rows?.find(row=>row.id===id && row.type==='voice');
    if (!entry) return;
    if (bloomscapesCommPlayback?.id===id && bloomscapesRadioInbox.audio) {
        const audio=bloomscapesRadioInbox.audio;
        if (audio.paused) await audio.play().catch(error=>showBloomscapesCommStatus(error.message));
        else audio.pause();
        renderBloomscapesCommTimeline();return;
    }
    releaseBloomscapesCommAudio();
    const generation=state.generation,channel=state.selected,owner=state.owner;
    const audio=new Audio();bloomscapesRadioInbox.audio=audio;bloomscapesCommPlayback={id};
    try {
        const result=await bloomscapesCommRpc('gnc_read_radio_call',{p_id:id});
        if (result?.id!==id) throw Error('Playback identity was not confirmed.');
        if (generation!==state.generation || state.selected!==channel || bloomscapesRadioInbox.audio!==audio) return;
        const bytes=Uint8Array.from(atob(result.audio),char=>char.charCodeAt(0));
        audio.src=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
        audio.onended=()=>void finishBloomscapesCommVoice(entry,audio,owner,generation);
        audio.onerror=()=>{releaseBloomscapesCommAudio();showBloomscapesCommStatus('This voice clip could not play. Tap Play to retry.');};
        await audio.play();renderBloomscapesCommTimeline();
    } catch(error) {releaseBloomscapesCommAudio();showBloomscapesCommStatus(error.message);}
}

async function finishBloomscapesCommVoice(entry,audio,owner,generation) {
    const state=bloomscapesCommState;
    if (state.generation!==generation || state.owner!==owner || bloomscapesRadioInbox.audio!==audio) return;
    releaseBloomscapesCommAudio();
    try {
        if (entry.sender!==currentUser) {
            const receipt=await bloomscapesCommRpc('gnc_radio_played',{p_id:entry.id});
            if (receipt?.id!==entry.id || receipt.played!==true) throw Error('Playback receipt was not confirmed.');
        }
        await refreshBloomscapesComm();await refreshBloomscapesRadioInbox();
    } catch(error) {showBloomscapesCommStatus(error.message);}
}

async function chirpBloomscapesWalkie() {
    const Context=window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context=new Context();
    try {
        const gain=context.createGain();gain.gain.value=.075;gain.connect(context.destination);
        for (const [index,frequency] of [1200,1800].entries()) {
            const oscillator=context.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(gain);
            oscillator.start(context.currentTime+index*.1);oscillator.stop(context.currentTime+index*.1+.08);
        }
        await new Promise(resolve=>setTimeout(resolve,230));
    } finally {await context.close();}
}
