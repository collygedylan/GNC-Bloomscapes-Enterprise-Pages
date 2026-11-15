const BLOOMSCAPES_WORKFLOW_TABS = [
    {id:'bloomscapes-inventory',label:'Farm Inventory'},
    {id:'bloomscapes-replenishment',label:'Hidden Lake Replenishment'},
    {id:'bloomscapes-dock-approvals',label:'Dock Rep Approvals'},
    {id:'bloomscapes-hl-keying',label:'Park Hill Data Entry · Hidden Lake'},
    {id:'bloomscapes-field-jobs',label:'Field Jobs and Can Fill'},
    {id:'bloomscapes-grading',label:'Season .Y Shift Grading & CF#'},
    {id:'bloomscapes-hauling',label:'Hauling & Consolidation'},
    {id:'bloomscapes-shearing',label:'Shear List & Crew Queue'},
    {id:'bloomscapes-lab',label:'Plant Health & Lab Review'},
    {id:'bloomscapes-vault',label:'My Work & Inquiry Vault'},
    {id:'bloomscapes-sales-vault',label:'Sales Rep Vault'},
    {id:'bloomscapes-radio',label:'Walkie-Talkie & AURA Voice'}
];

function bloomscapesWorkflowTab(tab) {
    return BLOOMSCAPES_WORKFLOW_TABS.find(entry => entry.id === tab);
}

function workflowForm(tab) {
    if (tab === 'bloomscapes-inventory') {
        return '<label>Farm <select name="farm"><option value="10-PH">🌲 10-PH</option><option value="60-HL">🏔️ 60-HL</option><option value="all">🌐 Combined</option></select></label><button type="submit">Show</button>';
    }
    if (bloomscapesFieldPanel(tab)) return bloomscapesFieldForms(tab);
    if (tab === 'bloomscapes-vault') {
        return '<label>Search <input name="search" type="search"></label><label>User <input name="user"></label>'
            + '<label>Work type <input name="type"></label><label>Block <input name="block"></label>'
            + '<label>From <input name="from" type="date"></label><label>To <input name="to" type="date"></label><button type="submit">Search</button>';
    }
    if (tab === 'bloomscapes-lab') {
        return '<label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label><label>Physical row ID <input name="rowId" required maxlength="150"></label><button type="submit">Create sample label</button>';
    }
    return '';
}

function renderBloomscapesWorkflowPanel(tab) {
    if (tab === 'bloomscapes-radio') return renderBloomscapesRadioControls();
    const workflow = bloomscapesWorkflowTab(tab);
    const form = workflowForm(tab);
    return `<section data-bloomscapes-workflow="${workflow.id}" class="space-y-3 p-3">
      <h2 class="text-lg font-bold">${workflow.label}</h2>
      ${bloomscapesFieldPanel(tab) ? form : (form ? '<form class="space-x-2">' + form + '</form>' : '')}
      ${tab === 'bloomscapes-vault' ? bloomscapesInquiryPdfForm() : ''}
      <p role="status"></p><div data-bloomscapes-results></div>
    </section>`;
}

