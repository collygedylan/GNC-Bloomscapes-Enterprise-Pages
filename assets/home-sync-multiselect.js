
let homeSyncSelectionCleanup;

const HOME_SYNC_SELECTION_STYLE = `
#view-home #dashboard-sync-accordion > summary {flex-wrap:wrap!important}
#view-home #dashboard-sync-accordion .home-sync-target-toolbar {gap:5px!important;flex-wrap:wrap;max-width:100%}
#home-header-sync > button {height:36px!important;min-height:36px!important;box-sizing:border-box;padding:0 8px!important;font-size:10px!important;letter-spacing:0!important;border-radius:9px;white-space:nowrap}
#home-header-sync > button svg {width:16px!important;height:16px!important;flex:none}
#home-header-sync #erp-sync-target-multiselect {display:inline-flex;align-items:center;gap:4px;background:linear-gradient(#103220,#081c12);color:#ecfdf5;border:1px solid #448b65}
#home-header-sync #erp-sync-target-multiselect[hidden],#home-header-sync #erp-sync-target-popover[hidden] {display:none!important}
#home-header-sync #erp-sync-target-popover {position:fixed;left:50%;transform:translateX(-50%);width:min(94vw,460px);max-height:72dvh;overflow-y:auto;z-index:9500;box-sizing:border-box;padding:14px;border:1px solid #448b65;border-radius:16px;background:linear-gradient(145deg,#103220f5,#081c12fa);color:#ecfdf5;box-shadow:0 18px 50px #0008;text-align:left;font:12px/1.4 system-ui}
#erp-sync-target-popover h3 {font-size:13px;font-weight:800;margin:14px 0 6px;color:#a7f3d0}
#erp-sync-target-popover h4 {font-size:11px;margin:10px 0 4px;color:#a7f3d0}
#erp-sync-target-popover button {border:1px solid #448b65;border-radius:8px;padding:7px 9px;color:#ecfdf5;background:#174b30;font:inherit;cursor:pointer}
#erp-sync-target-popover button:disabled {opacity:.5;cursor:default}
#erp-sync-target-popover :is(button,input):focus-visible {outline:2px solid #a7f3d0;outline-offset:2px}
#erp-sync-target-popover .home-sync-presets {display:flex;flex-wrap:wrap;gap:6px}
#erp-sync-target-popover .home-sync-target-row {display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #ffffff16}
#erp-sync-target-popover label {display:flex;align-items:center;gap:8px;min-width:0;flex:1}
#erp-sync-target-popover input {width:17px;height:17px;flex:none;accent-color:#34d399}
#erp-sync-target-popover small {display:block;overflow-wrap:anywhere;color:#b8cfbf;font-size:10px}
#erp-sync-target-popover b {display:inline-block;font-size:9px;border:1px solid #448b65;border-radius:4px;padding:1px 4px;margin-left:5px}
#erp-sync-target-popover .home-sync-target-row > button {flex:none}
#erp-sync-target-popover footer {display:flex;gap:8px;position:sticky;bottom:-14px;padding:12px 0;background:#081c12}
#erp-sync-target-popover footer button:first-child {flex:1;background:#087443;font-weight:800}
`;

function homeSyncPresetMarkup() {
    const farms = ['10-PH','60-HL','20-TX','40-NC'];
    return `<div class="home-sync-presets"><button type="button" data-preset="core">✓ Core 13</button>
        <button type="button" data-run-target="PH_TRANS_KEYED">⚡ Run Trans Keyed Now</button>
        ${farms.map(farm=>`<button type="button" data-preset="${farm}">Only ${farm}</button>`).join('')}
        <button type="button" data-preset="all">Select All (24)</button>
        <button type="button" data-preset="clear">Clear All</button></div>`;
}

function homeSyncTargetMarkup(target) {
    const run = target.defaultChecked ? '' : `<button type="button" data-run-target="${target.key}" aria-label="Run ${target.shortLabel}">⚡ Run</button>`;
    return `<div class="home-sync-target-row"><label><input type="checkbox" value="${target.key}" data-table-name="${target.tableName}">
        <span>${target.label}<b>${target.farm}</b><small data-pending-folder-id="${target.pendingFolderId}">TEST BUILD / ${target.folderPath}</small></span></label>${run}</div>`;
}

function homeSyncPopoverMarkup() {
    const groups = [['DRIVE_AROUND','Drive Around (PH, HL, TX, NC)'],['SOC_OPEN','SOC Open Orders (PH, TX, NC)'],
        ['SOC_RESERVES','SOC Reserves (PH, TX, NC)'],['PO_REPORTS','P.O Reports (HL PO, NC PO, TX PO)']];
    return `${homeSyncPresetMarkup()}<h3 id="home-sync-core-title">Core Run Script Tables (13)</h3>
        ${groups.map(([key,title])=>`<section aria-label="${title}"><h4>${title}</h4>${ERP_SYNC_TARGETS.filter(target=>target.group===key).map(homeSyncTargetMarkup).join('')}</section>`).join('')}
        <h3>On-Demand &amp; Auxiliary TEST BUILD Folders (11)</h3>
        ${ERP_SYNC_TARGETS.filter(target=>!target.defaultChecked).map(homeSyncTargetMarkup).join('')}
        <footer><button type="button" data-run-selected>⚡ Run Selected (13)</button><button type="button" data-close>Done</button></footer>`;
}

