function prepareInventorySearchTerms(terms) {
    const tokens = Array.isArray(terms) ? terms.filter(Boolean) : [];
    return {tokens, joined:tokens.join(' '), compact:tokens.map(term=>normalizeSearchValue(term).replace(/\s/g,''))};
}

function prepareInventorySearchFieldNormalizer() {
    const values = new Map();
    return value => {
        if (values.has(value)) return values.get(value);
        const normalized = normalizeSearchValue(value);
        values.set(value,normalized);
        return normalized;
    };
}

/** @param {object} item Candidate row. @param {string} [profileName] Approved field profile. @param {Function} [normalizeField] Normalizer for the current query. @returns {string[]} Normalized values of the visible fields. */
function getSearchValuesForProfile(item, profileName = '', normalizeField = normalizeSearchValue) {
    if (!item) return [];
    if (!profileName) return getSearchCandidates(item);
    if (!item._searchProfileValues) item._searchProfileValues = {};
    if (Array.isArray(item._searchProfileValues[profileName])) return item._searchProfileValues[profileName];
    const resolver = SEARCH_PROFILES[profileName];
    const values = resolver ? [...new Set(resolver(item).map(normalizeField).filter(Boolean))] : getSearchCandidates(item);
    item._searchProfileValues[profileName] = values;
    return values;
}

function normalizedInventoryPrefixMatch(values, plan) {
    if (!plan.tokens.length) return true;
    if (!values.length) return false;
    if (plan.joined && values.some(value=>value.startsWith(plan.joined))) return true;
    return plan.tokens.every((term,index)=>matchesCompactSearchTerm(term,plan.compact[index],values));
}

function matchesCompactSearchTerm(term, compact, values) {
    return values.some(value=>value.includes(compact) || value.includes(' ') && value.replaceAll(' ','').includes(compact)
        || value.startsWith(term) || normalizedSearchTextHasWordStart(value,term));
}

function doesSearchProfilePrefixMatch(searchValues = [], terms = [], prepared = null) {
    const values = Array.isArray(searchValues) ? searchValues : [];
    const plan=prepared || prepareInventorySearchTerms(terms);
    if (!prepared && plan.joined && values.some(value=>String(value || '').startsWith(plan.joined))) return true;
    return normalizedInventoryPrefixMatch(prepared ? values : values.map(normalizeSearchValue),plan);
}

/** @param {object} item Candidate row. @param {string} rawTerm Search query. @param {string} [profileName] Visible search field profile. @param {object} [options] Prefix and prepared query options. @returns {boolean} Whether the exact row matches the query. */
function matchesItemSearch(item, rawTerm, profileName = '', options = {}) {
    const terms = Array.isArray(options?.terms) ? options.terms : tokenizeSearchValue(rawTerm);
    if (!terms.length) return true;
    const preparedWords = profileName && item?._searchProfileWordStarts?.[profileName];
    if (Array.isArray(preparedWords) && terms.every(term => preparedWords.some(word => word.startsWith(term)))) return true;
    const searchValues = getSearchValuesForProfile(item, profileName, options?.normalizeField);
    if (!searchValues.length) return false;
    const prefixMatched = doesSearchProfilePrefixMatch(searchValues, terms, options?.searchPlan || prepareInventorySearchTerms(terms));
    if (prefixMatched || options?.prefixOnly === true) return prefixMatched;
    return terms.every(term=>searchValues.some(value=>normalizedSearchTextHasWordStart(value,term)));
}

/** @param {Array<object>} items Scoped inventory rows. @param {string} rawTerm Search query. @param {string} [profileName] Visible search field profile. @returns {Array<object>} Matching rows in their existing order. */
function filterBySearch(items, rawTerm, profileName = '') {
    if (!rawTerm) return items;
    const scopedItems = Array.isArray(items) ? items : [];
    if (!scopedItems.length) return [];
    const normalizedTerm = normalizeSearchValue(rawTerm);
    if (!normalizedTerm) return scopedItems;
    let cacheBucket = searchFilterCache.get(scopedItems);
    if (!cacheBucket) {
        cacheBucket = new Map();
        searchFilterCache.set(scopedItems, cacheBucket);
    }
    const cacheKey = `${searchFilterCacheEpoch}|${String(profileName || '').trim().toLowerCase()}|${normalizedTerm}|${scopedItems.length}`;
    if (cacheBucket.has(cacheKey)) {
        incrementInternalPerfCounter('searchCacheHits');
        return cacheBucket.get(cacheKey);
    }
    const searchStartedAt = beginInternalPerfMeasure();
    const terms = tokenizeSearchValue(normalizedTerm);
    const searchPlan=prepareInventorySearchTerms(terms);
    const normalizeField=prepareInventorySearchFieldNormalizer();
    const prefixOptions = { prefixOnly:true, terms, searchPlan, normalizeField };
    const fallbackOptions = { terms, searchPlan, normalizeField };
    const prefixItems = scopedItems.filter(item=>matchesItemSearch(item, normalizedTerm, profileName, prefixOptions));
    const filteredItems = prefixItems.length
        ? prefixItems
        : scopedItems.filter(item=>matchesItemSearch(item, normalizedTerm, profileName, fallbackOptions));
    recordInternalPerfDuration('searchRenderDurations', searchStartedAt, String(profileName || 'default').trim() || 'default');
    cacheBucket.set(cacheKey, filteredItems);
    trimInternalCacheMap(cacheBucket);
    return filteredItems;
}
