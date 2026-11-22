function goBackUniversal() {
    if (typeof closeActiveModuleSubview === 'function' && closeActiveModuleSubview()) return false;
    const modalBack=getVisibleSecondaryBack(true);
    if (modalBack) { modalBack.click(); syncGlobalModalBack(); return false; }
    if (getManagerAssignedColumnState().editor) return closeManagerAssignedColumnFilter();
    const currentView=getCurrentVisibleViewId();
    if (isDrawerOpen()) { setMenuOpenState(false); updateGlobalBackButton(); return false; }
    if (currentView==='docks' && dockViewLevel>0) return backGlobalDocksSurface({restoreViewBack:restoreGlobalViewBack,currentView});
    if (typeof backBloomscapesActiveWorkBrowser==='function' && backBloomscapesActiveWorkBrowser()) return false;
    if (closeOpenInteractiveSurfaceForBack()) return false;
    if (typeof backBloomscapesDockCreditVault==='function' && backBloomscapesDockCreditVault()) return false;
    if (typeof backBloomscapesDepartmentWorkspace==='function' && backBloomscapesDepartmentWorkspace(currentView)) return false;
    if (currentView==='managers') return backGlobalManagersSurface({restoreViewBack:restoreGlobalViewBack,currentView});
    const parent=Array.isArray(viewHistoryStack)?viewHistoryStack.at(-1):null;
    if (currentView==='drive' && driveViewLevel===0 && parent?.directDriveEntry && restorePreviousViewFromHistory()) return false;
    if (currentView==='bunch-note') return backGlobalBunchNoteSurface({restoreViewBack:restoreGlobalViewBack,currentView});
    if (window.SalesWorkspace?.back()) { updateGlobalBackButton(); return false; }
    if (globalThis.LocationCode.back()) { updateGlobalBackButton(); return false; }
    const handler=resolveGlobalBackSurface(currentView);
    const result=handler?.({restoreViewBack:restoreGlobalViewBack,currentView});
    if (result!==undefined) return result;
    if (currentView && currentView!=='home') {
        if (!restoreGlobalViewBack()) fastBackHome();
    }
    return false;
}

function restoreGlobalViewBack() {
    const secondary=getVisibleSecondaryBack();
    if (secondary) { secondary.click(); updateGlobalBackButton(); return true; }
    return restorePreviousViewFromHistory();
}

function resolveGlobalBackSurface(view) {
    return {
        "managers":backGlobalManagersSurface,
        "bunch-note":backGlobalBunchNoteSurface,
        "home":backGlobalHomeSurface,
        "building":backGlobalBuildingSurface,
        "detail":backGlobalDetailSurface,
        "drive":backGlobalDriveSurface,
        "crop-roll":backGlobalCropRollSurface,
        "tasks":backGlobalTasksSurface,
        "docks":backGlobalDocksSurface,
        "moves":backGlobalMovesSurface,
        "request":backGlobalRequestSurface,
        "chat":backGlobalChatSurface,
        "po-management":backGlobalPoManagementSurface,
        "av":backGlobalAvSurface,
        "review":backGlobalReviewSurface,
        "move-up":backGlobalMoveUpSurface,
        "shear-list":backGlobalShearListSurface,
        "production-workflow":backGlobalProductionWorkflowSurface,
        "weather-hold":backGlobalWeatherHoldSurface,
        "sales-inventory":backGlobalSalesInventorySurface,
        "hl-order":backGlobalHlOrderSurface,
    }[view];
}
