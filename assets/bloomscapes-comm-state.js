const bloomscapesCommState={owner:'',farm:'',people:[],conversations:[],threads:{},selected:'',mode:'voice',filter:'all',
    search:'',mobileThread:false,creating:false,status:'',generation:0,pending:null,retryAt:0,textAccess:'HIDDEN',voiceAccess:'HIDDEN'};

function bloomscapesCommKey() {return 'bloomscapes-comm-v1:'+bloomscapesCommState.owner+':'+bloomscapesCommState.farm;}

function saveBloomscapesCommCache() {
    const state=bloomscapesCommState;
    if (!state.owner) return;
    try {
        const threads=Object.fromEntries(Object.entries(state.threads).slice(-30).map(([id,thread])=>[id,{...thread,sending:false}]));
        localStorage.setItem(bloomscapesCommKey(),JSON.stringify({people:state.people,conversations:state.conversations,threads,selected:state.selected}));
        state.cacheFailed=false;
    } catch {state.cacheFailed=true;state.status='Device storage is unavailable. Keep this window open for unsent text.';}
}

function scopeBloomscapesComm() {
    const state=bloomscapesCommState,owner=nativeAuthSessionActive?nativeAuthProfile?.id || '':'',farm=getBloomscapesFarm();
    if (state.owner===owner && state.farm===farm) return;
    stopBloomscapesWalkie(true);releaseBloomscapesCommAudio();
    Object.assign(state,{owner,farm,people:[],conversations:[],threads:{},selected:'',generation:state.generation+1,pending:null,retryAt:0,
        textAccess:'HIDDEN',voiceAccess:'HIDDEN',status:'',mobileThread:false,creating:false,cacheFailed:false});
    if (!owner) return;
    try {
        const saved=JSON.parse(localStorage.getItem(bloomscapesCommKey()) || 'null');
        if (saved && Array.isArray(saved.people) && Array.isArray(saved.conversations)) Object.assign(state,saved);
    } catch {state.status='Saved conversations could not be read on this device.';}
}

const standardRadioChannels=[
    {slug:'inventory_156',title:'Inventory 156',id:'68a06579-e420-5ecc-86cd-2c9abe3c3098'},
    {slug:'qc_161',title:'QC 161',id:'b11662a2-6aea-5137-bdb6-cf6f504ff9ab'},
    {slug:'shipping_docks_154',title:'Shipping/Docks 154',id:'48632bbb-12ca-5353-a208-f57ef7b4e92e'},
    {slug:'growers',title:'Growers',id:'a568859e-1ba8-50d8-b5bf-0f6ac056395c'}
];

async function readCommunicationDirectory(farm) {
    const inbox=await readBloomscapesCommInbox(farm);
    if (getCurrentVisibleViewId()!=='push-to-talk' || inbox.voiceAccess==='HIDDEN') return inbox;
    const channels=await listBloomscapesRadioChannels();
    const registered=channels.filter(row=>standardRadioChannels.some(channel=>channel.id===row.id && channel.title===row.title));
    for (const row of registered) {
        if (!inbox.conversations.some(existing=>existing.id===row.id)) inbox.conversations.push({...row,participant_usernames:[],unread:0,unreadText:0});
    }
    return inbox;
}

async function refreshBloomscapesComm() {
    if (!window.BloomscapesBatteryGovernor.visible()) return;
    scopeBloomscapesComm();
    const state=bloomscapesCommState;
    const access=bloomscapesCommAccess('inbox');
    if (access===false) return clearUnavailableCommInbox();
    if (!access || !state.owner || Date.now()<state.retryAt) return;
    if (state.pending) return state.pending;
    const generation=state.generation,farm=state.farm;
    state.pending=readCommunicationDirectory(farm).then(async data=>{
        if (generation!==state.generation || getBloomscapesFarm()!==farm || bloomscapesCommAccess('inbox')!==true) return;
        Object.assign(state,{people:data.people,conversations:data.conversations,textAccess:data.textAccess,voiceAccess:data.voiceAccess,retryAt:0});
        if (!state.conversations.some(row=>row.id===state.selected)) state.selected=sortedBloomscapesConversations()[0]?.id || '';
        bloomscapesMessagesState.unread=data.conversations.reduce((sum,row)=>sum+Number(row.unreadText || 0),0);
        syncBloomscapesHomeBadges();saveBloomscapesCommCache();renderBloomscapesComm();
        if (!document.hidden && state.selected && bloomscapesCommHost()) await selectBloomscapesConversation(state.selected,false);
    }).catch(error=>handleCommInboxReadFailure(error,generation))
        .finally(()=>{if(generation===state.generation)state.pending=null;});
    return state.pending;
}

function clearUnavailableCommInbox() {
    const state=bloomscapesCommState;
    state.generation++;
    state.pending=null;
    Object.assign(state,{people:[],conversations:[],threads:{},selected:'',textAccess:'HIDDEN',voiceAccess:'HIDDEN'});
    bloomscapesMessagesState.unread=0;
    syncBloomscapesHomeBadges();
    renderBloomscapesComm();
    showBloomscapesCommStatus('Communications are unavailable for this account.');
}

function handleCommInboxReadFailure(error,generation) {
    const state=bloomscapesCommState;
    if (generation!==state.generation) return;
    state.retryAt=Date.now()+15000;
    const kind=bloomscapesOptionalCommFailure(error);
    if (kind==='denied') return clearUnavailableCommInbox();
    if (kind==='unavailable') return showBloomscapesCommStatus('Inbox refresh is temporarily unavailable.');
    throw error;
}

