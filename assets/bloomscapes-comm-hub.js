function commEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function renderBloomscapesCommHub() {
    return '<section data-comm-hub aria-label="Walkie & Direct Messenger"><header class="comm-heading"><div>'
        +'<small>STAY CONNECTED · BLOOMSCAPES</small><h2>Walkie &amp; Direct Messenger</h2></div>'
        +'<label class="comm-autoplay"><input type="checkbox" data-comm-autoplay> 🔊 Live Walkie Auto-Play</label></header>'
        +'<div class="comm-layout"><aside class="comm-inbox"><div class="comm-search"><input data-comm-search aria-label="Search people, crews, or conversations" '
        +'placeholder="Search people, crews, or conversations..."><button type="button" data-comm-new>+ New Walkie / Text</button></div>'
        +'<nav class="comm-filters" aria-label="Conversation filters">'
        +[['all','All'],['recent','Recent People'],['unread','Unread / Unplayed'],['direct','Direct (1-on-1)'],['groups','Departments & Farms']]
            .map(([key,label])=>'<button type="button" data-comm-filter="'+key+'">'+label+'</button>').join('')
        +'</nav><div data-comm-people></div><div data-comm-list></div></aside>'
        +'<section class="comm-thread" aria-label="Conversation"><div data-comm-thread-heading></div>'
        +'<div data-comm-timeline role="log" aria-live="polite"></div><div data-comm-composer></div></section></div>'
        +'<p data-comm-status role="status"></p></section>';
}

function bloomscapesCommHost() {
    const view=getCurrentVisibleViewId();
    return document.querySelector('#view-'+view+' [data-comm-hub]');
}

function isBloomscapesCommVisible() {return !!bloomscapesCommHost();}

function mountBloomscapesCommHub(container) {
    const host=container.querySelector('[data-comm-hub]');
    if (!host || host.dataset.mounted) return;
    host.dataset.mounted='true';
    host.addEventListener('click',event=>dispatchBloomscapesCommClick(event,host));
    host.addEventListener('input',event=>inputBloomscapesComm(event));
    host.addEventListener('change',event=>changeBloomscapesComm(event));
    host.addEventListener('submit',event=>{event.preventDefault();void submitBloomscapesComm(event.target);});
    bindBloomscapesWalkieButton(host);
    scopeBloomscapesComm();renderBloomscapesComm();
    void refreshBloomscapesComm().catch(error=>showBloomscapesCommStatus(error.message));
}

function renderBloomscapesComm() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState;
    host.dataset.threadOpen=String(state.mobileThread);host.dataset.mode=state.mode;
    host.querySelector('[data-comm-autoplay]').checked=bloomscapesRadioAutoPlay();
    renderBloomscapesCommList();renderBloomscapesCommPeople();renderBloomscapesCommTimeline();renderBloomscapesCommComposer();
    showBloomscapesCommStatus(state.status);
}

function matchesBloomscapesComm(row) {
    const state=bloomscapesCommState,query=state.search.trim().toLowerCase();
    const text=[commConversationName(row),row.title,...(row.participant_usernames || []),row.last?.body].join(' ').toLowerCase();
    if (query && !query.split(/\s+/).every(word=>text.includes(word))) return false;
    if (state.filter==='recent') return !!row.last;
    if (state.filter==='unread') return row.unread>0;
    if (state.filter==='direct') return !row.is_group;
    if (state.filter==='groups') return row.is_group;
    return true;
}

function renderBloomscapesCommList() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState,rows=sortedBloomscapesConversations().filter(matchesBloomscapesComm);
    host.querySelectorAll('[data-comm-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.commFilter===state.filter)));
    host.querySelector('[data-comm-list]').innerHTML=rows.map(row=>commInboxRow(row)).join('') || '<p class="comm-empty">No conversations yet. Choose a person to get started.</p>';
}

function commInboxRow(row) {
    const name=commConversationName(row),last=row.last;
    const preview=last?(last.type==='voice'?'🎙 Voice Walkie ('+commDuration(last.duration_ms)+')':'💬 Text')+' · '+(last.body || 'Tap to listen'):'Start a voice or text conversation';
    const username=row.participant_usernames?.find(user=>user!==currentUser),person=bloomscapesCommState.people.find(user=>user.username===username);
    const farm=person?.farms?.join(' / ') || bloomscapesCommState.farm;
    return '<button type="button" class="comm-person" data-comm-conversation="'+row.id+'" aria-current="'+(row.id===bloomscapesCommState.selected)+'">'
        +'<span class="comm-avatar">'+commEscape(name.slice(0,2).toUpperCase())+commActivityDot(person)+'</span><span class="comm-person-copy"><strong>'+commEscape(name)+'</strong>'
        +'<small>'+commEscape(farm+' · '+(person?.role || 'Group'))+'</small><span>'+commEscape(preview)+'</span></span>'
        +'<span class="comm-person-meta"><time>'+commTime(last?.created_at)+'</time>'+(row.unread>0?'<b class="comm-badge">'+row.unread+'</b>':'')+'</span></button>';
}

function renderBloomscapesCommPeople() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState,query=state.search.toLowerCase();
    const people=state.people.filter(user=>user.username!==currentUser && [user.name,user.username,user.role,...user.farms].join(' ').toLowerCase().includes(query));
    const root=host.querySelector('[data-comm-people]');
    if (state.creating) {
        root.innerHTML='<form class="comm-create"><h3>New Walkie / Text</h3><input name="title" maxlength="100" placeholder="Group name (optional)" aria-label="Group name">'
            +'<div class="comm-picker">'+people.map(person=>'<label><input type="checkbox" name="people" value="'+commEscape(person.username)+'">'
            +commEscape(person.name)+' <small>'+commEscape(person.role+' · '+person.farms.join(' / '))+'</small></label>').join('')
            +'</div><button type="submit">Open conversation</button><button type="button" data-comm-cancel-new>Cancel</button></form>';
        return;
    }
    const show=state.filter==='all' || state.filter==='direct';
    root.innerHTML=show?'<details class="comm-directory"'+(!state.conversations.some(row=>row.last)?' open':'')+'><summary>People directory · '+people.length+'</summary>'
        +people.map(person=>'<button type="button" data-comm-person="'+commEscape(person.username)+'"><span class="comm-avatar">'
        +commEscape(person.name.slice(0,2).toUpperCase())+commActivityDot(person)+'</span><span><strong>'+commEscape(person.name)+'</strong><small>'
        +commEscape(person.role+' · '+person.farms.join(' / '))+'</small><small>'+(person.active?'Active in the last 5 minutes':'Activity unknown')+'</small></span></button>').join('')+'</details>':'';
}

function commActivityDot(person) {
    return '<i class="comm-activity '+(person?.active?'is-active':'')+'" title="'+(person?.active?'Active in the last 5 minutes':'Activity unknown')+'"></i>';
}

function commDuration(milliseconds) {return '0:'+String(Math.round((milliseconds || 0)/1000)).padStart(2,'0');}
function commTime(value) {return value?commEscape(new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})):'';}

function openBloomscapesComm(mode='voice') {
    if (!nativeAuthSessionActive) return switchView('communication');
    bloomscapesCommState.mode=mode;
    if (mode==='text') return openBloomscapesMessages();
    return openBloomscapesDepartmentModule('communication','bloomscapes-radio');
}

function syncBloomscapesCommLifecycle(view) {
    if (['communication','chat'].includes(view) || view==='managers' && activeHomeTab==='bloomscapes-radio') return;
    stopBloomscapesWalkie(true);releaseBloomscapesCommAudio();
}
