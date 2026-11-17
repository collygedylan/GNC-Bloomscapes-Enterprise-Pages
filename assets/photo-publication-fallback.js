
function nativeRequestEvaluationPatch(patch) {
    const fields = new Set(['req_spec','req_caliper','req_match','av_note','req_pic_note','req_comments',
        'req_sales_note','req_photo_link','req_photo_name','req_qty','req_status','request_note',
        'explicit_av_note','force_clear_photos','queued_photo_ids']);
    return Object.fromEntries(Object.entries(patch || {}).filter(([key])=>fields.has(key)));
}

function isBloomscapesPhotoAction(command) {
    return ['request_work','suspend_tag'].includes(command.action) && command.operation === 'save';
}

async function sendBloomscapesPhotoCommand(operation,command,options={}) {
    const owner=getSupabaseReadIdentityScope(),epoch=nativeAuthRecoveryEpoch;
    const headers=await getNativeAuthRequestHeaders(false);
    if (!headers?.Authorization || owner!==getSupabaseReadIdentityScope() || epoch!==nativeAuthRecoveryEpoch) {
        throw nativeSessionRecoveryError();
    }
    const response=await fetchWithTimeout(SUPABASE_URL+'/rest/v1/bloomscapes_photo_commands',{
        method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify({operation,command}),signal:options.signal,cache:'no-store',referrerPolicy:'no-referrer'
    },25000,'Photo publication fallback');
    const rows=await response.json();
    if (owner!==getSupabaseReadIdentityScope() || epoch!==nativeAuthRecoveryEpoch) throw staleSupabaseReadScopeError();
    if (!response.ok || rows?.[0]?.receipt?.ok!==true) throw Object.assign(new Error(rows?.message || 'Photo publication not confirmed'),{status:response.status});
    return rows[0].receipt;
}

async function dispatchBloomscapesPhotoRpc(operation,command,send,options={}) {
    const owner=getSupabaseReadIdentityScope(),epoch=nativeAuthRecoveryEpoch;
    try {
        const response=await send();
        if (response.ok) return response;
    } catch(error) {
        if (options.signal?.aborted || error?.name==='AbortError') throw error;
    }
    if (owner!==getSupabaseReadIdentityScope() || epoch!==nativeAuthRecoveryEpoch) throw staleSupabaseReadScopeError();
    const receipt=await sendBloomscapesPhotoCommand(operation,command,options);
    return new Response(JSON.stringify(receipt),{status:200,headers:{'Content-Type':'application/json'}});
}

async function postAppFunctionJson(url, body, options = {}) {
    const command = JSON.parse(JSON.stringify(body || {}));
    const owner = getSupabaseReadIdentityScope();
    const epoch = nativeAuthRecoveryEpoch;
    try {
        const result = await retryOperationalRpc(async () => ({ok:true,value:await postAppFunctionAttempt(url,command,options)}), {
            safe:isRecoverableOperationalRead(command), signal:options.signal,
            current:() => owner === getSupabaseReadIdentityScope() && epoch === nativeAuthRecoveryEpoch
        });
        return result.value;
    } catch (error) {
        if (isBloomscapesPhotoAction(command) && owner === getSupabaseReadIdentityScope() && epoch === nativeAuthRecoveryEpoch && !options.signal?.aborted) {
            return {ok:true,data:await sendBloomscapesPhotoCommand(command.action,command,options)};
        }
        if (error.status) reportAppFunctionFailure(String(command?.action || ''),command,{status:error.status},error.code || '');
        throw error;
    }
}
