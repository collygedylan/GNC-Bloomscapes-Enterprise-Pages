const orderPullButtonClass = 'rounded-full border border-emerald-500 px-3 py-1.5 text-xs font-semibold whitespace-nowrap';

function orderPullButton(label, action, key = '') {
    return '<button type="button" class="'+orderPullButtonClass+'" data-pull-action="'+action
        +'" data-pull-key="'+esc(key)+'">'+esc(label)+'</button>';
}

function orderPullPhotos(row) {
    const identity = {ITEMCODE:row.itemcode,LOCATIONCODE:row.locationcode,LOTCODE:row.lotcode,WAREHOUSEID:row.warehouse};
    return currentCanonicalAvPhotoUrls(resolveCanonicalInventoryRow(identity));
}

function orderPullWeekday(value) {
    return value ? new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})
        .format(new Date(value+'T00:00:00Z')) : '—';
}

function orderPullCard(row, buggy) {
    const own = buggy && row.buggy_id === buggy.buggy_id;
    const photos = orderPullPhotos(row);
    const photo = photos.length ? orderPullButton('AV Photo','photo',row.pull_tag_id) : '';
    const title = esc([row.common_name || row.itemcode,row.container_size].filter(Boolean).join(' · '));
    const trip = row.trip_total > 1 ? ' · Trip '+row.trip_index+'/'+row.trip_total : '';
    const action = own && row.pull_status === 'claimed' && row.priority < 5
        ? orderPullButton('✓ Pulled onto Buggy','pull',row.pull_tag_id) : '';
    const status = row.pull_status === 'on_buggy' ? 'Pulled' : row.pull_status === 'claimed' ? 'Assigned' : 'Queued';
    return bloomscapesListNode('<article data-order-pull-tag="'+esc(row.pull_tag_id)
        +'" class="space-y-2 rounded-xl border border-emerald-700 bg-emerald-950 p-3 text-white">'
        +'<h3 class="font-bold">'+title+'</h3><p class="text-sm">'+esc(row.itemcode)+'</p>'
        +'<p class="text-sm"><strong>Pick location · Lot</strong> '+esc(row.locationcode+' · '+row.lotcode)+'</p>'
        +'<p class="text-sm"><strong>Pull qty</strong> '+row.pull_qty+' · '+Number(row.wingdingunits)+' WDU'+trip+'</p>'
        +'<p class="text-sm"><strong>Dock '+esc(row.dock)+' · Stop '+esc(row.stopnumber)+'</strong> · '
        +esc(row.dock_status || 'Blank')+'</p><p class="text-xs">Plan start '+orderPullWeekday(row.plan_start_date)
        +' · '+status+'</p><div class="flex flex-wrap gap-2">'+photo+action+'</div></article>');
}

function openOrderPullPhoto(receipt, key, trigger) {
    const row = receipt?.rows.find(entry => entry.pull_tag_id === key);
    if (row) openAvPhotoViewer(orderPullPhotos(row),row.common_name,0,trigger);
}

function orderPullUnloadMarkup(receipt) {
    const groups = orderPullUnloadStops(receipt);
    if (!groups.length) return '';
    const wdu = Number(receipt.buggy.current_wdu);
    return '<div class="space-y-2 rounded-lg border border-emerald-500 p-3"><strong>'
        +(wdu === 650 ? '🏁 Full Buggy (650 WDU)' : '🏁 Buggy ready to unload ('+wdu+' WDU)')
        +'</strong><div class="flex flex-wrap gap-2">'
        +groups.map((stop,index) => orderPullButton('✓ Unloaded at Dock '+stop.dock+' · Stop '+stop.stopnumber
            +(stop.tripnumber ? ' · '+stop.tripnumber : ''),'unload',String(index))).join('')
        +'</div></div>';
}

function paintOrderPullToolbar(host, state) {
    const buggy = state.receipt?.buggy;
    const unit = state.receipt?.unit_number;
    host.innerHTML = '<span class="'+orderPullButtonClass+'" aria-live="polite">🛺 '+(unit ? 'Unit '+esc(unit) : 'Buggy')+': '
        +Number(buggy?.current_wdu || 0)+' / 650 WDU</span>'
        +(state.teamOnly ? orderPullButton('Refresh Assigned Batch','list')
            : orderPullButton('My Buggy','mode','buggy')+orderPullButton('All Queue','mode','all'));
    host.querySelector('[data-pull-key="'+state.mode+'"]')?.setAttribute('aria-pressed','true');
}

