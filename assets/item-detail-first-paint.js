/** @returns {string} Initially selected tab for the exact active item. */
function renderDetailShellView() {
    if (window.BunchQueueShell?.isDetailOpen()) return 'request';
    if (!activeItem) return 'overview';
    if (typeof mountBloomscapesStaticBody === 'function') mountBloomscapesStaticBody('view-detail');
    const detailShellStartedAt = beginInternalPerfMeasure();
    const detailSourceView = String(activeDetailSourceView || lastView || '').trim();
    const primaryDetailTab = runDetailPanelRender(() => configureDetailTabsForItem(activeItem, detailSourceView), ['drive','av'].includes(detailSourceView) ? 'location' : 'overview');
    const targetDetailTab = resolveVisibleDetailTab(primaryDetailTab, 'overview');
    const editPrefix = getDetailTabPrefix(targetDetailTab);
    if (typeof mountBloomscapesStaticBody === 'function') mountBloomscapesStaticBody('det-' + targetDetailTab + '-content');
    const summary = firstDetailSummary(detailSourceView);
    runDetailPanelRender(()=>summary(activeItem,detailSourceView));
    runDetailPanelRender(resetDetailDeferredMediaShell);
    if (detailSourceView.toLowerCase() === 'request') deferItemDetailRequestPhotos(activeItem,detailHydrationToken);
    runDetailPanelRender(() => { applyCameraPermissions(detailSourceView, activeItem); });
    runDetailPanelRender(() => { populatePrimaryDetailTabShell(targetDetailTab, detailSourceView, activeItem); });
    runDetailPanelRender(() => { switchDetailTab(targetDetailTab, { suppressScroll: true, skipHydrate: true }); });
    if (globalThis.isAvDetailSource?.(detailSourceView)) runDetailPanelRender(() => applyAvDetailReadOnlyState(detailSourceView));
    if (String(detailSourceView || '').trim().toLowerCase() === 'request') {
        setRequestDetailLoadState('');
        scheduleRequestDetailEntryVisible('shell', { skipOptionLoad: true });
    }
    if (editPrefix) runDetailPanelRender(() => applyProtectedEditState(editPrefix));
    recordInternalPerfDuration('detailShellDurations', detailShellStartedAt, detailSourceView || 'detail');
    return targetDetailTab;
}

function firstDetailSummary(source) {
    if (globalThis.isAvDetailSource?.(source)) return paintInitialAvDetailSummary;
    return ['drive','reports'].includes(source) ? paintItemDetailSummaryText : populateDetailSummaryValues;
}

function paintInitialAvDetailSummary(item, source) {
    paintItemDetailSummaryText(item,source);
    renderAvDetailHero(null,source);
    paintAvDetailExtraInfo(null,'',false);
    renderRequestDesiredPanel(item,source);
    renderManagerApprovalDetailWorkspace(item,source);
    syncDetailSharedPanelsVisibility();
}

function deferItemDetailRequestPhotos(item,token) {
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if (token !== detailHydrationToken || item !== activeItem || getCurrentVisibleViewId() !== 'detail') return;
        runDetailPanelRender(renderSavedPhotos);
    }));
}

/** @param {object} item Exact active inventory row. @param {string} sourceView Current detail source. @returns {void} Paints its visible summary fields. */
function paintItemDetailSummaryText(item,sourceView) {
    const fields = {
        'det-common':item.COMMONNAME, 'det-size':item.CONTSIZE, 'det-location':item.LOCATIONCODE,
        'ov-loc':item.LOCATIONCODE, 'ov-avail':item.PTRAVAILABLE ?? '0',
        'ov-item':item.ITEMCODE, 'ov-lot':item.LOTCODE, 'ov-qual':item.QUALITYCODE,
        'ov-prior':item.PRIORITY, 'ov-tag':getInventoryCardFieldTagColorDisplayValue(item),
        'ov-season':firstNonEmptyValue(item.SEASON_SUPPLY,item.SEASONSUPPLY,'0')
    };
    for (const [id,value] of Object.entries(fields)) {
        const field = document.getElementById(id);
        if (field) field.textContent = value === '' || value == null ? '--' : value;
    }
    mountPhDetailBay(document.getElementById('det-bay'),item,sourceView);
    const side = document.getElementById('det-pull-side');
    if (side) {
        const value = phInventoryPullSide(item);
        side.textContent = value ? 'Pull Side: '+value : '';
        side.hidden = !value;
    }
    const detail = document.getElementById('view-detail');
    detail?.classList.toggle('detail-request-mode',isRequestDetailItem(item,sourceView));
    detail?.classList.toggle('detail-av-mode',sourceView === 'av');
    scheduleDetailTitleRowFit(0);
}

