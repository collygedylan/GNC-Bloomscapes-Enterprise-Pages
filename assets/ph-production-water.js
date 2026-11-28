
const phWaterOptions = [['request','Prober Request'],['schedule','Water Man Schedule'],['active','Active ON'],['all','All Blocks']];
const phWaterDurations = [15,30,45,60,90,120];
const mountedPhWaterPanels = new WeakMap();

function phWaterMarkup() {
    return '<section data-ph-water><nav aria-label="Water views" data-ph-water-bar>'
        +phWaterOptions.map(([key,label]) => renderCompactToolbarButton('data-ph-water-view',key,label)).join('')
        +'</nav><input type="search" class="ph-water-search" placeholder="Location or block" aria-label="Search water blocks" data-ph-water-search>'
        +'<form data-ph-water-request><label>Location or block<input name="location" required placeholder="D.31.000" autocomplete="off" list="ph-water-blocks"></label>'
        +'<datalist id="ph-water-blocks"></datalist><output data-ph-water-key></output>'
        +'<label>Run date<select name="day"><option value="tomorrow">Tomorrow</option><option value="today">Today</option></select></label>'
        +'<div class="ph-water-durations">'+phWaterDurations.map(minutes =>
            renderCompactToolbarButton('data-ph-duration',minutes,minutes+'m')).join('')
        +'</div><label>Minutes<input name="minutes" type="number" inputmode="numeric" min="1" max="1440" required></label>'
        +'<label>Soil note<input name="note" maxlength="500"></label>'
        +'<button type="submit">💾 Save Water Request</button></form>'
        +'<div class="ph-water-card-area"><button type="button" data-ph-water-batch hidden></button><div data-ph-water-cards></div></div><p role="status" data-ph-water-status></p></section>';
}

function phWaterLabel(row) {
    if (row.block_code === 'PROP') return 'Propagation';
    return 'Block '+row.block_code;
}

function phWaterRequestMarkup(row) {
    return (row.requests || []).map(request => '<p>'+escapeHtml(request.schedule_date)+' · Requested: '+request.requested_minutes
        +' min · Probed by '+escapeHtml(request.probed_by || '')+'</p>'
        +(request.prober_note ? '<p>'+escapeHtml(request.prober_note)+'</p>' : '')).join('');
}

function newPhWaterCard(row) {
    const node = document.createElement('article');
    node.dataset.phWaterCard = row.block_code;
    node.innerHTML = '<h4>'+escapeHtml(phWaterLabel(row))+'</h4><strong data-ph-water-clock="'+escapeHtml(row.block_code)
        +'" hidden></strong><div data-ph-water-requests></div><button type="button" data-ph-water-toggle="'
        +escapeHtml(row.block_code)+'"></button>';
    return {node,row:null};
}

function updatePhWaterCard(card,row,state) {
    const busy = state.pending.has(row.block_code);
    if (card.row===row && card.busy===busy && card.edit===state.canEdit) return;
    card.busy = busy;
    card.edit = state.canEdit;
    const button = card.node.querySelector('button');
    button.hidden = !state.canEdit;
    button.disabled = busy;
    if (card.row === row) return;
    button.textContent = row.is_water_on ? '\u23f9 Turn Water OFF' : '💧 Turn Water ON';
    card.node.querySelector('[data-ph-water-clock]').hidden = !row.is_water_on;
    if (card.row?.requests !== row.requests) card.node.querySelector('[data-ph-water-requests]').innerHTML = phWaterRequestMarkup(row);
    card.row = row;
}

function paintPhWaterCards(panel,matches,state) {
    const host = panel.root.querySelector('[data-ph-water-cards]');
    const keep = new Set(matches.map(row=>row.block_code));
    for (const [code,{node}] of panel.cards) {
        if (keep.has(code)) continue;
        node.remove();
        panel.cards.delete(code);
    }
    for (const [i,row] of matches.entries()) {
        const card = panel.cards.get(row.block_code) || newPhWaterCard(row);
        panel.cards.set(row.block_code,card);
        updatePhWaterCard(card,row,state);
        if (host.children[i] !== card.node) host.insertBefore(card.node,host.children[i] || null);
    }
}

