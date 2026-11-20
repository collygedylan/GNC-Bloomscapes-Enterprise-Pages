async function prepareBloomscapesFarmPublication(raw,owner,assertCurrent) {
    const identity = JSON.parse(getSupabaseReadIdentityScope());
    identity[identity.length-1] = raw.farm;
    const prepared = await prepareProductionMasterSnapshot(raw.inventory,{identity:JSON.stringify(identity),assertCurrent,includeRawRows:false});
    assertCurrent();
    const inventory = prepared.payload.data;
    const master = preparedMasterRows.get(inventory);
    const indexes = master?.indexMaps;
    if (!indexes?.byItemCode || !indexes.byId) throw new Error('Farm inventory indexes were not prepared.');
    indexes.byItemPrefix = buildMasterInventoryPrefixIndex(indexes.byItemCode);
    indexes.lookup = window.AgMetricQueueInventory.createIndex(inventory.flatMap(row=>row.__physicalInventoryRows || [row]));
    publishEarlyBloomscapesInventory(raw,prepared);
    const resolveMaster = row=>resolveCanonicalInventoryTarget(row,indexes.byId,indexes.byItemCode);
    const socRaw = formatFetchedRows(raw.soc,'ph_soc_master');
    const soc = await prepareBloomscapesSupportRows(socRaw,'soc',resolveMaster,assertCurrent);
    const reserves = await prepareBloomscapesSupportRows(formatFetchedRows(raw.reserves,'ph_reserves'),'reserves',resolveMaster,assertCurrent);
    const assigned = formatFetchedRows(raw.assigned,'ph_inventory_row_assignments').map((row,index)=>normalizeWarehouseAssignedItemRow(row,index)).filter(Boolean);
    const assignedMap = buildBloomscapesAssignmentIndex(raw.farm,raw.assigned,raw.defaults);
    const defaultOwnersByCode = new Map(raw.defaults.map(row=>[buildManagerEvalAssignmentKey(row.itemcode_normalized),row]));
    const driveProjection = prepareBloomscapesDriveProjection(inventory);
    const reportTabs = collectInventoryReportTabs(inventory,raw.farm,resolveMaster);
    assertCurrent();
    return {owner,farm:raw.farm,revision:raw.revision,lastSyncRevisionAt:raw.lastSyncRevisionAt,inventory,soc,reserves,assigned,assignedMap,defaultOwnersByCode,
        purchaseOrders:raw.purchaseOrders || [],indexes,av:master.avOpenRows,socRaw,driveProjection,reportTabs,loadedAt:Date.now()};
}

async function prepareBloomscapesSupportRows(rows,kind,resolveMaster,assertCurrent) {
    const prepared = [], yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    for (let offset=0;offset<rows.length;offset+=128) {
        assertCurrent();
        const batch = rows.slice(offset,offset+128);
        const next = kind==='soc' ? hydrateDockSourceRows(cloneDockSourceRows(batch),resolveMaster)
            : batch.map((row,index)=>hydrateReserveInventoryRow(row,offset+index,resolveMaster));
        prepared.push(...next);
        const pause = yieldIfNeeded(batch.length);
        if (pause) await pause;
    }
    return prepared;
}

function publishEarlyBloomscapesInventory(raw,prepared) {
    if (raw.farm !== getBloomscapesFarm() || bloomscapesFarmState.readyFarm && bloomscapesFarmState.readyFarm!==raw.farm) return false;
    const context=getProductionLiveSyncContext();
    return applyColdOperationalDisplay('master',{payload:prepared.payload,
        rowCompleteness:'complete',rowCount:raw.inventory.length},context);
}
