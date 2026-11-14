const BLOOMSCAPES_WORKFLOW_TABS = [
    {id:'bloomscapes-inventory',label:'Farm Inventory'},
    {id:'bloomscapes-replenishment',label:'Hidden Lake Replenishment'},
    {id:'bloomscapes-dock-approvals',label:'Dock Rep Approvals'},
    {id:'bloomscapes-hl-keying',label:'Park Hill Data Entry · Hidden Lake'},
    {id:'bloomscapes-lab',label:'Plant Health & Lab Review'},
    {id:'bloomscapes-vault',label:'My Work & Inquiry Vault'}
];

function bloomscapesWorkflowTab(tab) {
    return BLOOMSCAPES_WORKFLOW_TABS.find(entry => entry.id === tab);
}

function workflowForm(tab) {
    if (tab === 'bloomscapes-inventory') {
        return '<label>Farm <select name="farm"><option value="10-PH">🌲 10-PH</option><option value="60-HL">🏔️ 60-HL</option><option value="all">🌐 Combined</option></select></label><button type="submit">Show</button>';
    }
    if (tab === 'bloomscapes-vault') {
        return '<label>Work type <input name="type"></label><label>From <input name="from" type="date"></label><button type="submit">Search</button>';
    }
    if (tab === 'bloomscapes-lab') {
        return '<label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label><label>Physical row ID <input name="rowId" required maxlength="150"></label><button type="submit">Create sample label</button>';
    }
    return '';
}

function renderBloomscapesWorkflowPanel(tab) {
    const workflow = bloomscapesWorkflowTab(tab);
    const form = workflowForm(tab);
    return `<section data-bloomscapes-workflow="${workflow.id}" class="space-y-3 p-3">
      <h2 class="text-lg font-bold">${workflow.label}</h2>
      ${form ? '<form class="space-x-2">' + form + '</form>' : ''}
      <p role="status"></p><div data-bloomscapes-results></div>
    </section>`;
}

const workflowFields = {
    'bloomscapes-inventory': ['warehouse_id','unique_id','itemcode','commonname','locationcode','lotcode','ptronhand'],
    'bloomscapes-replenishment': ['itemcode','blockalpha','blocknumber','needed_on','remaining_po_qty','open_can_space'],
    'bloomscapes-dock-approvals': ['itemcode','dock','order_unique_id','candidate_locationcode','decision'],
    'bloomscapes-hl-keying': ['itemcode','lotcode','locationcode','field_name','qty_delta','reason_code','actor_username'],
    'bloomscapes-lab': ['sample_id','warehouse_id','genus_name','itemcode','lotcode','locationcode','status'],
    'bloomscapes-vault': ['work_type','itemcode','locationcode','lotcode','created_at']
};

function appendWorkflowNode(parent, tag, text) {
    const child = parent.appendChild(document.createElement(tag));
    child.textContent = text;
    return child;
}

function dockApprovalButtons(parent, row, run) {
    if (row.decision !== 'PENDING') return;
    for (const decision of ['APPROVED','REJECTED']) {
        const button = appendWorkflowNode(parent, 'button', decision === 'APPROVED' ? 'Approve' : 'Reject');
        button.type = 'button';
        button.addEventListener('click', () => run(decision, row.id, button));
    }
}

function renderDockWorkflowRow(item, row, run) {
    for (const url of row.temporaryPhotoLinks || []) {
        const photo = appendWorkflowNode(item, 'img', '');
        photo.alt = 'Private Dock inspection';
        photo.loading = 'lazy';
        photo.className = 'max-w-56 max-h-40 rounded-md';
        photo.src = url;
    }
    dockApprovalButtons(item, row, run);
}

function renderReplenishmentGauge(item, row) {
    const capacity = Number(row.allocated_beds) * Number(row.cpb);
    if (!Number.isFinite(capacity) || capacity <= 0 || row.current_ptronhand == null) return;
    const current = Number(row.current_ptronhand);
    if (!Number.isFinite(current)) return;
    const meter = appendWorkflowNode(item, 'meter', '');
    meter.setAttribute('aria-label', 'Block capacity used');
    meter.max = capacity;
    meter.value = Math.min(capacity, current);
    appendWorkflowNode(item, 'span', current + ' / ' + capacity + ' occupied');
}