function paintPhWaterClocks(root,state) {
    for (const badge of root.querySelectorAll('[data-ph-water-clock]')) {
        const row = state.blockWaterStatus[badge.dataset.phWaterClock];
        if (!row?.is_water_on) continue;
        const elapsed = phWaterElapsed(row,Date.now());
        const target = Number(row.active_requested_minutes || 0);
        badge.classList.toggle('ph-water-time-up',target > 0 && elapsed >= target);
        badge.textContent = target > 0 && elapsed >= target ? '⏰ TIME UP — SHUT OFF · '+elapsed+'m / '+target+'m'
            : '🟢 WATER ON · '+elapsed+'m'+(target ? ' / '+target+'m' : '');
    }
}

function phWaterViewRows(rows,view,query,panel,state) {
    const key = parseCanonicalBlockKey(query)?.block_code;
    const term = String(query || '').trim().toUpperCase();
    return rows.filter(row => (
        view === 'all' || row.is_water_on || view === 'schedule' && row.requests?.length
        || panel.cards.has(row.block_code) && state.pending.has(row.block_code)
    ) && (!term || (key ? row.block_code === key : row.block_code.includes(term) || phWaterLabel(row).toUpperCase().includes(term))));
}

function paintPhWaterPanel(panel) {
    if (!syncPhWaterPanelOwner(panel)) return;
    const {root,state,form,search} = panel;
    const rows = Object.values(state.blockWaterStatus);
    const active = rows.filter(row => row.is_water_on).length;
    const scheduled = rows.filter(row => row.is_water_on || row.requests?.length).length;
    const labels = {active:'Active ON ('+active+')',schedule:'Water Man Schedule ('+scheduled+')',
        all:'All '+rows.filter(row => row.block_alpha !== 'PROP').length+' Blocks'};
    for (const [key,label] of phWaterOptions) {
        const button = root.querySelector('[data-ph-water-view="'+key+'"]');
        button.textContent = labels[key] || label;
        button.setAttribute('aria-pressed',String(panel.view === key));
    }
    form.hidden = panel.view !== 'request';
    form.querySelector('[type="submit"]').disabled = !state.canEdit || state.pending.size > 0;
    if (panel.catalogSize !== rows.length) {
        root.querySelector('datalist').innerHTML = rows.map(row=>'<option value="'+escapeHtml(row.block_code)+'"></option>').join('');
        panel.catalogSize = rows.length;
    }
    const matches = form.hidden ? phWaterViewRows(rows,panel.view,search.value,panel,state) : [];
    paintPhWaterCards(panel,matches,state);
    paintPhWaterBatch(panel,rows,state,matches.length);
    root.querySelector('[data-ph-water-status]').textContent = state.error || (!state.today ? 'Loading Park Hill Water…'
        : state.pending.size ? 'Saving…' : form.hidden && !matches.length ? 'No matching blocks.' : panel.message || '');
    paintPhWaterClocks(root,state);
}

function paintPhWaterBatch(panel,rows,state,count) {
    const button = panel.root.querySelector('[data-ph-water-batch]');
    const on = panel.view === 'schedule';
    const activeTab = panel.view === 'active';
    panel.batch = rows.filter(row=>on ? !row.is_water_on && row.requests?.length : row.is_water_on)
        .map(row=>row.block_code);
    button.hidden = !state.canEdit || (!on && !activeTab) || !panel.batch.length;
    button.disabled = panel.batch.some(block=>state.pending.has(block));
    button.classList.toggle('ph-water-batch-floating',count>0);
    button.textContent = on ? '💧 Turn All Scheduled ON' : '\u23f9 Turn All Active OFF';
}

function syncPhWaterPanelOwner(panel, requestedView = panel.view) {
    if (!panel.root.isConnected) {
        panel.stop();
        return false;
    }
    const state = currentPhWaterState();
    if (state && state === panel.state) return true;
    if (state) mountPhProductionWater(panel.host,requestedView);
    else panel.root.replaceChildren();
    return false;
}

