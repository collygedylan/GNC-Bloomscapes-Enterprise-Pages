function renderBloomscapesCommTimeline() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState,row=state.conversations.find(item=>item.id===state.selected);
    const title=row?commConversationName(row):'Choose a person or group';
    host.querySelector('[data-comm-thread-heading]').innerHTML='<header class="comm-thread-header"><button type="button" data-comm-inbox>‹ Inbox</button>'
        +'<div><strong>'+commEscape(title)+'</strong><small>Voice + text · '+commEscape(state.farm)+'</small></div>'
        +'<select data-comm-switch aria-label="Switch recipient"><option value="">Switch recipient…</option>'
        +sortedBloomscapesConversations().map(item=>'<option value="'+item.id+'"'+(item.id===state.selected?' selected':'')+'>'+commEscape(commConversationName(item))+'</option>').join('')+'</select></header>';
    const thread=state.threads[state.selected],timeline=host.querySelector('[data-comm-timeline]');
    const bottom=timeline.scrollHeight-timeline.clientHeight-timeline.scrollTop<60;
    timeline.innerHTML=(thread?.more?'<button type="button" data-comm-older>Load earlier messages</button>':'')
        +(thread?.rows || []).map(message=>renderBloomscapesCommBubble(message)).join('')
        +(!thread?.rows?.length?'<div class="comm-empty"><span>🎙</span><h3>'+commEscape(title)+'</h3><p>Hold to talk, tap to record, or send a text. Every message stays together here.</p></div>':'');
    if (bottom) timeline.scrollTop=timeline.scrollHeight;
}

function renderBloomscapesCommBubble(message) {
    const person=bloomscapesCommState.people.find(user=>user.username===message.sender);
    const own=message.sender===currentUser,voice=message.type==='voice';
    const active=bloomscapesCommPlayback?.id===message.id && !bloomscapesRadioInbox.audio?.paused;
    let body='<p>'+commEscape(message.body)+'</p>';
    if (voice) body='<div class="comm-voice-controls"><button type="button" data-comm-play="'+message.id+'" aria-label="'+(active?'Pause':'Play')+' voice Walkie">'
        +(active?'Ⅱ Pause':'▶ Play')+'</button><span class="comm-wave '+(active?'is-playing':'')+'" aria-hidden="true">▂▅▃▇▅▂▆▃▅▇▃▂</span>'
        +'<time>'+commDuration(message.duration_ms)+'</time><button type="button" data-comm-speed="'+message.id+'">'
        +(bloomscapesCommPlayback?.id===message.id?bloomscapesRadioInbox.audio?.playbackRate || 1:1)+'x</button></div>'
        +'<small class="comm-receipt">'+(own?'SENT':message.played?'PLAYED':'UNPLAYED')+'</small><p class="comm-transcript">'
        +commEscape(message.body || 'Transcript unavailable · listen to this Walkie')+'</p>';
    return '<article class="comm-bubble '+(own?'is-own ':'')+(voice?'is-voice':'')+'" data-comm-message="'+message.id+'">'
        +'<header><strong>'+commEscape(person?.name || message.sender)+'</strong><time>'+commTime(message.created_at)+'</time></header>'+body+'</article>';
}

