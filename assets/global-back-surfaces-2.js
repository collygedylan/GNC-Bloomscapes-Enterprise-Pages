function backGlobalRequestSurface({restoreViewBack,currentView}) {
    if (currentView === 'request') {
        if (activeReqTab === 'moves' && String(activeLocationMoveQueDetailUid || '').trim()) {
            closeApprovedMoveRequestCard();
            updateGlobalBackButton();
            return false;
        }
        if (activeReqTab === 'shear-list' && String(activeShearQueDetailId || '').trim()) {
            closeShearMoveTestRequestCard();
            updateGlobalBackButton();
            return false;
        }
        if (activeReqTab === 'reps') {
            if (requestViewLevel === 4) {
                backToRequestFolderList();
                updateGlobalBackButton();
                return false;
            }
            if (requestViewLevel === 3) {
                backToRequestConsigneeList();
                updateGlobalBackButton();
                return false;
            }
            if (requestViewLevel === 2) {
                backToRequestStatusList();
                updateGlobalBackButton();
                return false;
            }
            if (requestViewLevel === 1) {
                backToRequestRepList();
                updateGlobalBackButton();
                return false;
            }
            if (requestSalesRepsManagerMode) {
                closeManagerSalesRepsModule();
                return false;
            }
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalChatSurface({restoreViewBack,currentView}) {
    if (currentView === 'chat') {
        if (activeChatConversationId || chatComposeOpen) {
            chatComposeOpen = false;
            backToChatList();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalPoManagementSurface({restoreViewBack,currentView}) {
    if (currentView === 'po-management') {
        const section = normalizePoManagementSection(poManagementState && poManagementState.section);
        if (section !== 'home') {
            goBackPoManagementDrilldown();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalAvSurface({restoreViewBack,currentView}) {
    if (currentView === 'av') {
        if (activeAVTab !== 'reserves' && avOpenLevel > 0) {
            avOpenLevel = Math.max(0, Math.min(3, avOpenLevel) - 1);
            selectedAvOpenSeason = null;
            selectedAvOpenLot = null;
            if (avOpenLevel < 2) selectedAvOpenSize = null;
            if (avOpenLevel < 1) selectedAvOpenName = null;
            avResolvedBaseStateKey = '';
            avResolvedBaseStateCache = null;
            scheduleAVRender(0);
            updateGlobalBackButton();
            return false;
        }
        if (activeAVTab === 'reserves') {
            if (avResLevel === 2) {
                avResLevel = 1;
                selectedAvResDriveUid = null;
                clearSelectedAvReserveCustomerCardState();
                scheduleAVRender(0);
                updateGlobalBackButton();
                return false;
            }
            if (avResLevel === 1) {
                avResLevel = 0;
                selectedAvResDriveUid = null;
                selectedAvResItemCode = null;
                selectedAvResName = null;
                selectedAvResSize = null;
                clearSelectedAvReserveCustomerCardState();
                scheduleAVRender(0);
                updateGlobalBackButton();
                return false;
            }
            if (selectedAvResRep) {
                clearSelectedAvResRep();
                updateGlobalBackButton();
                return false;
            }
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalReviewSurface({restoreViewBack,currentView}) {
    if (currentView === 'review') {
        if (typeof reviewViewLevel !== 'undefined' && reviewViewLevel > 0) {
            backReviewView();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalMoveUpSurface({restoreViewBack,currentView}) {
    if (currentView === 'move-up') {
        if (typeof moveUpViewLevel !== 'undefined' && moveUpViewLevel > 0) {
            backMoveUpView();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalShearListSurface({restoreViewBack,currentView}) {
    if (currentView === 'shear-list') {
        if (shearListState && String(shearListState.activeTab || 'open').toLowerCase() === 'drive' && shearListState.driveDrillLevel === 'rows' && String(shearListState.selectedDriveItemKey || '').trim()) {
            backShearDriveItems();
            updateGlobalBackButton();
            return false;
        }
        if (shearListState && String(shearListState.activeTab || 'open').toLowerCase() !== 'drive' && shearListState.drillLevel && shearListState.drillLevel !== 'blocks') {
            backShearListDrill();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalProductionWorkflowSurface({restoreViewBack,currentView}) {
    if (currentView === 'production-workflow') {
        if (productionWorkflowState && String(productionWorkflowState.activeTab || 'drive').toLowerCase() === 'drive' && productionWorkflowState.driveDrillLevel === 'rows' && String(productionWorkflowState.selectedDriveItemKey || '').trim()) {
            backProductionWorkflowItems();
            updateGlobalBackButton();
            return false;
        }
        if (productionWorkflowState && String(productionWorkflowState.activeTab || 'drive').toLowerCase() === 'list' && productionWorkflowState.drillLevel && productionWorkflowState.drillLevel !== 'blocks') {
            backProductionWorkflowListDrill();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalWeatherHoldSurface({restoreViewBack,currentView}) {
    if (currentView === 'weather-hold') {
        if (weatherHoldState && weatherHoldState.inventoryDrillLevel === 'rows' && String(weatherHoldState.selectedInventoryItemKey || '').trim()) {
            backWeatherHoldInventoryItems();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalSalesInventorySurface({restoreViewBack,currentView}) {
    if (currentView === 'sales-inventory') {
        if (inventoryMainTab === 'production' && productionInventoryTab === 'counting' && spreadCountState && spreadCountState.drillLevel && spreadCountState.drillLevel !== 'blocks') {
            backSpreadCountDrill();
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}

function backGlobalHlOrderSurface({restoreViewBack,currentView}) {
    if (currentView === 'hl-order') {
        if (hlOrderDetailKey || hlOrderTrackingId) {
            backHlOrder();
            updateGlobalBackButton();
            return false;
        }
        if (hlOrderTab === 'cart') {
            setHlOrderTab('needed');
            updateGlobalBackButton();
            return false;
        }
        if (restoreViewBack()) return false;
        fastBackHome();
        return false;
    }
}