function startPhWaterClock(panel) {
    const owned = syncPhWaterPanelOwner(panel);
    if (!panel.root.isConnected || document.hidden || getCurrentVisibleViewId() !== 'production') return;
    if (owned) paintPhWaterClocks(panel.root,panel.state);
    panel.clock = setTimeout(() => startPhWaterClock(panel),5000);
}

function phWaterFormKey(form) {
    const parsed = parseCanonicalBlockKey(form.elements.location.value);
    form.querySelector('output').textContent = parsed
        ? 'Block '+parsed.block_code+' — Covers all '+parsed.block_code+'.* bays' : '';
}

async function savePhProberRequest(panel,event) {
    event.preventDefault();
    const {form} = panel;
    if (!syncPhWaterPanelOwner(panel) || !panel.state.today) return;
    const state = panel.state;
    const location = form.elements.location.value;
    const block = parseCanonicalBlockKey(location)?.block_code;
    if (!state.blockWaterStatus[block]) {
        panel.message = 'Choose a mapped Park Hill block.';
        paintPhWaterPanel(panel);
        return;
    }
    const date = phWaterScheduleDay(state.today,form.elements.day.value === 'tomorrow');
    panel.view = 'schedule';
    const saved = await submitPhWaterCommand({
        location,date,minutes:Number(form.elements.minutes.value),note:form.elements.note.value
    });
    if (!syncPhWaterPanelOwner(panel)) return;
    if (saved) panel.message = 'Water request saved for '+block+'.';
    else panel.view = 'request';
    paintPhWaterPanel(panel);
}

function clickPhWater(panel,event) {
    const target = event.target.closest('button');
    if (!target) return;
    const {phDuration,phWaterView,phWaterToggle} = target.dataset;
    if (!syncPhWaterPanelOwner(panel,phWaterView)) return;
    if (phDuration) panel.form.elements.minutes.value = phDuration;
    if (phWaterView) {
        panel.view = phWaterView;
        panel.message = '';
        paintPhWaterPanel(panel);
    }
    if (Object.hasOwn(target.dataset,'phWaterBatch')) void submitPhWaterBatch(panel.batch,panel.view==='schedule');
    if (phWaterToggle) {
        const row = panel.state.blockWaterStatus[phWaterToggle];
        if (row) void submitPhWaterCommand({location:phWaterToggle,on:!row.is_water_on});
    }
}

/**
 * @param {HTMLElement} host Production Water workspace.
 * @param {string} view Selected read-only Water tab.
 * @returns {void}
 */
function mountPhProductionWater(host,view = 'request') {
    const state = currentPhWaterState();
    mountedPhWaterPanels.get(host)?.stop();
    host.innerHTML = phWaterMarkup();
    const root = host.firstElementChild;
    const form = root.querySelector('form');
    const search = root.querySelector('[data-ph-water-search]');
    const panel = {host,root,state,form,search,view,message:'',clock:null,cards:new Map()};
    mountedPhWaterPanels.set(host,panel);
    root.onclick = event => clickPhWater(panel,event);
    form.onsubmit = event => void savePhProberRequest(panel,event);
    form.elements.location.oninput = () => phWaterFormKey(form);
    search.oninput = () => paintPhWaterPanel(panel);
    const unobserve = observePhWaterUpdates(() => paintPhWaterPanel(panel));
    const startClock = () => {
        clearTimeout(panel.clock);
        startPhWaterClock(panel);
    };
    panel.stop = () => {
        if (mountedPhWaterPanels.get(host) === panel) mountedPhWaterPanels.delete(host);
        unobserve();
        clearTimeout(panel.clock);
        document.removeEventListener('visibilitychange',startClock);
    };
    document.addEventListener('visibilitychange',startClock);
    paintPhWaterPanel(panel);
    if (typeof syncGlobalHeaderChrome === 'function') syncGlobalHeaderChrome({reason:'park-hill-water',force:true});
    startClock();
    syncPhWaterRefresh();
}
