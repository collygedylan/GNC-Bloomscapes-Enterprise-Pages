async function mountBloomscapesModuleAccess(host) {
    const owner=getSupabaseReadIdentityScope();
    const root=host.appendChild(document.createElement('details'));
    root.dataset.moduleAccess='true';
    root.appendChild(document.createElement('summary')).textContent='Module access · Users and roles · HIDDEN / VIEW_ONLY / FULL_EDIT';
    const status=root.appendChild(document.createElement('p'));status.setAttribute('role','status');
    try {
        const rows=await readBloomscapesModuleAccess();
        if (!root.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        for (const row of rows) appendBloomscapesModuleAccess(root,status,row);
    } catch(error) {if (status.isConnected) status.textContent=error.message;}
}

function appendBloomscapesModuleAccess(root,status,row) {
    const names={hl_po:'PO Management',messages:'Messages',walkie:'Push to Talk Walkie'};
    const label=root.appendChild(document.createElement('label'));
    label.textContent=row.subject_type+' '+row.subject_key+' · '+names[row.view_key];
    const select=label.appendChild(document.createElement('select'));
    for (const level of ['HIDDEN','VIEW_ONLY','FULL_EDIT']) select.add(new Option(level,level));
    select.value=row.access_level;
    select.disabled=row.subject_type==='USER' && row.subject_key==='dylan_collyge';
    select.addEventListener('change',()=>void dispatchBloomscapesModuleAccess(select,status,row));
}

async function dispatchBloomscapesModuleAccess(select,status,row) {
    const owner=getSupabaseReadIdentityScope(),level=select.value;
    select.disabled=true;
    try {
        const receipt=await saveBloomscapesModuleAccess(row,level);
        if (!select.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        invalidateScopedSecondarySnapshots('picker-users:');
        row.access_level=receipt.access_level;status.textContent='Saved '+row.subject_key+' · '+row.view_key+' · '+level;
    } catch(error) {
        if (select.isConnected) {select.value=row.access_level;status.textContent=error.message;}
    } finally {select.disabled=false;}
}

function mountConsolidationGrantControl(host,type,key) {
    if (borrowedHelpPreview() || currentUser !== 'dylan_collyge') return;
    const owner = getSupabaseReadIdentityScope();
    const current = () => label.isConnected && owner === getSupabaseReadIdentityScope() && !borrowedHelpPreview();
    const label = host.appendChild(document.createElement('label'));
    label.className = 'consolidation-grant-control';
    label.textContent = 'Field Work Consolidation';
    const select = label.appendChild(document.createElement('select'));
    select.setAttribute('aria-label','Field Work Consolidation');
    select.disabled = true;
    select.add(new Option('N','N'));
    select.add(new Option('Y','Y'));
    const status = label.appendChild(document.createElement('span'));
    status.setAttribute('role','status');
    status.textContent = 'Loading…';
    const editable = type === 'USER' && canEditConsolidationUserGrant(key);
    void runConsolidationAccessSettings(type,key).then(grant => {
        if (!current()) return;
        select.value = grant;
        select.disabled = !editable;
        status.textContent = '';
        if (editable) select.onchange = () => void dispatchConsolidationGrant(select,status,key,current);
    }).catch(error => { if (current()) status.textContent = error.message; });
}

async function dispatchConsolidationGrant(select,status,key,current) {
    const requested = select.value;
    select.disabled = true;
    status.textContent = 'Saving…';
    try {
        const grant = await runConsolidationAccessSettings('USER',key,requested === 'Y');
        if (!current()) return;
        select.value = grant;
        status.textContent = 'Saved.';
        if (key === currentUser) await window.GncUserAccessControl?.loadSelf?.({force:true});
    } catch (error) {
        if (!current()) return;
        select.value = requested === 'Y' ? 'N' : 'Y';
        status.textContent = error.message;
    } finally {
        if (current()) select.disabled = false;
    }
}

Object.assign(globalThis,{mountConsolidationGrantControl});

function mountDockPipelineAccess(host,type,subject) {
    if (!subject || borrowedHelpPreview()) return;
    const identity = getSupabaseReadIdentityScope();
    const root = document.createElement('fieldset');
    root.dataset.dockPipelineAccess = subject;
    root.innerHTML = '<legend>Docks workflow access</legend><p role="status">Loading access…</p>';
    host.append(root);
    const current = () => root.isConnected && identity === getSupabaseReadIdentityScope() && !borrowedHelpPreview();
    const status = root.querySelector('[role="status"]');
    void requestDockPipelineSettings(type,subject).then(receipt=>{
        if (!current()) return;
        status.textContent = '';
        for (const field of dockPipelineViews) appendDockPipelineAccessField(root,field,receipt,status,current);
        if (type === 'USER' && receipt.que_order_pulling) {
            const capability = root.appendChild(document.createElement('output'));
            capability.textContent = 'Que · Order Pulling · '+receipt.que_order_pulling;
        }
    }).catch(error=>{if (current()) status.textContent = error.message;});
}

function appendDockPipelineAccessField(root,[key,name],receipt,status,current) {
    const label = document.createElement('label');
    label.textContent = name;
    const select = document.createElement('select');
    select.name = key;
    select.add(new Option('N','N'));
    select.add(new Option('Y','Y'));
    select.value = receipt.permissions[key] === 'Y' ? 'Y' : 'N';
    select.disabled = !receipt.editable;
    label.append(select);
    root.append(label);
    select.addEventListener('change',()=>void saveDockPipelineAccessField(select,key,receipt,status,current));
}

async function saveDockPipelineAccessField(select,key,receipt,status,current) {
    const former = receipt.permissions[key] === 'Y' ? 'Y' : 'N';
    const value = select.value;
    select.disabled = true;
    try {
        const saved = await requestDockPipelineSettings(receipt.subject_type,receipt.subject_key,{[key]:value});
        if (!current()) return;
        receipt.permissions[key] = saved.permissions[key];
        select.value = saved.permissions[key] === 'Y' ? 'Y' : 'N';
        status.textContent = 'Saved';
    } catch (error) {
        if (!current()) return;
        select.value = former;
        status.textContent = error.message;
    } finally {
        if (current()) select.disabled = false;
    }
}
