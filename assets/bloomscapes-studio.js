function renderBloomscapesWorkStudio() {
    const titles={SHEARING:'✂️ Shear List',HAULING:'🚜 Hauling & Consolidation',BUNCH_NOTES:'📦 Bunch Notes',CAN_FILLING:'🪴 Can Filling',Y_GRADING:'🌱 Season .Y Grading'};
    return '<section data-bloomscapes-studio><h2>Field Work Studio · Work Builder & Dispatch</h2>'
        +'<nav data-studio-work-types aria-label="Work Type">'+Object.entries(titles).map(([kind,label])=>
            '<button type="button" data-studio-kind="'+kind+'">'+escapeHtml(label)+'</button>').join('')+'</nav>'
        +renderBloomscapesWorkCreator('bloomscapes-field-jobs')+'</section>';
}

async function mountBloomscapesWorkStudio(host) {
    const form=host.querySelector('[data-create-field-work]');
    const selector=form.elements.workView;
    selector.closest('label').hidden=true;
    host.querySelector('[data-studio-work-types]').addEventListener('click',event=>{
        const button=event.target.closest('[data-studio-kind]');
        if (!button || button.disabled) return;
        selector.value=button.dataset.studioKind;
        selector.dispatchEvent(new Event('change',{bubbles:true}));
        for (const tab of host.querySelectorAll('[data-studio-kind]')) tab.setAttribute('aria-pressed',String(tab===button));
    });
    await ensureBloomscapesFieldQueue();
    for (const button of host.querySelectorAll('[data-studio-kind]')) {
        button.disabled=!isFullAppAdministrator() && bloomscapesFieldQueueState.canCreate?.[button.dataset.studioKind]!==true;
    }
    await mountBloomscapesWorkCreator(host);
}
