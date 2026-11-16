const bloomscapesMessagesState={owner:'',farm:'',rows:[],unread:0,access:'HIDDEN',channel:null,pending:null,generation:0,retryAt:0};

async function refreshBloomscapesMessages() {
    const state=bloomscapesMessagesState;
    if (!nativeAuthSessionActive || !state.owner || Date.now()<state.retryAt) return;
    if (state.pending) return state.pending;
    const owner=state.owner,farm=state.farm,generation=state.generation;
    state.pending=readBloomscapesMessages(farm).then(data=>{
        if (state.owner!==owner || generation!==state.generation || getBloomscapesFarm()!==farm) return;
        state.rows=data.rows;state.unread=data.unread;state.access=data.access;state.readAt=data.readAt;state.retryAt=0;
        syncBloomscapesHomeBadges();renderBloomscapesMessageRows();
    }).catch(error=>{if(generation===state.generation) state.retryAt=Date.now()+15000;throw error;})
        .finally(()=>{if (generation===state.generation) state.pending=null;});
    return state.pending;
}

function reportBloomscapesMessagesFailure(error) {
    globalThis.reportHandledRuntimeIssue?.('messages',error.code || 'MESSAGES_READ_FAILED');
    const status=document.querySelector('[data-bloomscapes-messages] [role=status]');
    if (status) status.textContent=error.message;
}

async function dispatchBloomscapesMessage(form) {
    if (form.dataset.busy==='true') return;
    const state=bloomscapesMessagesState,owner=state.owner,farm=state.farm,generation=state.generation;
    const input={farm,body:form.elements.body.value.trim(),recipient:form.elements.recipient.value.trim()};
    if (!input.body) return;
    const signature=JSON.stringify(input);
    const attempt=form.messageAttempt?.signature===signature?form.messageAttempt:{...input,id:crypto.randomUUID(),signature};
    form.messageAttempt=attempt;form.dataset.busy='true';
    try {
        await sendBloomscapesMessage(attempt);
        if (!form.isConnected || state.owner!==owner || state.generation!==generation) return;
        form.elements.body.value='';form.messageAttempt=null;
        await refreshBloomscapesMessages();
    } catch(error) {reportBloomscapesMessagesFailure(error);}
    finally {form.dataset.busy='false';}
}

async function markBloomscapesMessagesRead() {
    const state=bloomscapesMessagesState,owner=state.owner,farm=state.farm,generation=state.generation;
    if (!state.readAt || !state.unread) return;
    await acknowledgeBloomscapesMessages(farm,state.readAt);
    if (state.owner!==owner || generation!==state.generation) return;
    await refreshBloomscapesMessages();
}
