const orderPullButtonClass = 'rounded-full border border-emerald-500 px-3 py-1.5 text-xs font-semibold whitespace-nowrap';

function orderPullButton(label, action, key = '', disabled = false) {
    return '<button type="button" class="'+orderPullButtonClass+'" data-pull-action="'+action
        +'" data-pull-key="'+esc(key)+'"'+(disabled ? ' disabled' : '')+'>'+esc(label)+'</button>';
}

function orderPullPhotos(row) {
    const identity = {ITEMCODE:row.itemcode,LOCATIONCODE:row.locationcode,LOTCODE:row.lotcode,WAREHOUSEID:row.warehouse};
    const inventory = resolveCanonicalInventoryRow(identity) || {...identity,PTRONHAND:row.onhand,
        LOC_PHOTO_MATCH:row.av_photo_match,PHOTO_LINK:row.av_photo_links,PHOTO_DATE:row.av_photo_date,
        PHOTO_EXPIRES_AT:row.av_photo_expires_at};
    return currentCanonicalAvPhotoUrls(inventory);
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
        +'<p class="text-sm"><strong>On Hand</strong> '+esc(String(row.onhand ?? '—'))
        +' · <strong>Qty Ordered</strong> '+esc(String(row.quantityordered ?? '—'))
        +' · <strong>Pull qty</strong> '+row.pull_qty+' · '+Number(row.wingdingunits)+' WDU'+trip+'</p>'
        +'<p class="text-sm"><strong>Dock '+esc(row.dock)+' · Stop '+esc(row.stopnumber)+'</strong> · '
        +esc(row.dock_status || '—')+'</p><p class="text-sm">Consignee '+esc(row.consignee || '—')
        +(row.unit_number ? ' · Unit #'+esc(row.unit_number) : '')+'</p>'
        +'<p class="text-sm">Spec '+esc(row.spec || '—')+' · Pick Note '+esc(row.pick_note || '—')+'</p>'
        +'<p class="flex flex-wrap items-center gap-2 text-xs"><span class="'+orderPullButtonClass+'">Plan Start '
        +orderPullWeekday(row.plan_start_date)+'</span>'+status+'</p><div class="flex flex-wrap gap-2">'+photo+action+'</div></article>');
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
        +(wdu === 650 ? 'Full Buggy (650 WDU)' : 'Buggy ready to unload ('+wdu+' WDU)')+'</strong>'
        +groups.map((stop,index) => '<div class="flex flex-wrap items-center gap-2" data-order-pull-stop>'
            +'<span>Dock '+esc(stop.dock)+' · Drop / Stop '+esc(stop.stopnumber)+'</span>'
            +orderPullButton('Drop Off','drop_off',String(index),groups[index-1]?.dock === stop.dock)
            +'</div>').join('')+'</div>';
}

function paintOrderPullToolbar(host, state) {
    const buggy = state.receipt?.buggy;
    const unit = state.receipt?.unit_number;
    const partner = state.receipt?.partner;
    const title = unit ? 'Unit #'+esc(unit)+' · Partner: '+esc(partner || '—')+' · ' : 'Buggy: ';
    const all = state.supervisor ? 'All Assigned / Active Queue' : 'All Queue';
    host.innerHTML = '<span class="'+orderPullButtonClass+'" aria-live="polite">🛺 '+title
        +Number(buggy?.current_wdu || 0)+' / 650 WDU</span>'
        +(state.teamOnly ? orderPullButton('Refresh Assigned Batch','list')
            : orderPullButton('My Buggy','mode','buggy')+orderPullButton(all,'mode','all'));
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

function phPullLoadGroups(rows,receipt) {
    const groups = new Map();
    for (const row of rows) {
        const id = row.buggy_id || '';
        if (!groups.has(id)) groups.set(id,[]);
        groups.get(id).push(row);
    }
    const output = [];
    for (const [id,visible] of groups) {
        if (!id) {
            output.push(...visible.map(row => ({row})));
            continue;
        }
        const route = receipt.load_routes?.[id];
        const manifest = route?.load_manifest || receipt.rows.filter(row => row.buggy_id === id);
        const load = phEstimateBuggyLoad(manifest,{origin:route?.load_origin,hasPartner:route?.has_partner ?? Boolean(receipt.partner)});
        const stops = load?.rows || phSortPullStops(manifest);
        const positions = new Map(stops.map((row,index) => [row.pull_tag_id,index+1]));
        const ordered = [...visible].sort((a,b) => positions.get(a.pull_tag_id)-positions.get(b.pull_tag_id));
        output.push(...ordered.map((row,index) => ({
            row,stop:positions.get(row.pull_tag_id),total:stops.length,header:index === 0,load
        })));
    }
    return output;
}

function phPullLoadHeading(entry) {
    const header = document.createElement('header');
    header.className = 'ph-pull-load-heading';
    header.dataset.phLoadHeader = entry.row.buggy_id;
    const title = document.createElement('strong');
    title.textContent = entry.row.unit_number ? 'Buggy load · Unit '+entry.row.unit_number : 'Buggy load';
    header.append(title);
    if (entry.load) header.insertAdjacentHTML('beforeend',phBuggyMetricPills(entry.load));
    else header.append(' · Estimate unavailable for this route.');
    return header;
}

function paintPhPullStop(card,entry) {
    if (!card || card.dataset.orderPullTag !== entry.row.pull_tag_id) return;
    if (entry.stop) {
        const label = document.createElement('strong');
        label.className = 'ph-pull-stop';
        label.textContent = 'STOP '+entry.stop+' OF '+entry.total;
        const side = phPullSideLabel(entry.row);
        if (side) label.textContent += ' · Pull Side: '+side;
        card.prepend(label);
    }
    if (entry.header) card.before(phPullLoadHeading(entry));
}

function phPullLoadWindow(rows,mount,receipt) {
    if (receipt?.warehouse !== '10-PH') return {rows,mount};
    const entries = phPullLoadGroups(rows,receipt);
    return {rows:entries,mount(section,items) {
        mount(section,items.map(entry => entry.row));
        const cards = section.querySelectorAll('[data-order-pull-tag]');
        items.forEach((entry,index) => paintPhPullStop(cards[index],entry));
    }};
}

if (typeof customElements !== 'undefined' && !customElements.get('ph-order-pulling-loads')) {
    customElements.define('ph-order-pulling-loads',class extends HTMLElement {
        prepareScrollWindow(rows,mount) {
            const receipt = getBloomscapesFarm() === '10-PH' && orderPullState().receipt;
            return phPullLoadWindow(rows,mount,receipt);
        }
    });
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
        const supervisor = phPullSupervisorAllowed(nativeAuthProfile,getBloomscapesFarm(),borrowedHelpPreview());
        const active = canOpenOrderPullQueue() && (teamOnly || nativeAuthProfile?.department === '161');
        orderPullQueueState = {owner,active,teamOnly,supervisor,mode:supervisor?'all':'buggy',query:'',receipt:null,error:'',pending:null};
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

function syncOrderPullFarmScope() {
    if (getCurrentVisibleViewId() !== 'request') return;
    renderOrderPullQueueShell();
    syncQueActiveCategory();
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
    if (button.dataset.pullAction === 'drop_off') return orderPullUnloadStops(state.receipt)[Number(key)];
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
        if (action === 'deal') state.mode = 'buggy';
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