async function selectBloomscapesConversation(id,drill=true,before=null) {
    const state=bloomscapesCommState,generation=state.generation,farm=state.farm;
    if (state.selected!==id) {stopBloomscapesWalkie(true);releaseBloomscapesCommAudio();}
    state.selected=id;state.mobileThread=drill || state.mobileThread;state.creating=false;
    renderBloomscapesComm();saveBloomscapesCommCache();
    try {
        const data=await readBloomscapesCommThread(farm,id,before);
        if (generation!==state.generation || state.selected!==id || getBloomscapesFarm()!==farm) return;
        const previous=state.threads[id] || {};
        const rows=before?[...data.rows,...(previous.rows || [])]:data.rows;
        state.threads[id]={...previous,rows:[...new Map(rows.map(row=>[row.id,row])).values()],readAt:data.readAt,more:data.rows.length===100};
        state.textAccess=data.textAccess;state.voiceAccess=data.voiceAccess;
        saveBloomscapesCommCache();renderBloomscapesComm();
        await markBloomscapesCommThreadRead(id,data,generation);
    } catch(error) {showBloomscapesCommStatus(error.message);}
}

async function markBloomscapesCommThreadRead(id,data,generation) {
    const state=bloomscapesCommState;
    if (document.hidden || !isBloomscapesCommVisible() || !data.rows.some(row=>row.type==='text' && row.unread)) return;
    await acknowledgeBloomscapesCommText(state.farm,id,data.readAt);
    if (generation!==state.generation) return;
    const conversation=state.conversations.find(row=>row.id===id);
    if (conversation) {conversation.unread=Math.max(0,conversation.unread-conversation.unreadText);conversation.unreadText=0;}
    bloomscapesMessagesState.unread=state.conversations.reduce((sum,row)=>sum+Number(row.unreadText || 0),0);
    saveBloomscapesCommCache();syncBloomscapesHomeBadges();renderBloomscapesCommList();
}

async function chooseBloomscapesCommPeople(people,title='') {
    const state=bloomscapesCommState,generation=state.generation;
    const selection=state.selectionEpoch=(state.selectionEpoch || 0)+1;
    state.opening=true;state.mobileThread=true;state.status='Opening selected conversation…';renderBloomscapesComm();
    try {
        const id=await createBloomscapesCommConversation(state.farm,people,title);
        if (generation!==state.generation || selection!==state.selectionEpoch) return;
        await refreshBloomscapesComm();
        if (generation!==state.generation || selection!==state.selectionEpoch) return;
        applyBloomscapesCommConversationReceipt(id,people,title);
        await selectBloomscapesConversation(id);
        state.status='Conversation ready.';
    } catch(error) {showBloomscapesCommStatus(error.message);}
    finally {
        if (generation===state.generation && selection===state.selectionEpoch) {
            state.opening=false;
            renderBloomscapesComm();
        }
    }
}

function applyBloomscapesCommConversationReceipt(id,people,title) {
    const state=bloomscapesCommState;
    if (state.conversations.some(row=>row.id===id)) return;
    const participants=[...new Set([currentUser,...people])].sort();
    state.conversations.push({id,title:title || participants.join(' ↔ '),is_group:participants.length>2,
        participant_usernames:participants,unread:0,unreadText:0,last:null});
}

function draftBloomscapesCommText(value) {
    const state=bloomscapesCommState,id=state.selected;
    if (!id) return;
    state.threads[id]={...state.threads[id],draft:value};
    saveBloomscapesCommCache();
}

async function dispatchBloomscapesCommText() {
    const state=bloomscapesCommState,id=state.selected,thread=state.threads[id],generation=state.generation;
    const body=thread?.draft?.trim();
    if (!body || thread.sending) return;
    const prior=thread.command,command=prior?.body===body?prior:{id:crypto.randomUUID(),farm:state.farm,channel:id,body};
    thread.command=command;thread.sending=true;thread.sendingId=command.id;
    showPendingCommunicationText(thread);
    try {
        await new Promise(resolve=>setTimeout(resolve,0));
        if (generation!==state.generation || getBloomscapesFarm()!==command.farm) return;
        saveBloomscapesCommCache();
        await sendBloomscapesCommText(command);
        if (generation!==state.generation) return;
        const current=state.threads[id];
        if (current?.sendingId!==command.id) return;
        if (current.draft?.trim()===body) current.draft='';
        current.command=null;state.status='Message saved.';
        await refreshBloomscapesComm();
    } catch(error) {if (generation===state.generation) showBloomscapesCommStatus(error.message+' Your text is saved here; tap Send to retry.');}
    finally {
        const current=state.threads[id];
        if (generation===state.generation && current?.sendingId===command.id) {current.sending=false;delete current.sendingId;}
        saveBloomscapesCommCache();renderBloomscapesCommComposer();
    }
}

function showBloomscapesCommStatus(message) {
    bloomscapesCommState.status=message;
    document.querySelectorAll('[data-comm-status]').forEach(node=>{node.textContent=message;});
    const retry=document.querySelector('[data-radio-panel] [data-comm-retry]');
    if (retry) retry.hidden=!String(message).includes('Retry unsent calls');
}

function getBloomscapesCommPerson(username) {
    const people=bloomscapesCommState.people;
    if (getBloomscapesCommPerson.source!==people) {
        getBloomscapesCommPerson.source=people;
        getBloomscapesCommPerson.index=new Map(people.map(user=>[user.username,user]));
    }
    return getBloomscapesCommPerson.index.get(username);
}

function commConversationName(row) {
    if (row.is_group) return row.title.replace(' All','');
    const person=row.participant_usernames?.find(name=>name!==currentUser);
    return getBloomscapesCommPerson(person)?.name || person || row.title;
}

function sortedBloomscapesConversations() {
    return [...bloomscapesCommState.conversations].sort((a,b)=>
        String(b.last?.created_at || '').localeCompare(a.last?.created_at || '') || commConversationName(a).localeCompare(commConversationName(b)));
}
