function closeDockInfoModal() {
    hideDockInfoModal();
    // Capture the post-close dependency context, after the editor and
    // its focus no longer protect the discarded draft from refresh.
    if (canUseProductionLiveSync()) {
        signalProductionLiveSync('dock-editor-closed', 0);
        scheduleProductionLiveSyncRender(true);
    }
}

function hideDockInfoModal() {
    const modal = document.getElementById('dock-info-modal');
    const focused = document.activeElement;
    modal?.classList.add('hidden');
    if (modal?.contains(focused)) focused.blur();
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('dock-info-modal');
}

function openDockInfoModal(dockNum, tripNumber) {
    if (!canEditDockWorkflow()) {
        showToast('Restricted', 'Only Admin or QC Supervisor can update dock team and status.', true);
        return;
    }
    const tripKey = normalizeDockTeamTripKey(tripNumber);
    if (!tripKey) {
        showToast('Trip Number Required', 'This dock row does not have a TRIPNUMBER, so a shared team cannot be assigned.', true);
        return;
    }
    pendingDockNum = normalizeDockViewDockKey(dockNum);
    pendingDockTrip = String(tripNumber || '').trim();
    const modal = mountBloomscapesStaticBody('dock-info-modal');
    const requestedTrip = pendingDockTrip;
    document.getElementById('modal-dock-num').innerText = pendingDockNum;
    document.getElementById('modal-dock-trip').innerText = pendingDockTrip;
    let savedInfo = getDockTeamInfo(pendingDockTrip);
    updateDockAssignableTeamOptions(savedInfo);
    document.getElementById('dock-status').value = savedInfo.status || "Loading";
    modal.classList.remove('hidden');
    ensureDockAssignableUsers().then(() => {
        if (!modal.classList.contains('hidden') && pendingDockTrip===requestedTrip) updateDockAssignableTeamOptions();
    }).catch(() => {});
    ensureDockTeamStatusLoaded().then(() => {
        if (modal.classList.contains('hidden') || pendingDockTrip!==requestedTrip) return;
        const refreshedInfo = getDockTeamInfo(requestedTrip);
        updateDockAssignableTeamOptions(refreshedInfo);
        document.getElementById('dock-status').value = refreshedInfo.status || 'Loading';
    }).catch(() => {});
}

async function saveDockInfoModal(button = null) {
    if (!requireCurrentDocksWriteProof()) return false;
    if (!canEditDockWorkflow()) {
        showToast('Restricted', 'Only Admin or QC Supervisor can update dock team and status.', true);
        return;
    }
    if (!pendingDockNum || !pendingDockTrip) return;
    const dockNum = normalizeDockViewDockKey(pendingDockNum);
    const tripNumber = String(pendingDockTrip || '').trim();
    const currentInfo = getDockTeamInfo(tripNumber);
    const info = normalizeDockTeamInfo({
        tripnumber: tripNumber,
        dock_num: dockNum,
        checker: document.getElementById('dock-checker').value,
        inspector: document.getElementById('dock-inspector').value,
        mistake: document.getElementById('dock-mistake').value,
        status: document.getElementById('dock-status').value,
        revision: currentInfo.revision
    });
    if (navigator.onLine === false) {
        showToast('Not Saved', 'Reconnect before saving. Dock teams are shared and are never stored only on this device.', true);
        return;
    }
    const saveButton = button || document.getElementById('dock-info-save-button');
    const originalLabel = saveButton ? saveButton.innerHTML : '';
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.classList.add('opacity-60', 'pointer-events-none');
        saveButton.innerHTML = 'SAVING';
    }
    try {
        const result = await runDockTripStatusRequest('upsert', {
            tripnumber: tripNumber,
            dockNum,
            checker: info.checker,
            inspector: info.inspector,
            mistake: info.mistake,
            status: info.status || 'Loading',
            expectedRevision: Number(currentInfo.revision || 0)
        });
        const canonicalRow = getDockTripStatusResponseRow(result.data);
        const savedInfo = cacheDockTeamInfo(tripNumber, canonicalRow || info);
        dockTeamStatusLoaded = true;
        dockTeamSchemaReady = true;
        if (pendingDockTrip === tripNumber) hideDockInfoModal();
        queueAppLiveEventForWrite('ph_dock_trip_status', 'POST', [{ unique_id: tripNumber, tripnumber: tripNumber }], '');
        showToast('Saved for Everyone', `Trip ${savedInfo.tripnumber || tripNumber} team and status are now shared with every Docks user.`);
        markViewDirty('docks');
        scheduleDocksRender(0, 0, true);
    } catch (error) {
        const message = String(error && error.message || '').trim();
        showToast('Not Saved', message.includes('changed') ? message : 'The shared Trip assignment was not saved. Refresh Docks and retry.', true);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.classList.remove('opacity-60', 'pointer-events-none');
            saveButton.innerHTML = originalLabel || 'SAVE & CONTINUE';
        }
    }
}

