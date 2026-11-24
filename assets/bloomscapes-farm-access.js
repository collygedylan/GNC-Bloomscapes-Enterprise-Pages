async function mountBloomscapesFarmAccessEditor(container,selected) {
    if (currentUser!=='dylan_collyge' || selected!=='company-directory' || container.querySelector('[data-farm-access-editor]')) return;
    const host=container.appendChild(document.createElement('section'));
    host.dataset.farmAccessEditor='true';
    host.innerHTML='<div class="farm-directory-search"><label>Search directory<input type="search" placeholder="Name, username or role"></label></div>'+
        '<p role="status">Loading farm access…</p><div class="farm-directory-scroll"><table aria-label="Farm access">'+
        '<thead><tr><th scope="col">Display Name / @username</th>'+directoryFarms.map(([farm])=>'<th scope="col">'+farm+'</th>').join('')+
        '<th scope="col">Changes</th></tr></thead><tbody></tbody></table></div>';
    const owner=getSupabaseReadIdentityScope(),status=host.querySelector('[role=status]');
    const current=()=>host.isConnected && owner===getSupabaseReadIdentityScope();
    const state={host,current,status,rows:[],drafts:new Map(),pending:new Set()};
    host.addEventListener('input',event=>{
        if (event.target.type==='search') paintFarmDirectory(state);
    });
    host.addEventListener('change',event=>stageFarmSelection(state,event.target));
    host.addEventListener('click',event=>dispatchFarmDirectoryButton(state,event.target.closest('button')));
    try {
        const rows=await readBloomscapesDirectoryRoster();
        if (!current()) return;
        const people=rows.map(row=>({...row,type:'USER',name:row.display_name || formatAppUserDisplayName(row.username)}));
        const roles=[...new Set(rows.map(row=>row.role))].sort().map(role=>({
            username:role,type:'ROLE',name:formatAppUserDisplayName(role),allowed_farms:[],default_farm:''
        }));
        state.rows=[...people,...roles];
        status.textContent='';
        paintFarmDirectory(state);
    } catch(error) {if (current()) status.textContent=error.message;}
}

function paintFarmDirectory(state) {
    const {host,rows}=state;
    const query=host.querySelector('input[type=search]').value.trim().toLowerCase();
    const matches=rows.filter(row=>(row.name+' '+row.username+' '+(row.role || row.type)).toLowerCase().includes(query));
    host.querySelector('tbody').innerHTML=matches.map(row=>farmDirectoryRow(state,row)).join('') ||
        '<tr><td colspan="6">No matching people or roles.</td></tr>';
}

function farmDirectoryRow(state,row) {
    const key=row.type+':'+row.username, saving=state.pending.has(key);
    const selected=state.drafts.get(key) || row.allowed_farms;
    const pills=directoryFarms.map(([farm])=>`<td><label class="farm-directory-pill"><input type="checkbox" value="${farm}"
        aria-label="${esc(row.name)} · ${farm}" ${selected.includes(farm)?'checked':''} ${saving?'disabled':''}><span>${farm}</span></label></td>`);
    const handle=row.type==='ROLE'?'Role':'@'+row.username;
    return `<tr data-farm-subject="${esc(key)}"><th scope="row"><strong>${esc(row.name)}</strong><small>${esc(handle)}</small></th>
        ${pills.join('')}<td><button type="button" data-farm-save ${saving?'disabled':''}>${row.type==='ROLE'?'Apply to role':'Save'}</button></td></tr>`;
}

function stageFarmSelection(state,input) {
    const tr=input.closest('tr[data-farm-subject]');
    if (!tr || !state.current() || input.type!=='checkbox') return;
    state.drafts.set(tr.dataset.farmSubject,[...tr.querySelectorAll('input:checked')].map(node=>node.value));
}

