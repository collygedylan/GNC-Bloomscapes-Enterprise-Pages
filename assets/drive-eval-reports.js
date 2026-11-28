let driveEvaluatorReport;
const driveEvalReason = {id:'hold-stop-reason',label:'Hold/Stop by Plant Group & Reason'};
const driveEvalAudit = {id:'field-audit',label:'Season Y ≤ 2026 Audit'};
const driveEvalLeaf = {id:'hold-leaf-quality',label:'330 H/S Leaf Quality'};

function driveEvaluatorScope() {
    const {scope,preview} = getActiveEvalReportsAccess();
    if (!['own','all'].includes(scope)) return null;
    const farm = getBloomscapesFarm();
    return {scope,preview,farm,key:JSON.stringify([getSupabaseReadIdentityScope(),farm,scope,preview,
        appAccessSnapshotState.snapshot?.dataPermissionVersion])};
}

function currentDriveEvaluatorReport(state) {
    return driveEvaluatorReport === state && driveEvaluatorScope()?.key === state.key;
}

function getDriveEvaluatorReportState() {
    const scope = driveEvaluatorScope();
    if (!scope) return driveEvaluatorReport = null;
    if (driveEvaluatorReport?.key !== scope.key) {
        driveEvaluatorReport = {...scope,report:'',evaluator:scope.preview || (scope.scope === 'own' ? currentUser : '')};
    }
    return driveEvaluatorReport;
}

function driveEvaluatorReportOptions() {
    const api = getManagerEvalReports2Api();
    const names = {'low-stock':'Low Stock','not-in-f1':'Not in F1'};
    const second = api?.REPORT_IDS.map(id=>({id,label:names[id] || api.REPORT_META[id].label})) || [];
    return [...EVAL_ROLE_REPORTS,driveEvalReason,...second.concat(driveEvalAudit,driveEvalLeaf)
        .map(({id,label})=>({id:'eval2:'+id,label:'Eval Reports #2 · '+label}))];
}

function loadDriveEvaluatorPicker(state) {
    if (!state || !currentDriveEvaluatorReport(state)) return;
    const revision = getDatasetLoadSignature('warehouseAssignedItems');
    if (state.revision === revision || state.pending) return;
    state.error = '';
    state.pending = readEvalReportsScope(state.farm,state.preview).then(receipt=>{
        if (!currentDriveEvaluatorReport(state)) return;
        if (receipt.scope !== state.scope) throw new Error('Assigned user scope could not be verified.');
        state.revision = revision;
        state.owners = new Map(receipt.evaluators.map(({username,row_ids})=>[username,new Set(row_ids.map(String))]));
        state.receipt = receipt;
        if (state.scope === 'all') mergeDriveAssignedOwners(state);
    }).catch(error=>{
        if (currentDriveEvaluatorReport(state)) state.error = error.message;
    }).finally(()=>{
        state.pending = null;
        if (currentDriveEvaluatorReport(state) && isViewVisible('drive')) renderDrive();
    });
}

function mergeDriveAssignedOwners(state) {
    const assigned = new Map();
    for (const row of warehouseAssignedItemsInventory) {
        if (!evalReportRowIsInFarm(row,state.farm)) continue;
        const user = normalizeEvalAssignableUser(row.ASSIGNEDTO);
        const id = row.MASTER_UNIQUE_ID;
        if (!user || !id || state.owners.has(user)) continue;
        if (!assigned.has(user)) assigned.set(user,new Set());
        assigned.get(user).add(String(id));
    }
    state.additionalOwners = [...assigned].map(([username,ids])=>{
        state.owners.set(username,ids);
        return {username};
    });
}

function selectDriveEvaluatorReport(state,report) {
    if (!state || !currentDriveEvaluatorReport(state)) return;
    state.report = report;
    refreshDriveReportSelection();
}

function selectDriveEvaluator(state,username) {
    if (state?.scope !== 'all' || !currentDriveEvaluatorReport(state)) return;
    if (username && !state.owners?.has(username)) return;
    state.evaluator = username;
    refreshDriveReportSelection();
}

function refreshDriveReportSelection() {
    resetDriveDrillSelectionState();
    if (!driveReport2BrowseTab(activeDriveTab)) return setDriveTab('name',{exitReport:true});
    if (isViewVisible('drive')) renderDrive();
}

