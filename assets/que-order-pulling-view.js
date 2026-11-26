function renderBloomscapesOrderCardLayout({name, size, identity, photo, badges, strip, metrics, actions, details = ''}) {
    const title = String(name || 'Unknown').replace(/\\+'/g, "'");
    return `<div class="app-drive-card-grid app-drive-card-grid--no-actions flex-grow">
        <div class="app-drive-card-photo">${photo}</div>
        <div class="app-drive-card-main">
            <div class="app-drive-card-header">
                <div class="app-drive-card-title">${escapeHtml(title)} <span class="app-drive-card-title-size">${escapeHtml(size || '—')}</span></div>
                <div class="app-drive-card-itemcode">${escapeHtml(identity.join(' · '))}</div>
                ${badges}
            </div>
            <div class="app-suspend-tag-order-strip" data-compact-order-strip>${escapeHtml(strip)}</div>
            <div class="app-drive-card-quantity-band">${metrics}</div>
            ${actions ? `<div class="bloomscapes-order-card-actions">${actions}</div>` : ''}
            ${details}
        </div>
    </div>`;
}

const orderPullButtonClass = 'rounded-full border border-emerald-500 px-3 py-1.5 text-xs font-semibold whitespace-nowrap';

function orderPullButton(label, action, key = '', disabled = false) {
    return '<button type="button" class="'+orderPullButtonClass+'" data-pull-action="'+action
        +'" data-pull-key="'+escapeHtml(key)+'"'+(disabled ? ' disabled' : '')+'>'+escapeHtml(label)+'</button>';
}

function orderPullEvidence(row) {
    const {itemcode,locationcode,lotcode,warehouse} = row;
    const identity = {ITEMCODE:itemcode,LOCATIONCODE:locationcode,LOTCODE:lotcode,WAREHOUSEID:warehouse};
    const inventory = resolveCanonicalInventoryRow(identity) || {...identity,PTRONHAND:row.onhand,
        LOC_MATCH_QTY:row.av_photo_match,PHOTO_LINK:row.av_photo_links,PHOTO_DATE:row.av_photo_date,
        PHOTO_EXPIRES_AT:row.av_photo_expires_at};
    return {inventory,photos:currentCanonicalAvPhotoUrls(inventory)};
}

function orderPullBayLocation(row) {
    const location = String(row.locationcode || '—');
    const bay = String(row.bay_number ?? '').trim() || location.match(/\.(\d{3})$/)?.[1];
    return bay ? `${location} · Bay ${bay}` : location;
}

function orderPullThumbnail(row, photos) {
    if (!photos.length) return '<span class="app-inline-thumb-box app-inline-thumb-box--empty">No Photo</span>';
    const image = buildDeferredCardPhotoImg(getDirectImageUrl(photos[0], 'card-feature'), {alt:'Inventory photo'});
    return `<button type="button" data-pull-action="photo" data-pull-key="${escapeHtml(row.pull_tag_id)}"
        aria-label="View inventory photo" class="app-inline-thumb-column"><span class="app-inline-thumb-box">${image}</span></button>`;
}

function orderPullCard(row, buggy) {
    const {inventory,photos} = orderPullEvidence(row);
    const ready = buggy && row.buggy_id === buggy.buggy_id && row.pull_status === 'claimed' && row.priority < 5;
    const action = ready ? orderPullButton('✓ Pulled onto Buggy','pull',row.pull_tag_id) : '';
    const status = row.pull_status === 'on_buggy' ? 'Pulled' : row.pull_status === 'claimed' ? 'Assigned' : 'Queued';
    const metrics = buildInventoryQuantityChipsHtml(inventory,{layout:'row',compact:true,canonical:true,sourceView:'order-pulling',
        locationMetricItem:inventory,preserveUnknown:true});
    const dock = formatDockViewDockLabel(row.dock);
    const trip = row.trip_total > 1 ? ` · Trip ${row.trip_index}/${row.trip_total}` : '';
    const note = [row.spec,row.pick_note,row.dock_status,row.consignee,row.plan_start_date].filter(Boolean).join(' · ');
    const layout = renderBloomscapesOrderCardLayout({
        name:row.common_name || row.itemcode,size:row.container_size,
        identity:[row.itemcode,orderPullBayLocation(row),row.lotcode || '—'],
        photo:orderPullThumbnail(row,photos),badges:buildEvalOwnerBadge(inventory),
        strip:`${dock} · Drop ${row.stopnumber} · Pull Qty ${row.pull_qty} (${Number(row.wingdingunits)} WDU)${trip}`,
        metrics,actions:action,details:`<p class="bloomscapes-order-card-note">${escapeHtml([status,note].filter(Boolean).join(' · '))}</p>`
    });
    return bloomscapesListNode(`<article data-order-pull-tag="${escapeHtml(row.pull_tag_id)}"
        class="app-smart-card app-drive-compact-card app-shared-drive-layout bloomscapes-order-card">${layout}</article>`);
}

function openOrderPullPhoto(receipt, key, trigger) {
    const row = receipt?.rows.find(entry => entry.pull_tag_id === key);
    if (row) openAvPhotoViewer(orderPullEvidence(row).photos,row.common_name,0,trigger);
}

function orderPullUnloadMarkup(receipt) {
    const groups = orderPullUnloadStops(receipt);
    if (!groups.length) return '';
    const wdu = Number(receipt.buggy.current_wdu);
    return '<div class="space-y-2 rounded-lg border border-emerald-500 p-3"><strong>'
        +(wdu === 650 ? 'Full Buggy (650 WDU)' : 'Buggy ready to unload ('+wdu+' WDU)')+'</strong>'
        +groups.map((stop,index) => '<div class="flex flex-wrap items-center gap-2" data-order-pull-stop>'
            +'<span>Dock '+escapeHtml(stop.dock)+' · Drop / Stop '+escapeHtml(stop.stopnumber)+'</span>'
            +orderPullButton('Drop Off','drop_off',String(index),groups[index-1]?.dock === stop.dock)
            +'</div>').join('')+'</div>';
}

function paintOrderPullToolbar(host, state) {
    const buggy = state.receipt?.buggy;
    const unit = state.receipt?.unit_number;
    const partner = state.receipt?.partner;
    const crew = unit ? 'Unit #'+escapeHtml(unit)+' · Partner: '+escapeHtml(partner || '—') : '';
    const all = state.supervisor ? 'All Assigned' : 'All Queue';
    host.innerHTML = '<span class="'+orderPullButtonClass+'" aria-live="polite" title="'+crew+'">Buggy: '
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
    const scrollRoot = host.closest('#main-scroll-area');
    mountBloomscapesScrollWindow(list,rows,{size:20,estimate:220,scrollRoot,mount:(section,items) => {
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
