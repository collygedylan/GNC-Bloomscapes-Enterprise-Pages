function renderBloomscapesRadioControls() {
    return '<section data-bloomscapes-radio class="space-y-3 p-3"><h2>Walkie-Talkie &amp; AURA Voice</h2>'
        + '<label>Channel <select data-radio-channel></select></label><button data-radio-join>Join channel</button>'
        + '<button data-radio-leave>Leave</button><button data-radio-ptt disabled>Hold to talk</button>'
        + '<form data-radio-direct><label>Direct call username <input name="username" required></label><button>Open direct channel</button></form>'
        + '<form data-radio-card><label>Physical row ID <input name="rowId" required></label>'
        + '<label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label><button>Share Item / Block card</button></form>'
        + '<button data-radio-aura>Open AURA voice</button><p role="status">Choose a channel to join.</p>'
        + '<div data-radio-audio></div><div data-radio-cards></div></section>';
}

function mountBloomscapesRadioControls(container) {
    const host = container.querySelector('[data-bloomscapes-radio]');
    if (!host) return;
    const ui = {host,session:null,joining:false,generation:0,observer:null,abort:new AbortController()};
    const status = message => { if (host.isConnected) host.querySelector('[role="status"]').textContent = message; };
    host.querySelector('[data-radio-join]').addEventListener('click',() => void joinBloomscapesRadioUi(ui,status));
    host.querySelector('[data-radio-leave]').addEventListener('click',() => void leaveBloomscapesRadioUi(ui,status));
    bindBloomscapesPushToTalk(ui);
    bindBloomscapesRadioForms(ui,status);
    host.querySelector('[data-radio-aura]').addEventListener('click',() => {
        void syncAuraWidgetForSession().then(() => status(auraWidgetHandle ? 'AURA voice ready.' : 'AURA provider is not configured.'))
            .catch(error => status(error.message));
    });
    ui.observer = new MutationObserver(() => {
        if (host.isConnected && getCurrentVisibleViewId() === 'managers' && activeHomeTab === 'bloomscapes-radio') return;
        ui.abort.abort();
        ui.observer.disconnect();
        void leaveBloomscapesRadioUi(ui,status);
    });
    ui.observer.observe(container,{childList:true});
    const view = document.getElementById('view-managers');
    if (view) ui.observer.observe(view,{attributes:true,attributeFilter:['class','hidden']});
    document.addEventListener('visibilitychange',() => {
        if (document.hidden) void leaveBloomscapesRadioUi(ui,status);
    },{signal:ui.abort.signal});
    window.addEventListener('pagehide',() => void leaveBloomscapesRadioUi(ui,status),{signal:ui.abort.signal});
    void refreshBloomscapesRadioChoices(host).catch(error => status(error.message));
}

async function refreshBloomscapesRadioChoices(host,selected) {
    const rows = await listBloomscapesRadioChannels();
    if (!host.isConnected) return;
    const select = host.querySelector('[data-radio-channel]');
    select.replaceChildren();
    for (const row of rows) {
        const option = document.createElement('option');
        option.value = row.id;
        option.textContent = row.title;
        select.appendChild(option);
    }
    if (selected) select.value = selected;
}

async function joinBloomscapesRadioUi(ui,status) {
    if (ui.joining || ui.session) return;
    ui.joining = true;
    const generation = ++ui.generation;
    status('Connecting radio…');
    const callbacks = bloomscapesRadioUiCallbacks(ui,status,generation);
    try {
        const session = await joinBloomscapesRadio(ui.host.querySelector('[data-radio-channel]').value,callbacks);
        if (!ui.host.isConnected || generation !== ui.generation) return await closeBloomscapesRadio(session);
        ui.session = session;
        ui.host.querySelector('[data-radio-ptt]').disabled = false;
        status('Connected. Hold to talk; release to listen.');
    } catch (error) { status(error.message); }
    finally { ui.joining = false; }
}

async function leaveBloomscapesRadioUi(ui,status) {
    ++ui.generation;
    const session = ui.session;
    ui.session = null;
    ui.host.querySelector('[data-radio-ptt]').disabled = true;
    try { await closeBloomscapesRadio(session); status('Radio disconnected.'); }
    catch (error) { status(error.message); }
}

function bloomscapesRadioUiCallbacks(ui,status,generation) {
    const current = () => ui.host.isConnected && ui.generation === generation;
    return {
        status:message => { if (current()) status(message); },
        stream:(id,username,stream) => { if (current()) appendBloomscapesRadioAudio(ui.host,id,username,stream,status); },
        remove:id => ui.host.querySelector('[data-radio-peer="'+id+'"]')?.remove(),
        card:(username,row) => {
            if (!current()) return;
            const card = document.createElement('p');
            card.textContent = [username,row.commonname,row.itemcode,row.locationcode,row.lotcode,'On Hand '+row.ptronhand].join(' · ');
            ui.host.querySelector('[data-radio-cards]').appendChild(card);
        }
    };
}

function appendBloomscapesRadioAudio(host,id,username,stream,status) {
    host.querySelector('[data-radio-peer="'+id+'"]')?.remove();
    const audio = document.createElement('audio');
    audio.dataset.radioPeer = id;
    audio.setAttribute('aria-label','Listen to '+username);
    audio.autoplay = true;
    audio.controls = true;
    audio.srcObject = stream;
    host.querySelector('[data-radio-audio]').appendChild(audio);
    void audio.play().catch(() => status('Tap the audio play control to listen.'));
}

function bindBloomscapesPushToTalk(ui) {
    const button = ui.host.querySelector('[data-radio-ptt]');
    const stop = () => { setBloomscapesRadioSpeaking(ui.session,false); button.textContent = 'Hold to talk'; };
    button.addEventListener('pointerdown',event => {
        if (button.disabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        setBloomscapesRadioSpeaking(ui.session,true);
        button.textContent = 'Talking…';
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture','blur']) button.addEventListener(type,stop);
    button.addEventListener('keydown',event => {
        if (![' ','Enter'].includes(event.key) || event.repeat) return;
        event.preventDefault();
        setBloomscapesRadioSpeaking(ui.session,true);
        button.textContent = 'Talking…';
    });
    button.addEventListener('keyup',stop);
}

function bindBloomscapesRadioForms(ui,status) {
    ui.host.querySelector('[data-radio-direct]').addEventListener('submit',async event => {
        event.preventDefault();
        try {
            const username = new FormData(event.currentTarget).get('username');
            const id = await createBloomscapesDirectRadio(String(username));
            await leaveBloomscapesRadioUi(ui,status);
            await refreshBloomscapesRadioChoices(ui.host,id);
            status('Direct channel selected. Join to talk.');
        } catch (error) { status(error.message); }
    });
    ui.host.querySelector('[data-radio-card]').addEventListener('submit',async event => {
        event.preventDefault();
        const input = Object.fromEntries(new FormData(event.currentTarget));
        try { await shareBloomscapesRadioCard(ui.session,input.rowId,input.farm); status('Item / Block card shared.'); }
        catch (error) { status(error.message); }
    });
}
