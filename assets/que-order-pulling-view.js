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
    host.innerHTML = '<span class="'+orderPullButtonClass+'" aria-live="polite">🛺 Buggy: '
        +Number(buggy?.current_wdu || 0)+' / 650 WDU</span>'
        +orderPullButton('My Buggy','mode','buggy')+orderPullButton('All Queue','mode','all');
    host.querySelector('[data-pull-key="'+state.mode+'"]').setAttribute('aria-pressed','true');
}

function paintOrderPullQueue(host, state) {
    const receipt = state.receipt;
    const rows = orderPullRows(receipt,state.mode,state.query);
    host.querySelector('[data-order-pull-summary]').innerHTML = orderPullUnloadMarkup(receipt)
        +(receipt && !receipt.buggy ? orderPullButton('Get Next Buggy','deal') : '');
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
        const active = canOpenOrderPullQueue() && nativeAuthProfile?.department === '161';
        orderPullQueueState = {owner,active,mode:'buggy',query:'',receipt:null,error:'',pending:null};
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
    const count = orderPullState().receipt?.rows.length ?? 0;
    return [...choices,[ORDER_PULL_TAB,'Order Pulling ('+formatRequestTabCount(count)+')']];
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