const workflowFields = {
    'bloomscapes-inventory': ['warehouse_id','unique_id','itemcode','commonname','locationcode','lotcode','ptronhand'],
    'bloomscapes-replenishment': ['itemcode','locationcode','lotcode','current_ptronhand','remaining_po_qty','open_can_space','demand_7_days','hl_on_hand'],
    'bloomscapes-dock-approvals': ['itemcode','dock','order_unique_id','candidate_locationcode','decision'],
    'bloomscapes-hl-keying': ['itemcode','lotcode','locationcode','field_name','qty_delta','reason_code','actor_username'],
    'bloomscapes-field-jobs': ['unique_id','record_kind','itemcode','locationcode','new_locationcode','graded_qty','qty_hauled','job_status'],
    'bloomscapes-lab': ['sample_id','warehouse_id','genus_name','itemcode','lotcode','locationcode','status'],
    'bloomscapes-vault': ['work_type','itemcode','locationcode','lotcode','created_at']
    ,'bloomscapes-sales-vault':['ship_on','itemcode','locationcode','stagename','quantityordered','quantityshipped','cut_quantity','cut_reason_code']
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
    const capacity = Number(row.bed_capacity);
    if (!Number.isFinite(capacity) || capacity <= 0 || row.occupied_beds == null || row.unmeasured_rows>0) {
        appendWorkflowNode(item, 'span', 'Capacity needs measured beds / CPB for '+(row.unmeasured_rows || 'unmapped')+' rows');
        return;
    }
    const current = Number(row.occupied_beds);
    if (!Number.isFinite(current)) return;
    const meter = appendWorkflowNode(item, 'meter', '');
    meter.setAttribute('aria-label', 'Block capacity used');
    meter.max = capacity;
    meter.value = Math.min(capacity, current);
    appendWorkflowNode(item, 'span', current.toFixed(1) + ' / ' + capacity + ' beds occupied · '
        + (100*current/capacity).toFixed(1)+'% · '+row.cpb+' cans per bed');
}

function showWorkflowRows(host, tab, rows, run, refresh) {
    const results = host.querySelector('[data-bloomscapes-results]');
    results.replaceChildren();
    const list = appendWorkflowNode(results, 'ul', '');
    list.className = 'divide-y divide-emerald-900';
    rows.forEach(row => {
        const item = appendWorkflowNode(list, 'li', '');
        item.className = 'py-2 space-x-2';
        const keys = workflowFields[tab] || workflowFields['bloomscapes-field-jobs'];
        const fields = keys.map(key => row[key]).filter(value => value != null && value !== '');
        appendWorkflowNode(item, 'span', fields.join(' · '));
        if (tab === 'bloomscapes-replenishment') renderReplenishmentGauge(item, row);
        renderBloomscapesFieldExtras(item,tab,row,refresh);
        if (tab === 'bloomscapes-dock-approvals') renderDockWorkflowRow(item, row, run);
        if (tab === 'bloomscapes-vault') renderBloomscapesVaultPdf(item,row);
    });
}

function printLabSample(host, code, farm) {
    const status = host.querySelector('[role="status"]');
    const print = appendWorkflowNode(status, 'button', 'Generate PDF label');
    print.type = 'button';
    const requestId = crypto.randomUUID();
    print.addEventListener('click', () => {
        void runBloomscapesPdfCommand(status,print,{requestId,farm,rowId:code,workType:'LAB_SAMPLE'});
    });
}

