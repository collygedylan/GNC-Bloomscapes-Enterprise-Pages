async function saveBloomscapesItemcodeOwners(command) {
    const receipt = await supabaseRpc('set_itemcode_default_owners_v1',{
        p_itemcodes:command.codes,p_assignedto:command.assignee || null,
        p_request_id:command.id,p_farm_code:command.farm
    },{singleWrite:true});
    const result = unwrapEvalAssignmentRpcRow(receipt);
    if (result?.ok!==true || result.command_id!==command.id || result.farm_code!==command.farm
        || result.contractVersion!=='inventory-row-assignments-v1' || !Array.isArray(result.assignments)
        || result.assignments.some(row=>row.farm_code!==command.farm)) {
        throw new Error('The owner receipt did not match this farm and command.');
    }
    return result;
}
