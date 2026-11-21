
const bloomscapesDockBrowseMetadata={owner:'',checkedAt:0};
const bloomscapesDockLabelCollator=new Intl.Collator(undefined,{numeric:true});
const bloomscapesDockNameCollator=new Intl.Collator(undefined,{sensitivity:'base'});

function renderBloomscapesDocksBrowse() {
    if (ensureViewDataForRender('docks')) return;
    const container = document.getElementById('docks-content');
    const crumb = document.getElementById('docks-crumb');
    rememberOperationalExport('docks',[]);
    updateDockModeToggleUi();
    mountBloomscapesDockDropEvents();
    const access = getRoleAccessState();
    const awaitingProgress = access.isQc && !access.isAdmin && !access.isQcSupervisor;
    requestBloomscapesDockBrowseMetadata();
    const term = document.getElementById('docks-search').value.toLowerCase().trim();
    if (dockViewMode === 'mistakes' || dockViewMode === 'dropoff') {
        renderBloomscapesLegacyDockExceptions(container,crumb,term);
        return;
    }

    const items = getBloomscapesDockBrowseRows(term);
    if (!items.length) return showEmptyBloomscapesDockBrowse(container,crumb,awaitingProgress);
    if (dockViewLevel === 0) {
        renderBloomscapesDockList(container,crumb,items);
        return;
    }
    renderBloomscapesSelectedDock(container,crumb,items);
}

function bloomscapesDockBrowseMetadataOwner() {
    return JSON.stringify([getSupabaseReadIdentityScope(),getBloomscapesFarm()]);
}

function bloomscapesDockBrowseMetadataRevision() {
    return [dockWorkflowStateEpoch,dockTeamStatusRenderVersion,dockTeamStatusLoaded,dockItemProgressLoaded,
        dockIssueDataLoaded,dockTeamSchemaReady,dockItemSchemaReady,dockIssueStatusSchemaReady,dockIssueAllocationSchemaReady].join('|');
}

function requestBloomscapesDockBrowseMetadata() {
    const owner=bloomscapesDockBrowseMetadataOwner();
    const state=bloomscapesDockBrowseMetadata;
    if (state.owner===owner && Date.now()-state.checkedAt<45000) return;
    const jobs=[];
    if (!dockTeamStatusLoaded && !dockTeamStatusPromise && dockTeamSchemaReady!==false) jobs.push(ensureDockTeamStatusLoaded);
    if (!dockItemProgressLoaded && !dockItemProgressPromise && dockItemSchemaReady!==false) jobs.push(ensureDockItemStatusLoaded);
    if (!dockIssueDataLoaded && !dockIssueDataPromise && dockIssueStatusSchemaReady!==false && dockIssueAllocationSchemaReady!==false) {
        jobs.push(ensureDockIssueDataLoaded);
    }
    if (!jobs.length) return;
    state.owner=owner;
    state.checkedAt=Date.now();
    const revision=bloomscapesDockBrowseMetadataRevision();
    void Promise.allSettled(jobs.map(read=>Promise.resolve().then(read))).then(()=>{
        if (getCurrentVisibleViewId()!=='docks' || owner!==bloomscapesDockBrowseMetadataOwner()) return;
        if (revision!==bloomscapesDockBrowseMetadataRevision()) scheduleDocksRender(0);
    });
}

function renderBloomscapesLegacyDockExceptions(container, crumb, term) {
    document.querySelector('[data-dock-filter-status]')?.classList.add('hidden');
    if (dockIssueStatusSchemaReady === false || dockIssueAllocationSchemaReady === false) {
        container.innerHTML = '<div class="p-8 text-center text-gray-400">The shared Dock mistake queue is unavailable.</div>';
        crumb.innerText = 'Dock Setup Required';
        return;
    }
    if (dockViewMode === 'dropoff') {
        selectedDockIssueUid = null;
        selectedDockIssueAllocationId = '';
        renderDockDropOffQueue(container,crumb,term);
    } else if (selectedDockIssueUid) renderDockMistakeDetail(container,crumb,term);
    else renderDockMistakeQueue(container,crumb,term);
}

function getBloomscapesDockBrowseRows(term) {
    const scopedRows = getBloomscapesDockBrowseSource();
    syncDockFilterControls(scopedRows);
    let items = applyDockStructuredFilters(scopedRows);
    if (term) items = filterBySearch(items,term,'docks');
    updateDockFilterSummary(scopedRows,items,term);
    return items;
}

