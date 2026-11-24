const pullWorkspacePill = 'dock-dispatch-pill shrink-0 rounded-full px-3 text-xs font-semibold';
const pullWorkspaceCard = 'dock-dispatch-card space-y-2 rounded-xl p-3';
const pullTruckLabels = {live:'🚨 Live Driver',trailer:'Trailer',blank:'Blank'};
const pullActionLabels = {
    pulled:'Mark pulled',checked:'Checker done',inspected:'Inspector done',tagged:'Tagging done',
    loaded:'Loaded / Done',report_mistake:'Report mistake or shortage',fix_mistake:'Confirm replacement'
};
const pullListPageSizes = {tags:12,mistakes:12,traffic:8,teams:8,borrows:8,'assigned-drops':8};

function pullHtml(value) {
    return escapeHtml(String(value ?? ''));
}

function pullOptions(choices, selected) {
    return choices.map(([value,label]) => `<option value="${pullHtml(value)}"${String(selected) === String(value) ? ' selected' : ''}>${pullHtml(label)}</option>`).join('');
}

function pullChoices(people) {
    return people.map(person => [person.username,[person.name || person.username,person.department].filter(Boolean).join(' · ')]);
}

function pullHidden(input) {
    return Object.entries(input).filter(([,value]) => value != null).map(([key,value]) => `<input type="hidden" name="${key}" value="${pullHtml(value)}">`).join('');
}

function pullForm(action, input, controls = '', label = pullActionLabels[action]) {
    return `<form data-pull-command="${action}" class="flex flex-wrap items-center gap-2">${pullHidden(input)}${controls}<button class="${pullWorkspacePill}" type="submit">${pullHtml(label)}</button></form>`;
}

function pullSelect(name, label, choices, selected, extra = '') {
    return `<select class="${pullWorkspacePill}" name="${name}" aria-label="${label}" ${extra}>${pullOptions(choices, selected)}</select>`;
}

function pullAllowed(row, action) {
    return row.allowed?.includes(action) === true;
}

function pullDockDay(row) {
    return [row.day || row.plan_start || '',row.dock || ''].join(' · ');
}

const pullLocationCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});

function pullRouteByLocation(left, right) {
    return pullLocationCollator.compare(String(left || ''),String(right || ''));
}

function compareBloomscapesPullTags(left, right) {
    return pullTruckRouteRank(left) - pullTruckRouteRank(right)
        || Number(right.drop) - Number(left.drop)
        || pullRouteByLocation(left.blockalpha,right.blockalpha)
        || pullRouteByLocation(left.locationcode,right.locationcode)
        || pullRouteByLocation(left.id,right.id);
}

function pullTruckRouteRank(row) {
    if (row.urgent === true || (row.truck === 'live' && row.status === 'open')) return 0;
    return row.truck === 'trailer' ? 1 : 2;
}

function pullKey(row) {
    return [row.dock,row.trip,row.drop].join('\u001f');
}

function pullFilterTag(row, filters) {
    return (!filters.truck || row.truck === filters.truck)
        && (!filters.dockDay || pullDockDay(row) === filters.dockDay)
        && (!filters.puller || row.puller === filters.puller)
        && (!filters.dock || row.dock === filters.dock)
        && (!filters.trip || row.trip === filters.trip);
}

function pullTagToolbar(board, filters) {
    const filter = (name,label,options) => pullSelect(name,label,options,filters[name],'data-pull-filter');
    const autoInput = pullAutoAssignScope(board.tags,filters);
    return `<div class="flex flex-nowrap items-center gap-1 overflow-x-auto pb-1" aria-label="Pull Tag filters">
        ${filter('truck','Truck', [['','Truck: All'],...Object.entries(pullTruckLabels)])}
        ${renderBloomscapesChoiceField('dockDay','Day / Dock','pull-day-filter',filters.dockDay,'',{className:pullWorkspacePill,attributes:'data-pull-filter'})}
        ${renderBloomscapesChoiceField('puller','Puller','pull-worker-filter',filters.puller,'',{className:pullWorkspacePill,attributes:'data-pull-filter'})}
        ${filter('route','Route',[['nursery','Route: Nursery Path']])}
        ${board.can_coordinate && autoInput ? pullForm('auto_assign',autoInput,'','⚡ Auto-Assign by WingDingUnits') : ''}
        ${board.can_borrow && board.people.length ? `<button class="${pullWorkspacePill}" type="button" data-pull-click="borrow">🤝 Borrow Help</button>` : ''}
        <button class="${pullWorkspacePill}" type="button" data-pull-click="refresh">Refresh</button></div>`;
}