function paintOrderPullQueue(host, state) {
    const receipt = state.receipt;
    const rows = orderPullRows(receipt,state.mode,state.query);
    host.querySelector('[data-order-pull-summary]').innerHTML = orderPullUnloadMarkup(receipt)
        +(receipt && !receipt.buggy && !state.teamOnly ? orderPullButton('Get Next Buggy','deal') : '');
    host.querySelector('[role="status"]').textContent = state.error || (state.pending ? 'Loading order pulls…'
        : rows.length ? '' : state.query ? 'No pulls match this search.' : 'No active pulls in this view.');
    const list = host.querySelector('[data-order-pull-list]');
    mountBloomscapesScrollWindow(list,rows,{size:20,estimate:204,mount:(section,items) => {
        mountChunkedList(section,items,row => orderPullCard(row,receipt.buggy));
    }});
}

let orderPullQueueState;

function canOpenOrderPullQueue() {
    if (typeof nativeAuthSessionActive === 'undefined' || !nativeAuthSessionActive) return false;
    const profile = nativeAuthProfile;
    const access = window.GncUserAccessControl?.state?.userAccess?.find(row =>
        row.username === profile?.username && (!row.profile_id || row.profile_id === profile.id));
    return orderPullEligible(profile,access,getBloomscapesFarm(),borrowedHelpPreview());
}

function orderPullState() {
    const owner = getSupabaseReadIdentityScope();
    if (orderPullQueueState?.owner !== owner) {
        const teamOnly = isParkHillOrderPuller();
        const active = canOpenOrderPullQueue() && (teamOnly || nativeAuthProfile?.department === '161');
        orderPullQueueState = {owner,active,teamOnly,mode:'buggy',query:'',receipt:null,error:'',pending:null};
    }
    return orderPullQueueState;
}

function isOrderPullQueueActive() {
    return canOpenOrderPullQueue() && orderPullState().active;
}

function queueOrderPullSearch(value) {
    const state = orderPullState();
    if (value === undefined) return state.query;
    state.query = String(value || '');
    redrawOrderPullQueue(state);
    return false;
}

function withOrderPullCategory(choices) {
    if (!canOpenOrderPullQueue()) return choices;
    const state = orderPullState();
    const count = state.receipt?.rows.length ?? 0;
    return [...(state.teamOnly ? [] : choices),[ORDER_PULL_TAB,'Order Pulling ('+formatRequestTabCount(count)+')']];
}

function selectQueueOrderPullCategory(tab) {
    const state = orderPullState();
    state.active = tab === ORDER_PULL_TAB && canOpenOrderPullQueue();
    if (renderOrderPullQueueShell()) return true;
    return setReqTab(tab);
}

function orderPullHosts() {
    return {
        view:document.getElementById('view-request'),
        host:document.getElementById('request-order-pulling'),
        toolbar:document.getElementById('request-order-pulling-tools')
    };
}

function renderOrderPullQueueShell() {
    const {view,host,toolbar} = orderPullHosts();
    if (!view || !host || !toolbar) return false;
    const active = isOrderPullQueueActive();
    const state = orderPullState();
    const opening = active && (host.hidden || state.navigation !== navTransitionSeq);
    host.hidden = toolbar.hidden = !active;
    view.dataset.orderPulling = String(active);
    if (!active) return false;
    state.navigation = navTransitionSeq;
    host.onclick = toolbar.onclick = event => dispatchOrderPullClick(state.owner,event.target);
    syncRequestHeaderSearchChrome({forceHeader:opening});
    renderRequestCategoryToolbar({});
    if (opening || !state.receipt && !state.error) void runOrderPullCommand(state,'list');
    redrawOrderPullQueue(state);
    return true;
}

function redrawOrderPullQueue(state) {
    const {host,toolbar} = orderPullHosts();
    if (!host || !toolbar || host.hidden || getCurrentVisibleViewId() !== 'request') return;
    paintOrderPullToolbar(toolbar,state);
    paintOrderPullQueue(host,state);
}