function getDriveEvaluatorReportRows(rows,state = getDriveEvaluatorReportState()) {
    if (!state || !state.report && !state.evaluator) return rows;
    const scoped = getDriveEvaluatorAssignmentRows(rows,state);
    if (!state.report || !scoped.length) return scoped;
    const year = getConfiguredCurrentSalesYearCode();
    const key = JSON.stringify(['drive-evaluator',state.key,state.report,state.evaluator,state.revision,year]);
    return getCanonicalDriveProjection(scoped,key,()=>{
        const report = state.report;
        const facts = getPreparedDriveReportFacts();
        return report.startsWith('eval2:')
            ? driveEval2CandidateRows({rows:scoped},report.slice(6))
            : getEvalRoleReportRows(scoped,report === driveEvalReason.id ? 'hold-stop' : report,year,facts);
    });
}

function getDriveEvaluatorAssignmentRows(rows,state) {
    const owners = state.evaluator ? state.owners?.get(state.evaluator) : null;
    if (state.evaluator && (!owners || state.revision !== getDatasetLoadSignature('warehouseAssignedItems'))) return [];
    const farmRows = getCanonicalDriveProjection(rows,'drive-report-farm:'+state.farm,()=>
        rows.filter(row=>evalReportRowIsInFarm(row,state.farm)));
    if (!owners) return farmRows;
    const key = JSON.stringify(['drive-assigned',state.key,state.evaluator,state.revision]);
    return getCanonicalDriveProjection(farmRows,key,()=>farmRows.filter(row=>owners.has(String(row.UNIQUE_ID ?? row.unique_id ?? ''))));
}

function driveEval2CandidateRows(state,id) {
    if (id===driveEvalAudit.id) {
        const auditRows=state.rows.map(row=>({...fieldAuditNormalizeRow(row,false),source:row}));
        return fieldAuditMatchingRows(auditRows,{
            season:'Y',year:'2026max',status:'all',search:'',block:'',location:'',sort:'locationcode',direction:1
        }).map(row=>row.source);
    }
    if (id===driveEvalLeaf.id) {
        return state.rows.filter(row=>/^330(?:\D|$)/.test(evalReportPlantGroup(row))
            && /^(H|S)$/i.test(evalReportHoldCode(row))
            && /\bleaf\s+quality\b/i.test(evalReportHoldReasonText(row)));
    }
    const api=getManagerEvalReports2Api();
    const next=getConfiguredNextSaleSeasonTarget();
    const eval2 = api?.classifyScriptCompatibleRows(state.rows,{
        currentSeason:getConfiguredCurrentSeasonCode(),currentSalesYear:getConfiguredCurrentSalesYearCode(),
        nextSeason:next.season,nextSalesYear:next.salesYear,settings:managerEvalReportSettings,now:new Date()
    });
    return eval2?.reports[id] || [];
}


function getPreparedDriveReportFacts() {
    if (typeof fullInventory === 'undefined') return null;
    const prepared = typeof getCurrentPreparedMasterRows === 'function' && canonicalPreparedDriveIsCurrent(fullInventory)
        && getCurrentPreparedMasterRows(fullInventory)?.driveReportFacts;
    return prepared || getCanonicalDriveProjection(fullInventory,'drive-master-facts',()=>new WeakMap());
}

function getDriveAuthorizedBrowseRows(rows,state = getDriveEvaluatorReportState()) {
    return state?.scope === 'own' ? getDriveEvaluatorAssignmentRows(rows,state) : filterBloomscapesPreviewInventoryRows(rows);
}

function scopeDriveEvaluatorRows(rows) {
    return getDriveEvaluatorReportRows(getDriveAuthorizedBrowseRows(rows));
}

function getDriveReportSearchSignature() {
    const state = getDriveEvaluatorReportState();
    const saved = getActiveDriveReport2();
    return JSON.stringify([state?.key,state?.report,state?.evaluator,state?.revision,
        state?.report ? getConfiguredCurrentSalesYearCode() : null,saved?.savedId,saved?.savedRevision]);
}