function mountBloomscapesWorkflowPanel(container, tab) {
    if (tab === 'bloomscapes-radio') return mountBloomscapesRadioControls(container);
    const host = container.querySelector('[data-bloomscapes-workflow]');
    if (!host) return;
    const status = host.querySelector('[role="status"]');
    let generation = 0;
    let busy = false;
    const load = async (inputs = {}) => {
        const epoch = ++generation;
        status.textContent = 'Loading…';
        const commit = text => { if (host.isConnected && epoch === generation) status.textContent = text; };
        try {
            const rows = await readBloomscapesPanel(tab, inputs);
            if (!host.isConnected || epoch !== generation) return;
            showWorkflowRows(host, tab, rows, decide, load);
            commit(rows.length ? rows.length + ' records shown' : 'No records match.');
            bindBloomscapesPanelFilters(host,tab,rows,decide,load);
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
    bindBloomscapesPanelForm(host,tab,status,load);
    if (tab === 'bloomscapes-vault') bindBloomscapesInquiryPdf(host,status,load);
    mountBloomscapesLabControls(host,tab);
    mountBloomscapesDockControls(host,tab,load);
    mountBloomscapesRowChoices(host);
    host.addEventListener('bloomscapes-farm-change',()=>void load());
    void load();
}

function bindBloomscapesPanelForm(host,tab,status,load) {
    if (bloomscapesFieldPanel(tab)) {mountBloomscapesFieldForms(host,status,load);return;}
    if (tab==='bloomscapes-vault') return;
    const form=host.querySelector('form');
    const createSample=createBloomscapesLabSampleRunner(host,status,load);
    form?.addEventListener('submit',event=>{
        event.preventDefault();
        const inputs=Object.fromEntries(new FormData(form));
        if (tab==='bloomscapes-lab') void createSample(inputs);
        else void load(inputs);
    });
}

function bindBloomscapesPanelFilters(host,tab,rows,decide,load) {
    if(tab==='bloomscapes-vault') bindBloomscapesVaultFilter(host,rows,
        matches=>showWorkflowRows(host,tab,matches,decide,load));
}

function bloomscapesInquiryPdfForm() {
    return '<form data-inquiry-pdf><h3>Create Item Inquiry PDF</h3><label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label>'
        + '<label>Physical row ID <input name="rowId" required maxlength="150"></label><button>Create PDF &amp; Email Dylan</button></form>';
}

function bindBloomscapesInquiryPdf(host,status,load) {
    const form = host.querySelector('[data-inquiry-pdf]');
    let attempt;
    form.addEventListener('submit',async event => {
        event.preventDefault();
        const input = Object.fromEntries(new FormData(form));
        const signature = JSON.stringify(input);
        if (attempt?.signature !== signature) attempt = {...input,signature,requestId:crypto.randomUUID(),workType:'ITEM_INQUIRY'};
        if (await runBloomscapesPdfCommand(status,form.querySelector('button'),attempt)) {
            attempt = null;
            await load();
        }
    });
}

async function runBloomscapesPdfCommand(status,button,input) {
    if (button.disabled) return false;
    button.disabled = true;
    try {
        const receipt = await submitBloomscapesCommand('pdf',input);
        if (!status.isConnected) return false;
        status.textContent = 'PDF stored · Email: '+receipt.delivery+' · ';
        const link = appendWorkflowNode(status,'a','Open / Print PDF');
        link.href = receipt.signedUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return true;
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
        return false;
    } finally {button.disabled = false;}
}

function bloomscapesFieldPanel(tab) {
    return Object.hasOwn(BLOOMSCAPES_FIELD_KINDS,tab);
}

function bloomscapesFieldForms(tab) {
    const farm = '<label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label>';
    const row = '<label>Source row ID <input name="rowId" maxlength="150" required></label>';
    const grading = '<form class="space-x-2" data-field-command="grading"><h3>Season .Y Grading</h3>' + farm + row
        + '<label>Scheduled total <input name="scheduled" type="number" min="1" required></label>'
        + '<label>Graded # <input name="graded" type="number" min="0" required></label><button>Record grading</button></form>';
    const haul = '<form class="space-x-2" data-field-command="haul"><h3>Hauling</h3>' + farm + row
        + '<label>Destination row ID <input name="destinationId" maxlength="150" required></label>'
        + '<label>Qty hauled <input name="quantity" type="number" min="1" required></label>'
        + '<label>TAs <input name="tas" maxlength="1000"></label><button>Complete haul</button></form>';
    if (tab === 'bloomscapes-grading') return grading;
    if (tab === 'bloomscapes-hauling') return haul;
    if (tab === 'bloomscapes-shearing') return bloomscapesShearForms(farm, row);
    return grading + haul + bloomscapesShearForms(farm, row);
}

function mountBloomscapesFieldForms(host, status, load) {
    for (const form of host.querySelectorAll('[data-field-command]')) {
        bindBloomscapesFieldForm(form, status, load);
    }
}

function bindBloomscapesFieldForm(form, status, load) {
    let attempt;
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const inputs = Object.fromEntries(new FormData(form));
        const signature = JSON.stringify(inputs);
        if (attempt?.signature !== signature) attempt = {signature,id:crypto.randomUUID()};
        const button = form.querySelector('button');
        const saved = await runBloomscapesFieldCommand(status, button, load, form.dataset.fieldCommand,
            {...inputs,requestId:attempt.id});
        if (saved) attempt = null;
    });
}

