function suspendWorkspaceScope() {
    return JSON.stringify([getSupabaseReadIdentityScope(),getBloomscapesFarm(),warehouseSwitchSeq,
        appAccessSnapshotState.snapshot?.dataPermissionVersion]);
}

async function requestSuspendFulfillment(command) {
    const {client,owner} = await requireBloomscapesSession();
    if (getBloomscapesFarm()!=='10-PH' || suspendWorkspaceScope()!==command.scope) throw staleSupabaseReadScopeError();
    const rpc = command.allocations ? 'gnc_10_ph_complete_suspend_tag_fulfillment' : 'gnc_10_ph_suspend_candidate';
    const receipt = bloomscapesData(await client.rpc(rpc,{p_command_id:command.id,
        p_source_uid:getDockSuspendDcRequestSourceUid(command.source),p_input:command.input}));
    await requireBloomscapesOwner(owner);
    if (suspendWorkspaceScope()!==command.scope) throw staleSupabaseReadScopeError();
    if (!matchesSuspendFulfillmentReceipt(command,receipt)) throw new Error('The server did not confirm this exact order line and allocation.');
    return receipt;
}

function suspendGroupMirrors(source) {
    const key = suspendOrderGroup(source), uid = getDockSuspendDcRequestSourceUid(source);
    return [source,...getDockSuspendDcRequestMirrorRows().filter(row=>getDockSuspendDcRequestSourceUid(row)!==uid
        && suspendOrderGroup(row)===key && canCurrentUserViewDockSuspendDcRequests(row))];
}

function repaintSuspendFulfillment() {
    invalidateDockSuspendDcSourceRowLookup();
    requestScopedItemsCacheKey = '';
    invalidateResolvedViewStateCaches();
    refreshConfirmedSuspendQueueBadges();
    markViewDirty('request');
    if (isViewVisible('request')) scheduleRequestRender(0,16,true);
}

function previewSuspendCompletion(command) {
    const rows = command.group;
    const masks = getQueueCompletionState();
    const removed = new Map();
    const docks = beginSuspendFulfillmentDocksProjection(command.source,command.allocations,command.id);
    for (const row of rows) {
        const uid = getDockSuspendDcRequestSourceUid(row), previous = [];
        removePendingSuspendCloseRows(uid,previous);
        removed.set(uid,previous);
        masks?.completedSuspendTagKeys.add(uid);
        paintOptimisticSuspendTagRemoval(row);
    }
    repaintSuspendFulfillment();
    return {
        dispose() {
            docks.rollback();
            for (const uid of removed.keys()) masks?.completedSuspendTagKeys.delete(uid);
        },
        rollback() {
            docks.rollback();
            for (const [uid,previous] of removed) {
                masks?.completedSuspendTagKeys.delete(uid);
                restorePendingSuspendCloseRows(uid,previous);
            }
            repaintSuspendFulfillment();
        },
        confirm(receipt) {
            for (const uid of receipt.removed_ids) {
                removePendingSuspendCloseRows(uid,[]);
                masks?.completedSuspendTagKeys.delete(uid);
            }
            docks.confirm(receipt);
            rows.forEach(row=>masks?.confirm(getQueueCompletionKey(row),getQueueCompletionVersion(row)));
            repaintSuspendFulfillment();
        }
    };
}

function suspendCandidatePreviewRow(command,source) {
    const {input,id,target} = command;
    const original = suspendField(source,'orig_itemcode') || suspendField(source,'subbed_from_itemcode') || suspendField(source,'itemcode');
    const data = Object.fromEntries(Object.entries(source).map(([key,value])=>[key.toLowerCase(),value]));
    const option = input.mode==='add';
    const quantity = suspendOrderQuantity(command.source);
    return {...data,unique_id:option ? 'sopt:'+id : getDockSuspendDcRequestSourceUid(source),
        suspend_order_quantity:quantity,...(option ? {qty:0,ordered_qty:0,quantityordered:0} : {}),
        suspend_origin_uid:suspendOrderOrigin(source),orig_line_key:suspendOrderOrigin(source),orig_itemcode:original,
        suspend_candidate_state:option || data.suspend_candidate_state==='option' ? 'option' : 'candidate',
        itemcode:input.itemcode,description:target.description || input.itemcode,commonname:target.description || input.itemcode,
        locationcode:input.locationcode,lotcode:input.lotcode,master_unique_id:input.inventory_uid || null,
        master_id:input.inventory_uid || null,subbed_from_itemcode:input.itemcode===original ? null : original,
        last_updated:new Date().toISOString()};
}

function previewSuspendCandidate(command) {
    const raw = findDockSuspendDcRequestSourceRow(command.source);
    if (!raw) throw new Error('Refresh the Suspend order before changing its location.');
    const row = suspendCandidatePreviewRow(command,raw);
    const prior = Object.fromEntries(Object.entries(raw).map(([key,value])=>[key.toLowerCase(),value]));
    applySuspendCandidateRows([row],{preview:true});
    return {
        confirm(receipt) { applySuspendCandidateRows(receipt.rows,{preview:true}); },
        rollback() {
            rollbackSuspendCandidate(command,row,prior);
            repaintSuspendFulfillment();
        }
    };
}