function paintHomeSyncSelection(host) {
    const keys = getSelectedErpSyncKeys();
    const signature = JSON.stringify(keys);
    if (host.dataset.erpSelection===signature) return;
    host.dataset.erpSelection = signature;
    const core = keys.length===DEFAULT_CORE_SYNC_KEYS.length && DEFAULT_CORE_SYNC_KEYS.every(key=>keys.includes(key));
    host.querySelector('[data-home-sync-label]').textContent = `Tables (${core ? '13 Core' : keys.length+' Selected'}) ▾`;
    for (const input of host.querySelectorAll('#erp-sync-target-popover input')) input.checked = keys.includes(input.value);
    const run = host.querySelector('[data-run-selected]');
    run.textContent = `⚡ Run Selected (${keys.length})`;
    run.disabled = !keys.length;
}

function closeHomeSyncSelection(host, restoreFocus = false) {
    host.querySelector('#erp-sync-target-popover').hidden = true;
    const trigger = host.querySelector('#erp-sync-target-multiselect');
    trigger.setAttribute('aria-expanded','false');
    if (restoreFocus) trigger.focus();
}

function toggleHomeSyncSelection(host) {
    const popup = host.querySelector('#erp-sync-target-popover');
    if (!popup.hidden) return closeHomeSyncSelection(host);
    paintHomeSyncSelection(host);
    const trigger = host.querySelector('#erp-sync-target-multiselect');
    popup.style.top = Math.min(trigger.getBoundingClientRect().bottom+6,innerHeight*.2)+'px';
    popup.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    popup.querySelector('button').focus();
}

function homeSyncPresetKeys(preset) {
    if (preset==='core') return [...DEFAULT_CORE_SYNC_KEYS];
    if (preset==='all') return ERP_SYNC_TARGETS.map(target=>target.key);
    if (preset==='clear') return [];
    return getErpSyncTargetsForFarm(preset).map(target=>target.key);
}

function applyHomeSyncPreset(host, preset) {
    setSelectedErpSyncKeys(homeSyncPresetKeys(preset));
    paintHomeSyncSelection(host);
}

async function dispatchHomeSyncSelection(host, button) {
    try {
        if (button.dataset.preset) return applyHomeSyncPreset(host,button.dataset.preset);
        if (button.hasAttribute('data-close')) return closeHomeSyncSelection(host,true);
        closeHomeSyncSelection(host);
        await runSelectedErpSyncTargets(button.dataset.runTarget ? [button.dataset.runTarget] : undefined);
    } catch (error) {
        showToast('ERP sync',error.message,true);
        paintHomeSyncSelection(host);
    }
}

function bindHomeSyncSelection(host, signal) {
    const trigger = host.querySelector('#erp-sync-target-multiselect');
    const popup = host.querySelector('#erp-sync-target-popover');
    trigger.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        toggleHomeSyncSelection(host);
    },{signal});
    popup.addEventListener('click',event=>{
        event.stopPropagation();
        const button = event.target.closest('[data-preset],[data-close],[data-run-target],[data-run-selected]');
        if (button) void dispatchHomeSyncSelection(host,button);
    },{signal});
    popup.addEventListener('change',()=>{
        try { setSelectedErpSyncKeys([...popup.querySelectorAll('input:checked')].map(input=>input.value)); }
        catch (error) { showToast('ERP selection',error.message,true); }
        paintHomeSyncSelection(host);
    },{signal});
    document.addEventListener('click',event=>{
        if (!popup.contains(event.target) && !trigger.contains(event.target)) closeHomeSyncSelection(host);
    },{signal});
    host.addEventListener('keydown',event=>{
        if (event.key==='Escape' && !popup.hidden) {
            event.stopPropagation();
            closeHomeSyncSelection(host,true);
        }
    },{signal});
}

function mountHomeSyncMultiselect(button, allowed = canRunManualInventoryImport()) {
    const home = button.closest('#home-header-sync');
    if (!home) return;
    const existing = home.querySelector('#erp-sync-target-multiselect');
    if (existing) {
        existing.hidden = !allowed;
        return paintHomeSyncSelection(home);
    }
    delete home.dataset.erpSelection;
    homeSyncSelectionCleanup?.abort();
    homeSyncSelectionCleanup = new AbortController();
    const style = document.createElement('style');
    style.textContent = HOME_SYNC_SELECTION_STYLE;
    const trigger = document.createElement('button');
    trigger.id = 'erp-sync-target-multiselect';
    trigger.type = 'button';
    trigger.hidden = !allowed;
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-controls','erp-sync-target-popover');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"/></svg><span data-home-sync-label></span>';
    button.parentElement.classList.add('home-sync-target-toolbar');
    button.after(trigger);
    const popup = document.createElement('div');
    popup.id = 'erp-sync-target-popover';
    popup.hidden = true;
    popup.setAttribute('role','region');
    popup.setAttribute('aria-label','ERP sync tables');
    popup.innerHTML = homeSyncPopoverMarkup();
    home.append(style,popup);
    const status = document.getElementById('dashboard-sync-accordion');
    if (status) popup.appendChild(status);
    bindHomeSyncSelection(home,homeSyncSelectionCleanup.signal);
    paintHomeSyncSelection(home);
}