function pullAutoAssignScope(tags, filters) {
    if (filters.dock && filters.trip) return {dock:filters.dock,trip:filters.trip};
    if (!filters.dockDay && !filters.puller && !filters.truck) return {};
    const scoped = tags.filter(tag => pullFilterTag(tag,filters));
    const first = scoped[0];
    if (!first?.dock || !first.trip || scoped.some(tag => tag.dock !== first.dock || tag.trip !== first.trip)) return null;
    return {dock:first.dock,trip:first.trip};
}

function renderPullBorrowPicker(board, row, tasks, tagTask) {
    if (!board.can_borrow || !board.people.length || !tasks.length) return '';
    const input = tagTask ? {id:row.id,dock:row.dock,trip:row.trip,drop:row.drop} : {dock:row.dock,trip:row.trip,drop:row.drop};
    const fields = renderBloomscapesChoiceField('username','Borrowed worker','pull-borrow-worker','','',{required:true,className:pullWorkspacePill})
        + pullSelect('task','Assigned task',tasks.map(task => [task,pullActionLabels[task]]),tasks[0]);
    return `<details><summary class="cursor-pointer text-xs font-semibold">➕ Borrow Help (All Departments)</summary>${pullForm('borrow',input,fields,'Assign help')}</details>`;
}

function renderPullHeaderBorrow(board, tags) {
    if (!board.can_borrow || !board.people.length || !tags.some(row => row.status === 'open')) return '';
    const fields = renderBloomscapesChoiceField('id','Pull Tag','pull-borrow-tag','','',{required:true,className:pullWorkspacePill})
        + renderBloomscapesChoiceField('username','Borrowed worker','pull-borrow-worker','','',{required:true,className:pullWorkspacePill});
    return `<details data-pull-borrow><summary class="cursor-pointer text-xs font-semibold">Borrow Help</summary>${pullForm('borrow',{task:'pulled'},fields,'Assign help')}</details>`;
}

function renderPullBorrows(board) {
    if (!board.borrows.length) return '';
    return `<details data-pull-list-section="borrows"><summary class="cursor-pointer text-xs font-semibold">Borrowed assignments (${board.borrows.length})</summary>
        <div data-pull-borrows class="space-y-1"></div></details>`;
}

function renderPullBorrowAssignment(row,board) {
    return `<div class="flex flex-wrap items-center gap-2">
        ${pullHtml(row.username)} · ${pullHtml(pullActionLabels[row.task] || row.task)} · Dock ${pullHtml(row.dock)} · STOPNUMBER ${pullHtml(row.drop)}
        ${board.can_borrow ? pullForm('release_borrow',{id:row.id},'','Release help') : ''}</div>`;
}

function pullTagHeader(row) {
    const urgency = row.urgent || row.truck === 'live' && row.status === 'open'
        ? '<strong class="rounded bg-red-800 px-2 py-1 text-xs text-white">🚨 LIVE DRIVER</strong>' : '';
    return `<div class="flex flex-wrap items-center gap-2"><strong>${pullHtml(row.itemcode)}</strong>
        ${urgency}<span class="text-xs">Dock ${pullHtml(row.dock)} · ${pullHtml(row.trip)} · STOPNUMBER ${pullHtml(row.drop)}</span></div>`;
}

function pullPrintLines(row) {
    return row.segments?.length ? row.segments : [{locationcode:row.locationcode,quantity:row.quantity}];
}

function pullTagLocationList(row) {
    return `<ul class="text-sm">${pullPrintLines(row).map(line => `<li>${pullHtml(line.locationcode)} · Qty ${pullHtml(line.quantity)}</li>`).join('')}</ul>`;
}

function renderPullTagActions(row, board, hasPullers) {
    const assign = pullAllowed(row,'assign') && hasPullers
        ? pullForm('assign',{id:row.id},renderBloomscapesChoiceField('puller','Puller','pull-assign',row.puller,'',
            {required:true,className:pullWorkspacePill}),'Assign puller') : '';
    return assign + (pullAllowed(row,'pulled') ? pullForm('pulled',{id:row.id}) : '')
        + (row.status === 'open' ? renderPullBorrowPicker(board,row,['pulled'],true) : '');
}

function renderPullDisclosure(type,key,label,open=false,className='') {
    return `<details class="${className}" data-pull-disclosure="${type}" data-pull-disclosure-key="${pullHtml(key)}" ${open?'open':''}>
        <summary class="cursor-pointer font-semibold">${pullHtml(label)}</summary><div data-pull-disclosure-actions></div></details>`;
}

