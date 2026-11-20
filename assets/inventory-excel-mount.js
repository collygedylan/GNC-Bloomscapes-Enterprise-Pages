function getInventoryExcelHost(scope) {
    if (scope==='reclass') return null;
    const browse=getBloomscapesBrowseFilterHost(scope);
    if (browse) return browse;
    const hosts = {drive:'view-drive',av:'view-av',docks:'view-docks',suspend:'view-request',request:'view-request',evalwork:'view-request',locationwork:'view-request',recount:'view-request',shear:'view-shear-list',queueshear:'view-request',smart:'smart-moves-intelligence-panel',eval1:'view-managers',eval2:'view-managers',reclass:'argos-reclass-item-inquiry'};
    if (scope==='po') return document.querySelector('[data-transfer-excel]');
    if (scope==='studio') return document.getElementById('view-'+getCurrentVisibleViewId())?.querySelector('[data-studio-excel]');
    const host=document.getElementById(hosts[scope]);
    if (!host || host.closest('.hidden') || host.style.display==='none') return null;
    const view = typeof getCurrentVisibleViewId === 'function' ? getCurrentVisibleViewId() : '';
    if (['eval1','eval2'].includes(scope) && (view!=='managers' || activeHomeTab !== (scope==='eval2'?MANAGER_EVAL_REPORTS_2_VIEW:MANAGER_EVAL_REPORTS_VIEW))) return null;
    if (hosts[scope]==='view-request') {
        const tab=normalizeRequestTabValue(activeReqTab), tabs={suspend:['suspend-tag'],request:['pending','reps'],evalwork:['eval-work','shear-test'],locationwork:['location-work','moves'],recount:['recount'],queueshear:['shear-list']};
        if(!tabs[scope]?.includes(tab)) return null;
    }
    if (scope === 'drive') return host.querySelector('#drive-toolbar-rail');
    if (scope === 'av') return host.querySelector('#av-filter-options');
    if (scope === 'docks') return getBloomscapesDocksFilterHost(host);
    if (scope === 'suspend') return host.querySelector('#request-filter-toolbar');
    if (hosts[scope] === 'view-request') return host.querySelector('#request-filter-toolbar');
    if (scope === 'eval2') return host.querySelector('.manager-eval2-native-filters .mobile-browse-filter-panel');
    return host;
}

function getBloomscapesDocksFilterHost(root) {
    mountDocksFilterDisclosure(root);
    const controls=root.querySelector('#docks-filter-controls');
    if (!controls) return null;
    ensureDockFilterControlsShell(controls);
    controls.parentElement.dataset.docksExcelDrawer='true';
    let host=controls.querySelector('[data-docks-excel-fields]');
    if (!host) {
        host=document.createElement('div');
        host.dataset.docksExcelFields='true';
        controls.appendChild(host);
    }
    const existing=root.querySelector(':scope > [data-inventory-excel-scope="docks"]');
    if (existing) host.appendChild(existing);
    return host;
}

function getVisibleInventoryExcelFields(scope) {
    return getInventoryExcelFields(scope).filter(([field]) => scope !== 'av' || getAvPhotoMode() !== 'valid_photos' || field !== 'season');
}

function commitActiveRequestExcelFilters(scope) {
    if (getCurrentVisibleViewId() !== 'request') return false;
    const host=getInventoryExcelHost(scope);
    if (host?.id !== 'request-filter-toolbar') return false;
    mountInventoryExcelFilters(scope);
    return true;
}

function mountInventoryExcelFilters(scope) {
    if (scope === 'drive') mountDriveExcelHeaderFilters();
    if (scope === 'drive') document.querySelectorAll('[data-inventory-excel-scope="'+scope+'"]').forEach(bar=>{if(!bar.closest('#view-drive'))bar.remove();});
    const host=getInventoryExcelHost(scope); if(!host) return;
    let bar=host.querySelector('[data-inventory-excel-scope]');
    if(bar && bar.dataset.inventoryExcelScope!==scope) {bar.remove();bar=null;}
    if(!bar) {bar=document.createElement('section');bar.className='inventory-excel-bar';bar.dataset.inventoryExcelScope=scope;host.appendChild(bar);}
    if(bar.contains(document.activeElement) && bar.querySelector('[data-excel-search]')) return;
    const state=getInventoryExcelState(scope), signature=JSON.stringify([state.revision,state.rows.length,scope === 'av' && getAvPhotoMode(),getInventoryExcelFields(scope).map(([k])=>[k,state.filters[k]?[...state.filters[k]]:null])]);
    bar.hidden=false;
    if(bar.dataset.signature===signature) {
        if (scope === 'docks') mountDocksPrimaryFilters(host.closest('#view-docks'),bar);
        return;
    }
    bar.dataset.signature=signature;
    bar.innerHTML=inventoryExcelBarHtml(scope);
    if (scope==='studio') bindStudioAssignedFilter(bar,state);
    if (scope === 'docks') mountDocksPrimaryFilters(host.closest('#view-docks'),bar);
}

