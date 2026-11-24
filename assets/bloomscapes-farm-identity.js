
function bloomscapesRowFarm(row,fallback='10') {
    const raw = row?.farm_code || row?.FARM_CODE || row?.warehouse_id || row?.WAREHOUSE_ID || row?.WAREHOUSEI || row?.warehousei || row?.WAREHOUSEID || row?.warehouseid || fallback;
    const code = String(raw).split('-')[0];
    return ({'10':'10-PH','60':'60-HL','20':'20-TX','40':'40-NC'})[code] || String(raw);
}

function bloomscapesOwnerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\.+$/,'');
}

function bloomscapesOwnerValue(row) {
    const value = normalizeEvalAssignableUser(row.effective_worker_username ?? row.default_owner_username ?? row.effective_worker ?? row.assignedto ?? row.ASSIGNEDTO ?? row.default_owner ?? row.eval_owner ?? row.assigned_to ?? row.eval_user ?? row.EFFECTIVE_WORKER_ID ?? '');
    return ['none','null','unassigned','n_a'].includes(value) ? '' : value;
}

function bloomscapesAssignmentBlock(location) {
    return location.split('.').slice(0, 2).join('.');
}

function expandBloomscapesOwnerDefaults(snapshot) {
    return snapshot.defaults.flatMap(([owner,revision,plantGroup,codes])=>codes.map(code=>({
        farm_code:snapshot.farm,itemcode:code,itemcode_normalized:code,revision,
        assignedto:owner,default_owner_username:owner,plant_group_code:plantGroup
    })));
}

function expandBloomscapesOwnerOverrides(snapshot) {
    const {farm,blocks,overrides} = snapshot;
    return [
        ...blocks.map(([locationcode,assignedto])=>({farm_code:farm,locationcode,assignedto,assignment_reason:'zone_zoe'})),
        ...overrides.map(([unique_id,itemcode,locationcode,assignedto,assignment_reason])=>({
            farm_code:farm,master_unique_id:unique_id,itemcode,locationcode,assignedto,assignment_reason,zone_override_active:true
        }))
    ];
}

function buildBloomscapesAssignmentIndex(farm, rows, defaults) {
    const index = {farm, location:new Map(), block:new Map(), item:new Map()};
    for (const row of defaults) {
        if (bloomscapesRowFarm(row) !== farm) continue;
        const code = buildManagerEvalAssignmentKey(row.itemcode_normalized || row.itemcode || row.ITEMCODE);
        if (code) index.item.set(code, bloomscapesOwnerValue({assignedto:row.default_owner_username ?? row.assignedto}));
    }
    for (const row of rows) {
        if (bloomscapesRowFarm(row) === farm) rememberBloomscapesAssignment(index, row);
    }
    return index;
}

function rememberBloomscapesAssignment(index, row) {
    const code = buildManagerEvalAssignmentKey(row.itemcode_normalized || row.itemcode || row.ITEMCODE);
    const location = bloomscapesOwnerCode(row.locationcode || row.LOCATIONCODE);
    const owner = bloomscapesOwnerValue(row);
    const reason = row.assignment_reason || row.ASSIGNMENT_REASON;
    if (owner && location && reason === 'zone_zoe' && (!code || owner === 'zoe_green')) index.block.set(bloomscapesAssignmentBlock(location), owner);
    if (code && location && owner && (row.zone_override_active === true || row.ZONE_OVERRIDE_ACTIVE === true)) {
        index.location.set(code + '@' + location, owner);
    }
}

function resolveBloomscapesAssignedOwner(row, index) {
    if (!row || !index || bloomscapesRowFarm(row) !== index.farm) return '';
    return readCanonicalAssignedOwner(row, index, () => resolveIndexedBloomscapesOwner(row, index));
}

function getBloomscapesIndexedOwnerOverride(row, index) {
    const code = buildManagerEvalAssignmentKey(row.ITEMCODE || row.itemcode || row.ITEM || row.item);
    const location = bloomscapesOwnerCode(row.LOCATIONCODE || row.locationcode || row.location_code);
    return index.location.get(code + '@' + location) || index.block.get(bloomscapesAssignmentBlock(location));
}

function resolveIndexedBloomscapesOwner(row, index) {
    const code = buildManagerEvalAssignmentKey(row.ITEMCODE || row.itemcode || row.ITEM || row.item);
    return getBloomscapesIndexedOwnerOverride(row,index) || index.item.get(code) || '';
}

function getInventoryCardItemLocationKey(item = null) {
    if (!item || typeof item !== 'object') return '';
    const helper = window.AgMetricQueueInventory;
    const itemValue = firstNonEmptyValue(item.ITEMCODE, item.itemcode, item.ITEM, '');
    const locationValue = firstNonEmptyValue(item.LOCATIONCODE, item.locationcode, item.location_code, item.LOCATION, item.location, '');
    const itemCode = helper ? helper.normalizeItem(itemValue) : normalizeNcrInheritanceKeyPart(itemValue);
    const locationCode = helper ? helper.normalizeLocation(locationValue) : normalizeNcrInheritanceKeyPart(locationValue);
    if (!itemCode || !locationCode) return '';
    const key = [itemCode, locationCode];
    const farm = bloomscapesRowFarm(item);
    if (farm !== '10-PH') key.push(farm);
    return JSON.stringify(key);
}

function getMasterInventoryExactKey(item) {
    if (!item) return '';
    const helper = window.AgMetricQueueInventory;
    const itemValue = firstNonEmptyValue(item.ITEMCODE, item.itemcode, item.ITEM, item.item, '');
    const locationValue = firstNonEmptyValue(item.LOCATIONCODE, item.locationcode, item.LOCATION, item.location, '');
    const itemCode = helper ? helper.normalizeItem(itemValue) : String(itemValue || '').trim().toUpperCase();
    const locationCode = helper ? helper.normalizeLocation(locationValue) : String(locationValue || '').trim().toUpperCase();
    const lotCode = String(item.LOTCODE || item.LOT || item.lotcode || item.lot || '').trim().toUpperCase();
    const sourceCode = getMasterInventorySourceCode(item);
    if (!itemCode || !locationCode || !lotCode || !sourceCode) return '';
    const rowFarm = bloomscapesRowFarm(item);
    const farm = rowFarm === '10-PH' ? '' : '__' + rowFarm;
    return `${itemCode}__${locationCode}__${lotCode}__${sourceCode}${farm}`;
}

function projectOptimisticAssignedItemOwner(row, fields, assignee) {
    fields.slice(0, 4).forEach(field => { row[field] = assignee; });
    if (isManagerEvalZoneAssignment(row)) return;
    fields.slice(4, 8).forEach(field => { row[field] = assignee; });
    row.assignment_reason = assignee ? 'itemcode_default' : 'unassigned';
}
