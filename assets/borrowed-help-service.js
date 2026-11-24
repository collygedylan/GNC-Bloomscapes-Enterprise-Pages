function borrowedHelpIdentity() {
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id || window.__agdataSessionBoundary) return '';
    return JSON.stringify([getSupabaseReadIdentityScope(),getBloomscapesFarm()]);
}

function readBorrowedHelp(owner) {
    return borrowedHelpRpc(owner,'gnc_list_borrowed_help');
}

async function readSuperAdminPreviewPage(owner,after) {
    const receipt = await borrowedHelpRpc(owner,'gnc_preview_access',{p_after:after},18000);
    if (receipt.next !== null && (!Number.isInteger(receipt.next) || receipt.next <= after)) {
        throw Error('Preview roster did not advance.');
    }
    return receipt;
}

async function readExactSuperAdminPreview(owner,username) {
    const {rows} = await runBloomscapesUserDirectory('list');
    const row = rows.find(entry=>entry.id > 0 && entry.fields?.username === username);
    if (!row || !Number.isSafeInteger(row.id)) return null;
    const receipt = await readSuperAdminPreviewPage(owner,row.id-1);
    return receipt.users.find(profile=>profile.username === username && profile.id === 'user:'+row.id) || null;
}

async function submitBorrowedHelp(owner, action, id, input) {
    const args = {p_id:id};
    if (action === 'request') args.p_input = input;
    else if (action !== 'release') Object.assign(args,{p_action:action,p_workers:input || []});
    const rpc = {request:'gnc_request_borrowed_help',approve:'gnc_respond_borrowed_help',
        decline:'gnc_respond_borrowed_help',release:'gnc_release_borrowed_help'}[action];
    const receipt = await borrowedHelpRpc(owner,rpc,args);
    if (receipt.id !== id || receipt.action !== action) throw Error('Borrowed Help returned a different action receipt.');
    return receipt;
}

async function borrowedHelpRpc(scope, name, args = {}, timeout = 6500) {
    const {client,owner} = await requireBloomscapesSession();
    if (!scope || scope !== borrowedHelpIdentity()) throw Error('The active account or farm changed.');
    const farm = getBloomscapesFarm();
    const result = await client.rpc(name,{p_farm:farm,...args}).abortSignal(AbortSignal.timeout(timeout));
    await requireBloomscapesOwner(owner);
    const data = bloomscapesData(result);
    if (scope !== borrowedHelpIdentity() || data?.farm_code !== farm || data?.ok !== true) {
        throw Error('Borrowed Help returned a different farm or account.');
    }
    return data;
}

function prefetchRequestModalCustomerOptions(force = false) {
    if (nativeAuthProfile?.role === 'crew' && canOpenBloomscapesDocksWorkspace('borrowed-work')
        && !getAuthorizedRequestCategories().length) return Promise.resolve(false);
    if (!currentUser || (!canAccessView('request') && !canUseRequestRepScopedAccess())) return Promise.resolve(false);
    const owner = syncRequestModalCustomerMappingOwner();
    const signature = getRequestModalCustomerMappingCacheSignature();
    if (!force && prefetchRequestModalCustomerOptions.completedOwner === signature) return Promise.resolve(true);
    if (prefetchRequestModalCustomerOptions.owner === owner && prefetchRequestModalCustomerOptions.promise) return prefetchRequestModalCustomerOptions.promise;
    const epoch = requestMappingSecurityEpoch;
    const promise = fetchRequestCustomerMapRows().then(rows => {
        if (owner !== getRequestModalLookupOwnerSignature() || epoch !== requestMappingSecurityEpoch) return false;
        customerRepMapRows = rows;
        requestGlobalCustomerOptionsCacheKey = '';
        requestGlobalCustomerOptionsCache = [];
        const directory = getRequestMappedRepDirectory();
        requestModalCustomerOptionRowsCache.clear();
        requestExistingFolderGroupsByRepCache.clear();
        for (const [id, repRows] of directory.rowsBySalesrepId) {
            requestMappingRpcCache.set(id, { owner, signature: getRequestModalCustomerMappingCacheSignature(), revision: rows.mappingRevision, rows: repRows, stale: false });
        }
        // Prepare every authorized rep's sorted customer tree once, off the click path.
        for (const option of directory.options) getRequestModalCustomerOptionsForRep(option.label);
        buildRequestModalCustomerOptionsCache(true);
        prefetchRequestModalCustomerOptions.completedOwner = getRequestModalCustomerMappingCacheSignature();
        refreshRequestModalCustomerStepIfVisible();
        return true;
    }).catch(error => {
        if (isRequestModalCustomerAuthorizationFailure(error)) clearRequestModalCustomerMappingOwnerState();
        throw error;
    }).finally(() => { if (prefetchRequestModalCustomerOptions.promise === promise) prefetchRequestModalCustomerOptions.promise = null; });
    prefetchRequestModalCustomerOptions.owner = owner;
    prefetchRequestModalCustomerOptions.promise = promise;
    return promise;
}
