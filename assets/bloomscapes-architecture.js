const BLOOMSCAPES_ARCHITECTURE_TAB = 'bloomscapes-architecture';

function canViewBloomscapesArchitecture(user, nativeProfile, nativeActive) {
    return nativeActive === true && user === 'dylan_collyge' && nativeProfile?.username === user
        && nativeProfile.role?.toLowerCase() === 'super-admin' && !nativeProfile.disabled_at;
}

function renderBloomscapesArchitecturePanel() {
    return `<section aria-labelledby="bloomscapes-architecture-title" class="space-y-3 p-3">
      <h2 id="bloomscapes-architecture-title" class="text-lg font-bold">System Architecture &amp; Table Map</h2>
      <p data-bloomscapes-sandbox role="status"></p>
      <iframe title="Bloomscapes schema explorer" src="./architecture/index.html"
        style="display:block;width:100%;min-height:70dvh;border:0" sandbox="allow-scripts"></iframe>
    </section>`;
}

async function mountBloomscapesSandboxStatus(container) {
    const status = container.querySelector('[data-bloomscapes-sandbox]');
    if (!status) return;
    try {
        const enabled = await readBloomscapesPanel('sandbox');
        if (status.isConnected && enabled === true) status.textContent = 'Email Sandbox Mode · Dylan only';
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
    }
}
