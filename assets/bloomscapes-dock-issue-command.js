const bloomscapesDockIssueCommands=new Set();

async function submitDockItemMistake() {
    if (!requireCurrentDocksWriteProof()) return false;
    if (getRoleAccessState().isRep) { showToast('View Only','Docks is view only for sales reps.',true); return false; }
    const input=readBloomscapesDockIssueInput();
    if (!input || bloomscapesDockIssueCommands.has(input.uid)) return false;
    const owner=getSupabaseReadIdentityScope();
    bloomscapesDockIssueCommands.add(input.uid);
    try {
        const command=await prepareBloomscapesDockIssue(input);
        if (!command || owner!==getSupabaseReadIdentityScope()) return false;
        showToast('Saving...','Updating dock issue...');
        await saveDockIssueStatusPayload(command.payload);
        if (owner!==getSupabaseReadIdentityScope()) return false;
        await saveDockIssueAllocationPayloads(command.payload,command.allocations,{parentAlreadySaved:true});
        await deleteBloomscapesDockIssueAllocations(command.issueUid,command.removed.map(row=>row.allocationUniqueId));
        if (owner!==getSupabaseReadIdentityScope()) return false;
        applyConfirmedBloomscapesDockIssue(command);
        showToast('Success','Dock issue saved!');
    } catch (error) { if (owner===getSupabaseReadIdentityScope()) showToast('Save not confirmed',error.message,true); }
    finally { bloomscapesDockIssueCommands.delete(input.uid); }
    return false;
}

function readBloomscapesDockIssueInput() {
    const uid=normalizeDockIssueSourceUniqueId(document.getElementById('dock-mistake-uid').value);
    const text=document.getElementById('dock-mistake-text').value.toUpperCase().trim();
    const quantity=parseAppNumber(document.getElementById('dock-mistake-qty').value);
    const item=findDockMistakeSourceRowByUniqueId(uid,getDockIssueStatus(uid));
    if (!item || !text || quantity==null || quantity<=0) {
        showToast('Issue details required','Choose the Dock row and enter a note and positive quantity.',true);
        return null;
    }
    const selected=Array.from(dockMistakeSelectionUids).map(value=>String(value||'').trim()).filter(Boolean);
    if (dockMistakeCandidateRows.length && !selected.length) { showToast('Select Row','Choose a Drive Mode row for this mistake.',true); return null; }
    return {uid,text,quantity,item,selected,measurements:getDockMistakeModalMeasurementValues()};
}

async function prepareBloomscapesDockIssue(input) {
    if (dockMistakeIssuePhotoPromise) await dockMistakeIssuePhotoPromise;
    const payload=buildDockIssuePayloadFromRow(input.item,{issueNote:input.text,issueState:'open',sourceQty:input.quantity,
        ...input.measurements,issuePhotoLink:dockMistakeIssuePhotoLink,issuePhotoName:dockMistakeIssuePhotoName,
        includeIssuePhotoFields:!!dockMistakeIssuePhotoLink || dockIssuePhotoSchemaReady===true,
        includeIssueMeasurementFields:true});
    if (!payload) throw new Error('Dock issue identity could not be resolved.');
    return buildBloomscapesDockIssueCommand(input,payload);
}

function buildBloomscapesDockIssueCommand(input,payload) {
    const issueUid=normalizeDockIssueSourceUniqueId(firstNonEmptyValue(payload.issue_source_unique_id,input.uid));
    const selected=new Set(input.selected);
    const removed=getDockIssueAllocations(issueUid).filter(row=>row && !selected.has(row.altMasterUniqueId));
    const candidates=new Map(dockMistakeCandidateRows.map(entry=>[
        String(firstNonEmptyValue(entry?.masterUniqueId,entry?.row?.UNIQUE_ID,'')),entry.row]));
    const allocations=input.selected.map(id=>{
        const row=candidates.get(id) || masterInventoryById.get(id);
        if (!row || !bloomscapesFarmRowIsVisible(row)) throw new Error('Choose an exact inventory row in the active farm.');
        return buildDockIssueAllocationPayload(issueUid,row,0);
    }).filter(Boolean);
    return {issueUid,payload,allocations,removed};
}

function applyConfirmedBloomscapesDockIssue(command) {
    cacheDockIssueStatus(command.issueUid,command.payload);
    command.allocations.forEach(row=>cacheDockIssueAllocation(row));
    command.removed.forEach(row=>removeDockIssueAllocationFromCache(row.allocationUniqueId));
    dockIssueDataLoaded=true;
    closeDockMistakeModal();
    refreshDockIssueUi('issue-save:'+command.issueUid);
}
