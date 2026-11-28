async function bloomscapesRadioRpc(client,name,parameters={}) {
    return bloomscapesData(await client.rpc(name,parameters).abortSignal(AbortSignal.timeout(8000)));
}

/** @returns {Promise<Array>} Channels available to the current farm and actor. */
async function listBloomscapesRadioChannels() {
    const {client} = await requireBloomscapesSession();
    const channels=await bloomscapesRadioRpc(client,'gnc_radio_channels');
    return channels.filter(channel=>! /^(10-PH|60-HL|20-TX|40-NC) All$/.test(channel.title) || channel.title===getBloomscapesFarm()+' All');
}
