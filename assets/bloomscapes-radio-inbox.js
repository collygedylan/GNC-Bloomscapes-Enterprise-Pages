function bloomscapesRadioAutoPlay() {
    try {return localStorage.getItem('bloomscapes-radio-standby:'+bloomscapesRadioInbox.owner)==='true';}
    catch {return false;}
}
function renderBloomscapesRadioInbox() {
    let host=document.getElementById('bloomscapes-radio-inbox');
    if (!host) {
        const shell=document.getElementById('main-scroll-area');
        if(!shell)return;
        host=document.createElement('section');host.id='bloomscapes-radio-inbox';host.setAttribute('aria-label','Radio calls');
        shell.prepend(host);
        host.innerHTML='<span data-radio-count></span><button type="button" data-radio-next>▶ Play Next</button>'
            +'<label><input type="checkbox" data-radio-standby> 🎧 Auto-Play Standby</label>'
            +'<span role="status"></span><div data-radio-player></div>';
        host.querySelector('[data-radio-next]').onclick=()=>{void playNextBloomscapesRadioCall();};
        host.querySelector('[data-radio-standby]').onchange=changeBloomscapesRadioStandby;
    }
    host.hidden=!bloomscapesRadioInbox.count;
    host.querySelector('[data-radio-count]').textContent='📻 Unplayed Radio Calls ('+bloomscapesRadioInbox.count+') — ';
    host.querySelector('[data-radio-standby]').checked=bloomscapesRadioAutoPlay();
}
function changeBloomscapesRadioStandby(event) {
    try {
        localStorage.setItem('bloomscapes-radio-standby:'+bloomscapesRadioInbox.owner,String(event.target.checked));
        if(event.target.checked)void playNextBloomscapesRadioCall();
    } catch {showBloomscapesRadioMessage('Standby could not be saved on this device.');}
}
function showBloomscapesRadioMessage(message) {
    const node=document.querySelector('#bloomscapes-radio-inbox [role="status"]');
    if(node)node.textContent=message;
}
function mountBloomscapesRadioAudio(audio) {
    const host=document.querySelector('#bloomscapes-radio-inbox [data-radio-player]');
    if(!host)return;
    audio.controls=true;host.replaceChildren(audio);
}
async function resumeBloomscapesRadioInbox() {
    try {
        await connectBloomscapesRadioInbox();
        const target=new URL(location.href);
        if(!target.searchParams.has('radioCall') || !bloomscapesFarmState.confirmed)return;
        openBloomscapesDepartmentModule('communication','bloomscapes-radio');
        const play=target.searchParams.get('radioAction')==='play_radio';
        if(target.searchParams.get('radioFarm')===getBloomscapesFarm() && play)await playNextBloomscapesRadioCall();
        for(const key of ['radioCall','radioAction','radioFarm'])target.searchParams.delete(key);
        history.replaceState(history.state,'',target.href);
    } catch(error){showBloomscapesRadioMessage(error.message);}
}
window.addEventListener('gnc-user-access-change',resumeBloomscapesRadioInbox);
window.addEventListener('online',resumeBloomscapesRadioInbox);
window.addEventListener('bloomscapes-farm-ready',resumeBloomscapesRadioInbox);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeBloomscapesRadioInbox();});
navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type!=='BLOOMSCAPES_RADIO_CALL')return;
    openBloomscapesDepartmentModule('communication','bloomscapes-radio');
    void resumeBloomscapesRadioInbox();
    if(event.data.farm!==getBloomscapesFarm())return showToast('Radio call','Choose '+event.data.farm+' to listen to this call.');
    if(event.data.action==='play_radio')void refreshBloomscapesRadioInbox().then(playNextBloomscapesRadioCall)
        .catch(error=>showBloomscapesRadioMessage(error.message));
});
