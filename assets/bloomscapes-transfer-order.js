const BLOOMSCAPES_TRANSFER_ORIGINS=['60-HL','40-NC','20-TX'];
let bloomscapesTransferState={owner:'',lines:[],revision:0,pending:new Map()};

function bloomscapesTransferOwner() {
    return String(nativeAuthProfile?.id || currentUser || '');
}

function getBloomscapesTransferState() {
    const owner=bloomscapesTransferOwner();
    if (bloomscapesTransferState.owner!==owner) {
        bloomscapesTransferState={owner,lines:[],revision:0,pending:new Map()};
        try {
            const saved=JSON.parse(sessionStorage.getItem('gnc_transfer_draft_v1:'+owner) || 'null');
            if (saved?.owner===owner && Array.isArray(saved.lines) && saved.lines.every(validBloomscapesTransferLine)) bloomscapesTransferState.lines=saved.lines;
        } catch { globalThis.reportHandledRuntimeIssue?.('transfer_draft_restore','TRANSFER_DRAFT_STORAGE_FAILED'); }
    }
    return bloomscapesTransferState;
}

function validBloomscapesTransferLine(line) {
    return line && typeof line.id==='string' && typeof line.poId==='string' && typeof line.targetId==='string'
        && BLOOMSCAPES_TRANSFER_ORIGINS.includes(line.origin) && typeof line.blockKey==='string'
        && Number.isSafeInteger(line.quantity) && line.quantity>0 && Number.isFinite(line.cpb) && line.cpb>0;
}

function saveBloomscapesTransferDraft(state) {
    state.revision++;
    try {sessionStorage.setItem('gnc_transfer_draft_v1:'+state.owner,JSON.stringify({owner:state.owner,lines:state.lines}));}
    catch {globalThis.reportHandledRuntimeIssue?.('transfer_draft_save','TRANSFER_DRAFT_STORAGE_FAILED');}
}

function bloomscapesTransferBlockKey(target) {
    const parts=String(target.locationcode || '').split('.');
    return ['10-PH',target.blockalpha || parts[0],String(target.blocknumber || parts[1] || '').replace(/^0+/, '')].join(':');
}

function bloomscapesTransferProjection(po,target,excludeId='') {
    const lines=getBloomscapesTransferState().lines.filter(line=>line.id!==excludeId);
    const blockKey=bloomscapesTransferBlockKey(target);
    const cpb=Number(target.cpb),total=Number(target.block_total_beds ?? target.bed_capacity);
    const occupied=Number(target.occupied_beds),queued=Number(target.queued_beds || 0);
    const measured=target.capacity_measured===true && Number.isFinite(total) && Number.isFinite(occupied) && cpb>0;
    const staged=lines.filter(line=>line.blockKey===blockKey).reduce((sum,line)=>sum+line.quantity/line.cpb,0);
    const open=measured ? Math.max(0,total-occupied-queued-staged) : null;
    const poDraft=lines.filter(line=>line.poId===po.po_id).reduce((sum,line)=>sum+line.quantity,0);
    const sourceDraft=lines.filter(line=>line.origin===po.origin_farm && line.itemcode===po.itemcode && line.lotcode===target.lotcode)
        .reduce((sum,line)=>sum+line.quantity,0);
    const targetDraft=lines.filter(line=>line.targetId===target.row_id).reduce((sum,line)=>sum+line.quantity,0);
    const remaining=Math.max(0,Number(po.remaining_on_po)-Number(po.queued_quantity || 0)-poDraft);
    const available=Math.max(0,Number(target.origin_available || 0)-Number(target.origin_queued_quantity || 0)-sourceDraft);
    const demand=Math.max(0,Number(target.demand_7_days || 0)-targetDraft-Number(target.target_queued_quantity || 0));
    const space=open===null ? null : Math.floor(open*cpb);
    const suggested=space===null ? 0 : Math.max(0,Math.floor(Math.min(remaining,available,Math.max(space,demand))));
    return {blockKey,cpb,total,occupied,queued,staged,open,space,demand,remaining,available,suggested,measured};
}

