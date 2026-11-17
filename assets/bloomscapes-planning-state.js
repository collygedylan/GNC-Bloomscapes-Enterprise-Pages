let bloomscapesPlanningState={owner:'',rows:new Map(),scopes:new Map()};

function getBloomscapesPlanningState() {
    const owner=getSupabaseReadIdentityScope()+':'+getBloomscapesFarm();
    if (bloomscapesPlanningState.owner!==owner) bloomscapesPlanningState={owner,rows:new Map(),scopes:new Map()};
    return bloomscapesPlanningState;
}

function bloomscapesPlanningScope(row) {
    const location=inventoryFacetValue(row,'locationcode');
    return {farm:bloomscapesRowFarm(row),block:location.split('.').slice(0,2).join('.'),item:''};
}

function ensureBloomscapesPlanningScope(scope) {
    const state=getBloomscapesPlanningState(),key=JSON.stringify(scope);
    const prior=state.scopes.get(key);
    if (prior?.promise || prior?.ready || prior?.retryAt>Date.now()) return prior.promise || Promise.resolve(false);
    const entry={ready:false};state.scopes.set(key,entry);
    entry.promise=readBloomscapesPlanning(scope).then(rows=>{
        if (state!==getBloomscapesPlanningState() || scope.farm!==getBloomscapesFarm()) return false;
        for (const row of rows) state.rows.set([row.import_id,row.source_sheet,row.source_row].join(':'),row);
        entry.ready=true;return true;
    }).catch(error=>{
        entry.retryAt=Date.now()+15000;
        globalThis.reportHandledRuntimeIssue?.('planning_reference',error.code || 'PLANNING_READ_FAILED');
        return false;
    }).finally(()=>{entry.promise=null;});
    return entry.promise;
}

async function ensureBloomscapesPlanningRows(rows,current=()=>true) {
    const scopes=new Map(rows.map(row=>{const scope=bloomscapesPlanningScope(row);return [JSON.stringify(scope),scope];}));
    const owner=getBloomscapesPlanningState().owner,results=[];
    for (const scope of scopes.values()) {
        if (!current() || owner!==getBloomscapesPlanningState().owner) break;
        results.push(await ensureBloomscapesPlanningScope(scope));
    }
    return results;
}

function bloomscapesPlanningRows(source,kind='',blockOnly=false) {
    const code=inventoryFacetValue(source,'itemcode'),location=inventoryFacetValue(source,'locationcode'),lot=inventoryFacetValue(source,'lotcode');
    const farm=bloomscapesRowFarm(source),block=location.split('.').slice(0,2).join('.');
    const rows=[...getBloomscapesPlanningState().rows.values()].filter(row=>row.farm_code===farm && (!kind || row.kind===kind)
        && (blockOnly?row.locationcode.split('.').slice(0,2).join('.')===block
            :row.itemcode===code && row.locationcode===location && (!row.lotcode || row.lotcode===lot)));
    const preferred=rows.filter(row=>row.source_name.includes('Workflow'));
    return preferred.length?preferred:rows;
}

function bloomscapesPlanningShiftStatus(plan) {
    const shift=Number(plan.still_to_haul_shift_qty),trapped=Number(plan.trapped_units_on_row);
    if (shift>0 && trapped>0) return 'SPLIT (Part Shift + Part Trapped .Y)';
    if (trapped>0) return 'TRAPPED .Y (Excess / Unscheduled .Y to Reclass to Sellable)';
    return shift>0?'SHIFTING TO 2027 PROD SCHED':'Shift disposition requires source review';
}

function bloomscapesPlanningShield(source,now=new Date()) {
    const rows=bloomscapesPlanningRows(source,'SHIELD',true).filter(row=>row.csv_target_plant_date
        && row.csv_target_plant_date>=now.toISOString().slice(0,10) && Number(row.required_cans)>0);
    return {reserved:rows.length>0,rows,label:rows.length?'2027 Planting Fallback Shield · RESERVED · '+rows.map(row=>row.csv_target_plant_date).join(', ')
        :'2027 Planting Fallback Shield · No upcoming reservation in imported references'};
}

function bloomscapesPlanningTarget(plan) {
    const locations=[...new Set((plan.haul_to_dest_instruction || '').match(/[A-Z]+\.\d{2}\.\d{3}/g) || [])];
    return locations.length===1?locations[0]:'';
}
