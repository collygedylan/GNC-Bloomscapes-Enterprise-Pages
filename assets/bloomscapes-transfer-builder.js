const bloomscapesTransferMounts = new WeakMap();

const BLOOMSCAPES_PO_PAGE_SIZE=12;

async function mountBloomscapesTransferBuilder(host,selection) {
    const root=host.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    if (!root) return;
    const existing=bloomscapesTransferMounts.get(root);
    if (existing?.owner===bloomscapesTransferOwner()) return reopenBloomscapesTransferCards(existing);
    const filters=getBloomscapesTransferFilters();
    const state={root,selection:selection && new Set(selection),owner:bloomscapesTransferOwner(),rows:[],cards:[],
        cardByNode:new WeakMap(),drafts:new Map(),revision:0,filters};
    bloomscapesTransferMounts.set(root,state);
    root.querySelector('[data-po-history]').checked=filters.history;
    syncGlobalHeaderChrome({reason:'purchase-order-search',force:true});
    bindBloomscapesTransferFilters(state);
    root.addEventListener('toggle',event=>toggleBloomscapesTransferDrawer(state,event.target),true);
    root.addEventListener('click',event=>openBloomscapesTargetSelector(state,event,mountBloomscapesTransferDrawer));
    await loadBloomscapesTransferCards(state);
}

function reopenBloomscapesTransferCards(state) {
    if (!state.ready && !state.loading) return loadBloomscapesTransferCards(state);
    if (state.ready && (!state.painted || !state.cards.length || state.cards.some(entry=>!entry.card.isConnected))) paintBloomscapesTransferCards(state);
}

function refreshBloomscapesTransferRevision() {
    for (const root of document.querySelectorAll('[data-bloomscapes-workflow="bloomscapes-replenishment"]')) {
        const state = bloomscapesTransferMounts.get(root);
        if (state?.owner !== bloomscapesTransferOwner()) continue;
        state.ready = false;
        if (bloomscapesTransferVisible(state)) void loadBloomscapesTransferCards(state);
    }
}

async function loadBloomscapesTransferCards(state) {
    const revision=++state.revision;
    state.loading=true;
    state.root.dataset.transferLoading='true';
    try {
        const rows=await readBloomscapesPanel('bloomscapes-replenishment',{includeHistory:state.filters.history});
        if (revision!==state.revision || !state.root.isConnected || state.owner!==bloomscapesTransferOwner()) return;
        const scoped=scopeBloomscapesTransferTargets(rows,state.selection);
        state.rows=scoped.map(po=>({...po,genus:buildInventoryExcelFact(po).genus}));
        state.ready=true;
        state.painted=false;
        paintBloomscapesTransferCards(state);
    } catch(error) {
        if (revision===state.revision) state.root.querySelector('[role=status]').textContent=error.message;
    } finally {
        if (revision===state.revision) {
            state.loading=false;
            state.root.dataset.transferLoading='false';
        }
    }
}

function paintBloomscapesTransferCards(state) {
    if (!bloomscapesTransferVisible(state)) return;
    populateBloomscapesPoOptions(state);
    filterBloomscapesTransferCards(state);
    state.painted=true;
}

function toggleBloomscapesTransferDrawer(state,card) {
    const entry=state.cardByNode.get(card);
    if (!entry || !card.isConnected || state.owner!==bloomscapesTransferOwner()) return;
    if (card.open) return mountBloomscapesTransferDrawer(entry,state);
    if (!entry.select) return;
    entry.drawerDraft={target:entry.select.value,quantity:card.querySelector('[name=quantity]').value};
    card.querySelector('.bloomscapes-transfer-drawer').replaceChildren();
    entry.select=null;
    entry.factNodes=null;
}

function mountBloomscapesTransferDrawer(entry,state) {
    const {card,po}=entry;
    if (entry.select) return;
    const drawer=card.querySelector('.bloomscapes-transfer-drawer');
    drawer.innerHTML='<label>Target Block / Location <select data-transfer-target></select></label>'
        +'<dl data-transfer-facts></dl><progress max="100" value="0" aria-label="Block fullness"></progress>'
        +'<form novalidate><label>Transfer Qty <input name="quantity" type="number" min="1" step="1" required></label>'
        +'<button type="button" data-action="add-transfer-line"></button><p data-transfer-message role="status"></p></form>';
    const select=entry.select=drawer.querySelector('select');
    const options=po.targets.map(target=>new Option(`${target.locationcode} · ${target.lotcode}`,target.row_id));
    select.replaceChildren(...options);
    if (!options.length) select.add(new Option('No matching receiving locations',''));
    select.disabled=!options.length;
    const draft=entry.drawerDraft;
    if (draft && entry.targetById.has(draft.target)) entry.targetId=draft.target;
    if (entry.targetId) select.value=entry.targetId;
    bindBloomscapesTransferDrawer(entry,state,drawer);
    updateBloomscapesTransferCard(entry);
    if (draft) drawer.querySelector('[name=quantity]').value=draft.quantity;
}

