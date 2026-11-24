function clearSelection({ clearBloom = false } = {}) {
    isMultiSelectMode = false;
    document.body.classList.remove('multi-select-mode');
    const retained = clearBloom ? new Set() : getPersistedBloomCartIds();
    for (const domId of selectedItems) {
        if (retained.has(domId)) continue;
        requestSelectionTokens.delete(domId);
        selectedItemSources.delete(domId);
        selectedItems.delete(domId);
    }
    cartPanelOpen = false;
    bloomPickerActionsOpen = false;
    bloomShareMenuOpen = false;
    updateGlobalActionBar();
    refreshCartButtons();
    syncDriveReturnedSelectionToolbar();
}

function clearBloomPickerSelection() {
    clearPersistedBloomCart();
    clearSelection({ clearBloom: true });
    return false;
}

function confirmBloomCartClearAfterEmail(owner, rows) {
    if (owner !== getSupabaseReadIdentityScope()) return;
    const selection = getPersistedBloomCartIds();
    if (rows.some(row => selection.has(row?.DOM_ID))
        && window.confirm('Email sent. Clear the Bloom Picker selection?')) {
        clearBloomPickerSelection();
    }
}

function isCurrentDriveCardOptionsContext(sourceView = '') {
    const explicitSourceView = String(sourceView || '').trim().toLowerCase();
    if (explicitSourceView) return explicitSourceView === 'drive';
    const visibleView = typeof getCurrentVisibleViewId === 'function' ? getCurrentVisibleViewId() : '';
    const currentView = String(firstNonEmptyValue(visibleView, currentPrimaryViewId, '') || '').trim().toLowerCase();
    if (currentView) return currentView === 'drive';
    return String(firstNonEmptyValue(activeDetailSourceView, lastView, '') || '').trim().toLowerCase() === 'drive';
}

function prepareDriveCardOptionsReader(access,userOverride,displayOverride) {
    if (!access || access.isAdmin || isAlwaysDriveCardOptionsUser(userOverride,displayOverride)) return () => true;
    if (!access.isEval && !access.isRepLike) return () => true;
    const actor = firstNonEmptyValue(userOverride,displayOverride,currentUser,currentUserDisplay,'');
    return row => canUserMakeLiveChangesOnRow(actor,row)
        || (!access.isEval && isWarehouseAssignedDriveCardForCurrentUser(row,userOverride,displayOverride));
}

function canCurrentUserUseDriveCardOptions(item=null,sourceView='drive',roleOverride='',userOverride='',displayOverride='') {
    if (String(sourceView || '').trim().toLowerCase() !== 'drive') return true;
    if (isBloomscapesDriveTour()) return false;
    const access = getRoleAccessState(roleOverride,userOverride);
    return prepareDriveCardOptionsReader(access,userOverride,displayOverride)(item);
}

function prepareDriveWorkflowSelection(access,userOverride='',displayOverride='') {
    if (isBloomscapesDriveTour() || canUseFullDriveBloomPickerWorkflow(userOverride,displayOverride)) return () => true;
    if (access?.isRep && !access.isCsr) return () => false;
    if (access?.isRepLike && canUseDriveQuickRequest()) return () => true;
    return prepareDriveCardOptionsReader(access,userOverride,displayOverride);
}

function canCurrentUserSelectDriveWorkflowRow(item=null,sourceView='drive',roleOverride='',userOverride='',displayOverride='') {
    if (String(sourceView || '').trim().toLowerCase() !== 'drive') return true;
    const access = getRoleAccessState(roleOverride,userOverride);
    return prepareDriveWorkflowSelection(access,userOverride,displayOverride)(item);
}

function prepareBloomPickerEligibility(sourceView='') {
    const access=getRoleAccessState();
    const view=String(sourceView || '').trim().toLowerCase();
    const isDriveContext=view==='drive-bloom' || isCurrentDriveCardOptionsContext(view);
    return {access,driveSelect:isDriveContext ? prepareDriveWorkflowSelection(access) : null,
        foremanDrive:!access.isForeman || canAccessView('drive')};
}

