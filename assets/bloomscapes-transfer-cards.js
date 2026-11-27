const bloomscapesTransferNumberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});

function bloomscapesPoGroupLabel(origin,season) {
    return origin==='ALL' ? 'All POs' : origin.slice(3)+' '+season;
}

/** @returns {string} Replenishment workspace markup. */
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

/**
 * @param {object} state Current view state.
 * @returns {boolean} Whether the replenishment surface is visible.
 */
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

/**
 * @param {HTMLElement} host Mounted view host.
 * @param {object} po Purchase order.
 * @param {object} state Current view state.
 * @returns {object} Card element with its purchase order and local draft.
 */
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

/**
 * @param {object} entry Mounted transfer card and order.
 * @param {boolean} reset Whether to reset the card controls.
 * @returns {void} Updates the mounted purchase order card.
 */
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

/**
 * @param {object} state Current view state.
 * @returns {void} Updates the purchase order filter choices.
 */
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

/**
 * @param {object} state Current view state.
 * @param {Array} cards Mounted card entries.
 * @returns {void} Retains card drafts while their chunk is detached.
 */
function parkBloomscapesTransferCards(state,cards) {
    for (const entry of cards) state.drafts.delete(entry.po.po_id);
    for (const [key,draft] of captureBloomscapesTransferCards(cards)) state.drafts.set(key,draft);
}

/**
 * @param {object} state Current view state.
 * @param {HTMLElement} chunk Mounted purchase order chunk.
 * @returns {void} Parks and releases the selected chunk.
 */
function unmountBloomscapesTransferChunk(state,chunk) {
    const cards=state.cards.filter(entry=>entry.card.parentElement===chunk);
    parkBloomscapesTransferCards(state,cards);
    state.cards=state.cards.filter(entry=>entry.card.parentElement!==chunk);
}

/**
 * @param {object} entry Mounted transfer card and order.
 * @param {object} line Changed transfer line.
 * @returns {boolean} Whether a transfer changes this purchase order or target.
 */
function bloomscapesTransferCardIsAffected(entry,line) {
    const target=entry.targetById.get(String(entry.targetId));
    return entry.po.po_id===line.poId || target && (bloomscapesTransferBlockKey(target)===line.blockKey
        || entry.po.origin_farm===line.origin && entry.po.itemcode===line.itemcode && target.lotcode===line.lotcode);
}

/**
 * @param {object} po Purchase order.
 * @param {string} query Purchase order search text.
 * @returns {boolean} Whether every search term matches this purchase order.
 */
function matchesBloomscapesPoSearch(po,query='') {
    const haystack=[po.itemcode,po.commonname,po.contsize,po.po_season,po.origin_farm,po.po_number].join(' ').toLowerCase();
    return query.toLowerCase().trim().split(/\s+/).every(term=>haystack.includes(term));
}

/**
 * @param {Array|null} rows Rows supplied for projection.
 * @param {object} selection Selected target scope.
 * @returns {Array} Targets matching the selected scope.
 */
function scopeBloomscapesTransferTargets(rows,selection) {
    if (!selection) return rows;
    const scoped=[];
    for (const po of rows) {
        const targets=(po.targets || []).filter(target=>selection.has(String(target.row_id)));
        if (targets.length) scoped.push({...po,targets});
    }
    return scoped;
}

/**
 * @param {object} state Current view state.
 * @param {Event} event User interaction.
 * @param {Function} mountDrawer Mounts the destination picker.
 * @returns {void} Opens the destination selector for a transfer card.
 */
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

/**
 * @param {object} state Current view state.
 * @param {Array} cards Mounted card entries.
 * @param {Function} mountDrawer Mounts the destination picker.
 * @returns {void} Restores each mounted card from its draft.
 */
function restoreBloomscapesTransferCards(state,cards,mountDrawer) {
    for (const entry of cards) {
        const draft=state.drafts.get(entry.po.po_id);
        if (!draft) continue;
        entry.drawerDraft=draft;
        entry.card.open=draft.open;
        if (draft.open) mountDrawer(entry,state);
    }
}
