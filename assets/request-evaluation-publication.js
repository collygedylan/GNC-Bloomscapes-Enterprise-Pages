
async function publishRequestWorkEvaluation(item, patch, options) {
    const scope = options.scope || getSupabaseReadIdentityScope();
    const target = findLinkedMasterRow(item);
    const evidence = target ? withCanonicalEvaluationMatchQuantity(target, buildRequestMasterUpdatePayloadFromSave(item, patch, target)) : null;
    if (evidence && patch?.explicit_av_note === true) { evidence.explicit_av_note = true; evidence.av_note = String(patch.av_note ?? ''); }
    const rollback = options.memoryRollback || beginRowEvaluationMemoryPublication(target, evidence, scope);
    let outcome, completedReceipt = false, photoReceipt = false;
    try {
        outcome = await options.persist();
        if (scope !== getSupabaseReadIdentityScope()) throw staleSupabaseReadScopeError();
        if (outcome.status !== 'saved') { rollback(); return outcome; }
        const result = outcome.result, saved = result?.row;
        if (result?.ok === false || result?.error || options.complete && result?.active === true || !saved || String(saved.unique_id || saved.UNIQUE_ID || '') !== String(item.UNIQUE_ID || item.unique_id || '')) throw new Error('REQUEST_SAVE_UNCONFIRMED');
        if (options.complete && (result.lifecycle_state !== 'completed_history' || !hasRequestCompletionState(saved))) throw new Error('REQUEST_COMPLETION_RECEIPT_UNCONFIRMED');
        if (options.complete) {
            completedReceipt = true;
            options.onConfirmed?.(result);
        }
        if (options.photoAttachmentUrl) {
            const queued = options.queuedPhotoId && result.queued_photo_id === options.queuedPhotoId;
            const valid = result.lifecycle_state === 'pending_active' && result.active !== false
                || queued && result.lifecycle_state === 'completed_history' && result.active === false && hasRequestCompletionState(saved);
            if (!valid
                || !parsePhotoCsvValues(saved.req_photo_link).includes(options.photoAttachmentUrl)) throw new Error('REQUEST_PHOTO_RECEIPT_UNCONFIRMED');
            photoReceipt = true;
            options.onConfirmed?.(result);
        }
        if (completedReceipt || photoReceipt) rollback.commit?.();
        reconcileRequestPublicationMaster({ result, saved, item, target, options, completedReceipt, photoReceipt, scope, rollback });
        acknowledgeDetailEvaluationDraft(item,saved,scope);
        return outcome;
    } catch (error) {
        if (completedReceipt || photoReceipt) {
            // The exact Request completion/photo is durable; only its local inventory projection is deferred.
            reportDeferredRequestPublication(error, photoReceipt);
            queueVisibleDatasetCatchup(0);
            return outcome;
        }
        rollback(); throw error;
    }
}

function reconcileRequestPublicationMaster({ result, item, target, options, completedReceipt, photoReceipt, scope, rollback }) {
    if (result.master_row) {
        if (!canonicalEvidenceGroupMatches(result.master_row,item)) throw new Error('REQUEST_MASTER_RECEIPT_MISMATCH');
        if (photoReceipt && !parsePhotoCsvValues(result.master_row.photo_link).includes(options.photoAttachmentUrl)) throw new Error('REQUEST_MASTER_PHOTO_RECEIPT_UNCONFIRMED');
        if (!completedReceipt && !photoReceipt) options.onConfirmed?.(result);
        rollback.commit?.();
        const master = masterInventoryById.get(result.master_row.unique_id) || formatFetchedRows([result.master_row], 'ph_master_inventory')[0];
        reconcileConfirmedDriveEvidence({ok:true,row:result.master_row,canonicalConfirmed:true,locationRows:[]},
            master,'req-',{scope,preserveDetailDraft:true,photoOnly:photoReceipt});
    } else if (target) throw new Error('REQUEST_MASTER_RECEIPT_UNCONFIRMED');
    else if (!completedReceipt && !photoReceipt) options.onConfirmed?.(result);
}

function reportDeferredRequestPublication(error, photoReceipt) {
    if (error?.message === 'REQUEST_MASTER_RECEIPT_UNCONFIRMED') return;
    globalThis.reportHandledRuntimeIssue?.('request_work', photoReceipt ? 'REQUEST_PHOTO_PROJECTION_DEFERRED' : 'REQUEST_COMPLETION_PROJECTION_DEFERRED');
}