function bloomscapesShearForms(farm, row) {
    return '<form class="space-x-2" data-field-command="shear"><h3>Plan Shearing</h3>' + farm + row
        + '<label>Scope <select name="scope"><option value="ITEM_LOCATION">Item @ Location</option><option value="ITEM_LOT">Item @ Lot</option><option value="SINGLE_ROW">Single Row</option></select></label>'
        + '<label>Percent <input name="pct" type="number" min="1" max="100" required></label>'
        + '<label><input name="acknowledge" type="checkbox" value="yes"> Acknowledge outbound or hold warning</label>'
        + '<button>Plan shear</button></form>'
        + '<form class="space-x-2" data-field-command="shear-complete"><h3>Complete Shearing</h3>' + farm
        + '<label>Shear job ID <input name="rowId" maxlength="36" required></label><button>Mark Sheared</button></form>';
}

function bloomscapesFieldReceipt(receipt) {
    if (receipt.status === 'REVIEW_REQUIRED') {
        const exposure = receipt.exposure;
        return 'Review required · ' + exposure.near_term_orders + ' outbound orders · ' + exposure.unknown_dates
            + ' orders with unverified dates · ' + receipt.hold_rows + ' held rows';
    }
    if (receipt.badge) return receipt.badge + ' · ' + receipt.rows.length + ' rows · ' + receipt.command_id;
    return receipt.location_note || 'Haul recorded · ' + receipt.quantity;
}

async function runBloomscapesFieldCommand(status, button, load, command, input) {
    if (button.disabled) return false;
    button.disabled = true;
    try {
        const receipt = await submitBloomscapesCommand(command,input);
        await load();
        if (status.isConnected) {
            status.textContent = bloomscapesFieldReceipt(receipt);
            if (command === 'grading') mountBloomscapesBalanceSplit(status, receipt, input.farm, load);
        }
        return receipt.status !== 'REVIEW_REQUIRED';
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
        return false;
    } finally {
        button.disabled = false;
    }
}

function mountBloomscapesBalanceSplit(status, grading, farm, load) {
    const target = appendWorkflowNode(status, 'select', '');
    target.setAttribute('aria-label','Move ungraded balance to season');
    for (const supply of ['27.F1','27.S1','27.U1','27.U2','27.U3','27.X']) {
        const option = appendWorkflowNode(target,'option',supply);
        option.value = supply;
    }
    const button = appendWorkflowNode(status,'button','Split balance out of .Y');
    button.type = 'button';
    let attempt;
    button.addEventListener('click', () => {
        if (!attempt || attempt.targetSupply !== target.value) {
            attempt = {farm,gradingId:grading.command_id,targetSupply:target.value,requestId:crypto.randomUUID()};
        }
        void runBloomscapesFieldCommand(status,button,load,'balance-split',attempt);
    });
}

function createBloomscapesLabSampleRunner(host,status,load) {
    let labAttempt;
    let busy = false;
    return async inputs => {
        if (busy) return;
        busy = true;
        const key = inputs.farm + ':' + inputs.rowId;
        labAttempt = labAttempt?.key === key ? labAttempt : {key, id:crypto.randomUUID()};
        try {
            const sample = await submitBloomscapesCommand('lab', {...inputs,requestId:labAttempt.id});
            await load();
            if (host.isConnected) {
                status.textContent = sample + ' · ';
                printLabSample(host, sample, inputs.farm);
            }
            labAttempt = null;
        } catch (error) {
            if (host.isConnected) status.textContent = error.message;
        } finally { busy = false; }
    };
}
