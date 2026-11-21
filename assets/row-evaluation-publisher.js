
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
    if (options?.requestWork) {
        const saved = await publishRequestWorkEvaluation(item, patch, options);
        if ((options.photoAttachmentUrl || patch?.req_photo_link) && saved?.status === 'saved' && saved.result?.master_row) {
            schedulePublishedPlantHealthPhoto(saved.result.master_row,{photo_link:options.photoAttachmentUrl || patch.req_photo_link},null,options.scope);
        }
        return saved;
    }
    if (!options || options.suspendCompletionScope) {
        const completionScope = options?.suspendCompletionScope || getSupabaseReadIdentityScope();
        const source = findDockSuspendDcRequestSourceRow(item) || item;
        const identity = getSuspendTagInventoryIdentity(item, source);
        const linked = findLinkedMasterRow(item) || getQueueCardInventoryRow(item,'request');
        const target = linked ? {...linked,LOTCODE:identity.lotCode,lotcode:identity.lotCode} : {...source,__queuePhotoOnly:true};
        const inventoryIdentity = identity;
        const priorPhoto = {dock_photo_link:source.dock_photo_link ?? source.DOCK_PHOTO_LINK};
        patch = withCanonicalEvaluationMatchQuantity(target, patch);
        const rollback = options?.memoryRollback || beginRowEvaluationMemoryPublication(target,patch,completionScope,{source:item});
        try {
            const result = await runSuspendTagRowCommand('save',item,patch,options?.photoProof ? getDockSuspendCompletionRevision(options.photoProof.row) : getDockSuspendCompletionRevision(item),{
                completionScope:options?.preserveNavigation === true ? null : completionScope, requireInventoryReceipt:false,inventoryIdentity,inventoryMasterUid:String(target.UNIQUE_ID || target.unique_id),onConfirmed:options?.onConfirmed,
                ...(options?.photoProof ? {photoProof:options.photoProof,serialized:options.serialized === true} : {})
            });
            if (!result) { rollback(); return result; }
            rollback.commit?.();
            if (linked && patch?.dock_photo_link) schedulePublishedPlantHealthPhoto(linked,patch,priorPhoto,completionScope);
            return result;
        } catch (error) { rollback(); throw error; }
    }
    const context = prepareInventoryRowEvaluation(item,patch,options);
    const {target,baseline,rollback} = context;
    try {
        const result = options.receipt || (options.orderEvaluation
            ? await saveOrderEvaluationReceipt(options.orderEvaluation)
            : await saveSecureDriveEvidence(target,options.prefix,context.patch,options.complete,baseline));
        return settleInventoryRowEvaluation(result,context,options);
    } catch (error) { rollback(); throw error; }
}

function prepareInventoryRowEvaluation(item,patch,options) {
    const scope = options.scope || getSupabaseReadIdentityScope();
    const linked = options.photoOnly === true ? null : findLinkedMasterRow(item);
    const expectedUid = canonicalInventoryLinkedUid(item) || canonicalInventoryRowUid(item);
    const target = linked && canonicalInventoryRowUid(linked) === expectedUid ? linked : item;
    const uid = canonicalInventoryRowUid(target);
    if (!uid || !['','ph_master_inventory'].includes(String(target.SOURCE_TABLE || target.source_table || ''))) throw new Error('Exact inventory row is required.');
    if (options.receipt?.row && String(options.receipt.row.UNIQUE_ID || options.receipt.row.unique_id || '') !== uid) throw new Error('EVALUATION_RECEIPT_IDENTITY_MISMATCH');
    if (!options.receipt) patch = withCanonicalEvaluationMatchQuantity(target,patch);
    const baseline = options.baseline ?? (options.receipt ? null : buildSecureDriveEvidenceBaseline(target));
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
        schedulePublishedPlantHealthPhoto(target,patch,context.baseline,scope);
    }
    try {
        const applied = reconcileConfirmedDriveEvidence(result,target,options.prefix,{scope,photoOnly:options.photoOnly === true,preserveDetailDraft:options.preserveDetailDraft === true});
        if (!options.photoOnly && !result.noOp && patch?.photo_link) schedulePublishedPlantHealthPhoto(target,patch,context.baseline,scope);
        return {result,applied};
    } catch (error) {
        if (options.photoOnly !== true) throw error;
        globalThis.reportHandledRuntimeIssue?.('persistDrivePhotoAttachment','COMMITTED_PHOTO_REFRESH_DEFERRED');
        queueVisibleDatasetCatchup(0);
        return {result,applied:null,projectionDeferred:true};
    }
}

