function bloomscapesWorkTypeBar() {
    return '<header data-work-type-bar><h3>Step 1: Select Type of Work</h3>'
        +'<label>Active Work Type: <select data-active-work-type><option value="">Select work type…</option>'
        +BLOOMSCAPES_LIFECYCLE_ACTIONS.map(([action,kind])=>'<option value="'+esc(action)+'" data-kind="'+kind+'">'+esc(action)+'</option>').join('')
        +'</select></label><label><input type="checkbox" data-work-chain> Chain overwinter / spring steps</label></header>';
}

function bindBloomscapesWorkTypes(root,form,options) {
    const select=root.querySelector('[data-active-work-type]');
    for (const option of select.options) {
        option.disabled=Boolean(option.dataset.kind) && !isFullAppAdministrator()
            && bloomscapesFieldQueueState.canCreate?.[option.dataset.kind]!==true;
    }
    const browser=root.querySelector('[data-work-browser]');
    const chain=root.querySelector('[data-work-chain]');
    const steps=form.querySelector('[data-work-steps]');
    steps.hidden=true;
    browser.hidden=true;
    select.addEventListener('change',()=>{
        const entry=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([action])=>action===select.value);
        browser.hidden=!entry;
        if (!entry) {form.hidden=true;return;}
        form.elements.workView.value=entry[1];
        syncBloomscapesWorkCreatorKind(form);
        form.elements.actionType.value=entry[0];
        for (const input of steps.querySelectorAll('input')) input.checked=false;
        syncBloomscapesWorkDetailFields(form);
        refreshBloomscapesWorkBrowser(browser);
    });
    chain.addEventListener('change',()=>{
        steps.hidden=!chain.checked;
        if (!chain.checked) for (const input of steps.querySelectorAll('input')) input.checked=false;
    });
    steps.addEventListener('change',()=>{
        select.value=form.elements.actionType.value;
        syncBloomscapesWorkDetailFields(form);
    });
    if (options.source) {
        select.value=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([,kind])=>kind===root.dataset.workCreator)[0];
        select.dispatchEvent(new Event('change'));
    }
}

function syncBloomscapesWorkDetailFields(form) {
    const kind=form.elements.workView.value;
    form.elements.targetLocation.closest('label').hidden=!['HAULING','Y_GRADING'].includes(kind);
    form.elements.targetLocation.required=['HAULING','Y_GRADING'].includes(kind);
    for (const name of ['media','fertilizer']) form.elements[name].closest('label').hidden=kind!=='CAN_FILLING';
}
