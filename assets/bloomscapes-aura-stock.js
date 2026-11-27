const auraStockMaximumCandidates = 400;
const auraStockFields = ['warehouse_id', 'unique_id', 'itemcode', 'commonname', 'contsize',
    'locationcode', 'lotcode', 'season', 'saleyear', 's_lts', 'ptravailable', 'ptronhand',
    'ptrreviewed', 'holdstopcode', 'desigitem', 'app_tab_assignment', 'filename', 'last_updated'];

function normaliseAuraStockQuestion(question) {
    let clean = String(question || '').normalize('NFKC')
        .replace(/\bbaby\s+gym\b/gi, 'Baby Gem')
        .replace(/\bopen\s+stop\b/gi, 'open stock')
        .replace(/\bare\s+(?=(?:in\s+open stock|available|on[ -]?hand|on hold)\b)/gi, '')
        .replace(/\b3\s+DP\b/gi, '3DP')
        .replace(/(^|\s)(?:#\s*3|030)(?=[\s,?;]|$)/g, (_, prefix) => prefix + '3DP');
    if (!/\bitem\s*code\b/i.test(clean)) {
        clean = clean.replace(/\b\d{4,8}\.\d{2,4}\.[A-Z0-9]{1,5}\b/i, code => 'item code ' + code);
    }
    return clean;
}

function auraStockMetric(question) {
    if (/\bopen stock\b/i.test(question)) return 'openStock';
    if (/\b(?:hold\s*[/-]\s*stop|hold status|stop codes?|on hold)\b/i.test(question)) return 'holdStop';
    if (/\bon[ -]?hand\b/i.test(question)) return 'onHand';
    if (/\breview(?:ed)?\b/i.test(question)) return 'review';
    if (/\bavailable\b/i.test(question)) return 'available';
    return /\bhow (?:many|much)\b.+\binventory\b/i.test(question) ? 'available' : '';
}

function auraStockScope(question) {
    const clean = normaliseAuraStockQuestion(question);
    if (/\b(?:reserves?|docks?|SOC|orders?|POs?|weather|GDD|forecast|historical)\b/i.test(clean)) return null;
    const metric = auraStockMetric(clean);
    if (!metric) return null;
    const farmMatch = clean.match(/\b(?:10-PH|60-HL|20-TX|40-NC)\b/i);
    let scoped = farmMatch ? clean.replace(farmMatch[0], '') : clean;
    if (metric === 'holdStop') scoped = scoped.replace(/\b(?:hold\s*[/-]\s*stop(?:\s+(?:status|codes?))?|hold status|stop codes?|on hold)\b/gi, 'inventory');
    const query = parseAuraDeterministicInventoryQuestion(scoped);
    if (!query || query.cropTier || (!query.itemcode && !query.plantTerms.length)) return null;
    if (!canAccessView('drive') || auraRouterCapabilities?.inventory !== true) throw Object.assign(new Error('AURA inventory access is unavailable.'), {status: 403});
    const farm = farmMatch?.[0].toUpperCase() || getBloomscapesFarm();
    if (!getBloomscapesAllowedFarms().includes(farm)) throw Object.assign(new Error('AURA cannot read this farm.'), {status: 403});
    return {farm, query, metric};
}

function auraStockQueryUrl({farm, query}) {
    const url = new URL(SUPABASE_URL + '/rest/v1/gnc_effective_inventory');
    const params = url.searchParams;
    params.set('select', auraStockFields.join(','));
    params.set('warehouse_id', 'eq.' + farm);
    params.set('source_record_kind', 'eq.DRIVE');
    params.set('present_in_drive', 'is.true');
    params.set('order', 'last_updated.desc.nullslast,unique_id.asc');
    params.set('limit', String(auraStockMaximumCandidates + 1));
    if (query.itemcode) params.set('itemcode', 'eq.' + query.itemcode);
    if (!query.itemcode) {
        for (const term of auraStockPlantTerms(query)) params.append('commonname', 'ilike.*' + term + '*');
    }
    if (query.contSize === '3DP') params.set('contsize', 'in.(3DP,3 DP,#3,030)');
    else if (query.contSize) params.set('contsize', 'ilike.' + query.contSize);
    return url;
}

function auraStockPlantTerms(query) {
    return [...new Set(query.plantTerms.flatMap(term => term.toLowerCase().match(/[a-z0-9]+/g) || []))];
}

function auraStockSize(value) {
    const size = String(value ?? '').toUpperCase().replace(/\s+/g, '');
    return size === '030' ? '3DP' : size;
}

function auraStockRowMatches(row, query) {
    const lot = String(row.lotcode ?? '').match(/(?:^|[^0-9])(\d{2,4})[.\s-](S1|F1|U1|U2|U3|X|Y|Z)(?:$|[^A-Z0-9])/i);
    const season = String(lot?.[2] || row.season || '').trim().toUpperCase();
    const salesYear = driveCardSalesYear({salesyear: lot?.[1] || row.saleyear});
    const assignment = String(row.app_tab_assignment || '').trim().toLowerCase();
    if (['not_on_inventory_dylan', 'not_on_inventory_jd', 'not_on_inventory_denied'].includes(assignment)
        || /SHFT/i.test(row.desigitem || '')) return false;
    if (query.itemcode && String(row.itemcode || '').toUpperCase() !== query.itemcode) return false;
    if (!query.itemcode && !auraStockPlantTerms(query).every(term => String(row.commonname || '').toLowerCase().includes(term))) return false;
    const size = auraStockSize(row.contsize);
    if (query.contSize && size !== query.contSize && !(query.contSize === '3DP' && size === '#3')) return false;
    if (query.locationCode && !String(row.locationcode ?? '').toUpperCase().startsWith(query.locationCode)) return false;
    if (query.season && season !== query.season) return false;
    if (query.salesYear != null && (salesYear == null || salesYear > 2000 + query.salesYear)) return false;
    return true;
}

function resolveAuraStockSizeCohort(rows, query) {
    if (query.contSize !== '3DP') return rows;
    const key = row => String(row.commonname || row.itemcode).trim().toLowerCase();
    const preferred = new Set(rows.filter(row => auraStockSize(row.contsize) === '3DP').map(key));
    return rows.filter(row => auraStockSize(row.contsize) === '3DP' || !preferred.has(key(row)));
}

function resolveAuraStockNameCohort(rows, query) {
    if (query.itemcode) return rows;
    const name = auraStockPlantTerms(query).join(' ');
    const exact = rows.filter(row => (String(row.commonname || '').toLowerCase().match(/[a-z0-9]+/g) || []).join(' ') === name);
    return exact.length ? exact : rows;
}

function collectAuraStockRows(rows, {farm, query}, candidateLimit = auraStockMaximumCandidates) {
    const unique = new Map();
    let incomplete = rows.length > candidateLimit;
    for (const row of rows.slice(0, candidateLimit)) {
        if (row.warehouse_id !== farm || !row.unique_id) { incomplete = true; continue; }
        if (auraStockRowMatches(row, query) && !unique.has(row.unique_id)) unique.set(row.unique_id, row);
    }
    const named = resolveAuraStockNameCohort([...unique.values()], query);
    return {rows: resolveAuraStockSizeCohort(named, query), incomplete};
}

function auraStockNumber(raw) {
    const text = String(raw ?? '').trim().replace(/,/g, '');
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
}

function auraStockAddMetric(totals, key, raw) {
    const amount = auraStockNumber(raw);
    const metric = totals[key] ||= {quantity: null, missing: 0};
    if (amount === null) metric.missing++;
    else metric.quantity = (metric.quantity ?? 0) + amount;
}

function auraStockSeasonKey(row, query) {
    return JSON.stringify([row.itemcode, query.season || row.season || 'Unspecified']);
}

function auraStockObserveSeason(offers, key, row) {
    const stamp = dashboardFilenameTimestamp(row.filename, row.last_updated);
    const quantity = auraStockNumber(row.s_lts);
    const existing = offers.get(key);
    if (!existing || stamp > existing.stamp) offers.set(key, {stamp, amounts: new Set([quantity])});
    else if (stamp === existing.stamp) existing.amounts.add(quantity);
}

function auraStockTotals(rows, query) {
    const offers = new Map();
    const holdStop = new Map();
    const totals = {};
    for (const row of rows) {
        auraStockAddMetric(totals, 'available', row.ptravailable);
        auraStockAddMetric(totals, 'onHand', row.ptronhand);
        auraStockAddMetric(totals, 'review', row.ptrreviewed);
        auraStockObserveSeason(offers, auraStockSeasonKey(row, query), row);
        const code = String(row.holdstopcode || '').trim();
        if (code && code !== '-') holdStop.set(code, (holdStop.get(code) || 0) + 1);
    }
    const seasonalOpenStock = new Map();
    for (const [key, offer] of offers) {
        const values = [...offer.amounts].filter(value => value !== null);
        const amount = values.length === 1 ? values[0] : null;
        auraStockAddMetric(totals, 'openStock', amount);
        seasonalOpenStock.set(key, amount);
    }
    return {totals, holdStop: Object.fromEntries(holdStop), seasonalOpenStock};
}

function auraStockSummaryMetric(metric, title) {
    if (metric?.quantity == null) return title + ' unknown';
    const count = metric.quantity.toLocaleString('en-US');
    return count + ' ' + title + (metric.missing ? ' (partial)' : '');
}

function auraStockReply(scope, rows, totals, holdStop, incomplete, sourceKind) {
    const {farm, query, metric} = scope;
    const label = rows[0]?.commonname || query.itemcode || query.plantTerms.join(' ');
    const size = rows[0]?.contsize || query.contSize;
    const season = query.season ? ' · ' + query.season : '';
    const year = query.salesYear == null ? '' : ' through SalesYear ' + (2000 + query.salesYear);
    const head = label + (size ? ' · ' + size : '') + ' · ' + farm + season + year;
    if (!rows.length) return head + (incomplete ? '. No matches in the partial inventory sample.' : '. No matching inventory rows.');
    const metrics = [['openStock', 'Open Stock'], ['available', 'Available'], ['onHand', 'On Hand'], ['review', 'Review']];
    metrics.sort(([key], [other]) => Number(other === metric) - Number(key === metric));
    const codes = Object.entries(holdStop).map(([code, count]) => code + ' (' + count + ')').join(', ');
    const warning = incomplete ? (sourceKind === 'deterministic-sql' ? 'Partial SQL result. ' : 'Partial result. ') : '';
    return warning + head + '. ' + metrics.map(([key, title]) => auraStockSummaryMetric(totals[key], title)).join(' · ')
        + '. Hold/Stop: ' + (codes || 'no code recorded') + '. ' + rows.length + ' physical rows. Open Stock uses the latest S_LTS per item and season.';
}

function auraStockSample(row, scope, seasonalOpenStock) {
    return {unique_id: row.unique_id, itemcode: row.itemcode, season: scope.query.season || row.season,
        locationcode: row.locationcode, lotcode: row.lotcode, holdStop: row.holdstopcode || null,
        available: auraStockNumber(row.ptravailable), onHand: auraStockNumber(row.ptronhand),
        review: auraStockNumber(row.ptrreviewed), openStock: seasonalOpenStock.get(auraStockSeasonKey(row, scope.query))};
}

function auraStockCachedRow(row) {
    const fields = Object.fromEntries(auraStockFields.map(field => [field, row[field] ?? row[field.toUpperCase()]]));
    fields.warehouse_id ||= bloomscapesRowFarm(row);
    return fields;
}

function auraStockReceipt(scope, stock, cachedAnswer, sourceKind = 'deterministic-sql') {
    const {farm, query, metric} = scope;
    const {rows, incomplete} = stock;
    const {totals, holdStop, seasonalOpenStock} = auraStockTotals(rows, query);
    const complete = !incomplete && Object.values(totals).every(metric => !metric.missing);
    const reply = (sourceKind === 'cached inventory' ? 'Cached inventory only. ' : '')
        + auraStockReply(scope, rows, totals, holdStop, incomplete, sourceKind);
    const answer = cachedAnswer({...query, contSize: ''}, rows, {complete});
    const sample = rows.slice(0, 50).map(row => auraStockSample(row, scope, seasonalOpenStock));
    const actions = answer?.actions?.map(action => action.type === 'records' ? {...action, rows: sample} : action) || [];
    const metricField = {openStock:'s_lts',available:'ptravailable',onHand:'ptronhand',review:'ptrreviewed',holdStop:'holdstopcode'};
    const filters = {farm, itemcode: query.itemcode || undefined, name: query.plantTerms.join(' '),
        size: query.contSize, season: query.season, salesYear: query.salesYear, metric: metricField[metric]};
    return {...answer, ok: true, reply, speech: reply, actions,
        source: {kind: sourceKind, dataset: 'inventory', filters, complete},
        data: {matchedRows: rows.length, quantity: totals[metric]?.quantity ?? null, totals, holdStop,
            rows: sample.slice(0, 20)}};
}

/**
 * @param {string} question Stock question to resolve.
 * @param {object} headers Signed request headers.
 * @param {AbortSignal} signal Cancellation for this lookup.
 * @param {Function} cachedAnswer Builds actions for matched inventory.
 * @returns {Promise<object|null>} Stock evidence for a recognized question.
 */
async function auraStockAnswer(question, headers, signal, cachedAnswer) {
    const scope = auraStockScope(question);
    if (!scope) return null;
    if (!headers?.Authorization) throw Object.assign(new Error('AURA requires a signed-in account.'), {status: 401});
    const response = await fetch(auraStockQueryUrl(scope), {headers, signal, cache: 'no-store', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw Object.assign(new Error('AURA stock lookup is unavailable.'), {status: response.status});
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid AURA stock receipt.');
    return auraStockReceipt(scope, collectAuraStockRows(rows, scope), cachedAnswer);
}

/**
 * @param {string} question Stock question to resolve.
 * @param {Array<object>} inventory Active farm inventory snapshot.
 * @param {Function} cachedAnswer Builds actions for matched inventory.
 * @returns {object|null} Partial stock evidence when cached data is available.
 */
function auraCachedStockAnswer(question, inventory, cachedAnswer) {
    const scope = auraStockScope(question);
    if (!scope || scope.farm !== getBloomscapesFarm() || !inventory.length) return null;
    const stock = collectAuraStockRows(inventory.map(auraStockCachedRow), scope, inventory.length);
    stock.incomplete = true;
    return auraStockReceipt(scope, stock, cachedAnswer, 'cached inventory');
}
