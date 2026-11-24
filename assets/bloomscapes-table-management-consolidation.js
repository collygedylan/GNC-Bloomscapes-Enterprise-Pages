function mountConsolidationManagerGrid(root,key) {
    if (!canViewFieldWorkConsolidation()) return {destroy() {}};
    const identity = getSupabaseReadIdentityScope();
    const preview = borrowedHelpPreview();
    const state = {key,rows:[],total:0,read:null,loading:false,saving:false};
    root.innerHTML = renderConsolidationGrid(key,!preview);
    const grid = root.firstElementChild;
    const current = () => grid.isConnected && root.contains(grid) && identity === getSupabaseReadIdentityScope()
        && preview === borrowedHelpPreview() && canViewFieldWorkConsolidation();
    const filters = grid.querySelector('[data-consolidation-filters]');
    const status = grid.querySelector('footer [role="status"]');
    const dialog = grid.querySelector('dialog');
    const context = {state,grid,current,filters,status,dialog,editable:!preview};
    filters.onsubmit = event => {
        event.preventDefault();
        clearTimeout(state.searchTimer);
        commandConsolidationLoad(context);
    };
    filters.querySelector('[data-consolidation-query]').oninput = () => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => commandConsolidationLoad(context),250);
    };
    grid.onclick = event => dispatchConsolidationGridClick(context,event.target);
    dialog.onsubmit = event => {
        event.preventDefault();
        void saveConsolidationGridRow(context,event.target);
    };
    commandConsolidationLoad(context);
    return {destroy() { clearTimeout(state.searchTimer); state.read?.abort(); grid.remove(); }};
}

function dispatchConsolidationGridClick(context,target) {
    if (!context.current()) return;
    const button = target.closest('button');
    if (!button) return;
    if (!context.editable || context.state.saving) return;
    if (button.hasAttribute('data-consolidation-save')) void saveConsolidationGridRow(context,button.closest('tr'));
    if (button.hasAttribute('data-consolidation-add')) {
        context.dialog.innerHTML = renderConsolidationAddForm(context.state.key);
        context.dialog.showModal();
    }
    if (button.hasAttribute('data-consolidation-cancel')) context.dialog.close();
}

function commandConsolidationLoad(context) {
    if (context.state.saving || !context.current()) return;
    void loadConsolidationGrid(context);
}

async function loadConsolidationGrid(context) {
    const {state,grid,current,filters,status,editable} = context;
    state.read?.abort();
    const read = state.read = new AbortController();
    const form = new FormData(filters);
    const query = {query:form.get('query'),size:form.get('size')?.trim(),source:form.get('source')};
    state.loading = true;
    status.textContent = 'Loading…';
    try {
        const result = await readConsolidationLookup(state.key,query,read.signal);
        if (!current() || state.read !== read) return;
        Object.assign(state,result);
        const indices = state.rows.map((_,index) => index);
        mountChunkedList(grid.querySelector('tbody'),indices,index =>
            bloomscapesListNode(renderConsolidationGridRow(state.key,state.rows[index],index,editable)).firstElementChild);
        status.textContent = state.total ? `${state.total.toLocaleString()} rows` : 'No rows found.';
    } catch (error) {
        if (current() && state.read === read) status.textContent = error.message;
    } finally {
        if (state.read === read) state.loading = false;
    }
}

async function saveConsolidationGridRow(context,container) {
    const {state,status,current,dialog} = context;
    if (!current() || !context.editable || state.loading || state.saving) return;
    const record = state.rows[container.dataset.consolidationRow];
    const adding = !record;
    const inputs = [...container.querySelectorAll('[name]')];
    if (!inputs.every(input => input.reportValidity())) return;
    const values = Object.fromEntries(inputs.map(input => [input.name,input.type === 'checkbox' ? input.checked : input.value.trim()]));
    if (state.key === 'item-cpb') values.itemcode = record?.itemcode || values.itemcode;
    else {
        values.locationcode = record?.locationcode || values.locationcode.toUpperCase();
        values.fresh_water = values.fresh_water || null;
    }
    const feedback = adding ? dialog.querySelector('[role="status"]') : status;
    const button = container.querySelector('button:last-child');
    button.disabled = state.saving = true;
    feedback.textContent = 'Saving…';
    try {
        const receipt = await writeConsolidationLookup(state.key,values,record?.updated_at);
        if (!current()) return;
        if (adding) dialog.close();
        else applyConsolidationGridReceipt(context,container,receipt);
        status.textContent = 'Saved.';
    } catch (error) {
        if (current()) feedback.textContent = error.message;
    } finally {
        button.disabled = state.saving = false;
    }
    if (adding && current() && !dialog.open) commandConsolidationLoad(context);
}

function applyConsolidationGridReceipt(context,container,receipt) {
    const index = Number(container.dataset.consolidationRow);
    context.state.rows[index] = receipt;
    container.outerHTML = renderConsolidationGridRow(context.state.key,receipt,index,true);
}

class BloomscapesConsolidationGrid extends HTMLElement {
    connectedCallback() {
        const selected = this.dataset.lookup;
        if (this.instance || !Object.hasOwn(consolidationGridFields,selected) || !canViewFieldWorkConsolidation()) return;
        const view = mountConsolidationManagerGrid(this,selected);
        this.instance = managerTableManagementInstance = {
            root:this,selected,identity:getSupabaseReadIdentityScope(),
            tableKeys:getManagerTableManagementItems().map(item=>item.id).join('|'),...view
        };
    }
    disconnectedCallback() {
        this.instance?.destroy();
        if (managerTableManagementInstance === this.instance) managerTableManagementInstance = null;
        this.instance = null;
    }
}

customElements.define('bloomscapes-consolidation-grid',BloomscapesConsolidationGrid);