function openDockItemMistakeModal(uid) {
    if (getRoleAccessState().isRep) {
        showToast('View Only', 'Docks is view only for sales reps.', true);
        return false;
    }
    const normalizedUid = normalizeDockIssueSourceUniqueId(uid);
    const issue = getDockIssueStatus(normalizedUid);
    const item = findDockMistakeSourceRowByUniqueId(normalizedUid, issue);
    const modal = mountBloomscapesStaticBody('dock-mistake-modal');
    const issueSourceUid = normalizeDockIssueSourceUniqueId(firstNonEmptyValue(item && item.DOCK_ISSUE_SOURCE_UID, issue && issue.issueSourceUniqueId, normalizedUid));
    document.getElementById('dock-mistake-uid').value = issueSourceUid;
    document.getElementById('dock-mistake-text').value = String(firstNonEmptyValue(issue && issue.issueNote, item && item.DOCK_ISSUE_NOTE, item && item.DOCK_NOTE, '')).trim();
    const qtyInput = document.getElementById('dock-mistake-qty');
    if (qtyInput) qtyInput.value = issue ? formatDockDisplayQty(issue.sourceQty) : '';
    dockMistakeModalSourceUid = issueSourceUid;
    clearDockMistakeIssuePhotoPreviewUrl();
    dockMistakeIssuePhotoLink = String(firstNonEmptyValue(issue && issue.issuePhotoLink, '') || '').trim();
    dockMistakeIssuePhotoName = String(firstNonEmptyValue(issue && issue.issuePhotoName, '') || '').trim();
    dockMistakeIssuePhotoPromise = null;
    dockMistakeIssuePhotoUploading = false;
    dockMistakeSelectionUids = new Set(getDockIssueAllocations(issueSourceUid).map((allocation) => String(allocation && allocation.altMasterUniqueId || '').trim()).filter(Boolean));
    const label = document.getElementById('dock-mistake-modal-label');
    if (label) label.innerText = item ? `${item.COMMONNAME || 'Dock Item'} - ${item.CONTSIZE || '-'} - ${item.LOCATIONCODE || 'No Loc'}` : '';
    syncDockMistakeMeasurementFields(item, issue);
    renderDockMistakeIssuePhotoPreview();
    renderDockMistakeModalOptions();
    setDockMistakeModalStep('details');
    modal.classList.remove('hidden');
    enhanceDetailMeasurementNaOptions(modal);
    prepareIosNativeDetailMeasurementInputs(modal);
}

function closeDockMistakeModal() {
    const modal = document.getElementById('dock-mistake-modal');
    if (detailMeasurementKeyboardTarget && detailMeasurementKeyboardTarget.closest && detailMeasurementKeyboardTarget.closest('#dock-mistake-modal')) {
        closeDetailMeasurementKeyboard(true, { blur: true });
    }
    if (modal) modal.classList.add('hidden');
    const uidInput = document.getElementById('dock-mistake-uid');
    const textInput = document.getElementById('dock-mistake-text');
    const qtyInput = document.getElementById('dock-mistake-qty');
    const specInput = document.getElementById('dock-mistake-spec');
    const caliperInput = document.getElementById('dock-mistake-caliper');
    const caliperWrap = document.getElementById('dock-mistake-container-caliper');
    const optionsEl = document.getElementById('dock-mistake-av-options');
    const summaryEl = document.getElementById('dock-mistake-selection-summary');
    if (uidInput) uidInput.value = '';
    if (textInput) textInput.value = '';
    if (qtyInput) qtyInput.value = '';
    if (specInput) specInput.value = '';
    if (caliperInput) caliperInput.value = '';
    if (caliperWrap) caliperWrap.classList.add('hidden');
    if (optionsEl) optionsEl.innerHTML = '';
    if (summaryEl) summaryEl.textContent = '0 selected';
    dockMistakeSelectionUids = new Set();
    dockMistakeCandidateRows = [];
    dockMistakeModalSourceUid = '';
    setDockMistakeModalStep('details');
    resetDockMistakeIssuePhotoState();
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('dock-mistake-modal');
    return false;
}