function renderPullTag(row,board,state) {
    const actions = (pullAllowed(row,'assign') && state.hasPullers) || pullAllowed(row,'pulled') || (board.can_borrow && row.status==='open');
    const open = state.openDisclosures.has('tag:'+row.id);
    return `<article class="${pullWorkspaceCard}" data-pull-tag="${pullHtml(row.id)}">
        ${pullTagHeader(row)}${pullTagLocationList(row)}
        <p class="text-xs">${pullHtml(row.wingdingunits)} WingDingUnits · ${pullHtml(row.puller || 'Unassigned')} · ${row.status === 'pulled' ? 'Pulled' : 'Open'}</p>
        ${actions ? renderPullDisclosure('tag',row.id,'Pull Tag actions',open) : ''}</article>`;
}

function renderPullTrip(trip, edit) {
    const label = `Dock ${trip.dock} · ${trip.trip} · ${pullTruckLabels[trip.truck] || ''}`;
    return renderPullDisclosure('trip',pullKey(trip),label,edit,pullWorkspaceCard);
}

function renderPullTripActions(trip) {
    const input = {dock:trip.dock,trip:trip.trip};
    const teams = [['checker','Checker'],['inspector','Inspector'],['mistake_guy','Mistake Guy']];
    const fields = teams.map(([key,label]) => renderBloomscapesChoiceField(key,label,'pull-team',trip[key],trip[key] || 'Unassigned',
        {className:pullWorkspacePill})).join('');
    return (pullAllowed(trip,'set_truck') ? pullForm('set_truck',input,pullSelect('truck','Truck',Object.entries(pullTruckLabels),trip.truck),'Save truck') : '')
        + (pullAllowed(trip,'set_team') ? pullForm('set_team',input,fields,'Save team') : '');
}

function paintBloomscapesDockDisclosure(details,state) {
    const content = details.querySelector('[data-pull-disclosure-actions]');
    if (!content || !details.isConnected) return;
    if (!details.open) return content.replaceChildren();
    if (content.childElementCount || !state.board) return;
    const {pullDisclosure:type,pullDisclosureKey:key} = details.dataset;
    if (type==='traffic') return mountPullTrafficReceipt(content,state.trafficIndex.get(key));
    if (type==='drop') {
        mountPullDropEvidence(content,state.tagsByDrop.get(key) || []);
        return restoreBloomscapesDockDrafts(content);
    }
    const trip = type==='trip' && state.tripIndex?.get(key);
    const tag = type!=='trip' && state.tagIndex?.get(key);
    if (trip) content.innerHTML = renderPullTripActions(trip);
    else if (tag) {
        content.innerHTML = type==='tag' ? renderPullTagActions(tag,state.board,state.hasPullers) : renderPullMistakeActions(tag,state.board);
    }
    restoreBloomscapesDockDrafts(content);
}

function bindBloomscapesDockChoiceFields(host,state) {
    const people = predicate => pullChoices(eligiblePickerRows(state.board?.people || [],'docks').filter(predicate));
    bindBloomscapesChoiceFields(host,{
        'pull-borrow-worker':()=>people(()=>true),
        'pull-assign':()=>people(person=>person.puller_eligible===true),
        'pull-team':()=>[['','Unassigned'],...people(person=>person.team_eligible===true)],
        'pull-borrow-tag':()=>state.board.tags.filter(row=>row.status==='open' && pullFilterTag(row,state.filters)).map(row=>
            [row.id,`Dock ${row.dock} · STOPNUMBER ${row.drop} · ${row.itemcode} · ${row.locationcode}`]),
        'pull-day-filter':()=>pullDistinctFilters(state.board.tags,pullDockDay,'All days / docks'),
        'pull-worker-filter':()=>pullWorkerFilters(state.board)
    });
}

function pullDistinctFilters(rows,value,empty) {
    const keys = [...new Set(rows.map(value).filter(Boolean))].sort(pullRouteByLocation);
    return [['',empty],...keys.map(key=>[key,key])];
}

function pullWorkerFilters(board) {
    const names = new Map(pullChoices(eligiblePickerRows(board.people,'docks')));
    return pullDistinctFilters(board.tags,row=>row.puller,'All pullers')
        .filter(([key])=>!key || names.has(key)).map(([key,label])=>[key,names.get(key) || label]);
}

function paintBloomscapesDocksWorkspace(host, viewId, state) {
    const board = state.board;
    const heading = `<h2 class="text-lg font-bold">${bloomscapesDockWorkspaceTitles[viewId]}</h2>`;
    const message = state.error || (!board ? 'Loading Dock records…' : '');
    host.innerHTML = `<section class="space-y-2 p-3">${heading}<p role="status" data-pull-status>${pullHtml(message)}</p>
        ${board ? renderPullView(viewId,board,state) : (state.error ? `<button class="${pullWorkspacePill}" data-pull-click="refresh" type="button">Retry</button>` : '')}</section>`;
    if (board) mountPullLists(host,viewId,board,state);
    const borrow = host.querySelector('[data-pull-borrow]');
    if (borrow) restoreBloomscapesDockDrafts(borrow);
}

