let bloomscapesFieldQueueState = {owner:'',rows:[],views:[],pending:null};

function bloomscapesWorkTab(kind) {
    return 'work-'+String(kind).toLowerCase().replaceAll('_','-');
}

function bloomscapesWorkKind(tab) {
    return Object.keys(BLOOMSCAPES_WORK_VIEWS).find(kind=>bloomscapesWorkTab(kind)===tab) || '';
}

function bloomscapesWorkQueueCategories() {
    const owner = getSupabaseReadIdentityScope();
    return bloomscapesFieldQueueState.owner===owner ? bloomscapesFieldQueueState.views.map(bloomscapesWorkTab) : [];
}

function bloomscapesWorkQueueLabel(tab) {
    return BLOOMSCAPES_WORK_VIEWS[bloomscapesWorkKind(tab)] || '';
}

function bloomscapesWorkQueueCount(tab) {
    const kind = bloomscapesWorkKind(tab);
    return bloomscapesFieldQueueState.owner===getSupabaseReadIdentityScope()
        ? bloomscapesFieldQueueState.rows.filter(row=>row.work_view===kind).length : 0;
}

function applyBloomscapesFieldQueueSnapshot(data) {
    if (data.ownerScope!==getSupabaseReadIdentityScope() || data.farm_code!==getBloomscapesFarm()) return false;
    Object.assign(bloomscapesFieldQueueState,{owner:data.ownerScope,rows:data.rows,views:data.views,loaded:true});
    renderRequestCategoryToolbar();
    return true;
}

async function ensureBloomscapesFieldQueue(force=false) {
    const owner = getSupabaseReadIdentityScope();
    if (bloomscapesFieldQueueState.owner!==owner) bloomscapesFieldQueueState = {owner,rows:[],views:[],pending:null};
    const state = bloomscapesFieldQueueState;
    if (state.pending) return state.pending;
    if (state.loaded && !force) return state;
    state.pending = readBloomscapesFieldWork().then(data=>{
        if (state!==bloomscapesFieldQueueState || owner!==getSupabaseReadIdentityScope()) return state;
        applyBloomscapesFieldQueueSnapshot(data);
        return state;
    });
    try { return await state.pending; }
    finally { state.pending = null; }
}

async function openBloomscapesWorkQueue(kind) {
    await ensureBloomscapesFieldQueue(true);
    const tab = bloomscapesWorkTab(kind);
    if (!bloomscapesWorkQueueCategories().includes(tab)) throw new Error('Work View access is unavailable.');
    switchView('request');
    setReqTab(tab);
}

async function renderBloomscapesFieldQueue(container,crumb) {
    const owner = getSupabaseReadIdentityScope();
    const tab = activeReqTab;
    const kind = bloomscapesWorkKind(tab);
    if (!kind || !container) return;
    const host = document.createElement('section');
    host.dataset.fieldWorkQueue = kind;
    container.replaceChildren(host);
    if (crumb) crumb.textContent = `${getBloomscapesFarm()} · ${BLOOMSCAPES_WORK_VIEWS[kind]}`;
    const status = host.appendChild(document.createElement('p'));
    status.setAttribute('role','status');
    try {
        const state = await ensureBloomscapesFieldQueue();
        if (!host.isConnected || owner!==getSupabaseReadIdentityScope() || tab!==activeReqTab) return;
        const rows = state.rows.filter(row=>row.work_view===kind);
        const filter = host.appendChild(document.createElement('select'));
        filter.setAttribute('aria-label','Work Assigned To');
        filter.appendChild(new Option('All assigned users',''));
        [...new Set(rows.map(row=>row.assigned_to))].sort().forEach(user=>filter.appendChild(new Option(user,user)));
        const list = host.appendChild(document.createElement('div'));
        const render = ()=>{
            const matches = rows.filter(row=>!filter.value || row.assigned_to===filter.value);
            status.textContent = `${matches.length} work cards · ${getBloomscapesFarm()}`;
            list.replaceChildren(...matches.map(row=>renderBloomscapesFieldWorkCard(row,status)));
        };
        filter.addEventListener('change',render);
        render();
    } catch (error) { if (host.isConnected) status.textContent = error.message; }
}

function renderBloomscapesFieldWorkCard(job,status) {
    const card = document.createElement('article');
    card.dataset.workId = job.id;
    card.className = 'bloomscapes-field-work-card';
    const heading = card.appendChild(document.createElement('h3'));
    heading.textContent = `${job.action_type} · ${job.itemcode} · ${job.farm_code}`;
    const detail = card.appendChild(document.createElement('p'));
    detail.textContent = [job.scope,`${job.source_rows.length} rows`,`Qty ${job.quantity}`,job.assigned_to,
        job.due_on || 'No due date',job.instructions].join(' · ');
    const form = card.appendChild(document.createElement('form'));
    form.innerHTML = '<label>Actual Qty <input name="actualQuantity" type="number" min="1" step="1" required></label>'
        + '<label>Completion Notes <input name="notes" maxlength="1000"></label>'
        + '<label><input name="acknowledge" type="checkbox"> Confirm crew and outbound warnings reviewed</label>'
        + '<button type="submit">MARK DONE · Complete Work</button>';
    form.elements.actualQuantity.value = job.quantity;
    if (job.status==='DONE') form.querySelector('button').textContent = 'Work complete · Retry PDF archive';
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void completeBloomscapesFieldWorkCard(job,form,status);
    });
    return card;
}

async function completeBloomscapesFieldWorkCard(job,form,status) {
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    const owner = getSupabaseReadIdentityScope();
    const answers = job.completion_answers || {actualQuantity:form.elements.actualQuantity.value,
        notes:form.elements.notes.value,acknowledge:form.elements.acknowledge.checked};
    try {
        const receipt = await completeBloomscapesFieldWork(job,answers);
        if (owner!==getSupabaseReadIdentityScope()) return;
        status.textContent = 'Work saved · PDF '+receipt.pdf.archiveStatus;
        await ensureBloomscapesFieldQueue(true);
        await renderBloomscapesFieldQueue(document.getElementById('request-content'),document.getElementById('request-crumb'));
    } catch (error) { if (status.isConnected) status.textContent = error.message; }
    finally { button.disabled = false; }
}