function showWorkflowRows(host, tab, rows, run) {
    const results = host.querySelector('[data-bloomscapes-results]');
    results.replaceChildren();
    const list = appendWorkflowNode(results, 'ul', '');
    list.className = 'divide-y divide-emerald-900';
    rows.forEach(row => {
        const item = appendWorkflowNode(list, 'li', '');
        item.className = 'py-2 space-x-2';
        const fields = workflowFields[tab].map(key => row[key]).filter(value => value != null && value !== '');
        appendWorkflowNode(item, 'span', fields.join(' · '));
        if (tab === 'bloomscapes-replenishment') renderReplenishmentGauge(item, row);
        if (tab === 'bloomscapes-dock-approvals') renderDockWorkflowRow(item, row, run);
        if (tab === 'bloomscapes-vault' && /^[a-zA-Z0-9_-]+$/.test(row.drive_file_id || '')) {
            const link = appendWorkflowNode(item, 'a', 'Open PDF');
            link.href = 'https://drive.google.com/open?id=' + encodeURIComponent(row.drive_file_id);
            link.rel = 'noopener noreferrer';
            link.target = '_blank';
        }
    });
}

function printLabSample(host, code) {
    const label = document.createElement('pre');
    label.textContent = code;
    const print = appendWorkflowNode(host.querySelector('[role="status"]'), 'button', 'Print label');
    print.type = 'button';
    print.addEventListener('click', () => {
        const windowRef = window.open('', '_blank');
        if (!windowRef) return;
        windowRef.document.title = 'Lab sample label';
        windowRef.document.body.append(label.cloneNode(true));
        windowRef.opener = null;
        windowRef.print();
    });
}

function mountBloomscapesWorkflowPanel(container, tab) {
    const host = container.querySelector('[data-bloomscapes-workflow]');
    if (!host) return;
    const status = host.querySelector('[role="status"]');
    const form = host.querySelector('form');
    let generation = 0;
    let labAttempt;
    let busy = false;
    const load = async (inputs = {}) => {
        const epoch = ++generation;
        status.textContent = 'Loading…';
        const commit = text => { if (host.isConnected && epoch === generation) status.textContent = text; };
        try {
            const rows = await readBloomscapesPanel(tab, inputs);
            if (!host.isConnected || epoch !== generation) return;
            showWorkflowRows(host, tab, rows, decide);
            commit(rows.length ? rows.length + ' records shown' : 'No records match.');
        } catch (error) {
            commit(error.message);
        }
    };
    const decide = async (decision, id, button) => {
        if (busy) return;
        busy = true;
        button.disabled = true;
        try {
            await submitBloomscapesCommand('dock', {decision,id});
            await load();
        } catch (error) {
            if (host.isConnected) status.textContent = error.message;
        } finally { busy = false; button.disabled = false; }
    };
    const createSample = async inputs => {
        if (busy) return;
        busy = true;
        const key = inputs.farm + ':' + inputs.rowId;
        labAttempt = labAttempt?.key === key ? labAttempt : {key, id:crypto.randomUUID()};
        try {
            const sample = await submitBloomscapesCommand('lab', {...inputs,requestId:labAttempt.id});
            await load();
            if (host.isConnected) {
                status.textContent = sample + ' · ';
                printLabSample(host, sample);
            }
            labAttempt = null;
        } catch (error) {
            if (host.isConnected) status.textContent = error.message;
        } finally { busy = false; }
    };
    form?.addEventListener('submit', event => {
        event.preventDefault();
        const inputs = Object.fromEntries(new FormData(form));
        if (tab === 'bloomscapes-lab') void createSample(inputs);
        else void load(inputs);
    });
    void load(tab === 'bloomscapes-inventory' ? {farm:'10-PH'} : {});
}
