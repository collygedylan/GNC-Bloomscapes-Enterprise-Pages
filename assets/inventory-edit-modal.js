let inventoryEditModalGeneration = 0;

function closeInventoryEditRequestModal() {
    const modal = document.getElementById('inventory-edit-request-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('inventory-edit-request-modal');
}

function openInventoryEditRequestModal(uid = '', options = {}) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const editRecordId = String(safeOptions.existingRecordId || '').trim();
    const compactEditItem = !editRecordId && uid && !safeOptions.__masterDetailRow
        ? findInventoryEditMockItemByUid(uid) : null;
    if (!editRecordId && uid && !safeOptions.__masterDetailRow && !safeOptions.__displayMasterDetailFallback
        && needsMasterDetailHydration(compactEditItem)) {
        return openCompactInventoryEditRequestModal(uid, safeOptions, compactEditItem);
    }
    const existingRecord = editRecordId
        ? readInventoryEditMockRequests().find((record) => String(record && record.id || '').trim() === editRecordId)
        : null;
    let item = safeOptions.__masterDetailRow || (uid ? findInventoryEditMockItemByUid(uid) : activeItem);
    if (!item && existingRecord && existingRecord.snapshot) {
        item = findInventoryEditMockItemByUid(firstNonEmptyValue(existingRecord.snapshot.sourceUniqueId, existingRecord.snapshot.masterUniqueId, ''));
    }
    if (!item && !existingRecord) {
        showToast('Row Not Found', 'This row could not be resolved for the inventory edit request.', true);
        return false;
    }
    const isSupervisor = isInventoryEditMockSupervisorUser();
    if (editRecordId && !canCurrentUserEditInventoryEditMockRecord(existingRecord)) {
        showToast('Restricted', 'Only the assigned EVAL user or Dylan/JD/Megan can edit this inventory edit request.', true);
        return false;
    }
    if (!editRecordId && !canUseInventoryEditMock(item)) {
        showToast('Restricted', 'Inventory Edit is only available for assigned EVAL rows or supervisor users.', true);
        return false;
    }
    return paintInventoryEditRequestModal({ uid, safeOptions, editRecordId, existingRecord, item, isSupervisor });
}

function getInventoryEditOpenPermissionFence(owner) {
    const context = typeof getProductionLiveSyncContext === 'function' ? getProductionLiveSyncContext() : null;
    return JSON.stringify([String(context?.scope || owner), String(context?.dataPermissionVersion || ''),
        String(currentRole || '').trim().toLowerCase(), String(currentUserDivision || '').trim()]);
}

async function readExactWithSingleRevisionRaceRetry(uid) {
    try { return await loadExactMasterDetailRow(uid); }
    catch (error) {
        if (!/inventory changed while opening this row/i.test(String(error?.message || ''))) throw error;
        return loadExactMasterDetailRow(uid);
    }
}

function openCompactInventoryEditRequestModal(uid, safeOptions, compactEditItem) {
    const owner = getSupabaseReadIdentityScope();
    const sourceTable = String(firstNonEmptyValue(compactEditItem?.SOURCE_TABLE, compactEditItem?.source_table, '') || '').trim().toLowerCase();
    const itemUid = String(firstNonEmptyValue(compactEditItem?.UNIQUE_ID, compactEditItem?.unique_id, '') || '').trim();
    const canOpenCurrentCard = !!owner && itemUid === String(uid || '').trim()
        && (sourceTable === 'ph_master_inventory' || compactEditItem?.__managerReportListRow === true)
        && canUseInventoryEditMock(compactEditItem)
        && (typeof isMasterInventoryRowVisibleToCurrentUser !== 'function'
            || isMasterInventoryRowVisibleToCurrentUser(compactEditItem));
    if (!canOpenCurrentCard) {
        showToast('Restricted', 'Inventory Edit is only available for assigned EVAL rows or supervisor users.', true);
        return false;
    }
    const openingSnapshot = { ...compactEditItem };
    const permissionFence = getInventoryEditOpenPermissionFence(owner);
    const opened = openInventoryEditRequestModal(uid, { ...safeOptions, __displayMasterDetailFallback: true });
    const editor = document.getElementById('inventory-edit-request-modal');
    const generation = inventoryEditModalGeneration;
    const liveContextMatches = () => owner === getSupabaseReadIdentityScope()
        && permissionFence === getInventoryEditOpenPermissionFence(owner);
    const state = { compactEditItem, openingSnapshot, itemUid, safeOptions, editor, generation, liveContextMatches };
    void readExactWithSingleRevisionRaceRetry(uid).then(row => applyInventoryEditOpenReceipt(state,row)).catch(error => {
        if (liveContextMatches() && !['REQUEST_ABORTED','DATASET_READ_SCOPE_CHANGED'].includes(String(error?.code || '').toUpperCase())) {
            globalThis.reportHandledRuntimeIssue?.('inventory-edit-open', 'HANDLED_OPERATION_FAILURE');
        }
    });
    return opened;
}

