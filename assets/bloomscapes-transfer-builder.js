const bloomscapesTransferMounts = new WeakMap();
const bloomscapesTransferNumberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});

function renderBloomscapesTransferBuilder() {
    const pairs=[['ALL','ALL'],...['60-HL','20-TX','40-NC'].flatMap(origin=>['F1','S1'].map(season=>[origin,season]))];
    const pills=pairs.map(([origin,season])=>`<button type="button" data-po-origin="${origin}" data-po-season="${season}"><span>${origin==='ALL'?'All POs':origin.slice(3)+' '+season}</span><small></small></button>`).join('');
    return `<section data-bloomscapes-workflow="bloomscapes-replenishment" class="bloomscapes-transfer-builder">
        <nav data-transfer-filter-bar aria-label="Purchase orders">${pills}<label><input type="checkbox" data-po-history> History</label>
        <select aria-label="Container / Genus" data-po-facet><option value="">Container / Genus</option></select></nav>
        <div data-transfer-carts></div><p role="status" aria-live="polite"></p><div data-transfer-cards></div>
        <nav data-po-pagination aria-label="Purchase order pages"></nav></section>`;
}

async function mountBloomscapesTransferBuilder(host,selection) {
    const root=host.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    if (!root) return;
    const existing=bloomscapesTransferMounts.get(root);
    if (existing?.owner===bloomscapesTransferOwner()) {
        if (!existing.ready) await loadBloomscapesTransferCards(existing);
        return;
    }
    const filters=getBloomscapesTransferFilters();
    const state={root,selection:selection && new Set(selection),owner:bloomscapesTransferOwner(),rows:[],cards:[],offset:0,drafts:new Map(),revision:0,filters};
    bloomscapesTransferMounts.set(root,state);
    root.querySelector('[data-po-history]').checked=filters.history;
    syncGlobalHeaderChrome({reason:'purchase-order-search',force:true});
    bindBloomscapesTransferFilters(state);
    await loadBloomscapesTransferCards(state);
}

async function loadBloomscapesTransferCards(state) {
    const revision=++state.revision;
    state.root.dataset.transferLoading='true';
    try {
        const rows=await readBloomscapesPanel('bloomscapes-replenishment',{includeHistory:state.filters.history});
        if (revision!==state.revision || !state.root.isConnected || state.owner!==bloomscapesTransferOwner()) return;
        const scoped=scopeBloomscapesTransferTargets(rows,state.selection);
        state.rows=scoped.map(po=>({...po,genus:buildInventoryExcelFact(po).genus}));
        state.ready=true;
        populateBloomscapesPoOptions(state);
        filterBloomscapesTransferCards(state);
    } catch(error) {
        if (revision===state.revision) state.root.querySelector('[role=status]').textContent=error.message;
    } finally {
        if (revision===state.revision) state.root.dataset.transferLoading='false';
    }
}

function captureBloomscapesTransferCards(cards) {
    return new Map(cards.filter(entry=>entry.card.open).map(entry=>[entry.po.po_id,
        {target:entry.select.value,quantity:entry.card.querySelector('[name=quantity]').value}]));
}

function restoreBloomscapesTransferCards(cards,drafts) {
    for (const entry of cards) {
        const draft=drafts.get(entry.po.po_id);
        if (!draft) continue;
        entry.card.open=true;
        if (entry.po.targets.some(target=>target.row_id===draft.target)) entry.select.value=draft.target;
        updateBloomscapesTransferCard(entry);
        entry.card.querySelector('[name=quantity]').value=draft.quantity;
    }
}

