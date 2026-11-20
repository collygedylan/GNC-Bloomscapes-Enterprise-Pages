let plantHealthDetailReview = null;
const plantHealthHealthy = 'Healthy / Normal Cultivar Coloration';

function plantHealthNode(tag, text, parent) {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.appendChild(node);
    return node;
}

function plantHealthSameView(state) {
    return state.owner === getSupabaseReadIdentityScope() && state.farm === getBloomscapesFarm();
}

function mountBloomscapesLabDiagnostics(host,selection) {
    if (!host?.isConnected || !nativeAuthSessionActive) return;
    const state = {host,selection,owner:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm(),offset:0};
    host.replaceChildren();
    mountPlantHealthToolbar(state);
    state.status = plantHealthNode('p','Loading flagged photos…',host);
    state.status.setAttribute('role','status');
    state.list = plantHealthNode('div','',host);
    state.list.className = 'plant-health-card-list';
    state.edge = plantHealthNode('div','',host);
    state.edge.dataset.scrollPageEdge = '';
    state.edge.hidden = true;
    state.rows = [];
    void loadPlantHealthQueuePage(state);
}

async function loadPlantHealthQueuePage(state) {
    if (state.busy || !plantHealthSameView(state)) return;
    state.busy = true;
    state.edge.hidden = true;
    try {
        const page = await readPlantHealthQueue(state.farm,state.offset,state.selection);
        if (!state.host.isConnected || !plantHealthSameView(state)) return;
        state.rows.push(...page.slice(0,50));
        state.offset += 50;
        paintPlantHealthQueue(state);
        state.edge.hidden = page.length <= 50;
        if (!state.edge.hidden) observeBloomscapesPageEdge(state.edge,()=>void loadPlantHealthQueuePage(state));
    } catch (error) {
        if (state.host.isConnected && plantHealthSameView(state)) state.status.textContent = error.message;
    } finally {
        state.busy = false;
    }
}

function mountPlantHealthToolbar(state) {
    const bar = plantHealthNode('div','',state.host);
    bar.className = 'plant-health-toolbar';
    state.statusFilter = plantHealthNode('select','',bar);
    state.statusFilter.setAttribute('aria-label','Status');
    for (const [value,label] of [['','Status'],['pending','Needs review'],['agree','Agreed'],['disagree','Corrected']]) {
        state.statusFilter.add(new Option(label,value));
    }
    state.blockFilter = plantHealthNode('select','',bar);
    state.blockFilter.setAttribute('aria-label','Block');
    state.blockFilter.add(new Option('Block',''));
    bar.onchange = () => paintPlantHealthQueue(state);
    plantHealthAction(bar,'📷 Scan / New Sample',() => openPlantHealthLabDialog(state.host));
}

function openPlantHealthLabDialog(host,sample = '') {
    let dialog = host.querySelector('dialog');
    if (!dialog) {
        dialog = plantHealthNode('dialog','',host);
        dialog.className = 'plant-health-lab-dialog';
        dialog.setAttribute('aria-label','Scan, sample and lab results');
        plantHealthAction(dialog,'Close',() => dialog.close());
        const content = plantHealthNode('div','',dialog);
        content.innerHTML = renderBloomscapesWorkflowPanel('bloomscapes-lab',{showLabForms:true});
        mountBloomscapesWorkflowPanel(content,'bloomscapes-lab');
    }
    if (sample) {
        for (const input of dialog.querySelectorAll('[name=sample]')) input.value = sample;
    }
    if (!dialog.open) dialog.showModal();
}

function paintPlantHealthQueue(state) {
    const rows = state.rows || [];
    const blockKey = ({inventory}) => inventory ? getDriveBlockAlphaLabel(getDriveBlockAlphaValue(inventory)) : '';
    const blocks = [...new Set(rows.map(blockKey).filter(Boolean))].sort();
    const selected = state.blockFilter.value;
    state.blockFilter.replaceChildren(new Option('Block',''),...blocks.map(block=>new Option(block,block)));
    state.blockFilter.value = blocks.includes(selected) ? selected : '';
    const {value:verdict} = state.statusFilter;
    const shown = rows.filter(entry => (!verdict || (entry.verdict || 'pending') === verdict)
        && (!state.blockFilter.value || blockKey(entry) === state.blockFilter.value));
    mountBloomscapesScrollWindow(state.list,shown,{
        mount:(section,entries)=>entries.forEach(entry=>addPlantHealthCard(state,entry,section))
    });
    state.status.textContent = shown.length ? '' : 'No photos match these filters.';
}

function addPlantHealthCard(state,entry,parent) {
    const row = entry.inventory && resolveCanonicalInventoryRow(entry.inventory);
    if (!row || bloomscapesRowFarm(row) !== state.farm) return;
    const card = plantHealthNode('article','',parent);
    card.className = 'app-smart-card plant-health-card';
    const identity = plantHealthNode('div','',card);
    identity.className = 'plant-health-identity';
    if (entry.photo_url) {
        const photo = plantHealthNode('img','',identity);
        photo.alt = 'Published field photo';
        photo.loading = 'lazy';
        photo.src = entry.photo_url;
    }
    const text = plantHealthNode('div','',identity);
    plantHealthNode('strong',row.COMMONNAME || row.commonname || entry.row_uid,text);
    plantHealthNode('p',[row.ITEMCODE || row.itemcode,row.LOCATIONCODE || row.locationcode,row.LOTCODE || row.lotcode].filter(Boolean).join(' · '),text);
    plantHealthAction(text,'View plant',() => openPlantHealthCardDetail(state,entry,row));
    paintPlantHealthCardReview(card,state,entry);
}