function applyInventoryEditOpenReceipt(state, row) {
    const { compactEditItem, openingSnapshot, itemUid, safeOptions, editor, generation, liveContextMatches } = state;
    if (!row || !liveContextMatches() || !canUseInventoryEditMock(compactEditItem)) return;
    const exactUid = String(firstNonEmptyValue(row.UNIQUE_ID, row.unique_id, '') || '').trim();
    if (exactUid !== itemUid) return;
    const changed = mergeExactMasterDetailFieldsPreservingLocalChanges(compactEditItem, openingSnapshot, row);
    if (!changed || generation !== inventoryEditModalGeneration || !editor || editor.classList.contains('hidden')
        || String(document.getElementById('inventory-edit-request-uid')?.value || '').trim() !== itemUid || !liveContextMatches()) return;
    const snapshot = getInventoryEditMockSnapshot(compactEditItem);
    const label = document.getElementById('inventory-edit-modal-label');
    const summary = document.getElementById('inventory-edit-current-summary');
    if (label) label.textContent = `New live request | ${snapshot.itemcode || '-'} | ${snapshot.locationcode || '-'} | Lot ${snapshot.lotcode || '-'}`;
    if (summary) {
        const requestType = normalizeInventoryEditMockRequestType(firstNonEmptyValue(safeOptions.requestType, 'inventory-edit'));
        summary.innerHTML = buildInventoryEditCurrentSummaryHtml(snapshot, {
            record: { snapshot, request_type: requestType, requested: {} }, requested: {}, requestType,
            uid: snapshot.sourceUniqueId || snapshot.masterUniqueId || itemUid
        });
    }
}

