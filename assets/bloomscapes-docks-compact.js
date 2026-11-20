
const dockCompactTripTeam = [
    ['checker','Checker'],['inspector','Inspector'],['mistake','Mistake Guy']
];

function dockCompactTripPill(label, value, edit) {
    const body = `${label} ▾ <span class="max-w-16 truncate">${pullHtml(value || '—')}</span>`;
    const style = 'inline-flex items-center gap-1 rounded-full border border-current px-1.5 py-1';
    return edit ? `<button type="button" class="${style}" title="${pullHtml(value || label)}" ${edit}>${body}</button>`
        : `<span class="${style}" title="${pullHtml(value || label)}">${body}</span>`;
}

function renderBloomscapesCompactTrip(card, trip, canEdit, workflow) {
    const {tripNumber, savedInfo} = trip;
    const teamEditable = workflow ? pullAllowed(workflow,'set_team') : canEdit;
    const attrs = label => buildFastInvokeAttrs(workflow ? 'openBloomscapesDockTrip' : 'openDockInfoModal',
        workflow ? [workflow.dock,tripNumber,label] : [card.dockNum,tripNumber],label);
    const team = dockCompactTripTeam.map(([key,label]) => {
        const name = workflow ? workflow[key === 'mistake' ? 'mistake_guy' : key] : savedInfo[key];
        return dockCompactTripPill(label,name,teamEditable ? attrs(label) : '');
    }).join('');
    const editStatus = teamEditable || (workflow && pullAllowed(workflow,'set_truck'));
    const status = workflow?.truck === 'live' ? '🚨 LIVE DRIVER · ' + workflow.status : (workflow?.status || savedInfo.status);
    return `<div class="flex min-h-9 flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-current px-1.5 text-[10px]" data-dock-trip-strip>
        <strong>${pullHtml(tripNumber)}</strong><span>${pullHtml(status)}</span>${team}
        ${editStatus ? `<button type="button" ${attrs('Team & Status')} class="rounded-full border border-current px-1.5 py-1">✏️ Team &amp; Status</button>` : ''}</div>
        ${renderBloomscapesLoadMaximizer({kind:'trip',dock:card.dockNum,trip:tripNumber})}`;
}

function dockCompactFact(label, value) {
    return `<span><strong>${label}</strong> ${pullHtml(value || '—')}</span>`;
}

function renderBloomscapesCompactDockCard(card, canEdit, tripIndex = new Map()) {
    const summary = card.summary;
    const facts = [
        dockCompactFact('Consignee',card.consigneeSummary),dockCompactFact('Rep',card.repSummary),
        dockCompactFact('Suspended',String(summary.suspended || 0)),
        dockCompactFact('States',card.states.join(', ')),dockCompactFact('Plan Start',card.planStartDates.join(', '))
    ].join('');
    const trips = card.trips.map(trip => renderBloomscapesCompactTrip(card,trip,canEdit,tripIndex.get(pullTripIdentity(card.dockNum,trip.tripNumber)))).join('');
    return `<article data-docks-dock-card="${pullHtml(card.dockNum)}" class="mb-2 overflow-hidden rounded-xl border ${card.borderCls} bg-white p-2">
        <button type="button" class="flex w-full items-center justify-between text-left"
            ${buildFastInvokeAttrs('selectDock',[card.dockNum],`Open ${card.dockLabel}`)}>
            <strong class="${card.textCls}">${pullHtml(card.dockLabel)}</strong>
            <span class="text-xs">${summary.dropCount} Drops · ${summary.rowCount} Rows · Qty ${pullHtml(summary.quantity)} <i class="ph-bold ph-caret-right"></i></span>
        </button>
        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">${facts}</div>
        ${renderBloomscapesLoadMaximizer({kind:'dock',dock:card.dockNum})}
        <div class="mt-1 space-y-1">${trips}</div></article>`;
}

function pullTripIdentity(dock, trip) {
    return JSON.stringify([normalizeDockViewDockKey(dock),String(trip || '')]);
}

function renderBloomscapesDockUrgency(row) {
    const match = getBloomscapesUrgentSuspendTag(row);
    return match ? `<span class="rounded bg-red-800 px-2 py-1 text-xs font-bold text-white">🚨 LIVE DRIVER · Drop ${pullHtml(match.drop)}</span>` : '';
}

function sortBloomscapesUrgentSuspendTags(rows) {
    if (!currentBloomscapesDockBoard()?.suspend.length) return rows;
    const rank = new Map(rows.map(row => [row,getBloomscapesUrgentSuspendTag(row)]));
    return rows.slice().sort((left,right) => {
        const a = rank.get(left);
        const b = rank.get(right);
        return Number(!!b) - Number(!!a) || (a && b ? Number(b.drop) - Number(a.drop) : 0);
    });
}
