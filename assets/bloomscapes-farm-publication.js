async function prepareBloomscapesFarmPublication(raw,owner,assertCurrent,checkpoint,publishEarly=true) {
    const identity = JSON.parse(getSupabaseReadIdentityScope());
    identity[identity.length-1] = raw.farm;
    const prepared = await prepareProductionMasterSnapshot(raw.inventory,{identity:JSON.stringify(identity),assertCurrent,checkpoint,includeRawRows:false});
    assertCurrent();
    if (checkpoint) await checkpoint();
    const inventory = prepared.payload.data;
    const master = preparedMasterRows.get(inventory);
    const indexes = master?.indexMaps;
    if (!indexes?.byItemCode || !indexes.byId) throw new Error('Farm inventory indexes were not prepared.');
    indexes.byItemPrefix = buildMasterInventoryPrefixIndex(indexes.byItemCode);
    indexes.lookup = window.AgMetricQueueInventory.createIndex(inventory.flatMap(row=>row.__physicalInventoryRows || [row]));
    if (publishEarly) publishEarlyBloomscapesInventory(raw,prepared);
    const resolveMaster = row=>resolveCanonicalInventoryTarget(row,indexes.byId,indexes.byItemCode);
    const socRaw = [], reservesRaw = [];
    const soc = await prepareBloomscapesSupportRows(raw.soc,'soc',resolveMaster,assertCurrent,checkpoint,socRaw);
    const reserves = await prepareBloomscapesSupportRows(raw.reserves,'reserves',resolveMaster,assertCurrent,checkpoint,reservesRaw);
    if (checkpoint) await checkpoint();
    const {assigned,assignedMap,defaultOwnersByCode} = prepareBloomscapesFarmOwners(raw);
    const driveProjection = prepareBloomscapesDriveProjection(inventory);
    const reportTabs = collectInventoryReportTabs(inventory,raw.farm,resolveMaster);
    assertCurrent();
    return {owner,farm:raw.farm,revision:raw.revision,lastSyncRevisionAt:raw.lastSyncRevisionAt,inventory,soc,reserves,assigned,assignedMap,defaultOwnersByCode,
        cav:raw.cav,purchaseOrders:raw.purchaseOrders || [],owners:raw.owners,indexes,av:master.avOpenRows,
        socRaw,reservesRaw,driveProjection,reportTabs,loadedAt:Date.now()};
}

function prepareBloomscapesFarmOwners(raw) {
    const defaults = raw.owners ? expandBloomscapesOwnerDefaults(raw.owners) : raw.defaults;
    const overrides = raw.owners ? expandBloomscapesOwnerOverrides(raw.owners) : raw.assigned;
    const assignedMap = buildBloomscapesAssignmentIndex(raw.farm,overrides,defaults);
    const defaultOwnersByCode = new Map(defaults.map(row=>[buildManagerEvalAssignmentKey(row.itemcode_normalized),row]));
    const assigned = raw.owners ? deriveBloomscapesFarmAssignedRows(raw.inventory,assignedMap,defaultOwnersByCode)
        : formatFetchedRows(raw.assigned,'ph_inventory_row_assignments').map(normalizeWarehouseAssignedItemRow).filter(Boolean);
    return {assigned,assignedMap,defaultOwnersByCode};
}

function publishVerifiedBloomscapesOwners(farm,owners,revision) {
    if (farm!==getBloomscapesFarm()) return;
    const state = getManagerAssignedColumnState();
    const defaults = expandBloomscapesOwnerDefaults(owners);
    state.defaultOwnersByCode = new Map(defaults.map(row=>[buildManagerEvalAssignmentKey(row.itemcode_normalized),row]));
    state.itemcodeDefaultOwners = state.defaultOwnersByCode;
    state.defaultOwnersCheckedAt = Date.now();
    clearWarehouseAssignedItemCaches();
    publishBloomscapesOwnerIndex(state,owners);
    state.bloomscapesOwners.receipt = {owners,revision,permission:getPassiveNativeReadPermissionVersion()};
}

function reusableBloomscapesOwnerReceipt(farm,revision) {
    const saved = getManagerAssignedColumnState().bloomscapesOwners;
    const receipt = saved?.receipt;
    if (saved?.farm===farm && saved.owner===getSupabaseReadIdentityScope() && receipt?.revision===revision
        && receipt.permission===getPassiveNativeReadPermissionVersion()) return receipt.owners;
}

function deriveBloomscapesFarmAssignedRows(inventory,index,defaults) {
    return inventory.map((row,position)=>{
        const ledger = defaults.get(buildManagerEvalAssignmentKey(row.itemcode || row.ITEMCODE));
        const assignedto = resolveIndexedBloomscapesOwner(row,index);
        const scope = getBloomscapesIndexedOwnerOverride(row,index);
        return normalizeWarehouseAssignedItemRow({
            ...row,master_unique_id:row.unique_id || row.UNIQUE_ID,assignedto,
            default_assignedto:ledger?.assignedto ?? '',default_revision:ledger?.revision ?? 0,
            zone_override_active:!!scope,assignment_reason:scope ? (row.assignment_reason || 'zone_zoe') : assignedto ? 'itemcode_default' : 'unassigned'
        },position);
    }).filter(Boolean);
}

async function prepareBloomscapesSupportRows(rows,kind,resolveMaster,assertCurrent,checkpoint,rawProjection) {
    const prepared = [], yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    const table=kind==='soc' ? 'ph_soc_master' : 'ph_reserves';
    for (let offset=0;offset<rows.length;offset+=128) {
        assertCurrent();
        const batch = formatFetchedRows(rows.slice(offset,offset+128),table,offset);
        if (rawProjection) rawProjection.push(...batch);
        const next = kind==='soc' ? hydrateDockSourceRows(cloneDockSourceRows(batch),resolveMaster)
            : batch.map((row,index)=>hydrateReserveInventoryRow(row,offset+index,resolveMaster));
        prepared.push(...next);
        const pause = yieldIfNeeded(batch.length);
        if (pause) {
            await pause;
            if (checkpoint) await checkpoint();
        }
    }
    return prepared;
}

function publishEarlyBloomscapesInventory(raw,prepared) {
    if (raw.farm !== getBloomscapesFarm() || bloomscapesFarmState.readyFarm && bloomscapesFarmState.readyFarm!==raw.farm) return false;
    const context=getProductionLiveSyncContext();
    return applyColdOperationalDisplay('master',{payload:prepared.payload,
        rowCompleteness:'complete',rowCount:raw.inventory.length},context);
}