function dispatchFarmDirectoryButton(state,button) {
    if (!button || !state.current()) return;
    if (button.hasAttribute('data-farm-save')) {
        const key=button.closest('tr').dataset.farmSubject;
        const row=state.rows.find(item=>item.type+':'+item.username===key);
        if (row) void saveFarmDirectoryAccess(state,row,key);
    }
}

async function saveFarmDirectoryAccess(state,row,key) {
    if (state.pending.has(key)) return;
    const farms=state.drafts.get(key) || row.allowed_farms;
    if (!farms.length) {state.status.textContent='Select at least one farm.';return;}
    state.pending.add(key);
    state.status.textContent='Saving farm access…';
    paintFarmDirectory(state);
    try {
        const receipt=await submitBloomscapesCommand('farm-access',{
            username:row.username,subjectType:row.type,farms,defaultFarm:farms.includes(row.default_farm)?row.default_farm:farms[0]
        });
        if (!state.current()) return;
        if (receipt?.ok!==true || receipt.subject!==row.username || receipt.subject_type!==row.type ||
            !Array.isArray(receipt.allowed_farms) || !receipt.allowed_farms.includes(receipt.default_farm) || !(receipt.affected>0)) {
            throw new Error('Farm access was not confirmed.');
        }
        for (const item of state.rows) {
            if (item===row || row.type==='ROLE' && item.role===row.username) {
                Object.assign(item,{allowed_farms:receipt.allowed_farms,default_farm:receipt.default_farm});
            }
        }
        state.drafts.delete(key);
        invalidateScopedSecondarySnapshots('directory:');
        invalidateScopedSecondarySnapshots('picker-users:');
        state.status.textContent='Farm access saved for '+row.name+'.';
        showToast('Farm access',state.status.textContent);
    } catch(error) {if (state.current()) state.status.textContent=error.message;}
    finally {state.pending.delete(key);if (state.current()) paintFarmDirectory(state);}
}

function mountBloomscapesFarmWorkspace(root,selected) {
    if (['user-role-access','user-controls'].includes(selected)) {
        root.dataset.nativeFarmWorkspace='true';
        root.dataset.owner=getSupabaseReadIdentityScope();
        root.dataset.selected=selected;
        return mountBloomscapesUserDirectory(root);
    }
    root.replaceChildren();
    root.dataset.nativeFarmWorkspace='true';
    root.dataset.owner=getSupabaseReadIdentityScope();
    root.dataset.selected=selected;
    const title=root.appendChild(document.createElement('h2'));
    title.textContent='Company Directory';
    const back=root.appendChild(document.createElement('button'));
    back.textContent='All tables';
    back.addEventListener('click',()=>openManagerTableManagement(''));
    if (selected==='company-directory') {
        const contacts=root.appendChild(document.createElement('button'));
        contacts.textContent='Company contacts, blocks & production codes';
        contacts.addEventListener('click',()=>openBloomscapesCompanyContacts());
    }
    void mountBloomscapesFarmAccessEditor(root,selected);
    return {destroy:()=>root.replaceChildren()};
}

function openBloomscapesCompanyContacts() {
    managerTableManagementDirectOpen=true;
    try { setHomeTab(MANAGER_COMPANY_DIRECTORY_VIEW); }
    finally { managerTableManagementDirectOpen=false; }
}

function bloomscapesFarmWorkspaceSelection(tab=activeHomeTab) {
    if (currentUser!=='dylan_collyge') return '';
    if (tab===MANAGER_ACCESS_CONTROL_VIEW) return 'user-role-access';
    return tab===MANAGER_TABLE_MANAGEMENT_VIEW && ['user-role-access','user-controls','company-directory'].includes(managerTableManagementSelection)
        ? managerTableManagementSelection : '';
}

function keepBloomscapesFarmWorkspace(container) {
    const root=container.querySelector('[data-native-farm-workspace]');
    return !!root && root.dataset.owner===getSupabaseReadIdentityScope()
        && root.dataset.selected===bloomscapesFarmWorkspaceSelection();
}
