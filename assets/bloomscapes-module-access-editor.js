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
