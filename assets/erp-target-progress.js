function renderSelectedErpSyncModal(modal) {
    const state = getSelectedErpSyncState();
    const selected = getSelectedErpSyncKeys();
    mountErpTargetSelection(modal,selected,state?.active===true);
    modal.querySelector('[data-sync-overall]').value=state?.percent || 0;
    modal.querySelector('[data-sync-elapsed]').textContent=(state?.percent || 0)+'%';
    const stage = state ? `[Stage ${state.index+1} / ${state.targets.length}]` : 'Ready';
    modal.querySelector('[data-sync-badge]').textContent=state?.error || (state?.percent===100 && !state.active ? 'Completed' : stage);
    modal.querySelector('[data-sync-run]').disabled=state?.active===true;
    modal.querySelector('[data-sync-cards]').innerHTML=(state?.targets || selectErpSyncTargets(selected)).map((target,index)=>
        renderSelectedErpTargetCard(target,state?.stages[index],index,state?.targets.length || selected.length)).join('');
}

function mountErpTargetSelection(modal,selected,busy) {
    let choices = modal.querySelector('[data-erp-target-choices]');
    if (!choices) {
        choices=document.createElement('details');
        choices.dataset.erpTargetChoices='true';
        choices.innerHTML='<summary>Choose ERP targets</summary><div data-erp-target-inputs></div>';
        modal.querySelector('[data-sync-cards]').before(choices);
        choices.addEventListener('change',commitErpTargetSelection);
    }
    choices.querySelector('[data-erp-target-inputs]').innerHTML=ERP_SYNC_TARGETS.map(target=>
        `<label style="display:block"><input type="checkbox" value="${target.key}" ${selected.includes(target.key) ? 'checked' : ''} ${busy ? 'disabled' : ''}> ${escapeDashboardSyncText(target.farm+' · '+target.label)}</label>`).join('');
}

function commitErpTargetSelection(event) {
    const choices=event.currentTarget;
    const keys=[...choices.querySelectorAll('input:checked')].map(input=>input.value);
    try { setSelectedErpSyncKeys(keys); }
    catch (error) { showToast('ERP selection',error.message,true); }
    renderErpSyncProgressModal();
}

function renderSelectedErpTargetCard(target,stage,index,total) {
    const status=stage?.status || 'queued';
    const labels={queued:'Waiting',running:'Checking Pending folder',recovering:'Recovering the same stage',
        no_new_file:'✓ Up to Date (No new file in Pending)',published:'✓ Published and verified',failed:'Stage failed'};
    const percent=['published','no_new_file'].includes(status) ? 100 : 0;
    const escape=escapeDashboardSyncText;
    return `<article class="erp-sync-file" data-sync-file="${target.key}"><strong>[Stage ${index+1} / ${total}] ${escape(target.shortLabel)}</strong>
        <span class="erp-sync-farm">${target.farm}</span><div>${escape('TEST BUILD/'+target.folderPath)}</div>
        <small>${escape(target.tableName)}</small><progress max="100" value="${percent}" aria-label="${escape(target.label)} progress"></progress>
        <div>${labels[status]}</div></article>`;
}
