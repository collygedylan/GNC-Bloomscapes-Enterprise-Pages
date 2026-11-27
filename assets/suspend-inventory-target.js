
/**
 * @param {object} mirror Displayed Suspend tag.
 * @param {object} [source] Confirmed source row.
 * @returns {object} Physical inventory identifiers with the farm scope.
 */
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

function suspendInventoryTarget(identity) {
    return {ITEMCODE:identity.itemCode,LOCATIONCODE:identity.locationCode,LOTCODE:identity.lotCode,
        warehouse_id:identity.farm || '10-PH'};
}

function suspendInventoryCohort(target) {
    const rows = typeof fullInventory === 'undefined' ? [] : fullInventory;
    const byItem = typeof masterInventoryByItemCode !== 'undefined' && masterInventoryByItemCode;
    return getInstalledMasterItemCohort(rows,byItem,normalizeCanonicalInventoryPart(target.ITEMCODE)) || rows;
}

/**
 * @param {object} row Candidate physical row.
 * @param {object} identity Item, location, lot and farm from the tag.
 * @returns {boolean} Whether the candidate satisfies the canonical group rules.
 */
function matchesSuspendTagInventoryIdentity(row, identity) {
    if (!identity?.itemCode || !identity.locationCode) return false;
    const target = suspendInventoryTarget(identity);
    return canonicalEvidenceGroupMatches(row,target,suspendInventoryCohort(target));
}

function selectSuspendInventoryRow(rows,target,masterUid,cohort,hasExactLot,remote = false) {
    let first = null;
    let firstUid;
    for (const row of rows) {
        if (!canonicalEvidenceGroupMatches(row,target,cohort,hasExactLot)) continue;
        const uid = remote ? String(row.unique_id || row.UNIQUE_ID) : String(row.UNIQUE_ID || row.unique_id);
        if (uid === masterUid) return row;
        if (!first || remote && uid.localeCompare(firstUid) < 0) {
            first = row;
            firstUid = uid;
        }
    }
    return first;
}

/**
 * @param {object} _mirror Original displayed tag.
 * @param {object} _source Original source row.
 * @param {object} identity Requested physical coordinates and preferred UID.
 * @param {object} [options] Optional read cancellation signal.
 * @returns {Promise<object|null>} Matching local or authenticated lookup row.
 */
async function resolveSuspendTagInventoryRow(_mirror, _source, identity, options = {}) {
    if (!identity.itemCode || !identity.locationCode) return null;
    const target = suspendInventoryTarget(identity);
    const cohort = suspendInventoryCohort(target);
    const hasExactLot = cohort.some(source => canonicalInventorySameLot(source,target));
    const local = selectSuspendInventoryRow(cohort,target,identity.masterUid,cohort,hasExactLot);
    if (local) return local;
    const lookup = {dataset:'lookup', projection:'full', itemCode:identity.itemCode, locationCode:identity.locationCode};
    const rows = await fetchAllInventoryReadRows('master_page',lookup,
        {signal:options.signal, requireComplete:true, label:'Suspend Tag inventory'});
    validateInventoryReadProjection(rows.readMeta,{projection:'full'});
    return selectSuspendInventoryRow(rows,target,identity.masterUid,cohort,hasExactLot,true);
}
