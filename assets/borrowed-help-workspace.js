
const borrowedHelpSections = [['incoming','Incoming Requests'],['outgoing','Outgoing Requests'],
    ['active','Active Borrowed Crew'],['history','History']];
let borrowedHelpWorkspaceState;

function borrowedHelpState() {
    const owner = borrowedHelpIdentity();
    if (borrowedHelpWorkspaceState?.owner !== owner) borrowedHelpWorkspaceState = {owner,section:'incoming'};
    return borrowedHelpWorkspaceState;
}

function primeBorrowedHelpRoutes() {
    const state = borrowedHelpState();
    if (!state.owner || state.routesRequested) return;
    state.routesRequested = true;
    void refreshBloomscapesBorrowedRoutes();
}

function borrowedHelpCurrent(state) {
    return !!state.owner && borrowedHelpState() === state;
}

function refreshBorrowedHelp(state,force = false) {
    if (!borrowedHelpCurrent(state) || state.flight) return state.flight;
    if (!force && Date.now()-(state.at || 0)<45000) return;
    const flight = readBorrowedHelp(state.owner).then(board=>{
        if (!borrowedHelpCurrent(state)) return;
        state.board = board;
        state.error = '';
    }).catch(error=>{
        if (!borrowedHelpCurrent(state)) return;
        state.error = error.message;
        if (error.code === '42501') state.board = null;
    }).finally(()=>{
        state.flight = null;
        state.at = Date.now();
        if (borrowedHelpCurrent(state)) updateBorrowedHelpSurfaces(state);
    });
    state.flight = flight;
    return flight;
}

function updateBorrowedHelpSurfaces(state) {
    const view = getCurrentVisibleViewId();
    if (view === 'borrowed-work') paintBorrowedHelpWorkspace(state);
    if (view === 'request') mountBorrowedHelpQueue();
}

function mountBorrowedHelpWorkspace(host) {
    if (!host.querySelector('[data-borrowed-help-workspace]')) {
        host.innerHTML = `<section class="p-3 space-y-2" data-borrowed-help-workspace>
          <h2 class="font-bold">🤝 Borrowed Help</h2><div data-loan-views></div>
          <button type="button" class="${pullWorkspacePill}" data-loan-new>+ Request Borrowed Help</button>
          <button type="button" class="${pullWorkspacePill}" data-loan-refresh>Refresh</button>
          <p role="status" data-loan-status></p><div data-loan-rows class="space-y-2"></div></section>
          <section class="p-3 space-y-2" data-legacy-borrowed-field></section>`;
        host.querySelector('[data-loan-new]').onclick = requestBorrowedHelp;
        host.querySelector('[data-loan-refresh]').onclick = () => void refreshBorrowedHelp(borrowedHelpState(),true);
    }
    paintBorrowedHelpWorkspace(borrowedHelpState());
    if (!borrowedHelpPreview()) void refreshBorrowedHelp(borrowedHelpState());
}

function requestBorrowedHelp() {
    const state = borrowedHelpState();
    if (state.board?.can_manage && !borrowedHelpPreview()) {
        openBorrowedHelpRequest(state.board.people,(...args)=>runBorrowedHelpCommand(state,...args));
    }
}

function paintBorrowedHelpWorkspace(state) {
    const host = document.querySelector('#view-borrowed-work [data-borrowed-help-workspace]');
    if (!host) return;
    const preview = borrowedHelpPreview();
    const manages = preview?.borrowed ?? state.board?.can_manage ?? false;
    host.querySelector('[data-loan-new]').hidden = !manages || !!preview;
    host.querySelector('[data-loan-refresh]').hidden = !!preview;
    host.querySelector('[data-loan-status]').textContent = preview ? '' : state.error || (!state.board ? 'Loading Borrowed Help…' : '');
    const menu = host.querySelector('[data-loan-views]');
    menu.hidden = !manages;
    if (manages) mountModuleSubviewDropdown(menu,{choices:borrowedHelpSections,value:state.section,select:section=>{
        state.section = section;
        paintBorrowedHelpWorkspace(state);
    }});
    const rows = preview ? preview.loans || [] : state.board?.rows || [];
    const visible = rows.filter(row=>showBorrowedHelpRow(row,state.section,manages));
    host.querySelector('[data-loan-rows]').dataset.section = state.section;
    renderBloomscapesListWindow(host.querySelector('[data-loan-rows]'),visible,
        row=>createBorrowedHelpCard(row,preview ? null : state),'No matching Borrowed Help requests.');
}

function showBorrowedHelpRow(row, section, manages, now = Date.now()) {
    const expired = Date.parse(row.end_at)<=now;
    if (!manages) return row.assigned && !expired;
    if (section === 'incoming') return row.can_respond && !expired;
    if (section === 'outgoing') return row.outgoing && !expired && ['pending','approved'].includes(row.status);
    if (section === 'active') return row.can_release && !expired;
    return expired || ['declined','released'].includes(row.status);
}

function borrowedHelpTime(value) {
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'})
        .format(new Date(value));
}

