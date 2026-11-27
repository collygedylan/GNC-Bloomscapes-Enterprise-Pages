let phWorkDockSubscription;

function phAcceptWorkSnapshot(state,receipt) {
    const pending = state.dockChanges;
    let rows = receipt.rows;
    const revision = Number(receipt.dock_revision) || 0;
    for (const [key,change] of pending) {
        if (!change.revision || Number(change.revision) <= revision) pending.delete(key);
        else rows = phApplyDockPriority(rows,change);
    }
    state.dockRevision = Math.max(state.dockRevision,revision);
    state.snapshot = {...receipt,rows};
    state.selected = new Set(rows.filter(row => state.selected.has(row.pull_tag_id)).map(row => row.pull_tag_id));
}

function phObserveWorkDock(state,isCurrent,paint,refresh) {
    phWorkDockSubscription?.abort();
    const controller = new AbortController();
    phWorkDockSubscription = controller;
    const mounted = new WeakRef(state);
    phPullDockStatusEvents.addEventListener('commit',event => {
        const current = mounted.deref();
        if (!current?.root.isConnected) return controller.abort();
        if (event.detail.identity !== current.owner || !isCurrent(current)) return;
        const change = event.detail.change;
        const revision = Number(change?.revision) || 0;
        if (revision && revision <= current.dockRevision) return;
        if (change) {
            if (revision) {
                current.dockRevision = revision;
                current.dockChanges.set(JSON.stringify([change.dock,change.trip]),change);
            }
            current.snapshot.rows = phApplyDockPriority(current.snapshot.rows,change);
            paint(current);
        }
        refresh(current);
    },{signal:controller.signal});
    if (typeof connectBatteryRealtime === 'function') connectBatteryRealtime();
}

const phPullBlockedTrip = new Set(['HOLD','HOLD TRAILER','DO NOT PULL','COMPLETE']);

function phConfirmedDockStatus(row,change) {
    if (typeof change.effective === 'string') return change.effective;
    const status = String(change.status || '').trim();
    if (change.kind === 'trip') return phPullBlockedTrip.has(status.toUpperCase()) || status === 'Live Driver' ? status : null;
    if (phPullBlockedTrip.has(String(row.dock_status).toUpperCase())) return null;
    if (change.truck === 'live') return 'Live Driver';
    return change.truck === 'trailer' ? 'Drop Trailer' : null;
}

function phDockStatusRank(status) {
    const value = String(status).trim().toUpperCase();
    if (['LIVE DRIVER','DRIVER WAITING','LOADING NOW','LOADING'].includes(value)) return 1;
    if (['DROP TRAILER','READY','STAGE'].includes(value)) return 2;
    return value === 'HOLD TRAILER' ? 4 : 3;
}

function phApplyDockPriority(rows,change) {
    const dock = phDockNumber(change?.dock);
    if (!dock || !change.trip) return rows;
    const updated = [];
    for (const row of rows) {
        if (phDockNumber(row.dock) !== dock || String(row.tripnumber) !== String(change.trip)) {
            updated.push(row);
            continue;
        }
        const status = phConfirmedDockStatus(row,change);
        if (status == null) updated.push(row);
        else if (!['HOLD','DO NOT PULL','COMPLETE'].includes(status.toUpperCase())) {
            const priority = phDockStatusRank(status);
            updated.push({...row,dock_status:status,priority});
        }
    }
    return updated;
}

const phLoadButtonClass = 'rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold';

/**
 * @param {HTMLElement} root Dispatch panel.
 * @returns {void}
 */
function mountPhWorkLoadPanel(root) {
    root.querySelector('[data-ph-action="refresh"]').insertAdjacentHTML('afterend',
        '<button type="button" data-ph-action="toggle-auto" class="'+phLoadButtonClass+'" hidden></button>');
    root.querySelector('[data-ph-status]').insertAdjacentHTML('afterend',
        '<div data-ph-load-panel class="space-y-3" hidden>'
        +'<section data-ph-assigned-loads aria-labelledby="ph-assigned-loads-title"></section>'
        +'<section data-ph-queued-loads aria-labelledby="ph-queued-loads-title"></section></div>');
}

function phWorkLoadButton(action,label) {
    return '<button type="button" class="'+phLoadButtonClass+'" data-ph-action="'+action+'">'+label+'</button>';
}

function phWorkLoadTitle(load) {
    if (!load.team_id) return 'Queued Next Load '+esc(load.queue_position);
    return 'Unit '+esc(load.unit_number)+' · '+esc(load.puller_primary)
        +(load.puller_helper ? ' + '+esc(load.puller_helper) : '');
}

function phWorkLoadStops(rows) {
    return rows.map((row,index) => 'STOP '+(index+1)+' · '+esc(phQrPullLocation(row))).join(' → ');
}

function phWorkLoadCard(load) {
    const manifest = load.load_manifest;
    const estimate = phEstimateBuggyLoad(manifest,{origin:load.load_origin,hasPartner:load.has_partner ?? true});
    const wdu = manifest.reduce((sum,row) => sum+phPullTagWdu(row),0)/1e12;
    const identity = load.team_id
        ? 'data-ph-assigned-load="'+esc(load.buggy_id)+'"'
        : 'data-ph-queued-load="'+esc(load.queue_position)+'"';
    const urgent = manifest.some(row => phPullDockLabel(row.dock_status) === 'Live Driver');
    const controls = load.can_move ? '<div class="flex flex-wrap gap-2">'
        +phWorkLoadButton('open-swap','Swap Team')+phWorkLoadButton('unassign','Unassign')+'</div>'
        +'<div data-ph-swap-editor></div>' : '';
    return '<article class="min-w-0 rounded-lg border border-emerald-700 p-3 space-y-2" '+identity+'>'
        +'<strong>'+phWorkLoadTitle(load)+'</strong>'
        +(urgent ? '<div><b class="ph-live-driver">🚨 URGENT · LIVE DRIVER</b></div>' : '')
        +'<p>'+manifest.length+' Tags · '+esc(String(wdu))+' / '+PH_PULL_CAP+' WDU</p>'
        +(phBuggyMetricPills(estimate,2) || '<p>Estimate unavailable for this route.</p>')
        +'<p class="break-words">Stops: '+phWorkLoadStops(estimate?.rows ?? phSortPullStops(manifest))+'</p>'
        +controls+'</article>';
}

