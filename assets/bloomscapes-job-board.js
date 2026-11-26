const bloomscapesJobBoardDialogs = new Map();

function syncBloomscapesJobBoardToolbar(toolbar) {
    startBloomscapesJobBoardRefresh();
    for (const [key,dialog] of bloomscapesJobBoardDialogs) {
        if (!key.startsWith(getSupabaseReadIdentityScope()+':')) dialog.close();
        if (dialog.dataset.jobCreatorOwner!==String(currentUser)) {
            dialog.remove();bloomscapesJobBoardDialogs.delete(key);
        }
    }
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

function canCreateBloomscapesJobBoardWork(tab) {
    if (isFullAppAdministrator()) return true;
    if (tab==='pending') return getRequestEntryCapabilities()?.canCreateGeneral===true;
    return bloomscapesFieldQueueState.canCreate?.[bloomscapesWorkKind(tab) || 'SUSPEND']===true;
}

async function openBloomscapesJobBoardCreator(tab,options={}) {
    if (!canCreateBloomscapesJobBoardWork(tab)) return;
    const owner = getSupabaseReadIdentityScope(),key = owner+':'+tab+(options.quick ? ':quick:'+getItemUniqueId(options.source) : '');
    const previous = bloomscapesJobBoardDialogs.get(key);
    if (previous?.isConnected) { previous.showModal(); return; }
    const dialog = document.createElement('dialog');
    dialog.className = 'bloomscapes-work-dialog';
    dialog.dataset.jobCreatorOwner = String(currentUser);
    dialog.setAttribute('aria-label','Create '+(BLOOMSCAPES_JOB_BOARD.find(([id])=>id===tab)?.[1] || 'Field')+' Work');
    const close = dialog.appendChild(document.createElement('button'));
    close.type = 'button';close.textContent = 'Close · keep draft';
    close.addEventListener('click',()=>dialog.close());
    const kind = bloomscapesWorkKind(tab);
    const body = dialog.appendChild(document.createElement('div'));
    if (kind) {
        const panel = Object.keys(BLOOMSCAPES_FIELD_KINDS).find(id=>bloomscapesWorkViewForPanel(id)===kind && id!=='bloomscapes-field-jobs');
        body.innerHTML = renderBloomscapesWorkCreator(panel);
    } else body.innerHTML = bloomscapesLegacyWorkPickerMarkup(tab);
    dialog.addEventListener('gnc-field-work-created',()=>{
        dialog.close();dialog.remove();bloomscapesJobBoardDialogs.delete(key);
    });
    bloomscapesJobBoardDialogs.set(key,dialog);
    document.body.appendChild(dialog);dialog.showModal();
    try {
        if (kind) await mountBloomscapesWorkCreator(dialog,options);
        else await mountBloomscapesLegacyWorkPicker(dialog,tab);
    } catch (error) {
        if (dialog.isConnected) body.appendChild(document.createTextNode(error.message));
    }
}

function bloomscapesLegacyWorkPickerMarkup(tab) {
    return '<h3>Replicated Drive Mode · '+escapeHtml(getBloomscapesFarm())+'</h3><div data-work-browser></div>'
        + '<p data-selected-source>Select a physical Drive row.</p><form data-create-field-work data-legacy-board-picker>'
        + '<input type="hidden" name="sourceId"><label>Scope <select name="scope"><option value="ITEM_LOCATION">Itemcode @ Location</option>'
        + '<option value="ITEM_FARM">Itemcode Across Farm</option><option value="SINGLE_ROW">Single Row</option></select></label>'
        + (tab==='suspend-tag' ? '<label>Existing open order line <select name="orderId" required></select></label><label>Tag Quantity <input name="quantity" type="number" min="1" step="1" required></label>' : '')
        + '<button type="submit">'+(tab==='pending' ? 'Continue to Request wizard' : 'Create Suspend Work')+'</button>'
        + '<button type="reset">Clear draft</button><p role="status"></p></form>';
}

async function mountBloomscapesLegacyWorkPicker(dialog,tab) {
    const form = dialog.querySelector('form');
    const state = {owner:getSupabaseReadIdentityScope(),selected:null,attempt:null};
    if (tab==='suspend-tag') await ensureDatasetLoaded('soc','full');
    mountBloomscapesWorkBrowser(dialog.querySelector('[data-work-browser]'),row=>{
        state.selected = row;state.attempt = null;
        form.elements.sourceId.value = row.UNIQUE_ID || row.unique_id;
        dialog.querySelector('[data-selected-source]').textContent = [row.ITEMCODE,row.LOCATIONCODE,row.LOTCODE].join(' · ');
        updateBloomscapesSuspendOrderChoices(form,row);
    });
    form.elements.scope.addEventListener('change',()=>updateBloomscapesSuspendOrderChoices(form,state.selected));
    form.addEventListener('reset',()=>{state.selected=null;state.attempt=null;});
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void submitBloomscapesLegacyWorkPicker(dialog,tab,form,state);
    });
}