function scopeDriveSavedReportRows(rows,key) {
    const saved = canUseDriveCustomReports() && getActiveDriveReport2();
    if (!saved) return rows;
    syncDriveReport2Rows(saved,{rows,sourceKey:key,projectRow:projectDriveReport2Row});
    return getDriveReport2PhysicalRows(saved);
}

let driveBaseContextCacheKey = '';
let driveBaseContextCacheItems = [];
/** @param {string} [term] @returns {object} */
function buildDriveUniversalSearchState(term = '') {
    const safeTerm = String(term || '').trim();
    let baseItems = scopeDriveEvaluatorRows(getDriveModeItems());
    normalizeDriveSelectedSeasons();
    if (!areAllDriveSeasonsSelected()) {
        baseItems = baseItems.filter((item) => driveSelectedSeasons.has(String(item && item.SEASON || '').trim().toUpperCase()));
    }
    if (driveQuickHoldStopOnly) baseItems = baseItems.filter((item) => isDriveHoldStopCodeRow(item));
    const cacheKey = buildDriveUniversalSearchCacheKey(baseItems,safeTerm)+getDriveReportSearchSignature();
    if (driveUniversalSearchResultCache.has(cacheKey)) {
        const cached = driveUniversalSearchResultCache.get(cacheKey);
        driveUniversalSearchResultCache.delete(cacheKey);
        driveUniversalSearchResultCache.set(cacheKey, cached);
        incrementInternalPerfCounter('viewStateCacheHits');
        return cached;
    }
    const drivePlantFilterState = buildDrivePlantFilterState(baseItems);
    const scopedItems = scopeDriveSearchToLocation(drivePlantFilterState.filteredItems);
    const searchMatches = filterDriveIndexedRows(scopedItems,safeTerm,'drive_universal');
    const columnFilteredItems = applyDriveColumnFiltersToItems(searchMatches);
    const visibleItems = applyDriveQuickFiltersToItems(columnFilteredItems, `universal:${cacheKey}`);
    const finalItems = sortDriveCardsForActiveFilters(scopeDriveSavedReportRows(visibleItems,cacheKey));
    const state = { baseItems, drivePlantFilterState, finalItems, cacheKey };
    setDriveUniversalSearchCacheEntry(cacheKey, state);
    return state;
}


/** @param {string} [term] @param {boolean} [fromInputFrame] @returns {void} */
function scheduleDriveSearchRequest(term = '', fromInputFrame = false) {
    cancelDriveSearchRenderWork();
    const requestToken = ++driveSearchRequestToken;
    const drillStateKey = getDriveDrillSelectionStateKey();
    if (fromInputFrame) {
        if (term && paintWarmDriveSearch()) return;
        scheduleDriveSearchRender(term,{skipDebounce:true,typingDelay:0,requestToken,drillStateKey});
        return;
    }
    const requestDelay = (isIOSDevice() || isStandaloneApp() || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) ? 100 : 60;
    driveSearchDebounceTimer = setTimeout(() => {
        driveSearchDebounceTimer = null;
        if (requestToken !== driveSearchRequestToken) return;
        if (drillStateKey !== getDriveDrillSelectionStateKey()) return;
        scheduleDriveSearchRender(term, {
            skipDebounce: true,
            typingDelay: requestDelay,
            requestToken,
            drillStateKey
        });
    }, requestDelay);
}

function paintWarmDriveSearch() {
    if (!canPaintWarmDriveSearch()) return false;
    cancelPendingNavigationScrollResets();
    invalidateDriveResolvedCardState();
    markViewDirty('drive');
    renderDrive({keepToolbar:true});
    return true;
}

/** @param {object} row @param {string} cleanCommonName @param {string} sizeKey @returns {string} */
function buildDriveSearchKey(row,cleanCommonName,sizeKey) {
    const location = String(row.LOCATIONCODE ?? row.locationcode ?? '');
    const block = location.split('.').slice(0,2).join('.');
    return [cleanCommonName,row.ITEMCODE ?? row.itemcode,block,location,row.LOTCODE ?? row.lotcode,sizeKey]
        .join('\t').toLowerCase();
}

