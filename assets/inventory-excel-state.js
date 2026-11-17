function getInventoryExcelFields(scope = '') {
    if (scope==='reclass') return [];
    const fields=[['username','Assigned To'],['stock','Stock / Season'],['view','View'],['genus','Genus'],
        ['plantgroupcode','Plant Group'],['contsize','Container Size'],['salesrep','Sales Rep'],['customer','Customer / Consignee']];
    if (scope === 'docks') fields.unshift(['commonname','Common Name']);
    return fields.filter(([key])=>scope==='av' ? !['username','stock','view'].includes(key)
        : key!=='view' || !['drive','eval2','studio'].includes(scope));
}
function getInventoryExcelState(scope) {
    const owner = getSupabaseReadIdentityScope()+(nativeAuthSessionActive?':'+getBloomscapesFarm():'');
    const cache = getInventoryExcelState.cache;
    if (!cache || cache.owner !== owner) getInventoryExcelState.cache = {owner, scopes:new Map()};
    const states = getInventoryExcelState.cache.scopes;
    if (!states.has(scope)) states.set(scope,{scope,owner,rows:[],filters:{},facts:new WeakMap(),revision:0});
    return states.get(scope);
}
function inventoryExcelKey(value) { return String(value ?? '').trim().toLowerCase(); }
function getInventoryExcelFacts(row,state) {
    if (!row || typeof row!=='object') return [];
    if (!state.facts.has(row)) state.facts.set(row,buildInventoryExcelFacts(row,state));
    return state.facts.get(row);
}
function inventoryExcelFactMatches(fact, filters, ignore = '') {
    return Object.entries(filters).every(([key,values])=>key===ignore || values===null || fact[key]?.some(value=>values.has(inventoryExcelKey(value))));
}
function inventoryExcelRowMatches(row, state, ignore = '') {
    return getInventoryExcelFacts(row,state).some(fact=>inventoryExcelFactMatches(fact,state.filters,ignore));
}
function getInventoryExcelOptions(state, field) {
    const counts = new Map();
    const candidates = state.scope === 'drive' ? getDriveExcelFacetRows(state.rows, field) : state.rows;
    const filters = { ...state.filters };
    if (state.scope === 'av' && getAvPhotoMode() === 'valid_photos') delete filters.season;
    for (const row of candidates) {
        const facts = getInventoryExcelFacts(row, state).filter(fact => inventoryExcelFactMatches(fact, filters, field));
        const values = new Map(facts.flatMap(fact => (fact[field] || []).map(value => [inventoryExcelKey(value), value])));
        for (const [key, label] of values) {
            const entry = counts.get(key) || { key, label, count: 0 };
            entry.count++;
            counts.set(key, entry);
        }
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
}
function applyInventoryExcelFilters(scope, rows) {
    if (scope==='reclass') return Array.isArray(rows)?rows:[];
    const state = getInventoryExcelState(scope);
    const allowed = new Set(getInventoryExcelFields(scope).map(([key]) => key));
    for (const key of Object.keys(state.filters)) if (!allowed.has(key)) delete state.filters[key];
    if (state.rows!==rows) state.revision++;
    state.rows = Array.isArray(rows) ? rows : []; state.facts = new WeakMap();
    const committed=typeof document !== 'undefined' && typeof commitActiveRequestExcelFilters === 'function'
        && commitActiveRequestExcelFilters(scope);
    if (typeof document !== 'undefined' && !committed && !state.paintPending) {
        state.paintPending=true;
        setTimeout(()=>{state.paintPending=false;mountInventoryExcelFilters(scope);},0);
    }
    return Object.keys(state.filters).length ? state.rows.filter(row=>inventoryExcelRowMatches(row,state,scope === 'av' && getAvPhotoMode() === 'valid_photos' ? 'season' : '')) : state.rows;
}
