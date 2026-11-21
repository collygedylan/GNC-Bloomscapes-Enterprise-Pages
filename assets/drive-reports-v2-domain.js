const driveReport2DefaultColumns = ['COMMONNAME', 'ITEMCODE', 'CONTSIZE', 'SEASON', 'SALEYEAR', 'PRIORITY', 'LOCATIONCODE', 'PTRONHAND', 'PTRAVAILABLE', 'LOC_MATCH_QTY'];
const driveReport2FieldLabels = {
    COMMONNAME: 'Common Name', ITEMCODE: 'Item Code', CONTSIZE: 'Size', SEASON: 'Season', SALEYEAR: 'SalesYear',
    PRIORITY: 'Priority', LOCATIONCODE: 'Location', PTRONHAND: 'On Hand', PTRAVAILABLE: 'Avail',
    LOC_MATCH_QTY: 'Photo Match', PTRREVIEWED: 'Review', LOTCODE: 'Lot', OPENSTOCK: 'Open Stock'
};
const driveReport2NumberFields = new Set(['SALEYEAR', 'PRIORITY', 'PTRONHAND', 'PTRAVAILABLE', 'LOC_MATCH_QTY', 'PTRREVIEWED', 'OPENSTOCK', 'LISTPRICE', 'S_LTS', 'SI_LTS', 'A_LTS', 'AI_LTS', 'SEASON_SUPPLY', 'SEASON_OH', 'SEASON_DEMAND', 'SEASON_AVAILABLE', 'OVERSELLPERCENTAGE', 'LARGEPTRQTY', 'MAXORDERQUANTITY', 'EXT_PTRONHAND', 'EQUIV_UNIT', 'EXT_EQUIV_UNIT']);
const driveReport2ValueOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const driveReport2ConditionOptions = [
    ['', 'Any'], ['eq', '='], ['ne', '!='], ['gt', '>'], ['ge', '>='], ['lt', '<'], ['le', '<='],
    ['between', 'Between'], ['contains', 'Contains'], ['not-contains', 'Not Contains'], ['blank', 'Is Blank'], ['not-blank', 'Is Not Blank']
];
const driveReport2Operators = new Set(driveReport2ConditionOptions.map(([key]) => key));

function driveReport2Fields(headers) {
    return [...headers, { key: 'OPENSTOCK', label: 'Open Stock' }, { key: 'LOC_MATCH_QTY', label: 'Photo Match' }]
        .map(({ key, label }) => ({ key, label: driveReport2FieldLabels[key] || label, numeric: driveReport2NumberFields.has(key) }));
}

function driveReport2Value(raw) {
    return raw === undefined || raw === null || typeof raw === 'object' ? '' : String(raw);
}

function driveReport2Width(value, fallback = 124) {
    const width = driveCardSortNumber(value);
    return width === null ? fallback : Math.max(82, Math.min(420, Math.round(width)));
}

function normalizeDriveReport2Rule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    const result = {};
    if (rule.operator && driveReport2Operators.has(rule.operator)) {
        result.operator = rule.operator;
        result.first = driveReport2Value(rule.first);
        result.second = driveReport2Value(rule.second);
    }
    if (Array.isArray(rule.values)) result.values = [...new Set(rule.values.filter(value => typeof value === 'string'))];
    return Object.keys(result).length ? result : null;
}

function driveReport2Layout(fields, layout = {}) {
    const allowed = new Set(fields.map(field => field.key));
    const source = Array.isArray(layout.selected_columns) ? layout.selected_columns : driveReport2DefaultColumns;
    const selected = source.filter(key => allowed.has(key));
    const columns = [...new Set(selected.length ? selected : driveReport2DefaultColumns.filter(key => allowed.has(key)))];
    const settings = layout.column_widths || {};
    const pinned = [...new Set((Array.isArray(settings._pinned) ? settings._pinned : []).filter(key => columns.includes(key)))];
    const widths = Object.fromEntries(columns.map(key => [key, driveReport2Width(settings[key], key === 'COMMONNAME' ? 178 : 124)]));
    const rules = Object.entries(layout.filter_rules || {}).filter(([key]) => allowed.has(key));
    const filters = Object.fromEntries(rules.map(([key, rule]) => [key, normalizeDriveReport2Rule(rule)]).filter(([, rule]) => rule));
    const sorting = (Array.isArray(layout.sort_rules) ? layout.sort_rules : []).filter(rule => allowed.has(rule?.column) && ['asc', 'desc'].includes(rule.direction));
    return { columns, widths, pinned, filters, sorting };
}

