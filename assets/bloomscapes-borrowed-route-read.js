async function readBloomscapesBorrowedWorkRoutes(farm) {
    const {client,owner}=await requireBloomscapesSession();
    const result=await client.rpc('gnc_borrowed_work_routes',{p_farm:farm}).abortSignal(AbortSignal.timeout(4500));
    const routes=bloomscapesData(result);
    await requireBloomscapesOwner(owner);
    if (!Array.isArray(routes) || routes.some(value=>typeof value!=='string')) throw Error('Borrowed work route response invalid');
    return routes;
}
async function readBloomscapesSplitOrderDocuments(farm,audience,offset) {
    const {client,owner}=await requireBloomscapesSession();
    const result=await client.rpc('gnc_split_order_documents',{p_farm:farm,p_audience:audience,p_offset:offset})
        .abortSignal(AbortSignal.timeout(6500));
    await requireBloomscapesOwner(owner);
    const rows=bloomscapesData(result);
    if (!Array.isArray(rows)) throw Error('Order line documents unavailable');
    return rows;
}