function phWorkLoadSection(title,id,loads,emptyText) {
    return '<h3 id="'+id+'" class="font-semibold mb-2">'+title+'</h3>'
        +(loads.length ? '<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">'
            +loads.map(phWorkLoadCard).join('')+'</div>' : '<p>'+emptyText+'</p>');
}

/**
 * @param {object} state Dispatch snapshot and panel root.
 * @returns {void}
 */
function paintPhWorkLoadPanel(state) {
    const {root,snapshot} = state;
    const panel = root.querySelector('[data-ph-load-panel]');
    if (!Array.isArray(snapshot.assigned_loads)) return;
    const assigned = snapshot.assigned_loads;
    const queued = snapshot.queued_loads;
    const toggle = root.querySelector('[data-ph-action="toggle-auto"]');
    const enabled = snapshot.auto_assign;
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.textContent = 'Auto-Assign: '+(enabled ? 'ON' : 'OFF');
    panel.hidden = root.querySelector('[data-ph-view]').value === 'teams';
    panel.querySelector('[data-ph-assigned-loads]').innerHTML = phWorkLoadSection(
        'Assigned Buggy Loads ('+assigned.length+' Active)','ph-assigned-loads-title',assigned,'No active buggy loads.');
    panel.querySelector('[data-ph-queued-loads]').innerHTML = phWorkLoadSection(
        'Queued / Unassigned ('+snapshot.rows.length+' Tags)','ph-queued-loads-title',queued,'No queued next loads.');
}

function phAssignedLoadFromControl(snapshot,control) {
    const card = control.closest('[data-ph-assigned-load]');
    const load = snapshot.assigned_loads?.find(row => row.buggy_id === card?.dataset.phAssignedLoad);
    return {card,load};
}

function phAvailableSwapTargets(snapshot,load) {
    const assigned = new Map(snapshot.assigned_loads.map(row => [row.team_id,row]));
    const eligible = new Set(snapshot.pullers);
    return snapshot.teams.filter(team => team.active !== false && team.team_id !== load.team_id
        && Number(team.unit_number) >= 205 && Number(team.unit_number) <= 234
        && eligible.has(team.puller_primary) && eligible.has(team.puller_helper)
        && (!team.batch_open || assigned.get(team.team_id)?.can_move));
}

/**
 * @param {object} state Current dispatch workspace.
 * @param {HTMLElement} control Swap control inside a load card.
 * @returns {void}
 */
function openPhWorkLoadSwap(state,control) {
    const {card,load} = phAssignedLoadFromControl(state.snapshot,control);
    if (!load?.can_move) return;
    const editor = card.querySelector('[data-ph-swap-editor]');
    const alreadyOpen = Boolean(editor.firstElementChild);
    for (const container of state.root.querySelectorAll('[data-ph-swap-editor]')) container.replaceChildren();
    if (alreadyOpen) return;
    const teams = phAvailableSwapTargets(state.snapshot,load);
    const options = teams.map(team => '<option value="'+esc(team.team_id)+'">Unit '+esc(team.unit_number)
        +' · '+esc(team.puller_primary)+(team.puller_helper ? ' + '+esc(team.puller_helper) : '')+'</option>').join('');
    editor.innerHTML = teams.length
        ? '<div class="flex flex-wrap gap-2 items-end"><label>Target Team<select data-ph-swap-target class="input-field w-full">'
            +'<option value="">Select a team</option>'+options+'</select></label>'
            +phWorkLoadButton('swap-team','Confirm Swap')+'</div>'
        : '<p>No available target teams.</p>';
    editor.querySelector('[data-ph-swap-target]')?.focus();
}

/**
 * @param {object} snapshot Current dispatch receipt.
 * @param {string} action Requested dispatch operation.
 * @param {HTMLElement} control Control for the selected load.
 * @returns {object|null} Dispatch command arguments.
 */
function planPhWorkLoadControl(snapshot,action,control) {
    if (action === 'toggle-auto') return {p_action:'set_auto',p_input:{enabled:!snapshot.auto_assign}};
    if (action !== 'swap-team' && action !== 'unassign') return null;
    const {card,load} = phAssignedLoadFromControl(snapshot,control);
    if (!load?.can_move) throw new Error('This load is no longer available to move.');
    const base = {buggy_id:load.buggy_id,team_id:load.team_id};
    if (action === 'unassign') return {p_action:'unassign',p_input:base};
    const target = card.querySelector('[data-ph-swap-target]').value;
    if (!phAvailableSwapTargets(snapshot,load).some(team => team.team_id === target)) throw new Error('Select a current target team.');
    const occupied = snapshot.assigned_loads.find(row => row.team_id === target);
    return {p_action:'swap',p_input:{...base,target_team_id:target,target_buggy_id:occupied?.buggy_id ?? null}};
}