function bindBloomscapesTransferDrawer(entry,state,drawer) {
    const {card,po,select,targetById}=entry;
    select.addEventListener('change',()=>updateBloomscapesTransferCard(entry,true));
    const remove=drawer.querySelector('form').appendChild(document.createElement('button'));
    remove.type='button';remove.dataset.removeTransfer='';remove.textContent='Remove staged line';
    remove.onclick=()=>{
        const target=targetById.get(select.value);
        const line=getBloomscapesTransferState().lines.find(row=>row.poId===po.po_id && row.targetId===target?.row_id);
        if (line && removeBloomscapesTransferLine(line.id)) refreshBloomscapesTransferProjection(state,line);
    };
    card.querySelector('[data-action="add-transfer-line"]').addEventListener('click',event=>{
        event.preventDefault();
        if (state.owner!==bloomscapesTransferOwner() || !state.root.isConnected) return;
        try {
            const target=targetById.get(select.value);
            addBloomscapesTransferLine(po,target,card.querySelector('form').elements.quantity.value);
            refreshBloomscapesTransferProjection(state,{blockKey:bloomscapesTransferBlockKey(target),poId:po.po_id,
                origin:po.origin_farm,itemcode:po.itemcode,lotcode:target.lotcode});
            card.querySelector('[data-transfer-message]').textContent='Added to transfer order.';
        } catch(error) {card.querySelector('[data-transfer-message]').textContent=error.message;}
    });
}

function filterBloomscapesTransferCards(state) {
    if (!bloomscapesTransferVisible(state)) return;
    const {origin,season,query,facet}=state.filters;
    const [field,value]=facet?JSON.parse(facet):[];
    const visible=state.rows.filter(po=>(origin==='ALL' || po.origin_farm===origin) && matchesBloomscapesPoSeason(po,season)
        && (!field || (po[field] || po[field.toUpperCase()])===value) && matchesBloomscapesPoSearch(po,query));
    parkBloomscapesTransferCards(state,state.cards);
    state.cards=[];
    const host=state.root.querySelector('[data-transfer-cards]');
    mountBloomscapesScrollWindow(host,visible,{
        size:BLOOMSCAPES_PO_PAGE_SIZE,
        mount:(chunk,rows)=>mountBloomscapesTransferChunk(state,chunk,rows),
        unmount:chunk=>unmountBloomscapesTransferChunk(state,chunk)
    });
    state.root.querySelector('[data-po-group]').value=origin+':'+season;
    const cans=visible.reduce((sum,po)=>sum+Number(po.remaining_on_po),0);
    const summary=visible.length+' Lines · '+cans.toLocaleString()+' Cans';
    const studio=state.root.closest('[data-studio-module]')?.querySelector('[data-module-summary]');
    if (studio) studio.textContent=summary;
    state.root.querySelector('[role=status]').textContent=studio?'':summary;
    renderBloomscapesTransferCarts(state,dispatchBloomscapesTransferCart);
}

function mountBloomscapesTransferChunk(state,chunk,rows) {
    const cards=rows.map(po=>createBloomscapesTransferCard(chunk,po,state));
    state.cards.push(...cards);
    cards.forEach(entry=>updateBloomscapesTransferCard(entry));
    restoreBloomscapesTransferCards(state,cards,mountBloomscapesTransferDrawer);
}

function bindBloomscapesTransferFilters(state) {
    state.root.addEventListener('change',event=>{
        if (!event.target.matches('[data-po-history],[data-po-group],[data-po-facet]')) return;
        if (event.target.matches('[data-po-history]')) {
            selectBloomscapesTransferFilter(state.filters,'history',event.target.checked);
            void loadBloomscapesTransferCards(state);
            return;
        }
        if (event.target.matches('[data-po-group]')) {
            const [origin,season]=event.target.value.split(':');
            selectBloomscapesTransferFilter(state.filters,'origin',origin);
            selectBloomscapesTransferFilter(state.filters,'season',season);
        } else state.filters.facet=event.target.value;
        filterBloomscapesTransferCards(state);
    });
}