function createBloomscapesTransferCard(host,po,state) {
    po={...po,targets:matchingBloomscapesPoTargets(po)};
    const card=document.createElement('details');card.dataset.poId=po.po_id;card.className='app-smart-card app-drive-compact-card bloomscapes-transfer-card';
    card.innerHTML='<summary class="po-card-face"><div class="po-card-heading"><strong data-transfer-title></strong><span data-po-size></span><code data-po-item></code><span data-po-lot></span><span data-po-line></span></div><div data-transfer-metrics class="po-metrics"></div></summary><div class="bloomscapes-transfer-drawer"><label>Target Block / Location <select data-transfer-target></select></label>'
        +'<dl data-transfer-facts></dl><progress max="100" value="0" aria-label="Block fullness"></progress>'
        +'<form novalidate><label>Transfer Qty <input name="quantity" type="number" min="1" step="1" required></label>'
        +'<button type="button" data-action="add-transfer-line"></button><p data-transfer-message role="status"></p></form></div>';
    const select=card.querySelector('select');
    po.targets.forEach(target=>select.appendChild(new Option(`${target.locationcode} · ${target.lotcode}`,target.row_id)));
    const selected=po.targets.find(target=>target.lotcode===po.po_season && bloomscapesTransferProjection(po,target).suggested>0)
        || po.targets.find(target=>bloomscapesTransferProjection(po,target).suggested>0) || po.targets[0];
    if (selected) select.value=selected.row_id;
    const entry={card,po,select};
    select.addEventListener('change',()=>updateBloomscapesTransferCard(entry,true));
    const remove=card.querySelector('form').appendChild(document.createElement('button'));
    remove.type='button';remove.dataset.removeTransfer='';remove.textContent='Remove staged line';
    remove.onclick=()=>{
        const target=po.targets.find(row=>row.row_id===select.value);
        const line=getBloomscapesTransferState().lines.find(row=>row.poId===po.po_id && row.targetId===target?.row_id);
        if (line && removeBloomscapesTransferLine(line.id)) refreshBloomscapesTransferProjection(state,line);
    };
    card.querySelector('[data-action="add-transfer-line"]').addEventListener('click',event=>{
        event.preventDefault();
        if (state.owner!==bloomscapesTransferOwner() || !state.root.isConnected) return;
        try {
            const target=po.targets.find(target=>target.row_id===select.value);
            addBloomscapesTransferLine(po,target,card.querySelector('form').elements.quantity.value);
            refreshBloomscapesTransferProjection(state,{blockKey:bloomscapesTransferBlockKey(target),poId:po.po_id,
                origin:po.origin_farm,itemcode:po.itemcode,lotcode:target.lotcode});
            card.querySelector('[data-transfer-message]').textContent='Added to transfer order.';
        } catch(error) {card.querySelector('[data-transfer-message]').textContent=error.message;}
    });
    host.appendChild(card);return entry;
}

function updateBloomscapesTransferCard(entry,reset=false) {
    const {card,po,select}=entry,target=po.targets.find(row=>row.row_id===select.value);
    const p=target ? bloomscapesTransferProjection(po,target) : null;
    setBloomscapesTransferText(card.querySelector('[data-transfer-title]'),po.commonname || po.itemcode);
    setBloomscapesTransferText(card.querySelector('[data-po-item]'),po.itemcode);
    setBloomscapesTransferText(card.querySelector('[data-po-size]'),po.contsize || '—');
    const badge=card.querySelector('[data-po-lot]');
    badge.textContent=po.po_season || '—';badge.dataset.season=po.season_bucket;
    card.querySelector('[data-po-line]').textContent=`${po.origin_farm.slice(3)} ${po.season_bucket || ''} · PO ${po.po_number || '—'} · P${po.source_page || '—'}/L${po.po_line || '—'}`;
    const remaining=p?.remaining ?? po.remaining_on_po;
    const metrics=[['PO REM',remaining],['10-PH ON HAND',target?.current_ptronhand],['ORIGIN AVAIL',p?.available ?? po.origin_on_hand],
        ['TARGET LOC',target?.locationcode],['STATUS',remaining<=0?'Complete':!target?'Needs target':p?.suggested?'Ready':'Review']];
    card.querySelector('[data-transfer-metrics]').innerHTML=metrics.map(([label,value])=>
        '<span class="app-card-qty-chip"><small class="app-card-qty-label">'+label+'</small><strong class="app-card-qty-value">'+escapeHtml(String(value ?? '—'))+'</strong></span>').join('');
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
    for (const button of state.root.querySelectorAll('[data-po-origin]')) {
        const {poOrigin,poSeason}=button.dataset;
        const rows=state.rows.filter(po=>(poOrigin==='ALL' || poOrigin===po.origin_farm) && matchesBloomscapesPoSeason(po,poSeason));
        const count=rows.reduce((sum,po)=>sum+Number(po.remaining_on_po),0);
        button.querySelector('small').textContent=rows.length?rows.length+' lines · '+count.toLocaleString()+' cans':'';
    }
}

