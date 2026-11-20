
const pullWorkspacePill = 'dock-dispatch-pill shrink-0 rounded-full px-3 text-xs font-semibold';
const pullWorkspaceCard = 'dock-dispatch-card space-y-2 rounded-xl p-3';
const pullTruckLabels = {live:'🚨 Live Driver',trailer:'Trailer',blank:'Blank'};
const pullActionLabels = {
    pulled:'Mark pulled',checked:'Checker done',inspected:'Inspector done',tagged:'Tagging done',
    loaded:'Loaded / Done',report_mistake:'Report mistake or shortage',fix_mistake:'Confirm replacement'
};

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

function pullRouteByLocation(left, right) {
    return String(left || '').localeCompare(String(right || ''),undefined,{numeric:true,sensitivity:'base'});
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
    const dayDocks = [...new Set(board.tags.map(pullDockDay))].sort(pullRouteByLocation);
    const pullers = [...new Set(board.tags.map(row => row.puller).filter(Boolean))].sort(pullRouteByLocation);
    const names = new Map(pullChoices(board.people));
    const filter = (name,label,options) => pullSelect(name,label,options,filters[name],'data-pull-filter');
    const autoInput = pullAutoAssignScope(board.tags,filters);
    return `<div class="flex flex-nowrap items-center gap-1 overflow-x-auto pb-1" aria-label="Pull Tag filters">
        ${filter('truck','Truck', [['','Truck: All'],...Object.entries(pullTruckLabels)])}
        ${filter('dockDay','Day / Dock',[['','Day / Dock'],...dayDocks.map(value => [value,value])])}
        ${filter('puller','Puller',[['','Puller'],...pullers.map(value => [value,names.get(value) || value])])}
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
    const fields = pullSelect('username','Borrowed worker',[['','Choose a worker'],...pullChoices(board.people)],'','required')
        + pullSelect('task','Assigned task',tasks.map(task => [task,pullActionLabels[task]]),tasks[0]);
    return `<details><summary class="cursor-pointer text-xs font-semibold">➕ Borrow Help (All Departments)</summary>${pullForm('borrow',input,fields,'Assign help')}</details>`;
}

function renderPullHeaderBorrow(board, tags) {
    const options = tags.filter(row => row.status === 'open').map(row =>
        [row.id,`Dock ${row.dock} · Drop ${row.drop} · ${row.itemcode} · ${row.locationcode}`]);
    if (!options.length || !board.can_borrow || !board.people.length) return '';
    const fields = pullSelect('id','Pull Tag',[['','Choose a Pull Tag'],...options],'','required')
        + pullSelect('username','Borrowed worker',[['','Choose a worker'],...pullChoices(board.people)],'','required');
    return `<details data-pull-borrow><summary class="cursor-pointer text-xs font-semibold">Borrow Help</summary>${pullForm('borrow',{task:'pulled'},fields,'Assign help')}</details>`;
}

function renderPullBorrows(board) {
    if (!board.borrows.length) return '';
    const rows = board.borrows.map(row => `<li class="flex flex-wrap items-center gap-2">
        ${pullHtml(row.username)} · ${pullHtml(pullActionLabels[row.task] || row.task)} · Dock ${pullHtml(row.dock)} · Drop ${pullHtml(row.drop)}
        ${board.can_borrow ? pullForm('release_borrow',{id:row.id},'','Release help') : ''}</li>`).join('');
    return `<details><summary class="cursor-pointer text-xs font-semibold">Borrowed assignments (${board.borrows.length})</summary><ul class="space-y-1">${rows}</ul></details>`;
}

function pullTagHeader(row) {
    const urgency = row.urgent || row.truck === 'live' && row.status === 'open'
        ? '<strong class="rounded bg-red-800 px-2 py-1 text-xs text-white">🚨 LIVE DRIVER</strong>' : '';
    return `<div class="flex flex-wrap items-center gap-2"><strong>${pullHtml(row.itemcode)}</strong>
        ${urgency}<span class="text-xs">Dock ${pullHtml(row.dock)} · ${pullHtml(row.trip)} · Drop ${pullHtml(row.drop)}</span></div>`;
}

function pullPrintLines(row) {
    return row.segments?.length ? row.segments : [{locationcode:row.locationcode,quantity:row.quantity}];
}

function pullTagLocationList(row) {
    return `<ul class="text-sm">${pullPrintLines(row).map(line => `<li>${pullHtml(line.locationcode)} · Qty ${pullHtml(line.quantity)}</li>`).join('')}</ul>`;
}

function renderPullTag(row, board) {
    const pullers = pullChoices(board.people.filter(person => person.puller_eligible === true));
    const assign = pullAllowed(row,'assign') && pullers.length
        ? pullForm('assign',{id:row.id},pullSelect('puller','Puller',pullers,row.puller),'Assign puller') : '';
    return `<article class="${pullWorkspaceCard}" data-pull-tag="${pullHtml(row.id)}">
        ${pullTagHeader(row)}${pullTagLocationList(row)}
        <p class="text-xs">${pullHtml(row.wingdingunits)} WingDingUnits · ${pullHtml(row.puller || 'Unassigned')} · ${row.status === 'pulled' ? 'Pulled' : 'Open'}</p>
        ${assign}${pullAllowed(row,'pulled') ? pullForm('pulled',{id:row.id}) : ''}
        ${row.status === 'open' ? renderPullBorrowPicker(board,row,['pulled'],true) : ''}</article>`;
}

function renderPullTrip(trip, board, edit) {
    const input = {dock:trip.dock,trip:trip.trip};
    const teams = [['checker','Checker'],['inspector','Inspector'],['mistake_guy','Mistake Guy']];
    const choices = [['','Unassigned'],...pullChoices(board.people.filter(person => person.team_eligible === true))];
    const fields = teams.map(([key,label]) => renderPullTeamField(key,label,choices,trip[key])).join('');
    return `<details class="${pullWorkspaceCard}" ${edit ? 'open' : ''}><summary class="cursor-pointer font-bold">Dock ${pullHtml(trip.dock)} · ${pullHtml(trip.trip)} · ${pullHtml(pullTruckLabels[trip.truck])}</summary>
        ${pullAllowed(trip,'set_truck') ? pullForm('set_truck',input,pullSelect('truck','Truck',Object.entries(pullTruckLabels),trip.truck),'Save truck') : ''}
        ${pullAllowed(trip,'set_team') ? pullForm('set_team',input,fields,'Save team') : ''}</details>`;
}

function renderPullTeamField(key, label, choices, username) {
    const options = username && !choices.some(([value]) => value === username) ? [...choices,[username,username]] : choices;
    return `<label class="text-xs">${label} ${pullSelect(key,label,options,username)}</label>`;
}

function paintBloomscapesDocksWorkspace(host, viewId, state) {
    const board = state.board;
    const heading = `<h2 class="text-lg font-bold">${bloomscapesDockWorkspaceTitles[viewId]}</h2>`;
    const message = state.error || (!board ? 'Loading Dock records…' : '');
    host.innerHTML = `<section class="space-y-2 p-3">${heading}<p role="status" data-pull-status>${pullHtml(message)}</p>
        ${board ? renderPullView(viewId,board,state) : (state.error ? `<button class="${pullWorkspacePill}" data-pull-click="refresh" type="button">Retry</button>` : '')}</section>`;
    const list = host.querySelector('[data-pull-tags]');
    if (!list) return restoreBloomscapesDockDrafts(host);
    const rows = board.tags.filter(row => pullFilterTag(row,state.filters)).sort(compareBloomscapesPullTags);
    renderBloomscapesListWindow(list,rows,row => {
        const template = document.createElement('template');
        template.innerHTML = renderPullTag(row,board);
        return template.content.firstElementChild;
    },'No matching Pull Tags.',state.page || 0,page => {
        state.page = page;
        restoreBloomscapesDockDrafts(host);
    });
}

function renderPullAssignedDrops(board) {
    if (board.scope !== 'assigned') return '';
    const byDrop = pullTagsByDrop(board.tags);
    return board.drops.slice().sort((a,b) => Number(b.drop) - Number(a.drop))
        .map(drop => renderPullDropWork(drop,board,byDrop.get(pullKey(drop)) || [])).join('');
}

function renderPullView(viewId, board, state) {
    if (viewId === 'mistake-fix') return renderBloomscapesMistakeFix(board);
    if (viewId === 'traffic-office') return renderBloomscapesTrafficOffice(board);
    const filters = state.filters;
    const selected = filters.dock && filters.trip;
    const trips = board.trips.filter(trip => (!filters.dock || trip.dock === filters.dock) && (!filters.trip || trip.trip === filters.trip));
    const editableTrips = trips.filter(trip => pullAllowed(trip,'set_truck') || pullAllowed(trip,'set_team'));
    const tripMarkup = editableTrips.map(trip => renderPullTrip(trip,board,!!state.edit)).join('');
    const teams = tripMarkup && (selected ? tripMarkup : `<details><summary class="cursor-pointer">Trip teams and truck status</summary>${tripMarkup}</details>`);
    return `${pullTagToolbar(board,filters)}
        ${renderPullHeaderBorrow(board,board.tags.filter(row => pullFilterTag(row,filters)))}
        ${renderPullBorrows(board)}
        ${selected ? `<button type="button" class="${pullWorkspacePill}" data-pull-click="reset">All docks</button>` : ''}
        ${teams}${renderPullAssignedDrops(board)}<div data-pull-tags class="space-y-2"></div>`;
}
