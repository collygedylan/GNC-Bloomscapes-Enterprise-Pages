function salesCompatibilityMatches(params,row) {
    for (const [key,value] of params) {
        if (['select','order','limit','offset'].includes(key)) continue;
        const actual=String(row[key] ?? '');
        if (value.startsWith('eq.') && actual!==value.slice(3)) return false;
        if (value.startsWith('in.(') && value.endsWith(')') && !value.slice(4,-1).split(',').map(v=>v.replace(/^"|"$/g,'')).includes(actual)) return false;
    }
    return true;
}

async function fetchSalesCompatibilityPage(action,farm,cursor,signal) {
    const payload={status:'all',cursor,limit:100};
    if (action==='request_history') payload.farm=farm;
    const response=await postAppFunctionJson(APP_API_FUNCTION_URL,{action,operation:'compatibility',payload},
        {timeoutMs:30000,label:'Sales records',signal});
    if (!response?.ok) {
        const error=new Error(response?.error || 'Sales records could not load for this account.');
        error.status=Number(response?.status || 0);error.code=String(response?.code || '').toUpperCase();error.payload=response;
        throw error;
    }
    return response.data;
}

async function collectSalesCompatibilityRows(table,params,farm,account,signal) {
    const action=table===SALES_CREDIT_REQUESTS_TABLE ? 'sales_credit' : 'request_history';
    const rows=[];
    let cursor=null;
    do {
        const page=await fetchSalesCompatibilityPage(action,farm,cursor,signal);
        if (account!==currentUser || farm!==getBloomscapesFarm()) throw staleSupabaseReadScopeError();
        rows.push(...(page?.rows || []).filter(row=>salesCompatibilityMatches(params,row)));
        cursor=page?.nextCursor || null;
    } while (cursor);
    return rows;
}

async function readSalesCompatibilityRows(table,query='',options={}) {
    const account=currentUser,farm=getBloomscapesFarm();
    const readKey=JSON.stringify(['compatibility',account,farm,table,query]);
    const read=({signal})=>collectSalesCompatibilityRows(table,new URLSearchParams(query),farm,account,signal);
    return withProductionLiveSyncSignal(options.signal || null,signal=>runDedupeSupabaseRead(readKey,read,{signal}));
}
