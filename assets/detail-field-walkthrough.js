function buildAvNoteSpecialOptions(prefix) {
    const spec=String(document.getElementById(prefix+'spec')?.value || '').trim();
    const button=(value,label)=>`<button type="button" class="av-note-dropdown-option" data-av-note-option="${value}" data-av-note-prefix="${escapeHtml(prefix)}" role="option" onpointerdown="return selectAvNote(this.dataset.avNoteOption,this.dataset.avNotePrefix,event,{fromPressStart:true})" ontouchstart="return selectAvNote(this.dataset.avNoteOption,this.dataset.avNotePrefix,event,{fromPressStart:true})" onmousedown="event.preventDefault()" onclick="return selectAvNote(this.dataset.avNoteOption,this.dataset.avNotePrefix,event)">${escapeHtml(label)}</button>`;
    return button('__SPEC_ONLY__',`✓ SPEC ONLY (${spec ? 'SPEC - '+spec : 'No AV Note'})`)+button('__CLEAR_AV_NOTE__','✕ Clear AV Note (Blank)');
}

function openInlineAvNoteList(prefix, options = {}) {
    if (!AV_NOTE_DROPDOWN_PREFIXES.includes(prefix) || !canEditRowDetails(prefix)) return false;
    const input=document.getElementById(getAvNoteInputIdForPrefix(prefix)),list=document.getElementById(getAvNoteDropdownListIdForPrefix(prefix));
    if (!input || !list || input.disabled) return false;
    if (requestAvNoteSheetState.prefix === prefix) closeRequestAvNoteSheet(list);
    input.readOnly=false;input.inputMode='text';list.dataset.avNotePresentation='inline';
    list.style.setProperty('position','relative','important');list.style.setProperty('inset','auto','important');
    list.style.setProperty('max-height','180px','important');list.style.setProperty('overflow-y','auto','important');
    const label=input.parentElement?.parentElement?.querySelector('label span');
    if(label)label.textContent=isSpecOnlyAvNoteContext(activeItem)?'AV NOTE (OPTIONAL — SPEC ONLY OK)':'AV Note';
    avNoteRenderedKeys[prefix]='';
    filterAvNotes(prefix,{...options,inline:true,showAll:options.searchText===undefined});
    return false;
}

function openAvNotePicker(prefix = '', event = null) {
    const safePrefix = String(prefix || '').trim();
    if (!AV_NOTE_DROPDOWN_PREFIXES.includes(safePrefix)) return false;
    if (event?.cancelable) event.preventDefault();
    event?.stopPropagation?.();
    if (!canEditRowDetails(safePrefix)) { showRowEditRestrictedToast(safePrefix); return false; }
    const input = document.getElementById(getAvNoteInputIdForPrefix(safePrefix));
    const list = document.getElementById(getAvNoteDropdownListIdForPrefix(safePrefix));
    if (!input || !list || input.disabled) return false;
    closeDetailMeasurementKeyboard(false, { blur:true });
    document.activeElement?.blur?.();
    return openInlineAvNoteList(safePrefix, {showAll:true});
}

function focusDetailMeasurementNextField(input = null) {
    const nextField = getNextDetailMeasurementField(input);
    if (!nextField) return false;
    if (isAvNoteInput(nextField) && AV_NOTE_DROPDOWN_PREFIXES.includes(String(nextField.id).replace(/av-note$/, ''))) {
        closeDetailMeasurementKeyboard(false, { blur:true });
        defaultDetailSpecNote(nextField);
        nextField.readOnly = false; nextField.inputMode = 'text';
        openInlineAvNoteList(String(nextField.id).replace(/av-note$/, ''));
        return true;
    }
    if (isDetailMeasurementKeyboardInput(nextField)) {
        openDetailMeasurementKeyboard(nextField, getDetailMeasurementKeyboardTypeForInput(nextField));
        return true;
    }
    detailMeasurementKeyboardResumeId = '';
    try {
        nextField.focus({ preventScroll: false });
    } catch {
        try { nextField.focus(); } catch { globalThis.safeIgnoreProbeError?.("focusDetailMeasurementNextField"); }
    }
    return true;
}

function selectAvNote(note, prefix, event = null, options = {}) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const normalizedPrefix = String(prefix || '').trim();
    const safeNote = String(note || '');
    const safeOptions = options && typeof options === 'object' ? options : {};
    if (avNoteOptionLastPressPrefix === normalizedPrefix
        && avNoteOptionLastPressNote === safeNote
        && Date.now() - avNoteOptionLastPressAt < 450) {
        return false;
    }
    if (!canEditRowDetails(normalizedPrefix)) {
        showRowEditRestrictedToast(normalizedPrefix);
        return false;
    }
    const input = document.getElementById(normalizedPrefix + 'av-note');
    const list = document.getElementById(normalizedPrefix + 'av-dropdown-list');
    if (!input) return false;
    const requestSheetWasOpen = document.body.classList.contains('request-av-note-sheet-open');
    const scrollState = requestSheetWasOpen ? null : captureAvNoteScrollState(input);
    avNoteOptionLastPressAt = Date.now();
    avNoteOptionLastPressPrefix = normalizedPrefix;
    avNoteOptionLastPressNote = safeNote;
    input.value = buildSelectedAvNote(safeNote, normalizedPrefix, safeOptions);
    input.dataset.explicitAvNote = '1';
    if (list) hideAvNoteDropdown(normalizedPrefix);
    closeDetailMeasurementKeyboard(false, { blur:true });
    document.activeElement?.blur?.();
    if (normalizedPrefix === 'hold-release-') {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
        restoreAvNoteScrollState(scrollState);
        return false;
    }
    const restoreAfterSave = () => {
        if (!requestSheetWasOpen && scrollState) restoreAvNoteScrollState(scrollState);
    };
    try {
        const result = saveData(false, normalizedPrefix, true, null, { explicit_av_note:true, explicitAvNoteValue:input.value, explicitAvNoteOwner:String(activeItem?.UNIQUE_ID || activeItem?.unique_id || '') });
        if (result && typeof result.finally === 'function') {
            result.finally(restoreAfterSave);
        } else {
            restoreAfterSave();
        }
    } catch (error) {
        restoreAfterSave();
        throw error;
    }
    if (!requestSheetWasOpen && scrollState) restoreAvNoteScrollState(scrollState);
    return false;
}

function defaultDetailSpecNote(input) {
    const prefix = input.id.replace(/av-note$/, '');
    const old = String(input.value || '').trim();
    if (old && !/^SPEC\s*-\s*/i.test(old)) return;
    const next = buildSelectedAvNote('__SPEC_ONLY__', prefix);
    if (input.value === next) return;
    input.value = next;
    input.dataset.explicitAvNote = '1';
    input.dispatchEvent(new Event('input', {bubbles:true}));
}
