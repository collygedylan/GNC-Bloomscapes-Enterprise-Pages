
function suspendField(row,key) {
    return String(canonicalInventoryValue(row,key.toUpperCase()) ?? '').trim();
}

function suspendOrderOrigin(row) {
    return suspendField(row,'orig_line_key') || suspendField(row,'suspend_origin_uid') || getDockSuspendDcRequestSourceUid(row);
}

function suspendOrderGroup(row) {
    return JSON.stringify([suspendOrderOrigin(row), normalizeDockViewDockKey(suspendField(row,'dock_num') || suspendField(row,'dock')),
        normalizeDockViewStopKey(getDockStopOrDropValue(row)), suspendField(row,'customername').toUpperCase(),
        suspendField(row,'consigneename').toUpperCase(), suspendField(row,'salesrepname').toUpperCase()]);
}

function suspendOrderQuantity(row) {
    const quantity = parseAppNumber(suspendField(row,'suspend_order_quantity') || getDockOrderedQtyDisplay(row));
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}

function suspendPhysicalChoice(row) {
    return {itemcode:suspendField(row,'itemcode'),locationcode:suspendField(row,'locationcode'),lotcode:suspendField(row,'lotcode'),
        description:suspendField(row,'description') || suspendField(row,'commonname')};
}

function sameSuspendChoice(left,right) {
    return ['itemcode','locationcode','lotcode'].every(key =>
        suspendField(left,key).toUpperCase() === suspendField(right,key).toUpperCase());
}

function suspendAllocationValid(allocations, quantity, mode) {
    if (!quantity || !allocations.length || (mode==='full' ? allocations.length!==1 : allocations.length<2)) return false;
    const sources = new Set(), physical = new Set();
    for (const entry of allocations) {
        const key = JSON.stringify([entry.itemcode,entry.locationcode,entry.lotcode]);
        if (!entry.source_uid || !entry.itemcode || !entry.locationcode || isFalseBlockLocation(entry.locationcode)
            || sources.has(entry.source_uid) || physical.has(key) || !Number.isSafeInteger(entry.qty) || entry.qty < 1) return false;
        sources.add(entry.source_uid);
        physical.add(key);
    }
    return allocations.reduce((total,row)=>total+row.qty,0)===quantity;
}

function matchesSuspendFulfillmentReceipt(command,receipt) {
    const {source,id,input} = command;
    if (receipt?.ok!==true || receipt.warehouse!=='10-PH' || receipt.command_id!==id || receipt.mode!==input.mode
        || receipt.source_uid!==getDockSuspendDcRequestSourceUid(source) || receipt.origin_uid!==suspendOrderOrigin(source)) return false;
    if (input.mode==='add' || input.mode==='replace') {
        const [row] = receipt.rows || [];
        return receipt.rows?.length===1 && !!row.unique_id && suspendOrderGroup(row)===suspendOrderGroup(source)
            && (input.mode==='add' ? row.unique_id==='sopt:'+id && row.suspend_candidate_state==='option' : row.unique_id===receipt.source_uid)
            && sameSuspendChoice(row,input);
    }
    const removed = new Set(receipt.removed_ids);
    if (!Array.isArray(receipt.rows) || receipt.rows.length!==removed.size || !receipt.rows.every(row=>removed.has(row.unique_id)
        && suspendOrderGroup(row)===suspendOrderGroup(source)) || !Array.isArray(receipt.removed_ids) || !removed.has(receipt.source_uid) || !removed.has(receipt.origin_uid)
        || receipt.dock_rows?.length!==input.allocations.length) return false;
    return receipt.dock_rows.every((row,index)=>{
        const allocation = input.allocations[index];
        const uid = index ? 'sfill:'+id+':'+(index+1) : receipt.origin_uid;
        return removed.has(allocation.source_uid) && row.unique_id===uid && suspendOrderGroup(row)===suspendOrderGroup(source)
            && sameSuspendChoice(row,allocation) && Number(row.quantityordered)===allocation.quantity
            && row.suspend_candidate_state==='fulfilled' && !row.suspend && !row.suspend_to;
    });
}
