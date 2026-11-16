function renderBloomscapesFieldExtras(item,tab,row) {
    if (tab === 'bloomscapes-sales-vault') return renderBloomscapesSubstituteFinder(item,row);
    if (row.recovery) renderBloomscapesRecovery(item,row);
}

function resetBloomscapesFarmNavigation() {
    globalThis.dispatchEvent?.(new CustomEvent('bloomscapes-farm-changing'));
    cancelDriveSearchRenderWork();
    resetDriveDrillSelectionState();
    resetDockView(false);
    for (const id of ['drive-content','docks-content']) {
        const host = document.getElementById(id);
        if (host) host.replaceChildren();
    }
}

function renderBloomscapesFarmNavigation() {
    const view = getCurrentVisibleViewId();
    markViewDirty(view);
    renderViewContent(view,false,true);
    updateGlobalBackButton();
}

function renderBloomscapesSubstituteFinder(item,row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Find Priority 1–4 substitutes';
    const results = document.createElement('div');
    results.setAttribute('role','status');
    button.addEventListener('click',async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
            const rows = await submitBloomscapesCommand('sales-substitutes',{farm:row.warehouse_id,rowId:row.unique_id});
            results.replaceChildren();
            rows.forEach(candidate => appendBloomscapesSubstitute(results,candidate));
            if (!rows.length) results.textContent = 'No available Priority 1–4 matches.';
        } catch (error) { results.textContent = error.message; }
        finally { button.disabled = false; }
    });
    item.append(button,results);
}

function appendBloomscapesSubstitute(results,row) {
    const entry = document.createElement('p');
    entry.textContent = [row.commonname,row.itemcode,row.locationcode,row.lotcode,
        'Priority '+row.priority,'On hand '+row.ptronhand,row.match_kind].join(' · ');
    results.appendChild(entry);
}

function renderBloomscapesRecovery(item,row) {
    const status = document.createElement('span');
    const measured = row.accumulated_gdd == null ? 'No observations after shearing' : row.accumulated_gdd+' GDD observed';
    const remaining = row.remaining_gdd == null ? 'Recovery target awaiting release evidence' : row.remaining_gdd+' GDD remaining';
    status.textContent = [row.badge,row.itemcode,row.locationcode,row.lotcode,measured,remaining,
        row.observed_through ? 'Through '+row.observed_through : ''].filter(Boolean).join(' · ');
    item.replaceChildren(status);
}

function mountBloomscapesRowChoices(host) {
    const farm = getBloomscapesFarm();
    for (const field of host.querySelectorAll('select[name="farm"]')) {
        if (farm !== 'ALL') field.value = farm;
    }
    const inputs = [...host.querySelectorAll('input[name="rowId"],input[name="destinationId"]')]
        .filter(input=>input.closest('form')?.dataset.fieldCommand!=='shear-complete');
    if (!inputs.length) return;
    const list = document.createElement('datalist');
    list.id = 'bloomscapes-physical-row-choices';
    for (const row of fullInventory || []) {
        const option = document.createElement('option');
        option.value = row.UNIQUE_ID || row.unique_id || '';
        option.label = [row.COMMONNAME || row.commonname,row.ITEMCODE || row.itemcode,
            row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode,bloomscapesRowFarm(row)].filter(Boolean).join(' · ');
        list.appendChild(option);
    }
    host.appendChild(list);
    inputs.forEach(input => input.setAttribute('list',list.id));
}

function renderInventoryEditDetailAction(item = activeItem, detailSourceView = '') {
    renderBloomscapesDetailDispatch(item,detailSourceView);
    const sharedPanel = document.getElementById('detail-inventory-checks-panel');
    const tabPanel = document.getElementById('inventory-edit-tab-detail-action');
    const legacyPanels = ['inventory-edit-detail-action', 'inventory-edit-request-detail-action']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const allPanels = [sharedPanel, tabPanel, ...legacyPanels].filter(Boolean);
    const safeTab = String(activeDetailTab || '').trim().toLowerCase();
    const safeSourceView = String(detailSourceView || activeDetailSourceView || lastView || '').trim().toLowerCase();
    const sharedInventoryAllowed = safeSourceView !== 'request' && safeSourceView !== 'drive';
    const targetPanels = safeTab === 'inventory-edit'
        ? (tabPanel ? [tabPanel] : [])
        : (sharedInventoryAllowed ? (sharedPanel ? [sharedPanel] : legacyPanels) : []);
    if (!allPanels.length) return;
    const hidePanels = (panels) => {
        panels.forEach((panel) => {
            panel.classList.add('hidden');
            panel.innerHTML = '';
        });
    };
    if (!targetPanels.length) {
        hidePanels([sharedPanel, ...legacyPanels].filter(Boolean));
        syncDetailSharedPanelsVisibility();
        return;
    }
    if (isInventoryEditDetailRenderBusy(targetPanels)) {
        deferInventoryEditDetailRender();
        syncDetailSharedPanelsVisibility();
        return;
    }
    const workflowRecord = findInventoryEditMockRecordForItem(item, { ignoreAccess: true });
    const canUsePanel = canUseInventoryEditMock(item) || canCurrentUserEditInventoryEditMockRecord(workflowRecord);
    if (!canUsePanel) {
        hidePanels(allPanels);
        syncDetailSharedPanelsVisibility();
        return;
    }
    const html = buildInventoryEditDetailWorkflowPanel(item, workflowRecord, detailSourceView);
    targetPanels.forEach((panel) => {
        panel.innerHTML = html;
        panel.classList.remove('hidden');
    });
    hidePanels(allPanels.filter((panel) => !targetPanels.includes(panel)));
    syncDetailSharedPanelsVisibility();
}