/** @param {number} token Current detail hydration token. @returns {boolean} Whether a focused field deferred hydration. */
function deferFocusedItemDetailHydration(token) {
    if (!hasActiveTextEntryFocus()) return false;
    const input = document.activeElement;
    if (!input?.closest('#view-detail')) return false;
    input.addEventListener('blur',()=>{
        if (token === detailHydrationToken) scheduleDeferredDetailHydration(token,0);
    },{once:true});
    return true;
}

/** @returns {boolean} Suppresses the default action after committing the current measurement entry. */
function completeDetailMeasurementKeyboard() {
    clearDetailMeasurementKeyboardRepeat();
    clearDetailMeasurementKeyboardKeepAlive();
    triggerDetailKeyboardHaptic(12);
    const input = detailMeasurementKeyboardTarget;
    const next = input && !input.id.endsWith('-match') ? getNextDetailMeasurementField(input) : null;
    if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    if (next?.isConnected && isDetailMeasurementKeyboardInput(next)) {
        deferItemDetailMeasurementPaint(next);
        return openDetailMeasurementKeyboard(next,getDetailMeasurementKeyboardTypeForInput(next));
    }
    restoreDetailMeasurementInputReadonly(input);
    detailMeasurementKeyboardTarget = null;
    detailMeasurementKeyboardType = '';
    detailMeasurementKeyboardAvNoteMode = 'letters';
    detailMeasurementKeyboardChoiceOpen = '';
    const keyboard = document.getElementById('detail-measurement-keyboard');
    if (keyboard) keyboard.classList.add('hidden');
    clearDetailMeasurementKeyboardRenderSignature();
    clearDetailMeasurementKeyboardLayout();
    if (!focusDetailMeasurementNextField(input) && input) {
        try { input.blur(); } catch { globalThis.safeIgnoreProbeError?.("completeDetailMeasurementKeyboard"); }
        detailMeasurementKeyboardResumeId = '';
    }
    return false;
}


let pendingItemDetailMeasurementPaint;

/** @param {HTMLInputElement} input Current measurement field. @returns {boolean} Whether its keyboard paint is pending. */
function isItemDetailMeasurementPaintDeferred(input) {
    return !!input && pendingItemDetailMeasurementPaint?.input===input;
}

function deferItemDetailMeasurementPaint(input) {
    const pending = pendingItemDetailMeasurementPaint = {input};
    requestAnimationFrame(()=>{
        if (pendingItemDetailMeasurementPaint!==pending) return;
        pendingItemDetailMeasurementPaint=undefined;
        if (detailMeasurementKeyboardTarget===input && input.isConnected && isDetailMeasurementKeyboardRootVisible(input)) {
            if (document.activeElement===input) {
                handleMobileTextEntryFocusIn({target:input});
                setDetailEditingChromeState(true);
            }
            paintItemDetailMeasurementOpen(input,false);
        }
    });
}

/** @param {HTMLInputElement} input Target measurement field. @param {boolean} sameKeyboardOpen Whether the mounted keypad already owns that field. @returns {void} Opens or updates the keypad. */
function paintItemDetailMeasurementOpen(input,sameKeyboardOpen) {
    if (isItemDetailMeasurementPaintDeferred(input)) return false;
    if (sameKeyboardOpen) {
        updateDetailMeasurementKeyboardValuePreview();
        syncDetailMeasurementKeyboardLayout();
        return false;
    }
    renderDetailMeasurementKeyboard();
    bringDetailFieldIntoView(input,{reason:'keyboard-open',force:true,followUpDelay:isIOSDevice()?220:140});
    return false;
}


/** @param {FocusEvent} event Current viewport focus event. @returns {void} Synchronizes authorized text entry chrome. */
function syncMobileTextEntryOnViewportFocus(event) {
    const target = event?.target || document.activeElement;
    if (isItemDetailMeasurementPaintDeferred(target) || !isMobileTextEntryTarget(target)) return;
    if (!isMobileTextEntryPositionLocked(target)) beginMobileTextEntryStability(target);
    queueMobileTextEntryVisibilitySettle(target);
}

/** @param {VisualViewport} viewport Current viewport. @param {Function} scheduleShell Shared viewport refresh owner. @returns {void} Installs the text entry viewport listeners. */
function installMobileTextEntryViewportListeners(viewport,scheduleShell) {
    if (!viewport) return;
    const handleChange = reason => {
        const target = document.activeElement;
        if (!isMobileTextEntryTarget(target)) return;
        scheduleShell(reason);
        syncMobileTextEntryOnViewportFocus({target});
    };
    viewport.addEventListener('resize',()=>handleChange('visual-viewport-keyboard'),{passive:true});
    viewport.addEventListener('scroll',()=>handleChange('visual-viewport-scroll'),{passive:true});
}
