function renderBloomscapesCommTimeline() {
    const host=bloomscapesCommHost();
    if (!host) return;
    if (host.closest('#view-push-to-talk')) {renderWalkieClips(host);return;}
    const state=bloomscapesCommState,row=state.conversations.find(item=>item.id===state.selected);
    const title=row?commConversationName(row):'Choose a person or group';
    host.querySelector('[data-comm-thread-heading]').innerHTML='<header class="comm-thread-header"><button type="button" data-comm-inbox>‹ Inbox</button>'
        +'<div><strong>'+commEscape(title)+'</strong><small>'+commEscape(state.farm)+'</small></div>'
        +'<select data-comm-switch aria-label="Switch recipient"><option value="">Switch recipient…</option>'
        +eligibleCommChannels(sortedBloomscapesConversations(),'text').map(item=>'<option value="'+item.id+'"'+(item.id===state.selected?' selected':'')+'>'+commEscape(commConversationName(item))+'</option>').join('')+'</select></header>';
    const thread=state.threads[state.selected],timeline=host.querySelector('[data-comm-timeline]');
    const bottom=timeline.scrollHeight-timeline.clientHeight-timeline.scrollTop<60;
    timeline.innerHTML=(thread?.more?'<button type="button" data-comm-older>Load earlier messages</button>':'')
        +(thread?.rows || []).filter(message=>message.type==='text').map(message=>renderBloomscapesCommBubble(message)).join('')
        +pendingTextBubble(thread)
        +(!thread?.rows?.some(item=>item.type==='text') && !thread?.sending?'<div class="comm-empty"><h3>'+commEscape(title)+'</h3><p>Send a message to start the conversation.</p></div>':'');
    if (bottom) timeline.scrollTop=timeline.scrollHeight;
}

function pendingTextBubble(thread) {
    const command=thread?.command;
    if (!command || !thread.sending || thread.rows?.some(row=>row.id===command.id)) return '';
    return '<article class="comm-bubble is-own" data-pending-text>'+commEscape(command.body)+' <small>Sending…</small></article>';
}

function showPendingCommunicationText(thread) {
    const root=document.querySelector('#view-messages [data-comm-hub]');
    const timeline=root?.querySelector('[data-comm-timeline]');
    if (!timeline) return;
    timeline.querySelector('.comm-empty')?.remove();
    timeline.insertAdjacentHTML('beforeend',pendingTextBubble(thread));
    const submit=root.querySelector('[data-comm-composer] button[type=submit]');
    if (submit) submit.disabled=true;
}

function renderBloomscapesCommBubble(message) {
    const person=getBloomscapesCommPerson(message.sender);
    const own=message.sender===currentUser,voice=message.type==='voice';
    const active=bloomscapesCommPlayback?.id===message.id && !bloomscapesRadioInbox.audio?.paused;
    let body='<p>'+renderMessageReferences(message.body)+'</p>';
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
    if (!host || host.closest('#view-push-to-talk')) return;
    const root=host.querySelector('[data-comm-composer]'),state=bloomscapesCommState;
    const thread=state.threads[state.selected];
    const enabled=eligibleSelectedCommChannel('text') && state.textAccess==='FULL_EDIT' && !state.opening;
    const editor=root.querySelector('textarea');
    if (!editor) root.innerHTML='<form class="comm-text-form"><textarea name="body" data-comm-text maxlength="4000" rows="2" aria-label="Message"></textarea><button type="submit">Send</button></form>';
    const input=root.querySelector('textarea');
    input.disabled=!enabled;
    if (input.value!==(thread?.draft || '')) input.value=thread?.draft || '';
    root.querySelector('button').disabled=!enabled || !!thread?.sending;
    renderBloomscapesCommTimeline();
    host.dataset.mode=state.mode;
}

function dispatchBloomscapesCommClick(event,host) {
    const button=event.target.closest('button');
    if (!button || !host.contains(button)) return;
    const data=button.dataset,state=bloomscapesCommState;
    const actions={commConversation:value=>void selectBloomscapesConversation(value),
        commDirect:()=>{
            const picker=host.querySelector('[data-radio-person]');
            picker.parentElement.hidden=false;
            picker.focus();
        },
        commPerson:value=>void chooseBloomscapesCommPeople([value]),
        commNew:()=>{state.creating=true;renderBloomscapesCommPeople();},
        commCancelNew:()=>{state.creating=false;renderBloomscapesCommPeople();},
        commFilter:value=>{state.filter=value;renderBloomscapesCommList();renderBloomscapesCommPeople();},
        commInbox:()=>{state.mobileThread=false;renderBloomscapesComm();},
        commReference:value=>openMessageReference(button.dataset.kind,value),
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
    if (event.target.matches('[data-radio-person]') && event.target.value) void chooseBloomscapesCommPeople([event.target.value]);
    if (event.target.matches('[data-comm-switch]') && event.target.value) void selectBloomscapesConversation(event.target.value);
    if (event.target.matches('[data-comm-autoplay]')) changeBloomscapesRadioStandby(event);
}

async function submitBloomscapesComm(form) {
    if (!form.matches('.comm-create')) return dispatchBloomscapesCommText();
    const values=new FormData(form),people=values.getAll('people');
    if (!people.length) return showBloomscapesCommStatus('Choose at least one person.');
    await chooseBloomscapesCommPeople(people,String(values.get('title') || ''));
}

function renderMessageReferences(body) {
    const pieces=String(body || '').split(/(\b(?:itemcode|location|dock)[:# ]+[-.\w]+)/gi);
    return pieces.map((piece,index)=>{
        if (index%2===0) return commEscape(piece);
        const [,kind,value]=piece.match(/^(itemcode|location|dock)[:# ]+([-.\w]+)$/i);
        return '<button type="button" data-comm-reference="'+commEscape(value)+'" data-kind="'+kind.toLowerCase()+'">'+commEscape(piece)+'</button>';
    }).join('');
}

function openMessageReference(kind,value) {
    const target=kind==='dock'?'docks':'drive';
    if (!canAccessView(target)) return showBloomscapesCommStatus('Access unavailable.');
    switchView(target);
    const search=document.querySelector('#'+target+'-search');
    if (search) {search.value=value;search.dispatchEvent(new Event('input',{bubbles:true}));}
}
