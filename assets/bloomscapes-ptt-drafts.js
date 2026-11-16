const BLOOMSCAPES_RADIO_DRAFT_DB = 'bloomscapes-radio-drafts-v1';
const bloomscapesRadioVolatileDrafts=new Map();
function hasVolatileBloomscapesRadioDrafts() { return bloomscapesRadioVolatileDrafts.size>0; }
function assertBloomscapesRadioDraftCapacity() {
    if(bloomscapesRadioVolatileDrafts.size>=8)throw Error('Retry unsent calls before recording another call on this device.');
}
function openBloomscapesRadioDrafts() {
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open(BLOOMSCAPES_RADIO_DRAFT_DB,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('calls',{keyPath:'key'});
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
    });
}
async function radioDraftTransaction(mode,operation) {
    const db=await openBloomscapesRadioDrafts();
    try {
        return await new Promise((resolve,reject)=>{
            const transaction=db.transaction('calls',mode);
            const request=operation(transaction.objectStore('calls'));
            transaction.oncomplete=()=>resolve(request.result);
            transaction.onerror=()=>reject(transaction.error);
            transaction.onabort=()=>reject(transaction.error || Error('Radio draft storage was interrupted.'));
        });
    } finally { db.close(); }
}
async function saveBloomscapesRadioDraft(draft) {
    const key=draft.owner+':'+draft.id;
    bloomscapesRadioVolatileDrafts.set(key,draft);
    try {
        await radioDraftTransaction('readwrite',store=>store.put({...draft,key}));
        bloomscapesRadioVolatileDrafts.delete(key);
        return {persisted:true};
    } catch(error) { return {persisted:false,error}; }
}
async function publishBloomscapesRadioDraft(draft) {
    const {client,owner}=await requireBloomscapesSession();
    if (owner!==draft.owner) throw Error('Sign in to the account that recorded this call.');
    const bytes=new Uint8Array(await draft.blob.arrayBuffer());
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const receipt=await bloomscapesRadioRpc(client,draft.conversation?'gnc_publish_comm_voice':'gnc_publish_radio_call',{p_id:draft.id,p_channel:draft.channelId,
        p_farm:draft.farm,p_audio:btoa(binary),p_mime:draft.blob.type,p_duration:draft.duration,
        ...(draft.conversation?{p_transcript:draft.transcript || ''}:{})});
    if (receipt?.id!==draft.id || receipt.saved!==true) throw Error('The radio call has no confirmed save receipt.');
    await requireBloomscapesOwner(owner);
    const key=owner+':'+draft.id;
    bloomscapesRadioVolatileDrafts.delete(key);
    try {await radioDraftTransaction('readwrite',store=>store.delete(key));return receipt;}
    catch(error) {return {...receipt,localCleanupError:error.message};}
}
async function retryBloomscapesRadioDrafts() {
    const {owner}=await requireBloomscapesSession();
    const drafts=new Map([...bloomscapesRadioVolatileDrafts].filter(([,draft])=>draft.owner===owner));
    try {
        const stored=await radioDraftTransaction('readonly',store=>store.getAll(IDBKeyRange.bound(owner+':',owner+':\uffff'),20));
        stored.forEach(draft=>drafts.set(owner+':'+draft.id,draft));
    } catch(error) {if(!drafts.size)throw error;}
    let sent=0;
    for(const draft of [...drafts.values()].slice(0,20)) {
        await publishBloomscapesRadioDraft(draft);
        sent++;
    }
    return sent;
}
