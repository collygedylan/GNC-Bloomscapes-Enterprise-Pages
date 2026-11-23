const directoryAreaRoles = [
    ['super-admin','Super-Admin'], ['admin','Admin'], ['manager','Manager'], ['supervisor','Supervisor'],
    ['eval','Eval'], ['rep','Sales Rep'], ['csr','CSR'], ['crew','Crew']
];

function mountDirectoryUserAreaPolicy(host, row, current = () => true) {
    if (!row.id || row.preview) return;
    mountDirectoryAreaPolicy(host, {id:row.id}, !row.editable, current);
}

function mountDirectoryRoleAreaPolicy(host, role) {
    if (!['manager','supervisor'].includes(role)) return;
    mountDirectoryAreaPolicy(host, {role}, false, () => host.isConnected);
}

function mountDirectoryAreaPolicy(host, target, locked, current) {
    const root = document.createElement('section');
    root.dataset.areaPolicyEditor = '';
    root.className = 'user-directory-panel';
    const heading = document.createElement('h3');
    heading.textContent = 'Role Tier & Business Areas';
    const status = document.createElement('p');
    status.setAttribute('role','status');
    status.textContent = 'Loading area access…';
    root.append(heading,status);
    host.append(root);
    const operation = target.id ? 'read' : 'read-role';
    void runBloomscapesBusinessAreaPolicy(operation,target).then(receipt => {
        if (!root.isConnected || !current()) return;
        status.textContent = '';
        mountDirectoryAreaForm(root,status,receipt,target,locked,current);
    }).catch(error => { if (root.isConnected && current()) status.textContent=error.message; });
}

function mountDirectoryAreaForm(root, status, initial, target, locked, current) {
    const panel = document.createElement('div');
    const groups = document.createElement('div');
    groups.innerHTML = renderDirectoryAreaFields(initial, target, locked);
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save Area Access';
    save.disabled = locked;
    panel.append(groups,save);
    status.before(panel);
    let confirmed = initial;
    save.onclick = async () => {
        if (!current() || save.disabled) return;
        const desired = directoryAreaSubmission(groups, target, confirmed);
        if (JSON.stringify(desired.area_scopes) === JSON.stringify(confirmed.area_scopes)
            && Object.keys(desired.overrides).length === 0 && desired.role === confirmed.role
            && (!target.id || JSON.stringify(desired.allowed_farms) === JSON.stringify(confirmed.allowed_farms))) return;
        save.disabled = true;
        status.textContent = 'Saving area access…';
        try {
            const receipt = await runBloomscapesBusinessAreaPolicy(target.id ? 'save' : 'save-role', desired);
            if (!panel.isConnected || !current()) return;
            confirmed = receipt;
            groups.innerHTML = renderDirectoryAreaFields(confirmed, target, locked);
            syncDirectoryAreaRoleBadge(root,receipt);
            status.textContent = 'Area access saved';
        } catch (error) {
            if (!panel.isConnected || !current()) return;
            groups.innerHTML = renderDirectoryAreaFields(confirmed,target,locked);
            status.textContent = error.message;
        } finally { save.disabled = locked; }
    };
}

function renderDirectoryAreaFields(receipt, target, locked) {
    const scopes = receipt.area_scopes || [];
    const areas = BLOOMSCAPES_BUSINESS_AREAS.map(({id})=>[id,id]);
    const roles = [...directoryAreaRoles];
    if (receipt.role && !roles.some(([id])=>id===receipt.role)) roles.push([receipt.role,receipt.role]);
    const role = target.id ? renderDirectoryAreaPills('Role Tier','role',roles,[receipt.role],locked,'radio') : '';
    const farms = target.id ? renderDirectoryAreaPills('Allowed Farms','farm',directoryFarms,receipt.allowed_farms || [],locked) : '';
    const scope = renderDirectoryAreaPills('Assigned Business Areas','area',areas,scopes,locked);
    return role+farms+scope+renderDirectoryAreaOverrides(receipt.overrides || {},locked,Boolean(target.id));
}

function renderDirectoryAreaPills(legend,name,options,selected,locked,type='checkbox') {
    const pills = options.map(([value,label]) => '<label data-area-policy-pill><input type="'+type+'" name="area-policy-'+name
        +'" value="'+esc(value)+'" '+(selected.includes(value)?'checked ':'')
        +(locked || value==='super-admin'?'disabled':'')+'><span>'+esc(label)+'</span></label>');
    return '<fieldset><legend>'+legend+'</legend><div data-area-policy-pills>'+pills.join('')+'</div></fieldset>';
}

function renderDirectoryAreaOverrides(overrides,locked,userPolicy) {
    const groups = BLOOMSCAPES_BUSINESS_AREAS.map(area => {
        const views = area.id === 'PRODUCTION' ? [...area.views,...BLOOMSCAPES_STUDIO_PHASES.map(([key,label])=>[bloomscapesStudioPermission(key),label])] : area.views;
        return '<fieldset><legend>'+area.id+'</legend>'+views.map(([key,label])=>renderDirectoryAreaOverride(key,label,overrides[key],locked || userPolicy && key==='inventory-office')).join('')+'</fieldset>';
    });
    return '<details><summary>Per-view access</summary>'+groups.join('')+'</details>';
}

function renderDirectoryAreaOverride(key,label,value,locked) {
    const options=[['','Inherit'],['HIDDEN','Hidden'],['VIEW_ONLY','View only'],['FULL_EDIT','Full edit']];
    return '<label>'+esc(label)+'<select data-area-view-override="'+esc(key)+'" '+(locked?'disabled':'')+'>'
        +options.map(([id,title])=>'<option value="'+id+'" '+(id===(value||'')?'selected':'')+'>'+title+'</option>').join('')
        +'</select></label>';
}

function directoryAreaSubmission(groups,target,confirmed) {
    const values = name => [...groups.querySelectorAll('[name="area-policy-'+name+'"]:checked')].map(node=>node.value).sort();
    const overrides = Object.fromEntries([...groups.querySelectorAll('[data-area-view-override]')]
        .filter(node=>node.value !== (confirmed.overrides?.[node.dataset.areaViewOverride] || ''))
        .map(node=>[node.dataset.areaViewOverride,node.value || null]));
    const fields = { ...target, role:values('role')[0] || confirmed.role, area_scopes:values('area'), overrides, before:confirmed };
    if (target.id) Object.assign(fields, { allowed_farms:values('farm'), default_farm:confirmed.default_farm });
    return fields;
}

function syncDirectoryAreaRoleBadge(root,receipt) {
    const detail = root.closest('[data-directory-detail]');
    const picker = detail?.querySelector('select[data-user-field="role"]');
    if (!picker) return;
    if (![...picker.options].some(option=>option.value===receipt.role)) picker.add(new Option(receipt.role,receipt.role));
    picker.value = receipt.role;
}
