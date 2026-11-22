function renderBloomscapesWorkCreator(tab) {
    const kind = bloomscapesWorkViewForPanel(tab);
    return `<section data-work-creator="${kind}"><div data-studio-excel></div>
      <div data-work-browser hidden></div><section data-work-row-editor hidden>
      <p data-selected-source>Select a work type, then a Drive Mode row.</p>
      <form data-create-field-work hidden>
      <input name="sourceId" type="hidden">
      <label hidden>Work View <select name="workView">${Object.entries(BLOOMSCAPES_WORK_VIEWS).map(([key,label])=>
        `<option value="${key}"${key===kind?' selected':''}>${label}</option>`).join('')}</select></label>
      <label hidden>Action <select name="actionType">${['Bunch & Tie','Consolidate / Jam','Spread','House Cover / Poly',
        'Grade & Shift','Can Fill Prep','Custom Bunch Note'].map(action=>`<option>${esc(action)}</option>`).join('')}</select></label>
      <label>Scope <select name="scope"><option value="ITEM_LOCATION">Itemcode @ Location</option>
        <option value="BLOCK">Whole Block (Alpha + Number)</option><option value="LOCATION">Whole Location</option>
        <option value="ITEM_FARM">Itemcode Across Farm</option><option value="SINGLE_ROW">Single Row</option>
        <option value="ITEM_LOT">Itemcode @ Lot</option></select></label>
      <label>Exact Qty <input name="quantity" type="number" min="1" step="1"></label>
      <label>Percent <input name="percent" type="number" min="1" max="100" step="1"></label>
      <label>Target Location <select name="targetLocation"><option value="">No location move</option></select></label>
      <label>Job Code / Project Description <select name="jobCode"><option value="">Choose job code</option></select></label>
      <label>Assignment Mode <select name="assignmentMode" required>
        <option value="">Choose assignment mode</option><option value="OPEN">Open for Crew Pickup (Unassigned)</option>
        <option value="ASSIGNED">Assign to Specific User</option></select></label>
      <label hidden>Assigned To <select name="assignedTo" disabled><option value="">Choose eligible user</option></select></label>
      <label>Container <input name="container" maxlength="120"></label>
      <label>Media <input name="media" maxlength="120"></label><label>Fertilizer recipe <input name="fertilizer" maxlength="120"></label>
      <label>Due Date <input name="dueOn" type="date"></label>
      <label>Crew Instructions <textarea name="instructions" maxlength="4000"></textarea></label>
      <label><input name="acknowledge" type="checkbox" value="true"> I reviewed the 14-day outbound SOC / hold warning for shear work</label>
      <button type="button" data-simulate-work>Simulate · 7 gates</button><button type="submit">💾 Save / Queue Row</button>
      <button type="button" data-clear-work>Clear draft</button>
      <div data-work-preview role="status"></div></form></section></section>`;
}

