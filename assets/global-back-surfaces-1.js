function backGlobalManagersSurface({currentView}) {
    if (currentView === 'managers') {
        if (getActiveBloomscapesUserDirectory()?.back()) return false;
        if (!hasDirectManagerUserDirectory() && typeof getManagerTableManagementKey === 'function' && ((activeHomeTab === 'table-management' && managerTableManagementSelection) || getManagerTableManagementKey(activeHomeTab))) {
            if (globalThis.GncNurseryTables?.back?.()) { updateGlobalBackButton(); return false; }
            openManagerTableManagement(); updateGlobalBackButton(); return false;
        }
        if (activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW && backEvalAggregateDashboard()) { updateGlobalBackButton(); return false; }
        if (activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW && !isEvalAggregateDashboardVisible()
            && (managerEvalReport2DetailItemKey || managerEvalReport2BrowseMode === 'location' && managerEvalReport2DrillLevel > 0)) {
            backManagerEvalReport2Drill(); updateGlobalBackButton(); return false;
        }
        const quickAccessBack = typeof quickAccessNestedBackState !== 'undefined' ? quickAccessNestedBackState : null;
        if (quickAccessBack?.parent === 'managers'
            && quickAccessBack.account === String(currentUser || '').trim().toLowerCase()
            && quickAccessBack.tab === String(activeHomeTab || '').trim().toLowerCase()) {
            quickAccessNestedBackState = null;
            if (restorePreviousViewFromHistory()) return false;
            fastBackToView(quickAccessBack.origin || 'home', { fromHistory: true });
            return false;
        }
        if (String(activeHomeTab || '').trim().toLowerCase() !== 'dashboard') return openManagersModules();
        fastBackHome();
        return false;
    }
}

function backGlobalBunchNoteSurface({restoreViewBack,currentView}) {
    if (currentView === 'bunch-note') {
        if (globalThis.BunchNote.back()) updateGlobalBackButton();
        else if (!restoreViewBack()) fastBackHome();
        return false;
    }
}

function backGlobalHomeSurface({currentView}) {
    if (currentView === 'home' && shouldShowHomeProductivityBackButton()) {
        backToProductivityUserList();
        return false;
    }
}

function backGlobalBuildingSurface({currentView}) {
    if (currentView === 'building' && selectedBuildingGroupKey) {
        closeBuildingGroup();
        updateGlobalBackButton();
        return false;
    }
}

function backGlobalDetailSurface({currentView}) {
    if (currentView === 'detail') {
        goBackFromDetail();
        return false;
    }
}

function backGlobalDriveSurface({restoreViewBack,currentView}) {
    if (currentView === 'drive') {
        if (activeDriveTab === 'name') {
            if (driveViewLevel >= 4 && selectedDriveName && selectedDriveSize && selectedDriveSeason) {
                backToDrivePrograms();
                updateGlobalBackButton();
                return false;
            }
            if (driveViewLevel >= 3 && selectedDriveName && selectedDriveSize) {
                backToDriveSeasons();
                updateGlobalBackButton();
                return false;
            }
            if (driveViewLevel >= 2 && selectedDriveName) {
                backToDriveSizes();
                updateGlobalBackButton();
                return false;
            }
            if (driveViewLevel >= 1 && selectedDriveName) {
                backToDriveNames();
                updateGlobalBackButton();
                return false;
            }
        }
        if (activeDriveTab === 'loc') {
            if (driveViewLevel >= 2 && selectedDriveLoc) {
                backToDriveLocations();
                updateGlobalBackButton();
                return false;
            }
            if (driveViewLevel >= 1 && selectedDriveBlock) {
                backToDriveBlocks();
                updateGlobalBackButton();
                return false;
            }
        }
        if (hasActiveDriveSearchTerm()) {
            clearDriveSearch();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalCropRollSurface({restoreViewBack,currentView}) {
    if (currentView === 'crop-roll') {
        if (typeof getCropRollActiveViewLevel === 'function' && getCropRollActiveViewLevel() >= 2) {
            backCropRollSy27ToLocations();
            updateGlobalBackButton();
            return false;
        }
        if (typeof getCropRollActiveViewLevel === 'function' && getCropRollActiveViewLevel() >= 1) {
            backCropRollSy27ToBlocks();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalTasksSurface({restoreViewBack,currentView}) {
    if (currentView === 'tasks') {
        if (activeTaskTab === 'flyer' && taskViewLevel > 0) {
            backToFlyerFolderList();
            updateGlobalBackButton();
            return false;
        }
        if (activeTaskTab === 'endcap' && taskViewLevel > 0) {
            taskViewLevel = 0;
            selectedEndCapFolder = null;
            scheduleTasksRender(0);
            updateGlobalBackButton();
            return false;
        }
        if (taskViewLevel === 2) {
            backToTaskLocationList();
            updateGlobalBackButton();
            return false;
        }
        if (taskViewLevel === 1) {
            backToTaskBlockList();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalDocksSurface({restoreViewBack,currentView}) {
    if (currentView === 'docks') {
        if (dockViewMode !== 'docks') {
            if (selectedDockIssueUid) {
                selectedDockIssueUid = null;
                selectedDockIssueAllocationId = '';
                scheduleDocksRender(0);
                updateGlobalBackButton();
                return false;
            }
            setDockViewMode('docks');
            updateGlobalBackButton();
            return false;
        }
        if (dockViewLevel === 2) {
            dockViewLevel = 1;
            selectedDockStop = null;
            scheduleDocksRender(0);
            updateGlobalBackButton();
            return false;
        }
        if (dockViewLevel === 1) {
            resetDockView();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalMovesSurface({restoreViewBack,currentView}) {
    if (currentView === 'moves') {
        if (activeMovesTab === 'main' && movesViewLevel >= 2) {
            backToMovesLocations();
            updateGlobalBackButton();
            return false;
        }
        if (activeMovesTab === 'main' && movesViewLevel === 1) {
            backToMovesBlocks();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}