function showEmptyBloomscapesDockBrowse(container, crumb, awaitingProgress) {
    const missing = [
        dockTeamSchemaReady === false ? 'shared Trip status' : '',
        awaitingProgress && dockItemSchemaReady === false ? 'Dock item status' : ''
    ].filter(Boolean);
    const message = missing.length ? `${missing.join(' and ')} unavailable. Refresh after the current release finishes deploying.` : 'No dock items found.';
    setContainerHtml(container,`<div class="p-8 text-center text-gray-400">${message}</div>`);
    setContainerUiState(container,'empty');
    crumb.innerText = missing.length ? 'Dock Setup Required' : 'No Results';
}

function sortBloomscapesDockLabels(a, b) {
    const left = parseFloat(String(a).replace(/[^0-9.]/g,''));
    const right = parseFloat(String(b).replace(/[^0-9.]/g,''));
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    return bloomscapesDockLabelCollator.compare(String(a),String(b));
}

function sortBloomscapesDockRows(a, b) {
    const stop = row => parseFloat(normalizeDockViewStopKey(firstNonEmptyValue(row.STOPNUMBER,row.stopnumber,'')));
    const location = row => firstNonEmptyValue(row.LOCATIONCODE,row.locationcode,'');
    const line = row => firstNonEmptyValue(row.ORDERLINE,row.orderline,row.ORDER_LINE,row.order_line,row.LINENO,row.lineno,
        row.LINE_NUMBER,row.line_number,row.LINESEQ,row.lineseq,row.SEQUENCE,row.sequence,'');
    return (stop(b) || 0) - (stop(a) || 0)
        || compareLocationCodeValues(location(a),location(b))
        || pullRouteByLocation(line(a),line(b))
        || bloomscapesDockNameCollator.compare(a.COMMONNAME || '',b.COMMONNAME || '')
        || pullRouteByLocation(a.CONTSIZE,b.CONTSIZE);
}

function collectBloomscapesDocks(items) {
    const docks = new Map();
    for (const item of items) {
        const dockNum = normalizeDockViewDockKey(item?.DOCK_NUM);
        if (!docks.has(dockNum)) docks.set(dockNum,[]);
        docks.get(dockNum).push(item);
    }
    return docks;
}

function summarizeBloomscapesDockCard(dockNum, rows) {
    const trips = [...new Set(rows.map(row => String(row.TRIPNUMBER || '').trim()).filter(Boolean))]
        .sort(sortBloomscapesDockLabels).map(tripNumber => ({tripNumber,savedInfo:getDockTeamInfo(tripNumber)}));
    const states = [...new Set(rows.map(getDockCardStateValue).filter(Boolean))].sort(sortBloomscapesDockLabels);
    const planStartDates = [...new Set(rows.map(row => formatDockCardPlanStartValue(getDockCardPlanStartValue(row))).filter(Boolean))]
        .sort(compareDockPlanStartLabels);
    const consignee = row => firstNonEmptyValue(row.CONSIGNEENAME,row.CONSIGNEE,row.CUSTOMERNAME,'');
    const rep = row => firstNonEmptyValue(row.SALESREPNAME,row.SALESREPID,row.SALESREP,'');
    const names = selector => [...new Set(rows.map(row => String(selector(row) || '').trim()).filter(Boolean))].slice(0,3).join(', ');
    const hasCoUt = rows.some(isBloomscapesDockMountainState);
    return {
        dockNum,dockLabel:formatDockViewDockLabel(dockNum),count:rows.length,summary:buildDockBrowseSummary(rows),
        consigneeSummary:names(consignee) || 'Unknown Consignee',repSummary:names(rep) || 'Unknown Rep',
        states,planStartDates,trips,dockTeamRenderVersion:dockTeamStatusRenderVersion,
        borderCls:hasCoUt ? 'border-red-500' : 'border-[#007a4d]',
        textCls:hasCoUt ? 'text-red-700' : 'text-[#007a4d]'
    };
}

function isBloomscapesDockMountainState(row) {
    const state = getDockCardStateValue(row);
    const city = String(row.CONSIGNEECITY || '').toUpperCase().trim();
    return ['CO','UT','COLORADO','UTAH'].includes(state)
        || city.includes(' CO') || city.includes(' UT') || city.endsWith('CO') || city.endsWith('UT');
}

