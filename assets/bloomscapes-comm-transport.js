async function bloomscapesCommRpc(name,parameters) {
    const {client,owner}=await requireBloomscapesSession();
    const result=bloomscapesData(await client.rpc(name,parameters).abortSignal(AbortSignal.timeout(10000)));
    await requireBloomscapesOwner(owner);
    return result;
}

async function readBloomscapesCommInbox(farm) {
    const data=await bloomscapesCommRpc('gnc_comm_inbox',{p_farm:farm});
    if (data?.farm!==farm || !Array.isArray(data.people) || !Array.isArray(data.conversations)) throw Error('Inbox scope was not confirmed.');
    return data;
}

async function readBloomscapesCommThread(farm,channel,before) {
    const data=await bloomscapesCommRpc('gnc_comm_thread',{p_farm:farm,p_channel:channel,
        p_before:before?.created_at || null,p_before_id:before?.id || null});
    if (data?.farm!==farm || data.channel!==channel || !Array.isArray(data.rows)) throw Error('Conversation scope was not confirmed.');
    return data;
}

async function createBloomscapesCommConversation(farm,people,title) {
    const id=await bloomscapesCommRpc('gnc_comm_conversation',{p_farm:farm,p_people:people,p_title:title});
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Conversation was not confirmed.');
    return id;
}

async function sendBloomscapesCommText(command) {
    const data=await bloomscapesCommRpc('gnc_send_thread_message',{p_id:command.id,p_farm:command.farm,
        p_channel:command.channel,p_body:command.body});
    if (data?.id!==command.id || data.channel_id!==command.channel || data.farm_code!==command.farm
        || data.sender!==currentUser || data.body!==command.body) throw Error('Message was not confirmed.');
    return data;
}

async function acknowledgeBloomscapesCommText(farm,channel,readAt) {
    const data=await bloomscapesCommRpc('gnc_comm_read',{p_farm:farm,p_channel:channel,p_read_at:readAt});
    if (data?.channel!==channel || data.farm!==farm || data.read!==true) throw Error('Read receipt was not confirmed.');
}

async function createBloomscapesWalkieSession(channel,status) {
    const {client,owner}=await requireBloomscapesSession();
    return {client,owner,channelId:channel,stream:new MediaStream(),peers:new Map(),callbacks:{status},closed:false,conversation:true};
}
