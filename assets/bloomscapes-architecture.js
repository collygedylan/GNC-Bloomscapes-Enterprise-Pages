const BLOOMSCAPES_ARCHITECTURE_TAB = 'bloomscapes-architecture';

function canViewBloomscapesArchitecture(user, nativeProfile, nativeActive) {
    return nativeActive === true && user === 'dylan_collyge' && nativeProfile?.username === user
        && nativeProfile.role?.toLowerCase() === 'super-admin' && !nativeProfile.disabled_at;
}

function renderBloomscapesArchitecturePanel() {
    return `<section aria-labelledby="bloomscapes-architecture-title" class="space-y-3 p-3">
      <h2 id="bloomscapes-architecture-title" class="text-lg font-bold">System Architecture &amp; Table Map</h2>
      <p data-bloomscapes-sandbox role="status"></p>
      <label><input type="checkbox" checked disabled> Email Sandbox Mode: dylan_collyge Only</label>
      <p>Recipient protection is enforced by the isolated server.</p>
      <div data-bloomscapes-table-counts></div>
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
        const snapshot = await readBloomscapesPanel('architecture');
        if (status.isConnected) renderBloomscapesTableCounts(container,snapshot);
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
    }
}

function renderBloomscapesTableCounts(container,snapshot) {
    const host = container.querySelector('[data-bloomscapes-table-counts]');
    if (!host) return;
    host.replaceChildren();
    const heading = document.createElement('p');
    heading.textContent = 'Live relation counts · '+snapshot.measured_at;
    const table = document.createElement('table');
    const header = table.createTHead().insertRow();
    for (const title of ['Relation','Type','Rows']) {
        const cell = document.createElement('th');
        cell.textContent = title;
        header.appendChild(cell);
    }
    const body = table.createTBody();
    for (const relation of snapshot.relations) {
        const row = body.insertRow();
        for (const value of [relation.name,relation.kind,relation.rows]) row.insertCell().textContent = String(value);
    }
    host.append(heading,table);
}