function renderBloomscapesDockList(container, crumb, items) {
    rememberOperationalExport('docks',items.slice(),(a,b)=>sortBloomscapesDockLabels(a.DOCK_NUM,b.DOCK_NUM) || sortBloomscapesDockRows(a,b));
    const cards = Array.from(collectBloomscapesDocks(items),([dock,rows]) => summarizeBloomscapesDockCard(dock,rows));
    cards.sort((a,b) => sortBloomscapesDockLabels(a.dockNum,b.dockNum));
    const tripIndex = new Map((currentBloomscapesDockBoard()?.trips || []).map(trip => [pullTripIdentity(trip.dock,trip.trip),trip]));
    const canEdit = canEditDockWorkflow();
    renderBloomscapesDockPage('docks-main',container,crumb,cards,'Select a Dock',
        card => renderBloomscapesCompactDockCard(card,canEdit,tripIndex),{
            approxCardHeight:130,
            emptyHtml:'<div class="p-8 text-center text-gray-400">No dock items found.</div>',
            renderSignature:buildRowsRenderSignature('docks-main|Select a Dock',cards,['dockTeamRenderVersion']) + ':' + bloomscapesDockBoardRevision()
        });
}

function renderBloomscapesSelectedDock(container, crumb, items) {
    const selectedDockKey = normalizeDockViewDockKey(selectedDockNum);
    const label = formatDockViewDockLabel(selectedDockNum);
    const rows = items.filter(item => normalizeDockViewDockKey(item?.DOCK_NUM) === selectedDockKey).sort(sortBloomscapesDockRows);
    if (!rows.length) {
        dockViewLevel = 0;
        selectedDockNum = null;
        selectedDockStop = null;
        scheduleDocksRender(0);
        return;
    }
    if (dockViewLevel === 1) {
        renderBloomscapesDockDrops(container,crumb,label,rows);
        return;
    }
    renderBloomscapesDockDropRows(container,crumb,label,rows);
}

function countBloomscapesCompletedDockRows(rows) {
    return rows.filter(item => {
        const progress = getDockItemProgress(item.UNIQUE_ID);
        return progress.checker && progress.inspector;
    }).length;
}

function getBloomscapesDockDropIdentity(row = {}) {
    return {
        rep:row.SALESREPNAME || row.SALESREPID || 'Unknown Rep',cust:row.CUSTOMERNAME || 'Unknown Customer',
        cons:row.CONSIGNEENAME || row.CONSIGNEE || '',state:row.CONSIGNEESTATE || row.STATE || 'N/A'
    };
}

function renderBloomscapesDockDrops(container, crumb, label, rows) {
    rememberOperationalExport('docks',rows);
    const grouped = new Map();
    for (const row of rows) {
        const stop = normalizeDockViewStopKey(row?.STOPNUMBER);
        if (!grouped.has(stop)) grouped.set(stop,[]);
        grouped.get(stop).push(row);
    }
    const cards = Array.from(grouped,([stop,items]) => ({
        stop,items,summary:buildDockBrowseSummary(items),done:countBloomscapesCompletedDockRows(items),
        identity:getBloomscapesDockDropIdentity(items[0]),planStarts:[...new Set(items.map(getDockCardPlanStartValue).filter(Boolean))]
    })).sort((a,b) => sortBloomscapesDockLabels(b.stop,a.stop));
    renderBloomscapesDockPage('docks-stops',container,crumb,cards,label,
        card => renderBloomscapesDockDropCard(card,label),{
            approxCardHeight:140, emptyHtml:'<div class="p-8 text-center text-gray-400">No stops remain in this Dock.</div>'
        });
}

function renderBloomscapesDockDropStart(value) {
    const info = getDockSuspendDcRequestPlanstartInfo({PLANSTART:value});
    const colors = {monday:'#7C3AED',tuesday:'#DC2626',wednesday:'#16A34A',thursday:'#2563EB',friday:'#64748B'};
    return `<span class="rounded px-2 py-1 text-white" style="background:${colors[info.tone] || '#475569'}">Plan Start ${pullHtml(formatDockCardPlanStartValue(value))}</span>`;
}

