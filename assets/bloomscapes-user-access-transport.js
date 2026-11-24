function readCompanyDirectoryRelation(table,query) {
    return supabaseFetch(table,'GET',null,query);
}

function saveCompanyDirectoryRecord(table,values,key,id) {
    return id ? supabaseFetch(table,'PATCH',values,companyDirectoryRecordFilter(key,id))
        : supabaseFetch(table,'POST',values,'');
}

function deleteCompanyDirectoryRecord(table,key,id) {
    return supabaseFetch(table,'DELETE',null,companyDirectoryRecordFilter(key,id));
}

function companyDirectoryRecordFilter(key,id) {
    return key+'=eq.'+encodeURIComponent(id);
}

let bloomscapesSelfAccessRequest;

function sendBloomscapesUserAccess(envelope) {
    const owner=getCanonicalAccessSessionIdentity();
    if (envelope.operation!=='resolve' || !owner || owner.legacy) {
        return postAppFunctionJson(APP_API_FUNCTION_URL,envelope,{
            timeoutMs:15000,label:'User and role access',idempotencyKey:envelope.command_id
        });
    }
    const epoch=nativeAuthRecoveryEpoch;
    const current=()=>epoch===nativeAuthRecoveryEpoch
        && globalThis.sameAccessSession(owner,getCanonicalAccessSessionIdentity());
    if (bloomscapesSelfAccessRequest?.current()) return bloomscapesSelfAccessRequest.promise;
    const request={current,promise:null};
    request.promise=readBloomscapesSelfAccess(current).finally(()=>{
        if (bloomscapesSelfAccessRequest===request) bloomscapesSelfAccessRequest=null;
    });
    bloomscapesSelfAccessRequest=request;
    return request.promise;
}

async function readBloomscapesSelfAccess(current) {
    if (navigator.onLine===false) throw Object.assign(new Error('Access refresh is offline.'),{code:'USER_ACCESS_UNAVAILABLE'});
    if (!readCachedNativeAuthSession()) throw nativeAuthReadRetryError();
    const signal=AbortSignal.timeout(4500);
    const result=await getSupabaseBrowserClient().rpc('gnc_get_my_user_access_snapshot').abortSignal(signal);
    if (!current()) throw staleSupabaseReadScopeError();
    if (result.error) {
        if (result.status===401) throw nativeAuthReadRetryError(result.error);
        const code=signal.aborted && !result.status ? 'USER_ACCESS_TIMEOUT' : result.error.message || result.error.code;
        throw Object.assign(new Error(result.error.message),{code,status:result.status});
    }
    if (result.data?.profile?.area_scopes) requestAnimationFrame(() => {
        if (!current()) return;
        const grid = document.getElementById('home-dashboard-grid');
        if (typeof mountBloomscapesAreaHubs === 'function') mountBloomscapesAreaHubs(grid);
    });
    return result.data;
}

async function sendBloomscapesUserLifecycle(envelope) {
    if (!supabaseClient?.functions?.invoke) throw new Error('User lifecycle service is unavailable.');
    const result=await supabaseClient.functions.invoke('auth-admin',{body:envelope});
    if (result.error) throw result.error;
    if (result.data?.ok!==true) {
        const error=new Error(String(result.data?.error || 'User lifecycle request failed.'));
        error.code=String(result.data?.error || 'USER_LIFECYCLE_FAILED');
        error.status=Number(result.data?.status) || 0;
        throw error;
    }
    return result.data;
}

async function requestBloomscapesPersonalScope(username,input=null) {
    const {client,owner}=await requireBloomscapesSession();
    const response=await client.rpc('gnc_user_personal_scope',{p_subject:username,p_input:input});
    await requireBloomscapesOwner(owner);
    return bloomscapesData(response);
}
