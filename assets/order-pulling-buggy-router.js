const ORDER_PULL_TAB = 'order-pulling';

function isParkHillOrderPuller(profile = typeof nativeAuthProfile === 'undefined' ? null : nativeAuthProfile) {
    return profile?.role === 'order_puller' && !profile.disabled_at && !profile.must_change_password;
}

function orderPullEligible(profile, access, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at) return false;
    if (profile.role === 'order_puller') return isParkHillOrderPuller(profile);
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

const PH_PULL_CAP = 650;
const PH_PULL_SUPERVISORS = new Set(['super-admin','admin','shipping-supervisor','supervisor','manager']);

function phPullSupervisorAllowed(profile, farm, preview) {
    if (!profile || preview || farm !== '10-PH' || profile.disabled_at || profile.must_change_password) return false;
    return PH_PULL_SUPERVISORS.has(profile.role);
}

function phPullTeamChoices(snapshot, editingId, primary = '') {
    const occupied = snapshot.teams.filter(team => team.team_id !== editingId);
    const units = new Set(occupied.map(team => team.unit_number));
    const people = new Set(occupied.flatMap(team => [team.puller_primary,team.puller_helper]));
    const pullers = snapshot.pullers.filter(puller => !people.has(puller));
    return {
        units:snapshot.units.filter(unit => !units.has(unit)),
        primary:pullers,
        helper:pullers.filter(puller => puller !== primary)
    };
}

function phPullTagWdu(row) {
    return Math.round(Number(row.wingdingunits)*1e12);
}

function phPullSelectedWdu(rows, selected) {
    return rows.reduce((total,row) => total+(selected.has(row.pull_tag_id) ? phPullTagWdu(row) : 0),0);
}

function phPullToggleTag(rows, selected, id) {
    if (selected.delete(id)) return true;
    const row = rows.find(candidate => candidate.pull_tag_id === id);
    const wdu = row && phPullTagWdu(row);
    if (!(wdu>0) || phPullSelectedWdu(rows,selected)+wdu>PH_PULL_CAP*1e12) return false;
    selected.add(id);
    return true;
}

function phPullGroupBatch(rows) {
    const chosen = new Set();
    let available = PH_PULL_CAP*1e12;
    for (const row of rows) {
        const wdu = phPullTagWdu(row);
        if (!(wdu>0) || wdu>available) continue;
        chosen.add(row.pull_tag_id);
        available -= wdu;
        if (!available) break;
    }
    return chosen;
}
