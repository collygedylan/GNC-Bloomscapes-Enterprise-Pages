function bloomscapesRowFarm(row) {
    const raw = row?.warehouse_id || row?.WAREHOUSE_ID || row?.WAREHOUSEI || row?.warehousei || row?.WAREHOUSEID || row?.warehouseid || '10';
    const code = String(raw).split('-')[0];
    return ({'10':'10-PH','60':'60-HL','20':'20-TX','40':'40-NC'})[code] || String(raw);
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
    if (bloomscapesRowFarm(item) === '60-HL') key.push('60-HL');
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
    const farm = bloomscapesRowFarm(item) === '60-HL' ? '__60-HL' : '';
    return `${itemCode}__${locationCode}__${lotCode}__${sourceCode}${farm}`;
}
