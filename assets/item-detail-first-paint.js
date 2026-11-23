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
    const summary = ['drive','reports'].includes(detailSourceView) ? paintItemDetailSummaryText : populateDetailSummaryValues;
    runDetailPanelRender(()=>summary(activeItem,detailSourceView));
    runDetailPanelRender(resetDetailDeferredMediaShell);
    if (detailSourceView.toLowerCase() === 'request') deferItemDetailRequestPhotos(activeItem,detailHydrationToken);
    runDetailPanelRender(() => { applyCameraPermissions(detailSourceView, activeItem); });
    runDetailPanelRender(() => { populatePrimaryDetailTabShell(targetDetailTab, detailSourceView, activeItem); });
    runDetailPanelRender(() => { switchDetailTab(targetDetailTab, { suppressScroll: true, skipHydrate: true }); });
    if (String(detailSourceView || '').trim().toLowerCase() === 'request') {
        setRequestDetailLoadState('');
        scheduleRequestDetailEntryVisible('shell', { skipOptionLoad: true });
    }
    if (editPrefix) runDetailPanelRender(() => applyProtectedEditState(editPrefix));
    recordInternalPerfDuration('detailShellDurations', detailShellStartedAt, detailSourceView || 'detail');
    return targetDetailTab;
}

function deferItemDetailRequestPhotos(item,token) {
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if (token !== detailHydrationToken || item !== activeItem || getCurrentVisibleViewId() !== 'detail') return;
        runDetailPanelRender(renderSavedPhotos);
    }));
}

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
    const detail = document.getElementById('view-detail');
    detail?.classList.toggle('detail-request-mode',isRequestDetailItem(item,sourceView));
    detail?.classList.toggle('detail-av-mode',sourceView === 'av');
    scheduleDetailTitleRowFit(0);
}

function deferFocusedItemDetailHydration(token) {
    if (!hasActiveTextEntryFocus()) return false;
    const input = document.activeElement;
    if (!input?.closest('#view-detail')) return false;
    input.addEventListener('blur',()=>{
        if (token === detailHydrationToken) scheduleDeferredDetailHydration(token,0);
    },{once:true});
    return true;
}

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


function syncMobileTextEntryOnViewportFocus(event) {
    const target = event?.target || document.activeElement;
    if (isItemDetailMeasurementPaintDeferred(target) || !isMobileTextEntryTarget(target)) return;
    if (!isMobileTextEntryPositionLocked(target)) beginMobileTextEntryStability(target);
    queueMobileTextEntryVisibilitySettle(target);
}

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