function getBloomscapesPoHeaderSearch(root) {
    let container=document.getElementById('po-workspace-search');
    if (!container) {
        container=document.createElement('div');container.id='po-workspace-search';
        container.innerHTML='<input type="search" placeholder="Search purchase orders" aria-label="Search purchase orders">';
        document.getElementById('app-wrapper').appendChild(container);
        container.querySelector('input').addEventListener('input',event=>{
            const state=bloomscapesTransferMounts.get(container.poRoot);
            if (!state || !state.root.isConnected || state.owner!==bloomscapesTransferOwner()) return;
            state.filters.query=event.target.value.slice(0,200);filterBloomscapesTransferCards(state);
        });
    }
    container.poRoot=root;
    container.querySelector('input').value=getBloomscapesTransferFilters().query || '';
    return container.id;
}

function refreshBloomscapesTransferProjection(state,affected) {
    state.cards.filter(entry=>!affected || bloomscapesTransferCardIsAffected(entry,affected)).forEach(entry=>updateBloomscapesTransferCard(entry));
    renderBloomscapesTransferCarts(state,dispatchBloomscapesTransferCart);
}

async function dispatchBloomscapesTransferCart(state,origin,ids) {
    const status=state.root.querySelector('[role=status]');let attempt;
    try {
        if (getBloomscapesFarm()!=='10-PH') {
            const selector=document.getElementById('bloomscapes-farm-selector');selector.value='10-PH';
            await changeBloomscapesFarmSelection(selector);
            if (getBloomscapesFarm()!=='10-PH') return;
        }
        attempt=beginBloomscapesTransferSubmission(origin,ids);if (!attempt) return;
        renderBloomscapesTransferCarts(state,dispatchBloomscapesTransferCart);
        const receipt=await submitBloomscapesTransferOrder(attempt);
        if (!finishBloomscapesTransferSubmission(attempt,receipt)) return;
        status.textContent='Transfer order queued. Confirm physical Qty Hauled on the HAULING work cards.';
        await loadBloomscapesTransferCards(state);await openBloomscapesWorkQueue('HAULING');
    } catch(error) {
        if (attempt) finishBloomscapesTransferSubmission(attempt,null);
        status.textContent=error.message;
    } finally {renderBloomscapesTransferCarts(state,dispatchBloomscapesTransferCart);}
}

function refreshBloomscapesTransferFilters() {
    const root=document.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    const state=bloomscapesTransferMounts.get(root);
    if (state) filterBloomscapesTransferCards(state);
}

const bloomscapesTransferNumberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});

function bloomscapesPoGroupLabel(origin,season) {
    return origin==='ALL' ? 'All POs' : origin.slice(3)+' '+season;
}

function renderBloomscapesTransferBuilder() {
    const pairs=[['ALL','ALL'],...['60-HL','20-TX','40-NC'].flatMap(origin=>['F1','S1'].map(season=>[origin,season]))];
    const groups=pairs.map(([origin,season])=>`<option value="${origin}:${season}">${bloomscapesPoGroupLabel(origin,season)}</option>`).join('');
    return `<section data-bloomscapes-workflow="bloomscapes-replenishment" class="bloomscapes-transfer-builder">
        <nav data-transfer-filter-bar aria-label="Purchase orders">
          <select aria-label="PO Group" data-po-group>${groups}</select>
          <select aria-label="Container / Genus" data-po-facet><option value="">Container / Genus</option></select>
          <div data-transfer-carts><button type="button" disabled>Submit to Que</button></div>
        </nav>
        <div data-transfer-summary><p role="status" aria-live="polite"></p>
          <label data-po-history-option><input type="checkbox" data-po-history> History</label>
        </div><div data-transfer-cards></div></section>`;
}

function bloomscapesTransferVisible(state) {
    const view=state.root.closest('[id^="view-"]');
    return state.root.isConnected && !view?.classList.contains('hidden') && !state.root.closest('[hidden]');
}

function captureBloomscapesTransferCards(cards) {
    const drafts=new Map();
    for (const entry of cards) {
        const draft=entry.select ? {target:entry.select.value,quantity:entry.card.querySelector('[name=quantity]').value} : entry.drawerDraft;
        if (draft) drafts.set(entry.po.po_id,{...draft,open:entry.card.open});
    }
    return drafts;
}

