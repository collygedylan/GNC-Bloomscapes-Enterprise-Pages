
/**
 * @param {object} item Exact Request row.
 * @param {object} patch Canonical evaluation evidence fields.
 * @param {object} options Scoped persistence and durable confirmation callbacks.
 * @returns {Promise<object>} The confirmed publication outcome.
 */
async function publishRequestWorkEvaluation(item, patch, options) {
    const scope = options.scope || getSupabaseReadIdentityScope();
    const expectedMasterUid = canonicalInventoryLinkedUid(item);
    const candidate = expectedMasterUid ? findLinkedMasterRow(item) : null;
    const target = canonicalInventoryRowUid(candidate) === expectedMasterUid ? candidate : null;
    const evidence = target ? withCanonicalEvaluationMatchQuantity(target, buildRequestMasterUpdatePayloadFromSave(item, patch, target)) : null;
    if (evidence && patch?.explicit_av_note === true) { evidence.explicit_av_note = true; evidence.av_note = String(patch.av_note ?? ''); }
    const rollback = options.memoryRollback || beginRowEvaluationMemoryPublication(target, evidence, scope, {source:item,prefix:'req-'});
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
        reconcileRequestPublicationMaster({ result, saved, item, target, expectedMasterUid, options, completedReceipt, photoReceipt, scope, rollback });
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

function reconcileRequestPublicationMaster({ result, saved, item, target, expectedMasterUid, options, completedReceipt, photoReceipt, scope, rollback }) {
    const rows = getRequestPublicationReceiptRows(result, saved, item, target, expectedMasterUid);
    if (photoReceipt && rows.some(row => !parsePhotoCsvValues(row.photo_link).includes(options.photoAttachmentUrl))) {
        throw new Error('REQUEST_MASTER_PHOTO_RECEIPT_UNCONFIRMED');
    }
    if (!completedReceipt && !photoReceipt) options.onConfirmed?.(result);
    rollback.commit?.();
    for (const row of rows) {
        const master = masterInventoryById.get(canonicalInventoryRowUid(row)) || formatFetchedRows([row], 'ph_master_inventory')[0];
        reconcileConfirmedDriveEvidence({ok:true,row,canonicalConfirmed:true,locationRows:[]},
            master,'req-',{scope,preserveDetailDraft:true,photoOnly:photoReceipt});
    }
}

function getRequestPublicationReceiptRows(result, saved, item, target, expectedMasterUid) {
    const receivedLink = canonicalInventoryLinkedUid(saved);
    if (receivedLink && expectedMasterUid && receivedLink !== expectedMasterUid) throw new Error('REQUEST_MASTER_RECEIPT_MISMATCH');
    const bound = expectedMasterUid || receivedLink;
    const requestUid = canonicalInventoryRowUid(item);
    if (Array.isArray(result.master_rows)) {
        const rows = result.master_rows;
        const ids = rows.map(canonicalInventoryRowUid);
        const scope = result.master_scope;
        if (scope === 'request' && !rows.length) return rows;
        if (!rows.length || ids.some(uid => !uid || uid === requestUid)
            || new Set(ids).size !== rows.length
            || (scope === 'row' ? rows.length !== 1 || ids[0] !== bound : scope !== 'group' || ids.includes(bound))
            || rows.some(row => !canonicalInventorySameLocation(row,item)
                || canonicalInventoryLot(item) && !canonicalInventorySameLot(row,item))) throw new Error('REQUEST_MASTER_RECEIPT_MISMATCH');
        return rows;
    }
    const row = result.master_row;
    if (!row && target) throw new Error('REQUEST_MASTER_RECEIPT_UNCONFIRMED');
    if (!row) return [];
    const uid = canonicalInventoryRowUid(row);
    if (!bound || uid !== bound || uid === requestUid || !canonicalEvidenceGroupMatches(row,item)) {
        throw new Error('REQUEST_MASTER_RECEIPT_MISMATCH');
    }
    return [row];
}

function reportDeferredRequestPublication(error, photoReceipt) {
    if (error?.message === 'REQUEST_MASTER_RECEIPT_UNCONFIRMED') return;
    globalThis.reportHandledRuntimeIssue?.('request_work', photoReceipt ? 'REQUEST_PHOTO_PROJECTION_DEFERRED' : 'REQUEST_COMPLETION_PROJECTION_DEFERRED');
}