function openPlantHealthCardDetail(state,entry,row) {
    if (!plantHealthSameView(state)) return;
    const details = {...row,__plantHealthQueueId:entry.id};
    const source = getCurrentVisibleViewId();
    plantHealthDetailReview = {farm:state.farm,owner:state.owner,entry,source};
    openDetail(entry.row_uid,source,{__masterDetailRow:details,cardIdentity:inventoryCardDetailIdentity(details)});
    renderPlantHealthDetail(activeItem,activeDetailSourceView);
}

function paintPlantHealthCardReview(card,state,entry) {
    card.querySelector('[data-health-review]')?.remove();
    const review = plantHealthNode('section','',card);
    review.dataset.healthReview = '';
    paintPlantHealthDetail(review,{farm:state.farm,owner:state.owner,entry,labHost:state.host});
}

function renderPlantHealthDetail(item,sourceView) {
    const state = plantHealthDetailReview;
    const valid = state && sourceView===state.source && plantHealthSameView(state)
        && item?.__plantHealthQueueId === state.entry.id && getItemUniqueId(item) === state.entry.row_uid;
    const old = document.getElementById('plant-health-review-detail');
    if (!valid) { old?.remove(); return; }
    if (old?.dataset.id === state.entry.id) return;
    old?.remove();
    const root = document.getElementById('det-overview-content');
    if (!root) return;
    const panel = document.createElement('section');
    panel.id = 'plant-health-review-detail';
    panel.className = 'rounded-xl border p-3 mb-3 space-y-2';
    panel.dataset.id = state.entry.id;
    root.prepend(panel);
    paintPlantHealthDetail(panel,state);
}

function paintPlantHealthDetail(panel,state) {
    const detail = !state.labHost;
    panel.replaceChildren();
    const entry = state.entry;
    if (detail) plantHealthNode('h3','Plant health diagnostic',panel);
    if (detail && entry.photo_url) {
        const photo = plantHealthNode('img','',panel);
        photo.alt = 'Published field photo for this review';
        photo.className = 'max-h-48 rounded-lg';
        photo.src = entry.photo_url;
    }
    plantHealthNode('p','Suggested diagnosis · '+entry.diagnosis,panel);
    if (detail && entry.precedent) plantHealthNode('p','Closest GNC lab precedent · '+entry.precedent,panel);
    const score = entry.analysis_source === 'field_note_genus_prior' ? 'Field-note referral priority · '+entry.confidence+'/100' : 'ML confidence · '+entry.confidence+'%';
    plantHealthNode('p',score,panel).className = 'plant-health-confidence';
    const status = plantHealthNode('p','',panel);
    status.setAttribute('role','status');
    if (state.labHost) plantHealthAction(panel,'🧪 Lab Result',() => openPlantHealthLabDialog(state.labHost,entry.sample_id));
    if (entry.verdict) {
        showPlantHealthDecision(panel,status,state);
        return;
    }
    plantHealthAction(panel,'👍 Agree',() => savePlantHealthAction(panel,state,'agree'));
    plantHealthAction(panel,'👎 Disagree',button => {
        button.disabled = true;
        showPlantHealthCorrections(panel,state);
    });
}

function showPlantHealthDecision(panel,status,state) {
    const entry = state.entry;
    status.textContent = entry.verdict === 'agree' ? 'Agreed' : 'Corrected to '+entry.corrected_diagnosis;
    if (entry.sample_id) plantHealthNode('p',entry.sample_id,panel);
    else if (entry.verdict === 'agree') plantHealthAction(panel,'Generate Sample ID',() => savePlantHealthAction(panel,state,'sample'));
}

function plantHealthAction(panel,title,command) {
    const button = plantHealthNode('button',title,panel);
    button.type = 'button';
    button.className = 'rounded-lg border px-3 py-2 mr-2 font-bold';
    button.onclick = () => command(button);
}

function showPlantHealthCorrections(panel,state) {
    const form = plantHealthNode('form','',panel);
    const label = plantHealthNode('label','Correct diagnosis ',form);
    const select = plantHealthNode('select','',label);
    const alternatives = (state.entry.alternatives || []).filter(value => value !== state.entry.diagnosis);
    for (const option of new Set([plantHealthHealthy,...alternatives,'Other disease or pest'])) select.add(new Option(option,option));
    const input = plantHealthNode('input','',form);
    input.setAttribute('aria-label','Actual disease or pest');
    input.maxLength = 300;
    input.hidden = true;
    select.onchange = () => {input.hidden = select.value !== 'Other disease or pest';input.required = !input.hidden;};
    plantHealthNode('button','Save correction',form).type = 'submit';
    form.onsubmit = event => {
        event.preventDefault();
        void savePlantHealthAction(panel,state,'disagree',input.hidden ? select.value : input.value.trim());
    };
}

async function savePlantHealthAction(panel,state,verdict,correction) {
    if (!plantHealthSameView(state) || state.busy || !panel.isConnected) return;
    state.busy = true;
    try {
        const saved = await submitPlantHealthReview(state.entry,verdict,correction);
        if (!plantHealthSameView(state)) return;
        Object.assign(state.entry,saved);
        if (panel.isConnected) paintPlantHealthDetail(panel,state);
    } catch (error) {
        if (panel.isConnected && plantHealthSameView(state)) panel.querySelector('[role=status]').textContent = error.message;
    } finally { state.busy = false; }
}