function rollbackSuspendCandidate(command,row,prior) {
    const collections = new Set([socInventory,socRawSourceRows,suspendTagInventory,suspendTagRawSourceRows]);
    for (const collection of collections) {
        const found = collection.find(item=>getDockSuspendDcRequestSourceUid(item)===row.unique_id);
        if (!found || suspendField(found,'last_updated')!==row.last_updated) continue;
        removeRealtimeRow(collection,row.unique_id);
        if (command.input.mode==='replace') {
            const aliases = Object.fromEntries(Object.entries(prior).map(([key,value])=>[key.toUpperCase(),value]));
            upsertRealtimeRow(collection,{...prior,...aliases},'ph_soc_master');
        }
    }
}

function applySuspendCandidateSourceRow(row) {
    const aliases = Object.fromEntries(Object.entries(row).map(([key,value])=>[key.toUpperCase(),value]));
    const local = normalizeSocDockRowAliases({...row,...aliases});
    local.DOM_ID ||= 'dock_'+local.UNIQUE_ID;
    const closed = row.suspend_candidate_state==='replaced' || !!(row.date_completed && !row.suspend) || row.suspend_completed===true;
    local.SUSPEND_COMPLETED = local.suspend_completed = closed;
    for (const target of new Set([socInventory,socRawSourceRows,suspendTagInventory,suspendTagRawSourceRows])) {
        if (closed && (target===suspendTagInventory || target===suspendTagRawSourceRows)) removeRealtimeRow(target,local.UNIQUE_ID);
        else upsertRealtimeRow(target,{...local},'ph_soc_master');
    }
}

function createSuspendFulfillmentCommand(source,input,extra) {
    const scope = suspendWorkspaceScope();
    const state = getDockSuspendCompletionState();
    const key = JSON.stringify(['fulfillment','10-PH',getDockSuspendDcRequestSourceUid(source),input]);
    const pending = state.pending[key] ||= {requestId:crypto.randomUUID(),savedAt:Date.now()};
    persistDockSuspendCompletionState(state);
    return {source,input,scope,id:pending.requestId,state,key,...extra};
}

async function finishSuspendFulfillment(command,preview) {
    const receipt = await requestSuspendFulfillment(command);
    preview.confirm(receipt);
    delete command.state.pending[command.key];
    persistDockSuspendCompletionState(command.state);
    persistCurrentCache(false,'suspend-fulfillment');
    return receipt;
}

async function executeSuspendFulfillment(command) {
    const lock = getSupabaseReadIdentityScope()+'|'+suspendOrderOrigin(command.source);
    if (suspendTagCompletionActions.has(lock)) throw new Error('This order line already has a change in progress.');
    suspendTagCompletionActions.add(lock);
    let preview;
    try {
        preview = command.allocations ? previewSuspendCompletion(command) : previewSuspendCandidate(command);
        await waitForSuspendEvidence(command.group || [command.source]);
        if (command.scope!==suspendWorkspaceScope()) throw staleSupabaseReadScopeError();
        return await finishSuspendFulfillment(command,preview);
    } catch (error) {
        if (command.scope===suspendWorkspaceScope()) preview?.rollback();
        else preview?.dispose?.();
        throw error;
    } finally {
        suspendTagCompletionActions.delete(lock);
    }
}

async function waitForSuspendEvidence(rows) {
    const writes = new Set();
    for (const row of rows) {
        const key = getSupabaseReadIdentityScope()+'|'+getDockSuspendDcRequestSourceUid(row);
        const source = findDockSuspendDcRequestSourceRow(row) || row;
        const work = [...(suspendTagEditorSaves.get(key) || []),suspendTagRowWrites.get(key),
            ...getPendingPhotoUploadsForItem(row,'req-'),...getPendingPhotoUploadsForItem(source,'req-')];
        work.filter(Boolean).forEach(pending=>writes.add(pending));
    }
    const results = await Promise.all(writes);
    if (results.includes(false)) throw new Error('A pending photo or evaluation could not be saved. Retry after saving the tag.');
}

function submitSuspendCandidate(source,target,mode,manual=false) {
    if (!canReadSuspendQueue() || !resolveCanonicalRowAccess(currentUser,source).canManageLocations
        || !['add','replace'].includes(mode)) throw new Error('Access to change this location is required.');
    const choice = suspendPhysicalChoice(target);
    if (!choice.itemcode || !choice.locationcode || isFalseBlockLocation(choice.locationcode))
        throw new Error('Choose a real location and item.');
    const input = {mode,itemcode:choice.itemcode,locationcode:choice.locationcode,lotcode:choice.lotcode,
        inventory_uid:manual ? null : getRequestItemCodeOptionMasterId(target),manual};
    return executeSuspendFulfillment(createSuspendFulfillmentCommand(source,input,{target:choice}));
}

function submitSuspendAllocation(source,selected,mode) {
    const group = suspendGroupMirrors(source);
    const allocations = group.map(row=>{
        const uid = getDockSuspendDcRequestSourceUid(row);
        return {...suspendPhysicalChoice(row),source_uid:uid,qty:selected.get(uid) ?? 0};
    }).filter(entry=>entry.qty!==0);
    if (canonicalFeaturePermission('can_complete_suspend_tag')===false || !canCurrentUserWorkRequestItem(source,'close')
        || allocations[0]?.source_uid!==getDockSuspendDcRequestSourceUid(source)
        || !suspendAllocationValid(allocations,suspendOrderQuantity(source),mode)) {
        throw new Error('Choose whole quantities from the selected tag and its order options that total the order quantity.');
    }
    const input = {mode,allocations:allocations.map(({source_uid,qty,itemcode,locationcode,lotcode})=>
        ({source_uid,quantity:qty,itemcode,locationcode,lotcode}))};
    return executeSuspendFulfillment(createSuspendFulfillmentCommand(source,input,{allocations,group}));
}