function addBloomscapesTransferLine(po,target,quantity) {
    if (!target || po.targets && !matchingBloomscapesPoTargets(po).some(row=>row.row_id===target.row_id)) throw new Error('Choose a receiving row matching the PO season and origin.');
    const state=getBloomscapesTransferState(),q=Number(quantity);
    const previous=state.lines.find(line=>line.poId===po.po_id && line.targetId===target.row_id);
    const projection=bloomscapesTransferProjection(po,target,previous?.id);
    if (state.pending.get(po.origin_farm)?.busy) throw new Error('This farm order is being submitted.');
    if (!Number.isSafeInteger(q) || q<=0 || !projection.measured || q>projection.remaining || q>projection.available
        || q>Math.max(projection.space,projection.demand)) throw new Error('Choose a quantity within the available PO, origin stock and receiving plan.');
    if (previous) previous.quantity=q;
    else state.lines.push({id:crypto.randomUUID(),poId:po.po_id,targetId:target.row_id,origin:po.origin_farm,
        itemcode:po.itemcode,commonname:po.commonname,location:target.locationcode,lotcode:target.lotcode,
        blockKey:projection.blockKey,cpb:projection.cpb,quantity:q});
    state.pending.delete(po.origin_farm);saveBloomscapesTransferDraft(state);
    return state;
}

function matchesBloomscapesPoSeason(po,season) {
    const bucket=po.season_bucket || String(po.po_season || '').split('.').at(-1);
    return season==='ALL' || (season==='OTHER' ? !['F1','S1'].includes(bucket) : bucket===season);
}

function matchingBloomscapesPoTargets(po) {
    const bucket=po.season_bucket || String(po.po_season || '').split('.').at(-1);
    return (po.targets || []).filter(target=>po.po_season ? target.lotcode===po.po_season
        : !bucket || bucket==='UNKNOWN' || String(target.lotcode || '').split('.').at(-1)===bucket)
        .sort((a,b)=>Number(b.lotcode===po.po_season)-Number(a.lotcode===po.po_season));
}

function removeBloomscapesTransferLine(id) {
    const state=getBloomscapesTransferState(),line=state.lines.find(entry=>entry.id===id);
    if (!line || state.pending.get(line.origin)?.busy) return false;
    state.lines=state.lines.filter(entry=>entry.id!==id);
    state.pending.delete(line.origin);saveBloomscapesTransferDraft(state);
    return true;
}

function summarizeBloomscapesTransferOrder(origin) {
    const lines=getBloomscapesTransferState().lines.filter(line=>line.origin===origin);
    return {origin,rows:lines.length,cans:lines.reduce((sum,line)=>sum+line.quantity,0),
        beds:lines.reduce((sum,line)=>sum+line.quantity/line.cpb,0),lines};
}

function beginBloomscapesTransferSubmission(origin) {
    const state=getBloomscapesTransferState(),summary=summarizeBloomscapesTransferOrder(origin);
    if (!summary.rows || state.pending.get(origin)?.busy) return null;
    const input=summary.lines.map(line=>({id:line.id,poId:line.poId,targetId:line.targetId,quantity:line.quantity}));
    const signature=JSON.stringify(input),previous=state.pending.get(origin);
    const attempt=previous?.signature===signature ? previous : {owner:state.owner,origin,signature,input,requestId:crypto.randomUUID()};
    attempt.busy=true;state.pending.set(origin,attempt);
    return attempt;
}

function finishBloomscapesTransferSubmission(attempt,receipt) {
    const state=getBloomscapesTransferState();
    if (attempt.owner!==state.owner || state.pending.get(attempt.origin)!==attempt) return false;
    attempt.busy=false;
    if (!receipt) return false;
    if (receipt.ok!==true || receipt.command_id!==attempt.requestId || receipt.origin_farm!==attempt.origin
        || receipt.destination_farm!=='10-PH' || !matchingBloomscapesTransferLines(receipt.lines,attempt.input)
        || !Array.isArray(receipt.jobs) || !receipt.jobs.length) throw new Error('Transfer Order receipt did not match the submitted draft.');
    const submitted=new Set(attempt.input.map(line=>line.id));
    state.lines=state.lines.filter(line=>!submitted.has(line.id));
    state.pending.delete(attempt.origin);saveBloomscapesTransferDraft(state);
    return true;
}

function matchingBloomscapesTransferLines(actual,expected) {
    return Array.isArray(actual) && actual.length===expected.length && expected.every((line,index)=>
        ['id','poId','targetId','quantity'].every(key=>actual[index]?.[key]===line[key]));
}

function hasBloomscapesTransferDraft() {
    return getBloomscapesTransferState().lines.length>0;
}
