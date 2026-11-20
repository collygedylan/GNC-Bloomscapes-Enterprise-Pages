
const borrowedFieldRoute = 'borrowed-work';
const borrowedFieldDepartments = {'inventory':'156','qc':'161'};
const borrowedFieldModules = {'sales-inventory':'inventory','qc':'qc','drive':'inventory','av':'qc'};
const borrowedFieldLabels = {'inventory':'Inventory Count','qc':'QC Inspection'};
let borrowedFieldState = null;

function getBorrowedFieldState() {
    const farm = getBloomscapesFarm();
    const scope = getSupabaseReadIdentityScope();
    if (borrowedFieldState?.farm !== farm || borrowedFieldState?.scope !== scope) {
        borrowedFieldState?.dialog?.remove();
        borrowedFieldState = {farm,scope,board:null,read:null,write:null,error:'',dialog:null};
    }
    return borrowedFieldState;
}

function borrowedFieldStateCurrent(state) {
    return nativeAuthSessionActive && getBorrowedFieldState() === state;
}

function refreshBorrowedFieldBoard(state) {
    if (!borrowedFieldStateCurrent(state)) return Promise.resolve();
    if (!state.read) state.read = loadBorrowedFieldBoard(state);
    return state.read;
}

async function loadBorrowedFieldBoard(state) {
    try {
        const board = await readBloomscapesBorrowedCards(state.farm,state.scope);
        if (!borrowedFieldStateCurrent(state)) return;
        state.board = board;
        state.error = '';
    } catch (error) {
        if (borrowedFieldStateCurrent(state)) {
            state.error = error.message;
            if (error.code === '42501') state.board = null;
        }
    } finally {
        state.read = null;
        if (borrowedFieldStateCurrent(state) && getCurrentVisibleViewId() === borrowedFieldRoute) paintBorrowedFieldWorkspace(state);
    }
}

function activateBloomscapesBorrowedField(view) {
    if (!nativeAuthSessionActive) return;
    const state = getBorrowedFieldState();
    if (view === borrowedFieldRoute) void refreshBorrowedFieldBoard(state);
}

function renderBloomscapesBorrowedField(view) {
    if (view !== borrowedFieldRoute) return false;
    paintBorrowedFieldWorkspace(getBorrowedFieldState());
    return true;
}

function paintBorrowedFieldWorkspace(state) {
    const host = document.getElementById('view-'+borrowedFieldRoute);
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
    if (event.target.closest('[data-borrowed-field-refresh]')) void refreshBorrowedFieldBoard(getBorrowedFieldState());
}

function createBorrowedFieldCard(row) {
    const card = document.createElement('article');
    card.className = 'space-y-2 rounded-xl border border-emerald-700/60 p-3';
    card.dataset.borrowedFieldCard = row.id;
    const identity = [row.itemcode,row.locationcode,row.lotcode].filter(Boolean).join(' · ');
    card.innerHTML = `<h3 class="font-bold">${pullHtml(row.commonname || row.itemcode)} · ${pullHtml(borrowedFieldLabels[row.route])}</h3>
        <p class="text-sm">${pullHtml(identity)}</p><p class="text-xs">${pullHtml(row.username)} · ${pullHtml(row.farm_code)}</p>
        ${borrowedFieldCardActions(row)}`;
    return card;
}

function borrowedFieldCardActions(row) {
    const allowed = row.allowed || [];
    const result = row.route === 'inventory'
        ? '<label>Counted quantity <input name="quantity" type="number" min="0" step="1" required></label>'
        : '<label>Inspection result <select name="result"><option value="pass">Pass</option><option value="needs_review">Needs review</option></select></label>';
    const complete = allowed.includes('complete') ? `<form data-borrowed-field-action="complete" class="flex flex-wrap items-center gap-2">
        ${result}<label>Notes <input name="notes" maxlength="500"></label>
        <button class="${pullWorkspacePill}" type="submit">Mark assigned task done</button></form>` : '';
    const release = allowed.includes('release') ? `<form data-borrowed-field-action="release"><button class="${pullWorkspacePill}" type="submit">Release help</button></form>` : '';
    return complete + release;
}

function handleBorrowedFieldAssignmentSubmit(event) {
    const form = event.target.closest('[data-borrowed-field-action]');
    if (!form) return;
    event.preventDefault();
    const state = getBorrowedFieldState();
    const id = form.closest('[data-borrowed-field-card]')?.dataset.borrowedFieldCard;
    const action = form.dataset.borrowedFieldAction;
    const assignment = state.board?.assignments.find(row => row.id === id && row.allowed?.includes(action));
    if (!assignment) return;
    const input = {...Object.fromEntries(new FormData(form)),id,card_id:assignment.card_id};
    void applyBorrowedFieldCommand(state,form,action,input,event.currentTarget.querySelector('[role="status"]'));
}