function orderPullClickInput(state, button) {
    const key = button.dataset.pullKey;
    if (button.dataset.pullAction === 'pull') {
        return state.receipt?.buggy && {buggy_id:state.receipt.buggy.buggy_id,tag_id:key};
    }
    if (button.dataset.pullAction === 'unload') return orderPullUnloadStops(state.receipt)[Number(key)];
    return {};
}

function dispatchOrderPullClick(owner, target) {
    const button = target.closest('[data-pull-action]');
    const state = orderPullState();
    if (!button || owner !== state.owner || !isOrderPullQueueActive()) return;
    const action = button.dataset.pullAction;
    if (action === 'mode') {
        state.mode = button.dataset.pullKey;
        redrawOrderPullQueue(state);
        return;
    }
    if (action === 'photo') return openOrderPullPhoto(state.receipt,button.dataset.pullKey,button);
    const input = orderPullClickInput(state,button);
    if (!input || state.pending) return;
    button.disabled = true;
    void runOrderPullCommand(state,action,input).finally(() => { button.disabled = false; });
}

async function runOrderPullCommand(state, action, input = {}) {
    if (state.pending) return;
    state.error = '';
    try {
        state.pending = requestOrderPull(action,input);
        const receipt = await state.pending;
        if (orderPullState() !== state) return;
        state.receipt = receipt;
        if (action === 'deal' || action === 'unload') state.mode = 'buggy';
    } catch (error) {
        if (orderPullState() === state) state.error = error.message || 'Order Pulling could not load.';
    } finally {
        state.pending = null;
        if (orderPullState() === state && isOrderPullQueueActive() && getCurrentVisibleViewId() === 'request') {
            redrawOrderPullQueue(state);
            syncQueActiveCategory();
        }
    }
}

const PH_WORK_RPC = 'gnc_ph_pull_work_v1';

function canBuildPhOrderPullWork() {
    return nativeAuthSessionActive && nativeAuthProfile?.username === currentUser
        && phPullSupervisorAllowed(nativeAuthProfile,getBloomscapesFarm(),borrowedHelpPreview());
}

function phWorkDraft(team) {
    return {id:team?.team_id || '',unit:team?.unit_number || '',
        primary:team?.puller_primary || '',helper:team?.puller_helper || ''};
}

function phWorkVisibleRows(state) {
    return state.snapshot.rows.filter(row => matchesBloomscapesModuleSearch(state.search.value,
        [row.common_name,row.container_size,row.itemcode,row.locationcode,row.lotcode,row.dock,row.stopnumber]));
}

function phWorkScopeIsCurrent(state) {
    return state.root.isConnected && canBuildPhOrderPullWork()
        && getSupabaseReadIdentityScope() === state.owner;
}

function changePhWorkInput(state,control) {
    if (!phWorkScopeIsCurrent(state)) return;
    if (control.matches('[data-ph-view]')) {
        state.root.querySelector('[data-ph-pool]').hidden = control.value === 'teams';
    }
    if (control.dataset.phTag) {
        if (!phPullToggleTag(state.snapshot.rows,state.selected,control.dataset.phTag)) {
            control.checked = false;
            state.status.textContent = 'The batch cannot exceed 650 WingDingUnits.';
        } else state.status.textContent = '';
    }
    if (control.dataset.phField) {
        state.draft[control.dataset.phField] = control.value;
        if (control.dataset.phField === 'primary') {
            if (state.draft.helper === control.value) state.draft.helper = '';
            paintPhWorkTeams(state);
            state.root.querySelector('[data-ph-field="primary"]').focus();
        }
    }
    paintPhWorkSelection(state);
}

function phWorkTeamCommand(state,action,target) {
    const id = action === 'release' ? target.dataset.teamId : state.draft.id;
    const existing = state.snapshot.teams.find(team => team.team_id === id);
    const base = existing ? {p_team:id,p_expected:existing.updated_at} : {};
    if (action === 'release') return ['release_ph_puller_buggy_team_v1',base];
    if (!state.draft.unit || !state.draft.primary) throw new Error('Select a unit and primary puller.');
    const rpc = existing ? 'update_or_swap_ph_puller_buggy_team_v1' : 'assign_ph_puller_buggy_team_v1';
    return [rpc,{...base,p_unit:state.draft.unit,p_primary:state.draft.primary,p_helper:state.draft.helper || null}];
}