function createBorrowedHelpCard(row,state = null) {
    const card = document.createElement('article');
    card.className = 'space-y-2 rounded-xl border border-emerald-700/60 p-3';
    card.dataset.borrowedHelpCard = row.id;
    const destination = [borrowedHelpDestinations[row.destination],row.location].filter(Boolean).join(' / ');
    const title = row.assigned ? '🤝 Assigned Borrowed Help: Report to '+row.supervisor+' in '+destination : destination;
    const summary = row.assigned ? '' : [row.supervisor,row.crew_count+' crew',row.status].join(' · ');
    card.innerHTML = `<h3 class="font-bold">${pullHtml(title)}</h3><p>${pullHtml(summary)}</p>
      <p>${borrowedHelpTime(row.start_at)} – ${borrowedHelpTime(row.end_at)} CT</p>
      <p>${pullHtml(row.instructions)}</p><p>${pullHtml(row.workers?.join(', ') || '')}</p>`;
    if (row.assigned || row.status === 'approved') {
        const clock = document.createElement('time');
        clock.dateTime = row.end_at;
        clock.dataset.crewLoanClock = '';
        card.append(clock);
        renderBorrowedHelpClock(clock);
    }
    if (state) addBorrowedHelpActions(card,row,state);
    return card;
}

function addBorrowedHelpActions(card,row,state) {
    const command = (...args)=>runBorrowedHelpCommand(state,...args);
    if (row.can_respond) {
        addBorrowedHelpButton(card,'✓ Approve & Assign Crew',()=>openBorrowedHelpApproval(row,state.board.people,command));
        addBorrowedHelpButton(card,'✕ Decline',()=>void command('decline',row.id).catch(error=>borrowedHelpError(error,state)));
    }
    if (row.can_release) addBorrowedHelpButton(card,'Release Crew Now',()=>void command('release',row.id)
        .catch(error=>borrowedHelpError(error,state)));
}

function borrowedHelpError(error,state) {
    if (borrowedHelpCurrent(state)) showToast('Borrowed Help',error.message,true);
}

function addBorrowedHelpButton(host,label,callback) {
    const button = document.createElement('button');
    button.className = pullWorkspacePill;
    button.type = 'button';
    button.textContent = label;
    button.onclick = callback;
    host.append(button);
}

async function runBorrowedHelpCommand(state,action,id,input) {
    if (!borrowedHelpCurrent(state) || state.write || borrowedHelpPreview()) return false;
    state.write = true;
    try {
        const receipt = await submitBorrowedHelp(state.owner,action,id,input);
        if (!borrowedHelpCurrent(state)) return false;
        await state.flight;
        await refreshBorrowedHelp(state,true);
        if (borrowedHelpCurrent(state)) showToast('Borrowed Help','Request '+({request:'sent',approve:'approved',decline:'declined',release:'released'}[receipt.action])+'.');
        return true;
    } finally {
        state.write = false;
    }
}

function mountBorrowedHelpQueue() {
    const toolbar = document.getElementById('request-filter-toolbar');
    if (!toolbar || !borrowedHelpIdentity() || getCurrentVisibleViewId() !== 'request') return;
    const state = borrowedHelpState();
    const preview = borrowedHelpPreview();
    let host = toolbar.parentElement.querySelector('[data-queue-borrowed-help]');
    if (!host) {
        host = document.createElement('section');
        host.dataset.queueBorrowedHelp = '';
        toolbar.after(host);
    }
    const assignments = (preview ? preview.loans : state.board?.rows || []).filter(row=>showBorrowedHelpRow(row,'active',false));
    const manages = preview?.borrowed ?? state.board?.can_manage ?? false;
    paintBorrowedHelpQueue(host,assignments,manages,Boolean(preview));
    if (!preview) void refreshBorrowedHelp(state);
}

function paintBorrowedHelpQueue(host, assignments, manages, preview) {
    const signature = JSON.stringify([assignments,manages,preview]);
    if (host.dataset.loanSignature === signature) return;
    host.dataset.loanSignature = signature;
    host.replaceChildren();
    host.hidden = !assignments.length && !manages;
    if (manages) addBorrowedHelpButton(host,'🤝 Borrowed Help',()=>switchView('borrowed-work'));
    for (const row of assignments) host.append(createBorrowedHelpCard(row));
}

function paintLegacyBorrowedField(state,host) {
    if (!host) return;
    if (!host.dataset.borrowedFieldBound) {
        host.dataset.borrowedFieldBound = 'true';
        host.addEventListener('click',handleBorrowedFieldWorkspaceClick);
        host.addEventListener('submit',handleBorrowedFieldAssignmentSubmit);
    }
    const rows = state.board?.assignments || [];
    const message = state.error || (!state.board ? 'Loading assignments…' : '');
    host.innerHTML = `<section class="space-y-2 p-3"><p role="status">${pullHtml(message)}</p>
        <button type="button" class="${pullWorkspacePill}" data-borrowed-field-refresh>Refresh</button>
        <div data-borrowed-field-cards class="space-y-2"></div></section>`;
    const list = host.querySelector('[data-borrowed-field-cards]');
    if (state.board) renderBloomscapesListWindow(list,rows,createBorrowedFieldCard,'No active borrowed assignments.');
}

function handleBorrowedFieldWorkspaceClick(event) {
    if (event.target.closest('[data-borrowed-field-refresh]')) void refreshBorrowedFieldBoard(getBorrowedFieldState(),true);
}

function showLoanOnlyQueControl(toolbar) {
    const group = toolbar.querySelector('.request-category-options');
    if (!group || !canOpenBloomscapesDocksWorkspace('borrowed-work')) return false;
    const choices = [['borrowed-help','Borrowed Help']];
    const trigger = mountModuleSubviewDropdown(group,{choices,value:'borrowed-help',select:mountBorrowedHelpQueue});
    trigger.classList.add('request-category-chip');
    group.hidden = false;
    return true;
}
