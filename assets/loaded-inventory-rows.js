function publishLoadedInventoryLookups(res) {
    if (Object.hasOwn(res,'requestHistoryData')) {
        requestHistoryInventory = (res.requestHistoryData || []).map((item, idx) => normalizeRequestHistoryRow(item, idx)).filter(Boolean);
        requestHistoryInventoryById = rebuildInventoryByIdMap(requestHistoryInventory);
    }

    if (Object.hasOwn(res,'salesCreditsData')) {
        salesCreditRequestsInventory = (res.salesCreditsData || []).map((item, idx) => normalizeSalesCreditRequestRow(item, idx)).filter(Boolean);
        salesCreditRequestsById = rebuildInventoryByIdMap(salesCreditRequestsInventory);
    }

    if (Object.hasOwn(res,'inventoryEditRequestsData')) {
        inventoryEditRequestInventory = (res.inventoryEditRequestsData || []).map((item) => normalizeInventoryEditLiveRecord(item)).filter(Boolean);
    }

    if (Object.hasOwn(res,'growerScoutReportsData')) {
        growerScoutReportsInventory = (res.growerScoutReportsData || []).map((item, idx) => normalizeGrowerScoutReportRow(item, idx)).filter(Boolean);
        rebuildGrowerScoutIndexes();
    }

    if (Object.hasOwn(res,'growerScoutAssetsData')) {
        growerScoutAssetsInventory = (res.growerScoutAssetsData || []).map((item, idx) => normalizeGrowerScoutAssetRow(item, idx)).filter(Boolean);
        rebuildGrowerScoutIndexes();
    }

    if (Object.hasOwn(res,'warehouseAssignedItemsData')) {
        warehouseAssignedItemsInventory = enrichManagerAssignedPlantGroups(res.warehouseAssignedItemsData || []).filter(item => item && item.present_in_drive !== false).map((item, idx) => normalizeWarehouseAssignedItemRow(item, idx)).filter(Boolean);
        clearWarehouseAssignedItemCaches();
        rebuildWarehouseAssignedItemIndexes(true);
        invalidateManagerEvalReport2Cache();
        // Unassigned summaries are emitted only by completed manual sync.
    }
}

function publishLoadedOfficeInventory(res, hasMaster) {
    if (Object.hasOwn(res,'salesOfficeData') || (hasMaster && salesOfficeInventory.length)) {
        const salesOfficeSource = Object.hasOwn(res,'salesOfficeData') ? (res.salesOfficeData || []) : salesOfficeInventory;
        salesOfficeInventory = salesOfficeSource.map((item, idx) => {
            if (!item) return item;
            item.DOM_ID = 'so_' + (item.UNIQUE_ID || idx);
            return item;
        }).filter((item) => item && isEvalScopedDataRowVisibleToCurrentUser(item));
        syncRealtimeSalesOfficeRows();
    }

    if (Object.hasOwn(res,'flyerFolderRowsData')) {
        flyerFolderInventory = (res.flyerFolderRowsData || []).map((item, idx) => normalizeFlyerFolderRow(item, idx)).filter(Boolean);
        flyerFolderInventoryById = rebuildInventoryByIdMap(flyerFolderInventory);
    }
    if (hasMaster && flyerFolderInventory.length) {
        flyerFolderInventory.forEach((item) => hydrateFlyerFolderRowFromCurrentSource(item));
        flyerFolderInventoryById = rebuildInventoryByIdMap(flyerFolderInventory);
    }

    if (Object.hasOwn(res,'flyerFolderHistoryData')) {
        flyerFolderHistoryInventory = (res.flyerFolderHistoryData || []).map((item, idx) => normalizeFlyerFolderHistoryRow(item, idx)).filter(Boolean);
        flyerFolderHistoryInventoryById = rebuildInventoryByIdMap(flyerFolderHistoryInventory);
    }
}

let suspendSocDisplayIdentity = null;
const loadedSocHydrationReceipts = new WeakMap();

function getSuspendSocDisplayIdentity() {
    return JSON.stringify([getSupabaseReadIdentityScope(), appAccessSnapshotState.snapshot?.dataPermissionVersion || '']);
}

function getSuspendSocDisplayRows() {
    if (!canReadSuspendQueue() || suspendSocDisplayIdentity !== getSuspendSocDisplayIdentity()) return null;
    return socInventory;
}

