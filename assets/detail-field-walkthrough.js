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
    const prefix = String(input?.id || '').replace(/match$/, '');
    if (input?.id.endsWith('-match') && AV_NOTE_DROPDOWN_PREFIXES.includes(prefix)) {
        const avNote = document.getElementById(getAvNoteInputIdForPrefix(prefix));
        if (avNote && !avNote.disabled) return openDetailAvNoteAfterMatch(input,avNote,prefix);
    }
    const nextField = getNextDetailMeasurementField(input);
    if (!nextField) return false;
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

function openDetailAvNoteAfterMatch(input,avNote,prefix) {
    closeDetailMeasurementKeyboard();
    input.blur();
    defaultDetailSpecNote(avNote);
    openInlineAvNoteList(prefix,{showAll:true});
    scrollDetailAvNoteAndAction(avNote,document.getElementById(prefix+'btn-save-complete'));
    return true;
}

function scrollDetailAvNoteAndAction(input,action) {
    input.scrollIntoView?.({block:'nearest',behavior:'instant'});
    if (!action?.getBoundingClientRect) return;
    const viewBottom = (window.visualViewport?.height || window.innerHeight) + (window.visualViewport?.offsetTop || 0);
    const top = document.getElementById('app-top-chrome')?.getBoundingClientRect().bottom || 0;
    const actionBottom = action.getBoundingClientRect().bottom;
    const inputTop = input.getBoundingClientRect().top;
    if (actionBottom > viewBottom - 32 && actionBottom - inputTop <= viewBottom - top - 48) {
        const scroll = document.getElementById('main-scroll-area');
        if (scroll) scroll.scrollTop += actionBottom - viewBottom + 44;
        else action.scrollIntoView({block:'nearest',behavior:'instant'});
    }
}

function selectAvNote(note, prefix, event = null, options = {}) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (window.PointerEvent && ['pointerdown','touchstart','mousedown'].includes(event?.type)
        && event.target?.closest?.('#view-detail')) return false;
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
    input.value = resolveExplicitDetailAvNote(safeNote,normalizedPrefix,safeOptions);
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
    saveSelectedDetailAvNote(normalizedPrefix,input.value,scrollState);
    return false;
}

function saveSelectedDetailAvNote(prefix,value,scrollState) {
    const restore = () => {
        if (scrollState) restoreAvNoteScrollState(scrollState);
    };
    try {
        const owner = String(activeItem?.UNIQUE_ID || activeItem?.unique_id || '');
        saveData(false,prefix,true,null,{
            explicit_av_note:true,explicitAvNoteValue:value,explicitAvNoteOwner:owner
        });
    } finally {
        restore();
    }
}

function defaultDetailSpecNote(input) {
    const prefix = input.id.replace(/av-note$/, '');
    const old = String(input.value || '').trim();
    if (input.dataset.explicitAvNote === '1' || (old && !/^SPEC\s*-\s*/i.test(old))) return;
    const next = buildSelectedAvNote('__SPEC_ONLY__', prefix);
    input.value = next;
}