async function mountBloomscapesWorkCreator(host,options={}) {
    const root = host.querySelector('[data-work-creator]');
    if (!root) return;
    const owner = getSupabaseReadIdentityScope();
    const state = {owner,selection:options.selection || null,source:null,attempt:null,busy:false,previewRevision:0};
    const form = root.querySelector('form');
    for (const option of form.elements.workView.options) {
        option.disabled = !isFullAppAdministrator() && bloomscapesFieldQueueState.canCreate?.[option.value]!==true;
    }
    const browser=root.querySelector('[data-work-browser]');
    if (!options.selection && !options.quick) mountBloomscapesCreatorBrowser(root,form,state,browser,options);
    bindBloomscapesWorkTypes(root,form,options);
    if (options.source) {
        selectBloomscapesWorkSource(root,form,state,options.source);
        form.elements.scope.value='SINGLE_ROW';form.elements.percent.value='100';
        browser.hidden=options.quick===true;
    }
    bindBloomscapesWorkCreator(form,state);
    form.elements.assignmentMode.addEventListener('change',()=>syncBloomscapesWorkAssignment(form));
    form.elements.actionType.addEventListener('change',()=>syncBloomscapesWorkDestinations(root,form));
    try {
        const farm=getBloomscapesFarm();
        const [roster,jobs]=await Promise.all([readBloomscapesFieldRoster(),readBloomscapesWorkJobCodes(farm)]);
        if (farm!==getBloomscapesFarm()) return;
        if (!root.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        jobs.forEach(job=>form.elements.jobCode.appendChild(new Option(job.label,job.code)));
        roster.filter(user=>user.work_views?.includes(form.elements.workView.value))
            .forEach(user=>form.elements.assignedTo.add(new Option(user.name,user.username)));
    } catch (error) { root.querySelector('[data-work-preview]').textContent = error.message; }
}

function selectBloomscapesWorkSource(root,form,state,row,scope) {
    state.source=row;state.attempt=null;
    form.hidden=false;
    form.elements.sourceId.value=String(row.UNIQUE_ID || row.unique_id);
    placeBloomscapesWorkRowEditor(root,form.elements.sourceId.value);
    form.elements.scope.value=scope || 'SINGLE_ROW';
    form.elements.percent.value='100';form.elements.quantity.value='';
    root.querySelector('[data-selected-source]').textContent=[row.COMMONNAME || row.commonname,
        row.ITEMCODE || row.itemcode,row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode].join(' · ');
    let preview=root.querySelector('[data-selected-work-identity]');
    if (!preview) {preview=document.createElement('div');preview.dataset.selectedWorkIdentity='true';root.querySelector('form').before(preview);}
    preview.innerHTML=bloomscapesWorkIdentityMarkup(row);
    hydrateBloomscapesPlanningCards(preview,row);
    form.elements.container.value=row.CONTSIZE || row.contsize || '';
    syncBloomscapesWorkDestinations(root,form);
}

function syncBloomscapesWorkCreatorKind(form) {
    const kind=form.elements.workView.value;
    const actions={SHEARING:['Add to Shear List','Shear %','Whole-group Shear'],HAULING:['Haul','Consolidate','Haul / Consolidate','Consolidate Inventory','Whole-group Consolidation','Block Haul'],
        BUNCH_NOTES:['Bunch & Tie','Bunch Count','Cover with Poly','Remove Poly (Spring)','Spread Block (Spring)','Spread Count','Custom Crew Instructions','Custom Bunch Note'],
        CAN_FILLING:['Can Filling','Can Fill Prep'],Y_GRADING:['Shift Grading','Grade & Haul','Grade & Shift']}[kind];
    form.elements.actionType.replaceChildren(...actions.map(action=>new Option(({'Bunch & Tie':'Bunch','Consolidate Bunches':'Consolidate'})[action] || action,action)));
    form.elements.targetLocation.required=kind==='HAULING';
}

function readBloomscapesWorkCreatorInput(form,state) {
    if (!state.source || state.owner!==getSupabaseReadIdentityScope()) throw new Error('Select an item in the active farm.');
    const input = Object.fromEntries(new FormData(form));
    input.studioModule=form.closest('[data-work-creator]').dataset.studioPhase;
    if (input.jobCode) input.jobDescription=form.elements.jobCode.selectedOptions[0].textContent;
    if (Boolean(input.quantity)===Boolean(input.percent)) throw new Error('Enter either an exact quantity or a percent.');
    if (!['OPEN','ASSIGNED'].includes(input.assignmentMode) || input.assignmentMode==='ASSIGNED' && !input.assignedTo) {
        throw new Error('Choose a crew pickup or specific eligible user.');
    }
    if (input.workView==='SHEARING' && !input.percent) throw new Error('Enter the shear percentage.');
    return {...input,sourceId:String(state.source.UNIQUE_ID || state.source.unique_id),assignedTo:input.assignedTo || null};
}

function bindBloomscapesWorkCreator(form,state) {
    const status = form.querySelector('[data-work-preview]');
    form.querySelector('[data-clear-work]').addEventListener('click',()=>{
        const kind=form.elements.workView.value,action=form.elements.actionType.value;
        form.reset();syncBloomscapesWorkAssignment(form);form.elements.workView.value=kind;syncBloomscapesWorkCreatorKind(form);form.elements.actionType.value=action;
        form.closest('[data-work-creator]').querySelector('[data-selected-work-identity]')?.remove();
        form.elements.sourceId.value = '';
        state.source = null;
        state.attempt = null;
        form.hidden=true;
        form.closest('[data-work-row-editor]').hidden=true;
        status.textContent = '';
    });
    form.querySelector('[data-simulate-work]').addEventListener('click',async()=>{
        const revision = ++state.previewRevision;
        try {
            const input=readBloomscapesWorkCreatorInput(form,state);
            const previews=[];
            for (const entry of planBloomscapesWorkSelection(input,state.source,preserveBloomscapesPickedRows(input,state))) previews.push(await previewBloomscapesFieldWork(entry));
            const preview={rows:previews.reduce((sum,row)=>sum+row.rows,0),quantity:previews.reduce((sum,row)=>sum+row.quantity,0),gates:previews.flatMap(row=>row.gates)};
            if (state.owner!==getSupabaseReadIdentityScope() || revision!==state.previewRevision || !form.isConnected) return;
            status.textContent = `${preview.rows} rows · Qty ${preview.quantity} · `
                + preview.gates.map(gate=>`${gate.gate}: ${gate.state}`).join(' | ');
        } catch (error) { if (form.isConnected) status.textContent = error.message; }
    });
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void submitBloomscapesWorkCreator(form,state,status);
    });
}

