function bloomscapesLoadScopeIdentity(scope) {
    if (scope?.kind === 'order' && scope.id) return JSON.stringify(['order',String(scope.id)]);
    if (scope?.kind === 'dock' && scope.dock) return JSON.stringify(['dock',normalizeDockViewDockKey(scope.dock)]);
    if (scope?.kind === 'trip' && scope.dock && scope.trip) {
        return JSON.stringify(['trip',normalizeDockViewDockKey(scope.dock),String(scope.trip)]);
    }
    return '';
}

function currentBloomscapesLoadContext() {
    const farm=getBloomscapesFarm();
    const owner=getSupabaseReadIdentityScope();
    const season=String(getConfiguredCurrentSeasonCode() || '').trim().toUpperCase();
    const year=String(getConfiguredCurrentSalesYearCode() || '').trim();
    return {farm,owner,season,year,key:JSON.stringify([farm,owner,season,year])};
}

async function readBloomscapesLoadMaximizer(context,scopes) {
    const {client,owner}=await requireBloomscapesSession();
    if (context.key!==currentBloomscapesLoadContext().key) throw new Error('The load planning scope changed.');
    const response=await client.rpc('gnc_load_maximizer',{
        p_farm:context.farm,p_scopes:scopes,p_season:context.season,p_sales_year:context.year
    });
    await requireBloomscapesOwner(owner);
    if (context.key!==currentBloomscapesLoadContext().key) throw new Error('The load planning scope changed.');
    const data=bloomscapesData(response);
    const positions=Array.isArray(data?.summaries) && data.summaries.length===scopes.length;
    if (data?.ok!==true || data.farm_code!==context.farm || !positions
        || scopes.some((scope,index)=>bloomscapesLoadScopeIdentity(scope)!==bloomscapesLoadScopeIdentity(data.summaries[index]))) {
        throw new Error('Load planning did not return the exact requested scopes.');
    }
    return data.summaries;
}
