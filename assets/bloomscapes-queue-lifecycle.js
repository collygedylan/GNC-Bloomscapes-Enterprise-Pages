function isRequestPendingVisible(item) {
    if (!item) return false;
    const active = isTruthishHistoryValue(item.REQUEST_ACTIVE);
    const status = normalizeRequestStatus(firstNonEmptyValue(item.REQ_STATUS,item.req_status,item.STATUS,item.status,'')).toLowerCase();
    const history = isTruthishHistoryValue(item.REQUEST_HISTORY_ONLY)
        || isTruthishHistoryValue(item.REQUEST_HISTORY) && !active;
    return (active || isRequestVisibleForCurrentUser(item)) && !isMoveRequestRow(item)
        && !history && !item.REQ_ARCHIVED && !hasConfirmedRequestCompletion(item)
        && !isOptimisticallyCompletedRow(item) && (active || !hasCompletionDateValue(item))
        && ['','pending','open'].includes(status);
}

function hydrateBloomscapesMissingRequestStock(row) {
    if (!row || row.REQUEST_HISTORY || findLinkedMasterRow(row)) return row;
    for (const key of ['PTRONHAND','PTRREVIEWED','PTRAVAILABLE','ON_HAND','REVIEW','AVAILABLE','OPEN_STOCK','S_LTS','LOC_ON_HAND','LOC_PHOTO_MATCH']) {
        row[key] = row[key.toLowerCase()] = 0;
    }
    return row;
}

function filterBloomscapesSuspendSnapshot(rows,res) {
    if (res._fromCache || !res._verifiedLiveSync) return rows;
    const meta = res.data?.readMeta;
    const masterComplete = Array.isArray(res.data) && meta?.rowCompleteness==='complete' && Number(meta.total)===res.data.length;
    const sources = [['ph_soc_master',res.socData],['ph_reserves',res.reservesData]]
        .filter(([,items])=>Array.isArray(items));
    if (!masterComplete && !sources.length) return rows;
    const ids = new Map(sources.map(([table,items])=>[table,new Set(items.map(row=>String(row.UNIQUE_ID || row.unique_id || '')))]));
    const inventory = new Map();
    for (const master of masterComplete ? res.data : []) {
        const key = String(master.ITEMCODE || master.itemcode || '').toUpperCase();
        if (!inventory.has(key)) inventory.set(key,[]);
        inventory.get(key).push(master);
    }
    return rows.filter(row=> {
        if (!isDockSuspendDcRequestSource(row)) return true;
        const source = String(row.SOURCE_TABLE || row.source_table || '').toLowerCase();
        const orderId = String(row.DOCK_SUSPEND_SOURCE_UID || row.dock_suspend_source_uid || row.source_order_id || '');
        if (ids.has(source) && orderId && !ids.get(source).has(orderId)) return false;
        const key = String(row.ITEMCODE || row.itemcode || '').toUpperCase();
        return !masterComplete || (inventory.get(key) || []).some(master=>canonicalInventorySameLot(master,row));
    });
}

function isPhysicalSuspendTagClosed(row) {
    const status=String(row.STATUS || row.status || '').toLowerCase();
    const retained=['SUSPEND','SUSPENDED'].includes(String(row.SUSPEND || row.suspend || '').toUpperCase());
    return row.suspend_completed===true || row.SUSPEND_COMPLETED===true || row.completed===true
        || status==='deleted' || ['complete','completed'].includes(status) && !retained;
}

function uniquePhysicalSuspendTags(rows) {
    const seen = new Set(), orders = new Set();
    return rows.filter(row => {
        if (isPhysicalSuspendTagClosed(row)) return false;
        const key = getPhysicalSuspendTagKey(row), order = getDockOrderBusinessKey(row);
        if (!key || seen.has(key) || order && orders.has(order)) return false;
        seen.add(key); if (order) orders.add(order);
        return true;
    });
}

