function renderBloomscapesCountedSelect(scope,state,key,label) {
    if (scope==='docks') {
        const value=[...(state.filters[key] || [])][0];
        const text=value || (key==='username'?'All Assigned Users':'All Rows');
        return '<div class="inventory-excel-field bloomscapes-compact-select"><span>'+escapeHtml(label)+'</span>'
            +'<button type="button" aria-haspopup="dialog" data-field="'+key+'" data-inventory-select="'+key+'" aria-label="'+escapeHtml(label)
            +'" onclick="return openBloomscapesDockFacet(this)">'+escapeHtml(text)+' ▾</button></div>';
    }
    if (scope==='studio' && key==='username') {
        const value=[...(state.filters[key] || [])][0] || '';
        return '<div class="inventory-excel-field">'+renderBloomscapesChoiceField(key,label,'studio-assigned',value,value || 'All Assigned Users',
            {attributes:'data-field="username" data-inventory-select="username"'})+'</div>';
    }
    const options = getInventoryExcelOptions(state,key).filter(option=>option.count > 0);
    const selected = state.filters[key];
    const total = state.optionTotals.get(key) ?? state.rows.length;
    const allLabel = key==='username' ? (['drive','request','suspend'].includes(scope) ? 'All Assigned' : 'All Assigned Users') : 'All Rows';
    const choices = [['',allLabel+' ('+total+')'],...options.map(option=>[option.key,
        (option.label || 'Unassigned')+' ('+option.count+')'])];
    return '<label class="inventory-excel-field bloomscapes-compact-select"><span>'+escapeHtml(label)+'</span>'
        +'<select data-field="'+key+'" data-inventory-select="'+key+'" '+(scope==='drive' && key==='username' ? 'id="drive-assigned-filter" ' : '')+'aria-label="'+escapeHtml(label)+'" onchange="return setBloomscapesCountedFilter(\''+scope+'\',\''+key+'\',this.value)">'
        +choices.map(([value,title])=>'<option value="'+escapeHtml(value)+'" '+(value && selected?.has(value)?'selected':'')+'>'+escapeHtml(title)+'</option>').join('')+'</select></label>';
}

function setBloomscapesCountedFilter(scope,key,value) {
    const state = getInventoryExcelState(scope);
    if (value) state.filters[key] = new Set([value]);
    else delete state.filters[key];
    state.revision++;
    refreshInventoryExcelView(scope);
    return false;
}

function renderManagerEvalReport2BrowseModeSwitch() {
    return '<label class="bloomscapes-compact-select manager-eval2-view-switch">View<select aria-label="Reports View" onchange="return setManagerEvalReport2BrowseMode(this.value)">'
        +'<option value="plant" '+(managerEvalReport2BrowseMode!=='location'?'selected':'')+'>Itemcodes / Common Name</option>'
        +'<option value="location" '+(managerEvalReport2BrowseMode==='location'?'selected':'')+'>Block / Location</option></select></label>';
}

function renderManagerEvalAssignedUserControl(target = 'eval2', disabled = false) {
    if (target === 'eval2') {
        const selected = getManagerEvalAssignedUsers('eval2')[0] || 'all';
        const optionHtml = getManagerEvalReport2UserFilterOptions().map((option) =>
            `<option value="${escapeHtml(option.value)}" ${selected.toLocaleLowerCase() === option.value.toLocaleLowerCase() ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
        ).join('');
        const summary = selected === 'all' ? 'All Users' : (selected.toLocaleLowerCase() === '(unassigned)' ? 'Unassigned' : selected);
        return `<label class="min-w-0"><span class="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Assigned To</span><select data-role="manager-eval2-user-filter" class="min-h-[48px] w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-[12px] font-black text-slate-900 shadow-sm disabled:opacity-50" aria-label="Assigned To" onchange="return setManagerEvalReport2Filter('assignedto', this.value)" ${disabled ? 'disabled' : ''}>${optionHtml}</select><span data-role="manager-eval2-user-filter-summary" class="mt-1 block text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700">Showing: ${escapeHtml(summary)}</span></label>`;
    }
    const selected = getManagerEvalAssignedUsers(target);
    const chips = selected.slice(0, 3).map((value) => `<span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-800">${escapeHtml(value)}</span>`).join('');
    const overflow = selected.length > 3 ? `<span class="text-[9px] font-black text-slate-500">+${selected.length - 3}</span>` : '';
    return `<div class="min-w-0"><div class="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Users</div><button type="button" class="flex min-h-[46px] w-full items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-left text-sm font-black text-slate-900 shadow-sm disabled:opacity-50" ${disabled ? 'disabled' : ''} onclick="return openManagerEvalUserPicker('${escapeHtml(target)}')"><span class="min-w-0 truncate">${escapeHtml(getManagerEvalAssignedUserLabel(target))}</span><i class="ph-bold ph-users-three text-lg text-emerald-700"></i></button>${selected.length ? `<div class="mt-2 flex min-w-0 flex-wrap gap-1">${chips}${overflow}</div>` : ''}</div>`;
}

function openBloomscapesDockFacet(trigger) {
    if (trigger.dataset.field==='username') void openEligibleDockAssigneeFacet(trigger);
    else showBloomscapesDockFacet(trigger);
    return false;
}

async function openEligibleDockAssigneeFacet(trigger) {
    const farm=getBloomscapesFarm(), owner=getSupabaseReadIdentityScope(), navigation=navTransitionSeq;
    const current=()=>trigger.isConnected && getCurrentVisibleViewId()==='docks' && navigation===navTransitionSeq
        && farm===getBloomscapesFarm() && owner===getSupabaseReadIdentityScope();
    try {
        await readEligibleModuleDirectory(farm);
        if (current()) showBloomscapesDockFacet(trigger);
    } catch (error) {
        if (!current()) return;
        reportEligibleModuleReadFailure(error);
        showToast('Assigned users',error.message,true);
    }
}

function showBloomscapesDockFacet(trigger) {
    const state=getInventoryExcelState('docks'),key=trigger.dataset.field;
    const options=getInventoryExcelOptions(state,key);
    const all=key==='username'?'All Assigned Users':'All Rows';
    const choices=[['',all+' ('+state.optionTotals.get(key)+')'],
        ...options.map(option=>[option.key,(option.label || 'Unassigned')+' ('+option.count+')'])];
    openBloomscapesChoicePicker(trigger,{label:trigger.getAttribute('aria-label'),choices,
        value:[...(state.filters[key] || [])][0] || '',
        select:value=>setBloomscapesCountedFilter('docks',key,value)});
}
