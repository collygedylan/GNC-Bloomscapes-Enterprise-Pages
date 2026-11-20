
const dockCreditVaultStates = new WeakMap();
const dockCreditPageSize = 30;

function mountBloomscapesDockCreditVault(container) {
    if (!container || !nativeAuthSessionActive) return;
    const panel = document.createElement('section');
    panel.dataset.dockCreditVault = '';
    panel.className = 'space-y-3';
    panel.innerHTML = '<h3 class="text-lg font-bold">Dock Order Vault</h3><nav data-vault-path aria-label="Dock Vault folders"></nav>'
        + '<form data-vault-search class="flex flex-wrap items-center gap-2"><label>Search <input name="query" type="search" maxlength="120"></label>'
        + '<button class="sales-card-action" type="submit">Search</button><button class="sales-card-action" type="button" data-vault-action="refresh">Refresh</button>'
        + '<button class="sales-card-action" type="button" data-vault-action="hotspots" hidden>Credit hotspots</button></form>'
        + '<p role="status"></p><div data-vault-results class="space-y-2"></div><nav data-vault-pages aria-label="Dock Vault pages"></nav>';
    const state = {panel,scope:{identity:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm()},
        mode:'customers',customer:null,consignee:null,offset:0,search:'',turn:0,rows:[],pending:new Set()};
    dockCreditVaultStates.set(panel,state);
    panel.addEventListener('click',event => handleDockCreditVaultClick(state,event));
    panel.addEventListener('submit',event => {
        if (!event.target.matches('[data-vault-search]')) return;
        event.preventDefault();
        state.search=event.target.elements.query.value.trim();
        state.offset=0;
        void loadDockCreditVault(state);
    });
    container.prepend(panel);
    void loadDockCreditVault(state);
}

function dockCreditVaultCurrent(state) {
    return state.panel.isConnected && state.scope.identity===getSupabaseReadIdentityScope()
        && state.scope.farm===getBloomscapesFarm();
}

function dockCreditVaultStatus(state, message) {
    state.panel.querySelector('[role="status"]').textContent=message;
}

async function loadDockCreditVault(state) {
    if (!dockCreditVaultCurrent(state)) return;
    const turn=++state.turn;
    dockCreditVaultStatus(state,'Loading…');
    paintDockCreditVaultBreadcrumb(state);
    try {
        const receipt=state.mode==='hotspots' ? await readBloomscapesDockCreditHotspots(state.scope)
            : await readBloomscapesDockCreditVault(state.scope,state);
        if (!dockCreditVaultCurrent(state) || turn!==state.turn) return;
        state.rows=receipt.rows || [];
        state.panel.querySelector('[data-vault-action="hotspots"]').hidden=receipt.can_review_credit===false;
        paintDockCreditVaultResults(state,receipt);
        dockCreditVaultStatus(state,'');
    } catch (error) {
        if (dockCreditVaultCurrent(state) && turn===state.turn) dockCreditVaultStatus(state,error.message);
    }
}

function paintDockCreditVaultBreadcrumb(state) {
    const path = state.panel.querySelector('[data-vault-path]');
    const crumbs=[['customers','Customers']];
    if (state.customer) crumbs.push(['consignees',state.customer.name]);
    if (state.consignee) crumbs.push(['lines',state.consignee.name]);
    if (state.mode==='hotspots') crumbs.push(['hotspots','Credit hotspots']);
    path.replaceChildren(...crumbs.map(([mode,label]) => dockCreditVaultButton(mode,label)));
}

function dockCreditVaultButton(action,label,id) {
    const button=document.createElement('button');
    button.type='button';
    button.className='sales-card-action';
    button.dataset.vaultAction=action;
    if (id) button.dataset.vaultId=id;
    button.textContent=label;
    return button;
}

function paintDockCreditVaultResults(state,receipt) {
    const host=state.panel.querySelector('[data-vault-results]');
    const pages=state.panel.querySelector('[data-vault-pages]');
    pages.replaceChildren();
    if (state.mode==='hotspots') {
        paintDockCreditHotspots(host,receipt);
        return;
    }
    const render=state.mode==='lines' ? renderDockCreditVaultOrder : row => dockCreditVaultButton('folder',
        row.name+' · '+row.orders+' order lines',row.id);
    host.replaceChildren(...state.rows.map(render));
    if (!state.rows.length) host.textContent='No Dock orders match this folder.';
    if (state.offset>0) pages.append(dockCreditVaultButton('prev','Previous'));
    if (receipt.has_more) pages.append(dockCreditVaultButton('next','Next'));
}

function renderDockCreditVaultOrder(order) {
    const card=document.createElement('article');
    card.className='app-smart-card space-y-2 p-3';
    card.dataset.dockVaultOrder=order.id;
    card.appendChild(document.createElement('h4')).textContent=order.commonname || order.itemcode || order.id;
    card.appendChild(document.createElement('p')).textContent=[order.itemcode,order.contsize,order.lotcode,order.locationcode,order.rep].filter(Boolean).join(' · ');
    card.appendChild(document.createElement('p')).textContent=[order.transaction || order.id,order.dock && 'Dock '+order.dock,
        order.trip,order.drop && 'Drop '+order.drop,'Ordered '+order.ordered,'Shipped '+order.shipped].filter(Boolean).join(' · ');
    if (order.segments?.length) card.appendChild(document.createElement('p')).textContent=order.segments.map(segment =>
        segment.locationcode+' · Qty '+segment.quantity).join(' | ');
    if (typeof renderBloomscapesLoadMaximizer === 'function') {
        card.insertAdjacentHTML('beforeend',renderBloomscapesLoadMaximizer({kind:'order',id:order.id}));
    }
    if (order.can_request_credit) card.append(dockCreditVaultButton('credit','💳 Request for Credit',order.id));
    for (const claim of order.claims || []) card.append(renderDockCreditAdvisory(claim));
    return card;
}

