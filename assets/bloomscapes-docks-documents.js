
function pullDocumentRows(tags) {
    return tags.flatMap(tag => pullPrintLines(tag).map(line => ({...line,itemcode:tag.itemcode, id:tag.id})));
}

function renderBloomscapesDockDocumentRows(tags) {
    const rows = pullDocumentRows(tags).map(line => `<tr><td>${pullHtml(line.itemcode)}</td><td>${pullHtml(line.locationcode)}</td><td>${pullHtml(line.quantity)}</td></tr>`).join('');
    if (!rows) return '<p>No authorized order lines are available for this drop.</p>';
    return `<table class="w-full text-left text-sm"><thead><tr><th scope="col">Item</th><th scope="col">Location</th><th scope="col">Qty</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function pullDocumentKey(button) {
    return [button.dataset.dock,button.dataset.trip,button.dataset.drop].join('\u001f');
}

function printBloomscapesCheckerCopy(button) {
    const board = currentBloomscapesDockBoard();
    const key = pullDocumentKey(button);
    const archive = button.dataset.archive === 'true';
    const drops = archive ? trafficReceiptDrops(board?.traffic.find(receipt => receipt.dock === button.dataset.dock)) : board?.drops;
    const drop = drops?.find(candidate => pullKey(candidate) === key);
    if (!drop) return;
    const tags = archive ? drop.tags : board.tags.filter(candidate => pullKey(candidate) === key);
    const popup = window.open('','_blank');
    if (!popup) {
        showToast('Checker Copy','Allow pop-ups to print this document.',true);
        return;
    }
    popup.opener = null;
    popup.document.title = `Checker Copy · Dock ${drop.dock} · Drop ${drop.drop}`;
    popup.document.body.innerHTML = `<h1>Checker Copy</h1>
        <p>Dock ${pullHtml(drop.dock)} · ${pullHtml(drop.trip)} · Drop ${pullHtml(drop.drop)}</p>
        <p>${pullHtml([drop.customer,drop.consignee,drop.rep].filter(Boolean).join(' · '))}</p>${renderBloomscapesDockDocumentRows(tags)}`;
    popup.focus();
    popup.print();
}

function pullCheckerCopyButton(drop, archive = false) {
    return `<button type="button" class="${pullWorkspacePill}" data-pull-click="print" data-archive="${archive}" data-dock="${pullHtml(drop.dock)}" data-trip="${pullHtml(drop.trip)}" data-drop="${pullHtml(drop.drop)}">Checker Copy</button>`;
}

function renderPullMistakeCard(row, board, open=false) {
    const actions=pullAllowed(row,'fix_mistake') || (board.can_borrow && board.people.length);
    return `<article class="${pullWorkspaceCard}">${pullTagHeader(row)}${pullTagLocationList(row)}
        <p>${pullHtml(row.mistake_remaining)} to replace · ${pullHtml(row.mistake_reason)}</p>
        ${actions ? renderPullDisclosure('mistake',row.id,'Mistake Fix actions',open) : ''}</article>`;
}

function renderPullMistakeActions(row,board) {
    const max = pullHtml(row.mistake_remaining);
    const fields = `<label>Replacement location <input name="locationcode" required maxlength="40"></label>
        <label>Qty <input name="quantity" required type="number" min="1" step="1" max="${max}" value="${max}"></label>`;
    return (pullAllowed(row,'fix_mistake') ? pullForm('fix_mistake',{id:row.id},fields) : '')
        + renderPullBorrowPicker(board,row,['fix_mistake'],true);
}

function renderPullTrafficDrop(drop) {
    return `<details class="${pullWorkspaceCard}"><summary class="cursor-pointer text-sm font-semibold">
        Drop ${pullHtml(drop.drop)} · ${pullHtml(drop.trip)} · ${pullHtml(drop.consignee)} · Qty ${pullHtml(drop.quantity)}</summary>
        ${renderBloomscapesDockDocumentRows(drop.tags)}${pullCheckerCopyButton(drop,true)}</details>`;
}

function pullTagsByDrop(tags) {
    const index = new Map();
    for (const tag of tags) {
        const key = pullKey(tag);
        if (!index.has(key)) index.set(key,[]);
        index.get(key).push(tag);
    }
    return index;
}

function pullTrafficKey(receipt) {
    return String(receipt.id ?? JSON.stringify([receipt.dock,receipt.completed_at]));
}

function renderPullTrafficReceipt(receipt,open=false) {
    return `<article class="${pullWorkspaceCard}"><h3 class="font-bold">Dock ${pullHtml(receipt.dock)} · Loaded / Done</h3>
        <p class="text-xs">${pullHtml(receipt.completed_at ? new Date(receipt.completed_at).toLocaleString() : '')}</p>
        ${renderPullDisclosure('traffic',pullTrafficKey(receipt),'Completed drops',open)}</article>`;
}

function mountPullTrafficReceipt(content,receipt) {
    const drops=trafficReceiptDrops(receipt);
    renderBloomscapesListWindow(content,drops,drop=>bloomscapesListNode(renderPullTrafficDrop(drop)),'No completed drops.',0,undefined,3);
}

function trafficReceiptDrops(receipt) {
    if (!Array.isArray(receipt?.documents)) return [];
    const byDrop = pullTagsByDrop(receipt.documents.map(tag => ({...tag,dock:receipt.dock})));
    return Array.from(byDrop.values(),tags => ({
        ...tags[0],tags,quantity:tags.reduce((sum,tag) => sum + Number(tag.quantity || 0),0)
    })).sort((a,b) => Number(b.drop) - Number(a.drop));
}

function dockDropInstruction(drop) {
    const instruction = String(drop.instruction || '');
    if (/palletize/i.test(instruction)) return '🧱 PALLETIZE NOW';
    if (/ready.to.load/i.test(instruction)) return `🟢 READY TO LOAD (Dock #${drop.dock} · Drop #${drop.drop})`;
    return instruction;
}

function renderPullReportMistake(tag) {
    if (!pullAllowed(tag,'report_mistake') || !tag.mistake_phases?.length) return '';
    const labels = {inspection:'Inspector mistake',tagging:'Tagging shortage'};
    const options = tag.mistake_phases.map(phase => [phase,labels[phase]]);
    const available = pullPrintLines(tag).find(line => line.locationcode === tag.locationcode)?.quantity || 0;
    const fields = pullSelect('phase','Reason type',options,options[0][0])
        + `<label>Qty <input type="number" name="quantity" min="1" max="${pullHtml(available)}" required></label>
        <label>Reason <input name="reason" maxlength="300" required></label>`;
    return `<details><summary class="cursor-pointer">${pullHtml(tag.itemcode)} · Report mistake or shortage</summary>
        ${pullForm('report_mistake',{id:tag.id},fields,'Send to Mistake Fix')}</details>`;
}

function renderPullDropWork(drop, board) {
    const input = {dock:drop.dock,trip:drop.trip,drop:drop.drop};
    const tasks = ['checked','inspected','tagged','loaded'];
    const instruction = dockDropInstruction(drop);
    return `<article class="${pullWorkspaceCard}" data-pull-drop>
        <h3 class="font-bold">${pullHtml(drop.trip)} · Drop ${pullHtml(drop.drop)} · ${pullHtml(drop.status)}</h3>
        ${instruction ? `<p class="rounded bg-emerald-950 px-2 py-1 font-bold text-white">${pullHtml(instruction)}</p>` : ''}
        <div class="flex flex-wrap gap-2">${tasks.filter(task => pullAllowed(drop,task)).map(task => pullForm(task,input)).join('')}${pullCheckerCopyButton(drop)}</div>
        ${renderPullDisclosure('drop',pullKey(drop),'Location, quantity and mistake reports')}
        ${renderPullBorrowPicker(board,drop,tasks,false)}</article>`;
}

function mountPullDropEvidence(content,tags) {
    renderBloomscapesListWindow(content,tags,tag=>bloomscapesListNode(`<article class="${pullWorkspaceCard}">
        ${pullTagHeader(tag)}${pullTagLocationList(tag)}${renderPullReportMistake(tag)}</article>`),
        'No matching Pull Tags.',0,()=>restoreBloomscapesDockDrafts(content),8);
}

function renderBloomscapesDockDropTools(dock, drop) {
    const board = currentBloomscapesDockBoard();
    if (!board) return '';
    const normalizedDock = normalizeDockViewDockKey(dock);
    const normalizedDrop = normalizeDockViewStopKey(drop);
    const selected = board.drops.filter(entry => normalizeDockViewDockKey(entry.dock) === normalizedDock
        && normalizeDockViewStopKey(entry.drop) === normalizedDrop);
    if (!selected.length) return '';
    return `<section class="mb-3 space-y-2">${selected.map(entry => renderPullDropWork(entry,board)).join('')}</section>`;
}
