function getInventoryExcelFields(scope = '') {
    if (scope==='reclass') return [];
    if (scope==='request' || scope==='suspend') return [['username','Assigned To']];
    const fields=[['username','Assigned To'],['stock','Stock / Season'],['view','View'],['genus','Genus'],
        ['plantgroupcode','Plant Group'],['contsize','Container Size'],['salesrep','Sales Rep'],['customer','Customer / Consignee']];
    if (scope === 'inventory') return [...fields.slice(0,3),['contsize','Size'],fields[3],fields[6]];
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
function inventoryExcelProjection(filters,field='') {
    const fields=[field,...Object.keys(filters).filter(key=>key!==field && filters[key]!==null)];
    if (fields.some(key=>key==='customer' || key==='salesrep')) return 'demand';
    return fields.every(key=>!key || key==='username') ? 'owner' : 'base';
}

function inventoryExcelOwnerIndex(filters,field='') {
    if (field !== 'username' && !filters.username) return undefined;
    return typeof nativeAuthSessionActive !== 'undefined' && nativeAuthSessionActive && typeof getBloomscapesAssignmentIndex === 'function'
        ? getBloomscapesAssignmentIndex() : null;
}

function getInventoryExcelFacts(row,state,projection,ownerIndex) {
    if (!row || typeof row!=='object') return [];
    let cached=state.facts.get(row);
    if (!cached) {
        cached={};
        state.facts.set(row,cached);
    }
    if (ownerIndex === undefined) return cached[projection] ||= buildInventoryExcelFacts(row,state,projection);
    if (!cached.owners || cached.owners.index !== ownerIndex) {
        cached.owners = {index:ownerIndex,values:[],facts:{}};
    }
    const owners = cached.owners;
    return owners.facts[projection] ||= buildInventoryExcelFacts(row,state,projection,
        (index,item)=>owners.values[index] ||= getInventoryExcelFacetOwners(item,ownerIndex));
}
function inventoryExcelFactMatches(fact, filters, ignore = '') {
    return Object.entries(filters).every(([key,values])=>key===ignore || values===null || fact[key]?.some(value=>values.has(inventoryExcelKey(value))));
}
function inventoryExcelRowMatches(row, state, ignore = '') {
    const filters=state.filters;
    if (!Object.keys(filters).some(key=>key!==ignore && filters[key]!==null)) return true;
    const ownerIndex=inventoryExcelOwnerIndex(filters);
    return getInventoryExcelFacts(row,state,inventoryExcelProjection(filters),ownerIndex)
        .some(fact=>inventoryExcelFactMatches(fact,filters,ignore));
}

function inventoryExcelSelectionKey(filters) {
    return Object.entries(filters).map(([key,values])=>[key,values ? [...values].sort() : null]);
}

function inventoryExcelOptionsContext(state,field) {
    const driveKey=state.scope==='drive' ? getDriveQuickFilterStateKey(getDrivePlantFilterScopeKey(state.rows)) : '';
    const photoMode=state.scope==='av' ? getAvPhotoMode() : '';
    const filters={...state.filters};
    if (photoMode==='valid_photos') delete filters.season;
    const ownerIndex=inventoryExcelOwnerIndex(filters,field);
    const key=JSON.stringify([state.revision,driveKey,photoMode,inventoryExcelSelectionKey(filters)]);
    if (state.optionsKey!==key || (ownerIndex!==undefined && state.optionsOwnerIndex!==ownerIndex)) {
        state.optionsKey=key;
        if (ownerIndex!==undefined) state.optionsOwnerIndex=ownerIndex;
        state.options=new Map();
        state.optionTotals=new Map();
    }
    return {filters,ownerIndex};
}

function getInventoryExcelOptions(state, field) {
    const {filters,ownerIndex}=inventoryExcelOptionsContext(state,field);
    if (state.options.has(field)) return inventoryExcelPickerOptions(state,field);
    const counts = new Map();
    const candidates = state.scope === 'drive' ? getDriveExcelFacetRows(state.rows, field) : state.rows;
    let matchingRows = 0;
    const projection=inventoryExcelProjection(filters,field);
    const otherSelections=inventoryExcelActiveSelections(filters,field);
    const values = new Map();
    for (const row of candidates) {
        values.clear();
        const facts=getInventoryExcelFacts(row,state,projection,ownerIndex);
        if (collectInventoryExcelOptionValues(facts,otherSelections,field,values)) matchingRows++;
        for (const [key, label] of values) {
            const entry = counts.get(key) || { key, label, count: 0 };
            entry.count++;
            counts.set(key, entry);
        }
    }
    const compare=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'}).compare;
    const options = [...counts.values()].sort((a,b)=>compare(a.label,b.label));
    state.options.set(field, options);
    state.optionTotals.set(field,matchingRows);
    return inventoryExcelPickerOptions(state,field);
}

function inventoryExcelPickerOptions(state,field) {
    const options=state.options.get(field);
    return field==='username' && state.scope!=='eval2' ? eligiblePickerFacets(options,state.scope) : options;
}

function inventoryExcelActiveSelections(filters,ignore) {
    return Object.entries(filters).filter(([key,selection])=>key!==ignore && selection!==null);
}

function matchesInventoryExcelSelections(fact,selections) {
    return selections.every(([key,selection])=>fact[key]?.some(value=>selection.has(inventoryExcelKey(value))));
}

function collectInventoryExcelOptionValues(facts,selections,field,values) {
    let matched=false;
    for (const fact of facts) {
        if (!matchesInventoryExcelSelections(fact,selections)) continue;
        matched=true;
        for (const value of fact[field] || []) values.set(inventoryExcelKey(value),value);
    }
    return matched;
}

function applySavedDriveExcelFilters(rows, saved) {
    if (!saved || !Object.keys(saved).length) return rows;
    const state = getInventoryExcelState('drive');
    const allowed = inventoryExcelFilterKeys('drive');
    const filters = Object.fromEntries(Object.entries(saved).filter(([key,values])=>allowed.has(key) && Array.isArray(values))
        .map(([key,values])=>[key,new Set(values)]));
    return getFilteredInventoryExcelRows(state,'',filters,rows);
}

function getFilteredInventoryExcelRows(state,ignore,filters = state.filters,source = state.rows) {
    const selections=inventoryExcelActiveSelections(filters,ignore);
    if (!selections.length) return source;
    const ownerIndex = inventoryExcelOwnerIndex(filters);
    const projection = inventoryExcelProjection(filters);
    const key = JSON.stringify([state.revision,ignore,inventoryExcelSelectionKey(filters)]);
    const previous = state.filtered;
    if (projection!=='demand' && previous?.key===key && previous.ownerIndex===ownerIndex && previous.source===source) return previous.rows;
    const rows = source.filter(row=>getInventoryExcelFacts(row,state,projection,ownerIndex)
        .some(fact=>matchesInventoryExcelSelections(fact,selections)));
    if (projection!=='demand') state.filtered={key,ownerIndex,rows,source};
    return rows;
}

function inventoryExcelFilterKeys(scope) {
    const fields = getInventoryExcelFields(scope);
    if (scope === 'drive' && typeof getDriveExcelHeaderFields === 'function') fields.push(...getDriveExcelHeaderFields());
    return new Set(fields.map(([key])=>key));
}

function applyInventoryExcelFilters(scope, rows) {
    if (scope==='reclass') return Array.isArray(rows)?rows:[];
    const state = getInventoryExcelState(scope);
    const allowed = inventoryExcelFilterKeys(scope);
    for (const key of Object.keys(state.filters)) if (!allowed.has(key)) delete state.filters[key];
    const epoch = typeof resolvedViewStateEpoch === 'number' ? resolvedViewStateEpoch : 0;
    if (state.rows!==rows || state.sourceEpoch!==epoch) {
        state.rows = Array.isArray(rows) ? rows : [];
        state.sourceEpoch = epoch;
        state.revision++;
        state.facts = new WeakMap();
    }
    const committed=typeof document !== 'undefined' && typeof commitActiveRequestExcelFilters === 'function'
        && commitActiveRequestExcelFilters(scope);
    if (typeof document !== 'undefined' && !committed && !state.paintPending) {
        state.paintPending=true;
        setTimeout(()=>{state.paintPending=false;mountInventoryExcelFilters(scope);},0);
    }
    const ignore = scope === 'drive' && typeof getDriveEvaluatorReportState === 'function' && getDriveEvaluatorReportState()
        ? 'username' : scope === 'av' && getAvPhotoMode() === 'valid_photos' ? 'season' : '';
    return getFilteredInventoryExcelRows(state,ignore);
}

function applyDockColumnFiltersToItems(items = [], inspectOnly = false) {
    const rows = applyDockColumnFiltersToItemsWithMap(items,dockColumnFilters);
    if (inspectOnly) {
        const state = getInventoryExcelState('docks');
        return getFilteredInventoryExcelRows({...state,rows,filtered:null},'');
    }
    return applyInventoryExcelFilters('docks',rows);
}

function applyDockStructuredFilters(items = [], inspectOnly = false) {
    if (!inspectOnly) clearRemovedDockTopFilterState();
    return applyDockColumnFiltersToItems(applyDockRepCustomerFiltersOnly(items),inspectOnly);
}
