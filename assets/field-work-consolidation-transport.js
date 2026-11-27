/**
 * @param {object} item
 * @param {number|string} year
 * @param {AbortSignal} signal
 * @returns {Promise<object>} Scoped consolidation suggestions, effective capacity and available locations.
 */
async function readFieldWorkConsolidation(item,year,signal) {
    if (!canViewFieldWorkConsolidation()) throw new Error('Field Work Consolidation access is required.');
    const owner = getSupabaseReadIdentityScope();
    const headers = getPassiveNativeAuthRequestHeaders();
    if (!headers?.Authorization) throw new Error('Sign in to check live bed capacity.');
    const itemQuery = new URLSearchParams({select:'cpb,cpb_source',itemcode:'eq.'+item.code,limit:'1'});
    const locationQuery = new URLSearchParams({select:'locationcode,total_beds,reserved_2027_beds',active:'eq.true',bay:'eq.000',limit:'500'});
    const send = (path,body) => readConsolidationCapacityResource(path,body,headers,signal);
    const [suggestions,cpbRows,locations] = await Promise.all([
        send('rpc/get_consolidation_suggestions_v1',{p_itemcode:item.code,p_saleyear:Number(year)}),
        send('ph_item_cpb?'+itemQuery),
        send('ph_location_beds?'+locationQuery)
    ]);
    let cpb = cpbRows[0];
    if (!cpb) {
        const value = await send('rpc/resolve_effective_cpb',{p_itemcode:item.code,p_contsize:item.size});
        cpb = {cpb:value,cpb_source:'CONTSIZE_DEFAULT'};
    }
    if (signal.aborted || owner!==getSupabaseReadIdentityScope() || !canViewFieldWorkConsolidation()) {
        throw new DOMException('Consolidation scope changed','AbortError');
    }
    if (!Array.isArray(suggestions) || !Array.isArray(locations) || locations.length>=500) {
        throw new Error('The live capacity response could not be verified.');
    }
    return {suggestions,cpb,locations};
}

async function readConsolidationCapacityResource(path,body,headers,signal) {
    const send = authorization => fetchWithTimeout(SUPABASE_URL+'/rest/v1/'+path,{
        method:body ? 'POST' : 'GET', headers:authorization, signal,
        body:body ? JSON.stringify(body) : undefined, cache:'no-store', referrerPolicy:'no-referrer'
    },6000,'Field Work Consolidation');
    const response = await sendPassiveNativeRead(send,headers,signal);
    if (!response.ok) throw new Error('Live bed capacity is unavailable ('+response.status+').');
    return response.json();
}
