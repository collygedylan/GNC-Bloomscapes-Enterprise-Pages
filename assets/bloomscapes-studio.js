function renderBloomscapesWorkStudio() {
    return '<section data-bloomscapes-studio><h2>Build Work Studio · Drive Mode → Scope → Work → Que</h2>'
        +renderBloomscapesWorkCreator('bloomscapes-field-jobs')+'</section>';
}

async function mountBloomscapesWorkStudio(host) {
    const form=host.querySelector('[data-create-field-work]');
    form.hidden=!form.elements.sourceId.value;
    await ensureBloomscapesFieldQueue();
    await mountBloomscapesWorkCreator(host);
}
