const bloomscapesTransferMounts = new WeakMap();

function renderBloomscapesTransferBuilder() {
    return `<section data-bloomscapes-workflow="bloomscapes-replenishment" class="bloomscapes-transfer-builder">
      <h2>Intercompany Replenishment &amp; CPB · Transfer Order Builder</h2>
      <div data-transfer-carts></div><label>Origin <select data-origin-filter><option>ALL</option><option>60-HL</option><option>40-NC</option><option>20-TX</option></select></label>
      <label><input type="checkbox" data-po-history> Show Completed / 0-Balance History</label>
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
    const state={root,owner:bloomscapesTransferOwner(),rows:[],cards:[],loading:false};
    bloomscapesTransferMounts.set(root,state);
    root.querySelector('[data-origin-filter]').addEventListener('change',()=>filterBloomscapesTransferCards(state));
    root.querySelector('[data-po-history]').addEventListener('change',()=>void loadBloomscapesTransferCards(state));
    await loadBloomscapesTransferCards(state);
}

async function loadBloomscapesTransferCards(state) {
    if (state.loading) return;
    state.loading=true;
    try {
        const rows=await readBloomscapesPanel('bloomscapes-replenishment',{includeHistory:state.root.querySelector('[data-po-history]').checked});
        if (!state.root.isConnected || state.owner!==bloomscapesTransferOwner()) return;
        state.rows=rows;state.cards=[];
        state.ready=true;
        const host=state.root.querySelector('[data-transfer-cards]');host.replaceChildren();
        rows.forEach(po=>state.cards.push(createBloomscapesTransferCard(host,po,state)));
        filterBloomscapesTransferCards(state);refreshBloomscapesTransferProjection(state);
        state.root.querySelector('[role=status]').textContent=`${rows.length} unique PO lines. Stock and PO post on confirmed Qty Hauled.`;
    } catch(error) {state.root.querySelector('[role=status]').textContent=error.message;}
    finally {state.loading=false;}
}

function createBloomscapesTransferCard(host,po,state) {
    const card=document.createElement('details');card.dataset.poId=po.po_id;card.className='bloomscapes-transfer-card';
    card.innerHTML='<summary></summary><div class="bloomscapes-transfer-drawer"><label>Target Block / Location <select data-transfer-target></select></label>'
        +'<dl data-transfer-facts></dl><progress max="100" value="0" aria-label="Block fullness"></progress>'
        +'<form><label>Transfer Qty <input name="quantity" type="number" min="1" step="1" required></label>'
        +'<button type="submit"></button><p data-transfer-message role="status"></p></form></div>';
    const select=card.querySelector('select');
    po.targets.forEach(target=>select.appendChild(new Option(`${target.locationcode} · ${target.lotcode}`,target.row_id)));
    const selected=po.targets.find(target=>bloomscapesTransferProjection(po,target).suggested>0) || po.targets[0];
    if (selected) select.value=selected.row_id;
    const entry={card,po,select};
    select.addEventListener('change',()=>updateBloomscapesTransferCard(entry,true));
    card.querySelector('form').addEventListener('submit',event=>{
        event.preventDefault();
        try {
            addBloomscapesTransferLine(po,po.targets.find(target=>target.row_id===select.value),event.target.elements.quantity.value);
            refreshBloomscapesTransferProjection(state);
            card.querySelector('[data-transfer-message]').textContent='Added to transfer order.';
        } catch(error) {card.querySelector('[data-transfer-message]').textContent=error.message;}
    });
    host.appendChild(card);return entry;
}

function updateBloomscapesTransferCard(entry,reset=false) {
    const {card,po,select}=entry,target=po.targets.find(row=>row.row_id===select.value);
    const p=target ? bloomscapesTransferProjection(po,target) : null;
    card.querySelector('summary').textContent=`${po.commonname || po.itemcode} · ${po.contsize || ''} · ${po.itemcode} · ${po.origin_farm} → 10-PH`
        +` · Target ${target?.blockalpha || ''}.${target?.blocknumber || ''} / ${target?.locationcode || 'No matching receiving row'}`
        +` · PO Remaining ${p?.remaining ?? po.remaining_on_po} · 10-PH PTR On Hand ${target?.current_ptronhand ?? 0} · Origin Available ${p?.available ?? po.origin_on_hand}`;
    const form=card.querySelector('form'),button=form.querySelector('button');
    button.textContent=`+ Add to ${po.origin_farm} Transfer Order`;button.disabled=!p?.suggested;
    if (!p) {card.querySelector('[data-transfer-facts]').textContent='Receiving allocation required.';return;}
    const facts={'Suggested Transfer Qty':p.suggested,'7-Day SOC Demand':target.demand_7_days,'Block Total Beds':p.total,
        'Currently Occupied Beds':p.occupied,'Queued Beds':p.queued,'Draft Order Staged Beds':p.staged,
        'Live Remaining Open Beds':p.open,'CPB · cans / bed':p.cpb,'Live Open Can Space':p.space};
    card.querySelector('[data-transfer-facts]').innerHTML=Object.entries(facts).map(([key,value])=>
        `<div><dt>${esc(key)}</dt><dd>${value==null?'Unmeasured · review':Number(value).toLocaleString(undefined,{maximumFractionDigits:2})}</dd></div>`).join('');
    card.querySelector('progress').value=p.total>0 ? Math.min(100,100*(p.occupied+p.queued+p.staged)/p.total) : 0;
    if (reset || document.activeElement!==form.elements.quantity) form.elements.quantity.value=p.suggested || '';
    form.elements.quantity.max=p.suggested;
}

function filterBloomscapesTransferCards(state) {
    const origin=state.root.querySelector('[data-origin-filter]').value;
    state.cards.forEach(({card,po})=>{card.hidden=origin!=='ALL' && po.origin_farm!==origin;});
}

function refreshBloomscapesTransferProjection(state) {
    state.cards.forEach(entry=>updateBloomscapesTransferCard(entry));
    renderBloomscapesTransferCarts(state);
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
    remove.addEventListener('click',()=>{removeBloomscapesTransferLine(line.id);refreshBloomscapesTransferProjection(state);});
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
