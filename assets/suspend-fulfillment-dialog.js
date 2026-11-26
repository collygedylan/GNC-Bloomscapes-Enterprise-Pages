function suspendInventoryCard(row,actions) {
    const canonical = resolveCanonicalInventoryRow(row) || row;
    const links = currentCanonicalAvPhotoUrls(canonical);
    const image = links.length ? '<button type="button" data-photo aria-label="View inventory photo"><img loading="lazy" decoding="async" src="'
        +esc(links[0])+'" alt="Inventory photo"></button>' : '';
    const fields = [['SPEC',suspendField(canonical,'spec')],['Hold Stop Code',suspendField(canonical,'holdstopcode')],
        ['AV Note',suspendField(canonical,'av_note')]];
    const facts = fields.map(([name,value])=>'<div><b>'+name+'</b> '+esc(value || '—')+'</div>').join('');
    const metrics = buildInventoryQuantityChipsHtml(canonical,{layout:'row',compact:true,canonical:true,sourceView:'drive',
        locationMetricItem:canonical,preserveUnknown:true});
    return buildSharedInventoryCardLayout(canonical,{photoHtml:image,headerHtml:buildEvalOwnerBadge(canonical),
        metricsHtml:metrics,detailsHtml:'<div class="suspend-choice-facts">'+facts+'</div>'+actions});
}

function prepareSuspendPickerCatalog() {
    const source = activeDriveMode==='ok' ? getDriveModeItems() : rowsInBloomscapesPersonalScope(buildDriveModeRows(fullInventory));
    const physical = source.flatMap(row=>row.__physicalInventoryRows || [row]);
    return physical.filter(row=>bloomscapesFarmRowIsVisible(row) && row.present_in_drive!==false && row.PRESENT_IN_DRIVE!==false
        && row.is_drive_row!==false && row.IS_DRIVE_ROW!==false).map(row=>{
        const code = suspendField(row,'itemcode'), loc = suspendField(row,'locationcode');
        return {row,code,loc,location:(loc+' '+suspendField(row,'lotcode')).toUpperCase(),falseBlock:isFalseBlockLocation(loc),
            item:(code+' '+suspendField(row,'commonname')).toUpperCase(),available:Number(suspendField(row,'ptravailable') || 0),
            onHand:Number(suspendField(row,'ptronhand') || 0)};
    }).sort((a,b)=>b.available-a.available || b.onHand-a.onHand);
}

