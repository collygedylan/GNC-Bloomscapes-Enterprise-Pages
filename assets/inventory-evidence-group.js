
/**
 * @param {Array<object>} rows Inventory rows including grouped physical lots.
 * @returns {Array<object>} Distinct rows in source order.
 */
function canonicalEvidencePhysicalRows(rows) {
    return [...new Set(rows.flatMap(row => [row,...(row?.__physicalInventoryRows || [])]))];
}

/**
 * @param {object} target Physical inventory identity.
 * @param {Array<object>} rows Inventory candidates.
 * @param {Function} [includes] Additional eligibility predicate.
 * @returns {Array<object>} Exact lot rows, or same-location rows when the lot is absent.
 */
function getCanonicalEvidenceGroupRows(target, rows, includes = () => true) {
    const local = canonicalEvidencePhysicalRows(rows).filter(row => canonicalInventorySameLocation(row,target) && includes(row));
    const lot = canonicalInventoryLot(target);
    const exact = lot ? local.filter(row => canonicalInventoryLot(row) === lot) : [];
    return exact.length ? exact : local;
}

/**
 * @param {object} row Candidate row.
 * @param {object} target Physical inventory identity.
 * @param {Array<object>} [rows] Current inventory cohort.
 * @param {boolean} [hasExactLot] Known lot membership within the same cohort.
 * @returns {boolean} Whether this row belongs to the target evidence group.
 */
function canonicalEvidenceGroupMatches(row, target, rows = fullInventory, hasExactLot) {
    if (!canonicalInventorySameLocation(row,target)) return false;
    const lot = canonicalInventoryLot(target), candidate = canonicalInventoryLot(row);
    if (!lot || !candidate || candidate === lot) return true;
    return !(hasExactLot ?? rows.some(source => canonicalInventorySameLot(source,target)));
}

/**
 * @param {object} row Source row or linked projection.
 * @param {Map} byId Physical UID index.
 * @param {Map} byItem Item-code cohort index.
 * @returns {object|null} Canonical master row matching the supplied identity.
 */
function resolveCanonicalInventoryTarget(row, byId, byItem) {
    const linked = canonicalInventoryLinkedUid(row);
    const ownUid = canonicalInventoryRowUid(row);
    const uid = linked || ownUid;
    const lot = canonicalInventoryLot(row);
    const matches = candidate => canonicalInventorySameLocation(row,candidate) && canonicalInventoryLot(candidate) === lot;
    const exactMatch = candidate => !!uid && canonicalInventoryRowUid(candidate) === uid
        && (linked ? matchesCanonicalLinkedInventoryRow(row,candidate) : matches(candidate));
    const direct = byId.get(uid);
    if (exactMatch(direct)) return direct;
    const code = String(row?.ITEMCODE ?? row?.itemcode ?? '').trim().toUpperCase();
    const candidates = canonicalEvidencePhysicalRows(byItem.get(code) || []);
    const exact = candidates.find(exactMatch);
    const table = String(row?.SOURCE_TABLE || row?.source_table || '').toLowerCase();
    if (exact || linked || direct || (ownUid && table === 'ph_master_inventory')) return exact || null;
    if (lot) return candidates.find(matches) || null;
    if (!['ph_requests_pending','ph_soc_master','ph_reserves'].includes(table)) return null;
    return candidates.find(candidate => matchesCanonicalLinkedInventoryRow(row,candidate)) || null;
}

function matchesCanonicalLinkedInventoryRow(row, master) {
    if (!canonicalInventorySameLocation(row,master)) return false;
    const lot = canonicalInventoryLot(row);
    const masterLot = canonicalInventoryLot(master);
    const seasonOnly = /^[A-Z]\d+$/.test(lot) && masterLot.endsWith(`.${lot}`);
    if (lot && lot !== masterLot && !seasonOnly) return false;
    const [, masterYear, masterSeason] = masterLot.match(/^(\d{2})\.([A-Z]\d+)$/) || [];
    const year = String(row.SALEYEAR ?? row.saleyear ?? '').trim().replace(/^20(?=\d{2}$)/,'');
    const season = String(row.SEASON ?? row.season ?? '').trim().toUpperCase();
    return (!year || !masterYear || year === masterYear) && (!season || !masterSeason || season === masterSeason);
}

/**
 * @param {object} target Published master row.
 * @param {Array<object>} rows Current item cohort.
 * @param {object} options Source, pending owners and provisional publication state.
 * @returns {object} Predicates for canonical master rows and linked mirrors.
 */
function createCanonicalEvidenceGroupMatcher(target, rows, {source,provisional,pending}) {
    const uid = canonicalInventoryRowUid(target);
    const sourceUid = canonicalInventoryRowUid(source);
    const sourceTable = String(source?.SOURCE_TABLE || source?.source_table || '').toLowerCase();
    if (sourceTable === 'ph_requests_pending' && uid && canonicalInventoryLinkedUid(source) === uid) {
        const same = row => canonicalInventorySameLocation(row,target);
        return {
            master:row => same(row) && (canonicalInventoryLinkedUid(row) || canonicalInventoryRowUid(row)) === uid,
            mirror:row => same(row) && canonicalInventoryRowUid(row) === sourceUid
        };
    }
    const lot = canonicalInventoryLot(target);
    const isVerified = row => {
        const rowUid = canonicalInventoryRowUid(row);
        return rowUid && !pending?.get(rowUid)?.provisional;
    };
    const cohort = provisional ? [] : getCanonicalEvidenceGroupRows(target,rows,isVerified);
    const verified = cohort.some(row => canonicalInventoryRowUid(row) === uid);
    const members = new Map((verified ? cohort : [target]).map(row => [canonicalInventoryRowUid(row),row]));
    const locationFallback = verified && !cohort.some(row => canonicalInventorySameLot(row,target));
    const master = row => {
        if (!canonicalInventorySameLocation(row,target)) return false;
        const member = members.get(canonicalInventoryLinkedUid(row) || canonicalInventoryRowUid(row));
        return row === target || (!!member && canonicalInventoryLot(row) === canonicalInventoryLot(member));
    };
    const mirror = row => {
        if (!canonicalInventorySameLocation(row,target)) return false;
        const linked = canonicalInventoryLinkedUid(row);
        if (linked) return matchesCanonicalLinkedInventoryRow(row,members.get(linked) || (linked === uid ? target : null));
        const candidateLot = canonicalInventoryLot(row);
        if (lot && candidateLot && lot !== candidateLot && !locationFallback) return false;
        if (!candidateLot && !locationFallback && !matchesCanonicalLinkedInventoryRow(row,target)) return false;
        const rowUid = canonicalInventoryRowUid(row);
        return verified || rowUid === uid || (!!sourceUid && rowUid === sourceUid);
    };
    return {master,mirror};
}
