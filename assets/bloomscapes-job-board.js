/** @param {HTMLElement} toolbar Job Board toolbar. @returns {void} Mounts the controls and paints current job facets. */
function syncBloomscapesJobBoardToolbar(toolbar) {
    startBloomscapesJobBoardRefresh();
    let tools = toolbar.querySelector('[data-job-board-tools]');
    if (!tools) {
        tools = toolbar.appendChild(document.createElement('div'));
        tools.dataset.jobBoardTools = 'true';
        tools.innerHTML = '<select data-job-filter="assigned" aria-label="Assigned To"></select><select data-job-filter="block" aria-label="Location / Block"></select><select data-job-filter="priorityStatus" aria-label="Priority / Status"></select>';
        tools.addEventListener('change',event=>{
            const key = event.target.dataset.jobFilter;
            if (key) setBloomscapesJobBoardFilter(key,event.target.value);
        });
    }
    tools.querySelector('[data-job-filter="assigned"]').hidden=!bloomscapesWorkKind(activeReqTab);
    if (bloomscapesWorkKind(activeReqTab)) toolbar.querySelector('[data-inventory-excel-scope]')?.remove();
    paintBloomscapesJobFacets(tools);

}

/** @param {HTMLElement} card Mounted work card. @param {object} job Job and its completion facts. @returns {void} Appends the work-specific facts for the job. */
function appendBloomscapesJobFacts(card,job) {
    const facts = card.appendChild(document.createElement('p'));
    const input = job.command || {};
    if (job.work_view==='CAN_FILLING') facts.textContent = ['CAN_FILL_LOG',input.media || 'Media not specified',
        input.fertilizer || 'Fertilizer not specified','Target '+(job.target_location || 'not selected'),'Cans required '+job.quantity].join(' · ');
    if (job.work_view==='Y_GRADING') facts.textContent = 'SCH TOTAL '+job.quantity+' · GRADED # '+(job.completion_receipt?.actual_quantity ?? 'Pending')
        +' · SHORT '+(job.completion_receipt?.short ?? 'Pending')+' · CF# '+(job.completion_answers?.canFillQuantity ?? 'Pending');
    if (job.work_view==='BUNCH_NOTES') facts.textContent = (job.planning_gates || []).map(gate=>gate.gate+': '+gate.state).join(' · ');
    if (job.work_view==='SHEARING') facts.textContent = 'Split '+(input.percent || 'exact Qty')+' · 14-day load guard and crew acknowledgment required · Flush tracking restarts after confirmed shearing';
    if (job.work_view==='SHEARING') {
        const ids = new Set(job.source_rows.map(row=>row.id));
        const recovery = (bloomscapesFieldQueueState.recovery || []).filter(row=>ids.has(row.row_id));
        facts.textContent += recovery.length ? ' · '+recovery.map(row=>`${row.locationcode}: ${row.accumulated_gdd ?? 'No observations'} GDD · ${row.remaining_gdd ?? 'Unknown target'} remaining · through ${row.observed_through || 'pending'}`).join(' | ')
            : ' · GDD flush counter pending confirmed shear and weather observations';
    }
    if (job.work_view==='HAULING') facts.textContent = (input.originFarm || job.farm_code)+' → '+job.farm_code
        +' · '+(input.originLocation || job.source_rows[0]?.locationcode || '')+' → '+(job.target_location || 'Destination required')
        +(input.poId ? ' · PO '+input.poId+' · PH Data Entry after confirmed Qty Hauled' : '');
}

function suspendTagFilterKey(latestSourceWatermark) {
    return JSON.stringify([
        requestSuspendTagStatusFilter, getSuspendEvalUserFilter('suspend-tag'),
        normalizeSearchValue(requestSuspendTagCommonNameSearchTerm),
        normalizeRequestSuspendTagContSizeFilterValue(requestSuspendTagContSizeFilter),
        requestSuspendTagDockFilter,
        latestSourceWatermark.filename,
        latestSourceWatermark.lastUpdated
    ]);
}