function renderBloomscapesDockDropCard(card, label) {
    const {stop,summary,done,identity,items,planStarts} = card;
    const statuses = [['Suspended',summary.suspended],['Approved',summary.approved],['Ready',summary.ready]];
    const badges = statuses.filter(([,qty]) => qty).map(([name,qty]) => `<span>${name} ${pullHtml(qty)}</span>`).join('');
    return `<button type="button" class="mb-2 block w-full space-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm"
        data-docks-drop-card="${pullHtml(stop)}" ${buildFastInvokeAttrs('selectDockStop',[stop],`Open Drop ${stop}`)}>
        <span class="flex items-center justify-between"><strong class="text-[#007a4d]">Drop ${pullHtml(stop)}</strong><span class="text-xs">${done}/${items.length} Done</span></span>
        <span class="block text-xs">${pullHtml(label)} Ã‚Â· ${items.length} Rows Ã‚Â· Qty ${pullHtml(summary.quantity)}</span>
        <strong class="block text-sm">${pullHtml(identity.cust)}${identity.cons && identity.cons !== identity.cust ? ' Ã‚Â· '+pullHtml(identity.cons) : ''}</strong>
        <span class="flex flex-wrap items-center gap-2 text-xs"><span>${pullHtml(identity.rep)} Ã‚Â· ${pullHtml(identity.state)}</span>${badges}${planStarts.map(renderBloomscapesDockDropStart).join('')}</span></button>`;
}

function renderBloomscapesDockDropHeader(label, stop, rows) {
    const {rep,cust,cons,state} = getBloomscapesDockDropIdentity(rows[0]);
    const summary = buildDockBrowseSummary(rows);
    const done = countBloomscapesCompletedDockRows(rows);
    return `<div class="mb-2 space-y-1 rounded-xl border border-emerald-700 bg-emerald-950 p-3 text-white">
        <div class="flex items-center justify-between"><strong>${pullHtml(label)} Ã‚Â· Drop ${pullHtml(stop)}</strong><span class="text-xs">${done}/${rows.length} Done</span></div>
        <div class="text-sm font-semibold">${pullHtml(cust)}${cons && cons !== cust ? ' Ã‚Â· '+pullHtml(cons) : ''}</div>
        <div class="text-xs">${rows.length} Rows Ã‚Â· Qty ${pullHtml(summary.quantity)} Ã‚Â· ${pullHtml(rep)} Ã‚Â· ${pullHtml(state)}</div></div>`;
}

function getBloomscapesDockRowEvidenceSignature(rows) {
    return JSON.stringify(rows.map(row => {
        const live = getQueueDisplayEvidenceRow({...row,SOURCE_TABLE:'ph_soc_master'}) || {};
        return [live.UNIQUE_ID,live.PHOTO_LINK,live.SPEC,live.AV_NOTE,live.MATCH,live.LOC_MATCH_QTY,live.PTRONHAND,live.LAST_UPDATED];
    }));
}

function renderBloomscapesDockDropRows(container, crumb, label, dockRows) {
    const selected = normalizeDockViewStopKey(selectedDockStop);
    const rows = dockRows.filter(item => normalizeDockViewStopKey(item?.STOPNUMBER) === selected);
    rememberOperationalExport('docks',rows);
    if (!rows.length) {
        dockViewLevel = 1;
        selectedDockStop = null;
        scheduleDocksRender(0);
        return;
    }
    const crumbText = `${label} > Drop ${selectedDockStop}`;
    crumb.innerText = crumbText;
    const prefixHtml = renderBloomscapesDockDropHeader(label,selectedDockStop,rows)
        + renderBloomscapesDockDropTools(selectedDockNum,selectedDockStop);
    const signature = buildDocksStopItemsRenderSignature(label,selectedDockStop,rows)
        + getBloomscapesDockRowEvidenceSignature(rows) + ':' + bloomscapesDockBoardRevision();
    renderBloomscapesDockPage('docks-stop-items',container,crumb,rows,crumbText,
        item => generateCard(getDockCardLiveInventoryDisplayRow(item),'docks','status-orange'),{
            prefixHtml,approxCardHeight:265,
            emptyHtml:'<div class="p-8 text-center text-gray-400">No rows remain in this Drop.</div>',
            renderSignature:signature,verifyRowSelector:'[data-docks-stop-card]',reserveSpace:true
        });
    restoreBloomscapesDockDrafts(container);
}

function renderBloomscapesDockPage(key,container,crumb,rows,label,render,options) {
    const search = document.getElementById('docks-search').value.trim().toLowerCase();
    const page = getClientBrowsePage('docks',dockBrowsePageKey(key,label,search),rows,dockBrowsePageLimit(key));
    const pager = renderClientBrowsePageFooter('docks',page.key,rows.length,page);
    const prefixHtml = (options.prefixHtml || '')+pager;
    const renderSignature = (options.renderSignature || buildRowsRenderSignature(key,rows))+':'+page.pageIndex;
    return renderMarkupChunkedByKey(key,container,crumb,page.rows,label,render,{...options,prefixHtml,renderSignature});
}
