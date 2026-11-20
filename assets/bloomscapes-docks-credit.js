
async function readBloomscapesDockCreditVault(scope,frame,refresh=false) {
    const {mode,customer,consignee,offset,search} = frame;
    const args = { p_farm:scope.farm,p_mode:mode,p_customer:customer?.id || null,
        p_consignee:consignee?.id || null,p_offset:offset,p_search:search };
    assertDockCreditVaultScope(scope);
    return readScopedSecondarySnapshot('dock-vault:'+JSON.stringify(args),
        ()=>readDockCreditVaultPage(scope,args),refresh);
}

async function readDockCreditVaultPage(scope,args) {
    const receipt = await runDockCreditVaultRpc(scope,'gnc_rep_dock_vault',args);
    if (receipt.mode !== args.p_mode || receipt.customer !== args.p_customer
        || receipt.consignee !== args.p_consignee || !Array.isArray(receipt.rows)
        || receipt.rows.length>30 || typeof receipt.has_more!=='boolean' || typeof receipt.can_review_credit!=='boolean') {
        throw new Error('Dock Vault returned a mismatched folder receipt.');
    }
    return receipt;
}

async function readBloomscapesDockCreditHotspots(scope,refresh=false) {
    assertDockCreditVaultScope(scope);
    return readScopedSecondarySnapshot('dock-vault:hotspots',async()=>{
        const result = await runDockCreditVaultRpc(scope,'gnc_dock_credit_hotspots',{p_farm:scope.farm});
        if (!Array.isArray(result.items) || !Array.isArray(result.parties)) throw new Error('Credit hotspots are unavailable.');
        return result;
    },refresh);
}

async function submitBloomscapesDockCreditFeedback(scope,id,verdict) {
    const receipt = await runDockCreditVaultRpc(scope,'gnc_record_dock_credit_feedback',{
        p_farm:scope.farm,p_claim:id,p_verdict:verdict
    });
    if (receipt.claim_id !== id || receipt.verdict !== verdict) throw new Error('Credit feedback receipt did not match.');
    invalidateScopedSecondarySnapshots('dock-vault:');
    return receipt;
}

async function runDockCreditVaultRpc(scope,name,args) {
    const {client,owner}=await requireBloomscapesSession();
    assertDockCreditVaultScope(scope);
    const result=await client.rpc(name,args).abortSignal(AbortSignal.timeout(5500));
    await requireBloomscapesOwner(owner);
    assertDockCreditVaultScope(scope);
    const receipt=bloomscapesData(result);
    if (receipt?.ok !== true || receipt.farm_code !== scope.farm) throw new Error('Dock Vault farm receipt did not match.');
    return receipt;
}

function assertDockCreditVaultScope(scope) {
    if (scope.identity !== getSupabaseReadIdentityScope() || scope.farm !== getBloomscapesFarm()) {
        throw new Error('The selected Dock Vault account or farm changed.');
    }
}
