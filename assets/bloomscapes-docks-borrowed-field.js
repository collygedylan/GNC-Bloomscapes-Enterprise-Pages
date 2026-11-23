
const borrowedFieldRoute = 'borrowed-work';
const borrowedFieldDepartments = {'inventory':'156','qc':'161'};
const borrowedFieldModules = {'sales-inventory':'inventory','qc':'qc','drive':'inventory'};
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

function refreshBorrowedFieldBoard(state,force=false) {
    if (!borrowedFieldStateCurrent(state)) return Promise.resolve();
    if (!force && state.board && Date.now()-(state.readyAt || 0)<45000) return Promise.resolve(state.board);
    if (!state.read) state.read = loadBorrowedFieldBoard(state);
    return state.read;
}

async function loadBorrowedFieldBoard(state) {
    let changed = false;
    try {
        const board = await readBloomscapesBorrowedCards(state.farm,state.scope);
        if (!borrowedFieldStateCurrent(state)) return;
        changed = !!state.error || JSON.stringify(state.board)!==JSON.stringify(board);
        if (changed) state.board = board;
        state.readyAt = Date.now();
        state.error = '';
    } catch (error) {
        if (borrowedFieldStateCurrent(state)) {
            changed = state.error!==error.message || (error.code==='42501' && !!state.board);
            state.error = error.message;
            if (error.code === '42501') state.board = null;
        }
    } finally {
        state.read = null;
        if (changed && borrowedFieldStateCurrent(state) && getCurrentVisibleViewId() === borrowedFieldRoute) renderBloomscapesBorrowedField(borrowedFieldRoute);
    }
}

function activateBloomscapesBorrowedField(view) {
    if (!nativeAuthSessionActive) return;
    const state = getBorrowedFieldState();
    if (view === borrowedFieldRoute) void refreshBorrowedFieldBoard(state);
}

function renderBloomscapesBorrowedField(view) {
    if (view !== borrowedFieldRoute) return false;
    const host = document.getElementById('view-'+borrowedFieldRoute);
    if (!host) return true;
    mountBorrowedHelpWorkspace(host);
    const legacy = host.querySelector('[data-legacy-borrowed-field]');
    legacy.hidden = Boolean(borrowedHelpPreview());
    if (!legacy.hidden) paintLegacyBorrowedField(getBorrowedFieldState(),legacy);
    return true;
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
    if (!nativeAuthSessionActive || (!route && view !== 'av')) return;
    const host = document.querySelector('#view-'+view+' .freeze-panel');
    if (!host) return;
    if (route) mountBorrowedFieldTrigger(host,[route]);
    mountBloomscapesTimeCardLink(host);
}

function mountBorrowedFieldTrigger(host, routes) {
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
        if (button.isConnected && borrowedFieldStateCurrent(state)) button.hidden = !state.board?.can_borrow;
    });
}

function openBorrowedFieldPicker(state, routes) {
    if (!borrowedFieldStateCurrent(state) || !state.board?.can_borrow) return;
    state.dialog?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'bloomscapes-work-dialog';
    dialog.setAttribute('aria-label','Borrow Help (All Departments)');
    dialog.innerHTML = borrowedFieldPickerMarkup(routes);
    state.dialog = dialog;
    dialog.addEventListener('close',() => dialog.remove(),{once:true});
    dialog.querySelector('[data-borrowed-field-close]').addEventListener('click',() => dialog.close());
    dialog.querySelector('[data-borrowed-field-existing]').addEventListener('submit',handleBorrowedFieldAssignmentSubmit);
    document.body.appendChild(dialog);
    dialog.showModal();
    bindBorrowedFieldPicker(state,dialog);
}

function borrowedFieldPickerMarkup(routes) {
    const routeOptions = routes.map(route => `<option value="${route}">${borrowedFieldLabels[route]}</option>`).join('');
    return `<button type="button" data-borrowed-field-close>Close</button><h2>Borrow Help (All Departments)</h2>
        <form class="space-y-2"><label>Work <select name="route">${routeOptions}</select></label>
        <label>Find card <input type="search" name="search" placeholder="Item, name, location or lot"></label>
        <label>Exact card <select name="target" required></select></label>
        ${renderBloomscapesChoiceField('username','Borrowed worker','borrowed-field-worker','','',{required:true,className:pullWorkspacePill})}
        ${renderBloomscapesChoiceField('supervisor','Receiving supervisor','borrowed-field-supervisor','','',{required:true,className:pullWorkspacePill})}
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

function bindBorrowedFieldPicker(state, dialog) {
    const form = dialog.querySelector('form');
    const route = form.elements.route;
    const roster = () => borrowedFieldRoster(eligiblePickerRows(state.board.people,route.value));
    const supervisors = () => roster().filter(person =>
        person.supervisor_departments?.some(department=>String(department)===borrowedFieldDepartments[route.value]));
    const choices = rows => rows.map(row=>[row.id,row.label]);
    bindBloomscapesChoiceFields(dialog,{
        'borrowed-field-worker':()=>choices(roster()),
        'borrowed-field-supervisor':()=>choices(supervisors())
    });
    const paint = () => {
        const worker=form.elements.username;
        if (worker.value && !roster().some(person=>person.id===worker.value)) setBloomscapesChoiceFieldValue(worker,'');
        const supervisor = form.elements.supervisor;
        if (supervisor.value && !supervisors().some(person=>person.id===supervisor.value)) {
            setBloomscapesChoiceFieldValue(supervisor,'');
        }
        paintBorrowedFieldTargets(form);
        paintBorrowedFieldManagedAssignments(dialog,state,route.value);
    };
    route.addEventListener('change',paint);
    form.elements.search?.addEventListener('input',()=>paintBorrowedFieldTargets(form));
    form.addEventListener('submit',event => {
        event.preventDefault();
        const target = parseBorrowedFieldTarget(form.elements.target.value);
        if (!target || !roster().some(person=>person.id===form.elements.username.value)
            || !supervisors().some(person=>person.id===form.elements.supervisor.value)) return;
        const input = {route:route.value,row_id:target.id,source_kind:target.kind,
            username:form.elements.username.value,supervisor:form.elements.supervisor.value};
        void applyBorrowedFieldCommand(state,form,'assign',input,form.querySelector('[role="status"]'));
    });
    paint();
}

function paintBorrowedFieldManagedAssignments(dialog, state, route) {
    const list = dialog.querySelector('[data-borrowed-field-assignment-list]');
    const assigned = state.board?.assignments.filter(row => row.route === route && row.allowed?.includes('release')) || [];
    renderBloomscapesListWindow(list,assigned,createBorrowedFieldCard);
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
            if (matches.size >= BLOOMSCAPES_LIST_PAGE_SIZE) break;
        }
        if (matches.size >= BLOOMSCAPES_LIST_PAGE_SIZE) break;
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
        await refreshBorrowedFieldBoard(state,true);
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