async function saveSeasonSalesOfficeAvNoteSnapshot(masterId = '', nextAvNote = '') {
    if (nativeAuthSessionActive) return false;
    const normalizedMasterId = String(masterId || '').trim();
    if (!normalizedMasterId || navigator.onLine === false) return false;
    const mirroredRows = getSeasonSalesOfficeRowsByMasterId(normalizedMasterId);
    const mirroredRow = mirroredRows.find((row) => String(firstNonEmptyValue(row.SO_SOURCE, row.so_source, '')).trim().toLowerCase() === 'season') || null;
    if (!mirroredRow) return false;
    const nextValue = String(nextAvNote ?? '').trim().toUpperCase();
    const expectedRevision = Number(firstNonEmptyValue(mirroredRow.STATE_REVISION, mirroredRow.state_revision, 1)) || 1;
    const idempotencyKey = `season-sales-av-note-${crypto.randomUUID()}`;
    const result = await publishRowEvaluationToMasterAndNotes({UNIQUE_ID:normalizedMasterId}, {av_note:nextValue}, {
        seasonSalesOffice:true,scope:getSupabaseReadIdentityScope(),expectedRevision,
        persist:() => seasonSalesOfficeApi('save_av_note', {
            masterId:normalizedMasterId,expectedRevision,avNote:nextValue,idempotencyKey
        }, {idempotencyKey,timeoutMs:30000})
    });
    const savedValue = Object.prototype.hasOwnProperty.call(result, 'avNote') ? String(result.avNote ?? '').trim() : nextValue;
    syncSeasonSalesOfficeAvNoteState(normalizedMasterId, savedValue);
    mirroredRow.STATE_REVISION = Number(result.revision) || expectedRevision + 1;
    mirroredRow.state_revision = mirroredRow.STATE_REVISION;
    mirroredRow.WORKFLOW_STATUS = String(result.readinessStatus || mirroredRow.WORKFLOW_STATUS || 'needs_photo_data');
    mirroredRow.WORKFLOW_DETAIL = result.workflowDetail || mirroredRow.WORKFLOW_DETAIL || {};
    return true;
}

async function syncSeasonSalesOfficeAvNoteRemote(masterId = '', nextAvNote = '') {
    if (nativeAuthSessionActive) return false;
    const normalizedMasterId = String(masterId || '').trim();
    if (!normalizedMasterId || navigator.onLine === false) return false;
    const masterRow = findItemByUniqueId(normalizedMasterId)
        || (Array.isArray(fullInventory) ? masterInventoryById.get(normalizedMasterId) : null);
    const mirroredRow = getSeasonSalesOfficeRowsByMasterId(normalizedMasterId)[0] || null;
    const itemCode = getMasterItemCodeKey(masterRow || mirroredRow);
    if (!itemCode) return false;
    // Existing staging owns its note. Explicit user edits must update that
    // snapshot before reconciliation; a first staging captures the master.
    try {
        await saveSeasonSalesOfficeAvNoteSnapshot(normalizedMasterId, nextAvNote);
    } catch (error) {
        const failure = String(error && error.message ? error.message : error || '');
        if (/SEASON_SALES_(?:NOT_OPEN|STALE_REVISION|WINNER_CHANGED)/.test(failure) || String(error && error.code || '') === '40001') {
            console.warn('Season Sales Office AV Note save stopped after a stale workflow revision; waiting for an explicit refresh or edit.', error);
            return false;
        }
        throw error;
    }
    const idempotencyKey = `season-sales-note-refresh-${crypto.randomUUID()}`;
    await seasonSalesOfficeApi('refresh', {
        itemcode: itemCode,
        importRevision: `client:av-note-save:${new Date().toISOString()}`,
        idempotencyKey
    }, { idempotencyKey, timeoutMs: 30000 });
    await refreshSeasonSalesOfficeDataset();
    return true;
}

function syncSeasonSalesOfficeStateForItemCodes(itemCodes = [], options = {}) {
            if (nativeAuthSessionActive) return [];
            const normalizedCodes = new Set((Array.isArray(itemCodes) ? itemCodes : []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean));
            if (!normalizedCodes.size) return [];
            const opts = options || {};
            if (opts.skipRemote) return [];
            const reason = String(opts.reason || 'season-sales-note-refresh').trim().slice(0, 60);
            return Array.from(normalizedCodes).map((itemCode) => {
                const idempotencyKey = `season-sales-refresh-${crypto.randomUUID()}`;
                return seasonSalesOfficeApi('refresh', {
                    itemcode: itemCode,
                    importRevision: `client:${reason}:${new Date().toISOString()}`,
                    idempotencyKey
                }, { idempotencyKey, timeoutMs: 30000 })
                    .then(() => refreshSeasonSalesOfficeDataset())
                    .catch((error) => {
                        console.error('Season Sales Notes protected refresh failed', error);
                        throw error;
                    });
            });
        }

