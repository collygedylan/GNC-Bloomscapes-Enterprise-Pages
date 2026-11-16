function renderBloomscapesCountedSelect(scope,state,key,label) {
    const options = getInventoryExcelOptions(state,key).filter(option=>option.count > 0);
    const selected = state.filters[key];
    const total = state.rows.filter(row=>inventoryExcelRowMatches(row,state,key)).length;
    const allLabel = key==='username' ? 'All Assigned Users' : 'All Rows';
    const choices = [['',allLabel+' ('+total+')'],...options.map(option=>[option.key,
        (option.label || 'Unassigned')+' ('+option.count+')'])];
    return '<label class="inventory-excel-field bloomscapes-compact-select"><span>'+escapeHtml(label)+'</span>'
        +'<select data-inventory-select="'+key+'" aria-label="'+escapeHtml(label)+'" onchange="return setBloomscapesCountedFilter(\''+scope+'\',\''+key+'\',this.value)">'
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
    return '<label class="bloomscapes-compact-select manager-eval2-view-switch">View<select aria-label="Eval Reports #2 View" onchange="return setManagerEvalReport2BrowseMode(this.value)">'
        +'<option value="plant" '+(managerEvalReport2BrowseMode!=='location'?'selected':'')+'>Itemcodes / Common Name</option>'
        +'<option value="location" '+(managerEvalReport2BrowseMode==='location'?'selected':'')+'>Block / Location</option></select></label>';
}
