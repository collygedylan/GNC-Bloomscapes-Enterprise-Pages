let legacyReportBrowse;

function legacyReportBrowseControls(container) {
    const owner = getSupabaseReadIdentityScope();
    if (legacyReportBrowse?.owner !== owner || legacyReportBrowse?.tab !== activeReportTab) {
        legacyReportBrowse = {...createDriveBrowseState(''),owner,tab:activeReportTab};
    }
    const state = legacyReportBrowse;
    const host = document.getElementById('legacy-reports-controls');
    let browse = host.querySelector('[data-legacy-report-browse]');
    const created = !browse;
    if (created) {
        browse = host.appendChild(document.createElement('div'));
        browse.dataset.legacyReportBrowse = '';
        browse.innerHTML = evalReportBrowseMarkup()+'<input type="search" class="input-field" aria-label="Search report inventory">';
    }
    const search = browse.querySelector('input');
    search.value = state.query;
    browse.onclick = event=>bindEvalReportBrowseClick(event,state,renderReports);
    search.oninput = () => updateLegacyReportQuery(state,search.value);
    container.onclick = event=>bindEvalReportBrowseClick(event,state,renderReports);
    syncEvalReportBrowseControls(browse,state);
    if (created) syncGlobalHeaderChrome({reason:'reports-search',force:true});
    return state;
}

function updateLegacyReportQuery(state,query) {
    state.query = query;
    state.mode ||= 'name';
    state.path = [];
    if (state.frame) return;
    state.frame = requestAnimationFrame(()=>{
        state.frame = 0;
        if (state === legacyReportBrowse && isViewVisible('reports')) renderReports();
    });
}

function legacyReportBrowseData() {
    if (activeReportTab==='REQUEST_HISTORY') return {rows:getRequestHistoryReportRows(),card:renderRequestHistoryReportCard};
    if (activeReportTab==='NON_SALEABLE_BUCKETS') return {rows:getNonSaleableBucketRows().rows};
    return {rows:fullInventory.filter(row=>activeReportTab==='ALL' || String(row.SEASON || '').toUpperCase()===activeReportTab)};
}

function paintLegacyReportBrowse(container,crumb,state,reportRenderKey) {
    const {rows,card} = legacyReportBrowseData();
    const filtered = filterReportBrowseInventory(rows,state);
    if (crumb) crumb.textContent = state.path.join(' > ') || 'Inventory';
    paintReportInventoryDrill(container,state,filtered,[reportRenderKey,state.query],'',false,card);
}

function renderReports() {
    if (renderEvalRoleReports()) return;
    const container = document.getElementById('reports-content');
    const crumb = document.getElementById('reports-crumb');
    if (!container) return;
    const browse = legacyReportBrowseControls(container);
    if (ensureViewDataForRender('reports')) return;
    const reportRenderKey = [
        resolvedViewStateEpoch,
        activeReportTab,
        safeRole,
        currentUser || '',
        currentUserDisplay || '',
        requestHistoryReportSalesRepSearchTerm,
        requestHistoryReportCommonNameSearchTerm,
        requestHistoryReportSelectedSalesRep,
        requestHistoryReportSelectedCustomerConsignee,
        requestHistoryReportDateStart,
        requestHistoryReportDateEnd,
        getConfiguredCurrentSeasonCode(),
        getConfiguredCurrentSalesYearCode(),
        JSON.stringify(getConfiguredNextSaleSeasonTarget() || {}),
        getDatasetLoadSignature('master'),
        getDatasetLoadSignature('requests'),
        getDatasetLoadSignature('requestHistory'),
        getDatasetLoadSignature('reserves'),
        getDatasetLoadSignature('soc')
    ].join('|');
    if (browse.mode) {
        paintLegacyReportBrowse(container,crumb,browse,reportRenderKey);
        return;
    }
    if (reportsSummaryCacheKey === reportRenderKey && reportsSummaryCacheHtml) {
        if (crumb) crumb.innerText = reportsSummaryCacheCrumb;
        setContainerHtmlWithSignature(container, reportsSummaryCacheHtml, reportRenderKey);
        return;
    }
    if (activeReportTab === 'REQUEST_HISTORY') {
        renderRequestHistoryReport(container, crumb, reportRenderKey);
        return;
    }
    if (activeReportTab === 'NON_SALEABLE_BUCKETS') {
        renderNonSaleableBucketsReport(container, crumb, reportRenderKey);
        return;
    }

    renderLegacySeasonSummary(container, crumb, reportRenderKey);
}

