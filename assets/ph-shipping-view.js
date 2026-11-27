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

function phShippingOrderedQty(row) {
    return row.orderedqty ?? row.qty_ordered ?? row.quantityordered ?? null;
}

function phShippingTile(label,value,detail = '') {
    return '<div class="ph-shipping-tile"><small>'+esc(label)+'</small><strong>'+esc(String(value))+'</strong>'
        +(detail ? '<span>'+esc(detail)+'</span>' : '')+'</div>';
}

function phShippingStopCard(row,state) {
    const bay = phQrBayNumber(row.locationcode,row.bay_number);
    const drop = phQrPullDrop(row);
    const destination = drop || formatDockViewDockLabel(row.dock)+' · Drop '+row.stopnumber;
    const name = String(row.common_name || row.itemcode || '').replace(/\\+'/g,"'");
    const urgent = phPullDockLabel(row.dock_status) === 'Live Driver';
    const note = [row.spec && 'Spec · '+row.spec,row.pick_note && 'Pick note · '+row.pick_note].filter(Boolean);
    const manual = state.teamOnly && state.edit && row.pull_status === 'claimed' && Number(row.priority) < 5;
    return bloomscapesListNode('<article class="ph-shipping-stop" data-order-pull-tag="'+esc(row.pull_tag_id)+'">'
        +'<header class="app-drive-card-header"><div><b>'+esc([name,row.container_size].filter(Boolean).join(' '))+'</b>'
        +'<small>'+esc([row.itemcode,row.lotcode].filter(Boolean).join(' · '))+'</small></div><aside data-ph-stop-qr></aside></header>'
        +'<div class="ph-shipping-tiles">'+phShippingTile('Location','📍 '+(row.locationcode || '—'),Number(bay)>0 ? 'Bay '+bay : '')
        +phShippingTile('Ordered Qty (Pull)',phShippingOrderedQty(row) ?? '—',String(row.wingdingunits)+' WDU')
        +phShippingTile('Dock / Drop','🚚 '+destination,row.consignee)+'</div>'
        +(urgent ? '<b class="ph-live-driver">🚨 LIVE DRIVER</b>' : '')
        +note.map(line=>'<p>'+esc(line)+'</p>').join('')
        +(manual ? '<button type="button" data-pull-action="pull" data-pull-key="'+esc(row.pull_tag_id)+'">✓ Pulled onto Buggy</button>' : '')
        +'</article>');
}

function phShippingTelemetry(load) {
    if (!load) return '<small>Route estimate unavailable</small>';
    return '<small data-ph-load-metrics>⛽ '+load.fuelGal.toFixed(2)+' gal · ⏱️ Get: '+load.getLoadMin
        +'m · 📦 Unload ('+esc(load.dockLabel)+'): '+load.unloadMin+'m</small>';
}

function phShippingSummary(load,drill = true) {
    const route = load.route;
    const crew = [route.puller_primary,route.puller_helper].filter(Boolean).join(' + ');
    const heading = 'Unit '+(route.unit_number || '—');
    const weight = load.estimate?.totalWdu ?? Number(load.manifest.reduce((sum,r)=>sum+Number(r.wingdingunits),0).toFixed(3));
    const total = load.rows.every(row=>phShippingOrderedQty(row) != null)
        ? load.rows.reduce((sum,row)=>sum+Number(phShippingOrderedQty(row)),0) : '—';
    const start = drill ? '<button type="button" data-shipping-load="'+esc(load.id)+'"' : '<header data-ph-load-header="'+esc(load.id)+'"';
    return start+' class="ph-shipping-summary"><span><b>'+esc(heading)+'</b> '+esc(crew)
        +'</span><strong class="ph-shipping-wdu">'+weight+' / 650 WDU</strong><small>'+load.manifest.length+' Stops · Total Qty '+total+'</small>'
        +phShippingTelemetry(load.estimate)+(drill ? '<i aria-hidden="true">›</i></button>' : '</header>');
}

function phShippingUnloadMarkup(state) {
    const receipt = state.receipt;
    const groups = orderPullUnloadStops(receipt);
    if (!state.teamOnly || !state.edit || !groups.length) return '';
    const active = activePhQrSession(receipt,receipt.buggy.buggy_id);
    return '<section class="ph-shipping-unload"><b>📦 Ready for dock drop-off</b>'
        +groups.map((group,i)=>'<div>'+esc(phQrPullDrop(group) || formatDockViewDockLabel(group.dock)+' · Drop '+group.stopnumber)
            +' <button type="button" data-pull-action="drop_off" data-pull-key="'+i+'"'
            +(active || groups[i-1]?.dock === group.dock ? ' disabled' : '')+'>Drop Off</button></div>').join('')+'</section>';
}

let phShippingState;

function phShippingGrant() {
    const profile = nativeAuthProfile;
    return window.GncUserAccessControl?.state?.userAccess?.find(row =>
        row.username === profile?.username && (!row.profile_id || row.profile_id === profile.id));
}

function canOpenPhShipping() {
    if (typeof nativeAuthSessionActive === 'undefined' || !nativeAuthSessionActive || !nativeAuthProfile
        || nativeAuthProfile.username !== currentUser || getBloomscapesFarm() !== '10-PH') return false;
    return orderPullEligible(nativeAuthProfile,phShippingGrant(),getBloomscapesFarm(),borrowedHelpPreview());
}

function resetPhShippingView() {
    phShippingState = null;
    document.getElementById('view-shipping')?.replaceChildren();
}

function currentPhShippingState() {
    if (!canOpenPhShipping()) return null;
    const owner = getSupabaseReadIdentityScope();
    const manager = phPullSupervisorAllowed(nativeAuthProfile,'10-PH',borrowedHelpPreview());
    const edit = phShippingGrant()?.view_shipping !== 'VIEW_ONLY';
    if (phShippingState?.owner !== owner || phShippingState.manager !== manager || phShippingState.edit !== edit) {
        resetPhShippingView();
        phShippingState = {owner,manager,edit,teamOnly:!manager,username:currentUser,tab:'loads',selected:'',
            filter:'',filterOpen:false,receipt:null,pending:null,error:'',navigation:null};
    }
    return phShippingState;
}

function phShippingIsCurrent(state) {
    return getCurrentVisibleViewId() === 'shipping' && currentPhShippingState() === state;
}

function phShippingButton(action,label,pressed) {
    const active = pressed == null ? '' : ' aria-pressed="'+Boolean(pressed)+'"';
    return '<button type="button" data-shipping-action="'+action+'"'+active+'>'+esc(label)+'</button>';
}

function paintPhShippingToolbar(root,state,count) {
    const toolbar = root.querySelector('[data-shipping-tools]');
    let buttons = '';
    if (state.manager) {
        buttons = state.selected && state.tab === 'loads' ? phShippingButton('back','← All Active Loads ('+count+')')
            : phShippingButton('loads','Active Loads ('+count+')',state.tab === 'loads')
            +(state.edit ? phShippingButton('teams','Teams & Dispatch',state.tab === 'teams')+phShippingButton('signs','QR Signs',state.tab === 'signs') : '');
        if (state.tab === 'loads') buttons += phShippingButton('filters','⚙ Filters',state.filterOpen);
    } else buttons = '<strong>My WingDing load</strong>'+phShippingButton('refresh','Refresh');
    toolbar.innerHTML = buttons;
    if (state.teamOnly && state.edit) paintPhQrScanHeader(state);
    root.querySelector('[data-shipping-filters]').hidden = !state.manager || state.tab !== 'loads' || !state.filterOpen;
}

function paintPhShippingStops(root,state,load) {
    const list = root.querySelector('[data-shipping-list]');
    const rows = state.filter ? orderPullRows({...state.receipt,rows:load.rows},'all',state.filter) : load.rows;
    root.querySelector('[data-shipping-header]').innerHTML = phShippingSummary(load,false)+phShippingUnloadMarkup(state);
    const mount = (section,items)=>mountChunkedList(section,items,row=>phShippingStopCard(row,state));
    const window = phPullLoadWindow(load,rows,mount,state);
    mountBloomscapesScrollWindow(list,window.rows,{size:20,estimate:178,scrollRoot:root.closest('#main-scroll-area'),mount:window.mount});
    return Boolean(rows.length);
}

function paintPhShippingBoard(root,state,loads) {
    const list = root.querySelector('[data-shipping-list]');
    const filtered = state.filter ? new Set(orderPullRows(state.receipt,'all',state.filter).map(row=>row.buggy_id)) : null;
    const matches = loads.filter(load=>!filtered || filtered.has(load.id)
        || [load.route.unit_number,load.route.puller_primary,load.route.puller_helper].join(' ').toLowerCase().includes(state.filter.toLowerCase()));
    list.innerHTML = matches.map(load=>phShippingSummary(load)).join('');
    return Boolean(matches.length);
}

function phShippingStatus(state,hasRows) {
    if (state.error) return state.error;
    if (!state.receipt && state.pending) return 'Loading WingDing loads…';
    if (hasRows) return '';
    if (state.filter) return 'No matching loads or stops.';
    return state.teamOnly ? 'Standby · Ready' : 'No active WingDing loads.';
}

function redrawPhShippingView() {
    const state = currentPhShippingState();
    const root = document.getElementById('view-shipping');
    if (!state || !root?.querySelector('[data-shipping-tools]') || !phShippingIsCurrent(state)) return;
    const loads = phShippingLoads(state.receipt,orderPullRows(state.receipt,'all',''));
    if (state.selected && !loads.some(load=>load.id === state.selected)) state.selected = '';
    paintPhShippingToolbar(root,state,loads.length);
    if (state.tab !== 'loads') return;
    const selected = state.teamOnly ? loads[0] : loads.find(load=>load.id === state.selected);
    const header = root.querySelector('[data-shipping-header]');
    const wet = root.querySelector('[data-ph-shipping-wet]');
    const water = state.manager && typeof visiblePhWaterStatus === 'function' && visiblePhWaterStatus();
    wet.textContent = water ? phShippingWetSummary(state.receipt?.rows || [],water) : '';
    header.replaceChildren();
    const hasRows = selected ? paintPhShippingStops(root,state,selected) : paintPhShippingBoard(root,state,loads);
    root.querySelector('[data-shipping-status]').textContent = phShippingStatus(state,hasRows);
    if (state.receipt && !state.receipt.buggy && state.teamOnly && state.edit) {
        header.innerHTML = phShippingButton('deal','Get Next Buggy');
    }
    renderPendingSuspendPullAllocations();
}

async function runPhShippingCommand(state,action,input = {}) {
    if (state.pending || !phShippingIsCurrent(state) || action !== 'list' && !state.edit) return;
    state.error = '';
    try {
        state.pending = requestOrderPull(action,input);
        if (!state.receipt) redrawPhShippingView();
        const receipt = await state.pending;
        if (currentPhShippingState() === state) state.receipt = phShippingScopedReceipt(receipt,state.username,state.manager);
    } catch (error) {
        if (currentPhShippingState() === state) state.error = error.message || 'Shipping could not refresh.';
    } finally {
        state.pending = null;
        if (phShippingIsCurrent(state)) redrawPhShippingView();
    }
}

async function refreshPhShippingAfterWater(revision) {
    const state = currentPhShippingState();
    if (!state || !phShippingIsCurrent(state) || state.tab !== 'loads' || (state.waterRevision ?? -1) >= revision) return;
    state.waterRevision = revision;
    if (state.pending) await state.pending.catch(()=>{});
    if (phShippingIsCurrent(state) && state.waterRevision===revision) await runPhShippingCommand(state,'list');
}

function changePhShippingTab(root,state,tab) {
    state.tab = tab;
    state.selected = '';
    const panel = root.querySelector('[data-shipping-panel]');
    panel.replaceChildren();
    root.querySelector('[data-shipping-board]').hidden = tab !== 'loads';
    if (tab === 'teams') mountPhBuildWorkOrderPulling(panel);
    if (tab === 'signs') {
        panel.innerHTML = '<div data-ph-status></div>';
        mountPhSignTools({root:panel,owner:state.owner});
    }
    if (tab === 'loads') void runPhShippingCommand(state,'list');
}

function handlePhShippingClick(root,state,event) {
    if (!phShippingIsCurrent(state)) return;
    const button = event.target.closest('[data-shipping-load],[data-shipping-action],[data-pull-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.shippingAction || button.dataset.pullAction;
    const key = button.dataset.pullKey;
    if (action === 'refresh' || action === 'deal') return void runPhShippingCommand(state,action === 'refresh' ? 'list' : action);
    if (action === 'pull' && state.teamOnly) return void runPhShippingCommand(state,action,{buggy_id:state.receipt.buggy.buggy_id,tag_id:key});
    if (action === 'drop_off' && state.teamOnly) {
        const stop = orderPullUnloadStops(state.receipt)[Number(key)];
        if (stop) void runPhShippingCommand(state,action,stop);
        return;
    }
    if (!state.manager) return;
    if (button.dataset.shippingLoad) state.selected = button.dataset.shippingLoad;
    if (action === 'back') state.selected = '';
    if (action === 'filters') state.filterOpen = !state.filterOpen;
    if (action === 'loads' || state.edit && ['teams','signs'].includes(action)) changePhShippingTab(root,state,action);
    redrawPhShippingView();
    if (action === 'filters' && state.filterOpen) root.querySelector('[data-shipping-filter]').focus();
    if (button.dataset.shippingLoad || action === 'back') root.closest('#main-scroll-area')?.scrollTo?.(0,0);
}

function mountPhShippingShell(root,state) {
    root.innerHTML = '<nav data-shipping-tools aria-label="Shipping views"></nav><div data-shipping-filters hidden>'
        +'<label>Filter loads and stops <input type="search" data-shipping-filter placeholder="Unit, crew, plant, location or dock"></label></div>'
        +'<div data-shipping-scroll><section data-shipping-board><div data-shipping-header></div><div data-suspend-pull-preview hidden></div>'
        +'<output data-ph-shipping-wet></output><p data-shipping-status role="status"></p><div data-shipping-list></div></section><section data-shipping-panel></section></div>';
    root.onclick = event=>handlePhShippingClick(root,state,event);
    root.querySelector('[data-shipping-filter]').oninput = event=>{
        if (!phShippingIsCurrent(state)) return;
        state.filter = event.target.value.trim();
        redrawPhShippingView();
    };
}

function renderPhShipping(entering = false) {
    const root = document.getElementById('view-shipping');
    if (!root) return false;
    const state = currentPhShippingState();
    if (!state) { resetPhShippingView(); return false; }
    if (entering || !root.querySelector('[data-shipping-tools]')) {
        Object.assign(state,{tab:'loads',selected:'',filter:'',filterOpen:false});
        mountPhShippingShell(root,state);
    }
    if (entering || state.navigation !== navTransitionSeq) {
        state.navigation = navTransitionSeq;
        if (state.tab === 'loads') void runPhShippingCommand(state,'list');
    }
    redrawPhShippingView();
    return true;
}
