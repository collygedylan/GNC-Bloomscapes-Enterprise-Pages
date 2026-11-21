
function bloomscapesRowFarm(row) {
    const raw = row?.warehouse_id || row?.WAREHOUSE_ID || row?.WAREHOUSEI || row?.warehousei || row?.WAREHOUSEID || row?.warehouseid || '10';
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

function buildBloomscapesAssignmentIndex(farm,rows,defaults) {
    const index = {farm,location:new Map(),block:new Map(),item:new Map(),normalized:new Map(),size:new Map(),family:new Map()};
    const scoped = [...defaults,...rows].filter(row=>(row.farm_code || row.FARM_CODE || bloomscapesRowFarm(row))===farm);
    scoped.sort((a,b)=>Number(a.revision || a.default_revision || 0)-Number(b.revision || b.default_revision || 0)
        || String(a.master_unique_id || '').localeCompare(String(b.master_unique_id || '')));
    for (const row of scoped) rememberBloomscapesAssignment(index,row);
    const votes = new Map();
    for (const [code,owner] of index.size) {
        const prefix = code.split('.')[0];
        if (!votes.has(prefix)) votes.set(prefix,new Map());
        const counts = votes.get(prefix);
        counts.set(owner,(counts.get(owner) || 0)+1);
    }
    for (const [prefix,counts] of votes) {
        index.family.set(prefix,[...counts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))[0][0]);
    }
    return index;
}

function rememberBloomscapesAssignment(index,row) {
    const code = bloomscapesOwnerCode(row.itemcode_normalized || row.itemcode || row.ITEMCODE);
    const owner = bloomscapesOwnerValue(row);
    const block = bloomscapesOwnerCode(row.blockalpha || row.BLOCKALPHA);
    if (owner && block) index.block.set(block,owner);
    if (!code || !owner) return;
    const normalized = buildManagerEvalAssignmentKey(code);
    const location = bloomscapesOwnerCode(row.locationcode || row.LOCATIONCODE);
    if (location) index.location.set(normalized+'@'+location,owner);
    else index.item.set(code,owner);
    if (!index.normalized.has(normalized) || !location) index.normalized.set(normalized,owner);
    const size = normalized.split('.').slice(0,2).join('.');
    if (!index.size.has(size) || !location) index.size.set(size,owner);
}

function resolveBloomscapesAssignedOwner(row,index) {
    if (!index || bloomscapesRowFarm(row)!==index.farm) return '';
    return readCanonicalAssignedOwner(row, index, () => resolveIndexedBloomscapesOwner(row, index));
}

function resolveIndexedBloomscapesOwner(row, index) {
    const code = bloomscapesOwnerCode(row.ITEMCODE || row.itemcode);
    const normalized = buildManagerEvalAssignmentKey(code);
    const location = bloomscapesOwnerCode(row.LOCATIONCODE || row.locationcode);
    return index.location.get(normalized+'@'+location) || index.block?.get(bloomscapesOwnerCode(row.blockalpha || row.BLOCKALPHA || location.split('.')[0])) || index.item.get(code) || index.normalized.get(normalized)
        || index.size.get(normalized.split('.').slice(0,2).join('.')) || index.family.get(normalized.split('.')[0]) || '';
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