function paintInventoryEditRequestModal({ uid, safeOptions, editRecordId, existingRecord, item, isSupervisor }) {
    inventoryEditModalGeneration++;
    const snapshot = existingRecord && existingRecord.snapshot ? existingRecord.snapshot : getInventoryEditMockSnapshot(item);
    const requested = existingRecord && existingRecord.requested && typeof existingRecord.requested === 'object' ? existingRecord.requested : {};
    const priorityChange = getInventoryEditMockChangeByKey(existingRecord || {}, 'priority') || {};
    const locationNoteChange = getInventoryEditMockChangeByKey(existingRecord || {}, 'locationnote') || {};
    const pulltagNotesChange = getInventoryEditMockChangeByKey(existingRecord || {}, 'pulltagnotes') || {};
    const holdChange = getInventoryEditMockChangeByKey(existingRecord || {}, 'holdstopcode') || {};
    const shearChange = getInventoryEditMockChangeByKey(existingRecord || {}, 'shear_list') || {};
    const modal = mountBloomscapesStaticBody('inventory-edit-request-modal');
    const uidInput = document.getElementById('inventory-edit-request-uid');
    const recordIdInput = document.getElementById('inventory-edit-request-record-id');
    const label = document.getElementById('inventory-edit-modal-label');
    const summary = document.getElementById('inventory-edit-current-summary');
    const routeType = document.getElementById('inventory-edit-route-type');
    const priority = document.getElementById('inventory-edit-priority');
    const priorityFlag = document.getElementById('inventory-edit-priority-flag');
    const holdAction = document.getElementById('inventory-edit-hold-action');
    const locationNote = document.getElementById('inventory-edit-locationnote');
    const pulltagNotes = document.getElementById('inventory-edit-pulltagnotes');
    const reason = document.getElementById('inventory-edit-reason');
    const shearRequested = document.getElementById('inventory-edit-shear-requested');
    const shearPercent = document.getElementById('inventory-edit-shear-percent');
    const shearInstructions = document.getElementById('inventory-edit-shear-instructions');
    const supervisorNoteWrap = document.getElementById('inventory-edit-supervisor-note-wrap');
    const supervisorNote = document.getElementById('inventory-edit-supervisor-note');
    if (uidInput) uidInput.value = snapshot.sourceUniqueId || snapshot.masterUniqueId || uid;
    if (recordIdInput) recordIdInput.value = editRecordId;
    if (label) label.textContent = `${editRecordId ? 'Editing live request' : 'New live request'} | ${snapshot.itemcode || '-'} | ${snapshot.locationcode || '-'} | Lot ${snapshot.lotcode || '-'}`;
    if (summary) summary.innerHTML = buildInventoryEditCurrentSummaryHtml(snapshot, {
        record: existingRecord || { snapshot, request_type: firstNonEmptyValue(safeOptions.requestType, 'inventory-edit'), requested },
        requested,
        requestType: firstNonEmptyValue(safeOptions.requestType, existingRecord && existingRecord.request_type, 'inventory-edit'),
        uid: snapshot.sourceUniqueId || snapshot.masterUniqueId || uid,
        recordId: editRecordId
    });
    if (routeType) routeType.value = normalizeInventoryEditMockRequestType(firstNonEmptyValue(safeOptions.requestType, existingRecord && existingRecord.request_type, 'inventory-edit'));
    if (priority) priority.value = String(firstNonEmptyValue(requested.priority, priorityChange.requested, '') || '').trim();
    if (priorityFlag) priorityFlag.checked = !!(requested.priority_flag || existingRecord && existingRecord.priority_flag);
    if (holdAction) holdAction.value = String(firstNonEmptyValue(requested.hold_action, holdChange.action, '') || '').trim();
    if (locationNote) locationNote.value = toInventoryEditMockLowerText(firstNonEmptyValue(requested.locationnote, locationNoteChange.requested, ''));
    if (pulltagNotes) pulltagNotes.value = String(firstNonEmptyValue(requested.pulltagnotes, pulltagNotesChange.requested, '') || '').trim();
    if (reason) reason.value = toInventoryEditMockLowerText(firstNonEmptyValue(existingRecord && existingRecord.holdreason, existingRecord && existingRecord.reason, ''));
    if (shearRequested) shearRequested.checked = !!(safeOptions.shearRequested || requested.shear_requested || shearChange.requested);
    if (shearPercent) shearPercent.value = String(firstNonEmptyValue(requested.shear_percent, getInventoryEditMockChangeByKey(existingRecord || {}, 'shear_percent') && getInventoryEditMockChangeByKey(existingRecord || {}, 'shear_percent').requested, '') || '').trim();
    if (shearInstructions) shearInstructions.value = String(firstNonEmptyValue(requested.shear_instructions, getInventoryEditMockChangeByKey(existingRecord || {}, 'shear_instructions') && getInventoryEditMockChangeByKey(existingRecord || {}, 'shear_instructions').requested, '') || '').trim();
    if (supervisorNoteWrap) supervisorNoteWrap.classList.toggle('hidden', !isSupervisor);
    if (supervisorNote) supervisorNote.value = isSupervisor ? String(firstNonEmptyValue(existingRecord && existingRecord.supervisor_note, '') || '').trim() : '';
    if (modal) modal.classList.remove('hidden');
    const focusField = normalizeInventoryEditMockFocusField(safeOptions.focusField || '') || 'priority';
    setTimeout(() => {
        focusInventoryEditMockModalField(focusField);
    }, 60);
    return false;
}
