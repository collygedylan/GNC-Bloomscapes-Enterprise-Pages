function evalReportHoldCode(row) {
    const code = String(row.holdstopcode || row.HOLDSTOPCODE || row.hold_stop_code || row.hold || row.raw?.holdstopcode || '').trim();
    return /^(none|null)$/i.test(code) ? '' : code;
}

function evalReportPlantGroup(row) {
    return String(row.plantgroupcode || row.PLANTGROUPCODE || row.plantgroup || row.PLANTGROUP || row.plt_grp || row.PLT_GRP || row.raw?.plantgroupcode || '').trim();
}

function evalReportHoldReasonText(row) {
    return String(row.holdstopreason || row.HOLDSTOPREASON || row.hold_stop_reason || row.raw?.holdstopreason || '').trim();
}

function evalReportHoldReason(row) {
    const code = evalReportHoldCode(row);
    const reason = evalReportHoldReasonText(row);
    return reason ? code + ' — ' + reason : code;
}

function evalReportFacetChoices(rows, toValue, all) {
    const counts = new Map();
    for (const row of rows) {
        const value = toValue(row);
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const choices = [...counts].sort(([a],[b])=>a.localeCompare(b, undefined, {numeric:true}));
    return [['', all], ...choices.map(([value, count])=>[value, value + ' (' + count + ' rows)'])];
}

function filterEvalReportHoldRows(rows, plantGroup, reason) {
    return rows.filter(row=>evalReportHoldCode(row) && (!plantGroup || evalReportPlantGroup(row) === plantGroup)
        && (!reason || evalReportHoldReason(row) === reason));
}

const evalTransitionSeasons = new Set(['F1', 'S1', 'U1', 'U2', 'U3']);
const evalReportSeasons = new Set(['F1', 'S1', 'U1', 'U2', 'U3', 'Y', 'Z', 'X']);
const evalSummerSeasons = ['U1', 'U2', 'U3'];
const evalReportLeads = new Set(['dylan_collyge', 'megan_kelly', 'mitch_kaiser', 'mitch_kasier', 'jd_jones']);

function evalReportKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeEvalReportSalesYear(value) {
    const year = String(value ?? '').trim().replace(/\.0+$/, '');
    if (/^\d{1,2}$/.test(year) && Number(year) > 0) return 2000 + Number(year);
    return /^(?:19|20)\d{2}$/.test(year) ? Number(year) : null;
}

function evalReportSeason(value) {
    return String(value ?? '').trim().toUpperCase().replace(/^(?:\d{2}|\d{4})\s*\.\s*/, '');
}

function resolveEvalReportCrop(row) {
    const lot = String(row.lotcode || row.LOTCODE || row.lot || row.LOT || '').trim();
    const lotParts = /^(\d{2}|\d{4})\s*\.\s*(F1|S1|U1|U2|U3|Y|Z|X)(?=\b|$)/i.exec(lot);
    const seasons = [row.season, row.SEASON, row.stock_season, row.lot_season, row.raw?.season];
    const years = [row.salesyear, row.saleyear, row.SALESYEAR, row.SALEYEAR, row.sales_year, row.raw?.saleyear];
    return {
        season: seasons.map(evalReportSeason).find(value=>evalReportSeasons.has(value)) || evalReportSeason(lotParts?.[2]),
        salesYear: years.map(normalizeEvalReportSalesYear).find(value=>value !== null) ?? normalizeEvalReportSalesYear(lotParts?.[1]),
        designation: row.desigitem || row.DESIGITEM || row.desig_item || row.itemdesig || row.raw?.desigitem || ''
    };
}

function normalizeCarryoverYear(salesYear) {
    const year = normalizeEvalReportSalesYear(salesYear);
    return year >= 2000 && year <= 2099 ? year : null;
}

function prepareEvalReportRowFacts(row) {
    const {season,salesYear,designation} = resolveEvalReportCrop(row);
    const carryoverYear = normalizeCarryoverYear(salesYear);
    return {season,salesYear,carryoverYear,shifted:String(designation).toUpperCase().includes('SHFT'),hold:Boolean(evalReportHoldCode(row))};
}

function evalReportRowFacts({season,salesYear,carryoverYear,shifted,hold}, year) {
    return {
        season, shifted, hold,
        transition: evalTransitionSeasons.has(season) && !(season === 'U3' && shifted) && year !== null && salesYear !== null,
        year, salesYear, carryoverYear
    };
}

function evalTransitionWithin(facts, offset) {
    return facts.transition && facts.salesYear <= facts.year + offset;
}

const EVAL_ROLE_REPORTS = Object.freeze([
    ['spring-to-fall', 'S --> F', facts => evalTransitionWithin(facts, 1)],
    ['fall-to-spring', 'F --> S', facts => evalTransitionWithin(facts, 0)],
    ['u1-to-spring', 'U1 --> S', facts => evalTransitionWithin(facts, 0)],
    ['summer', 'U', facts => evalSummerSeasons.some(season => facts.season.includes(season))],
    ['u1', 'U1', facts => facts.season.includes('U1')],
    ['u2', 'U2', facts => facts.season.includes('U2')],
    ['u3', 'U3', facts => facts.season.includes('U3')],
    ['s1', 'S1', facts => facts.season.includes('S1')],
    ['f1', 'F1', facts => facts.season.includes('F1')],
    ['hold-stop', 'Hold/Stop', facts => facts.hold],
    ['shift', 'Shift', facts => (facts.season === 'Y' || facts.season === 'U3') && facts.shifted],
    ['propagation', 'Propagation', facts => facts.season.includes('Z')],
    ['carryover-crop', 'Carryover Crop', facts => facts.carryoverYear > 0 && facts.carryoverYear < facts.year]
].map(([id, label, matches], index) => Object.freeze({id, label, matches, bit:1 << index})));

function stampEvalRoleReportMask(row, year, crop = prepareEvalReportRowFacts(row)) {
    const facts = evalReportRowFacts(crop,year);
    let mask = 0;
    for (const {bit,matches} of EVAL_ROLE_REPORTS) if (matches(facts)) mask |= bit;
    row._reportMask = mask;
    row._reportMaskYear = year;
}

function expectedEvalReportsScope(profile, preview = null) {
    if (preview) return preview.role === 'eval' && evalReportKey(preview.username) ? 'own' : 'hidden';
    if (evalReportLeads.has(evalReportKey(profile?.username))) return 'all';
    return profile?.role === 'eval' ? 'own' : 'hidden';
}

function evalReportRowIsInFarm(row, farm) {
    const rowFarm = row.farm_code || row.FARM_CODE || row.warehouse_id || row.WAREHOUSE_ID
        || row.warehousei || row.WAREHOUSEI || row.warehouseid || row.WAREHOUSEID || '10';
    return String(rowFarm).trim().toUpperCase() === farm || String(rowFarm).trim() === farm.split('-')[0];
}

function resolveExactOwnerForRow(row, owners, farm) {
    if (!evalReportRowIsInFarm(row, farm)) return '';
    const uid = String(row.unique_id ?? row.UNIQUE_ID ?? '').trim();
    return owners.get(uid) || '';
}

function getEvalRoleReportRows(rows, id, activeAppSalesYear, prepared) {
    const report = EVAL_ROLE_REPORTS.find(entry=>entry.id === id);
    const year = normalizeEvalReportSalesYear(activeAppSalesYear) ?? 2027;
    if (!report) return [];
    return rows.filter(row => {
        if (row._reportMaskYear !== year) stampEvalRoleReportMask(row,year,prepared?.get(row));
        return Boolean(row._reportMask & report.bit);
    });
}

function buildEvalRoleReportsCatalog({rows, evaluators, farm, activeAppSalesYear}) {
    const year = normalizeEvalReportSalesYear(activeAppSalesYear) ?? 2027;
    const owners = new Map();
    const catalog = new Map();
    for (const {username, display_name, row_ids} of evaluators) {
        const entry = {username, displayName: display_name || username, reports: new Map()};
        for (const {id} of EVAL_ROLE_REPORTS) entry.reports.set(id, []);
        for (const uid of row_ids) owners.set(uid, username);
        catalog.set(username, entry);
    }
    for (const row of rows) {
        const evaluator = catalog.get(resolveExactOwnerForRow(row, owners, farm));
        if (!evaluator) continue;
        const facts = evalReportRowFacts(prepareEvalReportRowFacts(row),year);
        for (const {id, matches} of EVAL_ROLE_REPORTS) {
            if (matches(facts)) evaluator.reports.get(id).push(row);
        }
    }
    return catalog;
}

function evalRoleReportTitle(evaluator, label) {
    return evaluator.displayName + ' (@' + evaluator.username + ') — ' + label;
}
