const BLOOMSCAPES_STUDIO_PHASES=[
    ['cans','Can Filling','CAN_FILLING','Can Filling',''],
    ['bunch','Bunch Notes','BUNCH_NOTES','Bunch & Tie','Overwinter Process: Grade · Bunch · Consolidate'],
    ['consolidate','Consolidate Inventory','HAULING','Consolidate',''],
    ['shear','Shearing','SHEARING','Add to Shear List','']
];

const BLOOMSCAPES_STUDIO_LEGACY_ROUTES=Object.assign(Object.create(null),{
    'field-jobs':'','bloomscapes-field-jobs':'','bunch-note':'bunch','bunch-notes':'bunch',
    'bloomscapes-bunch-notes':'bunch','grading':'bunch','bloomscapes-grading':'bunch','shift-grading':'bunch',
    'can-fill':'cans','can-filling':'cans','bloomscapes-can-filling':'cans','shear-list':'shear',
    'shearing':'shear','bloomscapes-shearing':'shear','location-moves':'consolidate',
    'location-work':'consolidate','hauling':'consolidate','bloomscapes-hauling':'consolidate'
});

function bloomscapesStudioRoute(route) {
    return BLOOMSCAPES_STUDIO_LEGACY_ROUTES[route];
}

function bindBloomscapesWorkTypes(root,form,options) {
    const phase=BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===options.phase);
    if (!phase) return;
    root.dataset.studioPhase=phase[0];
    selectBloomscapesStudioAction(form,phase[3]);
    root.querySelector('[data-work-browser]').hidden=options.quick===true;
}

function placeBloomscapesWorkRowEditor(root,sourceId) {
    const panel=root.querySelector('[data-work-row-editor]');
    const source=[...root.querySelectorAll('[data-work-source-row]')]
        .find(button=>button.dataset.workSourceRow===sourceId);
    (source?.closest('article') || root).appendChild(panel);
    panel.hidden=false;
}

function parkBloomscapesWorkRowEditor(host) {
    const root=host.closest('[data-work-creator]');
    const panel=root?.querySelector('[data-work-row-editor]');
    if (panel && host.contains(panel)) root.appendChild(panel);
}

function bloomscapesCanChooseWork(kind) {
    return isFullAppAdministrator() || bloomscapesFieldQueueState.canCreate?.[kind]===true;
}

function selectBloomscapesStudioAction(form,action) {
    const entry=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([label])=>label===action)
        || (action==='Custom Bunch Note' && [action,'BUNCH_NOTES']);
    if (!entry || !bloomscapesCanChooseWork(entry[1])) return false;
    form.elements.workView.value=entry[1];
    syncBloomscapesWorkCreatorKind(form);form.elements.actionType.value=action;
    syncBloomscapesWorkDetailFields(form);
    return true;
}

function syncBloomscapesWorkDetailFields(form) {
    const kind=form.elements.workView.value;
    form.elements.targetLocation.closest('label').hidden=!['HAULING','Y_GRADING'].includes(kind);
    form.elements.targetLocation.required=['HAULING','Y_GRADING'].includes(kind);
    form.elements.actionType.closest('label').hidden=kind!=='BUNCH_NOTES';
    form.elements.quantity.closest('label').hidden=kind==='SHEARING';
    form.elements.quantity.disabled=kind==='SHEARING';
    form.elements.percent.required=kind==='SHEARING';
    for (const name of ['container','media','fertilizer']) form.elements[name].closest('label').hidden=kind!=='CAN_FILLING';
}

function syncBloomscapesWorkDestinations(root,form) {
    const source=bloomscapesWorkBrowserRows().find(row=>String(row.UNIQUE_ID || row.unique_id)===form.elements.sourceId.value);
    if (!source) return;
    const consolidate=form.elements.actionType.value==='Consolidate';
    const rows=consolidate?bloomscapesConsolidationCandidates(source):bloomscapesWorkBrowserRows();
    const locations=[...new Set(rows.map(row=>row.LOCATIONCODE || row.locationcode))].filter(Boolean).sort();
    const prior=form.elements.targetLocation.value;
    form.elements.targetLocation.replaceChildren(new Option('Choose destination',''),...locations.map(location=>new Option(location,location)));
    if (locations.includes(prior)) form.elements.targetLocation.value=prior;
    let choices=root.querySelector('[data-consolidation-destinations]');
    if (!choices) {choices=document.createElement('div');choices.dataset.consolidationDestinations='true';form.elements.targetLocation.closest('label').after(choices);}
    choices.replaceChildren();choices.hidden=!consolidate;
    prefillBloomscapesPlanningWork(form,source);
    if (!consolidate) return;
    if (!rows.length) choices.textContent='No other location holds this item within the active App SaleYear.';
    void hydrateBloomscapesConsolidationSpace(root,form,choices,source);
    void ensureBloomscapesPlanningRows([source,...rows]).then(()=>{
        if (!choices.isConnected || form.elements.sourceId.value!==String(source.UNIQUE_ID || source.unique_id)) return;
        for (const button of choices.querySelectorAll('[data-consolidation-destination]')) {
            const row=rows.find(row=>(row.LOCATIONCODE || row.locationcode)===button.dataset.consolidationDestination);
            if (row) decorateBloomscapesConsolidationChoice(button,row,source);
        }
    });
    for (const row of rows) {
        const button=choices.appendChild(document.createElement('button'));button.type='button';
        const location=row.LOCATIONCODE || row.locationcode;button.dataset.consolidationDestination=location;button.dataset.consolidationLot=String(row.LOTCODE || row.lotcode);
        button.textContent=bloomscapesConsolidationDestinationLabel(row);
        button.addEventListener('click',()=>{form.elements.targetLocation.value=location;form.elements.targetLocation.dispatchEvent(new Event('change'));});
    }
}

async function hydrateBloomscapesConsolidationSpace(root,form,choices,source) {
    if (typeof readBloomscapesConsolidationDestinations!=='function') return;
    const id=String(source.UNIQUE_ID || source.unique_id),owner=getSupabaseReadIdentityScope();
    const revision=String(Number(root.dataset.destinationRevision || 0)+1);root.dataset.destinationRevision=revision;
    try {
        const rows=await readBloomscapesConsolidationDestinations(id);
        if (!root.isConnected || owner!==getSupabaseReadIdentityScope() || root.dataset.destinationRevision!==revision
            || form.elements.sourceId.value!==id || form.elements.actionType.value!=='Consolidate') return;
        for (const button of choices.querySelectorAll('[data-consolidation-destination]')) {
            const matches=rows.filter(row=>row.LOCATIONCODE===button.dataset.consolidationDestination);
            const lot=button.dataset.consolidationLot;
            const row=matches.find(row=>String(row.LOTCODE)===lot);
            if (row) {
                button.textContent=bloomscapesConsolidationDestinationLabel({...resolveCanonicalInventoryRow(row),open_beds:row.open_beds,can_space:row.can_space});
                decorateBloomscapesConsolidationChoice(button,row,source);
            }
        }
    } catch (error) {
        if (root.isConnected && root.dataset.destinationRevision===revision && form.elements.sourceId.value===id) {
            const status=choices.appendChild(document.createElement('p'));status.textContent=error.message;
        }
    }
}