function renderDockCreditAdvisory(claim) {
    const card=document.createElement('section');
    card.className='rounded-lg border border-emerald-700/60 p-2 text-sm';
    card.appendChild(document.createElement('strong')).textContent='Credit claim · '+claim.status;
    const similarity = claim.similarity == null ? 'Photo similarity unavailable' : 'Photo similarity '+claim.similarity+'%';
    card.appendChild(document.createElement('p')).textContent=[claim.model==='gemini_vision' ? 'Gemini Vision' : 'PostgreSQL advisory',
        'Damage review priority '+claim.damage_risk+' / 100',similarity].join(' · ');
    card.appendChild(document.createElement('p')).textContent=claim.finding;
    card.appendChild(document.createElement('p')).textContent=claim.preship_photos+' Dock photos · '+claim.claim_photos+' customer photos';
    if (claim.verdict) card.appendChild(document.createElement('p')).textContent='Feedback recorded · '+claim.verdict;
    if (claim.can_vote) card.append(dockCreditVaultButton('agree','👍 Agree',claim.id),dockCreditVaultButton('disagree','👎 Disagree',claim.id));
    return card;
}

function paintDockCreditHotspots(host,receipt) {
    const parties=receipt.parties.map(row=>[row.customer+' → '+row.consignee,row.count,row.quantity]);
    const items=receipt.items.map(row=>[row.itemcode,row.count,row.quantity]);
    host.replaceChildren(buildDockCreditHotspotGroup('Customer and consignee',parties),buildDockCreditHotspotGroup('Itemcode',items));
}

function buildDockCreditHotspotGroup(title,rows) {
    const group=document.createElement('section');
    group.className='app-smart-card p-3';
    group.appendChild(document.createElement('h4')).textContent=title;
    if (!rows.length) group.appendChild(document.createElement('p')).textContent='No credit claims in this scope.';
    const list=group.appendChild(document.createElement('ul'));
    for (const [label,count,quantity] of rows) {
        list.appendChild(document.createElement('li')).textContent=label+' · '+count+' claims · Qty '+quantity;
    }
    return group;
}

function handleDockCreditVaultClick(state,event) {
    const button=event.target.closest('[data-vault-action]');
    if (!button || !dockCreditVaultCurrent(state)) return;
    const {vaultAction:action,vaultId:id}=button.dataset;
    if (action==='credit') {
        if (state.rows.some(row=>row.id===id && row.can_request_credit)) openDocksCredit(id);
        return;
    }
    if (action==='agree' || action==='disagree') {
        void sendDockCreditVaultFeedback(state,button,id,action);
        return;
    }
    if (action==='prev' || action==='next') {
        state.offset=Math.max(0,state.offset+(action==='prev' ? -dockCreditPageSize : dockCreditPageSize));
        void loadDockCreditVault(state);
        return;
    }
    if (action==='refresh') void loadDockCreditVault(state);
    else if (action==='folder') selectDockCreditVaultFolder(state,id);
    else moveDockCreditVault(state,action);
}

function selectDockCreditVaultFolder(state,id) {
    const row=state.rows.find(row=>row.id===id);
    if (!row) return;
    if (state.mode==='customers') {
        state.customer=row;
        moveDockCreditVault(state,'consignees');
    } else if (state.mode==='consignees') {
        state.consignee=row;
        moveDockCreditVault(state,'lines');
    }
}

function moveDockCreditVault(state,mode) {
    if (!['customers','consignees','lines','hotspots'].includes(mode)) return;
    if (mode==='hotspots' && state.mode==='hotspots') return;
    if (mode==='customers') state.customer=null;
    if (mode==='customers' || mode==='consignees') state.consignee=null;
    if (mode==='hotspots') state.previousMode=state.mode;
    state.mode=mode;
    state.offset=0;
    state.search='';
    state.panel.querySelector('[data-vault-search] input').value='';
    state.panel.querySelector('[data-vault-results]').replaceChildren();
    void loadDockCreditVault(state);
}

async function sendDockCreditVaultFeedback(state,button,id,verdict) {
    if (state.pending.has(id) || !state.rows.some(row=>row.claims?.some(claim=>claim.id===id && claim.can_vote))) return;
    state.pending.add(id);
    button.disabled=true;
    try {
        await submitBloomscapesDockCreditFeedback(state.scope,id,verdict);
        if (dockCreditVaultCurrent(state)) await loadDockCreditVault(state);
    } catch(error) {
        if (dockCreditVaultCurrent(state)) dockCreditVaultStatus(state,error.message);
    } finally {
        state.pending.delete(id);
        button.disabled=false;
    }
}

function backBloomscapesDockCreditVault() {
    const panel=document.getElementById('view-'+getCurrentVisibleViewId())?.querySelector('[data-dock-credit-vault]');
    const state=panel && dockCreditVaultStates.get(panel);
    if (!state || panel.closest('[hidden],.hidden') || state.mode==='customers' || !dockCreditVaultCurrent(state)) return false;
    const mode=state.mode==='hotspots' ? state.previousMode : state.mode==='lines' ? 'consignees' : 'customers';
    moveDockCreditVault(state,mode);
    return true;
}
