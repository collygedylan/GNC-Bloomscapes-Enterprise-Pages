const bloomscapesTransferMounts = new WeakMap();
const bloomscapesTransferNumberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});

function renderBloomscapesTransferBuilder() {
    return `<section data-bloomscapes-workflow="bloomscapes-replenishment" class="bloomscapes-transfer-builder">
      <h2>PO Management · Intercompany Transfer Order Builder</h2>
      <div id="hl-order-search-container"><input id="hl-order-search" type="search" placeholder="Search PO Management..." aria-label="Search PO Management"></div>
      <div data-transfer-excel></div><div data-transfer-filter-bar><label>Origin <select data-origin-filter><option>ALL</option><option>60-HL</option><option>40-NC</option><option>20-TX</option></select></label>
      <label>Season / PO Look <select data-po-seasons>${[['ALL','ALL SEASONS'],['F1','F1 POs (Fall · .F1)'],['S1','S1 POs (Spring · .S1)'],['OTHER','Other (.U1 / .U2 / .X / .Y)']].map(([value,label])=>
        `<option value="${value}" data-po-season="${value}" data-label="${label}">${label}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-po-history> Show Completed / 0-Balance History</label></div>
      <div data-transfer-carts></div>
      <p role="status"></p><div data-transfer-cards></div></section>`;
}

async function mountBloomscapesTransferBuilder(host) {
    const root=host.querySelector('[data-bloomscapes-workflow="bloomscapes-replenishment"]');
    if (!root) return;
    const existing=bloomscapesTransferMounts.get(root);
    if (existing?.owner===bloomscapesTransferOwner()) {
        if (!existing.ready) await loadBloomscapesTransferCards(existing);
        return;
    }
    const filters=getBloomscapesTransferFilters();
    const state={root,owner:bloomscapesTransferOwner(),rows:[],cards:[],loading:false,filters};
    bloomscapesTransferMounts.set(root,state);
    root.querySelector('[data-origin-filter]').value=filters.origin;
    root.querySelector('[data-po-history]').checked=filters.history;
    root.querySelector('[data-po-seasons]').value=filters.season;
    const search=root.querySelector('#hl-order-search');search.value=filters.query || '';
    search.addEventListener('input',()=>{filters.query=search.value.slice(0,200);filterBloomscapesTransferCards(state);});
    bindBloomscapesTransferFilters(state);
    await loadBloomscapesTransferCards(state);
}

async function loadBloomscapesTransferCards(state) {
    if (state.loading) return;
    state.loading=true;
    state.root.dataset.transferLoading='true';
    try {
        const rows=await readBloomscapesPanel('bloomscapes-replenishment',{includeHistory:state.filters.history});
        if (!state.root.isConnected || state.owner!==bloomscapesTransferOwner()) return;
        const drafts=captureBloomscapesTransferCards(state.cards);
        state.rows=rows;state.cards=[];
        state.ready=true;
        const host=state.root.querySelector('[data-transfer-cards]');host.replaceChildren();
        rows.forEach(po=>state.cards.push(createBloomscapesTransferCard(host,po,state)));
        filterBloomscapesTransferCards(state);refreshBloomscapesTransferProjection(state);
        restoreBloomscapesTransferCards(state.cards,drafts);
    } catch(error) {state.root.querySelector('[role=status]').textContent=error.message;}
    finally {state.loading=false;state.root.dataset.transferLoading='false';}
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
    const card=document.createElement('details');card.dataset.poId=po.po_id;card.className='bloomscapes-transfer-card';
    card.innerHTML='<summary><span data-transfer-title></span><strong data-po-lot></strong><span data-transfer-metrics></span><span data-po-line></span></summary><div class="bloomscapes-transfer-drawer"><label>Target Block / Location <select data-transfer-target></select></label>'
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
    setBloomscapesTransferText(card.querySelector('[data-transfer-title]'),`${po.commonname || po.itemcode} · ${po.contsize || ''} · ${po.itemcode}`);
    setBloomscapesTransferText(card.querySelector('[data-transfer-metrics]'),` · ${po.origin_farm} → 10-PH · Target ${target?.blockalpha || ''}.${target?.blocknumber || ''} / ${target?.locationcode || 'No matching receiving row'}`
        +` · PO Remaining ${p?.remaining ?? po.remaining_on_po} · 10-PH PTR On Hand ${target?.current_ptronhand ?? 0} · Origin Available ${p?.available ?? po.origin_on_hand}`);
    const badge=card.querySelector('[data-po-lot]');badge.textContent=po.po_season || 'Season unrecorded';badge.dataset.season=po.season_bucket;
    card.querySelector('[data-po-line]').textContent=` · PO ${po.po_number || 'unrecorded'} · Page ${po.source_page || '—'} · Line ${po.po_line || po.po_id} · ${po.delivery_window || 'Delivery unrecorded'}`;
    const form=card.querySelector('form'),button=form.querySelector('button');
    const staged=getBloomscapesTransferState().lines.find(line=>line.poId===po.po_id && line.targetId===target?.row_id);
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

function filterBloomscapesTransferCards(state) {
    const {origin}=state.filters;
    const rows=reconcileBloomscapesTransferSeason(state.filters,state.rows);
    const filtered=applyInventoryExcelFilters('po',rows);
    const visible=filtered.filter(po=>matchesBloomscapesPoSeason(po,state.filters.season) && matchesBloomscapesPoSearch(po,state.filters.query));
    const visibleIds=new Set(visible.map(po=>po.po_id));
    state.root.querySelector('[data-origin-filter]').value=origin;
    state.root.querySelector('[data-po-seasons]').value=state.filters.season;
    for (const {card,po} of state.cards) {
        const hidden=!(origin==='ALL' || po.origin_farm===origin) || !matchesBloomscapesPoSeason(po,state.filters.season) || !visibleIds.has(po.po_id);
        if (card.hidden!==hidden) card.hidden=hidden;
    }
    for (const button of state.root.querySelectorAll('[data-po-season]')) {
        const matches=rows.filter(po=>matchesBloomscapesPoSeason(po,button.dataset.poSeason));
        button.textContent=`${button.dataset.label} · ${matches.length} lines · ${matches.reduce((sum,po)=>sum+Number(po.remaining_on_po),0).toLocaleString()} cans`;
    }
    state.root.querySelector('[role=status]').textContent=`${visible.length} unique PO lines · ${visible.reduce((sum,po)=>sum+Number(po.remaining_on_po),0).toLocaleString()} cans. Stock and PO post on confirmed Qty Hauled.`;
}

function bindBloomscapesTransferFilters(state) {
    const controls=[['[data-origin-filter]','origin'],['[data-po-seasons]','season'],['[data-po-history]','history']];
    for (const [selector,key] of controls) {
        state.root.querySelector(selector).addEventListener('change',event=>{
            selectBloomscapesTransferFilter(state.filters,key,key==='history'?event.target.checked:event.target.value);
            if (key==='history') {void loadBloomscapesTransferCards(state);return;}
            filterBloomscapesTransferCards(state);
            if (key==='origin') revealBloomscapesOriginHistory(state);
        });
    }
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
    BLOOMSCAPES_TRANSFER_ORIGINS.forEach(origin=>{
        const order=summarizeBloomscapesTransferOrder(origin),box=document.createElement('section');
        box.innerHTML=`<h3>${origin} Transfer Order</h3><ul></ul><button type="button" data-submit-origin="${origin}"></button>`;
        order.lines.forEach(line=>appendBloomscapesTransferCartLine(box.querySelector('ul'),line,state));
        const button=box.querySelector('[data-submit-origin]');
        button.textContent=`🚜 Submit ${origin} Transfer Order to Que (${order.rows} Rows · ${order.cans} Cans · ${order.beds.toFixed(2)} Beds)`;
        button.disabled=!order.rows || getBloomscapesTransferState().pending.get(origin)?.busy===true;
        button.addEventListener('click',()=>void dispatchBloomscapesTransferCart(state,origin));
        host.appendChild(box);
    });
}

function appendBloomscapesTransferCartLine(host,line,state) {
    const item=document.createElement('li');
    item.textContent=`${line.commonname || line.itemcode} · ${line.location} · ${line.quantity} cans · ${(line.quantity/line.cpb).toFixed(2)} beds `;
    const remove=item.appendChild(document.createElement('button'));remove.type='button';remove.textContent='Remove';
    remove.addEventListener('click',()=>{removeBloomscapesTransferLine(line.id);refreshBloomscapesTransferProjection(state,line);});
    host.appendChild(item);
}

async function dispatchBloomscapesTransferCart(state,origin) {
    const status=state.root.querySelector('[role=status]');let attempt;
    try {
        if (getBloomscapesFarm()!=='10-PH') {
            const selector=document.getElementById('bloomscapes-farm-selector');selector.value='10-PH';
            await changeBloomscapesFarmSelection(selector);
            if (getBloomscapesFarm()!=='10-PH') return;
        }
        attempt=beginBloomscapesTransferSubmission(origin);if (!attempt) return;
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

function revealBloomscapesOriginHistory(state) {
    if (state.filters.history || state.filters.origin==='ALL' || state.rows.some(po=>po.origin_farm===state.filters.origin)) return;
    state.filters.history=true;state.root.querySelector('[data-po-history]').checked=true;
    void loadBloomscapesTransferCards(state);
}

function matchesBloomscapesPoSearch(po,query='') {
    const haystack=[po.itemcode,po.commonname,po.contsize,po.po_season,po.origin_farm,po.po_number].join(' ').toLowerCase();
    return query.toLowerCase().trim().split(/\s+/).every(term=>haystack.includes(term));
}
