function parseCanonicalBlockKey(locationcode) {
    const value = String(locationcode ?? '').trim().toUpperCase();
    if (value === 'PROP' || value === 'PROPAGATION') return {block_alpha:'PROP',block_number:0,block_code:'PROP'};
    const forward = /^(PROP|[A-L])[.-]?([0-9]{1,4})(?:[.][0-9]{1,3})?$/.exec(value);
    const reverse = /^([0-9]{1,4})(PROP|[A-L])$/.exec(value);
    if (!forward && !reverse) return null;
    const alpha = forward?.[1] ?? reverse[2];
    const number = Number(forward?.[2] ?? reverse[1]);
    if (number > 34) return null;
    const block = String(number).padStart(2,'0');
    return {block_alpha:alpha,block_number:number,block_code:alpha === 'PROP' && number === 0 ? 'PROP' : alpha+'.'+block};
}

function phWaterTagDisposition(tag, state) {
    if (!tag || state?.warehouse !== '10-PH') return '';
    const farm = tag.warehouse ?? tag.warehouse_id ?? tag.WAREHOUSE ?? tag.WAREHOUSE_ID;
    if (farm && farm !== '10-PH') return '';
    const block = parseCanonicalBlockKey(tag.locationcode ?? tag.LOCATIONCODE)?.block_code;
    if (!block || state.blockWaterStatus?.[block]?.is_water_on !== true) return '';
    const status = state.resolveDockStatus?.(tag) ?? tag.dock_status;
    return String(status || '').trim().toUpperCase() === 'LIVE DRIVER' ? 'override' : 'paused';
}

function isTagHiddenByActiveWater(tag, state) {
    return phWaterTagDisposition(tag,state) === 'paused';
}

function phWaterScheduleDay(today, tomorrow) {
    if (!tomorrow) return today;
    const date = new Date(today+'T00:00:00Z');
    date.setUTCDate(date.getUTCDate()+1);
    return date.toISOString().slice(0,10);
}

function phWaterElapsed(row, now) {
    const elapsed = Math.max(0,Math.floor((now-Date.parse(row.water_on_at))/60000));
    return Number.isFinite(elapsed) ? elapsed : 0;
}

function phWetTagBadgeHtml() {
    return '<strong class="ph-water-override">💧 WATER ON · 🚨 LIVE DRIVER OVERRIDE</strong>';
}

function phShippingTagPaused(row,water) {
    return row.pull_status !== 'on_buggy' && isTagHiddenByActiveWater(row,water);
}

function phShippingWetSummary(rows,water) {
    const counts = new Map(Object.entries(water.hiddenCounts || {}).filter(([block,n])=>
        water.blockWaterStatus[block]?.is_water_on && Number.isInteger(n) && n>0));
    const visible = new Map();
    for (const row of rows) {
        if (!phShippingTagPaused(row,water)) continue;
        const block = parseCanonicalBlockKey(row.locationcode ?? row.LOCATIONCODE).block_code;
        visible.set(block,(visible.get(block) || 0)+1);
    }
    for (const [block,n] of visible) counts.set(block,Math.max(counts.get(block) || 0,n));
    if (!counts.size) return '';
    const total = [...counts.values()].reduce((sum,n)=>sum+n,0);
    return '💧 Wet-Block Hidden: '+total+' ('+[...counts.keys()].sort().join(', ')+')';
}
