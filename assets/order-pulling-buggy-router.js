const ORDER_PULL_TAB = 'order-pulling';

function orderPullEligible(profile, access, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at) return false;
    const role = String(profile.role || '').toLowerCase().replace(/[-_\s]/g,'');
    if (['rep','salesrep'].includes(role)) return false;
    return access?.que_order_pulling === 'Y' || profile.department === '161'
        || ['admin','superadmin','shippingsupervisor'].includes(role) || profile.username === 'dylan_collyge';
}

function orderPullRows(receipt, mode, query) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/);
    return (receipt?.rows || []).filter(row => {
        if (mode === 'buggy' && (!receipt.buggy || row.buggy_id !== receipt.buggy.buggy_id)) return false;
        const search = [row.common_name,row.itemcode,row.container_size,row.locationcode,row.lotcode,row.dock,
            row.stopnumber,row.tripnumber,row.dock_status,row.consignee].join(' ').toLowerCase();
        return terms.every(term => search.includes(term));
    });
}

function orderPullUnloadStops(receipt) {
    if (receipt?.buggy?.status !== 'ready_to_unload') return [];
    const stops = new Map();
    for (const row of orderPullRows(receipt,'buggy','')) {
        if (row.pull_status !== 'on_buggy') continue;
        const key = JSON.stringify([row.dock,row.stopnumber,row.tripnumber]);
        stops.set(key, {
            dock:row.dock,stopnumber:row.stopnumber,tripnumber:row.tripnumber,
            buggy_id:receipt.buggy.buggy_id
        });
    }
    return [...stops.values()];
}