function ensureDriveToolbarControls() {
    const rail = document.getElementById('drive-toolbar-rail');
    if (!rail) return false;
    rail.classList.remove('mobile-browse-rail', 'hidden');
    rail.hidden = false;
    const mode = document.getElementById('drive-mobile-mode');
    if (mode && mode.parentElement !== rail) rail.prepend(mode);

    const retained=document.getElementById('drive-advanced-filters');
    for (const id of ['drive-excel-salesyear-btn','drive-excel-season-btn','drive-excel-lotcode-btn','drive-filters-btn']) {
        const control=document.getElementById(id);
        if (control && retained && rail.contains(control)) retained.appendChild(control);
    }

    const state = getInventoryExcelState('drive');
    let next = rail.querySelector('[data-inventory-excel-scope="drive"]');
    if (next) next.hidden = false;
    for (const [key, label] of getDriveExcelHeaderFields().filter(([key])=>['contsize','holdstopcode'].includes(key)).reverse()) {
        let button = document.getElementById('drive-excel-' + key + '-btn')
            || rail.querySelector('[data-drive-excel-field="' + key + '"]');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
        }
        button.id = 'drive-excel-' + key + '-btn';
        button.classList.add('drive-excel-filter-pill');
        button.classList.remove('hidden');
        button.hidden = false;
        button.dataset.excelField = key;
        button.dataset.driveExcelField = key;
        button.setAttribute('aria-haspopup', 'dialog');
        const action = "return openInventoryExcelFilter('drive',this.dataset.excelField,this)";
        if (button.getAttribute('onclick') !== action) button.setAttribute('onclick', action);
        const text = (key === 'contsize' ? 'Size' : 'Hold') + ' ▾';
        if (state.filters[key]) button.dataset.filterCount = String(state.filters[key].size); else delete button.dataset.filterCount;
        button.setAttribute('aria-label',label + (state.filters[key] ? ' (' + state.filters[key].size + ' selected)' : ''));
        if (button.textContent !== text) button.textContent = text;
        for (const [property, value] of [['display', 'inline-flex'], ['visibility', 'visible'], ['opacity', '1']]) {
            if (button.style.getPropertyValue(property) !== value || button.style.getPropertyPriority(property) !== 'important')
                button.style.setProperty(property, value, 'important');
        }
        if (button.parentElement !== rail || button.nextElementSibling !== next) rail.insertBefore(button, next);
        next = button;
    }
    if (mode && mode.nextElementSibling !== next) rail.insertBefore(mode, next);

    // Recover controls from older mobile disclosure markup before removing its wrapper.
    for (const id of ['drive-advanced-filters', 'drive-drill-tabs']) {
        const control = document.getElementById(id);
        if (control && rail.contains(control)) rail.after(control);
    }
    rail.querySelectorAll(':scope > .mobile-browse-filters,#drive-excel-header-filters').forEach(node => node.remove());
    placeBloomscapesFarmFilter(document.getElementById('bloomscapes-farm-selector')?.parentElement, 'drive');
    return true;
}

function getInventoryExcelParityAudit() {
    for (const [scope,state] of getInventoryExcelState.cache?.scopes || []) {
        const host = getInventoryExcelHost(scope);
        if (!host || !state.rows.length) continue;
        const bar = host.querySelector('[data-inventory-excel-scope="'+scope+'"]');
        const primary = scope === 'docks' ? host.closest('#view-docks')?.querySelector('[data-docks-primary-filters]') : null;
        const missing = getVisibleInventoryExcelFields(scope).some(([key]) =>
            !bar?.querySelector('[data-field="'+key+'"]') && !primary?.querySelector('[data-field="'+key+'"]'));
        if (!bar || missing) return {missing:true,scope};
    }
    return {missing:false};
}

function bindStudioAssignedFilter(bar,state) {
    bindBloomscapesChoiceFields(bar,{'studio-assigned':()=>{
        const options=getInventoryExcelOptions(state,'username');
        return [['','All Assigned Users ('+state.optionTotals.get('username')+')'],
            ...options.map(option=>[option.key,(option.label || 'Unassigned')+' ('+option.count+')'])];
    }});
    bar.querySelector('[data-inventory-select="username"]').onchange=event=>setBloomscapesCountedFilter('studio','username',event.target.value);
}
