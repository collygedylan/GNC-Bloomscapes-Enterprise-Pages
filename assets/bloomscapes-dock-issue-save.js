async function saveDockIssueStatusPayloads(payloads=[]) {
    const rows=(Array.isArray(payloads)?payloads:[payloads]).filter(Boolean);
    return saveBloomscapesDockIssueRows('ph_dock_issue_status',rows,'issue_source_unique_id');
}

async function saveDockIssueStatusPayload(payload=null) {
    return saveDockIssueStatusPayloads(payload?[payload]:[]);
}

async function saveDockIssueAllocationPayloads(parentPayload=null,payloads=[],options={}) {
    const rows=(Array.isArray(payloads)?payloads:[payloads]).filter(Boolean);
    if (!rows.length) return [];
    if (parentPayload && options.parentAlreadySaved!==true) await saveDockIssueStatusPayload(parentPayload);
    return saveBloomscapesDockIssueRows('ph_dock_issue_allocations',rows,'allocation_unique_id');
}

async function saveBloomscapesDockIssueRows(table,rows,key) {
    if (!rows.length) return [];
    const {client,owner}=await requireBloomscapesSession();
    const farm=getBloomscapesFarm();
    const sources=new Set(socInventory.filter(bloomscapesFarmRowIsVisible).map(row=>String(row.UNIQUE_ID || row.unique_id)));
    if (rows.length>100 || rows.some(row=>!row[key] || !sources.has(row.issue_source_unique_id))) {
        throw new Error('Dock issue source did not match the active farm.');
    }
    const result=await client.from(table).upsert(rows,{onConflict:key}).select(key==='issue_source_unique_id'?key:key+',issue_source_unique_id');
    await requireBloomscapesOwner(owner);
    if (getBloomscapesFarm()!==farm) throw new Error('Active farm changed during the Dock save.');
    const saved=bloomscapesData(result);
    if (!Array.isArray(saved) || saved.length!==rows.length || rows.some(row=>!saved.some(receipt=>receipt[key]===row[key]
        && receipt.issue_source_unique_id===row.issue_source_unique_id))) throw new Error('Dock issue receipt did not match.');
    return saved;
}

async function deleteBloomscapesDockIssueAllocations(source,ids) {
    if (!ids.length) return [];
    const {client,owner}=await requireBloomscapesSession();
    const result=await client.from('ph_dock_issue_allocations').delete().eq('issue_source_unique_id',source)
        .in('allocation_unique_id',ids).select('allocation_unique_id');
    await requireBloomscapesOwner(owner);
    const rows=bloomscapesData(result);
    if (!Array.isArray(rows) || rows.length!==ids.length) throw new Error('Dock allocation removal was not confirmed.');
    return rows;
}