function loadedSocHydrationKey(res) {
    if (!res._verifiedLiveSync || res._fromCache || !res._locOnHandReceiptRevision) return '';
    const owner=getSupabaseReadIdentityScope(), permission=res._locOnHandReceiptPermission;
    if (!permission || owner!==res._locOnHandReceiptScope || permission!==appAccessSnapshotState.snapshot?.dataPermissionVersion
        || hasProductionLiveSyncDraft() || confirmedDriveEvidenceRows.size || Object.keys(getPendingEditsCache()).length) return '';
    const master=getDatasetState('master'), revision=String(res._locOnHandReceiptRevision);
    if (!/^[1-9]\d*$/.test(revision) || master.fieldCoverage!=='full' || !master.fullLoaded
        || master.rowCompleteness!=='complete' || !master.liveVerifiedScope || master.liveVerifiedPermission!==permission
        || String(master.liveVerifiedRevision)!==revision) return '';
    return JSON.stringify([owner,permission,master.liveVerifiedScope,currentMasterPreparationSeasonKey(),revision]);
}

function publishLoadedSocRows(res,key) {
    const previous=loadedSocHydrationReceipts.get(socInventory);
    const incoming=Object.hasOwn(res,'socData');
    if (!incoming && key && previous?.key===key && previous.raw===socRawSourceRows
        && previous.count===socInventory.length) return;
    if (incoming) {
        socRawSourceRows = cloneDockSourceRows(res.socData || []);
        socRawSourceRowsReady = true;
        suspendSocDisplayIdentity = getSuspendSocDisplayIdentity();
    }
    const source = incoming ? cloneDockSourceRows(socRawSourceRows)
        : buildDockSourceRowsForMasterRefresh(socRawSourceRows,socInventory);
    socInventory = hydrateDockSourceRows(source);
}

function publishLoadedDockInventory(res, hasMaster) {
    const hasSoc=Object.hasOwn(res,'socData');
    const key=(hasSoc || hasMaster) ? loadedSocHydrationKey(res) : '';
    if (Object.hasOwn(res,'socData') || (hasMaster && socRawSourceRowsReady)) {
        publishLoadedSocRows(res,key);
    }
    if (Object.hasOwn(res,'suspendTagData') || (hasMaster && suspendTagRawSourceRowsReady && suspendTagInventoryScope === getSupabaseReadIdentityScope())) {
        if (Object.hasOwn(res,'suspendTagData')) {
            suspendTagRawSourceRows = cloneDockSourceRows(res.suspendTagData || []);
            suspendTagRawSourceRowsReady = true;
        }
        const suspendTagSource = Object.hasOwn(res,'suspendTagData') ? cloneDockSourceRows(suspendTagRawSourceRows)
            : buildDockSourceRowsForMasterRefresh(suspendTagRawSourceRows,
                suspendTagInventory, isDockSuspendDcRequestSource);
        suspendTagInventory = uniquePhysicalSuspendTags(hydrateDockSourceRows(suspendTagSource).filter(isDockSuspendDcRequestSource));
        suspendTagInventoryScope = getSupabaseReadIdentityScope();
    }
    suspendTagRawSourceRows = filterBloomscapesSuspendSnapshot(suspendTagRawSourceRows || [],res);
    suspendTagInventory = filterBloomscapesSuspendSnapshot(suspendTagInventory || [],res);
    const unfilteredCount=socInventory.length;
    socInventory = filterBloomscapesSuspendSnapshot(socInventory,res);
    if (key && socRawSourceRowsReady && socInventory.length===unfilteredCount
        && suspendSocDisplayIdentity===getSuspendSocDisplayIdentity()) {
        loadedSocHydrationReceipts.set(socInventory,{key,raw:socRawSourceRows,count:unfilteredCount});
    }
}

function publishLoadedReserveInventory(res, hasMaster) {
    if (Object.hasOwn(res,'reservesData') || (hasMaster && reservesInventory.length)) {
        const incomingReserveSource = Object.hasOwn(res,'reservesData') ? (res.reservesData || []) : reservesInventory;
        const keepExistingFullReserveWarm = !!res._fromCache && getDatasetState('reserves').fullLoaded && Array.isArray(reservesInventory) && reservesInventory.length > incomingReserveSource.length;
        const reserveSource = keepExistingFullReserveWarm ? reservesInventory : incomingReserveSource;
        const canUseFastReserveWarm = !!res._fromCache && Array.isArray(reserveSource) && reserveSource.length > 12000;
        reservesInventory = canUseFastReserveWarm
            ? buildReserveInventoryRowsFast(reserveSource)
            : reserveSource.map((item,idx)=>hydrateReserveInventoryRow(item, idx));
    }
}

