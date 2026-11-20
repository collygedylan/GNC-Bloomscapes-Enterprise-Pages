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

function mountBloomscapesLabDiagnostics(host) {
    if (!host?.closest('#view-production')) return;
    const state = {host,owner:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm(),offset:0};
    host.replaceChildren();
    state.status = plantHealthNode('p','Loading flagged photos…',host);
    state.status.setAttribute('role','status');
    state.list = plantHealthNode('div','',host);
    state.previous = plantHealthNode('button','Previous 50',host);
    state.previous.type = 'button';
    state.previous.hidden = true;
    state.previous.onclick = () => void loadPlantHealthQueuePage(state,state.offset-50);
    state.next = plantHealthNode('button','Next 50',host);
    state.next.type = 'button';
    state.next.hidden = true;
    state.next.onclick = () => void loadPlantHealthQueuePage(state,state.offset+50);
    void loadPlantHealthQueuePage(state);
}

async function loadPlantHealthQueuePage(state,offset = 0) {
    if (state.busy || offset<0) return;
    state.busy = true;
    state.previous.disabled = true;
    state.next.disabled = true;
    try {
        const page = await readPlantHealthQueue(state.farm,offset);
        if (!state.host.isConnected || !plantHealthSameView(state)) return;
        const fragment = await buildPlantHealthPage(state,page.slice(0,50));
        if (!state.host.isConnected || !plantHealthSameView(state)) return;
        state.list.replaceChildren(fragment);
        state.offset = offset;
        state.status.textContent = page.length ? '' : 'No photos have reached the diagnostic review threshold.';
        state.previous.hidden = offset === 0;
        state.next.hidden = page.length <= 50;
    } catch (error) {
        if (state.host.isConnected && plantHealthSameView(state)) state.status.textContent = error.message;
    } finally {
        state.busy = false;
        state.previous.disabled = false;
        state.next.disabled = false;
    }
}

async function buildPlantHealthPage(state,entries) {
    const fragment = document.createDocumentFragment();
    let started = performance.now();
    for (const entry of entries) {
        if (!state.host.isConnected || !plantHealthSameView(state)) break;
        addPlantHealthCard(state,entry,fragment);
        if (performance.now()-started < 5) continue;
        await new Promise(requestAnimationFrame);
        started = performance.now();
    }
    return fragment;
}

function addPlantHealthCard(state,entry,fragment) {
    const row = entry.inventory && resolveCanonicalInventoryRow(entry.inventory);
    if (!row || bloomscapesRowFarm(row) !== state.farm) return;
    const card = plantHealthNode('div','',fragment);
    card.innerHTML = generateCard(row,'drive','status-green',{workBuilder:true,originView:'production'});
    card.tabIndex = 0;
    card.setAttribute('role','button');
    card.setAttribute('aria-label','Review '+String(row.COMMONNAME || row.commonname || entry.row_uid));
    const open = () => {
        if (!plantHealthSameView(state)) return;
        const details = {...row,__plantHealthQueueId:entry.id};
        plantHealthDetailReview = {farm:state.farm,owner:state.owner,entry};
        openDetail(entry.row_uid,'production',{__masterDetailRow:details,cardIdentity:inventoryCardDetailIdentity(details)});
        renderPlantHealthDetail(activeItem,activeDetailSourceView);
    };
    card.onclick = event => { if (!event.target.closest('button,input,a')) open(); };
    card.onkeydown = event => {
        if (event.target !== card || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        open();
    };
}

function renderPlantHealthDetail(item,sourceView) {
    const state = plantHealthDetailReview;
    const valid = sourceView === 'production' && state && plantHealthSameView(state)
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
    panel.replaceChildren();
    const entry = state.entry;
    plantHealthNode('h3','Plant health diagnostic',panel);
    if (entry.photo_url) {
        const photo = plantHealthNode('img','',panel);
        photo.alt = 'Published field photo for this review';
        photo.className = 'max-h-48 rounded-lg';
        photo.src = entry.photo_url;
    }
    plantHealthNode('p','Suggested diagnosis · '+entry.diagnosis,panel);
    plantHealthNode('p','Closest GNC lab precedent · '+entry.precedent,panel);
    const score = entry.analysis_source === 'field_note_genus_prior' ? 'Field-note referral priority · '+entry.confidence+'/100' : 'ML confidence · '+entry.confidence+'%';
    plantHealthNode('p',score,panel);
    const status = plantHealthNode('p','',panel);
    status.setAttribute('role','status');
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