/** @param {Array} items Current inventory or queue rows. @returns {object} The page, visible rows and freshness signature. */
function buildSuspendTagRenderPlan(items) {
    const collators = {
        text: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare,
        location: new Intl.Collator(undefined, { numeric: true }).compare
    };
    const sourceRows = getDockSuspendDcSourceRows();
    const latestSourceFreshness = typeof getCurrentSuspendTagSourceFreshness === 'function'
        ? getCurrentSuspendTagSourceFreshness() : null;
    const freshnessRows = typeof socRawSourceRows !== 'undefined' ? socRawSourceRows : sourceRows;
    const latestSourceWatermark = typeof publishedSuspendSocWatermark === 'function'
        ? publishedSuspendSocWatermark(freshnessRows, latestSourceFreshness) : { filename: '', lastUpdated: '' };
    const latestSourceRows = typeof getLatestSocSuspendTagSourceRows === 'function'
        ? getLatestSocSuspendTagSourceRows(sourceRows)
        : (Array.isArray(sourceRows) ? sourceRows : []);
    const latestSourceIds = new Set(latestSourceRows.map((row) => getDockSuspendDcRequestSourceUid(row)).filter(Boolean));
    const sourceLookupRevision = getDockSuspendDcSourceRowLookupRevision(sourceRows);
    const sourceLookup = getDockSuspendDcSourceRowLookup(sourceRows, sourceLookupRevision);
    const currentFileItems = typeof getLatestSocSuspendTagSourceRows === 'function'
        ? uniquePhysicalSuspendTags((Array.isArray(items) ? items : []).filter((row) =>
            isDockSuspendDcRequestMirrorRow(row) && latestSourceIds.has(getDockSuspendDcRequestSourceUid(row))))
        : items;
    const sortedSourceRows = getSortedSuspendTagSourceRows(currentFileItems, collators, sourceLookup, sourceLookupRevision);
    const water = typeof phSuspendWaterStatus === 'function' && phSuspendWaterStatus();
    const queueItems = getSuspendTagRequestItems(sortedSourceRows, requestSuspendTagStatusFilter);
    const allItems = water ? queueItems.filter(row => !isTagHiddenByActiveWater(row,water)) : queueItems;
    const searchItems = applyRequestSuspendTagCommonNameSearchFilter(allItems);
    const assignedItems = suspendQueueRowsForOwner(searchItems, requestSuspendTagStatusFilter === 'active' ? allItems : []);
    const contSizeItems = applyRequestSuspendTagContSizeFilter(assignedItems, sourceLookup);
    const eligible = applyRequestSuspendTagDockFilter(contSizeItems, sourceLookup);
    prepareBloomscapesJobFacets(eligible);
    const candidates = eligible.filter(matchesBloomscapesJobBoardFilters);
    const filteredItems = typeof applyInventoryExcelFilters === 'function' ? applyInventoryExcelFilters('suspend',candidates) : candidates;
    const filterKey = suspendTagFilterKey(latestSourceWatermark);
    const mode = `request:suspend-tag:${filterKey}`;
    const sortedItems = requestSuspendTagStatusFilter === 'active' ? sortBloomscapesUrgentSuspendTags(filteredItems) : filteredItems;
    const plan = buildRequestPagedRenderPlan(mode,'Suspend Tag',sortedItems);
    return { ...plan, allItems, searchItems, assignedItems, contSizeItems, sourceLookup,
        renderSignature: buildSuspendTagPlanSignature(plan, latestSourceRows, sourceLookupRevision)
            + ':' + bloomscapesDockBoardRevision() + ':' + (water?.version ?? 0) };
}

const bloomscapesJobFacets = new Map();
function prepareBloomscapesJobFacets(rows) {
    const key=getSupabaseReadIdentityScope()+'|'+getBloomscapesFarm()+'|'+activeReqTab;
    const signature=[getDatasetLoadSignature('requests'),getDatasetLoadSignature('soc'),resolvedViewStateEpoch,rows.length].join('|');
    const saved=bloomscapesJobFacets.get(key);
    if (saved?.signature===signature && saved.workRows===bloomscapesFieldQueueState.rows) return;
    const fields={assigned:new Set(['mine','unassigned']),block:new Set(),priorityStatus:new Set()};
    for (const row of rows) {
        for (const value of bloomscapesJobPriorityStatus(row)) fields.priorityStatus.add(value);
        const locations=[row.LOCATIONCODE,row.locationcode,row.target_location,...(row.source_rows || []).map(member=>member.locationcode)];
        for (const loc of locations.filter(Boolean)) fields.block.add(loc);
        if (row.assigned_to) fields.assigned.add(row.assigned_to);
    }
    if (bloomscapesJobFacets.size>=12) bloomscapesJobFacets.clear();
    bloomscapesJobFacets.set(key,{signature,workRows:bloomscapesFieldQueueState.rows,fields});
    paintBloomscapesJobFacets(document.querySelector('#request-filter-toolbar [data-job-board-tools]'));
}
function paintBloomscapesJobFacets(tools) {
    if (!tools) return;
    const key=getSupabaseReadIdentityScope()+'|'+getBloomscapesFarm()+'|'+activeReqTab;
    const entry=bloomscapesJobFacets.get(key);
    const filters=getBloomscapesJobBoardFilters();
    for (const [field,title] of [['assigned','All Assigned'],['block','Location / Block'],['priorityStatus','Priority / Status']]) {
        const select=tools.querySelector('[data-job-filter="'+field+'"]');
        if (select.hidden) continue;
        if (field==='assigned' || select._facetEntry!==entry || !select.options.length) {
            const choices=[...(entry?.fields[field] || [])].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
            select.replaceChildren(new Option(title,field==='assigned'?'all':''),...eligibleJobFacetValues(field,choices).map(value=>new Option(value,value)));
            select._facetEntry=entry;
        }
        select.value=filters[field] || '';
    }
}
