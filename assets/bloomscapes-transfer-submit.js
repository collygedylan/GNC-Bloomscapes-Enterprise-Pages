async function submitBloomscapesTransferOrder(attempt) {
    const {client,owner}=await requireBloomscapesSession();
    const result=await client.rpc('gnc_submit_transfer_order',{p_request_id:attempt.requestId,
        p_origin:attempt.origin,p_lines:attempt.input});
    await requireBloomscapesOwner(owner);
    return bloomscapesData(result);
}
