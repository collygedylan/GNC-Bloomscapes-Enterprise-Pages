async function flushPendingRequestWorkEdits(reason = 'manual') {
    if (pendingRequestWorkFlushPromise) return pendingRequestWorkFlushPromise;
    const publishRetry = (context,patch) => publishRowEvaluationToMasterAndNotes(context.row,patch,{
        requestWork:true,scope:context.scope,complete:context.complete,
        onConfirmed:receipt => { if (context.complete) applyConfirmedRequestCompletionReceipt(context.row,receipt,context.scope); },
        persist:saveRequestWorkWithReconciliation.bind(null,{
            ...buildBloomscapesRequestRetryOptions(context,patch),
            send:async input => {
                context.assertScope();
                return supabaseRpc('save_request_work',{request_id:context.id,expected_version:input.expectedVersion,
                    patch:input.attempt > 0 ? buildNarrowRequestWorkRpcPatch(input.patch,context.row) : input.patch,
                    complete:!!input.complete},{timeoutMs:30000});
            }
        })});
    pendingRequestWorkFlushPromise = flushBloomscapesRequestDrafts(reason,publishRetry)
        .finally(() => { pendingRequestWorkFlushPromise = null; });
    return pendingRequestWorkFlushPromise;
}

async function flushBloomscapesRequestDrafts(reason,publishRetry) {
    if (!currentUser || navigator.onLine === false) return 0;
    const pending = getPendingEditsCache();
    let saved = 0, changed = false;
    for (const [id,entry] of Object.entries(pending)) {
        if (!isRequestLikeLocalEditRow(entry?.data)
            || entry.requestWorkOwnerKey && entry.requestWorkOwnerKey!==getRequestSubmissionOwnerKey()) continue;
        const draft = entry.requestWorkDraft;
        if (draft?.acknowledged && !Object.keys(draft.dirtyValues || {}).length && !draft.complete) {
            delete pending[id];changed = true;continue;
        }
        if (!draft) { quarantineBloomscapesLegacyDraft(id,entry);changed = true;continue; }
        if (entry.autoRetryBlocked) continue;
        const result = await retryBloomscapesRequestDraft(id,entry,publishRetry);
        saved += Number(result.saved);changed ||= result.changed;
    }
    if (changed) flushPendingEditsCache(true);
    if (saved) refreshLocalRequestViewState('pending-request-work:'+reason,{renderVisible:true,forceRender:true});
    return saved;
}

function quarantineBloomscapesLegacyDraft(id,entry) {
    entry.requestWorkDraft = {requestId:id,baseVersion:0,baseValues:null,
        dirtyValues:getRequestWorkValuesFromRow(entry.data),complete:false,legacy:true,
        conflictPlan:{status:'review-required',reason:'legacy-draft',conflictFields:[],canonical:null}};
    entry.autoRetryBlocked = true;entry.conflictType = 'request-work';entry.conflictedAt = new Date().toISOString();
}

function createBloomscapesRetryContext(id,entry) {
    const scope = getSupabaseReadIdentityScope(), epoch = nativeAuthRecoveryEpoch;
    const current = () => scope===getSupabaseReadIdentityScope() && epoch===nativeAuthRecoveryEpoch;
    return {id,entry,row:entry.data,draft:entry.requestWorkDraft,scope,current,
        complete:entry.requestWorkDraft.complete===true && entry.requestWorkDraft.intentPolicy==='local-command',
        assertScope:() => { if (!current()) throw staleSupabaseReadScopeError(); },
        values:getRequestWorkFormValues(findRequestInventoryRowByUniqueId(id)) || {},timestamp:Number(entry.timestamp || 0)};
}

async function retryBloomscapesRequestDraft(id,entry,publishRetry) {
    const context = createBloomscapesRetryContext(id,entry);
    try {
        const patch = buildNarrowRequestWorkRpcPatch(context.draft.dirtyValues,context.row);
        if (context.complete) patch.req_status = 'Complete';
        const result = await publishRetry(context,patch);
        if (!context.current()) return {saved:false,changed:false};
        if (result.status==='review-required') return blockBloomscapesRetry(context,result);
        if (result.status==='error') throw result.error;
        return await acknowledgeBloomscapesRetry(context,result);
    } catch (error) {
        if (!context.current()) return {saved:false,changed:false};
        globalThis.GncRuntimeWatchdog?.capture?.(error,'flushPendingRequestWorkEdits');
        if (!isRequestWorkVersionConflict(error)) return {saved:false,changed:false};
        const canonical = await fetchCanonicalRequestWorkRow(id).catch(() => null);
        if (!context.current()) return {saved:false,changed:false};
        return blockBloomscapesRetry(context,{canonical,error,attempts:0});
    }
}

function buildBloomscapesRequestRetryOptions(context,patch) {
    const {id,row,draft,complete,assertScope} = context;
    return {assertScope,complete,draft,
        expectedVersion:Math.max(1,Number(firstNonEmptyValue(row.ROW_VERSION,row.row_version,1)) || 1),
        initialPatch:patch,maxRebases:REQUEST_WORK_CONFLICT_RETRY_LIMIT,
        readCanonical:async () => {
            assertScope();const canonical = await fetchCanonicalRequestWorkRow(id);assertScope();return canonical;
        }};
}

async function blockBloomscapesRetry(context,result) {
    const {id,entry,row,draft} = context;
    const blocked = await blockRequestWorkConflict(row,draft,result.canonical || null,
        result.error || new Error('REQUEST_VERSION_CONFLICT'),result.attempts || 0);
    if (!context.current()) return {saved:false,changed:false};
    entry.requestWorkDraft = blocked;entry.autoRetryBlocked = true;
    entry.conflictType = blocked.complete && blocked.intentPolicy==='local-command' ? 'request-completion' : 'request-work';
    entry.conflictedAt = new Date().toISOString();
    const local = findRequestInventoryRowByUniqueId(id);
    if (local) {
        if (!blocked.legacy) applyRequestWorkValuesToItem(local,blocked.dirtyValues);
        updateRequestWorkConflictReview(local);
    }
    return {saved:false,changed:true};
}

async function acknowledgeBloomscapesRetry(context,reconciliation) {
    const {id,entry,row,complete,values,timestamp} = context;
    const result = reconciliation.result;
    if (String(result?.row?.unique_id || result?.row?.UNIQUE_ID || '')!==id) throw new Error('REQUEST_SAVE_UNCONFIRMED');
    const formatted = formatFetchedRows([result.row],ACTIVE_REQUEST_TABLE)[0];
    if (!formatted) throw new Error('REQUEST_SAVE_UNCONFIRMED');
    entry.requestWorkDraft = reconciliation.draft;
    const local = findRequestInventoryRowByUniqueId(id);
    const responseValues = getRequestWorkFormValues(local || row) || {};
    if (local && getQueueCompletionVersion(local)<=getQueueCompletionVersion(formatted)) Object.assign(local,formatted);
    if (complete && isRequestComplete(formatted)) {
        confirmQueueCompletion(formatted);scheduleRequestDeliveryWake('request_completed_retry');
    }
    finalizeRequestWorkDraftAfterSuccess(local || row,reconciliation.draft,
        {...reconciliation.draft.dirtyValues},formatted,values,timestamp,responseValues);
    await deleteAcknowledgedRequestBlobs(id,formatted).catch(error =>
        globalThis.GncRuntimeWatchdog?.capture?.(error,'requestRetryBlobCleanup'));
    return {saved:true,changed:false};
}
