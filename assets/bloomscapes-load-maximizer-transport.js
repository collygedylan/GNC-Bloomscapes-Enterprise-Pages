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

function assertBloomscapesLoadContext(context) {
    if (context.key!==currentBloomscapesLoadContext().key) throw new Error('The load planning scope changed.');
}

function validateBloomscapesLoadPage(context,scopes,response) {
    const data=bloomscapesData(response);
    const positions=Array.isArray(data?.summaries) && data.summaries.length===scopes.length;
    if (data?.ok!==true || data.farm_code!==context.farm || !positions
        || scopes.some((scope,index)=>bloomscapesLoadScopeIdentity(scope)!==bloomscapesLoadScopeIdentity(data.summaries[index]))) {
        throw new Error('Load planning did not return the exact requested scopes.');
    }
    return data.summaries;
}

async function readBloomscapesLoadPage(context,scopes,client,owner) {
    assertBloomscapesLoadContext(context);
    const response=await client.rpc('gnc_load_maximizer',{
        p_farm:context.farm,p_scopes:scopes,p_season:context.season,p_sales_year:context.year
    });
    await requireBloomscapesOwner(owner);
    assertBloomscapesLoadContext(context);
    const canSplit=scopes.length>1 && (response.error?.code==='57014' || response.status===500);
    if (canSplit) {
        const split=Math.ceil(scopes.length/2);
        const first=await readBloomscapesLoadPage(context,scopes.slice(0,split),client,owner);
        const rest=await readBloomscapesLoadPage(context,scopes.slice(split),client,owner);
        return first.concat(rest);
    }
    return validateBloomscapesLoadPage(context,scopes,response);
}

async function readBloomscapesLoadMaximizer(context,scopes) {
    const {client,owner}=await requireBloomscapesSession();
    const results=[];
    for (let offset=0;offset<scopes.length;offset+=3) {
        results.push(...await readBloomscapesLoadPage(context,scopes.slice(offset,offset+3),client,owner));
    }
    return results;
}