function publishLoadedCustomerInventory(res) {
    if (Object.hasOwn(res,'customerRepMapData')) {
        document.getElementById('manager-customer-rep-map-root')?.dispatchEvent(new Event('mapping-revision'));
        customerRepMapRows = (res.customerRepMapData || []).map((item, idx) => {
            if (!item) return null;
            item.DOM_ID = 'crm_' + (item.UNIQUE_ID || idx);
            return item;
        }).filter(Boolean);
        requestModalCustomerOptionsCacheKey = '';
        requestModalCustomerOptionsReady = areRequestModalCustomerDatasetsReady();
        if (requestModalCustomerOptionsReady) buildRequestModalCustomerOptionsCache(true);
    }

    if (Object.hasOwn(res,'cavData')) {
        cavInventory = (res.cavData || []).map((item, idx) => normalizeCavInventoryRow(item, idx));
    }

    if (Object.hasOwn(res,'cavAvBlankKeysData')) {
        cavAvBlankKeyInventory = (res.cavAvBlankKeysData || []).map((item, idx) => normalizeCavInventoryRow(item, idx));
    }

    if (Object.hasOwn(res,'avHotPriceKeysData')) {
        normalizeAvHotPriceKeyRows(res.avHotPriceKeysData || []);
    }
}

function hydrateReserveInventoryRow(item, idx, resolveMaster = findLinkedMasterRow) {
    const reserveFieldKeys = Object.keys(item || {}).filter((key) => String(key || '').trim() !== '');
    item.DOM_ID='res_'+idx;
    item.UNIQUE_ID=item.UNIQUE_ID||'res_uid_'+idx;
    const masterItem=resolveMaster(item);
    item.CUSTOMERNAME=item.CUSTOMERNAME||item.CUSTOMER||'Unknown Customer';
    item.CONSIGNEENAME=item.CONSIGNEENAME||item.CONSIGNEE||'';
    item.SALESREPNAME=item.SALESREPNAME||item.SALESREP||item['SALES_REP']||'Unknown Rep';
    item.COMMONNAME=firstNonEmptyValue(item.COMMONNAME, item.DESCRIPTION, item.PLANT_NAME, item.ITEMCODE, 'Unknown');
    item.CONTSIZE=firstNonEmptyValue(item.CONTSIZE, item.ITEMSPEC, item.contsize, '-');
    item.LOCATIONCODE=firstNonEmptyValue(item.LOCATIONCODE, item.LOCATION, 'No Loc');
    item.ITEMCODE=firstNonEmptyValue(item.ITEMCODE, item.itemcode, '-');
    item.LOTCODE=firstNonEmptyValue(item.LOTCODE, item.lotcode, '-');
    item.PTRAVAILABLE=firstNonEmptyValue(item.PTRAVAILABLE, item.ptravailable, 0);
    item.SEASONSUPPLY=firstNonEmptyValue(item.SEASONSUPPLY, item.SEASON_SUPPLY, item.season_supply, 0);
    item.PRIORITY=firstNonEmptyValue(item.PRIORITY, item.priority, '-');
    if(masterItem){
        syncMasterFieldsToRequestRow(masterItem, item);
        item.APP_TAB_ASSIGNMENT = firstNonEmptyValue(item.APP_TAB_ASSIGNMENT, masterItem.APP_TAB_ASSIGNMENT);
    }
    repairDisplayFieldsOnRow(item);
    normalizeRowPhotoFields(item);
    item._reserveSourceFieldKeys = reserveFieldKeys;
    item._search=`${item.COMMONNAME||''} ${item.CUSTOMERNAME||''} ${item.ITEMCODE||''}`.toLowerCase();
    item._searchCandidates = null;
    item._searchPrimaryStarts = null;
    item._searchWordStarts = null;
    item._searchProfileWordStarts = null;
    return item;
}


function hydrateDockSourceRows(rows = [], resolveMaster = findLinkedMasterRow) {
    return rows.map(item => {
        normalizeSocDockRowAliases(item);
        const sourceUid = normalizeDockIssueSourceUniqueId(firstNonEmptyValue(item && item.DOCK_ISSUE_SOURCE_UID, item && item.UNIQUE_ID, item && item.unique_id, ''));
        const masterItem = resolveMaster(item);
        if (masterItem) {
            syncMasterFieldsToRequestRow(masterItem, item);
            item.APP_TAB_ASSIGNMENT = firstNonEmptyValue(item.APP_TAB_ASSIGNMENT, masterItem.APP_TAB_ASSIGNMENT);
            normalizeSocDockRowAliases(item);
        }
        stampDockIssueSourceIdentity(item, { sourceUid });
        normalizeRowPhotoFields(item);
        buildSearchIndex(item);
        return item;
    }).filter(item => isEvalScopedDataRowVisibleToCurrentUser(item));
}
