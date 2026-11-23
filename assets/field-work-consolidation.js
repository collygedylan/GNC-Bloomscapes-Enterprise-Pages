const consolidationWorkspaces = new WeakMap();

function denyFieldWorkConsolidationRoute(view) {
    if (view!=='field-work-consolidation' || canViewFieldWorkConsolidation()) return false;
    syncFieldWorkConsolidationVisibility();
    return true;
}

function prepareFieldWorkConsolidationNavigation() {
    if (!canViewFieldWorkConsolidation()) return false;
    bloomscapesDepartmentTabs.set(bloomscapesDepartmentKey('production'),'bloomscapes-consolidation');
    markViewDirty('production');
    return true;
}

function syncFieldWorkConsolidationVisibility() {
    if (typeof canViewFieldWorkConsolidation!=='function') return;
    const allowed = canViewFieldWorkConsolidation();
    if (!allowed) document.querySelectorAll('[data-field-work-consolidation-entry]').forEach(entry=>entry.remove());
    const frame = document.querySelector('#view-production > [data-department-workspace]');
    if (!frame) return;
    if (frame.dataset.departmentWorkspace==='bloomscapes-studio') return renderFieldWorkConsolidationEntry(frame);
    const state = consolidationWorkspaces.get(frame);
    if (!state || state.subject===activeConsolidationUser()?.username && allowed) return;
    unmountFieldWorkConsolidation(frame);
    frame.remove();
    if (!allowed) bloomscapesDepartmentTabs.set(bloomscapesDepartmentKey('production'),'bloomscapes-studio');
    if (getCurrentVisibleViewId()==='production') renderBloomscapesDepartmentWorkspace('production');
}

function renderFieldWorkConsolidationEntry(frame) {
    const studio = frame.querySelector('[data-bloomscapes-studio]');
    const existing = studio?.querySelector('[data-field-work-consolidation-entry]');
    if (typeof canViewFieldWorkConsolidation!=='function' || !canViewFieldWorkConsolidation()) return existing?.remove();
    if (!studio || existing) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.fieldWorkConsolidationEntry = '';
    button.textContent = 'Sales-Year Consolidation / Bed Space Advisor';
    studio.querySelector('[data-studio-modules]')?.before(button);
    button.onclick = () => switchView('field-work-consolidation');
}

function renderFieldWorkConsolidationPanel() {
    return '<section data-field-work-consolidation><h3>Sales-Year Consolidation / Bed Space Advisor</h3>'
        +'<div data-consolidation-picker><label>Search inventory<input type="search" data-consolidation-search placeholder="Item code or common name"></label>'
        +'<div class="consolidation-controls"><div role="group" aria-label="Location filter">'
        +'<button type="button" data-consolidation-action="split">Split Across 2+ Locations</button>'
        +'<button type="button" data-consolidation-action="all">All Items</button></div>'
        +'<label>Browse by <select data-consolidation-mode><option value="common">Common Name</option><option value="block">Block / Location</option></select></label></div>'
        +'<p data-consolidation-path></p><div data-consolidation-options></div></div>'
        +'<div data-consolidation-item hidden></div><div data-consolidation-result aria-live="polite"></div></section>';
}

function mountFieldWorkConsolidation(frame) {
    if (!canViewFieldWorkConsolidation()) return;
    const host = frame.querySelector('[data-field-work-consolidation]');
    if (!host) return;
    const state = {host,mode:'common',path:[],query:'',split:true,page:0,items:[],owner:getSupabaseReadIdentityScope(),subject:activeConsolidationUser()?.username};
    consolidationWorkspaces.set(frame,state);
    host.onclick = event => dispatchFieldWorkConsolidation(state,event);
    host.querySelector('[data-consolidation-search]').oninput = event => {
        state.query = event.target.value;
        state.page = 0;
        paintFieldWorkConsolidationPicker(state);
    };
    host.querySelector('[data-consolidation-mode]').onchange = event => {
        state.mode = event.target.value;
        state.path = [];
        state.page = 0;
        paintFieldWorkConsolidationPicker(state);
    };
    state.inventoryRequest = new AbortController();
    paintFieldWorkConsolidationPicker(state);
    if (!state.items.length) void loadFieldWorkConsolidationInventory(state);
}

async function loadFieldWorkConsolidationInventory(state) {
    try {
        state.inventoryLoading = true;
        paintFieldWorkConsolidationPicker(state);
        state.inventoryRows = await readFieldWorkConsolidationInventory(state.inventoryRequest.signal);
    } catch {
        state.inventoryError = true;
    } finally {
        state.inventoryLoading = false;
        paintFieldWorkConsolidationPicker(state);
    }
}

function fieldWorkConsolidationActive(state) {
    return state.host.isConnected && getCurrentVisibleViewId()==='production'
        && state.owner===getSupabaseReadIdentityScope() && state.subject===activeConsolidationUser()?.username && canViewFieldWorkConsolidation();
}

function paintFieldWorkConsolidationPicker(state) {
    if (!fieldWorkConsolidationActive(state)) return;
    const rows = state.inventoryRows || bloomscapesWorkBrowserRows();
    if (state.rows!==rows) {
        state.rows = rows;
        state.items = buildFieldWorkConsolidationIndex(rows);
    }
    const {options,many} = fieldWorkConsolidationPicker(state.items,state);
    const host = state.host;
    for (const button of host.querySelectorAll('[data-consolidation-action="split"],[data-consolidation-action="all"]')) {
        button.setAttribute('aria-pressed',String(state.split===(button.dataset.consolidationAction==='split')));
    }
    host.querySelector('[data-consolidation-path]').textContent = state.query.trim() ? 'Search results' : state.path.join(' → ');
    state.choices = options;
    host.querySelector('[data-consolidation-options]').innerHTML = renderFieldWorkConsolidationChoices(state,options,many);
}