function mountPullList(host,state,key,rows,render,empty) {
    const list = host.querySelector('[data-pull-'+key+']');
    if (!list) return;
    const section = list.closest('details[data-pull-list-section]');
    if (section && !section.open) return list.replaceChildren();
    renderBloomscapesScrollCards(list,rows,row=>bloomscapesListNode(render(row)),{
        empty,size:pullListPageSizes[key],estimate:190,afterMount:chunk=>restorePullListChunk(chunk,state)
    });
}

function restorePullListChunk(chunk,state) {
    for (const details of chunk.querySelectorAll('[data-pull-disclosure][open]')) paintBloomscapesDockDisclosure(details,state);
    restoreBloomscapesDockDrafts(chunk);
}

function paintBloomscapesDockListSection(section,state) {
    const board=state.board;
    if (!board) return;
    if (section.dataset.pullListSection==='borrows') {
        return mountPullList(section,state,'borrows',board.borrows,row=>renderPullBorrowAssignment(row,board));
    }
    mountPullList(section,state,'teams',pullEditableTrips(board,state.filters),
        row=>renderPullTrip(row,state.openDisclosures.has('trip:'+pullKey(row))));
}

function mountPullLists(host,viewId,board,state) {
    mountPullList(host,state,'borrows',board.borrows,row=>renderPullBorrowAssignment(row,board));
    if (viewId === 'mistake-fix') {
        const mistakes = board.tags.filter(row=>Number(row.mistake_remaining)>0).sort(compareBloomscapesPullTags);
        return mountPullList(host,state,'mistakes',mistakes,row=>renderPullMistakeCard(row,board,state.openDisclosures.has('mistake:'+row.id)),
            'No open mistakes or tagging shortages.');
    }
    if (viewId === 'traffic-office') {
        return mountPullList(host,state,'traffic',board.traffic,
            row=>renderPullTrafficReceipt(row,state.openDisclosures.has('traffic:'+pullTrafficKey(row))),
            'No completed Docks have reached Traffic Office.');
    }
    const rows = board.tags.filter(row => pullFilterTag(row,state.filters)).sort(compareBloomscapesPullTags);
    mountPullList(host,state,'tags',rows,row=>renderPullTag(row,board,state),'No matching Pull Tags.');
    mountPullList(host,state,'teams',pullEditableTrips(board,state.filters),row=>renderPullTrip(row,!!state.edit || state.openDisclosures.has('trip:'+pullKey(row))));
    if (board.scope === 'assigned') {
        const drops = board.drops.slice().sort((a,b) => Number(b.drop)-Number(a.drop));
        mountPullList(host,state,'assigned-drops',drops,drop=>renderPullDropWork(drop,board));
    }
}

function pullEditableTrips(board,filters) {
    return board.trips.filter(trip => (!filters.dock || trip.dock === filters.dock) && (!filters.trip || trip.trip === filters.trip)
        && (pullAllowed(trip,'set_truck') || pullAllowed(trip,'set_team')));
}

function renderPullView(viewId, board, state) {
    const refresh = `<button type="button" class="${pullWorkspacePill}" data-pull-click="refresh">Refresh</button>`;
    if (viewId === 'mistake-fix') return refresh+renderPullBorrows(board)+'<div data-pull-mistakes class="space-y-2"></div>';
    if (viewId === 'traffic-office') return refresh+'<div data-pull-traffic class="space-y-2"></div>';
    const filters = state.filters;
    const selected = filters.dock && filters.trip;
    const tripMarkup = '<div data-pull-teams class="space-y-2"></div>';
    const teams = pullEditableTrips(board,filters).length ? (selected ? tripMarkup
        : `<details data-pull-list-section="teams"><summary class="cursor-pointer">Trip teams and truck status</summary>${tripMarkup}</details>`) : '';
    return `${pullTagToolbar(board,filters)}
        ${renderPullHeaderBorrow(board,board.tags.filter(row => pullFilterTag(row,filters)))}
        ${renderPullBorrows(board)}
        ${selected ? `<button type="button" class="${pullWorkspacePill}" data-pull-click="reset">All docks</button>` : ''}
        ${teams}<div data-pull-assigned-drops class="space-y-2"></div><div data-pull-tags class="space-y-2"></div>`;
}
