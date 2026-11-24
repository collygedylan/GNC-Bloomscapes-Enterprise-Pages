{
const TABLES = Object.freeze([
  { id: 'assigned-items', label: 'Assigned Items', section: 'editable', description: 'Current warehouse rows joined with live inventory and row assignments.' },
  { id: 'company-directory', label: 'Company Directory', section: 'editable', description: 'People, contacts, roles, departments, territories, and active status.', managed: true },
  { id: 'inquiry-coverage', label: 'Inquiry Coverage', section: 'editable', description: 'Location, block, group, primary and backup users.', managed: true },
  { id: 'customer-assignments', label: 'Customer Assignments', section: 'editable', description: 'Versioned customer and consignee sales-rep assignments.' },
  { id: 'user-role-access', label: 'User Role and Access', section: 'editable', description: 'Canonical role and module permissions.' },
  ...(window.GncNurseryModel?.TABLES || []),
  { id: 'historical-drive-mode', label: 'Historical Drive Mode', section: 'archive', description: 'Read-only Drive Around snapshots.' },
  { id: 'historical-soc-open-orders', label: 'Historical SOC Open Orders', section: 'archive', description: 'Read-only SOC Open Orders snapshots.' },
  { id: 'historical-soc-reserves', label: 'Historical SOC Reserves', section: 'archive', description: 'Read-only SOC Reserves snapshots.' },
  { id: 'historical-requests', label: 'Historical Requests', section: 'archive', description: 'Read-only completed request records and archive folders.' },
  { id: 'photo-history', label: 'Photo History', section: 'archive', description: 'Read-only historical plant and location photo gallery.' },
]);
const EDIT_FIELDS = Object.freeze({
  'company-directory': [
    ['name', 'Name', 'text', true], ['username', 'Username', 'text'], ['email', 'Email', 'email'],
    ['phone', 'Phone', 'tel'], ['userrole', 'Role', 'text'], ['department', 'Department', 'text'],
    ['territory', 'Territory', 'text'], ['active', 'Active', 'checkbox'],
  ],
  'inquiry-coverage': [
    ['scope', 'Scope', 'scope', true], ['block', 'Block', 'text'], ['location', 'Location', 'text'],
    ['group_name', 'Group', 'text'], ['primary_user', 'Primary user', 'user', true],
    ['backup_user', 'Backup user', 'user'], ['notes', 'Notes', 'textarea'], ['active', 'Active', 'checkbox'],
  ],
});
const COLUMNS = Object.freeze({
  'company-directory': [['name', 'Name'], ['username', 'Username'], ['email', 'Email'], ['phone', 'Phone'], ['userrole', 'Role'], ['department', 'Department'], ['territory', 'Territory'], ['active', 'Active']],
  'inquiry-coverage': [['scope', 'Scope'], ['block', 'Block'], ['location', 'Location'], ['group_name', 'Group'], ['primary_user', 'Primary user'], ['backup_user', 'Backup user'], ['active', 'Active']],
});

function text(value) { return String(value == null ? '' : value); }
function escape(value) { return text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function csv(rows, columns) {
  const quote = value => `"${text(value).replace(/"/g, '""')}"`;
  return [columns.map(([, label]) => quote(label)).join(','), ...rows.map(row => columns.map(([key]) => quote(row[key])).join(','))].join('\r\n');
}

function managedScopeOptions(value) {
    return ['block','location','group','all'].map(option =>
        '<option value="'+option+'"'+(value === option ? ' selected' : '')+'>'+option+'</option>').join('');
}

function managedUserOptions(users,value,includeEmail) {
    return users.map(user => {
        const selected = text(value).toLowerCase() === text(user.username).toLowerCase() ? ' selected' : '';
        const label = [user.display_name,user.username,includeEmail && user.email].filter(Boolean).map(escape).join(' · ');
        return '<option value="'+escape(user.username)+'"'+selected+'>'+label+'</option>';
    }).join('');
}

function managedFormField([key,label,type,required],row,users) {
    const value = row ? row[key] : key === 'active' ? true : key === 'scope' ? 'location' : '';
    const name = ' name="'+key+'"';
    const req = required ? ' required' : '';
    const control = managedFormControl(type,key,name,req,value,users);
    return '<label>'+escape(label)+control+'</label>';
}

function managedFormControl(type,key,name,required,value,users) {
    if (type === 'checkbox') return '<input'+name+(value === true ? ' checked' : '')+' type="checkbox">';
    if (type === 'scope') return '<select'+name+' required>'+managedScopeOptions(value)+'</select>';
    if (type === 'user') return '<select'+name+required+'><option value="">Choose user</option>'+managedUserOptions(users,value,true)+'</select>';
    if (type === 'textarea') return '<textarea'+name+' maxlength="2000">'+escape(value)+'</textarea>';
    const limit = {email:254,name:160,username:80}[key] || 120;
    return '<input'+name+' type="'+type+'"'+required+' maxlength="'+limit+'" value="'+escape(value)+'">';
}

function renderForm(table,row,users,error,saving) {
    const fields = EDIT_FIELDS[table].map(field => managedFormField(field,row,users)).join('');
    const message = error ? '<p class="tm-error" role="alert">'+escape(error)+'</p>' : '';
    return '<form class="tm-form" data-form><h3>'+(row ? 'Edit row' : 'Add row')+'</h3>'+fields+message
        +'<div><button type="button" data-cancel>Cancel</button><button type="submit"'
        +(saving ? ' disabled>Saving…' : '>Save Changes')+'</button></div></form>';
}

function renderInlineField(row,key,users) {
    const value = row[key];
    const attr = ' data-inline-field="'+key+'" aria-label="'+key+'"';
    if (key === 'active') return '<input type="checkbox"'+attr+(value === true ? ' checked' : '')+'>';
    if (key === 'scope') return '<select'+attr+'>'+managedScopeOptions(value)+'</select>';
    if (key === 'primary_user' || key === 'backup_user') {
        return '<select'+attr+'><option value="">'+(key === 'primary_user' ? 'Choose user' : 'None')
            +'</option>'+managedUserOptions(users,value,false)+'</select>';
    }
    const limit = {name:160,email:254,userrole:64,phone:64}[key] || 120;
    return '<input'+attr+' maxlength="'+limit+'" value="'+escape(value)+'">';
}

function managedTablePicker(allowedTables) {
    const editable = TABLES.filter(item => item.section === 'editable' && allowedTables.has(item.id)).map(item => `<button type="button" data-table-select="${item.id}" class="tm-choice"><strong>${escape(item.label)}</strong><span>${escape(item.description)}</span><em>EDITABLE TABLE</em></button>`).join('');
    const archives = TABLES.filter(item => item.section === 'archive' && allowedTables.has(item.id)).map(item => `<button type="button" data-table-select="${item.id}" class="tm-choice"><strong>${escape(item.label)}</strong><span>${escape(item.description)}</span><em>READ-ONLY ARCHIVE</em></button>`).join('');
    return `<section class="tm-shell"><header><h2>Table Management</h2><p>Choose a maintained table or browse an archive.</p></header><h3>Editable maintained tables</h3><div class="tm-grid">${editable}</div><h3>Read-only historical and photo archives</h3><div class="tm-grid">${archives}</div></section>`;
}

function managedTableMarkup(selected,state,options) {
    const labels = COLUMNS[state.selected];
    const rows = state.rows.map(row => `<tr data-inline-row="${escape(row.id)}">${labels.map(([key]) => `<td>${renderInlineField(row, key, state.users)}</td>`).join('')}<td><button type="button" data-save-row="${escape(row.id)}">Save Changes</button><button type="button" data-edit="${escape(row.id)}">More fields</button><button type="button" data-delete="${escape(row.id)}">Delete</button></td></tr>`).join('');
    const form = state.formOpen ? renderForm(state.selected, state.editing, state.users, state.error, state.saving) : '';
    return `<section class="tm-shell"><header><button type="button" data-back>All tables</button><span class="tm-badge">EDITABLE TABLE</span><h2>${escape(selected.label)}</h2><p>${escape(selected.description)}</p></header>${state.selected === 'inquiry-coverage' && typeof options.legacyCoverage === 'function' ? `<aside class="tm-legacy-coverage">${options.legacyCoverage()}</aside>` : ''}${state.selected === 'company-directory' && options.canOpenLegacyDirectory === true ? '<aside class="tm-legacy-coverage"><p>Open the existing contacts, block capacities, and production code directory.</p><button type="button" data-legacy-directory>Company contacts, blocks &amp; production codes</button></aside>' : ''}<div class="tm-toolbar"><label><input aria-label="Search table" type="search" data-managed-table-search data-search value="${escape(state.query)}" maxlength="120"></label><button type="button" data-refresh ${state.loading ? 'disabled' : ''}>Refresh</button><button type="button" data-export>Export CSV</button><button type="button" data-add>+ Add Row</button></div>${state.error && !state.formOpen ? `<div role="status" class="tm-error">${escape(state.error)} <button type="button" data-refresh>Retry</button></div>` : ''}${state.loading && !state.rows.length ? '<p role="status">Loading…</p>' : ''}<div class="tm-scroll"><table><thead><tr>${labels.map(([, label]) => `<th>${escape(label)}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${rows || (!state.loading ? `<tr><td colspan="${labels.length + 1}">No rows found.</td></tr>` : '')}</tbody></table></div><footer><span>${state.total.toLocaleString()} rows</span></footer>${form}</section>`;
}

function installManagedTableStyle() {
    const style = document.createElement('style');
    style.dataset.managerTableStyle = 'true';
    style.textContent = '#manager-table-management-root .tm-shell{display:grid;gap:16px}.tm-shell header,.tm-shell .tm-toolbar,.tm-shell footer,.tm-form{border:1px solid #d1fae5;border-radius:16px;background:#0b2417;padding:16px}.tm-shell h2{font-size:24px;font-weight:900;color:#ecfdf5}.tm-shell h3{font-size:14px;font-weight:900;color:#ecfdf5}.tm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.tm-choice{display:flex;min-height:120px;flex-direction:column;align-items:flex-start;gap:8px;border:1px solid #d1fae5;border-radius:14px;background:#0b2417;padding:14px;text-align:left}.tm-choice strong{color:#ecfdf5;font-weight:900}.tm-choice span{font-size:12px;color:#a7f3d0}.tm-choice em,.tm-badge{font-size:10px;font-weight:900;font-style:normal;color:#6ee7b7}.tm-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:8px}.tm-toolbar label{flex:1;min-width:200px}.tm-toolbar input,.tm-form input,.tm-form select,.tm-form textarea{display:block;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px}.tm-form input[type=checkbox]{width:auto}.tm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.tm-form h3,.tm-form p,.tm-form>div{grid-column:1/-1}.tm-form label{display:grid;gap:5px;font-size:12px;font-weight:700}.tm-scroll{overflow:auto;border:1px solid #d1fae5;border-radius:12px;background:#0b2417}.tm-scroll table{width:100%;border-collapse:collapse;font-size:12px}.tm-scroll th,.tm-scroll td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.tm-scroll th{background:#ecfdf5}.tm-error{color:#b91c1c}.tm-legacy-coverage{border:1px solid #d1fae5;border-radius:14px;padding:12px;background:#0b2417}.tm-shell button{min-height:40px;border-radius:8px;padding:8px 12px;font-weight:800}.tm-link{color:#6ee7b7;text-decoration:underline}';

    document.head.appendChild(style);
    return style;
}

let retained = {identity:'',tables:new Map()};

function managedTableSelection(view,key) {
    return TABLES.find(item => item.id === key && view.allowed.has(item.id));
}

function mountManagerTableManagement(root,options = {}) {
    if (!root || typeof options.request !== 'function' || typeof options.openTable !== 'function') {
        throw new TypeError('Table Management requires a root and guarded transport and navigation callbacks.');
    }
    const allowed = new Set((Array.isArray(options.tables) ? options.tables : TABLES).map(item => typeof item === 'string' ? item : item?.id));
    const identity = String(options.nurseryIdentity || '');
    if (retained.identity !== identity) retained = {identity,tables:new Map()};
    const state = {selected:'',rows:[],users:[],query:'',total:0,loading:false,saving:false,
        error:'',editing:null,formOpen:false,generation:0,commandTokens:new Map()};
    const lifetime = new window.AbortController();
    const view = {root,options,state,allowed,cache:retained.tables,lifetime,nursery:null};
    const style = installManagedTableStyle();
    root.addEventListener('click',event => void dispatchManagedTableClick(view,event),{signal:lifetime.signal});
    root.addEventListener('input',event => queueManagedTableSearch(view,event),{signal:lifetime.signal});
    root.addEventListener('submit',event => void submitManagedTableForm(view,event),{signal:lifetime.signal});
    const selected = managedTableSelection(view,options.selected);
    if (selected) void openManagedTable(view,selected);
    else redrawManagedTable(view);
    return {destroy() {
        lifetime.abort();
        view.nursery?.destroy();
        state.generation++;
        clearTimeout(state.searchTimer);
        style.remove();
        root.replaceChildren();
    }};
}

function redrawManagedTable(view) {
    const {root,state,options} = view;
    if (!root.isConnected) return;
    const selected = managedTableSelection(view,state.selected);
    if (!selected) { root.innerHTML = managedTablePicker(view.allowed); return; }
    if (selected.nursery) return drawManagedNursery(view);
    if (!selected.managed) {
        options.openTable(state.selected);
        state.selected = '';
        return;
    }
    const key = JSON.stringify([state.selected,state.query]);
    const previous = root.querySelector('.tm-scroll');
    const position = previous?.dataset.scrollKey === key ? [previous.scrollTop,previous.scrollLeft] : [0,0];
    root.innerHTML = managedTableMarkup(selected,state,options);
    const next = root.querySelector('.tm-scroll');
    if (next) {
        next.dataset.scrollKey = key;
        [next.scrollTop,next.scrollLeft] = position;
    }
}

function drawManagedNursery(view) {
    const {root,options,state} = view;
    view.nursery?.destroy();
    view.nursery = window.GncNurseryTables.mount(root,{
        selected:state.selected,identity:options.nurseryIdentity,authorized:options.nurseryAuthorized,
        inventory:options.inventory,inventoryReady:options.inventoryReady,revision:options.inventoryRevision,
        onBunchNoteSaved:options.onBunchNoteSaved,onBunchNoteError:options.onBunchNoteError,request:options.nurseryRequest,
        sendPdf:options.nurserySendPdf,approvedBy:options.nurseryApprovedBy,selectView:options.onSelect,
        back:()=>closeManagedTable(view)
    });
}

function closeManagedTable(view) {
    if (view.options.onSelect) return view.options.onSelect('');
    view.nursery?.destroy();
    view.nursery = null;
    view.state.selected = '';
    view.state.generation++;
    redrawManagedTable(view);
}

async function openManagedTable(view,selected) {
    const {state} = view;
    state.selected = selected.id;
    if (!selected.managed) return redrawManagedTable(view);
    state.query = '';
    state.rows = [];
    state.total = 0;
    if (selected.id === 'inquiry-coverage' && !state.users.length) await loadManagedTableUsers(view,selected.id);
    if (!view.lifetime.signal.aborted && state.selected === selected.id) await loadManagedTable(view);
}

async function loadManagedTableUsers({options,state,lifetime},table) {
    try {
        const response = await options.request({action:'manager_table_management',operation:'users',table,payload:{}});
        if (lifetime.signal.aborted || state.selected !== table) return;
        const rows = (response?.data || response).rows;
        state.users = Array.isArray(rows) ? rows.filter(user => user?.username && user?.display_name) : [];
    } catch (error) {
        state.error = error.message || 'User directory unavailable.';
    }
}

async function collectManagedTableRows(request,table,query,current) {
    const rows = [];
    let total;
    for (let page = 0; current() && (total === undefined || rows.length < total); page++) {
        const response = await request({action:'manager_table_management',operation:'read',table,payload:{page,pageSize:100,q:query}});
        const batch = response?.data || response;
        total ??= Number(batch.total || 0);
        if (!Array.isArray(batch.rows) || Number(batch.total ?? total) !== total) break;
        rows.push(...batch.rows);
        if (batch.rows.length < 100) break;
    }
    if (current() && (rows.length !== total || new Set(rows.map(row => row.id)).size !== total)) {
        throw new Error('Table rows changed while loading. Refresh to see the latest rows.');
    }
    return {rows,total};
}

async function loadManagedTable(view) {
    const {state,root,options,cache,lifetime} = view;
    if (!managedTableSelection(view,state.selected)?.managed) return;
    const generation = ++state.generation;
    const key = JSON.stringify([state.selected,state.query]);
    const current = () => root.isConnected && !lifetime.signal.aborted && generation === state.generation;
    const saved = cache.get(key);
    if (saved) Object.assign(state,saved);
    state.loading = true;
    state.error = '';
    redrawManagedTable(view);
    try {
        const result = await collectManagedTableRows(options.request,state.selected,state.query,current);
        if (!current()) return;
        Object.assign(state,result);
        cache.set(key,result);
        if (cache.size > 16) cache.delete(cache.keys().next().value);
    } catch (error) {
        if (current()) state.error = error.message || 'Table could not be loaded.';
    } finally {
        if (current()) { state.loading = false; redrawManagedTable(view); }
    }
}

function queueManagedTableSearch(view,event) {
    if (!event.target.matches('[data-search]')) return;
    const {state} = view;
    state.query = event.target.value;
    state.generation++;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => void loadManagedTable(view),250);
}

function managedTablePayload(inputs) {
    return Object.fromEntries([...inputs].map(input => [
        input.dataset.inlineField || input.name,input.type === 'checkbox' ? input.checked : text(input.value).trim() || null
    ]));
}

function managedRowPayload(row) {
    return {id:row.id,expectedRevision:String(row.revision)};
}

async function saveManagedTableChange(view,operation,payload,{close = false,refresh = false} = {}) {
    const {state,options,lifetime} = view;
    const table = state.selected;
    const signature = JSON.stringify([operation,table,payload]);
    const commandId = state.commandTokens.get(signature) || window.crypto.randomUUID();
    state.commandTokens.set(signature,commandId);
    state.saving = true;
    state.error = '';
    redrawManagedTable(view);
    try {
        const response = await options.request({action:'manager_table_management',operation,table,
            payload:{...payload,command_id:commandId}});
        if (lifetime.signal.aborted || table !== state.selected) return;
        state.commandTokens.delete(signature);
        await applyManagedTableSave(view,response,{close,refresh});
    } catch (error) {
        if (!lifetime.signal.aborted && table === state.selected) state.error = error.message || 'Save failed.';
    } finally {
        state.saving = false;
        if (!lifetime.signal.aborted && table === state.selected) redrawManagedTable(view);
    }
}

async function applyManagedTableSave(view,response,{close,refresh}) {
    const {state} = view;
    if (close) { state.formOpen = false; state.editing = null; }
    const receipt = (response?.data || response)?.row;
    if (refresh || !receipt) return loadManagedTable(view);
    state.rows = state.rows.map(row => row.id === receipt.id ? receipt : row);
}

function exportManagedTable(view) {
    const {state} = view;
    if (state.rows.length !== state.total || state.loading) return;
    const columns = COLUMNS[state.selected];
    if (typeof window.downloadManagerRowsToExcel === 'function') {
        window.downloadManagerRowsToExcel(columns,state.rows,managedTableSelection(view,state.selected).label);
        return;
    }
    const blob = new Blob(['\uFEFF',csv(state.rows,columns)],{type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = state.selected+'.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),10000);
}

async function dispatchManagedTableClick(view,event) {
    const button = event.target.closest('button');
    if (!button || !view.root.contains(button)) return;
    const {state,options} = view;
    if (button.dataset.tableSelect) {
        const item = managedTableSelection(view,button.dataset.tableSelect);
        if (item) return options.onSelect ? options.onSelect(item.id) : openManagedTable(view,item);
    }
    if (button.hasAttribute('data-back')) return closeManagedTable(view);
    if (button.hasAttribute('data-legacy-directory')) return options.openLegacyDirectory?.();
    if (button.hasAttribute('data-export')) return exportManagedTable(view);
    if (button.hasAttribute('data-refresh')) return loadManagedTable(view);
    if (state.saving) return;
    const id = button.dataset.edit || button.dataset.saveRow || button.dataset.delete;
    const row = state.rows.find(item => String(item.id) === id);
    if (button.dataset.saveRow && row) {
        const inputs = button.closest('tr').querySelectorAll('[data-inline-field]');
        return saveManagedTableChange(view,'update',{...managedRowPayload(row),...managedTablePayload(inputs)});
    }
    if (button.dataset.delete && row && window.confirm('Delete this row? This cannot be undone.')) {
        return saveManagedTableChange(view,'delete',managedRowPayload(row),{refresh:true});
    }
    if (!button.matches('[data-add],[data-edit],[data-cancel]')) return;
    state.editing = row || null;
    state.formOpen = !button.hasAttribute('data-cancel');
    state.error = '';
    redrawManagedTable(view);
}

function submitManagedTableForm(view,event) {
    const {state} = view;
    if (!event.target.matches('[data-form]')) return;
    event.preventDefault();
    if (state.saving) return;
    const fields = event.target.querySelectorAll('[name]');
    const payload = managedTablePayload(fields);
    if (state.editing) Object.assign(payload,managedRowPayload(state.editing));
    return saveManagedTableChange(view,state.editing ? 'update' : 'create',payload,{close:true,refresh:true});
}

window.GncManagerTableManagement = Object.freeze({mountManagerTableManagement,tables:TABLES});
}
