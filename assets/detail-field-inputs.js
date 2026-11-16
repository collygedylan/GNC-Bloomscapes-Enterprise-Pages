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

function shouldApplyDetailMeasurementReadonly(input = null) {
    if (!input) return false;
    return shouldPreferDetailMeasurementKeyboard() && !/(?:av-note|pick|comments)/i.test(input.id || '');
}

function dismissMobilePushEnablePrompt() {
    hideMobilePushEnablePrompt();
}

function normalizeDetailEvidenceText(value = '') {
    return String(value ?? '').replace(/\\+(?=['"])/g,'');
}

function closeCustomKeyboardForNativeInput(event) {
    const input = event.target?.closest?.('input, textarea');
    if (!input || !/(?:av-note|pick|comments)/i.test(input.id || '')) return;
    if (detailMeasurementKeyboardTarget) closeDetailMeasurementKeyboard(true,{blur:true});
    input.readOnly = false;
    input.inputMode = 'text';
}

function installDetailNativeKeyboardHandoff() {
    document.addEventListener('pointerdown',closeCustomKeyboardForNativeInput,true);
    document.addEventListener('focusin',closeCustomKeyboardForNativeInput,true);
}
installDetailNativeKeyboardHandoff();

function isRequestDetailNativeTypingInput(element = null) {
    return /(?:av-note|pick|comments)/i.test(element?.id || '');
}

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

