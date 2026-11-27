
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