function driveReport2Window(length, scrollTop, viewport, height, overscan = 2) {
    const offset = Math.max(0, Math.floor(scrollTop / height) - overscan);
    const end = Math.min(length, Math.ceil((scrollTop + viewport) / height) + overscan);
    return { offset: Math.min(length, offset), end, before: Math.min(length, offset) * height, after: Math.max(0, length - end) * height };
}

function driveReport2Compare(left, right, numeric) {
    if (left === right) return 0;
    if (left === '') return 1;
    if (right === '') return -1;
    if (numeric) {
        const a = driveCardSortNumber(left);
        const b = driveCardSortNumber(right);
        if (a !== null && b !== null) return a - b;
    }
    return driveReport2ValueOrder(left, right);
}

function driveReport2Conditions(value, rule, numeric) {
    const { operator, first = '', second = '' } = rule;
    if (!operator) return true;
    if (operator === 'blank') return !value.trim();
    if (operator === 'not-blank') return !!value.trim();
    const includes = value.toLocaleLowerCase().includes(first.toLocaleLowerCase());
    if (operator === 'contains') return includes;
    if (operator === 'not-contains') return !includes;
    if (!value || (numeric && [value, first].some(entry => driveCardSortNumber(entry) === null))) return false;
    const result = driveReport2Compare(value, first, numeric);
    switch (operator) {
        case 'eq': return result === 0;
        case 'ne': return result !== 0;
        case 'gt': return result > 0;
        case 'ge': return result >= 0;
        case 'lt': return result < 0;
        case 'le': return result <= 0;
        case 'between': return result >= 0 && second !== '' && (!numeric || driveCardSortNumber(second) !== null)
            && driveReport2Compare(value, second, numeric) <= 0;
        default: return true;
    }
}

function driveReport2FilterRows(rows, filters, fields, ignored = '') {
    const rules = Object.entries(filters).filter(([key, rule]) => key !== ignored && rule && typeof rule === 'object')
        .map(([key, rule]) => ({ key, rule, numeric: fields.get(key)?.numeric, values: Array.isArray(rule.values) ? new Set(rule.values) : null }));
    if (!rules.length) return rows;
    return rows.filter(row => rules.every(({ key, rule, numeric, values }) => {
        const value = row.value(key);
        return (!values || values.has(value)) && driveReport2Conditions(value, rule, numeric);
    }));
}

function driveReport2Values(rows, key, numeric) {
    const counts = new Map();
    for (const row of rows) {
        const value = row.value(key);
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => driveReport2Compare(a, b, numeric));
}

function compareDriveReport2Rows(left, right, sorting, fields) {
    for (const rule of sorting) {
        const a = left.value(rule.column);
        const b = right.value(rule.column);
        const order = driveReport2Compare(a, b, fields.get(rule.column)?.numeric);
        if (order) return rule.direction === 'desc' && a !== '' && b !== '' ? -order : order;
    }
    return 0;
}

function driveReport2SortRows(rows, sorting, fields) {
    if (!sorting.length) return rows;
    return rows.slice().sort((left, right) => compareDriveReport2Rows(left, right, sorting, fields));
}

function driveReport2Totals(rows, totals = { PTRONHAND: null, PTRAVAILABLE: null, LOC_MATCH_QTY: null }, start = 0, end = rows.length) {
    for (let i = start; i < end; i++) {
        const row = rows[i];
        for (const key of Object.keys(totals)) {
            const amount = driveCardSortNumber(row.value(key));
            if (amount !== null) totals[key] = (totals[key] ?? 0) + amount;
        }
    }
    return totals;
}

function driveReport2CsvCell(value) {
    const text = driveReport2Value(value);
    const formula = /^[\t\r\n]|^\s*[=+@-]/.test(text) && driveCardSortNumber(text) === null;
    return `"${(formula ? "'" + text : text).replaceAll('"', '""')}"`;
}

function driveReport2Csv(rows, columns, fields) {
    const header = columns.map(key => driveReport2CsvCell(fields.get(key).label)).join(',');
    const lines = rows.map(row => columns.map(key => driveReport2CsvCell(row.value(key))).join(','));
    return [header, ...lines].join('\r\n');
}