function filterBloomscapesTransferCards(state) {
    const {origin,season,query,facet}=state.filters;
    const [field,value]=facet?JSON.parse(facet):[];
    const visible=state.rows.filter(po=>(origin==='ALL' || po.origin_farm===origin) && matchesBloomscapesPoSeason(po,season)
        && (!field || (po[field] || po[field.toUpperCase()])===value) && matchesBloomscapesPoSearch(po,query));
    for (const entry of state.cards) state.drafts.delete(entry.po.po_id);
    for (const [key,draft] of captureBloomscapesTransferCards(state.cards)) state.drafts.set(key,draft);
    const host=state.root.querySelector('[data-transfer-cards]');
    host.replaceChildren();
    state.offset=Math.min(state.offset,Math.max(0,Math.floor((visible.length-1)/50)*50));
    state.cards=visible.slice(state.offset,state.offset+50).map(po=>createBloomscapesTransferCard(host,po,state));
    refreshBloomscapesTransferProjection(state);
    restoreBloomscapesTransferCards(state.cards,state.drafts);
    for (const button of state.root.querySelectorAll('[data-po-origin]')) {
        button.setAttribute('aria-pressed',String(button.dataset.poOrigin===origin && button.dataset.poSeason===season));
    }
    const cans=visible.reduce((sum,po)=>sum+Number(po.remaining_on_po),0);
    const summary=visible.length+' Lines · '+cans.toLocaleString()+' Cans';
    const studio=state.root.closest('[data-studio-module]')?.querySelector('[data-module-summary]');
    if (studio) studio.textContent=summary;
    state.root.querySelector('[role=status]').textContent=studio?'':summary;
    const pager=state.root.querySelector('[data-po-pagination]');pager.replaceChildren();
    for (const [title,offset] of [['Previous 50',state.offset-50],['Next 50',state.offset+50]]) {
        if (offset<0 || offset>=visible.length) continue;
        const button=pager.appendChild(document.createElement('button'));button.type='button';button.textContent=title;
        button.onclick=()=>{state.offset=offset;filterBloomscapesTransferCards(state);};
    }
}

function bindBloomscapesTransferFilters(state) {
    const bar=state.root.querySelector('[data-transfer-filter-bar]');
    bar.addEventListener('click',event=>{
        const choice=event.target.closest('[data-po-origin]');
        if (!choice) return;
        selectBloomscapesTransferFilter(state.filters,'origin',choice.dataset.poOrigin);
        selectBloomscapesTransferFilter(state.filters,'season',choice.dataset.poSeason);
        state.offset=0;filterBloomscapesTransferCards(state);
    });
    bar.addEventListener('change',event=>{
        state.offset=0;
        if (event.target.matches('[data-po-history]')) {
            selectBloomscapesTransferFilter(state.filters,'history',event.target.checked);
            void loadBloomscapesTransferCards(state);
        } else {
            state.filters.facet=event.target.value;filterBloomscapesTransferCards(state);
        }
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
            state.filters.query=event.target.value.slice(0,200);state.offset=0;filterBloomscapesTransferCards(state);
        });
    }
    container.poRoot=root;
    container.querySelector('input').value=getBloomscapesTransferFilters().query || '';
    return container.id;
}

function refreshBloomscapesTransferProjection(state,affected) {
    state.cards.filter(entry=>!affected || bloomscapesTransferCardIsAffected(entry,affected)).forEach(entry=>updateBloomscapesTransferCard(entry));
    renderBloomscapesTransferCarts(state);
}

function bloomscapesTransferCardIsAffected(entry,line) {
    const target=entry.po.targets.find(row=>row.row_id===entry.select.value);
    return entry.po.po_id===line.poId || target && (bloomscapesTransferBlockKey(target)===line.blockKey
        || entry.po.origin_farm===line.origin && entry.po.itemcode===line.itemcode && target.lotcode===line.lotcode);
}

function renderBloomscapesTransferCarts(state) {
    const host=state.root.querySelector('[data-transfer-carts]');host.replaceChildren();
    const {origin,season}=state.filters;
    if (origin==='ALL') {
        host.textContent='Select a PO to submit its transfer order.';
        return;
    }
    const ids=new Set(state.rows.filter(po=>po.origin_farm===origin && matchesBloomscapesPoSeason(po,season)).map(po=>po.po_id));
    const order=summarizeBloomscapesTransferOrder(origin,ids);
    const label=host.appendChild(document.createElement('span'));
    label.textContent=origin.slice(3)+' '+season+' · '+order.rows+' Lines · '+order.cans.toLocaleString()+' Cans';
    const submit=host.appendChild(document.createElement('button'));submit.type='button';
    submit.dataset.submitOrigin=origin;submit.textContent='Submit to Que';
    submit.disabled=!order.rows || getBloomscapesTransferState().pending.get(origin)?.busy===true;
    submit.onclick=()=>void dispatchBloomscapesTransferCart(state,origin,ids);
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
        renderBloomscapesTransferCarts(state);
        const receipt=await submitBloomscapesTransferOrder(attempt);
        if (!finishBloomscapesTransferSubmission(attempt,receipt)) return;
        status.textContent='Transfer order queued. Confirm physical Qty Hauled on the HAULING work cards.';
        await loadBloomscapesTransferCards(state);await openBloomscapesWorkQueue('HAULING');
    } catch(error) {
        if (attempt) finishBloomscapesTransferSubmission(attempt,null);
        status.textContent=error.message;
    } finally {renderBloomscapesTransferCarts(state);}
}

function refreshBloomscapesTransferFilters() {
    const root=document.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    const state=bloomscapesTransferMounts.get(root);
    if (state) filterBloomscapesTransferCards(state);
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
