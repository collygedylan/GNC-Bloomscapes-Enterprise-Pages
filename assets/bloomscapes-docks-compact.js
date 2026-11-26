const bloomscapesDockBrowseMetadata={owner:'',visit:null,checkedAt:0};

function bloomscapesDockBrowseMetadataOwner() {
    return JSON.stringify([getSupabaseReadIdentityScope(),getBloomscapesFarm()]);
}

function bloomscapesDockBrowseMetadataRevision() {
    return [dockWorkflowStateEpoch,dockTeamStatusRenderVersion,dockTeamStatusLoaded,dockItemProgressLoaded,
        dockIssueDataLoaded,dockTeamSchemaReady,dockItemSchemaReady,dockIssueStatusSchemaReady,dockIssueAllocationSchemaReady].join('|');
}

function requestBloomscapesDockBrowseMetadata() {
    const visit=currentDocksReadVisit();
    if (!visit || visit.aborted) return;
    const owner=bloomscapesDockBrowseMetadataOwner();
    const state=bloomscapesDockBrowseMetadata;
    if (state.owner===owner && state.visit===visit && Date.now()-state.checkedAt<45000) return;
    const jobs=[];
    if (!dockTeamStatusLoaded && !dockTeamStatusPromise && dockTeamSchemaReady!==false) jobs.push(ensureDockTeamStatusLoaded);
    if (!dockItemProgressLoaded && !dockItemProgressPromise && dockItemSchemaReady!==false) jobs.push(ensureDockItemStatusLoaded);
    if (!dockIssueDataLoaded && !dockIssueDataPromise && dockIssueStatusSchemaReady!==false && dockIssueAllocationSchemaReady!==false) {
        jobs.push(ensureDockIssueDataLoaded);
    }
    if (!jobs.length) return;
    state.owner=owner;
    state.visit=visit;
    state.checkedAt=Date.now();
    const revision=bloomscapesDockBrowseMetadataRevision();
    const current=()=>!visit.aborted && owner===bloomscapesDockBrowseMetadataOwner();
    const dispatch=read=>Promise.resolve().then(()=>current() ? read() : undefined);
    void Promise.allSettled(jobs.map(dispatch)).then(()=>{
        if (!current()) return;
        if (revision!==bloomscapesDockBrowseMetadataRevision()) scheduleDocksRender(0);
    });
}

const dockCompactTripTeam = [['checker','Checker'],['inspector','Inspector'],['mistake_guy','Mistake Guy']];

function compactDockTripStatus(saved,workflow) {
    if (workflow?.truck === 'live') return 'LIVE DRIVER';
    const status = String(saved.status || workflow?.status || '').toUpperCase();
    if (status === 'LOADING NOW') return 'LOADING';
    return status || (workflow?.truck === 'trailer' ? 'DROP TRAILER' : '—');
}

function dockCompactFact(label,value,style = 'bloomscapes-dock-fact') {
    return `<span class="${style}"><strong>${label}</strong><span>${pullHtml(value || '—')}</span></span>`;
}

function renderBloomscapesCompactTrip(card, trip, canEdit, workflow) {
    const {tripNumber,savedInfo,count} = trip;
    const edit = workflow ? pullAllowed(workflow,'set_team') || pullAllowed(workflow,'set_truck') : canEdit;
    const attrs = edit ? buildFastInvokeAttrs(workflow ? 'openBloomscapesDockTrip' : 'openDockInfoModal',
        workflow ? [workflow.dock,tripNumber,'Team & Status'] : [card.dockNum,tripNumber],'Edit Trip Team & Status') : '';
    const team = dockCompactTripTeam.map(([key,label]) => {
        const name = workflow ? workflow[key] : savedInfo[key === 'mistake_guy' ? 'mistake' : key];
        return dockCompactFact(label.toUpperCase(),name);
    }).join('');
    return `<section class="bloomscapes-dock-trip" data-dock-trip-strip>
        <div class="bloomscapes-dock-heading">
            <strong>TRIP ${pullHtml(tripNumber)}</strong>
            <span class="bloomscapes-dock-pill">${pullHtml(compactDockTripStatus(savedInfo,workflow))}</span>
            <span>${count ?? card.count} ROWS</span>
        </div>
        <div class="bloomscapes-dock-facts bloomscapes-dock-team">${team}</div>
        ${edit ? `<button type="button" class="bloomscapes-dock-edit" ${attrs}>✏️ Edit Trip Team &amp; Status</button>` : ''}
        ${renderBloomscapesLoadMaximizer({kind:'trip',dock:card.dockNum,trip:tripNumber})}
    </section>`;
}

function renderBloomscapesCompactDockCard(card, canEdit, tripIndex = new Map()) {
    const {summary} = card;
    const pills = [
        dockCompactFact('CONSIGNEE:',card.consigneeSummary,'bloomscapes-dock-pill'),
        dockCompactFact('REP:',card.repSummary,'bloomscapes-dock-pill'),
        summary.suspended ? dockCompactFact('SUSPENDED',summary.suspended,'bloomscapes-dock-pill') : ''
    ].join('');
    const trips = card.trips.map(trip=>renderBloomscapesCompactTrip(card,trip,canEdit,
        tripIndex.get(pullTripIdentity(card.dockNum,trip.tripNumber)))).join('');
    return `<article data-docks-dock-card="${pullHtml(card.dockNum)}" class="bloomscapes-dock-card mb-2 p-3">
        <button type="button" class="bloomscapes-dock-heading w-full text-left"
            ${buildFastInvokeAttrs('selectDock',[card.dockNum],`Open ${card.dockLabel}`)}>
            <strong><i class="ph-bold ph-truck" aria-hidden="true"></i> ${pullHtml(card.dockLabel)}</strong>
            <span>${summary.dropCount} DROPS · ${summary.rowCount} ROWS · QTY ${pullHtml(summary.quantity)}</span>
            <i class="ph-bold ph-caret-right" aria-hidden="true"></i>
        </button>
        <div class="bloomscapes-dock-pills">${pills}</div>
        <div class="bloomscapes-dock-facts">
            ${dockCompactFact('📍 STATES:',card.states.join(', '))}
            ${dockCompactFact('📅 PLAN START:',card.planStartDates.join(', '))}
        </div>
        ${trips}
        ${renderBloomscapesLoadMaximizer({kind:'dock',dock:card.dockNum})}
    </article>`;
}

function pullTripIdentity(dock, trip) {
    return JSON.stringify([normalizeDockViewDockKey(dock),String(trip || '')]);
}

function renderBloomscapesDockUrgency(row) {
    const match = getBloomscapesUrgentSuspendTag(row);
    return match ? `<span class="rounded bg-red-800 px-2 py-1 text-xs font-bold text-white">🚨 LIVE DRIVER · STOPNUMBER ${pullHtml(match.drop)}</span>` : '';
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