function renderFieldWorkConsolidationChoices(state,options,many) {
    if (state.inventoryLoading) return '<p role="status">Opening live inventory…</p>';
    if (state.inventoryError) return '<p role="status">Inventory is temporarily unavailable.</p><button type="button" data-consolidation-action="retry">Retry inventory</button>';
    const choices = options.map((entry,index)=>'<button type="button" data-consolidation-action="pick" data-pick="'+index+'">'
        +esc(typeof entry==='string' ? entry : entry.code+' · '+entry.name+' · '+entry.size)+'</button>').join('');
    return (choices || '<p>No matching inventory.</p>')
        +(state.page ? '<button type="button" data-consolidation-action="previous">Previous results</button>' : '')
        +(many ? '<button type="button" data-consolidation-action="next">Next results</button>' : '');
}

function dispatchFieldWorkConsolidation(state,event) {
    const button = event.target.closest('[data-consolidation-action]');
    if (!button || !fieldWorkConsolidationActive(state)) return;
    const action = button.dataset.consolidationAction;
    if (action==='retry') {
        state.inventoryError = false;
        return void loadFieldWorkConsolidationInventory(state);
    }
    if (action==='pick') return chooseFieldWorkConsolidationItem(state,state.choices[Number(button.dataset.pick)]);
    if (action==='year') return void selectFieldWorkConsolidationYear(state,button.dataset.year);
    if (action==='more') {
        state.showAll = true;
        return paintFieldWorkConsolidationYear(state);
    }
    state.split = action==='split' || (action!=='all' && state.split);
    state.page = action==='previous' ? state.page-1 : action==='next' ? state.page+1 : 0;
    paintFieldWorkConsolidationPicker(state);
}

function chooseFieldWorkConsolidationItem(state,choice) {
    if (typeof choice==='string') {
        state.path.push(choice);
        state.page = 0;
        return paintFieldWorkConsolidationPicker(state);
    }
    state.item = choice;
    state.host.querySelector('[data-consolidation-picker]').hidden = true;
    const item = state.host.querySelector('[data-consolidation-item]');
    item.hidden = false;
    item.innerHTML = '<h4>'+esc(choice.name)+' · '+esc(choice.code)+'</h4><div class="consolidation-years" role="group" aria-label="Sales year">'
        +[...choice.years.values()].sort((a,b)=>b.year.localeCompare(a.year))
            .map(group=>'<button type="button" aria-pressed="false" data-consolidation-action="year" data-year="'+group.year+'">'
                +group.year+' · '+consolidationCans.format(group.cans)+' cans</button>').join('')+'</div>'
        +(choice.years.size ? '' : '<p>No positive on-hand stock with a recorded sales year.</p>');
}

async function selectFieldWorkConsolidationYear(state,year) {
    state.request?.abort();
    const request = state.request = new AbortController();
    state.group = state.item.years.get(year);
    state.data = null;
    state.error = '';
    state.showAll = false;
    for (const button of state.host.querySelectorAll('[data-year]')) button.setAttribute('aria-pressed',String(button.dataset.year===year));
    paintFieldWorkConsolidationYear(state);
    try {
        const data = await readFieldWorkConsolidation(state.item,year,request.signal);
        if (state.request!==request || !fieldWorkConsolidationActive(state)) return;
        state.data = data;
    } catch (error) {
        if (state.request!==request || request.signal.aborted || !fieldWorkConsolidationActive(state)) return;
        state.error = error.message;
    }
    paintFieldWorkConsolidationYear(state);
}

function paintFieldWorkConsolidationYear(state) {
    const {group,data,error} = state;
    const status = group.excluded ? '<p class="consolidation-info">Excluded '+consolidationCans.format(group.excluded)+' .Y shift cans staged for upcoming planting</p>' : '';
    const single = group.blocks.size===1 ? [...group.blocks][0] : '';
    const banner = single ? '<p class="consolidation-fits">✓ ALREADY CONSOLIDATED ON '+esc(single)+' — 0 MOVES NEEDED</p>' : '';
    const lots = renderFieldWorkConsolidationLots(group,data?.cpb);
    const progress = error ? '<p role="alert">'+esc(error)+'</p>' : '<p>Checking live bed capacity…</p>';
    const advice = data ? (single || group.blocks.size===0 ? '' : renderFieldWorkConsolidationAdvice(group,data,state.showAll)) : progress;
    state.host.querySelector('[data-consolidation-result]').innerHTML = banner+status+lots+advice;
}

function backFieldWorkConsolidation(frame) {
    const state = consolidationWorkspaces.get(frame);
    if (!state || !fieldWorkConsolidationActive(state)) return false;
    if (state.item) {
        state.request?.abort();
        state.request = null;
        state.item = null;
        state.host.querySelector('[data-consolidation-result]').replaceChildren();
        state.host.querySelector('[data-consolidation-item]').hidden = true;
        state.host.querySelector('[data-consolidation-picker]').hidden = false;
    } else if (state.path.length && !state.query.trim()) {
        state.path.pop();
        state.page = 0;
    } else return false;
    paintFieldWorkConsolidationPicker(state);
    return true;
}

function unmountFieldWorkConsolidation(frame) {
    const state = consolidationWorkspaces.get(frame);
    state?.request?.abort();
    state?.inventoryRequest?.abort();
}
