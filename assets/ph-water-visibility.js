
function phWetBlockCode(tag,state) {
    if (!tag || state?.warehouse !== '10-PH') return '';
    const farm = tag.warehouse ?? tag.warehouse_id ?? tag.WAREHOUSE ?? tag.WAREHOUSE_ID;
    if (farm && farm !== '10-PH') return '';
    const block = parseCanonicalBlockKey(tag.locationcode ?? tag.LOCATIONCODE)?.block_code;
    if (!block || state.blockWaterStatus?.[block]?.is_water_on !== true) return '';
    return block;
}

function phWetDockDisposition(tag,state) {
    const status = state.resolveDockStatus?.(tag) ?? tag.dock_status;
    return String(status || '').trim().toUpperCase() === 'LIVE DRIVER' ? 'override' : 'paused';
}

/**
 * @param {object} tag Shipping or Suspend tag.
 * @param {object} state Selected farm and water receipts.
 * @returns {string} Paused, Live Driver override or dry disposition.
 */
function phWaterTagDisposition(tag,state) {
    return phWetBlockCode(tag,state) ? phWetDockDisposition(tag,state) : '';
}

/**
 * @param {object} tag Candidate tag.
 * @param {object} state Farm-scoped water and dock status.
 * @returns {boolean} Whether active water pauses this tag.
 */
function isTagHiddenByActiveWater(tag, state) {
    return phWaterTagDisposition(tag,state) === 'paused';
}

/**
 * @param {string} today ISO operating day.
 * @param {boolean} tomorrow Whether to advance one UTC day.
 * @returns {string} Requested ISO schedule day.
 */
function phWaterScheduleDay(today, tomorrow) {
    if (!tomorrow) return today;
    const date = new Date(today+'T00:00:00Z');
    date.setUTCDate(date.getUTCDate()+1);
    return date.toISOString().slice(0,10);
}

/**
 * @param {object} row Block water receipt with its start time.
 * @param {number} now Current timestamp in milliseconds.
 * @returns {number} Nonnegative completed minutes since activation.
 */
function phWaterElapsed(row, now) {
    const elapsed = Math.max(0,Math.floor((now-Date.parse(row.water_on_at))/60000));
    return Number.isFinite(elapsed) ? elapsed : 0;
}

/**
 * @returns {string} Existing Live Driver water-override badge markup.
 */
function phWetTagBadgeHtml() {
    return '<strong class="ph-water-override">💧 WATER ON · 🚨 LIVE DRIVER OVERRIDE</strong>';
}

/**
 * @param {object} row Shipping pull tag.
 * @param {object} water Current water status.
 * @returns {boolean} Whether the tag is hidden before loading.
 */
function phShippingTagPaused(row,water) {
    return row.pull_status !== 'on_buggy' && isTagHiddenByActiveWater(row,water);
}

/**
 * @param {Array<object>} rows Visible shipping rows.
 * @param {object} water Water state and hidden counts from the receipt.
 * @returns {string} Wet-block counts or an empty string.
 */
function phShippingWetSummary(rows,water) {
    const counts = new Map(Object.entries(water.hiddenCounts || {}).filter(([block,n])=>
        water.blockWaterStatus[block]?.is_water_on && Number.isInteger(n) && n>0));
    const visible = new Map();
    for (const row of rows) {
        if (row.pull_status === 'on_buggy') continue;
        const block = phWetBlockCode(row,water);
        if (!block || phWetDockDisposition(row,water) !== 'paused') continue;
        visible.set(block,(visible.get(block) || 0)+1);
    }
    for (const [block,n] of visible) counts.set(block,Math.max(counts.get(block) || 0,n));
    if (!counts.size) return '';
    const total = [...counts.values()].reduce((sum,n)=>sum+n,0);
    return '💧 Wet-Block Hidden: '+total+' ('+[...counts.keys()].sort().join(', ')+')';
}
