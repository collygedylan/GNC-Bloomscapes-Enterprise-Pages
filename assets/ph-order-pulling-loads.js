function phAssignedBuggyMetricPills(load) {
    if (!load) return '';
    return phBuggyMetricPills(load).replace('⛽ '+load.fuelGal.toFixed(3)+' gal','⛽ '+load.fuelGal.toFixed(2)+' gal');
}

function phPullUnloadKey(row) {
    return JSON.stringify([row.dock,row.stopnumber]);
}

function sortPhPullVisible(visible,positions,unloads) {
    const dropRank = row => unloads?.get(phPullUnloadKey(row)) ?? Number.MAX_SAFE_INTEGER;
    return [...visible].sort((a,b) => dropRank(a)-dropRank(b)
        || positions.get(a.pull_tag_id)-positions.get(b.pull_tag_id));
}

function phPullLoadGroups(rows,receipt) {
    const groups = new Map();
    const unloads = new Map(orderPullUnloadStops(receipt).map((stop,index)=>[phPullUnloadKey(stop),index]));
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
        const ordered = sortPhPullVisible(visible,positions,id === receipt.buggy?.buggy_id ? unloads : null);
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

function paintPhPullStop(card,entry,state,activeScan) {
    if (!card || card.dataset.orderPullTag !== entry.row.pull_tag_id) return;
    const water = typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    if (water && phWaterTagDisposition(entry.row,water) === 'override') {
        (card.querySelector('.app-drive-card-header') || card).insertAdjacentHTML('beforeend',phWetTagBadgeHtml());
    }
    if (entry.stop) {
        const label = document.createElement('strong');
        label.className = 'ph-pull-stop';
        label.textContent = 'STOP '+entry.stop+' OF '+entry.total;
        const side = phPullSideLabel(entry.row);
        if (side) label.textContent += ' · Pull Side: '+side;
        const heading = card.querySelector(".app-drive-card-header") || card;
        heading.prepend(label);
    }
    if (entry.header) card.before(phPullLoadHeading(entry));
    const drop = phQrPullDrop(entry.row);
    if (drop) {
        const sign = document.createElement('span');
        sign.className = 'ph-qr-drop';
        sign.textContent = drop+' · ERP Stop '+entry.row.stopnumber;
        card.querySelector('.app-drive-card-header')?.append(sign);
    }
    paintPhQrScanStop(card,entry.row,state,activeScan);
}

function phPullLoadWindow(rows,mount,receipt,state) {
    if (receipt?.warehouse !== '10-PH') return {rows,mount};
    const entries = phPullLoadGroups(rows,receipt);
    const activeScan = state?.teamOnly && activePhQrSession(receipt,receipt.buggy?.buggy_id);
    return {rows:entries,mount(section,items) {
        mount(section,items.map(({row}) => ({...row,bay_number:phQrBayNumber(row.locationcode,row.bay_number)})));
        const cards = section.querySelectorAll('[data-order-pull-tag]');
        items.forEach((entry,index) => paintPhPullStop(cards[index],entry,state,activeScan));
    }};
}

if (typeof customElements !== 'undefined' && !customElements.get('ph-order-pulling-loads')) {
    customElements.define('ph-order-pulling-loads',class extends HTMLElement {
        prepareScrollWindow(rows,mount) {
            const state = getBloomscapesFarm() === '10-PH' && orderPullState();
            if (state) paintPhQrScanHeader(state);
            return phPullLoadWindow(rows,mount,state?.receipt,state);
        }
    });
}
