function applySuspendTagInventoryReceipt(result, scope, identity = null) {
            if (scope !== getSupabaseReadIdentityScope()) return false;
            const rows = Array.isArray(result?.inventoryRows) ? result.inventoryRows : result?.inventoryRow ? [result.inventoryRow] : [];
            let applied = false;
            for (const row of rows) {
                if (!row?.unique_id || !row.itemcode || !row.locationcode || isFalseBlockLocation(row.locationcode)) continue;
                if (identity && !matchesSuspendTagInventoryIdentity(row, identity)) continue;
                const target = Object.fromEntries(Object.entries(row).map(([key,value])=>[key.toUpperCase(),value]));
                target.SOURCE_TABLE = 'ph_master_inventory';
                reconcileConfirmedDriveEvidence({ok:true,code:'SAVED',canonicalConfirmed:true,row,locationRows:[row]}, target, 'req-', {scope,photoOnly:true,preserveDetailDraft:true});
                const state = getManagerAssignedColumnState();
                if (state.noteScope !== scope) state.locationSalesNotes = new Map();
                state.noteScope = scope;
                const notes = state.locationSalesNotes ||= new Map();
                const code = getRequestItemCodeOptionItemCode(target);
                const prior = notes.get(code) || [];
                const previous = prior.find(note => note.unique_id === row.unique_id);
                notes.set(code, [...prior.filter(note => note.unique_id !== row.unique_id),
                    {...previous,...row,pick_note:row.pic_note,loc_match_pct:row.match}]);
                applied = true;
            }
            return applied;
        }

async function publishRowEvaluationToMasterAndNotes(item, patch, options = null) {
    if (typeof item === 'string') {
        item = masterInventoryById.get(item) || await loadExactMasterDetailRow(item);
        options ||= {prefix:'lsn-',complete:true};
    }
    if (!item) throw new Error('Exact inventory row is required.');
    if (!canPublishRowEvidenceCommand(item,options)) throw new Error('ROW_EVALUATION_FORBIDDEN');
    if (options?.seasonSalesOffice === true) return publishSeasonSalesOfficeEvaluation(item, patch, options);
    if (options?.requestWork) return publishRequestWorkEvaluation(item, patch, options);
    if (!options || options.suspendCompletionScope) {
        const completionScope = options?.suspendCompletionScope || getSupabaseReadIdentityScope();
        const source = findDockSuspendDcRequestSourceRow(item) || item;
        const identity = getSuspendTagInventoryIdentity(item, source);
        const linked = findLinkedMasterRow(item) || getQueueCardInventoryRow(item,'request');
        const target = linked ? {...linked,LOTCODE:identity.lotCode,lotcode:identity.lotCode} : {...source,__queuePhotoOnly:true};
        const inventoryIdentity = identity;
        patch = withCanonicalEvaluationMatchQuantity(target, patch);
        const rollback = options?.memoryRollback || beginRowEvaluationMemoryPublication(target,patch,completionScope,{source:item});
        try {
            const result = await runSuspendTagRowCommand('save',item,patch,options?.photoProof ? getDockSuspendCompletionRevision(options.photoProof.row) : getDockSuspendCompletionRevision(item),{
                completionScope:options?.preserveNavigation === true ? null : completionScope, requireInventoryReceipt:false,inventoryIdentity,inventoryMasterUid:String(target.UNIQUE_ID || target.unique_id),onConfirmed:options?.onConfirmed,
                ...(options?.photoProof ? {photoProof:options.photoProof,serialized:options.serialized === true} : {})
            });
            if (!result) rollback();
            else rollback.commit?.();
            return result;
        } catch (error) { rollback(); throw error; }
    }
    const context = prepareInventoryRowEvaluation(item,patch,options);
    const {target,baseline,rollback} = context;
    try {
        const result = options.receipt || await saveSecureDriveEvidence(target,options.prefix,context.patch,options.complete,baseline);
        return settleInventoryRowEvaluation(result,context,options);
    } catch (error) { rollback(); throw error; }
}

function prepareInventoryRowEvaluation(item,patch,options) {
    const scope = options.scope || getSupabaseReadIdentityScope();
    const target = options.photoOnly === true ? item : findLinkedMasterRow(item) || item;
    const uid = String(target.UNIQUE_ID || target.unique_id || '').trim();
    if (!uid || !['','ph_master_inventory'].includes(String(target.SOURCE_TABLE || target.source_table || ''))) throw new Error('Exact inventory row is required.');
    if (options.receipt?.row && String(options.receipt.row.UNIQUE_ID || options.receipt.row.unique_id || '') !== uid) throw new Error('EVALUATION_RECEIPT_IDENTITY_MISMATCH');
    if (!options.receipt) patch = withCanonicalEvaluationMatchQuantity(target,patch);
    const baseline = options.receipt ? null : options.baseline ?? buildSecureDriveEvidenceBaseline(target);
    const rollback = !options.receipt && options.photoOnly !== true ? options.memoryRollback || beginRowEvaluationMemoryPublication(target,patch,scope) : () => {};
    return {target,patch,scope,baseline,rollback};
}

function settleInventoryRowEvaluation(result,context,options) {
    const {target,rollback,scope,patch} = context;
    confirmEvaluationProjection(result,target,rollback,options.onConfirmed,scope);
    if (options.isCurrent && !options.isCurrent()) return {result,applied:null};
    if (options.photoOnly === true) {
        const canonical = getCommittedDriveEvidenceReceipt(result,target).row;
        if (!isSameDriveEvidenceLocation(canonical,options.photoIdentity || target,true)) throw new Error('The saved photo location could not be verified. Reopen the item.');
        beginRowEvaluationMemoryPublication(target,patch,scope).commit?.();
    }
    try {
        const applied = reconcileConfirmedDriveEvidence(result,target,options.prefix,{scope,photoOnly:options.photoOnly === true,preserveDetailDraft:options.preserveDetailDraft === true});
        return {result,applied};
    } catch (error) {
        if (options.photoOnly !== true) throw error;
        globalThis.reportHandledRuntimeIssue?.('persistDrivePhotoAttachment','COMMITTED_PHOTO_REFRESH_DEFERRED');
        queueVisibleDatasetCatchup(0);
        return {result,applied:null,projectionDeferred:true};
    }
}
