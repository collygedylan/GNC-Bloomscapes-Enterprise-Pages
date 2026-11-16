async function readBloomscapesModuleAccess() {
    const {client,owner}=await requireBloomscapesSession();
    const rows=bloomscapesData(await client.rpc('gnc_module_access_rows'));
    await requireBloomscapesOwner(owner);
    if (!Array.isArray(rows)) throw new Error('Module access response is invalid.');
    return rows;
}

async function saveBloomscapesModuleAccess(row,level) {
    const {client,owner}=await requireBloomscapesSession();
    const receipt=bloomscapesData(await client.rpc('gnc_set_module_access',{p_type:row.subject_type,
        p_subject:row.subject_key,p_view:row.view_key,p_level:level}));
    await requireBloomscapesOwner(owner);
    if (receipt?.subject_type!==row.subject_type || receipt.subject_key!==row.subject_key
        || receipt.view_key!==row.view_key || receipt.access_level!==level) throw new Error('Module access was not confirmed.');
    return receipt;
}
