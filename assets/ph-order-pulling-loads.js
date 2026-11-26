function phAssignedBuggyMetricPills(load) {
    if (!load) return '';
    return phBuggyMetricPills(load).replace('⛽ '+load.fuelGal.toFixed(3)+' gal','⛽ '+load.fuelGal.toFixed(2)+' gal');
}

function phPullLoadGroups(rows,receipt) {
    const groups = new Map();
    for (const row of rows) {
        const id = row.buggy_id || '';
        if (!groups.has(id)) groups.set(id,[]);
        groups.get(id).push(row);
    }
    const output = [];
    for (const [id,visible] of groups) {
        if (!id) {
            output.push(...visible.map(row => ({row})));
            continue;
        }
        const route = receipt.load_routes?.[id];
        const manifest = route?.load_manifest || receipt.rows.filter(row => row.buggy_id === id);
        const load = phEstimateBuggyLoad(manifest,{origin:route?.load_origin,hasPartner:route?.has_partner ?? Boolean(receipt.partner)});
        const stops = load?.rows || phSortPullStops(manifest);
        const positions = new Map(stops.map((row,index) => [row.pull_tag_id,index+1]));
        const ordered = [...visible].sort((a,b) => positions.get(a.pull_tag_id)-positions.get(b.pull_tag_id));
        output.push(...ordered.map((row,index) => ({
            row,stop:positions.get(row.pull_tag_id),total:stops.length,header:index === 0,load
        })));
    }
    return output;
}

function phPullLoadHeading(entry) {
    const header = document.createElement('header');
    header.className = 'ph-pull-load-heading';
    header.dataset.phLoadHeader = entry.row.buggy_id;
    const title = document.createElement('strong');
    title.textContent = entry.row.unit_number ? 'Buggy load · Unit '+entry.row.unit_number : 'Buggy load';
    header.append(title);
    if (entry.load) {
        header.append(' · '+entry.total+' Tags · '+entry.load.totalWdu+' / '+PH_PULL_CAP+' WDU');
        header.insertAdjacentHTML('beforeend',phAssignedBuggyMetricPills(entry.load));
    } else header.append(' · Estimate unavailable for this route.');
    return header;
}

function paintPhPullStop(card,entry) {
    if (!card || card.dataset.orderPullTag !== entry.row.pull_tag_id) return;
    if (entry.stop) {
        const label = document.createElement('strong');
        label.className = 'ph-pull-stop';
        label.textContent = 'STOP '+entry.stop+' OF '+entry.total;
        const side = phPullSideLabel(entry.row);
        if (side) label.textContent += ' · Pull Side: '+side;
        card.prepend(label);
    }
    if (entry.header) card.before(phPullLoadHeading(entry));
}

function phPullLoadWindow(rows,mount,receipt) {
    if (receipt?.warehouse !== '10-PH') return {rows,mount};
    const entries = phPullLoadGroups(rows,receipt);
    return {rows:entries,mount(section,items) {
        mount(section,items.map(entry => entry.row));
        const cards = section.querySelectorAll('[data-order-pull-tag]');
        items.forEach((entry,index) => paintPhPullStop(cards[index],entry));
    }};
}

if (typeof customElements !== 'undefined' && !customElements.get('ph-order-pulling-loads')) {
    customElements.define('ph-order-pulling-loads',class extends HTMLElement {
        prepareScrollWindow(rows,mount) {
            const receipt = getBloomscapesFarm() === '10-PH' && orderPullState().receipt;
            return phPullLoadWindow(rows,mount,receipt);
        }
    });
}