async function submitBloomscapesLegacyWorkPicker(dialog,tab,form,state) {
    const button = form.querySelector('[type=submit]'),status = form.querySelector('[role=status]');
    if (button.disabled || !state.selected || state.owner!==getSupabaseReadIdentityScope()) return;
    button.disabled = true;
    try { await createBloomscapesLegacyBoardWork(dialog,tab,form,state); }
    catch (error) { if (status.isConnected) status.textContent = error.message; }
    finally { button.disabled = false; }
}

async function createBloomscapesLegacyBoardWork(dialog,tab,form,state) {
    if (tab==='pending') {
        const rows = bloomscapesLegacyWorkScope(state.selected,form.elements.scope.value);
        if (rows.some(row=>!row.DOM_ID)) throw new Error('Open the complete Drive row snapshot before creating this Request.');
        detailRequestSourceDomIds = rows.map(row=>row.DOM_ID);
        dialog.close();await openRequestModal('job-board');
        return;
    }
    const input = {farm:getBloomscapesFarm(),sourceId:form.elements.sourceId.value,scope:form.elements.scope.value,
        orderId:form.elements.orderId.value,quantity:Number(form.elements.quantity.value)};
    const signature = JSON.stringify(input);
    if (state.attempt?.signature!==signature) state.attempt = {...input,signature,id:crypto.randomUUID()};
    await createBloomscapesSuspendWork(state.attempt);
    if (state.owner!==getSupabaseReadIdentityScope()) return;
    dialog.dispatchEvent(new CustomEvent('gnc-field-work-created'));
    await ensureDatasetLoaded('suspendTag','full',{force:true});setReqTab('suspend-tag');
}

function updateBloomscapesSuspendOrderChoices(form,source) {
    const select = form.elements.orderId;
    if (!select) return;
    const scope = form.elements.scope.value;
    const rows = source ? (socInventory || []).filter(bloomscapesFarmRowIsVisible).filter(row=>
        (row.ITEMCODE || row.itemcode)===(source.ITEMCODE || source.itemcode)
        && (scope==='ITEM_FARM' || (row.LOCATIONCODE || row.locationcode)===(source.LOCATIONCODE || source.locationcode))
        && (scope!=='SINGLE_ROW' || (row.LOTCODE || row.lotcode)===(source.LOTCODE || source.lotcode))
        && !String(row.SUSPEND || row.suspend || '').trim()
        && Number(row.QUANTITYORDERED || row.quantityordered)>Number(row.QUANTITYSHIPPED || row.quantityshipped || 0)) : [];
    select.replaceChildren(new Option(rows.length ? 'Choose an existing order' : 'No eligible open orders',''),
        ...rows.map(row=>new Option([row.ORDERNUMBER || row.ordernumber,row.LOCATIONCODE || row.locationcode,
            row.LOTCODE || row.lotcode,row.UNIQUE_ID || row.unique_id].filter(Boolean).join(' · '),row.UNIQUE_ID || row.unique_id)));
}

function bloomscapesLegacyWorkScope(source,scope) {
    return (fullInventory || []).filter(bloomscapesFarmRowIsVisible).filter(row=>
        row.ITEMCODE===source.ITEMCODE && (scope==='ITEM_FARM'
            || scope==='ITEM_LOCATION' && row.LOCATIONCODE===source.LOCATIONCODE
            || scope==='SINGLE_ROW' && getItemUniqueId(row)===getItemUniqueId(source)));
}

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
    const filterKey = JSON.stringify([
        requestSuspendTagStatusFilter, getSuspendEvalUserFilter('suspend-tag'),
        normalizeSearchValue(requestSuspendTagCommonNameSearchTerm),
        normalizeRequestSuspendTagContSizeFilterValue(requestSuspendTagContSizeFilter),
        requestSuspendTagDockFilter,
        latestSourceWatermark.filename,
        latestSourceWatermark.lastUpdated
    ]);
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
