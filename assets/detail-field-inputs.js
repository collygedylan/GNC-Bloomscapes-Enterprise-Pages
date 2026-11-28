/** @param {string} prefix Active editor field prefix. @returns {object} Spec and caliper values from the active editor. */
function getAvNoteSpecCaliperValues(prefix = '') {
    const normalizedPrefix = String(prefix || '').trim();
    const currentItem = activeItem || {};

    if (normalizedPrefix === 'req-') {
        const reqSpecEl = document.getElementById('req-spec');
        const reqCalEl = document.getElementById('req-caliper');
        return {
            spec: String((reqSpecEl && reqSpecEl.value) || getRequestActualSpecValue(currentItem) || '').trim(),
            caliper: String((reqCalEl && reqCalEl.value) || getRequestActualCaliperValue(currentItem) || '').trim()
        };
    }

    if (normalizedPrefix === 'global-') {
        return {
            spec: String(getRequestActualSpecValue(currentItem) || getMeasuredSpecInputValue(currentItem) || '').trim(),
            caliper: String(getRequestActualCaliperValue(currentItem) || getItemDisplayValue(currentItem, 'CALIPER', '') || '').trim()
        };
    }

    const specEl = document.getElementById(normalizedPrefix + 'spec');
    const calEl = document.getElementById(normalizedPrefix + 'caliper');
    return {
        spec: String((specEl && specEl.value) || getMeasuredSpecInputValue(currentItem) || '').trim(),
        caliper: String((calEl && calEl.value) || getItemDisplayValue(currentItem, 'CALIPER', '') || '').trim()
    };
}

/** @param {unknown} value Value to normalize. @returns {string} The normalized specification or range. */
function normalizeDetailSpecTextForSave(value = '') {
    const text = String(value || '')
        .replace(/\\+(?=[\'"])/g, '')
        .replace(/'?\s*\\+\s*(?=H\b)/gi, "' ")
        .trim()
        .replace(/\s+/g, ' ');
    const compact = text.replace(/\s+/g, '');
    const rangeMatch = compact.match(/^(\d{1,3}(?:\.\d+)?)-(\d{1,3}(?:\.\d+)?)(\d)$/);
    if (!rangeMatch) return text;
    const lower = rangeMatch[1];
    const upper = rangeMatch[2];
    const trailingDigit = rangeMatch[3];
    if (lower.startsWith(trailingDigit)) return `${lower}-${upper}`;
    return text;
}

/** @param {HTMLElement|null} input Detail editor input. @returns {boolean} Whether the measurement keypad owns this input. */
function shouldApplyDetailMeasurementReadonly(input = null) {
    if (!input) return false;
    return shouldPreferDetailMeasurementKeyboard() && !/(?:av-note|pick|comments)/i.test(input.id || '');
}

/** @param {unknown} value Value to normalize. @returns {string} Display text with escaped quotes restored. */
function normalizeDetailEvidenceText(value = '') {
    return String(value ?? '').replace(/\\+(?=['"])/g,'');
}

/** @param {Event} event User interaction. @returns {void} Hands typing back to the native field. */
function closeCustomKeyboardForNativeInput(event) {
    const target = event.target;
    if (!target?.closest?.('#view-detail')) return;
    const input = target.closest('input, textarea');
    const nativeText = input && isRequestDetailNativeTypingInput(input);
    const command = event.type === 'pointerdown'
        ? target.closest('button, a, label, select, [role="button"]') : null;
    if (detailMeasurementKeyboardTarget && (nativeText || command)) {
        if (!command?.contains(detailMeasurementKeyboardTarget)) {
            closeDetailMeasurementKeyboard(false,{blur:true});
        }
    }
    if (!nativeText || input.disabled || !canEditRowDetails(extractDetailPrefixFromInputId(input.id))) return;
    input.readOnly = false;
    input.inputMode = 'text';
}

/** @returns {void} Installs the shared field event listeners once. */
function installDetailNativeKeyboardHandoff() {
    document.addEventListener('pointerdown',closeCustomKeyboardForNativeInput,true);
    document.addEventListener('focusin',closeCustomKeyboardForNativeInput,true);
}
installDetailNativeKeyboardHandoff();

/** @param {HTMLElement|null} element Candidate input. @returns {boolean} Whether the field belongs to a native detail editor. */
function isRequestDetailNativeTypingInput(element = null) {
    return /(?:av-note|pick|comments)/i.test(element?.id || '');
}

/** @param {object} item Current physical inventory row. @returns {object} Current notes and measurements from the Suspend form. */
function getDockSuspendDcRequestFormValues(item = activeItem) {
            const draft = suspendTagFormDrafts.get(getSuspendTagFormDraftKey(item)) || {};
            const valueOf = (id) => {
                if (Object.prototype.hasOwnProperty.call(draft, id)) return normalizeDetailEvidenceText(normalizeQueueNoteText(draft[id]));
                const el = item === activeItem ? document.getElementById(id) : null;
                return el ? normalizeDetailEvidenceText(normalizeQueueNoteText(el.value)).trim() : '';
            };
            return {
                avNote: valueOf('req-av-note'),
                match: getEditableLocMatchPercentValue(valueOf('req-match')),
                spec: valueOf('req-spec'),
                caliper: valueOf('req-caliper'),
                pick: valueOf('req-pick'),
                comments: valueOf('req-comments')
            };
        }
