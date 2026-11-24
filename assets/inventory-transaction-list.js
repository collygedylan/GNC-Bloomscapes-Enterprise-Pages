function mountInventoryTransactionList(container) {
    const host=container.querySelector('[data-transaction-list]');
    const end=container.querySelector('[data-transaction-end]');
    if (!host || !end) return;
    const state=inventoryTransactionHistoryState;
    const rows=getInventoryTransactionHistoryRowsForRender();
    if (rows.length) mountChunkedList(host,rows,row=>bloomscapesListNode(renderInventoryTransactionHistoryCard(row)).firstElementChild);
    observeContinuousListEnd(end,state.hasMore && !state.loading && !state.error && rows.length
        ? appendInventoryTransactionHistory : null);
}

async function appendInventoryTransactionHistory() {
    const state=inventoryTransactionHistoryState;
    if (state.loading || state.appendPending || !state.hasMore
        || getCurrentVisibleViewId()!=='managers' || activeHomeTab!==INVENTORY_TRANSACTION_HISTORY_VIEW) return;
    const query=inventoryTransactionListQuery();
    const key=JSON.stringify(query);
    const owner=getSupabaseReadIdentityScope();
    const offset=state.rows.length;
    state.appendPending=true;
    try {
        const data=await readInventoryTransactionListPage(query,offset);
        if (owner!==getSupabaseReadIdentityScope() || key!==JSON.stringify(inventoryTransactionListQuery())
            || state.rows.length!==offset) return;
        state.rows=[...state.rows,...data.rows];
        state.hasMore=data.hasMore && data.rows.length>0;
    } catch (error) {
        if (owner===getSupabaseReadIdentityScope()) state.error=error.message;
    } finally {
        state.appendPending=false;
        refreshInventoryTransactionHistoryResults();
    }
}

function inventoryTransactionListQuery() {
    const state=inventoryTransactionHistoryState;
    return {action:state.action,search:state.search || managersSearchTerm,dateStart:state.dateStart,dateEnd:state.dateEnd};
}

async function readInventoryTransactionListPage(query,offset=0) {
    const data=await postAppFunctionJson(APP_API_FUNCTION_URL,{
        action:'inventory_transaction_history',filter_action:query.action || 'all',search:query.search || '',
        dateStart:query.dateStart || '',dateEnd:query.dateEnd || '',limit:100,offset
    },{timeoutMs:45000,label:'Transaction History'});
    if (!data || data.ok===false || data.httpOk===false || !Array.isArray(data.rows)) {
        throw new Error(data?.message || 'Transaction history could not load.');
    }
    return {rows:data.rows,hasMore:data.hasMore===true,count:data.count};
}