function suspendPickerRows(source,filters,catalog=prepareSuspendPickerCatalog()) {
    const search = String(filters.item || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
    const location = String(filters.location || '').trim().toUpperCase(), code = suspendField(source,'itemcode');
    if (filters.sub && !search.length) return [];
    return catalog.filter(entry=>entry.loc && (filters.falseBlocks || !entry.falseBlock) && entry.location.includes(location)
        && (filters.sub ? search.every(term=>entry.item.includes(term)) : isSuspendPullItemMatch(entry.code,code))).map(entry=>entry.row);
}

function suspendPickerCard(row,sub,addingOnly) {
    const uid = esc(getRequestItemCodeOptionMasterId(row));
    const disabled = isFalseBlockLocation(suspendField(row,'locationcode')) ? ' disabled' : '';
    const buttons = '<div class="suspend-choice-buttons"><button type="button" data-add="'+uid+'"'+disabled+'>'
        +(sub?'➕ Add Sub Option to Que':'➕ Add Location to Que')+'</button>'
        +(addingOnly ? '' : '<button type="button" data-replace="'+uid+'"'+disabled+'>'
            +(sub?'🔄 Replace / Sub Itemcode':'🔄 Replace Location')+'</button>')+'</div>';
    return '<article class="app-smart-card app-drive-compact-card app-shared-drive-layout" data-suspend-master="'+uid+'">'
        +suspendInventoryCard(row,buttons)+'</article>';
}

function suspendCardSubAction(item) {
    if (getBloomscapesFarm()!=='10-PH') return '';
    const from = suspendField(item,'subbed_from_itemcode');
    const quantity = suspendField(item,'suspend_candidate_state')==='option' ? '<span>Order Qty: '+suspendOrderQuantity(item)+'</span>' : '';
    const badge = from ? '<span data-suspend-sub-for="'+esc(from)+'">🔀 SUB FOR '+esc(from)+'</span>' : '';
    const button = '<div class="app-suspend-tag-actions"><button type="button" data-fast-press-ignore class="app-suspend-tag-action"'
        +' onpointerdown="return stopNestedCardActionPress(event)" ontouchstart="return stopNestedCardActionPress(event)"'
        +' onmousedown="return stopNestedCardActionPress(event)" data-action="sub-itemcode" data-unique-id="'+esc(item.UNIQUE_ID)+'">🔀 Sub Itemcode</button></div>';
    return quantity+badge+(resolveCanonicalRowAccess(currentUser,item).canManageLocations ? button : '');
}

function buildDockSuspendDcRequestCardDataHtml(item = null) {
    if (!item || !isDockSuspendDcRequestMirrorRow(item)) return '';
    const sourceRow = findDockSuspendDcRequestSourceRow(item) || item;
    syncDockSuspendDcRequestPhotoAliases(item, sourceRow);
    const values = getDockSuspendDcRequestCompletionValues(item, sourceRow);
    const spec = String(firstNonEmptyValue(values.spec, getItemDisplayValue(item, 'SPEC', 'request'), sourceRow && sourceRow.DOCK_SPEC, sourceRow && sourceRow.dock_spec, '') || '').trim();
    const caliper = String(firstNonEmptyValue(values.caliper, getItemDisplayValue(item, 'CALIPER', 'request'), sourceRow && sourceRow.DOCK_CALIPER, sourceRow && sourceRow.dock_caliper, '') || '').trim();
    const avNote = String(firstNonEmptyValue(values.avNote, getItemDisplayValue(item, 'AV_NOTE', 'request'), item.AV_NOTE, item.av_note, sourceRow && sourceRow.AV_NOTE, sourceRow && sourceRow.av_note, '') || '').trim();
    const dockNote = String(firstNonEmptyValue(item.DOCK_NOTE, item.dock_note, sourceRow && sourceRow.DOCK_NOTE, sourceRow && sourceRow.dock_note, item.DOCK_ISSUE_NOTE, item.dock_issue_note, sourceRow && sourceRow.DOCK_ISSUE_NOTE, sourceRow && sourceRow.dock_issue_note, '') || '').trim();
    const pickNote = String(firstNonEmptyValue(item.REQ_PICK, item.req_pick, item.REQ_PIC_NOTE, item.req_pic_note, item.PIC_NOTE, item.pic_note, sourceRow && sourceRow.REQ_PICK, sourceRow && sourceRow.req_pick, sourceRow && sourceRow.PIC_NOTE, sourceRow && sourceRow.pic_note, '') || '').trim();
    const chips = [
        spec ? `<span class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">SPEC: <span class="text-slate-900">${escapeQueueNoteText(spec)}</span></span>` : '',
        caliper ? `<span class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">CALIPER: <span class="text-slate-900">${escapeQueueNoteText(caliper)}</span></span>` : ''
    ].filter(Boolean).join('');
    const chipsHtml = chips ? `<div class="app-suspend-tag-data-chips mt-2 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">${chips}</div>` : '';
    const dockNoteHtml = dockNote ? `<div class="app-suspend-tag-data-note mt-2 rounded border border-sky-200 bg-sky-50 p-2 text-[12px] font-semibold text-sky-800 shadow-sm whitespace-pre-wrap"><span class="font-black">DOCK NOTE:</span> ${escapeQueueNoteText(dockNote)}</div>` : '';
    const pickNoteHtml = pickNote ? `<div class="app-suspend-tag-data-note mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-[12px] font-semibold text-emerald-800 shadow-sm whitespace-pre-wrap"><span class="font-black">PICK NOTE:</span> ${escapeQueueNoteText(pickNote)}</div>` : '';
    const avNoteHtml = avNote ? `<div class="app-suspend-tag-data-note mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[12px] font-semibold text-blue-800 shadow-sm whitespace-pre-wrap"><span class="font-black">AV NOTE:</span> ${escapeQueueNoteText(avNote)}</div>` : '';
    return chipsHtml + dockNoteHtml + pickNoteHtml + avNoteHtml + suspendCardSubAction(item);
}

let suspendTagCardActionDelegationBound = false;
function initializeSuspendTagCardActionDelegation(handler=dispatchSuspendTagCardAction) {
    if (suspendTagCardActionDelegationBound || typeof document==='undefined') return;
    suspendTagCardActionDelegationBound = true;
    document.addEventListener('click',handler,true);
}

function createSuspendWorkDialog(title,markup,inlineModal=false) {
    const dialog = document.createElement('dialog');
    dialog.className = 'suspend-work-dialog';
    dialog.dataset.fastPressIgnore = '';
    dialog.setAttribute('aria-label',title);
    dialog.innerHTML = '<header><h2>'+esc(title)+'</h2><button type="button" data-cancel aria-label="Close">×</button></header>';
    dialog.querySelector('[data-cancel]').onclick = ()=>dialog.close();
    if (inlineModal) mountSuspendCompletionSurface(dialog);
    else {
        dialog.addEventListener('close',()=>dialog.remove(),{once:true});
        document.body.append(dialog);
        dialog.showModal();
    }
    dialog.insertAdjacentHTML('beforeend',markup);
    return dialog;
}

function suspendPickerForm(addingOnly,canSub) {
    const sub = canSub ? '<button type="button" data-suspend-sub aria-pressed="false">🔀 Sub Itemcode</button>' : '';
    return '<div class="suspend-choice-filters">'+sub+'<label hidden data-item-filter>ItemCode or Common Name'
        +'<input type="search" name="itemSearch" autocomplete="off"></label><label>LocationCode or Lot'
        +'<input type="search" name="locationSearch" autocomplete="off"></label><label class="suspend-choice-check">'
        +'<input type="checkbox" name="falseBlocks"> Show false blocks</label></div>'
        +'<details data-manual><summary>Enter a location and lot</summary><label>LocationCode <input name="manualLocation"></label>'
        +'<label>Lot <input name="manualLot"></label><div class="suspend-choice-buttons"><button type="button" data-manual-add>Add Location to Que</button>'
        +(addingOnly ? '' : '<button type="button" data-manual-replace>Replace Location</button>')+'</div></details>'
        +'<p role="status"></p><section data-locations></section><button type="button" data-more hidden>Show more locations</button>';
}

function paintSuspendPicker(state) {
    const {dialog,source,sub,addingOnly} = state;
    if (!dialog.open || state.scope!==suspendWorkspaceScope()) return;
    const value = name=>dialog.querySelector('[name="'+name+'"]').value;
    const filters = {sub,item:value('itemSearch'),location:value('locationSearch'),falseBlocks:dialog.querySelector('[name="falseBlocks"]').checked};
    const revision = getDatasetLoadSignature('master');
    if (!state.catalog || state.revision!==revision) {
        state.catalog = prepareSuspendPickerCatalog();
        state.revision = revision;
    }
    const rows = suspendPickerRows(source,filters,state.catalog);
    const visible = rows.slice(0,state.limit);
    state.rows = new Map(visible.map(row=>[getRequestItemCodeOptionMasterId(row),row]));
    const node = dialog.querySelector('[data-locations]');
    node.innerHTML = visible.map(row=>suspendPickerCard(row,sub,addingOnly)).join('');
    dialog.querySelector('[data-more]').hidden = rows.length<=state.limit;
    dialog.querySelector('[data-item-filter]').hidden = !sub;
    dialog.querySelector('[data-manual]').hidden = sub;
    dialog.querySelector('[data-suspend-sub]')?.setAttribute('aria-pressed',String(sub));
    dialog.querySelector('[role="status"]').textContent = sub && !filters.item.trim() ? 'Search by item code or common name.'
        : rows.length ? rows.length+' matching location'+(rows.length===1?'':'s') : 'No matching locations.';
}

function manualSuspendChoice(state) {
    const locationcode = state.dialog.querySelector('[name="manualLocation"]').value.trim().toUpperCase();
    const lotcode = state.dialog.querySelector('[name="manualLot"]').value.trim().toUpperCase();
    if (!locationcode || !lotcode || isFalseBlockLocation(locationcode)) throw new Error('Enter a real location and its lot.');
    const matches = suspendPickerRows(state.source,{location:locationcode},state.catalog).filter(row=>suspendField(row,'locationcode').toUpperCase()===locationcode
        && suspendField(row,'lotcode').toUpperCase()===lotcode);
    if (matches.length>1) throw new Error('Choose the exact inventory card below.');
    return matches.length ? {row:matches[0],manual:false} : {row:{...suspendPhysicalChoice(state.source),locationcode,lotcode},manual:true};
}

async function saveSuspendPickerChoice(state,button) {
    if (state.busy || state.scope!==suspendWorkspaceScope()) return;
    const raw = button.closest('[data-suspend-master]')?.dataset.suspendMaster;
    const {row,manual} = raw ? {row:state.rows.get(raw),manual:false} : manualSuspendChoice(state);
    if (!row) return;
    const add = button.hasAttribute('data-add') || button.hasAttribute('data-manual-add');
    state.busy = true;
    button.disabled = true;
    try {
        if (getBloomscapesFarm()==='10-PH') await submitSuspendCandidate(state.source,row,add?'add':'replace',manual);
        else await saveOtherFarmSuspendChoice(state.source,row,add,manual);
        if (state.scope!==suspendWorkspaceScope()) return;
        state.dialog.close();
        state.onSaved?.();
    } finally {
        state.busy = false;
        button.disabled = false;
    }
}

async function saveOtherFarmSuspendChoice(source,row,add,manual) {
    const custom = manual ? {locationcode:row.locationcode,lotcode:row.lotcode} : null;
    if (add) return addSelectedDockSuspendDcRequestOptions(manual?[]:[row],source,custom?[custom]:[]);
    return changeSuspendPullLocation(source.UNIQUE_ID,manual?'':getRequestItemCodeOptionMasterId(row),'replace_location',null,custom);
}

function handleSuspendPickerClick(state,event) {
    const button = event.target.closest('button');
    if (!button || !state.dialog.open) return;
    if (state.scope!==suspendWorkspaceScope()) {state.dialog.close();return;}
    if (button.matches('[data-suspend-sub],[data-more]')) {
        changeSuspendPickerFilter(state,button);
        return;
    }
    if (button.matches('[data-photo]')) {
        const row = state.rows.get(button.closest('[data-suspend-master]').dataset.suspendMaster);
        openAvPhotoViewer(currentCanonicalAvPhotoUrls(row),suspendField(row,'commonname'),0,button);
        return;
    }
    if (!button.matches('[data-add],[data-replace],[data-manual-add],[data-manual-replace]')) return;
    void saveSuspendPickerChoice(state,button).catch(error=>{
        if (state.scope===suspendWorkspaceScope()) state.dialog.querySelector('[role="status"]').textContent=suspendTagErrorMessage(error);
    });
}

function openSuspendFulfillmentPicker(source,options={}) {
    if (!source || !canReadSuspendQueue() || !resolveCanonicalRowAccess(currentUser,source).canManageLocations) return false;
    const addingOnly = !!options.onSaved;
    const dialog = createSuspendWorkDialog('Change / Add Location',suspendPickerForm(addingOnly,getBloomscapesFarm()==='10-PH'));
    const state = {dialog,source,scope:suspendWorkspaceScope(),addingOnly,sub:!!options.sub,limit:18,onSaved:options.onSaved};
    dialog.onclick = event=>handleSuspendPickerClick(state,event);
    dialog.oninput = ()=>{state.limit=18;paintSuspendPicker(state);};
    paintSuspendPicker(state);
    if (state.sub) dialog.querySelector('[name="itemSearch"]').focus();
    if (getDatasetState('master')?.rowCompleteness!=='complete') void ensureDatasetLoaded('master','full',{preserveRequestedMode:true})
        .then(()=>paintSuspendPicker(state)).catch(error=>{
            if (dialog.open && state.scope===suspendWorkspaceScope()) dialog.querySelector('[role="status"]').textContent=suspendTagErrorMessage(error);
        });
    return false;
}

function selectSuspendFulfillmentLocation(uniqueId) {
    const row = findDockSuspendDcRequestMirrorRowByUniqueId(uniqueId);
    if (!row) return;
    if (getBloomscapesFarm()==='10-PH') return closeDockSuspendDcRequestFromCard(uniqueId);
    const selected = getRequestItemCodeOptionRows(row).filter(candidate=>suspendField(candidate,'locationcode')===suspendField(row,'locationcode')
        && suspendField(candidate,'lotcode')===suspendField(row,'lotcode'));
    if (selected.length===1) return changeSuspendPullLocation(uniqueId,getRequestItemCodeOptionMasterId(selected[0]),'replace_location');
    return openSuspendPullPicker(uniqueId);
}

function changeSuspendPickerFilter(state,button) {
    if (button.hasAttribute('data-more')) state.limit+=18;
    else {
        state.sub=!state.sub;
        state.limit=18;
    }
    paintSuspendPicker(state);
    if (state.sub && button.hasAttribute('data-suspend-sub')) state.dialog.querySelector('[name="itemSearch"]').focus();
}

function mountSuspendCompletionSurface(dialog) {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className='suspend-work-overlay';
    const background = [...document.body.children].filter(node=>node instanceof HTMLElement && !node.inert
        && !['SCRIPT','LINK','STYLE','TEMPLATE','NOSCRIPT'].includes(node.tagName));
    background.forEach(node=>{node.inert=true;});
    dialog.setAttribute('aria-modal','true');
    overlay.append(dialog);
    document.body.append(overlay);
    dialog.open=true;
    const focus = requestAnimationFrame(()=>{if (dialog.open) dialog.querySelector('[data-cancel]').focus({preventScroll:true});});
    dialog.addEventListener('keydown',event=>{
        if (event.key==='Escape') {event.preventDefault();event.stopPropagation();dialog.close();return;}
        if (event.key==='Tab') keepSuspendModalFocus(dialog,event);
    });
    dialog.addEventListener('close',()=>{
        cancelAnimationFrame(focus);
        overlay.remove();
        background.forEach(node=>{node.inert=false;});
        if (previous?.isConnected && !document.querySelector('dialog[open]')) previous.focus({preventScroll:true});
    },{once:true});
}

function keepSuspendModalFocus(dialog,event) {
    const targets = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(node=>node.getClientRects().length);
    const first=targets[0], last=targets.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
}

function suspendCompleteHeader(source,quantity) {
    const group = getDockSuspendDcRequestGroupParts(source);
    return '<p class="suspend-order-heading">Order Qty: '+esc(String(quantity))+' · Dock '+esc(group.dock)
        +' · Drop/Stop '+esc(group.drop)+' · '+esc(group.customer)+' / '+esc(group.consignee)+' · Rep: '
        +esc(getDockSuspendDcRequestSalesRepName(source))+'</p>';
}

function suspendSplitCard(state,tag) {
    const uid = getDockSuspendDcRequestSourceUid(tag);
    const choice = suspendPhysicalChoice(tag);
    const target = {ITEMCODE:choice.itemcode,LOCATIONCODE:choice.locationcode,LOTCODE:choice.lotcode,WAREHOUSEID:'10-PH'};
    const physical = resolveCanonicalInventoryRow(target);
    const field = '<label>Qty from '+esc(choice.locationcode)+'<input type="number" inputmode="numeric" step="1" min="0" max="'
        +state.quantity+'" data-allocate="'+esc(uid)+'" value="'+esc(String(state.selected.get(uid) ?? ''))+'"></label>';
    return '<article class="app-smart-card app-drive-compact-card app-shared-drive-layout" data-suspend-allocation="'+esc(uid)+'">'
        +suspendInventoryCard(physical || target,field)+'</article>';
}

function paintSuspendSplit(state) {
    const current = findDockSuspendDcRequestMirrorRowByUniqueId(state.source.UNIQUE_ID);
    if (!current || state.scope!==suspendWorkspaceScope()) {state.dialog.close();return;}
    state.source = current;
    state.rows = suspendGroupMirrors(current);
    state.dialog.querySelector('[data-split-rows]').innerHTML = state.rows.map(row=>suspendSplitCard(state,row)).join('');
    updateSuspendRemaining(state);
}

function updateSuspendRemaining(state) {
    const entries = state.rows.map(row=>{
        const source_uid = getDockSuspendDcRequestSourceUid(row);
        return {...suspendPhysicalChoice(row),source_uid,qty:state.selected.get(source_uid) ?? 0};
    }).filter(row=>row.qty!==0);
    const remaining = state.quantity-entries.reduce((total,row)=>total+row.qty,0);
    state.dialog.querySelector('[data-remaining]').textContent = 'Remaining Needed: '+(Number.isFinite(remaining)?remaining:'—');
    state.dialog.querySelector('[data-submit-split]').disabled = state.busy
        || entries[0]?.source_uid!==getDockSuspendDcRequestSourceUid(state.source) || !suspendAllocationValid(entries,state.quantity,'partial');
}

async function commitSuspendModal(state,mode,button) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    try {
        const selected = mode==='full' ? new Map([[getDockSuspendDcRequestSourceUid(state.source),state.quantity]]) : state.selected;
        await submitSuspendAllocation(state.source,selected,mode);
        if (state.scope===suspendWorkspaceScope()) {state.dialog.close();showToast('Tag Complete','The allocation is saved in Docks.');}
    } catch (error) {
        if (state.scope===suspendWorkspaceScope()) state.dialog.querySelector('[role="status"]').textContent=suspendTagErrorMessage(error);
    } finally {
        state.busy=false;
        button.disabled=false;
        if (state.dialog.open && mode==='partial') updateSuspendRemaining(state);
    }
}

