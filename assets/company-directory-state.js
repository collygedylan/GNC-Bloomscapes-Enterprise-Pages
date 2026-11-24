const companyDirectoryCache = window.GncCompanyDirectoryCache.create();
const managerCompanyDirectoryState = { owner: '', kind: 'contacts', query: '', filterValue: '', reviewOnly: false, contacts: [], blocks: [], beds: [], codes: [], loading: false, loaded: false, loadGeneration: 0, error: '', formOpen: false, editing: null };
function getCompanyDirectoryOwner() {
    return JSON.stringify([getSupabaseReadIdentityScope(), getProductionLiveSyncContext().dataPermissionVersion || '', getManagersToolAccess().canManageCompanyDirectory]);
}
function getCompanyDirectoryState() {
    const state = managerCompanyDirectoryState, owner = getCompanyDirectoryOwner();
    if (state.owner !== owner) {
        Object.assign(state, { owner, query: '', filterValue: '', contacts: [], blocks: [], beds: [], codes: [], loaded: false, loading: false, error: '', formOpen: false, editing: null, refreshPending: false });
        state.loadGeneration++;
    }
    return state;
}
const managerCompanyDirectoryMeta = {
    contacts: { table: 'ph_company_directory_contacts', title: 'Employee contacts', columns: [['name','Name'],['department','Department'],['extension','Extension'],['cell_number','Cell'],['home_number','Home'],['location','Location']], fields: [['name','Name',true],['department','Department',false],['extension','Extension',false],['cell_number','Cell number',false],['home_number','Home number',false],['location','Location',true]] },
    blocks: { table: 'ph_company_directory_beds', title: 'Blocks & beds', columns: [['block_letter','Block'],['bed_identifier','Bed'],['capacity','Capacity']], fields: [['block_letter','Block',true],['bed_identifier','Bed identifier',true],['capacity','Bed capacity',true,'number']] },
    codes: { table: 'ph_company_directory_codes', title: 'Production plant & project codes', columns: [['code','Code'],['description','Project / plant description'],['department_reference','Department ID / name']], fields: [['code','Code',true],['description','Project / plant description',true],['department_reference','Department ID / name',false]] }
};
function companyDirectoryEsc(value) { return typeof esc === 'function' ? esc(value == null ? '' : String(value)) : String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
async function loadCompanyDirectory(root) {
    const state = getCompanyDirectoryState();
    if (!getManagersToolAccess().canManageCompanyDirectory) return;
    const owner = state.owner;
    const cached = companyDirectoryCache.peek(owner);
    if (cached) Object.assign(state, cached, { loaded: true });
    const generation = state.loadGeneration = Number(state.loadGeneration || 0) + 1;
    state.loading = true; state.error = '';
    if (root && !state.loaded) {
        root.innerHTML = renderCompanyDirectoryPanel();
        mountCompanyDirectoryResults(root);
    }
    try {
        const snapshot = await companyDirectoryCache.refresh(owner, readCompanyDirectoryRelation);
        if (generation !== state.loadGeneration || owner !== getCompanyDirectoryOwner() || !getManagersToolAccess().canManageCompanyDirectory) return;
        Object.assign(state, snapshot, { loaded: true });
    } catch (error) {
        if (generation === state.loadGeneration && owner === getCompanyDirectoryOwner()) {
            if ([401, 403].includes(Number(error?.status)) || error?.code === '42501') Object.assign(state, { contacts: [], blocks: [], beds: [], codes: [], loaded: false, formOpen: false, editing: null });
            state.error = error?.message || 'Unable to load the company directory.';
        }
    } finally {
        if (generation === state.loadGeneration && owner === getCompanyDirectoryOwner()) {
            state.loading = false;
            if (root?.isConnected && getCurrentVisibleViewId() === 'managers' && activeHomeTab === MANAGER_COMPANY_DIRECTORY_VIEW) {
                const next = document.createElement('template'); next.innerHTML = renderCompanyDirectoryPanel();
                window.AgMetricStableViewDom.apply(root, next.content);
                mountCompanyDirectoryResults(root);
            }
        }
    }
}

function renderCompanyDirectoryPanel() {
    const state=getCompanyDirectoryState(),meta=managerCompanyDirectoryMeta[state.kind];
    const {field,label,rows}=readCompanyDirectoryFilters(state);
    const {filterOptions}=companyDirectoryCache.select(rows,field,state);
    const options={contacts:'Employee contacts',blocks:'Blocks & beds',codes:'Production codes'};
    const kinds=Object.entries(options).map(([key,title])=>directoryOption(key,title,state.kind)).join('');
    const values=filterOptions.map(value=>directoryOption(value,value,state.filterValue)).join('');
    const columns=meta.columns.map(([,title])=>'<th class="px-3 py-2">'+title+'</th>').join('');
    const totals=state.kind==='blocks' ? renderCompanyDirectoryBlockSummary(state) : '';
    const notice=state.error && !state.formOpen ? companyDirectoryError(state.error) : '';
    return '<section class="rounded-2xl border border-emerald-100 bg-white p-3 sm:p-4">'
        +'<header class="mb-3 flex flex-wrap justify-between gap-2"><h2 class="text-lg font-black">Company Directory</h2>'
        +'<button data-company-directory-refresh class="min-h-10" type="button" '+(state.loading?'disabled':'')+'>Refresh</button>'
        +'<button data-company-directory-add type="button" class="min-h-10">'+(state.kind==='blocks'?'＋ Add bed row':'＋ Add record')+'</button></header>'
        +'<div class="mb-3 flex flex-wrap gap-2"><select data-company-directory-kind aria-label="Directory category">'+kinds+'</select>'
        +'<select data-company-directory-filter aria-label="Filter by '+label+'"><option value="">All '+label+'s</option>'+values+'</select>'
        +'<input data-company-directory-search aria-label="Search directory" value="'+companyDirectoryEsc(state.query)+'" placeholder="Search all fields…">'
        +'<label><input data-company-directory-review type="checkbox" '+(state.reviewOnly?'checked':'')+'> Needs review</label></div>'
        +totals+notice+'<div class="overflow-auto rounded-xl border border-slate-200" style="height:65dvh;contain:layout style paint">'
        +'<table class="w-full min-w-[700px] border-collapse text-left text-xs" style="table-layout:fixed;overflow-wrap:anywhere">'
        +'<thead class="sticky top-0 bg-emerald-50 text-emerald-900"><tr>'+columns+'<th class="px-3 py-2">Actions</th>'
        +'</tr></thead><tbody></tbody></table></div><p data-company-directory-count role="status"></p></section>'
        +(state.formOpen ? renderCompanyDirectoryForm(state,meta) : '');
}

function readCompanyDirectoryFilters(state) {
    const settings={contacts:['location','location'],blocks:['block_letter','block'],codes:['department_reference','department']};
    const [field,label]=settings[state.kind];
    return {field,label,rows:state.kind==='blocks' ? state.beds : state[state.kind]};
}

function directoryOption(value,label,selected) {
    return '<option value="'+companyDirectoryEsc(value)+'" '+(value===selected?'selected':'')+'>'
        +companyDirectoryEsc(label)+'</option>';
}

function companyDirectoryError(error) {
    return '<p class="rounded-xl bg-red-50 px-3 py-2 text-red-800" role="alert">'+companyDirectoryEsc(error)+'</p>';
}

function renderCompanyDirectoryBlockSummary(state) {
    return '<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">'
        +state.blocks.map(block=>renderCompanyDirectoryBlock(state,block)).join('')
        +'<button type="button" data-company-directory-block-add>＋ Add block</button></div>';
}

function renderCompanyDirectoryBlock(state,block) {
    const beds=state.beds.filter(bed=>bed.block_letter===block.letter);
    const capacity=beds.reduce((total,bed)=>total+Number(bed.capacity || 0),0);
    const letter=companyDirectoryEsc(block.letter);
    return '<div class="rounded-xl border border-emerald-100 px-3 py-2"><strong>'+companyDirectoryEsc(block.name)
        +'</strong><p>'+beds.length+' beds · '+capacity.toLocaleString()+' total</p>'
        +'<label>Block label<input data-company-directory-block-name="'+letter+'" value="'+companyDirectoryEsc(block.name)+'"></label>'
        +'<button type="button" data-company-directory-block-delete="'+letter+'">Delete block</button></div>';
}

function renderCompanyDirectoryForm(state,meta) {
    const fields=meta.fields.map(field=>renderCompanyDirectoryInput(state,field)).join('');
    return '<div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/60 p-3" data-company-directory-scrim>'
        +'<form data-company-directory-form class="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">'
        +'<div class="mb-4 flex justify-between"><h3 class="text-lg font-black">'+(state.editing?'Edit ':'Add ')+meta.title
        +'</h3><button type="button" data-company-directory-close aria-label="Close">×</button></div>'
        +'<div class="grid gap-2 sm:grid-cols-2">'+fields+'</div>'
        +(state.error?companyDirectoryError(state.error):'')
        +'<div class="mt-4 flex justify-end gap-2"><button type="button" data-company-directory-close>Cancel</button>'
        +'<button type="submit" class="min-h-10 rounded-xl bg-emerald-700 px-4 text-white">Save record</button></div></form></div>';
}

function renderCompanyDirectoryInput(state,[key,label,required,type]) {
    const value=state.editing?.[key] ?? '';
    let input;
    if (state.kind==='blocks' && key==='block_letter') {
        const options=[...'ABCDEFGHIJKL'].map(letter=>directoryOption(letter,letter,value)).join('');
        input='<select required name="'+key+'" class="min-h-10 rounded-lg border px-3">'+options+'</select>';
    } else {
        input='<input name="'+key+'" type="'+(type || 'text')+'" '+(required?'required':'')
            +' '+(type==='number'?'min="0.01" step="0.01"':'')+' value="'+companyDirectoryEsc(value)
            +'" class="min-h-10 rounded-lg border px-3">';
    }
    return '<label class="grid gap-1 text-sm">'+label+input+'</label>';
}

function mountCompanyDirectoryResults(root) {
    const body=root.querySelector('tbody'),count=root.querySelector('[data-company-directory-count]');
    if (!body || !count) return;
    const state=getCompanyDirectoryState(),meta=managerCompanyDirectoryMeta[state.kind];
    const {rows,field}=readCompanyDirectoryFilters(state);
    const filtered=companyDirectoryCache.select(rows,field,state).rows;
    count.textContent=filtered.length.toLocaleString()+' records';
    mountChunkedList(body,filtered,row=>renderCompanyDirectoryResultRow(row,meta));
    if (!filtered.length) {
        const cell=body.insertRow().insertCell();
        cell.colSpan=meta.columns.length+1;
        cell.textContent=state.loading ? 'Loading directory…' : 'No matching records.';
    }
}

function renderCompanyDirectoryResultRow(row,meta) {
    const result=document.createElement('tr');
    result.dataset.rowId=String(row.id);
    for (const [key] of meta.columns) result.insertCell().textContent=row[key] ?? '—';
    const actions=result.insertCell();
    actions.className='whitespace-nowrap';
    for (const [label,key] of [['Edit','companyDirectoryEdit'],['Delete','companyDirectoryDelete']]) {
        const button=actions.appendChild(document.createElement('button'));
        button.type='button';
        button.textContent=label;
        button.dataset[key]=String(row.id);
        button.className='rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold';
    }
    return result;
}

function mountCompanyDirectoryPanel(root) {
    if (!root || root.dataset.companyDirectoryMounted==='true') return;
    root.dataset.companyDirectoryMounted='true';
    root.dataset.preserveDom='true';
    root.addEventListener('gnc-manager-source-revision',event=>refreshCompanyDirectoryFromRevision(root,event));
    root.addEventListener('focusout',()=>queueMicrotask(()=>resumeCompanyDirectoryRefresh(root)));
    root.addEventListener('input',event=>dispatchCompanyDirectoryFilter(root,event.target));
    root.addEventListener('change',event=>dispatchCompanyDirectoryChange(root,event.target));
    root.addEventListener('click',event=>void dispatchCompanyDirectoryAction(root,event.target.closest('button')));
    root.addEventListener('submit',event=>dispatchCompanyDirectorySubmit(root,event));
    void loadCompanyDirectory(root);
}

function refreshCompanyDirectoryFromRevision(root,event) {
    if (event.detail?.surface!=='company-directory' || !getManagersToolAccess().canManageCompanyDirectory) return;
    const state=getCompanyDirectoryState();
    if (state.formOpen || root.contains(document.activeElement)) { state.refreshPending=true; return; }
    void loadCompanyDirectory(root);
}

function resumeCompanyDirectoryRefresh(root) {
    const state=getCompanyDirectoryState();
    if (!root.isConnected || !state.refreshPending || state.formOpen || root.contains(document.activeElement)) return;
    state.refreshPending=false;
    void loadCompanyDirectory(root);
}

function dispatchCompanyDirectoryFilter(root,control) {
    if (!control.matches('[data-company-directory-search]')) return;
    getCompanyDirectoryState().query=control.value;
    mountCompanyDirectoryResults(root);
}

function dispatchCompanyDirectoryChange(root,control) {
    const state=getCompanyDirectoryState();
    if (control.matches('[data-company-directory-kind]')) {
        Object.assign(state,{kind:control.value,query:'',filterValue:''});
        void loadCompanyDirectory(root);
        return;
    }
    if (control.matches('[data-company-directory-filter]')) {
        state.filterValue=control.value;
        mountCompanyDirectoryResults(root);
        return;
    }
    if (control.matches('[data-company-directory-review]')) {
        state.reviewOnly=control.checked;
        mountCompanyDirectoryResults(root);
        return;
    }
    if (control.matches('[data-company-directory-block-name]')) {
        const letter=control.dataset.companyDirectoryBlockName;
        const name=control.value.trim();
        void runCompanyDirectoryCommand(root,()=>saveCompanyDirectoryBlockLabel(letter,name));
    }
}

function redrawCompanyDirectory(root) {
    const next=document.createElement('template');
    next.innerHTML=renderCompanyDirectoryPanel();
    window.AgMetricStableViewDom.apply(root,next.content);
    mountCompanyDirectoryResults(root);
}

function setCompanyDirectoryForm(root,opened,record=null) {
    Object.assign(getCompanyDirectoryState(),{formOpen:opened,editing:record,error:''});
    redrawCompanyDirectory(root);
    if (!opened) resumeCompanyDirectoryRefresh(root);
}

function companyDirectoryRecord(state,id) {
    return (state.kind==='blocks' ? state.beds : state[state.kind]).find(item=>String(item.id)===id);
}

async function dispatchCompanyDirectoryAction(root,target) {
    if (!target) return;
    const state=getCompanyDirectoryState();
    if (target.matches('[data-company-directory-refresh]')) return loadCompanyDirectory(root);
    if (target.matches('[data-company-directory-add]')) return setCompanyDirectoryForm(root,true);
    if (target.matches('[data-company-directory-close]')) return setCompanyDirectoryForm(root,false);
    if (target.matches('[data-company-directory-block-add]')) return runCompanyDirectoryCommand(root,()=>addCompanyDirectoryBlock(state));
    const {companyDirectoryEdit:edit,companyDirectoryDelete:remove,companyDirectoryBlockDelete:block}=target.dataset;
    if (edit) {
        const row=companyDirectoryRecord(state,edit);
        return setCompanyDirectoryForm(root,Boolean(row),row);
    }
    if (remove) return confirmCompanyDirectoryRecordRemoval(root,state,remove);
    if (block) return confirmCompanyDirectoryBlockRemoval(root,state,block);
}

function confirmCompanyDirectoryRecordRemoval(root,state,id) {
    const row=companyDirectoryRecord(state,id);
    const label=row?.name || row?.bed_identifier || row?.code || 'this record';
    if (!window.confirm('Delete “'+label+'”? This cannot be undone.')) return;
    return runCompanyDirectoryCommand(root,()=>deleteCompanyDirectoryRecord(managerCompanyDirectoryMeta[state.kind].table,'id',id));
}

function confirmCompanyDirectoryBlockRemoval(root,state,block) {
    const count=state.beds.filter(bed=>bed.block_letter===block).length;
    if (!window.confirm('Delete Block '+block+' and all '+count+' bed rows? This cannot be undone.')) return;
    return runCompanyDirectoryCommand(root,()=>deleteCompanyDirectoryRecord('ph_company_directory_blocks','letter',block));
}

function saveCompanyDirectoryBlockLabel(letter,name) {
    if (!name) throw new Error('Block label is required.');
    return saveCompanyDirectoryRecord('ph_company_directory_blocks',{name},'letter',letter);
}

function addCompanyDirectoryBlock(state) {
    const next=[...'ABCDEFGHIJKL'].find(letter=>!state.blocks.some(block=>block.letter===letter));
    if (!next) throw new Error('All blocks A through L already exist.');
    return saveCompanyDirectoryRecord('ph_company_directory_blocks',{letter:next,name:'Block '+next});
}

function dispatchCompanyDirectorySubmit(root,event) {
    if (!event.target.matches('[data-company-directory-form]')) return;
    event.preventDefault();
    const state=getCompanyDirectoryState();
    const form=new FormData(event.target);
    void runCompanyDirectoryCommand(root,async()=>{
        const meta=managerCompanyDirectoryMeta[state.kind];
        await saveCompanyDirectoryRecord(meta.table,companyDirectoryFormValues(state.kind,meta,form),'id',state.editing?.id);
        Object.assign(state,{formOpen:false,editing:null});
    });
}

function companyDirectoryFormValues(kind,meta,form) {
    const values={};
    for (const [key,label,required,type] of meta.fields) {
        const raw=String(form.get(key) || '').trim();
        if (required && !raw) throw new Error(label+' is required.');
        values[key]=type==='number' ? Number(raw) : raw || null;
    }
    if (kind==='blocks') {
        values.block_letter=String(values.block_letter).toUpperCase();
        values.bed_identifier=String(values.bed_identifier).toUpperCase();
        if (!/^[A-L]$/.test(values.block_letter)) throw new Error('Block must be a letter from A through L.');
        if (!Number.isFinite(values.capacity) || values.capacity<=0) throw new Error('Bed capacity must be a positive number.');
    }
    return values;
}

async function runCompanyDirectoryCommand(root,command) {
    const state=getCompanyDirectoryState();
    const owner=state.owner;
    if (state.saving) return;
    state.saving=true;
    try {
        await command();
        if (owner===getCompanyDirectoryState().owner) await loadCompanyDirectory(root);
    } catch (error) {
        if (!root.isConnected || owner!==getCompanyDirectoryState().owner) return;
        state.error=error.message;
        redrawCompanyDirectory(root);
    } finally {
        if (owner===getCompanyDirectoryState().owner) state.saving=false;
    }
}
