function planBloomscapesWorkSelection(input,source,selection) {
    if (selection===null) return [input];
    if (!selection.length) return [];
    const rows=bloomscapesWorkSiblingRows(source);
    const ids=rows.map(row=>String(row.UNIQUE_ID || row.unique_id));
    if (new Set(selection).size!==selection.length || selection.some(id=>!ids.includes(id))) throw Error('Selected rows changed; review this location again.');
    if (selection.length===1) return [{...input,sourceId:selection[0],scope:'SINGLE_ROW'}];
    if (selection.length===ids.length) return [{...input,scope:'ITEM_LOCATION'}];
    const selected=rows.filter(row=>selection.includes(String(row.UNIQUE_ID || row.unique_id)));
    const stock=selected.reduce((sum,row)=>sum+Number(row.PTRONHAND ?? row.ptronhand ?? 0),0);
    const quantity=Number(input.quantity);
    if (input.quantity && (!Number.isInteger(quantity) || quantity<selected.length || quantity>stock)) {
        throw Error('Exact total must provide at least one plant per selected row and stay within their On Hand total.');
    }
    let remaining=quantity;
    return selected.map((row,index)=>{
        const onHand=Number(row.PTRONHAND ?? row.ptronhand ?? 0);
        const reserved=selected.slice(index+1).reduce((sum,next)=>sum+Number(next.PTRONHAND ?? next.ptronhand ?? 0),0);
        const amount=Math.min(onHand,remaining-(selected.length-index-1));
        const allocated=Math.max(amount,remaining-reserved);
        remaining-=allocated;
        return {...input,sourceId:String(row.UNIQUE_ID || row.unique_id),scope:'SINGLE_ROW',quantity:input.quantity?String(allocated):''};
    });
}

async function dispatchBloomscapesWorkSelection(state,inputs,farm) {
    const signature=JSON.stringify([farm,inputs]);
    if (state.attempt?.signature!==signature) {
        state.attempt={signature,commands:inputs.map(input=>({id:crypto.randomUUID(),farm,input})),receipts:[]};
    }
    const attempt=state.attempt;
    for (const command of attempt.commands) {
        if (state.owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm()) throw Error('Farm or account changed; retained confirmed work.');
        if (attempt.receipts.some(receipt=>receipt.id===command.id)) continue;
        const receipt=await createBloomscapesFieldWork(command);
        attempt.receipts.push(receipt);
    }
    return attempt.receipts;
}