function phWorkDispatchCommand(state) {
    const id = state.root.querySelector('[data-ph-dispatch-team]').value;
    const team = state.snapshot.teams.find(row => row.team_id === id);
    if (!team || !state.selected.size) throw new Error('Select an active team and at least one pull tag.');
    return [PH_WORK_RPC,{p_team:id,p_expected:team.updated_at,p_tags:[...state.selected]}];
}

function planPhWorkCommand(state,action,target) {
    if (action === 'refresh') return [PH_WORK_RPC];
    if (action === 'dispatch') return phWorkDispatchCommand(state);
    if (action === 'save' || action === 'release') return phWorkTeamCommand(state,action,target);
    return null;
}

async function applyPhWorkCommand(state,action,rpc,input) {
    try {
        state.pending = requestPhPullWork(rpc,input);
        state.status.textContent = 'Updating Park Hill work…';
        paintPhWorkState(state,phWorkVisibleRows(state));
        const receipt = await state.pending;
        if (!phWorkScopeIsCurrent(state)) return;
        if (rpc === PH_WORK_RPC) state.snapshot = receipt;
        else await applyPhWorkTeamChange(state,receipt.team);
        state.selected = new Set(state.snapshot.rows.map(row => row.pull_tag_id).filter(id => state.selected.has(id)));
        if (action === 'dispatch') state.selected.clear();
        state.status.textContent = action === 'dispatch' ? 'Batch assigned.' : '';
    } catch (error) {
        if (phWorkScopeIsCurrent(state)) state.status.textContent = error.message || 'Park Hill work could not be updated.';
    } finally {
        state.pending = null;
        if (phWorkScopeIsCurrent(state)) paintPhWorkState(state,phWorkVisibleRows(state));
    }
}

async function applyPhWorkTeamChange(state,team) {
    const others = state.snapshot.teams.filter(row => row.team_id !== team.team_id);
    const prior = state.snapshot.teams.find(row => row.team_id === team.team_id);
    state.snapshot.teams = team.active ? [...others,{...team,batch_open:prior?.batch_open}] : others;
    state.draft = phWorkDraft();
    paintPhWorkState(state,phWorkVisibleRows(state));
    if (!team.active) {
        const receipt = await requestPhPullWork(PH_WORK_RPC);
        if (phWorkScopeIsCurrent(state)) state.snapshot = receipt;
    }
}

function dispatchPhWorkClick(state,event) {
    const target = event.target.closest('[data-ph-action]');
    if (!target || !phWorkScopeIsCurrent(state) || state.pending) return;
    const action = target.dataset.phAction;
    try {
        const command = planPhWorkCommand(state,action,target);
        if (command) return void applyPhWorkCommand(state,action,...command);
    } catch (error) {
        state.status.textContent = error.message;
        return;
    }
    if (action === 'auto') {
        state.selected = phPullGroupBatch(phWorkVisibleRows(state));
        state.status.textContent = '';
        paintPhWorkRows(state,phWorkVisibleRows(state));
        return;
    }
    const team = action === 'edit' && state.snapshot.teams.find(row => row.team_id === target.dataset.teamId);
    state.draft = phWorkDraft(team || null);
    paintPhWorkTeams(state);
    state.root.querySelector('[data-ph-field="unit"]').focus();
}

function mountPhBuildWorkOrderPulling(host) {
    if (!canBuildPhOrderPullWork()) return;
    host.innerHTML = phWorkMarkup();
    const root = host.firstElementChild;
    const state = {root,owner:getSupabaseReadIdentityScope(),selected:new Set(),draft:phWorkDraft(),
        snapshot:{rows:[],teams:[],units:[],pullers:[]},search:root.querySelector('[data-ph-work-search]'),
        status:root.querySelector('[data-ph-status]')};
    root.addEventListener('click',event => dispatchPhWorkClick(state,event));
    root.addEventListener('change',event => changePhWorkInput(state,event.target));
    state.search.addEventListener('input',() => {
        if (phWorkScopeIsCurrent(state)) paintPhWorkRows(state,phWorkVisibleRows(state));
    });
    syncGlobalHeaderChrome({reason:'park-hill-build-work',force:true});
    void applyPhWorkCommand(state,'refresh',PH_WORK_RPC);
}
