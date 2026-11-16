function getSuspendTagInventoryIdentity(mirror, source = null) {
    const row = source || findDockSuspendDcRequestSourceRow(mirror) || mirror;
    const value = key => String(firstNonEmptyValue(row?.[key], row?.[key.toLowerCase()], mirror?.[key], mirror?.[key.toLowerCase()], '') || '').trim();
    const masterSource = candidate => {
        const normalized = normalizeMasterInventorySourceCode(candidate);
        return normalized && !['DOCK', 'DOCKS', 'SOC'].includes(normalized) ? normalized : '';
    };
    const sourceCandidates = [row?.MASTER_SOURCE, row?.master_source, row?.SOURCECODE, row?.sourcecode,
        row?.SOURCE_CODE, row?.source_code, row?.SOURCE, row?.source,
        mirror?.MASTER_SOURCE, mirror?.master_source, mirror?.SOURCECODE, mirror?.sourcecode,
        mirror?.SOURCE_CODE, mirror?.source_code, mirror?.SOURCE, mirror?.source];
    return { itemCode: value('ITEMCODE'), locationCode: value('LOCATIONCODE'), lotCode: value('LOTCODE'),
        source: sourceCandidates.map(masterSource).find(Boolean) || '', farm:bloomscapesRowFarm(row),
        season: value('SEASON'), salesYear: value('SALEYEAR'), priority: value('PRIORITY') || value('PRI'), desigItem: value('DESIGITEM'),
        masterUid: value('MASTER_UNIQUE_ID') || value('MASTER_ID') };
}

function matchesSuspendTagInventoryIdentity(row, identity) {
    if (!identity?.itemCode || !identity.locationCode) return false;
    const target = {ITEMCODE:identity.itemCode,LOCATIONCODE:identity.locationCode,LOTCODE:identity.lotCode,
        warehouse_id:identity.farm || '10-PH'};
    return canonicalEvidenceGroupMatches(row,target,typeof fullInventory === 'undefined' ? [] : fullInventory);
}

async function resolveSuspendTagInventoryRow(_mirror, _source, identity, options = {}) {
    if (!identity.itemCode || !identity.locationCode) return null;
    const local = fullInventory.filter(row => matchesSuspendTagInventoryIdentity(row, identity));
    const preferred = local.find(row => String(row.UNIQUE_ID || row.unique_id) === identity.masterUid);
    if (preferred || local.length) return preferred || local[0];
    const lookup = {dataset:'lookup', projection:'full', itemCode:identity.itemCode, locationCode:identity.locationCode};
    const rows = await fetchAllInventoryReadRows('master_page',lookup,
        {signal:options.signal, requireComplete:true, label:'Suspend Tag inventory'});
    validateInventoryReadProjection(rows.readMeta,{projection:'full'});
    const matches = rows.filter(row => matchesSuspendTagInventoryIdentity(row,identity));
    matches.sort((a,b) => String(a.unique_id || a.UNIQUE_ID).localeCompare(String(b.unique_id || b.UNIQUE_ID)));
    return matches.find(row => String(row.unique_id || row.UNIQUE_ID) === identity.masterUid) || matches[0] || null;
}
