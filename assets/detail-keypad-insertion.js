/** Apply a measurement-key press to the selected text and compute the new cursor.
 * @param {string} type
 * @param {object} selection
 * @param {string} key
 * @returns {object}
 */
function resolveDetailKeypadInsertion(type, { value, start, end }, key) {
    let inserted = String(key || '');
    const emptyMeasurement = ['', 'N/A', '-'].includes(value.trim().toUpperCase());
    if (['spec', 'caliper'].includes(type) && ['"', "'"].includes(inserted)
        && (emptyMeasurement || !/\d/.test(value.slice(0, start)))) {
        return { nextValue: value, nextCursor: start };
    }
    if (inserted && emptyMeasurement) {
        value = '';
        start = end = 0;
    }
    if (['spec', 'caliper'].includes(type) && ['H', 'W', 'x', 'HxW'].includes(inserted)) {
        const prefix = start > 0 && !/\s/.test(value[start - 1]) ? ' ' : '';
        const suffix = inserted === 'x' && !/^\s/.test(value.slice(end)) ? ' ' : '';
        inserted = prefix + inserted + suffix;
    }
    return { nextValue: value.slice(0, start) + inserted + value.slice(end), nextCursor: start + inserted.length };
}
/** Set the measurement input value and restore the requested cursor position.
 * @param {string} nextValue
 * @param {number|null} nextCursor
 * @returns {boolean}
 */
function updateDetailMeasurementKeyboardTargetValue(nextValue = '', nextCursor = null) {
    const input = detailMeasurementKeyboardTarget;
    if (!input) return false;
    const rawValue = String(nextValue || '');
    input.value = normalizeDetailMeasurementKeyboardValueForInput(input,rawValue);
    const cursor = Math.min(input.value.length,Math.max(0,getNormalizedDetailMeasurementCursor(input,rawValue,nextCursor)));
    if (input.dataset) {
        input.dataset.detailKeypadCursorStart = String(cursor);
        input.dataset.detailKeypadCursorEnd = String(cursor);
    }
    const preview = document.getElementById('detail-measurement-keyboard-value-preview');
    if (preview) preview.textContent = input.value || 'Type value...';
    const prefix = extractDetailPrefixFromInputId(input.id);
    if (input.id === prefix + 'match' && prefix !== 'dock-') calculateMatchQty(prefix);
    clearTimeout(input.__measurementDispatchTimer);
    const owner = getSupabaseReadIdentityScope(), rowKey = getDetailEvaluationDraftIdentity(activeItem);
    input.__measurementDispatchTimer = setTimeout(() => {
        if (!input.isConnected || owner !== getSupabaseReadIdentityScope() || rowKey !== getDetailEvaluationDraftIdentity(activeItem)) return;
        if (document.activeElement === input && detailMeasurementKeyboardTarget === input) {
            input.setSelectionRange?.(cursor,cursor);
        }
        if (shouldUseDebouncedDetailInputSave(input.id)) queueLagSensitiveInputSave(prefix,input.id);
        else dispatchDetailMeasurementKeyboardInput(input);
    },300);
    return false;
}
/** Vibrate briefly for a detail keyboard press when supported. @param {number} duration @returns {void} */
function triggerDetailKeyboardHaptic(duration = 8) {
    const now = Date.now();
    if (now - detailMeasurementKeyboardLastHapticAt < 14 || typeof navigator.vibrate !== 'function') return;
    detailMeasurementKeyboardLastHapticAt = now;
    requestAnimationFrame(() => {
        if (!document.hidden) triggerHaptic(duration >= 15 ? 'medium' : 'light');
    });
}

function pinActiveDetailField(input) {
    if (!input?.closest('#view-detail') || !input.isConnected) return;
    const viewport = window.visualViewport;
    const top = Math.max(viewport?.offsetTop || 0,
        document.querySelector('#app-top-chrome')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)
        - getDetailMeasurementKeyboardVisibleHeight() - 8;
    scrollDetailFieldWithinMainArea(input, top, bottom);
}
/** Register the focus and interaction handlers for pinned detail inputs. @returns {void} */
function initializePinnedDetailFields() {
    document.addEventListener('beforeinput', event => {
        const input = event.target;
        if (!input?.closest?.('#view-detail') || !event.inputType?.startsWith('insert')) return;
        if (String(input.value).trim().toUpperCase() === 'N/A') input.value = '';
    });
}
/** Scroll a focused field into view using its active detail panel.
 * @param {unknown} target
 * @param {object} options
 * @returns {void}
 */
function bringFocusedDetailFieldIntoView(target, options = {}) {
    if (!isDetailEditableField(target)) return;
    if (shouldSkipDetailFieldAutoScroll(target, options) && document.activeElement !== target) return;
    if (detailFieldBringIntoViewTimer) clearTimeout(detailFieldBringIntoViewTimer);
    const run = () => {
        if (!isDetailEditableField(target) || !target.isConnected) return;
        if (document.activeElement === target || target === detailMeasurementKeyboardTarget) {
            pinActiveDetailField(target);
            rememberDetailFieldAutoScroll(target);
            return;
        }
        const viewport = window.visualViewport;
        const bottom = (viewport?.height || window.innerHeight) + (viewport?.offsetTop || 0);
        scrollDetailFieldWithinMainArea(target, 64, bottom);
    };
    requestAnimationFrame(run);
    if (options.followUp === false || isDetailFieldAutoScrollTyping(options)) return;
    detailFieldBringIntoViewTimer = setTimeout(() => {
        detailFieldBringIntoViewTimer = null;
        run();
    }, Math.max(80, Number(options.followUpDelay) || 140));
}
