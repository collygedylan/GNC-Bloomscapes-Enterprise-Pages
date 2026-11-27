const BLOOMSCAPES_STUDIO_PHASES=[
    ['cans','Can Filling','CAN_FILLING','Can Filling',''],
    ['bunch','Bunch Notes','BUNCH_NOTES','Bunch & Tie','Overwinter Process: Grade · Bunch · Consolidate'],
    ['consolidate','Consolidate Inventory','HAULING','Consolidate',''],
    ['shear','Shearing','SHEARING','Add to Shear List',''],
    ['grading','Shift Grading','Y_GRADING','Shift Grading',''],
    ['hauling','Hauling','HAULING','Haul',''],
    ['counts','Block Counts & Poly / Spread','BUNCH_NOTES','Bunch Count','']
];

const BLOOMSCAPES_STUDIO_LEGACY_ROUTES=Object.assign(Object.create(null),{
    'field-jobs':'','bloomscapes-field-jobs':'','bunch-note':'bunch','bunch-notes':'bunch',
    'bloomscapes-bunch-notes':'bunch','grading':'grading','bloomscapes-grading':'grading','shift-grading':'grading',
    'can-fill':'cans','can-filling':'cans','bloomscapes-can-filling':'cans','shear-list':'shear',
    'shearing':'shear','bloomscapes-shearing':'shear','location-moves':'consolidate',
    'location-work':'consolidate','consolidate-inventory':'consolidate',
    'hauling':'hauling','field-work-hauling':'hauling','bloomscapes-hauling':'hauling'
});

/**
 * @param {string} route Requested studio route.
 * @returns {string|undefined} Work studio phase associated with a route.
 */
function bloomscapesStudioRoute(route) {
    return BLOOMSCAPES_STUDIO_LEGACY_ROUTES[route];
}

/**
 * @param {Element|Document} root Root of the mounted surface.
 * @param {HTMLFormElement} form Current form.
 * @param {object} options Configuration for this operation.
 * @returns {void} Selects the initial phase and shows its eligible controls.
 */
function bindBloomscapesWorkTypes(root,form,options) {
    const phase=BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===options.phase);
    if (!phase) return;
    root.dataset.studioPhase=phase[0];
    selectBloomscapesStudioAction(form,phase[3]);
    root.querySelector('[data-work-browser]').hidden=options.quick===true;
}

/**
 * @param {Element|Document} root Root of the mounted surface.
 * @param {string} sourceId Physical inventory row ID.
 * @returns {void} Mounts the current editor alongside the chosen row.
 */
function placeBloomscapesWorkRowEditor(root,sourceId) {
    const panel=root.querySelector('[data-work-row-editor]');
    const source=[...root.querySelectorAll('[data-work-source-row]')]
        .find(button=>button.dataset.workSourceRow===sourceId);
    (source?.closest('article') || root).appendChild(panel);
    panel.hidden=false;
}

/**
 * @param {HTMLElement} host Mounted view host.
 * @returns {void} Retains the row editor while the list is replaced.
 */
function parkBloomscapesWorkRowEditor(host) {
    const root=host.closest('[data-work-creator]');
    const panel=root?.querySelector('[data-work-row-editor]');
    if (panel && host.contains(panel)) root.appendChild(panel);
}

/**
 * @param {string} key View or filter key.
 * @returns {string} Area permission required by the work studio phase.
 */
function bloomscapesStudioPermission(key) {
    if (key === 'hauling') return 'field-work-hauling';
    if (key === 'consolidate') return 'consolidate-inventory';
    return 'studio-'+key;
}

/**
 * @param {string} kind Work queue kind.
 * @param {string} action Selected work action.
 * @returns {boolean} Whether the current user may create the selected work.
 */
function bloomscapesCanChooseWork(kind, action) {
    return allowsBloomscapesMovementAction(action)
        && (isFullAppAdministrator() || bloomscapesFieldQueueState.canCreate?.[kind]===true);
}

/**
 * @param {string} action Selected work action.
 * @returns {boolean} Whether the active area permits the movement.
 */
function allowsBloomscapesMovementAction(action) {
    if (typeof isBloomscapesAreaScoped !== 'function' || !isBloomscapesAreaScoped()) return true;
    return getBloomscapesWorkActionPermission(action).every(key => allowsBloomscapesAreaSubview(key, 'FULL_EDIT'));
}

/**
 * @param {HTMLFormElement} form Current form.
 * @param {string} action Selected work action.
 * @returns {boolean} Whether the action was accepted and applied.
 */
function selectBloomscapesStudioAction(form,action) {
    const entry=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([label])=>label===action)
        || (action==='Custom Bunch Note' && [action,'BUNCH_NOTES']);
    if (!entry || !bloomscapesCanChooseWork(entry[1],action)) return false;
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

/**
 * @param {Element|Document} root Root of the mounted surface.
 * @param {HTMLFormElement} form Current form.
 * @returns {void} Updates destination choices for the source row.
 */
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