function renderLegacySeasonSummary(container, crumb, reportRenderKey) {
    let seasonItems = fullInventory.filter(i => activeReportTab === 'ALL' ? true : String(i.SEASON || '').toUpperCase() === activeReportTab);
    let reserveItems = reservesInventory;
    let requestItems = getScopedRequestItems(requestsInventory).filter(i => !i.REQ_ARCHIVED);
    let dockItems = socInventory;

    const hasGlobalRequestAccess = canUseGlobalRequestAccess();
    if (safeRole === 'SALESREP') {
        reserveItems = reserveItems.filter(i => isMyRep(firstNonEmptyValue(i.SALESREPNAME, i.SALESREP, i.SALES_REP, i.SALESREPID, '')));
        if (!hasGlobalRequestAccess) requestItems = requestItems.filter(i => isMyRep(i.REQUESTED_BY));
        dockItems = dockItems.filter(i => isMyRep(i.SALESREPNAME || i.SALESREPID));
    }

    const sumField = (arr, key) => arr.reduce((sum, item) => sum + (parseInt(String(item[key] || 0).replace(/,/g, '')) || 0), 0);
    const summaryCards = [
        { label: activeReportTab === 'ALL' ? 'Open Stock Rows' : `${activeReportTab} Rows`, value: seasonItems.length },
        { label: 'Available', value: sumField(seasonItems, 'PTRAVAILABLE').toLocaleString() },
        { label: 'Season Supply', value: sumField(seasonItems, 'SEASONSUPPLY').toLocaleString() },
        { label: safeRole === 'SALESREP' ? 'My Reserves' : 'Reserves', value: reserveItems.length.toLocaleString() },
        { label: safeRole === 'SALESREP' && !hasGlobalRequestAccess ? 'My Que' : 'Que', value: requestItems.length.toLocaleString() },
        { label: safeRole === 'SALESREP' ? 'My Dock Rows' : 'Dock Rows', value: dockItems.length.toLocaleString() }
    ];

    const topPlants = Object.values(seasonItems.reduce((acc, item) => {
        const key = `${item.COMMONNAME || 'Unknown'}|${item.CONTSIZE || '-'}`;
        if (!acc[key]) acc[key] = { name: item.COMMONNAME || 'Unknown', size: item.CONTSIZE || '-', rows: 0, ptr: 0 };
        acc[key].rows += 1;
        acc[key].ptr += parseInt(String(item.PTRAVAILABLE || 0).replace(/,/g, '')) || 0;
        return acc;
    }, {})).sort((a, b) => b.rows - a.rows).slice(0, 12);

    const crumbText = activeReportTab === 'ALL' ? 'Crop Value Summary' : `${activeReportTab} Summary`;
    if (crumb) crumb.innerText = crumbText;
    const cardsHtml = summaryCards.map(card => `<div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"><div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">${card.label}</div><div class="text-2xl font-black text-[#007a4d] leading-none">${card.value}</div></div>`).join('');
    const topHtml = topPlants.length ? topPlants.map(plant => `<div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex justify-between items-center gap-3"><div class="min-w-0"><div class="font-bold text-gray-800 truncate">${plant.name}</div><div class="text-xs font-semibold text-gray-500">${plant.size}</div></div><div class="text-right shrink-0"><div class="text-xs font-bold text-gray-400 uppercase">Rows</div><div class="font-black text-[#007a4d]">${plant.rows}</div><div class="text-[11px] font-semibold text-gray-500 mt-1">Available ${plant.ptr.toLocaleString()}</div></div></div>`).join('') : `<div class="p-8 text-center text-gray-400">No report data found for this selection.</div>`;
    const html = `<div class="grid grid-cols-2 gap-3 mb-4">${cardsHtml}</div><div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Top Plants</div><div class="space-y-3">${topHtml}</div>`;
    reportsSummaryCacheKey = reportRenderKey;
    reportsSummaryCacheHtml = html;
    reportsSummaryCacheCrumb = crumbText;
    setContainerHtmlWithSignature(container, html, reportRenderKey);
}