function createBloomscapesTransferCard(host,po,state) {
    po={...po,targets:matchingBloomscapesPoTargets(po)};
    const card=document.createElement('details');card.dataset.poId=po.po_id;card.className='app-smart-card app-drive-compact-card bloomscapes-transfer-card';
    card.innerHTML='<summary class="po-card-face"><div class="po-card-heading"><strong data-transfer-title></strong><span data-po-size></span>'
        +'<code data-po-item></code><span data-po-lot></span><span data-po-line></span></div><div data-transfer-metrics class="po-metrics"></div></summary>'
        +'<div class="bloomscapes-transfer-drawer"></div>';
    const selected=po.targets.find(target=>target.lotcode===po.po_season && bloomscapesTransferProjection(po,target).suggested>0)
        || po.targets.find(target=>bloomscapesTransferProjection(po,target).suggested>0) || po.targets[0];
    const entry={card,po,targetId:selected?.row_id,targetById:new Map(po.targets.map(row=>[String(row.row_id),row]))};
    state.cardByNode.set(card,entry);
    host.appendChild(card);
    return entry;
}

function paintBloomscapesTransferFace(card,po,target,p) {
    setBloomscapesTransferText(card.querySelector('[data-transfer-title]'),po.commonname || po.itemcode);
    setBloomscapesTransferText(card.querySelector('[data-po-item]'),po.itemcode);
    setBloomscapesTransferText(card.querySelector('[data-po-size]'),po.contsize || '—');
    const badge=card.querySelector('[data-po-lot]');
    badge.textContent=po.po_season || '—';badge.dataset.season=po.season_bucket;
    card.querySelector('[data-po-line]').textContent=`${po.origin_farm.slice(3)} ${po.season_bucket || ''} · PO ${po.po_number || '—'} · P${po.source_page || '—'}/L${po.po_line || '—'}`;
    const remaining=p?.remaining ?? po.remaining_on_po;
    const metrics=[['PO REM',remaining],['10-PH ON HAND',target?.current_ptronhand],['ORIGIN AVAIL',p?.available ?? po.origin_on_hand],
        ['TARGET LOC',target?.locationcode],['STATUS',remaining<=0?'Complete':!target?'Needs target':p?.suggested?'Ready':'Review']];
    card.querySelector('[data-transfer-metrics]').innerHTML=metrics.map(([label,value])=>{
        const metric='<small class="app-card-qty-label">'+label+'</small><strong class="app-card-qty-value">'+escapeHtml(String(value ?? '—'))+'</strong>';
        if (label==='TARGET LOC') return '<button type="button" class="app-card-qty-chip" data-open-transfer-target>'+metric+'</button>';
        return '<span class="app-card-qty-chip">'+metric+'</span>';
    }).join('');
}

function updateBloomscapesTransferCard(entry,reset=false) {
    const {card,po,select,targetById}=entry;
    if (select) entry.targetId=select.value;
    const target=targetById.get(String(entry.targetId));
    const p=target ? bloomscapesTransferProjection(po,target) : null;
    paintBloomscapesTransferFace(card,po,target,p);
    if (!select) return;
    const form=card.querySelector('form'),button=form.querySelector('button');
    const staged=getBloomscapesTransferState().lines.find(line=>line.poId===po.po_id && line.targetId===target?.row_id);
    card.querySelector('[data-remove-transfer]').hidden=!staged;
    const limit=target ? bloomscapesTransferProjection(po,target,staged?.id) : null;
    button.textContent=staged ? `✓ Added ${staged.quantity} Cans (${(staged.quantity/staged.cpb).toFixed(2)} Beds) — Update Qty` : `+ Add to ${po.origin_farm} Transfer Order`;
    button.disabled=!limit?.suggested;
    if (!p) {card.querySelector('[data-transfer-facts]').textContent='Receiving allocation required.';return;}
    const facts={'Suggested Transfer Qty':p.suggested,'7-Day SOC Demand':target.demand_7_days,'Block Total Beds':p.total,
        'Currently Occupied Beds':p.occupied,'Queued Beds':p.queued,'Draft Order Staged Beds':p.staged,
        'Live Remaining Open Beds':p.open,'CPB · cans / bed':p.cpb,'Live Open Can Space':p.space};
    renderBloomscapesTransferFacts(entry,facts);
    card.querySelector('progress').value=p.total>0 ? Math.min(100,100*(p.occupied+p.queued+p.staged)/p.total) : 0;
    if (reset || document.activeElement!==form.elements.quantity) form.elements.quantity.value=staged?.quantity || limit.suggested || '';
    form.elements.quantity.max=Math.max(0,Math.min(limit.remaining,limit.available,Math.max(limit.space,limit.demand)));
}

