
function getInventoryQuantityChipValues(row,safeOptions) {
    const metric = (key, legacy) => {
        if (safeOptions.canonical !== true) return legacy;
        const value = row?.[key] ?? row?.[key.toLowerCase()];
        return value == null || String(value).trim() === '' ? legacy : value;
    };
    const primaryChips = [
        ['On Hand', metric('PTRONHAND', getCardPtrOnHandValue(row, safeOptions))],
        ['Review', metric('PTRREVIEWED', getCardPtrReviewedValue(row, safeOptions))],
        ['Available', metric('PTRAVAILABLE', getCardPtrAvailableValue(row, safeOptions))]
    ];
    const openStockChip = ['Open Stock', metric('S_LTS', getCardOpenStockValue(row, safeOptions))];
    const locationMetricRow = safeOptions.locationMetricItem || row;
    const sourceView = String(safeOptions.sourceView || '');
    const knownLocationPhotoMatch = safeOptions.knownLocationPhotoMatch;
    const locationPhotoMatch = knownLocationPhotoMatch !== null && knownLocationPhotoMatch !== undefined
        && String(knownLocationPhotoMatch).trim() !== '' && Number.isFinite(Number(knownLocationPhotoMatch))
        ? Number(knownLocationPhotoMatch) : ['N/A', 'Not verified'].includes(String(knownLocationPhotoMatch)) ? 'N/A' : formatLocPhotoMatchQtyValue(locationMetricRow, sourceView);
    const locationAggregate = safeOptions.canonical === true ? getCardLocationOnHandServerAggregate(locationMetricRow, { preserveUnknown: true }) : null;
    const knownLocationOnHand = safeOptions.knownLocationOnHand;
    const locationOnHand = knownLocationOnHand !== null && knownLocationOnHand !== undefined && Number.isFinite(Number(knownLocationOnHand)) && String(knownLocationOnHand).trim() !== ''
        ? Number(knownLocationOnHand)
        : locationAggregate?.verified === true ? locationAggregate.value : getCardLocationOnHandValue(locationMetricRow);
    const locationChips = safeOptions.includeLocationMetrics === false ? [] : [
        ['Loc Photo Match', ['drive', 'request', 'docks', 'av', 'av-photo'].includes(sourceView) && locationPhotoMatch === 'Not verified' ? 'N/A' : locationPhotoMatch],
        ['Loc On Hand', preserveCardLocationOnHand(locationMetricRow, parseAppNumber(locationOnHand)) ?? (safeOptions.canonical === true ? locationOnHand : (locationOnHand ?? (safeOptions.missingValue === 'N/A' ? 'N/A' : 'Unknown')))]
    ];
    const side = sourceView === 'drive' && typeof phInventoryPullSide === 'function' && phInventoryPullSide(locationMetricRow);
    if (side) locationChips.push(['Pull Side',side]);
    return {primaryChips,openStockChip,locationChips};
}