function mountBloomscapesFieldBorrowing(view) {
    const route = borrowedFieldModules[view];
    if (!route || !nativeAuthSessionActive) return;
    const host = document.querySelector('#view-'+view+' .freeze-panel');
    if (host) mountBorrowedFieldTrigger(host,[route],view);
}

function renderBloomscapesBorrowedCardTrigger(row, kind) {
    if (!nativeAuthSessionActive || !bloomscapesFarmRowIsVisible(row) || !getItemUniqueId(row)) return '';
    const data = pullHtml(encodeFastPressArgs([kind,inventoryCardDetailIdentity(row)]));
    const enabled = getBorrowedFieldState().board?.can_borrow === true;
    return `<button type="button" class="${pullWorkspacePill}" data-inline-borrow-card="${data}" data-fast-press-ignore
        ${enabled ? '' : 'hidden'} onclick="return openBloomscapesBorrowExactCard(event,this.dataset.inlineBorrowCard)">➕ Borrow Help (All Departments)</button>`;
}

function openBloomscapesBorrowExactCard(event, encoded) {
    event.stopPropagation();
    const [kind,identity] = decodeFastPressArgs(encoded);
    if (kind !== 'CAV' && kind !== 'DRIVE') return false;
    const rows = kind === 'CAV' ? avOpenInventory : fullInventory;
    const id = identity?.[0];
    const row = rows?.find(row => bloomscapesFarmRowIsVisible(row) && matchesInventoryCardDetailIdentity(row,id,identity));
    if (row) openBorrowedFieldPicker(getBorrowedFieldState(),Object.keys(borrowedFieldDepartments),{id,kind,row});
    return false;
}

function mountBorrowedFieldTrigger(host, routes, view) {
    const state = getBorrowedFieldState();
    const current = host.querySelector('[data-borrowed-field-trigger]');
    if (current?.dataset.borrowScope === state.scope && current?.dataset.borrowFarm === state.farm) return;
    host.querySelector('[data-borrowed-field-trigger]')?.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = pullWorkspacePill;
    button.dataset.borrowedFieldTrigger = 'true';
    button.dataset.borrowScope = state.scope;
    button.dataset.borrowFarm = state.farm;
    button.textContent = '🤝 Borrow Help';
    button.hidden = !state.board?.can_borrow;
    button.addEventListener('click',() => openBorrowedFieldPicker(state,routes));
    host.appendChild(button);
    if (!state.board && !state.error) void refreshBorrowedFieldBoard(state).then(() => {
        if (button.isConnected && borrowedFieldStateCurrent(state)) paintBorrowedFieldPermission(button,state,view);
    });
}

function paintBorrowedFieldPermission(button, state, view) {
    const allowed = state.board?.can_borrow === true;
    button.hidden = !allowed;
    const host = document.getElementById('view-'+view);
    for (const card of host?.querySelectorAll('[data-inline-borrow-card]') || []) card.hidden = !allowed;
}

function openBorrowedFieldPicker(state, routes, exact) {
    if (!borrowedFieldStateCurrent(state) || !state.board?.can_borrow) return;
    state.dialog?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'bloomscapes-work-dialog';
    dialog.setAttribute('aria-label','Borrow Help (All Departments)');
    dialog.innerHTML = borrowedFieldPickerMarkup(routes,exact);
    state.dialog = dialog;
    dialog.addEventListener('close',() => dialog.remove(),{once:true});
    dialog.querySelector('[data-borrowed-field-close]').addEventListener('click',() => dialog.close());
    dialog.querySelector('[data-borrowed-field-existing]').addEventListener('submit',handleBorrowedFieldAssignmentSubmit);
    document.body.appendChild(dialog);
    dialog.showModal();
    bindBorrowedFieldPicker(state,dialog,exact);
}

function borrowedFieldPickerMarkup(routes, exact) {
    const routeOptions = routes.map(route => `<option value="${route}">${borrowedFieldLabels[route]}</option>`).join('');
    const exactText = exact ? borrowerTargetLabel(exact.row) : '';
    const target = exact ? `<p>${pullHtml(exactText)}</p>` :
        '<label>Find card <input type="search" name="search" placeholder="Item, name, location or lot"></label><label>Exact card <select name="target" required></select></label>';
    return `<button type="button" data-borrowed-field-close>Close</button><h2>Borrow Help (All Departments)</h2>
        <form class="space-y-2"><label>Work <select name="route">${routeOptions}</select></label>${target}
        <label>Borrowed worker <select name="username" required></select></label>
        <label>Receiving supervisor <select name="supervisor" required></select></label>
        <button type="submit" class="${pullWorkspacePill}">Assign help</button><p role="status"></p></form>
        <section data-borrowed-field-existing><p role="status"></p><div data-borrowed-field-assignment-list></div></section>`;
}