function setBloomscapesTransferText(node,text) {
    if (node.textContent!==text) node.textContent=text;
}

function renderBloomscapesTransferFacts(entry,facts) {
    if (!entry.factNodes) {
        entry.factNodes=new Map();const host=entry.card.querySelector('[data-transfer-facts]');host.replaceChildren();
        for (const key of Object.keys(facts)) {
            const group=host.appendChild(document.createElement('div'));
            group.appendChild(document.createElement('dt')).textContent=key;
            entry.factNodes.set(key,group.appendChild(document.createElement('dd')));
        }
    }
    for (const [key,value] of Object.entries(facts)) setBloomscapesTransferText(entry.factNodes.get(key),
        value==null ? 'Unmeasured · review' : bloomscapesTransferNumberFormat.format(value));
}

function populateBloomscapesPoOptions(state) {
    const select=state.root.querySelector('[data-po-facet]');
    const fragment=document.createDocumentFragment();
    fragment.appendChild(new Option('Container / Genus',''));
    for (const [field,label] of [['contsize','Container'],['genus','Genus']]) {
        const values=[...new Set(state.rows.map(po=>po[field] || po[field.toUpperCase()]).filter(Boolean))].sort();
        const group=fragment.appendChild(document.createElement('optgroup'));group.label=label;
        for (const value of values) group.appendChild(new Option(value,JSON.stringify([field,value])));
    }
    select.replaceChildren(fragment);select.value=state.filters.facet || '';
    state.filters.facet=select.value;
    summarizeBloomscapesPoGroups(state);
}

function summarizeBloomscapesPoGroups(state) {
    for (const option of state.root.querySelector('[data-po-group]').options) {
        const [origin,season]=option.value.split(':');
        const rows=state.rows.filter(po=>(origin==='ALL' || origin===po.origin_farm) && matchesBloomscapesPoSeason(po,season));
        const count=rows.reduce((sum,po)=>sum+Number(po.remaining_on_po),0);
        option.textContent=bloomscapesPoGroupLabel(origin,season)+' ('+rows.length+' lines · '+count.toLocaleString()+' cans)';
    }
}

function parkBloomscapesTransferCards(state,cards) {
    for (const entry of cards) state.drafts.delete(entry.po.po_id);
    for (const [key,draft] of captureBloomscapesTransferCards(cards)) state.drafts.set(key,draft);
}

function unmountBloomscapesTransferChunk(state,chunk) {
    const cards=state.cards.filter(entry=>entry.card.parentElement===chunk);
    parkBloomscapesTransferCards(state,cards);
    state.cards=state.cards.filter(entry=>entry.card.parentElement!==chunk);
}

function bloomscapesTransferCardIsAffected(entry,line) {
    const target=entry.targetById.get(String(entry.targetId));
    return entry.po.po_id===line.poId || target && (bloomscapesTransferBlockKey(target)===line.blockKey
        || entry.po.origin_farm===line.origin && entry.po.itemcode===line.itemcode && target.lotcode===line.lotcode);
}

function matchesBloomscapesPoSearch(po,query='') {
    const haystack=[po.itemcode,po.commonname,po.contsize,po.po_season,po.origin_farm,po.po_number].join(' ').toLowerCase();
    return query.toLowerCase().trim().split(/\s+/).every(term=>haystack.includes(term));
}

function scopeBloomscapesTransferTargets(rows,selection) {
    if (!selection) return rows;
    const scoped=[];
    for (const po of rows) {
        const targets=(po.targets || []).filter(target=>selection.has(String(target.row_id)));
        if (targets.length) scoped.push({...po,targets});
    }
    return scoped;
}

function openBloomscapesTargetSelector(state,event,mountDrawer) {
    const trigger=event.target.closest('[data-open-transfer-target]');
    if (!trigger) return;
    event.preventDefault();
    const card=trigger.closest('[data-po-id]');
    const entry=state.cardByNode.get(card);
    if (!entry || !card.isConnected || state.owner!==bloomscapesTransferOwner()) return;
    card.open=true;
    mountDrawer(entry,state);
    if (entry.select.disabled) entry.card.querySelector('summary').focus();
    else entry.select.focus();
}

function restoreBloomscapesTransferCards(state,cards,mountDrawer) {
    for (const entry of cards) {
        const draft=state.drafts.get(entry.po.po_id);
        if (!draft) continue;
        entry.drawerDraft=draft;
        entry.card.open=draft.open;
        if (draft.open) mountDrawer(entry,state);
    }
}
