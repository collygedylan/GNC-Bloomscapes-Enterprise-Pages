function resolveExplicitDetailAvNote(note,prefix,options = {}) {
    if (note === '__CLEAR_AV_NOTE__' || note === '__SPEC_ONLY__'
        || !['req-','ssn-','lsn-','na-','flyer-'].includes(prefix)) {
        return buildSelectedAvNote(note,prefix,options);
    }
    return options.customText === true ? String(note || '').trim() : getAvNotePickerLabel(note);
}

function prepareAvNotePicker(prefix, options = {}) {
    const safePrefix = String(prefix || '');
    const safeOptions = options && typeof options === 'object' ? options : {};
    if (!safeOptions.inline && !safeOptions.fromDropdownButton && !safeOptions.fromRequestSheet) return;
    const avNoteContextItem = safePrefix === 'hold-release-' && holdReleasePromptItem ? holdReleasePromptItem : activeItem;
    if (!avNoteContextItem) return;
    const list = document.getElementById(safePrefix + 'av-dropdown-list');
    if (!list) return;
    const itemcodeKey = normalizeAvNoteItemcode(firstNonEmptyValue(avNoteContextItem.ITEMCODE, avNoteContextItem.itemcode, ''));
    const commonKey = String(firstNonEmptyValue(avNoteContextItem.COMMONNAME, avNoteContextItem.commonname, '') || '').trim().toUpperCase();
    const serverKey = `${itemcodeKey}|${commonKey}`;
    void ensureItemcodeAvNoteOptions(avNoteContextItem, () => {
        const currentItem = safePrefix === 'hold-release-' && holdReleasePromptItem ? holdReleasePromptItem : activeItem;
        const currentItemcode = normalizeAvNoteItemcode(firstNonEmptyValue(currentItem && currentItem.ITEMCODE, currentItem && currentItem.itemcode, ''));
        const currentCommonName = String(firstNonEmptyValue(currentItem && currentItem.COMMONNAME, currentItem && currentItem.commonname, '') || '').trim().toUpperCase();
        if (`${currentItemcode}|${currentCommonName}` !== serverKey || list.classList.contains('hidden')) return;
        avNoteRenderedKeys[safePrefix] = '';
        filterAvNotes(safePrefix, safeOptions);
    });
    return {safePrefix,safeOptions,avNoteContextItem,list,itemcodeKey,commonKey};
}

function cachedAvNotePickerMatches({safePrefix,avNoteContextItem,list,itemcodeKey,commonKey,inputVal}) {
    const preferenceKey=savedAvNotePreferenceKey(avNoteContextItem);
    const removed=readRemovedAvNoteSuggestions(preferenceKey);
    const cacheKey = `${itemcodeKey}::${commonKey}::${inputVal}::${document.getElementById(safePrefix+'spec')?.value || ''}::${list.dataset.avNotePresentation || ''}::${preferenceKey}::${JSON.stringify(removed)}`;
    let matchingNotes = avNoteFilterResultCache.get(cacheKey);
    if (!matchingNotes) {
        matchingNotes = getAvNotePickerLabels(avNoteContextItem).filter(note=>!removed.includes(note));
        if (inputVal) matchingNotes = matchingNotes.filter(n => String(n).toUpperCase().includes(inputVal));
        if (avNoteFilterResultCache.size >= 500) {
            avNoteFilterResultCache.delete(avNoteFilterResultCache.keys().next().value);
        }
        avNoteFilterResultCache.set(cacheKey, matchingNotes);
    }
    return {cacheKey,matchingNotes};
}

function restoreAvNotePickerFocus({shouldRestoreFocus,mobileLocked,scrollState,keyboardOwnsInput,inputEl,restoreStart,restoreEnd}) {
        if (!shouldRestoreFocus) {
            if (mobileLocked) restoreAvNoteScrollState(scrollState);
            return;
        }
        requestAnimationFrame(() => {
            if (keyboardOwnsInput) keepDetailMeasurementKeyboardAlive(inputEl, restoreStart, restoreEnd);
            else if (mobileLocked) preserveAvNoteTextFocus(inputEl, restoreStart, restoreEnd, { force: false });
            else restoreDetailMeasurementFieldFocus(inputEl, restoreStart, restoreEnd);
            if (mobileLocked) restoreAvNoteScrollState(scrollState);
        });
    }

