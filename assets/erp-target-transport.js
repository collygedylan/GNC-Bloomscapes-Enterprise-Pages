async function executeSelectedErpTarget(target, context) {
    const session = await getNativeAuthSession();
    if (!session?.access_token) throw new Error('An authenticated ERP session is required.');
    const response = await fetch(APP_API_FUNCTION_URL,{
        method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
        headers:{Authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({action:'bloomscapes_erp_target',targetKey:target.key,commandId:context.commandId}),
        signal:AbortSignal.timeout(context.timeoutMs)
    }).catch(error=>{
        if (error.name==='TimeoutError' || error.name==='AbortError') error.retryable=true;
        throw error;
    });
    const result = await response.json();
    if (!response.ok || result.ok===false) throw Object.assign(new Error(result.error || 'ERP service unavailable.'),
        {retryable:[502,504].includes(response.status)});
    return result;
}
