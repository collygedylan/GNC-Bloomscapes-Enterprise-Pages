function getInventoryExcelHost(scope) {
    if (scope==='reclass') return null;
    const browse=getBloomscapesBrowseFilterHost(scope);
    if (browse) return browse;
    const hosts = {drive:'view-drive',av:'view-av',docks:'view-docks',suspend:'view-request',request:'view-request',evalwork:'view-request',locationwork:'view-request',recount:'view-request',shear:'view-shear-list',queueshear:'view-request',smart:'smart-moves-intelligence-panel',eval1:'view-managers',eval2:'view-managers',reclass:'argos-reclass-item-inquiry'};
    if (scope==='po') return document.querySelector('[data-transfer-excel]');
    if (scope==='studio') return document.querySelector('[data-work-creator] [data-studio-excel]');
    const host=document.getElementById(hosts[scope]);
    if (!host || host.closest('.hidden') || host.style.display==='none') return null;
    const view = typeof getCurrentVisibleViewId === 'function' ? getCurrentVisibleViewId() : '';
    if (['eval1','eval2'].includes(scope) && (view!=='managers' || activeHomeTab !== (scope==='eval2'?MANAGER_EVAL_REPORTS_2_VIEW:MANAGER_EVAL_REPORTS_VIEW))) return null;
    if (hosts[scope]==='view-request') {
        const tab=normalizeRequestTabValue(activeReqTab), tabs={suspend:['suspend-tag'],request:['pending','reps'],evalwork:['eval-work','shear-test'],locationwork:['location-work','moves'],recount:['recount'],queueshear:['shear-list']};
        if(!tabs[scope]?.includes(tab)) return null;
    }
    if (scope === 'drive') return host.querySelector('[data-inventory-excel-mount="drive"]');
    if (scope === 'av') return host.querySelector('#av-filter-options');
    if (scope === 'suspend') return host.querySelector('[data-inventory-excel-mount="suspend"]');
    if (hosts[scope] === 'view-request') return host.querySelector('#request-filter-toolbar');
    if (scope === 'eval2') return host.querySelector('.manager-eval2-native-filters .mobile-browse-filter-panel');
    return host;
}
function getVisibleInventoryExcelFields(scope) {
    return getInventoryExcelFields(scope).filter(([field]) => scope !== 'av' || getAvPhotoMode() !== 'valid_photos' || field !== 'season');
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
    if(bar.dataset.signature===signature) return;
    bar.dataset.signature=signature;bar.innerHTML=inventoryExcelBarHtml(scope);
}