function borrowerTargetLabel(row) {
    const physical = resolveCanonicalInventoryRow(row) || row;
    return [physical.ITEMCODE || physical.itemcode,physical.COMMONNAME || physical.commonname,
        physical.LOCATIONCODE || physical.locationcode,physical.LOTCODE || physical.lotcode].filter(Boolean).join(' · ');
}

function borrowedFieldOptionSet(select, choices, placeholder) {
    const value = select.value;
    select.replaceChildren(new Option(placeholder,''),...choices.map(row => new Option(row.label,row.id)));
    if (choices.some(row => row.id === value)) select.value = value;
}

function borrowedFieldRoster(people) {
    return people.map(row => ({...row,id:row.username,label:[row.name || row.username,row.department].filter(Boolean).join(' · ')}));
}

function bindBorrowedFieldPicker(state, dialog, exact) {
    const form = dialog.querySelector('form');
    const roster = borrowedFieldRoster(state.board.people);
    const route = form.elements.route;
    borrowedFieldOptionSet(form.elements.username,roster,'Choose a worker');
    const paint = () => {
        const department = borrowedFieldDepartments[route.value];
        const managers = roster.filter(person => person.supervisor_departments?.map(String).includes(department));
        borrowedFieldOptionSet(form.elements.supervisor,managers,'Choose a receiving supervisor');
        if (!exact) paintBorrowedFieldTargets(form);
        paintBorrowedFieldManagedAssignments(dialog,state,route.value);
    };
    route.addEventListener('change',paint);
    form.elements.search?.addEventListener('input',paint);
    form.addEventListener('submit',event => {
        event.preventDefault();
        const target = exact || parseBorrowedFieldTarget(form.elements.target.value);
        if (!target) return;
        const input = {route:route.value,row_id:target.id,source_kind:target.kind,
            username:form.elements.username.value,supervisor:form.elements.supervisor.value};
        void applyBorrowedFieldCommand(state,form,'assign',input,form.querySelector('[role="status"]'));
    });
    paint();
}

function paintBorrowedFieldManagedAssignments(dialog, state, route) {
    const list = dialog.querySelector('[data-borrowed-field-assignment-list]');
    const assigned = state.board?.assignments.filter(row => row.route === route && row.allowed?.includes('release')) || [];
    list.replaceChildren(...assigned.map(createBorrowedFieldCard));
}

function parseBorrowedFieldTarget(value) {
    if (!value) return null;
    const [kind,id] = JSON.parse(value);
    return {kind,id};
}

function paintBorrowedFieldTargets(form) {
    const query = form.elements.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sources = [['DRIVE',fullInventory],['CAV',avOpenInventory]];
    const matches = new Map();
    for (const [kind,records] of sources) {
        for (const row of records || []) {
            appendBorrowedFieldTarget(matches,row,kind,query);
            if (matches.size >= 50) break;
        }
        if (matches.size >= 50) break;
    }
    borrowedFieldOptionSet(form.elements.target,[...matches.values()],matches.size ? 'Choose an exact card' : 'No matching cards in this farm');
}

function appendBorrowedFieldTarget(matches, row, kind, query) {
    if (!bloomscapesFarmRowIsVisible(row)) return;
    const id = getItemUniqueId(row);
    if (!id) return;
    const search = [row.ITEMCODE || row.itemcode,row.COMMONNAME || row.commonname,
        row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode,id].join(' ').toLowerCase();
    if (!query.every(word => search.includes(word))) return;
    const key = JSON.stringify([kind,id]);
    matches.set(key,{id:key,label:borrowerTargetLabel(row)+' · '+kind});
}

async function applyBorrowedFieldCommand(state, form, action, input, status) {
    if (!borrowedFieldStateCurrent(state) || state.write) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Saving…';
    state.write = commandBloomscapesBorrowedCard(state.farm,state.scope,action,input);
    try {
        const receipt = await state.write;
        if (!borrowedFieldStateCurrent(state)) return;
        await state.read;
        await refreshBorrowedFieldBoard(state);
        if (!borrowedFieldStateCurrent(state)) return;
        void refreshBloomscapesBorrowedRoutes();
        const dialog = form.closest('dialog');
        if (action === 'assign' && dialog?.isConnected && dialog === state.dialog) {
            status.textContent = 'Borrowed help assigned.';
            dialog.close();
        }
        if (action === 'release' && state.dialog?.isConnected) {
            paintBorrowedFieldManagedAssignments(state.dialog,state,state.dialog.querySelector('select[name="route"]').value);
        }
        showToast('Borrowed Work',receipt.action === 'complete' ? 'Assigned work recorded.' : 'Assignment saved.');
    } catch (error) {
        if (borrowedFieldStateCurrent(state)) status.textContent = error.message;
    } finally {
        state.write = null;
        button.disabled = false;
    }
}