function canAddItemToBloomPicker(item=null,sourceView='',eligibility=null) {
    if (!item || !canUseCartInventoryActions([item])) return false;
    const {access,driveSelect,foremanDrive}=eligibility || prepareBloomPickerEligibility(sourceView);
    if (driveSelect && !driveSelect(item)) {
        const canRepAddBloomPickerRow=!!(access && access.isRep && !access.isCsr && isBloomPickerEligibleItem(item));
        if (!canRepAddBloomPickerRow) return false;
    }
    if (access.isForeman) return foremanDrive && hasPriorityColumnData(item);
    return true;
}

function canToggleBloomSelectionOn(domId, sourceView) {
    const item = findItemByDomId(domId);
    const fromBloom = sourceView === 'drive-bloom';
    if ((fromBloom || isCurrentDriveCardOptionsContext(sourceView)) && !canCurrentUserSelectDriveWorkflowRow(item, 'drive')
        && !(fromBloom && canAddItemToBloomPicker(item, 'drive-bloom'))) {
        showToast('View Only', 'This Drive Mode row is not available for your workflows.', true);
        return false;
    }
    if (!getRoleAccessState().isForeman || canAddItemToBloomPicker(item, sourceView)) return true;
    showToast('Restricted', 'Foreman users can add priority Drive Mode rows to Take Back.', true);
    return false;
}

function toggleGlobalItem(domId, isChecked = null, sourceView = '') {
    const id = String(domId || '').trim();
    if (!id) return;
    if (id.startsWith('hl-order:')) {
        if (isChecked !== true) void removeHlDraftRow(id.slice(9));
        return;
    }
    restoreBloomCartSelection();
    const source = String(sourceView || '').trim().toLowerCase();
    const hadItem = selectedItems.has(id);
    const wantsAdd = isChecked === null ? !hadItem : !!isChecked;
    if (wantsAdd && !canToggleBloomSelectionOn(id, source)) return;
    if (wantsAdd) {
        selectedItems.add(id);
        selectedItemSources.set(id, source);
    } else {
        selectedItems.delete(id);
        selectedItemSources.delete(id);
    }
    if (hadItem === wantsAdd) return;
    if (wantsAdd) requestSelectionTokens.set(id, createStableClientBatchId());
    else requestSelectionTokens.delete(id);
    persistBloomCartSelection([id], !wantsAdd);
    if (!selectedItems.size) {
        cartPanelOpen = false;
        bloomPickerActionsOpen = false;
        bloomShareMenuOpen = false;
    }
    updateGlobalActionBar();
    refreshCartButtons(id);
    syncDriveReturnedSelectionToolbar();
    const count = selectedItems.size;
    const rows = `${count} row${count === 1 ? '' : 's'}`;
    if (wantsAdd) showToast('Added To Bloom Picker', `${rows} in Bloom Picker.`);
    else showToast('Removed', `${rows} left in Bloom Picker.`);
}

function initializeCartUi() {
    if (cartUiObserver) {
        cartUiObserver.disconnect();
        cartUiObserver = null;
    }
    bindBloomCartLifecycle();
    restoreBloomCartSelection();
    scheduleCartUiRefresh();
}

function canReclassBloomSelection(items) {
    const access = getBloomscapesReclassAccess();
    return hasBloomscapesReclassScope(access) && Boolean(items.length) && items.length === selectedItems.size
        && items.every(row => canShowBloomscapesReclassRow(row,access));
}

function openBloomSelectionReclass() {
    const items = getCartSelectedItems();
    if (!canReclassBloomSelection(items)) return false;
    if (items.length === 1) return openBloomReclassRow(items[0],items);
    showBloomReclassChoices(items);
    return false;
}

function openBloomReclassRow(row,items) {
    const uid = row.UNIQUE_ID || row.unique_id;
    return openArgosInventoryTransactionModal(uid,'reclass','drive',{inquiryRow:row,inquiryRows:items});
}

function showBloomReclassChoices(items) {
    const dialog = document.createElement('dialog');
    dialog.className = 'queue-reclass-row-picker';
    dialog.innerHTML = '<h3>Choose a row to reclass</h3><section></section><button type="button">Cancel</button>';
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    const rows = dialog.querySelector('section');
    for (const row of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = [row.ITEMCODE || row.itemcode,row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode].join(' · ');
        button.onclick = () => {
            dialog.close();
            if (canReclassBloomSelection(items)) openBloomReclassRow(row,items);
        };
        rows.append(button);
    }
    document.body.append(dialog);
    dialog.showModal();
}
