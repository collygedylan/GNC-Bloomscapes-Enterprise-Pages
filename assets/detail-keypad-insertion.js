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

function pinActiveDetailField(input) {
    if (!input?.closest('#view-detail') || !input.isConnected) return;
    const viewport = window.visualViewport;
    const top = Math.max(viewport?.offsetTop || 0,
        document.querySelector('#app-top-chrome')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)
        - getDetailMeasurementKeyboardVisibleHeight() - 8;
    scrollDetailFieldWithinMainArea(input, top, bottom);
}

function initializePinnedDetailFields() {
    document.addEventListener('beforeinput', event => {
        const input = event.target;
        if (!input?.closest?.('#view-detail') || !event.inputType?.startsWith('insert')) return;
        if (String(input.value).trim().toUpperCase() === 'N/A') input.value = '';
    });
}

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
