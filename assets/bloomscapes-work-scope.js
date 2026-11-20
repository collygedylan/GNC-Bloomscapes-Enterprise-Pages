function planBloomscapesWorkSelection(input,source,selection) {
    if (selection==null) return [input];
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
function groupBloomscapesStudioRows(rows,mode,resolve=resolveCanonicalInventoryRow) {
    const groups=new Map(),seen=new Set();
    for (const source of rows) {
        const row=resolve(source);
        const id=String(row.UNIQUE_ID || row.unique_id || '');
        const farm=bloomscapesRowFarm(row);
        const physicalKey=JSON.stringify([farm,id]);
        if (!id || seen.has(physicalKey)) continue;
        seen.add(physicalKey);
        const item=String(row.ITEMCODE || row.itemcode || '');
        const loc=String(row.LOCATIONCODE || row.locationcode || '');
        const season=String(row.SEASON || row.season || '');
        const key=JSON.stringify([farm,loc,item || id,mode==='season'?season:'',mode==='row'?id:'']);
        const group=groups.get(key) || {row,item,loc,season,ids:[],onHand:0,complete:true};
        const raw=row.PTRONHAND ?? row.ptronhand;
        const amount=String(raw ?? '').trim().replaceAll(',','');
        if (amount!=='' && Number.isFinite(Number(amount))) group.onHand+=Number(amount);
        else group.complete=false;
        group.ids.push(id);
        groups.set(key,group);
    }
    return [...groups.values()];
}

function renderBloomscapesStudioScopes(host,list,rows,state) {
    const tools=host.querySelector('[data-work-group-selection]');
    const modes=[['item','All Item @ Loc (Total PTRONHAND)'],['season','By Season (Season PTRONHAND)'],['row','Single Row']];
    const mode=state.stockScope || 'item';
    tools.replaceChildren();
    for (const [key,label] of modes) {
        const button=tools.appendChild(document.createElement('button'));
        button.type='button';
        button.dataset.studioScope=key;
        button.setAttribute('aria-pressed',String(key===mode));
        button.textContent=label;
        button.addEventListener('click',()=>{
            state.stockScope=key;
            state.options.onPathChange?.();
            renderBloomscapesStudioScopes(host,list,rows,state);
        });
    }
    const groups=groupBloomscapesStudioRows(rows,mode);
    renderBloomscapesListWindow(list,groups,group=>bloomscapesStudioStockCard(group,mode,state));
}

function bloomscapesStudioStockCard(group,mode,state) {
    const button=document.createElement('button');
    button.type='button';
    button.dataset.studioStockCard=mode;
    button.className='studio-stock-card';
    const title=button.appendChild(document.createElement('strong'));
    title.textContent=group.row.COMMONNAME || group.row.commonname || group.item;
    const identity=[group.item,group.loc];
    if (mode==='season') identity.push(group.season || 'Season unrecorded');
    if (mode==='row') identity.push(group.row.LOTCODE || group.row.lotcode || group.ids[0]);
    button.appendChild(document.createElement('span')).textContent=identity.join(' · ');
    const stock=group.complete?group.onHand.toLocaleString():'Incomplete';
    button.appendChild(document.createElement('span')).textContent='PTRONHAND '+stock+' · '+group.ids.length+' physical '+(group.ids.length===1?'row':'rows');
    button.addEventListener('click',()=>state.onSelect(group.row,group.ids));
    return button;
}
