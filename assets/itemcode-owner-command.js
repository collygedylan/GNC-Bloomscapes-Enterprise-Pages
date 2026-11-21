async function assignEvalItemcodes(itemcodes=[],assignedto='') {
    await saveFarmOwnerBatch(itemcodes,assignedto);
    return false;
}

async function saveFarmOwnerBatch(itemcodes,assignedto) {
    const command = prepareFarmOwnerCommand(itemcodes,assignedto);
    if (!command) return false;
    const {state,codes} = command;
    let saved = false;
    try {
        const receipt = await saveBloomscapesItemcodeOwners(command);
        if (!farmOwnerCommandIsCurrent(command)) return false;
        applyAcknowledgedEvalAssignmentResults(command.changes,[receipt]);
        completeFarmOwnerCommand(command);
        saved = true;
    } catch (error) {
        if (farmOwnerCommandIsCurrent(command)) failFarmOwnerCommand(command,error);
    } finally {
        codes.forEach(code=>state.defaultPending.delete(code));
        state.ownerWriteAt = Date.now();
        if (farmOwnerCommandIsCurrent(command)) updateManagerAssignedItemsView({ownerOnly:true});
    }
    if (saved) refreshSuspendOwnerViews();
    return saved;
}

function prepareFarmOwnerCommand(itemcodes,assignedto) {
    if (!canManageEvalItemcodeAssignments() || !isManagerAssignedSnapshotCurrent()) {
        showToast('Assignments','Current assignment permissions and rows are required.',true);
        return null;
    }
    const codes = [...new Set((Array.isArray(itemcodes) ? itemcodes : [itemcodes]).map(value=>
        buildManagerEvalAssignmentKey(typeof value==='object' ? value.itemcode : parseManagerEvalAssignmentKey(value).itemcode)).filter(Boolean))];
    const state = getManagerAssignedColumnState();
    state.defaultPending ||= new Set();
    if (!codes.length || codes.some(code=>state.defaultPending.has(code))) return null;
    const farm = getBloomscapesFarm();
    const assignee = normalizeEvalAssignableUser(assignedto);
    if (assignee && !eligiblePickerUsers('evaluation').some(user=>user.username===assignee)) {
        showToast('Assignments','Choose an eligible owner for this farm.',true);
        return null;
    }
    const changes = codes.map(itemcode=>({itemcode,assignedto:assignee || null}));
    const fingerprint = JSON.stringify([farm,changes]);
    state.defaultCommands ||= new Map();
    state.defaultDrafts ||= {};
    const id = state.defaultCommands.get(fingerprint)?.id || crypto.randomUUID();
    state.defaultCommands.set(fingerprint,{id});
    codes.forEach(code=>{
        state.defaultPending.add(code);
        state.defaultDrafts[code] = {assignedto:assignee};
    });
    const undo = applyOptimisticItemcodeOwners(codes,assignee);
    updateManagerAssignedItemsView({ownerOnly:true});
    return {state,codes,farm,assignee,changes,fingerprint,id,undo,owner:getSupabaseReadIdentityScope()};
}

function farmOwnerCommandIsCurrent(command) {
    return command.state===getManagerAssignedColumnState() && command.owner===getSupabaseReadIdentityScope()
        && command.farm===getBloomscapesFarm() && canManageEvalItemcodeAssignments();
}

function completeFarmOwnerCommand(command) {
    const {state,codes} = command;
    codes.forEach(code=>{
        delete state.defaultDrafts[code];
        managerEvalAssignmentSelection.delete(code);
    });
    state.defaultCommands.delete(command.fingerprint);
    state.displayCache = null;
    showToast('Defaults Saved',`${codes.length} owners saved for ${command.farm}.`);
}

function failFarmOwnerCommand(command,error) {
    command.undo();
    const message = error?.message || 'The owner save was not confirmed.';
    command.codes.forEach(code=>{
        if (command.state.defaultDrafts[code]) command.state.defaultDrafts[code].error = message;
    });
    showToast('Default Owner Save Failed',message,true);
}
