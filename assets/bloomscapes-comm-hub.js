function commEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function renderBloomscapesCommHub(view) {
    if (view==='push-to-talk') return renderWalkieShell();
    return '<section data-comm-hub aria-label="Messages"><header class="comm-heading"><h2>Messages</h2></header>'
        +'<div class="comm-layout"><aside class="comm-inbox"><div class="comm-search"><input data-comm-search aria-label="Search people, crews, or conversations" '
        +'placeholder="Search people, crews, or conversations..."><button type="button" data-comm-new>New conversation</button></div>'
        +'<nav class="comm-filters" aria-label="Conversation filters">'
        +[['all','All'],['recent','Recent People'],['unread','Unread'],['direct','Direct (1-on-1)'],['groups','Departments & Farms']]
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

function isBloomscapesCommVisible() {return getCurrentVisibleViewId()==='messages' && !!bloomscapesCommHost();}

function mountBloomscapesCommHub(container) {
    const host=container.querySelector('[data-comm-hub]');
    if (!host || host.dataset.mounted) return;
    host.dataset.mounted='true';
    host.addEventListener('click',event=>dispatchBloomscapesCommClick(event,host));
    host.addEventListener('input',event=>inputBloomscapesComm(event));
    host.addEventListener('change',event=>changeBloomscapesComm(event));
    host.addEventListener('submit',event=>{event.preventDefault();void submitBloomscapesComm(event.target);});
    if (container.id==='view-push-to-talk') bindBloomscapesWalkieButton(host);
    scopeBloomscapesComm();renderBloomscapesComm();
    void refreshBloomscapesComm().catch(error=>showBloomscapesCommStatus(error.message));
}

function renderBloomscapesComm() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState;
    host.dataset.threadOpen=String(state.mobileThread);host.dataset.mode=state.mode;
    if (host.closest('#view-push-to-talk')) {renderWalkieControls(host);return;}
    renderBloomscapesCommList();renderBloomscapesCommPeople();renderBloomscapesCommComposer();
    showBloomscapesCommStatus(state.status);
}

function matchesBloomscapesComm(row) {
    const state=bloomscapesCommState,query=state.search.trim().toLowerCase().replace(/^[@#]/,'');
    const text=[commConversationName(row),row.title,...(row.participant_usernames || []),row.last?.body].join(' ').toLowerCase();
    if (query && !query.split(/\s+/).every(word=>text.includes(word))) return false;
    if (state.filter==='recent') return !!row.last;
    if (state.filter==='unread') return row.unreadText>0;
    if (state.filter==='direct') return !row.is_group;
    if (state.filter==='groups') return row.is_group;
    return true;
}

function renderBloomscapesCommList() {
    const host=bloomscapesCommHost();
    if (!host?.querySelector('[data-comm-list]')) return;
    const state=bloomscapesCommState,rows=sortedBloomscapesConversations().filter(matchesBloomscapesComm);
    host.querySelectorAll('[data-comm-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.commFilter===state.filter)));
    const list=host.querySelector('[data-comm-list]');
    renderBloomscapesListWindow(list,rows,row=>bloomscapesListNode(commInboxRow(row)),
        'No conversations yet. Choose a person to get started.',Number(list.dataset.page),page=>{list.dataset.page=page;},12);
}

function commInboxRow(row) {
    const name=commConversationName(row),last=row.last;
    const preview=last?.type==='text'?last.body || 'Text message':'Open conversation';
    const username=row.participant_usernames?.find(user=>user!==currentUser),person=getBloomscapesCommPerson(username);
    const farm=person?.farms?.join(' / ') || bloomscapesCommState.farm;
    return '<button type="button" class="comm-person" data-comm-conversation="'+row.id+'" aria-current="'+(row.id===bloomscapesCommState.selected)+'">'
        +'<span class="comm-avatar">'+commEscape(name.slice(0,2).toUpperCase())+commActivityDot(person)+'</span><span class="comm-person-copy"><strong>'+commEscape(name)+'</strong>'
        +'<small>'+commEscape(farm+' · '+(person?.role || 'Group'))+'</small><span>'+commEscape(preview)+'</span></span>'
        +'<span class="comm-person-meta"><time>'+commTime(last?.created_at)+'</time>'+(row.unreadText>0?'<b class="comm-badge">'+row.unreadText+'</b>':'')+'</span></button>';
}

function renderBloomscapesCommPeople() {
    const host=bloomscapesCommHost();
    if (!host) return;
    const state=bloomscapesCommState,query=state.search.toLowerCase().replace(/^@/,'');
    const people=eligibleCommPeople('text').filter(user=>[user.name,user.username,user.role,...user.farms].join(' ').toLowerCase().includes(query));
    const root=host.querySelector('[data-comm-people]');
    if (state.creating) return renderCommRecipientForm(root,people);
    const show=state.filter==='all' || state.filter==='direct';
    const wasOpen=root.querySelector('details')?.open;
    root.innerHTML=show?'<details class="comm-directory"><summary>People directory · '+people.length+'</summary><div></div></details>':'';
    const directory=root.firstElementChild;
    if (!directory) return;
    directory.open=wasOpen ?? !state.conversations.some(row=>row.last);
    const populate=()=>renderBloomscapesListWindow(directory.lastChild,people,person=>bloomscapesListNode(commDirectoryPerson(person)),
        '',Number(root.dataset.page),page=>{root.dataset.page=page;},12);
    directory.ontoggle=()=>{if (directory.open && !directory.lastChild.childElementCount) populate();};
    if (directory.open) populate();
}

function commDirectoryPerson(person) {
    return '<button type="button" data-comm-person="'+commEscape(person.username)+'"><span class="comm-avatar">'
        +commEscape(person.name.slice(0,2).toUpperCase())+commActivityDot(person)+'</span><span><strong>'+commEscape(person.name)+'</strong><small>'
        +commEscape(person.role+' · '+person.farms.join(' / '))+'</small><small>'+(person.active?'Active in the last 5 minutes':'Activity unknown')+'</small></span></button>';
}

function renderCommRecipientForm(root,people) {
    let form=root.querySelector('.comm-create');
    if (!form) {
        root.innerHTML='<form class="comm-create"><h3>New conversation</h3><input name="title" maxlength="100" placeholder="Group name (optional)" aria-label="Group name">'
            +'<div class="comm-picker"></div><button type="submit">Open conversation</button><button type="button" data-comm-cancel-new>Cancel</button></form>';
        form=root.firstElementChild;
        const selected=new Set();
        form.addEventListener('change',event=>{
            if (event.target.name!=='people') return;
            if (event.target.checked) selected.add(event.target.value);
            else selected.delete(event.target.value);
        });
        form.addEventListener('formdata',event=>{
            event.formData.delete('people');
            for (const name of selected) event.formData.append('people',name);
        });
        form.selectedPeople=selected;
    }
    const build=person=>bloomscapesListNode('<label><input type="checkbox" name="people" value="'+commEscape(person.username)+'"'
        +(form.selectedPeople.has(person.username)?' checked':'')+'>'+commEscape(person.name)+' <small>'
        +commEscape(person.role+' · '+person.farms.join(' / '))+'</small></label>');
    renderBloomscapesListWindow(form.querySelector('.comm-picker'),people,build,'',Number(form.dataset.page),page=>{form.dataset.page=page;},12);

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
    return switchView('push-to-talk');
}

function syncBloomscapesCommLifecycle(view) {
    if (view==='push-to-talk') return;
    stopBloomscapesWalkie(true);releaseBloomscapesCommAudio();
}