function filterAvNotes(prefix, options = {}) {
    const prepared = prepareAvNotePicker(prefix,options);
    if (!prepared) return;
    const {safePrefix,safeOptions,avNoteContextItem,list,itemcodeKey,commonKey} = prepared;
    const inputEl = document.getElementById(safePrefix + 'av-note');
    if (!inputEl) return;
    const requestSheetSearch = requestAvNoteSheetState.prefix === safePrefix && document.body.classList.contains('request-av-note-sheet-open')
        ? document.getElementById('request-av-note-sheet-search')
        : null;
    const fromRequestSheet = safeOptions.fromRequestSheet === true || !!requestSheetSearch;
    const inputText = String(safeOptions.searchText !== undefined
        ? safeOptions.searchText
        : (requestSheetSearch ? requestSheetSearch.value : inputEl.value) || '').trim();
    const inputVal = safeOptions.showAll === true ? '' : inputText.toUpperCase();
    const keyboardOwnsInput = !fromRequestSheet && (detailMeasurementKeyboardTarget === inputEl || (inputEl.dataset && inputEl.dataset.detailMeasurementKeyboard === 'true'));
    const shouldRestoreFocus = !safeOptions.fromDropdownButton && !fromRequestSheet && (document.activeElement === inputEl || keyboardOwnsInput);
    const restoreStart = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : inputText.length;
    const restoreEnd = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : restoreStart;
    const scrollState = captureAvNoteScrollState(inputEl);
    const mobileLocked = !fromRequestSheet && (isMobileTextEntryPositionLocked(inputEl) || (shouldUseMobileTextEntryStabilizer() && document.activeElement === inputEl));
    const keepAvNoteFocus = () => restoreAvNotePickerFocus({shouldRestoreFocus,mobileLocked,scrollState,keyboardOwnsInput,inputEl,restoreStart,restoreEnd});
    const {cacheKey,matchingNotes} = cachedAvNotePickerMatches({safePrefix,avNoteContextItem,list,itemcodeKey,commonKey,inputVal});
    if (matchingNotes.length === 0) {
        avNoteRenderedKeys[safePrefix] = cacheKey;
        const emptyText = inputText
            ? `No saved AV notes match "${inputText.toUpperCase()}". Keep typing to use your custom note.`
            : 'No saved AV notes for this row. Type your own AV note above.';
        list.innerHTML = buildAvNoteSpecialOptions(safePrefix) + `<div class="av-note-dropdown-header">AV Note Options</div><div class="av-note-dropdown-empty">${escapeHtml(emptyText)}</div>`;
        list.classList.remove('hidden');
        setAvNoteDropdownExpanded(safePrefix, true);
        keepAvNoteFocus();
        return;
    }
    if (avNoteRenderedKeys[safePrefix] === cacheKey && !list.classList.contains('hidden')) {
        keepAvNoteFocus();
        return;
    }
    const renderedNotes = matchingNotes;
    const listLabel = inputVal ? `${matchingNotes.length} Matching AV Note${matchingNotes.length === 1 ? '' : 's'}` : `${matchingNotes.length} Saved AV Note${matchingNotes.length === 1 ? '' : 's'}`;
    const footerHtml = matchingNotes.length > renderedNotes.length
        ? `<div class="av-note-dropdown-footer">Showing first ${renderedNotes.length}. Type to narrow the list.</div>`
        : (inputText ? `<div class="av-note-dropdown-footer">Type anything above to use a custom AV note.</div>` : '');
    list.innerHTML = buildAvNoteSpecialOptions(safePrefix) + `<div class="av-note-dropdown-header">${escapeHtml(listLabel)}</div>` + renderedNotes.map(note=>renderSavedAvNoteOption(note,safePrefix)).join('') + footerHtml;
    avNoteRenderedKeys[safePrefix] = cacheKey;
    list.classList.remove('hidden');
    setAvNoteDropdownExpanded(safePrefix, true);
    keepAvNoteFocus();
}

function renderSavedAvNoteOption(note,prefix) {
    return `<div class="av-note-saved-row"><button type="button" class="av-note-dropdown-option" data-av-note-option="${escapeHtml(note)}" data-av-note-prefix="${escapeHtml(prefix)}" role="option" tabindex="-1" onmousedown="event.preventDefault()" onclick="return selectAvNote(this.dataset.avNoteOption || '',this.dataset.avNotePrefix || '',event)">${escapeHtml(note)}</button><button type="button" class="av-note-remove" data-note="${escapeHtml(note)}" data-prefix="${escapeHtml(prefix)}" aria-label="Remove saved note suggestion" title="Remove this suggestion for your account on this device" onmousedown="event.preventDefault()" onclick="return removeSavedAvNoteOption(this.dataset.note,this.dataset.prefix,event)">×</button></div>`;
}

function removeSavedAvNoteOption(note,prefix,event) {
    event?.preventDefault();event?.stopPropagation();
    const item=prefix==='hold-release-' && holdReleasePromptItem ? holdReleasePromptItem : activeItem;
    if (!removeSavedAvNoteSuggestion(item,note)) {
        showToast('Suggestion not removed','Device preferences could not be saved.');
        return false;
    }
    avNoteRenderedKeys[prefix]='';
    filterAvNotes(prefix,{fromDropdownButton:true,showAll:true});
    return false;
}
