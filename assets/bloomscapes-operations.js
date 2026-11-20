const BLOOMSCAPES_WORKFLOW_TABS = [
    {id:'bloomscapes-studio',label:'Field Work Studio'},
    {id:'bloomscapes-inventory',label:'Farm Inventory'},
    {id:'bloomscapes-replenishment',label:'Intercompany Replenishment & CPB'},
    {id:'bloomscapes-dock-approvals',label:'Dock Rep Approvals'},
    {id:'bloomscapes-hl-keying',label:'Park Hill Data Entry · Intercompany'},
    {id:'bloomscapes-field-jobs',label:'Field Jobs and Can Fill'},
    {id:'bloomscapes-bunch-notes',label:'Bunch Notes'},
    {id:'bloomscapes-can-filling',label:'Can Filling'},
    {id:'bloomscapes-grading',label:'Shift Grading & CF#'},
    {id:'bloomscapes-hauling',label:'Hauling'},
    {id:'bloomscapes-shearing',label:'Shear List & Crew Queue'},
    {id:'bloomscapes-lab',label:'Plant Health & Lab Review'},
    {id:'bloomscapes-vault',label:'My Work & Inquiry PDF Vault'},
    {id:'bloomscapes-sales-vault',label:'Sales Rep Vault'},
    {id:'bloomscapes-radio',label:'Walkie-Talkie & AURA Voice'}
];

function bloomscapesWorkflowTab(tab) {
    return BLOOMSCAPES_WORKFLOW_TABS.find(entry => entry.id === tab);
}

function workflowForm(tab) {
    if (tab === 'bloomscapes-inventory') {
        return '';
    }
    if (bloomscapesFieldPanel(tab)) return renderBloomscapesWorkCreator(tab);
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
    if (tab === 'bloomscapes-studio') return renderBloomscapesWorkStudio();
    if (tab === 'bloomscapes-replenishment') return renderBloomscapesTransferBuilder();
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
    'bloomscapes-dock-approvals': ['itemcode','dock','order_unique_id','candidate_locationcode','decision'],
    'bloomscapes-hl-keying': ['itemcode','lotcode','locationcode','field_name','qty_delta','reason_code','actor_username'],
    'bloomscapes-field-jobs': ['unique_id','record_kind','itemcode','locationcode','new_locationcode','graded_qty','qty_hauled','job_status'],
    'bloomscapes-lab': ['sample_id','warehouse_id','genus_name','itemcode','lotcode','locationcode','status'],
    'bloomscapes-sales-vault':['ship_on','itemcode','locationcode','stagename','quantityordered','quantityshipped','cut_quantity','cut_reason_code']
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

function showWorkflowRows(host, tab, rows, run) {
    const results = host.querySelector('[data-bloomscapes-results]');
    results.replaceChildren();
    if (tab === 'bloomscapes-vault') {
        results.className='bloomscapes-sales-card-list';
        const lookup=createSalesStudioTargetLookup();
        renderBloomscapesListWindow(results,rows,row=>renderBloomscapesSalesCard(row,lookup(row),button=>openBloomscapesVaultPdf(row,button)));
        return;
    }
    const list = appendWorkflowNode(results, 'ul', '');
    list.className = 'divide-y divide-emerald-900';
    renderBloomscapesListWindow(list,rows,row => {
        const item = document.createElement('li');
        item.className = 'py-2 space-x-2';
        const keys = workflowFields[tab] || workflowFields['bloomscapes-field-jobs'];
        const fields = keys.map(key => row[key]).filter(value => value != null && value !== '');
        appendWorkflowNode(item, 'span', fields.join(' · '));
        renderBloomscapesFieldExtras(item,tab,row);
        if (tab === 'bloomscapes-dock-approvals') renderDockWorkflowRow(item, row, run);
        return item;
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
    if (tab==='bloomscapes-replenishment') return void mountBloomscapesTransferBuilder(container);
    if (tab === 'bloomscapes-studio') return void mountBloomscapesWorkStudio(container);
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
            if (tab !== 'bloomscapes-vault') showWorkflowRows(host, tab, rows, decide);
            commit(rows.length + ' records shown');
            bindBloomscapesPanelFilters(host,tab,rows,decide);
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
    if (bloomscapesFieldPanel(tab)) void mountBloomscapesWorkCreator(host,tab);
    host.addEventListener('bloomscapes-farm-change',()=>{
        if (bloomscapesFieldPanel(tab)) {
            host.outerHTML = renderBloomscapesWorkflowPanel(tab);
            mountBloomscapesWorkflowPanel(container,tab);
        } else void load();
    });
    void load();
}

function bindBloomscapesPanelForm(host,tab,status,load) {
    if (bloomscapesFieldPanel(tab)) return;
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

function bindBloomscapesPanelFilters(host,tab,rows,decide) {
    if (tab==='bloomscapes-vault') bindBloomscapesVaultFilter(host,rows,
        matches=>showWorkflowRows(host,tab,matches,decide));
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

async function runBloomscapesFieldCommand(status, button, load, command, input) {
    if (button.disabled) return false;
    button.disabled = true;
    try {
        const receipt = await submitBloomscapesCommand(command,input);
        await load();
        if (status.isConnected) {
            status.textContent = receipt.location_note || 'Work recorded';
        }
        return receipt.status !== 'REVIEW_REQUIRED';
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
        return false;
    } finally {
        button.disabled = false;
    }
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
