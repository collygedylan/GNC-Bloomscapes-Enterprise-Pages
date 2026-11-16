
function canonicalEvidencePhysicalRows(rows) {
    return [...new Set(rows.flatMap(row => [row,...(row?.__physicalInventoryRows || [])]))];
}

function getCanonicalEvidenceGroupRows(target, rows) {
    const local = canonicalEvidencePhysicalRows(rows).filter(row => canonicalInventorySameLocation(row,target));
    const lot = canonicalInventoryLot(target);
    const exact = lot ? local.filter(row => canonicalInventoryLot(row) === lot) : [];
    return exact.length ? exact : local;
}

function canonicalEvidenceGroupMatches(row, target, rows = fullInventory) {
    if (!canonicalInventorySameLocation(row,target)) return false;
    const lot = canonicalInventoryLot(target), candidate = canonicalInventoryLot(row);
    if (!lot || !candidate || candidate === lot) return true;
    return !rows.some(source => canonicalInventorySameLot(source,target));
}

function resolveCanonicalInventoryTarget(row, byId, byItem) {
    const uid = canonicalInventoryLinkedUid(row);
    const ownUid = canonicalInventoryRowUid(row);
    const direct = byId.get(uid || ownUid);
    if (direct && canonicalInventorySameLot(row, direct, true)) return direct;
    const code = String(row?.ITEMCODE ?? row?.itemcode ?? '').trim().toUpperCase();
    const locationRows = (byItem.get(code) || []).filter(candidate => canonicalInventorySameLocation(row, candidate));
    const candidates = getCanonicalEvidenceGroupRows(row, locationRows);
    return candidates.find(candidate => canonicalInventoryRowUid(candidate) === (uid || ownUid)) || candidates[0] || null;
}


function createCanonicalEvidenceGroupMatcher(target, rows) {
    const value = (row,key) => String(row?.[key] ?? row?.[key.toLowerCase()] ?? '').trim().toUpperCase();
    const item=value(target,'ITEMCODE'),location=value(target,'LOCATIONCODE');
    const lot=canonicalInventoryLot(target),farm=bloomscapesRowFarm(target);
    const exact=lot && rows.some(row=>canonicalInventorySameLot(row,target));
    return row => !!row && !!item && !!location && value(row,'ITEMCODE')===item && value(row,'LOCATIONCODE')===location
        && bloomscapesRowFarm(row)===farm && (!exact || !canonicalInventoryLot(row) || canonicalInventoryLot(row)===lot);
}
