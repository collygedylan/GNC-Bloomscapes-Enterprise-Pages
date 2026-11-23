function mountConsolidationManagerGrid(root,key) {
    if (!canViewFieldWorkConsolidation()) return {destroy() {}};
    const identity = getSupabaseReadIdentityScope();
    const preview = borrowedHelpPreview();
    const state = {key,page:0,rows:[],total:0,revision:0,loading:false,saving:false};
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
        commandConsolidationPage(context,0);
    };
    grid.onclick = event => dispatchConsolidationGridClick(context,event.target);
    dialog.onsubmit = event => {
        event.preventDefault();
        void saveConsolidationGridRow(context,event.target);
    };
    commandConsolidationPage(context,0);
    return {destroy:() => grid.remove()};
}

function dispatchConsolidationGridClick(context,target) {
    if (!context.current()) return;
    const button = target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-consolidation-page')) {
        commandConsolidationPage(context,context.state.page+Number(button.dataset.consolidationPage));
    }
    if (!context.editable || context.state.saving) return;
    if (button.hasAttribute('data-consolidation-save')) void saveConsolidationGridRow(context,button.closest('tr'));
    if (button.hasAttribute('data-consolidation-add')) {
        context.dialog.innerHTML = renderConsolidationAddForm(context.state.key);
        context.dialog.showModal();
    }
    if (button.hasAttribute('data-consolidation-cancel')) context.dialog.close();
}

function commandConsolidationPage(context,page) {
    if (context.state.saving || !context.current()) return;
    void loadConsolidationGridPage(context,Math.max(0,page));
}

async function loadConsolidationGridPage(context,page) {
    const {state,grid,current,filters,status,editable} = context;
    const revision = ++state.revision;
    const form = new FormData(filters);
    const query = {query:form.get('query'),size:form.get('size')?.trim(),source:form.get('source')};
    state.loading = true;
    status.textContent = 'Loading…';
    try {
        const result = await readConsolidationLookup(state.key,query,page);
        if (!current() || revision !== state.revision) return;
        Object.assign(state,result,{page});
        grid.querySelector('tbody').innerHTML = state.rows.map((row,index) =>
            renderConsolidationGridRow(state.key,row,index,editable)).join('');
        grid.querySelector('[data-consolidation-page="-1"]').disabled = page === 0;
        grid.querySelector('[data-consolidation-page="1"]').disabled = (page+1)*consolidationPageSize >= state.total;
        status.textContent = state.total ? `${state.total.toLocaleString()} rows · Page ${page+1}` : 'No rows found.';
    } catch (error) {
        if (current() && revision === state.revision) status.textContent = error.message;
    } finally {
        if (revision === state.revision) state.loading = false;
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
    if (adding && current() && !dialog.open) commandConsolidationPage(context,state.page);
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
