function renderBloomscapesRadioControls() { return renderBloomscapesCommHub(); }

function mountBloomscapesRadioControls(container) { mountBloomscapesCommHub(container); }

function isBloomscapesRadioSurfaceActive(host) {
    if (!host.isConnected) return false;
    const view=getCurrentVisibleViewId();
    if (view==='managers') return activeHomeTab==='bloomscapes-radio' && !!host.closest('#view-managers');
    const frame=host.closest('[data-department-workspace]');
    return frame?.dataset.departmentWorkspace==='bloomscapes-radio' && !!frame.closest('#view-'+view);
}
