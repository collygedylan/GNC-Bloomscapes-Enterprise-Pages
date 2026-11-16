const BLOOMSCAPES_STUDIO_PHASES=[
    ['bunch','Bunch Notes','BUNCH_NOTES','Bunch & Tie','Block walk with a different action on every row'],
    ['grading','Shift Grading','Y_GRADING','Shift Grading','Grade .Y stock, split the balance and stage its haul'],
    ['haul','Hauling','HAULING','Haul','Move graded shift stock to its new planting location'],
    ['consolidate','Consolidation','HAULING','Consolidate','Merge into a location already holding the same item'],
    ['cans','Can Filling','CAN_FILLING','Can Filling','Batch by media and fertilizer for planting blocks'],
    ['counts','Block Counts & Poly / Spread','BUNCH_NOTES','Bunch Count','Count, cover, uncover, spread and recount a block'],
    ['shear','Shear List','SHEARING','Add to Shear List','Queue #? Needs Shear and confirm #✓ Sheared']
];

function bloomscapesWorkTypeBar() {
    return '<header data-work-type-bar><h3 data-phase-heading>Step 1: Select the Active Studio Phase</h3>'
        +'<div data-studio-phase-cards>'+BLOOMSCAPES_STUDIO_PHASES.map(([id,title,,,description])=>
            '<button type="button" data-studio-phase="'+id+'"><strong>'+esc(title)+'</strong><span>'+esc(description)+'</span></button>').join('')+'</div>'
        +'<label data-active-phase hidden>Active Phase: <select data-active-work-type><option value="">Select phase…</option>'
        +BLOOMSCAPES_STUDIO_PHASES.map(([id,title,kind])=>'<option value="'+id+'" data-kind="'+kind+'">'+esc(title)+'</option>').join('')
        +'</select></label><label data-chain-label hidden><input type="checkbox" data-work-chain> Chain overwinter / spring steps</label></header>';
}

function bindBloomscapesWorkTypes(root,form,options) {
    const select=root.querySelector('[data-active-work-type]');
    const browser=root.querySelector('[data-work-browser]');
    const chain=root.querySelector('[data-work-chain]');
    const steps=form.querySelector('[data-work-steps]');
    steps.hidden=true;browser.hidden=true;
    for (const option of select.options) {
        option.disabled=Boolean(option.dataset.kind) && !bloomscapesCanChooseWork(option.dataset.kind);
    }
    for (const button of root.querySelectorAll('[data-studio-phase]')) {
        button.disabled=!bloomscapesCanChooseWork(BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===button.dataset.studioPhase)[2]);
        button.addEventListener('click',()=>{select.value=button.dataset.studioPhase;select.dispatchEvent(new Event('change'));});
    }
    select.addEventListener('change',()=>{
        const phase=BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===select.value);
        browser.hidden=!phase;form.hidden=true;
        root.querySelector('[data-work-row-editor]').hidden=true;
        root.querySelector('[data-studio-phase-cards]').hidden=Boolean(phase);
        root.querySelector('[data-phase-heading]').hidden=Boolean(phase);
        root.querySelector('[data-active-phase]').hidden=!phase;
        root.querySelector('[data-chain-label]').hidden=!phase;
        if (!phase) return;
        root.dataset.studioPhase=phase[0];
        selectBloomscapesStudioAction(form,phase[3]);
        refreshBloomscapesWorkBrowser(browser);
    });
    chain.addEventListener('change',()=>{
        steps.hidden=!chain.checked;
        if (!chain.checked) for (const input of steps.querySelectorAll('input')) input.checked=false;
    });
    steps.addEventListener('change',()=>syncBloomscapesWorkDetailFields(form));
    if (options.source) {
        select.value=options.phase || BLOOMSCAPES_STUDIO_PHASES.find(([, ,kind])=>kind===root.dataset.workCreator)[0];
        select.dispatchEvent(new Event('change'));
    }
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
    const entry=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([label])=>label===action);
    if (!entry || !bloomscapesCanChooseWork(entry[1])) return false;
    form.elements.workView.value=entry[1];
    syncBloomscapesWorkCreatorKind(form);form.elements.actionType.value=action;
    for (const input of form.querySelectorAll('[name=lifecycleStep]')) input.checked=false;
    syncBloomscapesWorkDetailFields(form);
    return true;
}

function syncBloomscapesWorkDetailFields(form) {
    const kind=form.elements.workView.value;
    form.elements.targetLocation.closest('label').hidden=!['HAULING','Y_GRADING'].includes(kind);
    form.elements.targetLocation.required=['HAULING','Y_GRADING'].includes(kind);
    form.elements.actionType.closest('label').hidden=kind!=='BUNCH_NOTES';
    const shift=form.querySelector('[data-shift-plan]');
    if (shift) {shift.hidden=form.elements.actionType.value!=='Shift Grading';form.elements.plannedGradedQuantity.required=!shift.hidden;}
    for (const name of ['media','fertilizer']) form.elements[name].closest('label').hidden=kind!=='CAN_FILLING';
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
    if (!consolidate) return;
    if (!rows.length) choices.textContent='No other location holds this item within the active App SaleYear.';
    void hydrateBloomscapesConsolidationSpace(root,form,choices,source);
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
            if (row) button.textContent=bloomscapesConsolidationDestinationLabel({...resolveCanonicalInventoryRow(row),open_beds:row.open_beds,can_space:row.can_space});
        }
    } catch (error) {
        if (root.isConnected && root.dataset.destinationRevision===revision && form.elements.sourceId.value===id) {
            const status=choices.appendChild(document.createElement('p'));status.textContent=error.message;
        }
    }
}

function bloomscapesShiftPlanFields() {
    return '<fieldset data-shift-plan hidden><legend>Shift Grading</legend><p data-shift-scheduled></p>'
        +'<label>Graded Qty <input name="plannedGradedQuantity" type="number" min="0" step="1"></label>'
        +'<label>Short Qty / CF# Balance <input name="plannedShortQuantity" readonly></label></fieldset>';
}

function bindBloomscapesShiftPlan(form) {
    for (const name of ['quantity','percent','plannedGradedQuantity']) {
        form.elements[name].addEventListener('input',()=>syncBloomscapesShiftPlan(form));
    }
}

function syncBloomscapesShiftPlan(form) {
    const source=bloomscapesWorkBrowserRows().find(row=>String(row.UNIQUE_ID || row.unique_id)===form.elements.sourceId.value);
    if (!source) return;
    const stock=Number(source.PTRONHAND ?? source.ptronhand);
    const scheduled=form.elements.quantity.value?Number(form.elements.quantity.value):Math.floor(stock*Number(form.elements.percent.value)/100);
    const graded=form.elements.plannedGradedQuantity.value;
    form.querySelector('[data-shift-scheduled]').textContent='Sch Total: '+scheduled;
    form.elements.plannedGradedQuantity.max=String(scheduled);
    form.elements.plannedShortQuantity.value=graded!==''?String(scheduled-Number(graded)):'';
}

function validateBloomscapesShiftPlan(form,input) {
    if (input.actionType!=='Shift Grading') return;
    const graded=Number(input.plannedGradedQuantity),short=Number(form.elements.plannedShortQuantity.value);
    if (input.plannedGradedQuantity==='' || !Number.isInteger(graded) || graded<0 || !Number.isInteger(short) || short<0) {
        throw new Error('Enter Graded Qty within Sch Total; Short is the remaining CF# balance.');
    }
}
