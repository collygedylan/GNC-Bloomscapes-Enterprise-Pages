function applyConfirmedRequestCompletionReceipt(item, result, scope) {
    if (scope !== getSupabaseReadIdentityScope()) throw staleSupabaseReadScopeError();
    const id = getItemUniqueId(item), row = result?.row;
    if (!id || result?.ok === false || result?.error || result?.active === true || result?.lifecycle_state !== 'completed_history'
        || !row || getItemUniqueId(row) !== id || !hasRequestCompletionState(row)) throw new Error('REQUEST_COMPLETION_RECEIPT_UNCONFIRMED');
    const saved = formatFetchedRows([row], ACTIVE_REQUEST_TABLE)[0] || row;
    const receipt = Object.assign({}, saved, { ROW_VERSION:Number(result.row_version ?? row.row_version ?? row.ROW_VERSION) || 0,
        row_version:Number(result.row_version ?? row.row_version ?? row.ROW_VERSION) || 0,
        REQ_STATUS:'Complete', req_status:'Complete', REQUEST_ACTIVE:false, REQUEST_HISTORY:true });
    confirmQueueCompletion(receipt);
    const version = getQueueCompletionVersion(receipt);
    if (!version || getQueueCompletionVersion(item) <= version) Object.assign(item, receipt);
    requestsInventory = requestsInventory.filter(candidate => getItemUniqueId(candidate) !== id || version > 0 && getQueueCompletionVersion(candidate) > version);
    refreshRealtimeDetailLookupIndexes(ACTIVE_REQUEST_TABLE);
    refreshLocalRequestViewState('request-completion-confirmed', { forceRender:true, userAction:true });
    globalThis.document?.dispatchEvent?.(new Event('gnc-completed-request-confirmed'));
    return receipt;
}
