function mountBloomscapesDockControls(host,tab,refresh) {
    if (tab!=='bloomscapes-dock-approvals') return;
    const section = document.createElement('section');
    section.innerHTML = '<h3>Dock inspection &amp; candidate replacement</h3><form data-dock-candidate>'
        + '<label>Order <select name="orderId" required><option value="">Choose order</option></select></label>'
        + '<label>Candidate physical row <input name="rowId" required></label>'
        + '<label>Private reject photo — Dock &amp; assigned Rep only <input type="file" name="inspection" accept="image/jpeg,image/png,image/webp" required></label>'
        + '<label>Candidate photo — publish to AV <input type="file" name="candidatePhoto" accept="image/jpeg,image/png,image/webp" required></label>'
        + '<label>Spec <input name="spec"></label><label>Caliper <input name="caliper"></label>'
        + '<label>Match % <input type="number" name="match" min="0" max="100" value="100" required></label>'
        + '<label>Candidate notes <input name="comments" maxlength="2000"></label>'
        + '<button>Publish candidate &amp; request Rep approval</button></form><p role="status"></p>';
    host.appendChild(section);
    const form = section.querySelector('form');
    let requestId = crypto.randomUUID();
    form.addEventListener('input',() => { requestId = crypto.randomUUID(); });
    form.addEventListener('submit',event => {
        event.preventDefault();
        void runBloomscapesDockCandidate(section,{...Object.fromEntries(new FormData(form)),requestId},refresh);
    });
    void populateBloomscapesDockOrders(section);
}

async function populateBloomscapesDockOrders(section) {
    try {
        const orders = await readBloomscapesDockChoices();
        if (!section.isConnected) return;
        const select = section.querySelector('select');
        for (const row of orders) {
            const option = document.createElement('option');
            option.value = row.unique_id;
            option.textContent = [row.dock,row.commonname,row.itemcode,row.locationcode,row.salesrepname].filter(Boolean).join(' · ');
            select.appendChild(option);
        }
    } catch (error) { section.querySelector('[role="status"]').textContent = error.message; }
}

async function runBloomscapesDockCandidate(section,input,refresh) {
    const button = section.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    const progress = message => { if (section.isConnected) section.querySelector('[role="status"]').textContent = message; };
    try {
        const receipt = await submitBloomscapesDockCandidate(input,progress);
        progress('Candidate published · Private inspection sent to '+receipt.assigned_rep+' for approval.');
        await refresh();
    } catch (error) { progress(error.message); }
    finally { button.disabled = false; }
}

function mountDockStatusChoices(select) {
    if (!select || select.options.length > 1) return;
    for (const [value,label] of [['Missing > 10','Missing more than 10'],['Missing < 5','Missing less than 5'],['Palletize','Palletize']]) {
        select.add(new Option(label,value));
    }
}

function mountBloomscapesDocksAreaMenu() {
    const rail = document.querySelector('#view-docks > .freeze-panel');
    const area = BLOOMSCAPES_BUSINESS_AREAS.find(({id})=>id==='DOCKS');
    if (!rail || !area) return;
    let menu = rail.querySelector('[data-docks-area-menu]');
    if (!menu) {
        menu = document.createElement('div');
        menu.dataset.docksAreaMenu = '';
        rail.prepend(menu);
    }
    const choices = bloomscapesAreaChoices(area).map(([key,label])=>[key,label]);
    menu.hidden = !choices.length;
    if (choices.length) mountModuleSubviewDropdown(menu,{choices,value:'docks',
        select:key=>openBloomscapesAreaView(area,key)});
}

function showEmptyBloomscapesDockBrowse(container, crumb, awaitingProgress) {
    const missing = [
        dockTeamSchemaReady === false ? 'shared Trip status' : '',
        awaitingProgress && dockItemSchemaReady === false ? 'Dock item status' : ''
    ].filter(Boolean);
    const message = missing.length ? `${missing.join(' and ')} unavailable. Refresh after the current release finishes deploying.` : 'No dock items found.';
    setContainerHtml(container,`<div class="p-8 text-center text-gray-400">${message}</div>`);
    setContainerUiState(container,'empty');
    crumb.innerText = missing.length ? 'Dock Setup Required' : 'No Results';
}
