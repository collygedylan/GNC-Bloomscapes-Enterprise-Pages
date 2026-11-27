const driveCardNaturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const driveCardItemOrder = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;

/** @param {*} value @returns {number|null} */
function driveCardSortNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function driveCardYearPrefix(value) {
    const match = String(value ?? '').trim().match(/^(\d{4}|\d{2})(?=\D|$)/);
    if (!match) return null;
    return Number(match[0]) + (match[0].length === 2 ? 2000 : 0);
}

/** @param {object} row @returns {number} */
function driveCardSalesYear(row) {
    const raw = [row.salesyear, row.SALESYEAR, row.saleyear, row.SALEYEAR];
    const direct = raw.map(driveCardSortNumber).find(value => Number.isInteger(value) && value >= 0 && value <= 9999);
    if (direct !== undefined) return direct < 100 ? 2000 + direct : direct;
    return [row.lotcode, row.LOTCODE, row.season, row.SEASON].map(driveCardYearPrefix).find(year => year !== null) ?? null;
}

/** @param {object} row @returns {number} */
function driveCardPriority(row) {
    return [row.priority, row.PRIORITY, row.pri, row.PRI].map(driveCardSortNumber).find(value => value !== null) ?? null;
}

function driveSeasonSortFacts(row) {
    return {
        row, year: driveCardSalesYear(row) ?? Infinity, priority: driveCardPriority(row) ?? Infinity,
        location: String(row.locationcode ?? row.LOCATIONCODE ?? ''),
        item: String(row.itemcode ?? row.ITEMCODE ?? '')
    };
}

function sortDriveSeasonCards(rows) {
    return rows.map(driveSeasonSortFacts).sort((a, b) => a.year - b.year || a.priority - b.priority
        || driveCardNaturalOrder(a.location, b.location) || driveCardItemOrder(a.item, b.item))
        .map(entry => entry.row);
}

function driveHasSpecificDrill(value) {
    return !!value && String(value).toLowerCase() !== 'all' && !isDriveDrillAllValue(value);
}

/** @param {object} [reportFilters] @returns {boolean} */
function driveHasSeasonCardSort(reportFilters = {}) {
    const { filters } = getInventoryExcelState('drive');
    const size = driveHasSpecificDrill(selectedDriveSize) || driveHasSpecificDrill(driveQuickFilterSize)
        || driveContSizeSelectionMode !== 'all' || !!filters.contsize || !!driveColumnFilters.CONTSIZE || !!reportFilters.CONTSIZE;
    const season = driveHasSpecificDrill(selectedDriveSeason) || !areAllDriveSeasonsSelected()
        || !!filters.season || !!filters.stock || !!driveColumnFilters.SEASON || !!reportFilters.SEASON;
    return size && season;
}

/** @param {Array<object>} rows @param {Function} [fallback] @returns {Array<object>} */
function sortDriveCardsForActiveFilters(rows, fallback = sortDriveCardItems) {
    return driveHasSeasonCardSort() ? sortDriveSeasonCards(rows) : fallback(rows);
}