function buildInventoryQuantityChipsHtml(row = null, options = {}) {
    const safeOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const sizeClasses = safeOptions.compact ? 'px-2 py-1' : 'px-3 py-1';
    const quantityToneClasses = [
        'border-emerald-200 bg-emerald-50 text-emerald-800',
        'border-sky-200 bg-sky-50 text-sky-800',
        'border-blue-200 bg-blue-50 text-blue-800',
        'border-violet-200 bg-violet-50 text-violet-800'
    ];
    const chipClassFor = (index = 0) => `rounded-full border ${quantityToneClasses[index] || quantityToneClasses[0]} ${sizeClasses}`;
    const stackedChipClassFor = (index = 0) => `app-card-qty-chip rounded-full border ${quantityToneClasses[index] || quantityToneClasses[0]} px-1.5 py-1 text-center`;
    const valueClass = 'text-slate-900';
    const metricIdFor = (label) => ({
        'On Hand': 'on-hand',
        Review: 'review',
        Available: 'available',
        'Open Stock': 'open-stock',
        'Loc Photo Match': 'loc-photo-match',
        'Loc On Hand': 'loc-on-hand'
    })[label] || '';
    const compactMetrics = safeOptions.compact === true || safeOptions.layout === 'row';
    const hydrationLabel = safeOptions.hydrationStatus && ['loading', 'missing', 'ambiguous', 'error', 'unavailable'].includes(safeOptions.hydrationStatus) ? '--' : '';
    const formatQuantity = (value) => {
        if ((safeOptions.sourceView==='docks' || typeof getCurrentVisibleViewId==='function' && getCurrentVisibleViewId()==='docks') && (value==null || !Number.isFinite(Number(String(value).replaceAll(',','')))
            || String(value).trim()==='')) return '0';
        if (hydrationLabel && (value == null || String(value).trim() === '')) return hydrationLabel;
        if (compactMetrics && /^(unknown|unavailable|not verified|loading.*|not found|check inventory)$/i.test(String(value || '').trim())) return '--';
        if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
            if (safeOptions.missingValue === 'N/A') return 'N/A';
            if (compactMetrics || safeOptions.canonical === true || safeOptions.preserveUnknown === true) return '--';
        }
        return normalizeCardQuantityValue(value);
    };
    const queueMetricAttr = (label) => safeOptions.queueMetricTelemetry === true && metricIdFor(label)
        ? ` data-queue-metric="${metricIdFor(label)}"` : '';
    const buildChip = ([label, value], className = '', index = 0) => `<span class="app-card-qty-chip ${className || chipClassFor(index)}" data-inventory-card-metric="${metricIdFor(label)}"><span class="app-card-qty-label">${escapeHtml(label)}</span><span class="app-card-qty-value ${valueClass}"${label === 'Loc Photo Match' ? ' data-loc-photo-match-value' : ''}${queueMetricAttr(label)}>${escapeHtml(formatQuantity(value))}</span></span>`;
    const buildStackedChip = ([label, value], index = 0) => {
        const formatted = formatQuantity(value);
        return `<span class="${stackedChipClassFor(index)}" data-inventory-card-metric="${metricIdFor(label)}"><span class="app-card-qty-label">${escapeHtml(label)}</span><span class="app-card-qty-value${formatted === 'Unknown' ? ' app-card-qty-value--unknown' : ''} ${valueClass}"${label === 'Loc Photo Match' ? ' data-loc-photo-match-value' : ''}${queueMetricAttr(label)}>${escapeHtml(formatted)}</span></span>`;
    };
    const {primaryChips,openStockChip,locationChips}=getInventoryQuantityChipValues(row,safeOptions);
    const allChips = [...primaryChips, openStockChip, ...locationChips];
    const trailingChipsHtml = String(safeOptions.trailingChipsHtml || '').trim();
    if (safeOptions.layout === 'row') {
        const gridGapClass = safeOptions.compact ? 'gap-1.5' : 'gap-2';
        return `<div class="app-card-qty-row grid ${gridGapClass} text-[9px] font-black uppercase">${allChips.map((chip, index) => buildStackedChip(chip, index)).join('')}${trailingChipsHtml}</div>`;
    }
    if (safeOptions.layout === 'stacked') {
        const gridGapClass = safeOptions.compact ? 'gap-1.5' : 'gap-2';
        const openStockClass = safeOptions.compact ? 'mt-1.5' : 'mt-2';
        return `<div class="w-full"><div class="app-card-qty-grid grid ${gridGapClass} text-[9px] font-black uppercase">${primaryChips.map((chip, index) => buildStackedChip(chip, index)).join('')}</div><div class="${openStockClass} flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">${allChips.slice(3).map((chip, index) => buildChip(chip, '', index + 3)).join('')}${trailingChipsHtml}</div></div>`;
    }
    return allChips.map((chip, index) => buildChip(chip, '', index)).join('') + trailingChipsHtml;
}
