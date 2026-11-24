async function requestOrderPull(action, input = {}) {
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_order_pull',{p_action:action,p_input:input}));
    await requireBloomscapesOwner(owner);
    const identityMatches = Object.entries(input).every(([key,value]) => receipt?.input?.[key] === value);
    if (!identityMatches || receipt?.ok !== true || receipt.warehouse !== '10-PH' || receipt.action !== action
        || !Array.isArray(receipt.rows) || receipt.buggy && Number(receipt.buggy.cap_wdu) !== 650) {
        throw new Error('The Order Pulling response did not match this request.');
    }
    return receipt;
}
