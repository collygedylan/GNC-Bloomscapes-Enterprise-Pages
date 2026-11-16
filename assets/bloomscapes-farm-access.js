async function mountBloomscapesFarmAccessEditor(container,selected) {
    if (currentUser!=='dylan_collyge' || !['user-role-access','company-directory'].includes(selected)) return;
    let host = container.querySelector('[data-farm-access-editor]');
    if (host) return;
    host = container.appendChild(document.createElement('section'));
    host.dataset.farmAccessEditor = 'true';
    const title = host.appendChild(document.createElement('h3'));
    title.textContent = 'Farm access · Users and roles';
    const status = host.appendChild(document.createElement('p'));
    status.setAttribute('role','status');
    const owner = getSupabaseReadIdentityScope();
    if (selected==='user-role-access') void mountBloomscapesModuleAccess(host);
    try {
        const rows = await readBloomscapesPanel('farm-access');
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        rows.forEach(row=>appendBloomscapesFarmAccessForm(host,row,'USER',status));
        const roles = [...new Set(rows.map(row=>row.role))];
        roles.forEach(role=>appendBloomscapesFarmAccessForm(host,{username:role,allowed_farms:[],default_farm:'10-PH'},'ROLE',status));
    } catch (error) { if (host.isConnected) status.textContent = error.message; }
}

function appendBloomscapesFarmAccessForm(host,row,subjectType,status) {
    const form = host.appendChild(document.createElement('form'));
    const name = form.appendChild(document.createElement('strong'));
    name.textContent = `${subjectType==='ROLE' ? 'Role' : 'User'}: ${row.username} `;
    for (const farm of ['10-PH','60-HL','20-TX','40-NC']) {
        const label = form.appendChild(document.createElement('label'));
        const input = label.appendChild(document.createElement('input'));
        input.type = 'checkbox';
        input.value = farm;
        input.name = 'farms';
        input.checked = row.allowed_farms.includes(farm);
        label.appendChild(document.createTextNode(` ${farm} `));
    }
    const save = form.appendChild(document.createElement('button'));
    save.textContent = subjectType==='ROLE' ? 'Apply to role' : 'Save farm access';
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void saveBloomscapesFarmAccessForm(form,row,subjectType,status);
    });
}

async function saveBloomscapesFarmAccessForm(form,row,subjectType,status) {
    const button = form.querySelector('button');
    if (button.disabled) return;
    const farms = [...form.querySelectorAll('input:checked')].map(input=>input.value);
    if (!farms.length) { status.textContent = 'Select at least one farm.'; return; }
    button.disabled = true;
    status.textContent = 'Saving farm access…';
    try {
        const receipt = await submitBloomscapesCommand('farm-access',{
            username:row.username,subjectType,farms,defaultFarm:farms.includes(row.default_farm) ? row.default_farm : farms[0]
        });
        if (receipt?.ok!==true || receipt.subject!==row.username) throw new Error('Farm access was not confirmed.');
        row.allowed_farms = receipt.allowed_farms;
        row.default_farm = receipt.default_farm;
        status.textContent = `Saved ${receipt.affected} ${subjectType==='ROLE' ? 'role members' : 'user'}.`;
    } catch (error) { if (status.isConnected) status.textContent = error.message; }
    finally { button.disabled = false; }
}

function mountBloomscapesFarmWorkspace(root,selected) {
    root.replaceChildren();
    root.dataset.nativeFarmWorkspace='true';
    root.dataset.owner=getSupabaseReadIdentityScope();
    root.dataset.selected=selected;
    const title=root.appendChild(document.createElement('h2'));
    title.textContent=selected==='company-directory'?'Company Directory':'User Role and Access';
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
    return tab===MANAGER_TABLE_MANAGEMENT_VIEW && ['user-role-access','company-directory'].includes(managerTableManagementSelection)
        ? managerTableManagementSelection : '';
}

function keepBloomscapesFarmWorkspace(container) {
    const root=container.querySelector('[data-native-farm-workspace]');
    return !!root && root.dataset.owner===getSupabaseReadIdentityScope()
        && root.dataset.selected===bloomscapesFarmWorkspaceSelection();
}