function renderBloomscapesCommComposer() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const root=host.querySelector('[data-comm-composer]'),state=bloomscapesCommState;
    host.dataset.mode=state.mode;
    const submit=root.querySelector('[type=submit]');
    if (submit) submit.disabled=state.textAccess!=='FULL_EDIT' || !!state.threads[state.selected]?.sending;
    if (state.opening) {root.innerHTML='<p>Opening selected conversation…</p>';return;}
    if (root.contains(document.activeElement) || bloomscapesWalkieCapture?.speaking) {syncBloomscapesWalkieRecording();return;}
    const row=state.conversations.find(item=>item.id===state.selected);
    if (!row) {root.innerHTML='';return;}
    const name=commConversationName(row),thread=state.threads[row.id] || {},voice=state.voiceAccess==='FULL_EDIT',text=state.textAccess==='FULL_EDIT';
    root.innerHTML='<div class="comm-modes" role="group" aria-label="Choose Voice or Text"><button type="button" data-comm-mode="voice" aria-pressed="'+(state.mode==='voice')+'">🎙 Walkie Voice</button>'
        +'<button type="button" data-comm-mode="text" aria-pressed="'+(state.mode==='text')+'">💬 Type Text</button></div>'
        +'<div class="comm-talk-row"><button type="button" data-comm-talk '+(!voice?'disabled':'')+'>🎙 HOLD TO TALK — OR TAP TO RECORD WALKIE TO '+commEscape(name)+'</button>'
        +'<button type="button" data-comm-cancel-record hidden>Cancel</button><span data-comm-recording role="status"></span></div>'
        +'<form class="comm-text-form"><textarea name="body" data-comm-text maxlength="4000" rows="2" aria-label="Message '+commEscape(name)+'" placeholder="Message '+commEscape(name)+'..."'
        +(!text?' disabled':'')+'>'+commEscape(thread.draft || '')+'</textarea><button type="submit" '+(!text || thread.sending?'disabled':'')+'>Send</button>'
        +'<button type="button" data-comm-mic '+(!voice?'disabled':'')+' aria-label="Record Walkie">🎙 Walkie</button></form>'
        +'<div class="comm-quick-replies">'+['Copy that','On my way','Check Block','Ready on Dock'].map(label=>'<button type="button" data-comm-reply="'+label+'">'+label+'</button>').join('')+'</div>'
        +'<div class="comm-tools"><button type="button" data-comm-retry>Retry unsent Walkies</button><button type="button" data-comm-notifications>Enable notifications</button></div>';
    root.querySelector('[data-comm-talk]').dataset.recordingLabel=root.querySelector('[data-comm-talk]').textContent;
    host.dataset.mode=state.mode;
}

function dispatchBloomscapesCommClick(event,host) {
    const button=event.target.closest('button');
    if (!button || !host.contains(button)) return;
    const data=button.dataset,state=bloomscapesCommState;
    const actions={commConversation:value=>void selectBloomscapesConversation(value),
        commPerson:value=>void chooseBloomscapesCommPeople([value]),
        commNew:()=>{state.creating=true;renderBloomscapesCommPeople();},
        commCancelNew:()=>{state.creating=false;renderBloomscapesCommPeople();},
        commFilter:value=>{state.filter=value;renderBloomscapesCommList();renderBloomscapesCommPeople();},
        commMode:value=>{state.mode=value;document.activeElement?.blur();renderBloomscapesCommComposer();},
        commInbox:()=>{state.mobileThread=false;renderBloomscapesComm();},
        commReply:value=>{draftBloomscapesCommText(value);document.activeElement?.blur();renderBloomscapesCommComposer();},
        commOlder:()=>void selectBloomscapesConversation(state.selected,false,state.threads[state.selected]?.rows?.[0])};
    const key=Object.keys(data).find(name=>actions[name]);
    if (key) actions[key](data[key]);
    else dispatchBloomscapesWalkieClick(data);
}

function inputBloomscapesComm(event) {
    if (event.target.matches('[data-comm-text]')) draftBloomscapesCommText(event.target.value);
    if (!event.target.matches('[data-comm-search]')) return;
    bloomscapesCommState.search=event.target.value;renderBloomscapesCommList();renderBloomscapesCommPeople();
}

function changeBloomscapesComm(event) {
    if (event.target.matches('[data-comm-switch]') && event.target.value) void selectBloomscapesConversation(event.target.value);
    if (event.target.matches('[data-comm-autoplay]')) changeBloomscapesRadioStandby(event);
}

async function submitBloomscapesComm(form) {
    if (!form.matches('.comm-create')) return dispatchBloomscapesCommText();
    const values=new FormData(form),people=values.getAll('people');
    if (!people.length) return showBloomscapesCommStatus('Choose at least one person.');
    await chooseBloomscapesCommPeople(people,String(values.get('title') || ''));
}