function filterDriveIndexedRows(rows,term,profile) {
    const terms = String(term || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return getCanonicalDriveProjection(rows,'drive-search:'+profile+':'+terms.join(' '),()=>{
        if (!rows[0]?._searchKey) return filterBySearch(rows,term,profile);
        const matching = rows.filter(row=>terms.every(token=>row._searchKey?.includes(token)));
        return matching.length ? matching : filterBySearch(rows,term,profile);
    });
}

/** @returns {Array<object>} */
function getDriveBaseFilteredItems() {
    const cacheKey = getDriveBaseFilterKey();
    if (driveBaseFilterCacheKey === cacheKey) return driveBaseFilterCacheItems;
    const contextKey = getDriveBaseFilterContextKey();
    const profile = getDriveSearchProfile();
    const base = driveBaseContextCacheKey === contextKey ? driveBaseContextCacheItems : buildDriveBaseSearchRows();
    const term = activeDriveMode === 'ok' ? getDriveBaseSearchTermForCurrentScope() : '';
    const result = term ? filterDriveIndexedRows(base,term,profile) : base;
    driveBaseContextCacheKey = contextKey;
    driveBaseContextCacheItems = base;
    driveBaseFilterCacheKey = cacheKey;
    driveBaseFilterCacheItems = result;
    return result;
}

function buildDriveBaseSearchRows() {
    if (activeDriveMode !== 'ok') return [];
    let rows = getDriveModeItems();
    normalizeDriveSelectedSeasons();
    if (!areAllDriveSeasonsSelected()) rows = rows.filter(row=>driveSelectedSeasons.has(String(row.SEASON || '').toUpperCase()));
    if (activeDriveTab === 'hold') return rows.filter(row=>isDriveHoldStopReportRow(row,activeDriveHoldStopReport));
    if (activeDriveTab === 'season-sales-notes') return rows.filter(isDriveSeasonSalesNotesRow);
    if (driveQuickHoldStopOnly) return rows.filter(isDriveHoldStopCodeRow);
    return rows;
}

function canPaintWarmDriveSearch() {
    if (!isViewVisible('drive')) return false;
    const state = document.getElementById('drive-content')?.__gncCardWindow;
    return isMasterFullProjectionReady() || !!(state?.rows.length && state.scope === getSupabaseReadIdentityScope());
}

/** @param {HTMLInputElement} input @param {Event} event @returns {*} */
function queueNativeDriveSearch(input,event) {
    if (canPaintWarmDriveSearch()) return handleDriveSearch(event);
    scheduleFieldSearch(input,()=>handleDriveSearch(event));
}

/** @param {Array<object>} rows @param {*} source @returns {*} */
function indexDriveSearchRows(rows,source) {
    const year = normalizeEvalReportSalesYear(getConfiguredCurrentSalesYearCode()) ?? 2027;
    const prepared = canonicalPreparedDriveIsCurrent(source) && getCurrentPreparedMasterRows(source)?.driveReportFacts;
    const facts = getCanonicalDriveProjection(source,'drive-master-facts',()=>prepared || new WeakMap());
    for (const row of rows) {
        const crop = facts.get(row) || indexDriveRowFacts(row,facts);
        if (!row._searchKey) row._searchKey = buildDriveSearchKey(row,crop.cleanCommonName,crop.sizeKey);
        if (row._reportMaskYear !== year) stampEvalRoleReportMask(row,year,crop);
    }
    return rows;
}

function indexDriveRowFacts(row,facts) {
    const crop = {...prepareEvalReportRowFacts(row),cleanCommonName:getDrivePlantCommonName(row),sizeKey:getDrivePlantContSize(row)};
    facts.set(row,crop);
    return crop;
}

/** @param {string} view @param {*} previous @returns {void} */
function paintCachedDriveOnNavigation(view,previous) {
    if (view !== 'drive' || previous === view || !nativeAuthSessionActive || !canAccessView('drive')) return;
    if (hasConfirmedCurrentAccountRevocation()) return;
    if (!fullInventory.length) {
        void restoreBloomscapesBootMaster();
        return;
    }
    const owner = getSupabaseReadIdentityScope();
    const verified = productionDisplayMasterReceipt?.rows === fullInventory && productionDisplayMasterReceipt.readScope === owner;
    if (verified || warmAvInventoryOwners.get(fullInventory) === owner || canRenderNavigationSnapshot('drive')) {
        renderDrive({useVerifiedSnapshot:true});
    }
}
