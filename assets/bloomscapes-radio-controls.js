function renderBloomscapesRadioControls() {
    return '<nav data-comm-links aria-label="Communications"></nav>';
}

function mountBloomscapesRadioControls(container) {
    const nav=container.querySelector('[data-comm-links]');
    if (!nav) return;
    nav.replaceChildren();
    for (const [view,label] of [['push-to-talk','Push to Talk'],['messages','Messages']]) {
        if (!canOpenCommunicationView(view)) continue;
        const button=document.createElement('button');
        button.type='button';button.textContent=label;
        button.addEventListener('click',()=>switchView(view));
        nav.append(button);
    }
}

function isBloomscapesRadioSurfaceActive(host) {
    if (!host.isConnected) return false;
    const view=getCurrentVisibleViewId();
    if (view==='managers') return activeHomeTab==='bloomscapes-radio' && !!host.closest('#view-managers');
    const frame=host.closest('[data-department-workspace]');
    return frame?.dataset.departmentWorkspace==='bloomscapes-radio' && !!frame.closest('#view-'+view);
}