async function submitBloomscapesWorkCreator(form,state,status) {
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
        const input = readBloomscapesWorkCreatorInput(form,state);
        const farm = getBloomscapesFarm();
        const selection=preserveBloomscapesPickedRows(input,state) || await confirmBloomscapesWorkRowScope(state.source,input);
        if (state.owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm() || !form.isConnected) return;
        const inputs=planBloomscapesWorkSelection(input,state.source,selection);
        if (!inputs.length) return;
        const receipts=await dispatchBloomscapesWorkSelection(state,inputs,farm);
        if (state.owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm()) return;
        const receipt=receipts[0];
        state.attempt = null;
        status.textContent = 'Created '+receipt.id;
        form.dispatchEvent(new CustomEvent('gnc-field-work-created',{bubbles:true,detail:{id:receipt.id}}));
        await openBloomscapesWorkQueue(receipt.work_view);
    } catch (error) { if (form.isConnected) status.textContent = error.message; }
    finally { state.busy = false; button.disabled = false; }
}

function mountBloomscapesCreatorBrowser(root,form,state,browser,options) {
    mountBloomscapesWorkBrowser(browser,(row,scope,action)=>{
        if (action && !selectBloomscapesStudioAction(form,action)) return;
        selectBloomscapesWorkSource(root,form,state,row,scope);
    },
        {locationDrill:options.phase==='bunch' || root.dataset.workCreator==='BUNCH_NOTES' && !options.phase,getWorkView:()=>form.elements.workView.value});
    form.elements.workView.addEventListener('change',()=>{
        syncBloomscapesWorkCreatorKind(form);refreshBloomscapesWorkBrowser(browser);
    });
    const modes=browser.querySelector('[data-work-modes]');
    root.prepend(modes.closest('label'));
    applyInventoryExcelFilters('studio',bloomscapesWorkBrowserRows());
    mountInventoryExcelFilters('studio');
}

function syncBloomscapesWorkAssignment(form) {
    const specific=form.elements.assignmentMode.value==='ASSIGNED';
    const user=form.elements.assignedTo;
    user.closest('label').hidden=!specific;
    user.disabled=!specific;
    user.required=specific;
    if (!specific) user.value='';
}

function preserveBloomscapesPickedRows(input,state) {
    return input.scope==='SINGLE_ROW' ? state.selection : null;
}
