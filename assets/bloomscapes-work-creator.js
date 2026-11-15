function renderBloomscapesWorkCreator(tab) {
    const kind = bloomscapesWorkViewForPanel(tab);
    return `<section data-work-creator="${kind}"><h3>Replicated Drive Mode · ${esc(getBloomscapesFarm())}</h3>
      <div data-work-browser></div><p data-selected-source>Select a Drive Mode row below.</p>
      <form data-create-field-work>
      <input name="sourceId" type="hidden">
      <label>Work View <select name="workView">${Object.entries(BLOOMSCAPES_WORK_VIEWS).map(([key,label])=>
        `<option value="${key}"${key===kind?' selected':''}>${label}</option>`).join('')}</select></label>
      <label>Action <select name="actionType">${['Bunch & Tie','Consolidate / Jam','Spread','House Cover / Poly',
        'Grade & Shift','Can Fill Prep','Custom Bunch Note'].map(action=>`<option>${esc(action)}</option>`).join('')}</select></label>
      <label>Scope <select name="scope"><option value="ITEM_LOCATION">Itemcode @ Location</option>
        <option value="ITEM_FARM">Itemcode Across Farm</option><option value="SINGLE_ROW">Single Row</option>
        <option value="ITEM_LOT">Itemcode @ Lot</option></select></label>
      <label>Exact Qty <input name="quantity" type="number" min="1" step="1"></label>
      <label>Or Percent <input name="percent" type="number" min="1" max="100" step="1"></label>
      <label>Target Location <select name="targetLocation"><option value="">No location move</option></select></label>
      <label>Assigned Crew / User <select name="assignedTo" required></select></label>
      <label>Media <input name="media" maxlength="120"></label><label>Fertilizer recipe <input name="fertilizer" maxlength="120"></label>
      <label>Due Date <input name="dueOn" type="date"></label>
      <label>Field Instructions <textarea name="instructions" maxlength="4000"></textarea></label>
      <label><input name="acknowledge" type="checkbox" value="true"> I reviewed the 14-day outbound SOC / hold warning for shear work</label>
      <button type="button" data-simulate-work>Simulate · 7 gates</button><button type="submit">Create Work in Que</button>
      <button type="button" data-clear-work>Clear draft</button>
      <div data-work-preview role="status"></div></form></section>`;
}

async function mountBloomscapesWorkCreator(host,options={}) {
    const root = host.querySelector('[data-work-creator]');
    if (!root) return;
    const owner = getSupabaseReadIdentityScope();
    const state = {owner,source:null,attempt:null,busy:false,previewRevision:0};
    const form = root.querySelector('form');
    for (const option of form.elements.workView.options) {
        option.disabled = !isFullAppAdministrator() && bloomscapesFieldQueueState.canCreate?.[option.value]!==true;
    }
    const browser=root.querySelector('[data-work-browser]');
    mountBloomscapesWorkBrowser(browser,row=>selectBloomscapesWorkSource(root,form,state,row),
        {getWorkView:()=>form.elements.workView.value});
    form.elements.workView.addEventListener('change',()=>{
        syncBloomscapesWorkCreatorKind(form);refreshBloomscapesWorkBrowser(browser);
    });
    syncBloomscapesWorkCreatorKind(form);
    if (options.source) {
        selectBloomscapesWorkSource(root,form,state,options.source);
        form.elements.scope.value='ITEM_LOCATION';form.elements.percent.value='100';
        browser.hidden=options.quick===true;
    }
    bindBloomscapesWorkCreator(form,state);
    const locations = [...new Set(bloomscapesWorkBrowserRows().map(row=>row.LOCATIONCODE || row.locationcode))].filter(Boolean).sort();
    locations.forEach(location=>form.elements.targetLocation.appendChild(new Option(location,location)));
    try {
        const roster = await readBloomscapesFieldRoster();
        if (!root.isConnected || owner!==getSupabaseReadIdentityScope()) return;
        roster.forEach(user=>form.elements.assignedTo.appendChild(new Option(user.name,user.username)));
        form.elements.assignedTo.value = currentUser;
    } catch (error) { root.querySelector('[data-work-preview]').textContent = error.message; }
}

function selectBloomscapesWorkSource(root,form,state,row) {
    state.source=row;state.attempt=null;
    form.elements.sourceId.value=String(row.UNIQUE_ID || row.unique_id);
    root.querySelector('[data-selected-source]').textContent=[row.COMMONNAME || row.commonname,
        row.ITEMCODE || row.itemcode,row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode].join(' · ');
    let preview=root.querySelector('[data-selected-work-identity]');
    if (!preview) {preview=document.createElement('div');preview.dataset.selectedWorkIdentity='true';root.querySelector('form').before(preview);}
    preview.innerHTML=bloomscapesWorkIdentityMarkup(row);
}

function syncBloomscapesWorkCreatorKind(form) {
    const kind=form.elements.workView.value;
    const actions={SHEARING:['Shear %','Whole-group Shear'],HAULING:['Consolidate Inventory','Whole-group Consolidation','Block Haul'],
        BUNCH_NOTES:['Bunch & Tie','Consolidate / Jam','Spread','House Cover / Poly','Remove Cover','Custom Field Instructions','Custom Bunch Note'],
        CAN_FILLING:['Can Fill Prep','Can Filling'],Y_GRADING:['Grade & Shift']}[kind];
    form.elements.actionType.replaceChildren(...actions.map(action=>new Option(action,action)));
    form.elements.targetLocation.required=kind==='HAULING';
}

function readBloomscapesWorkCreatorInput(form,state) {
    if (!state.source || state.owner!==getSupabaseReadIdentityScope()) throw new Error('Select an item in the active farm.');
    const input = Object.fromEntries(new FormData(form));
    if (Boolean(input.quantity)===Boolean(input.percent)) throw new Error('Enter either an exact quantity or a percent.');
    return {...input,sourceId:String(state.source.UNIQUE_ID || state.source.unique_id)};
}

function bindBloomscapesWorkCreator(form,state) {
    const status = form.querySelector('[data-work-preview]');
    form.querySelector('[data-clear-work]').addEventListener('click',()=>{
        form.reset();
        form.closest('[data-work-creator]').querySelector('[data-selected-work-identity]')?.remove();
        form.elements.sourceId.value = '';
        form.elements.assignedTo.value = currentUser;
        state.source = null;
        state.attempt = null;
        status.textContent = '';
    });
    form.querySelector('[data-simulate-work]').addEventListener('click',async()=>{
        const revision = ++state.previewRevision;
        try {
            const preview = await previewBloomscapesFieldWork(readBloomscapesWorkCreatorInput(form,state));
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
        const signature = JSON.stringify([farm,input]);
        if (state.attempt?.signature!==signature) state.attempt = {signature,id:crypto.randomUUID(),farm,input};
        const receipt = await createBloomscapesFieldWork(state.attempt);
        if (state.owner!==getSupabaseReadIdentityScope()) return;
        state.attempt = null;
        status.textContent = 'Created '+receipt.id;
        form.dispatchEvent(new CustomEvent('gnc-field-work-created',{bubbles:true,detail:{id:receipt.id}}));
        await openBloomscapesWorkQueue(receipt.work_view);
    } catch (error) { if (form.isConnected) status.textContent = error.message; }
    finally { state.busy = false; button.disabled = false; }
}
