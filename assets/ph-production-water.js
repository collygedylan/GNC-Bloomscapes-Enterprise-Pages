
const phWaterOptions = [['request','Prober Request'],['schedule','Water Man Schedule'],['active','Active ON'],['all','All Blocks']];
const phWaterDurations = [15,30,45,60,90,120];

function phWaterMarkup() {
    return '<section data-ph-water><nav aria-label="Water views" data-ph-water-bar>'
        +phWaterOptions.map(([key,label]) => '<button type="button" data-ph-water-view="'+key+'">'+label+'</button>').join('')
        +'</nav><input type="search" class="ph-water-search" placeholder="Location or block" aria-label="Search water blocks" data-ph-water-search>'
        +'<form data-ph-water-request><label>Location or block<input name="location" required placeholder="D.31.000" autocomplete="off" list="ph-water-blocks"></label>'
        +'<datalist id="ph-water-blocks"></datalist><output data-ph-water-key></output>'
        +'<label>Run date<select name="day"><option value="tomorrow">Tomorrow</option><option value="today">Today</option></select></label>'
        +'<div class="ph-water-durations">'+phWaterDurations.map(minutes =>
            '<button type="button" data-ph-duration="'+minutes+'">'+minutes+'m</button>').join('')
        +'</div><label>Minutes<input name="minutes" type="number" inputmode="numeric" min="1" max="1440" required></label>'
        +'<label>Soil note<input name="note" maxlength="500"></label>'
        +'<button type="submit">💾 Save Water Request</button></form>'
        +'<div data-ph-water-cards></div><p role="status" data-ph-water-status></p></section>';
}

function phWaterLabel(row) {
    if (row.block_code === 'PROP') return 'Propagation';
    return 'Block '+row.block_code;
}

function phWaterCard(row,state) {
    const active = row.is_water_on;
    const requests = row.requests || [];
    const control = state.canEdit ? '<button type="button" data-ph-water-toggle="'+escapeHtml(row.block_code)+'"'
        +(state.pending ? ' disabled' : '')+'>'+(active ? '⏹ Turn Water OFF' : '💧 Turn Water ON')+'</button>' : '';
    const badge = active ? '<strong data-ph-water-clock="'+escapeHtml(row.block_code)+'"></strong>' : '';
    return '<article data-ph-water-card="'+escapeHtml(row.block_code)+'"><h4>'+phWaterLabel(row)+'</h4>'
        +badge+requests.map(request => '<p>'+escapeHtml(request.schedule_date)+' · Requested: '+request.requested_minutes
            +' min · Probed by '+escapeHtml(request.probed_by || '')+'</p>'
            +(request.prober_note ? '<p>'+escapeHtml(request.prober_note)+'</p>' : '')).join('')
        +control+'</article>';
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

function phWaterViewRows(rows,view,query) {
    const key = parseCanonicalBlockKey(query)?.block_code;
    const term = String(query || '').trim().toUpperCase();
    return rows.filter(row => (
        view === 'all' || row.is_water_on || view === 'schedule' && row.requests?.length
    ) && (!term || (key ? row.block_code === key : row.block_code.includes(term) || phWaterLabel(row).toUpperCase().includes(term))))
        .sort((a,b) => Number(b.is_water_on)-Number(a.is_water_on));
}

function paintPhWaterPanel(panel) {
    const {root,owner,form,search} = panel;
    const state = currentPhWaterState();
    if (!root.isConnected || state?.owner !== owner) return;
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
    form.querySelector('[type="submit"]').disabled = !state.canEdit || Boolean(state.pending);
    root.querySelector('datalist').innerHTML = rows.map(row => '<option value="'+escapeHtml(row.block_code)+'"></option>').join('');
    const matches = form.hidden ? phWaterViewRows(rows,panel.view,search.value) : [];
    root.querySelector('[data-ph-water-cards]').innerHTML = matches.map(row => phWaterCard(row,state)).join('');
    root.querySelector('[data-ph-water-status]').textContent = state.error || (!state.today ? 'Loading Park Hill Water…'
        : state.pending ? 'Saving…' : form.hidden && !matches.length ? 'No matching blocks.' : panel.message || '');
    paintPhWaterClocks(root,state);
}

function startPhWaterClock(panel) {
    const state = currentPhWaterState();
    if (!panel.root.isConnected || state?.owner !== panel.owner) {
        panel.stop();
        return;
    }
    if (document.hidden || getCurrentVisibleViewId() !== 'production') return;
    paintPhWaterClocks(panel.root,state);
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
    const state = currentPhWaterState();
    if (state?.owner !== panel.owner || !state.today) return;
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
    if (saved) panel.message = 'Water request saved for '+block+'.';
    else panel.view = 'request';
    paintPhWaterPanel(panel);
}

function clickPhWater(panel,event) {
    const target = event.target.closest('button');
    if (!target) return;
    const {phDuration,phWaterView,phWaterToggle} = target.dataset;
    if (phDuration) panel.form.elements.minutes.value = phDuration;
    if (phWaterView) {
        panel.view = phWaterView;
        panel.message = '';
        paintPhWaterPanel(panel);
    }
    if (phWaterToggle) {
        const state = currentPhWaterState();
        if (state?.owner !== panel.owner) return;
        const row = state.blockWaterStatus[phWaterToggle];
        if (row) void submitPhWaterCommand({location:phWaterToggle,on:!row.is_water_on});
    }
}

function mountPhProductionWater(host) {
    const state = currentPhWaterState();
    if (!state) return;
    host.innerHTML = phWaterMarkup();
    const root = host.firstElementChild;
    const form = root.querySelector('form');
    const search = root.querySelector('[data-ph-water-search]');
    const panel = {root,form,search,owner:state.owner,view:'request',message:'',clock:null};
    root.onclick = event => clickPhWater(panel,event);
    form.onsubmit = event => void savePhProberRequest(panel,event);
    form.elements.location.oninput = () => phWaterFormKey(form);
    search.oninput = () => paintPhWaterPanel(panel);
    const update = () => {
        if (!root.isConnected) return panel.stop();
        paintPhWaterPanel(panel);
    };
    const unobserve = observePhWaterUpdates(update);
    const startClock = () => {
        clearTimeout(panel.clock);
        startPhWaterClock(panel);
    };
    panel.stop = () => {
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

let stopPhWorkWater;
function phWorkDryRows(state) {
    const water = currentPhWaterState();
    const rows = state.snapshot.rows.filter(row => !isTagHiddenByActiveWater(row,water));
    const paused = state.root.querySelector('[data-ph-wet-paused]');
    const count = state.snapshot.rows.length-rows.length;
    if (paused) {
        paused.hidden = !count;
        paused.textContent = '💧 Wet-Block Paused: '+count;
    }
    return rows;
}

function watchPhWorkWater(state) {
    stopPhWorkWater?.();
    const mounted = new WeakRef(state);
    stopPhWorkWater = observePhWaterUpdates(() => {
        const current = mounted.deref();
        if (!current?.root.isConnected) return stopPhWorkWater();
        if (!phWorkScopeIsCurrent(current)) return;
        const allowed = new Set(phWorkDryRows(current).map(row => row.pull_tag_id));
        current.selected = new Set([...current.selected].filter(tag => allowed.has(tag)));
        paintPhWorkRows(current,phWorkVisibleRows(current));
        paintPhWorkSelection(current);
    });
    syncPhWaterRefresh();
}