function handleSuspendCompletionClick(state,event) {
    const button = event.target.closest('button');
    if (!button || !state.dialog.open || state.busy) return;
    if (state.scope!==suspendWorkspaceScope()) {state.dialog.close();return;}
    if (button.matches('[data-partial]')) {
        state.dialog.querySelector('[data-split]').hidden=false;
        paintSuspendSplit(state);
        return;
    }
    if (button.matches('[data-pick]')) {
        openSuspendFulfillmentPicker(state.source,{onSaved:()=>{if (state.dialog.open) paintSuspendSplit(state);}});
        return;
    }
    if (button.matches('[data-full],[data-submit-split]')) {
        void commitSuspendModal(state,button.matches('[data-full]') ? 'full' : 'partial',button);
        return;
    }
    if (button.matches('[data-photo]')) {
        const key=button.closest('[data-suspend-allocation]').dataset.suspendAllocation;
        const tag=state.rows.find(row=>getDockSuspendDcRequestSourceUid(row)===key);
        const {itemcode,locationcode,lotcode} = suspendPhysicalChoice(tag);
        openAvPhotoViewer(currentCanonicalAvPhotoUrls({itemcode,locationcode,lotcode,WAREHOUSEID:'10-PH'}),locationcode,0,button);
    }
}

function openSuspendFulfillmentDialog(source) {
    const quantity = suspendOrderQuantity(source);
    const disabled = !quantity || isFalseBlockLocation(suspendField(source,'locationcode'));
    const body = suspendCompleteHeader(source,quantity)+'<div class="suspend-choice-buttons"><button type="button" data-full'
        +(disabled?' disabled':'')+'>✅ Complete in Full ('+quantity+')</button><button type="button" data-partial'
        +(quantity<2?' disabled':'')+'>➗ Partial Fill (Split Order)</button></div>'
        +'<section data-split hidden><p data-remaining aria-live="polite"></p><div data-split-rows></div>'
        +'<button type="button" data-pick>+ Pick Another Drive Mode Location / Sub</button>'
        +'<button type="button" data-submit-split disabled>Complete Split</button></section><p role="status">'
        +(disabled?'Choose a real fill location on the tag before completing.':'')+'</p>';
    const dialog = createSuspendWorkDialog('Complete Suspend Tag',body,true);
    const state = {source,dialog,scope:suspendWorkspaceScope(),quantity,rows:[],selected:new Map(),busy:false};
    dialog.onclick=event=>handleSuspendCompletionClick(state,event);
    dialog.oninput=event=>{
        if (!event.target.matches('[data-allocate]')) return;
        state.selected.set(event.target.dataset.allocate,event.target.value==='' ? 0 : event.target.valueAsNumber);
        updateSuspendRemaining(state);
    };
    return false;
}
