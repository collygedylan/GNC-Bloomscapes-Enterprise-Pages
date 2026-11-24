const dockPipelineFields = [
    ['qacode','QA Code'],['wingdingunits','WINGDINGUNITS'],['dock','DOCK'],['stopnumber','STOPNUMBER'],
    ['picknote','PICKNOTE'],['itemcode','ITEMCODE'],['descriptorcode','DESCRIPTORCODE'],
    ['printedcontainercode','PRINTEDCONTAINERCODE'],['locationcode','LOCATIONCODE'],['lotcode','LOTCODE']
];

function dockPipelineFact([key,label], row) {
    return `<div><dt class="text-emerald-200">${label}</dt><dd class="break-words">${pullHtml(row[key])}</dd></div>`;
}

function dockPipelineRowButtons(row, view, readOnly) {
    const actions = row.stage === 'loaded' || readOnly ? [] : dockPipelineActions[view] || [];
    return actions.map(([action,label]) => `<button type="button" data-dock-pipeline-action="${action}"
        data-order-id="${pullHtml(row.unique_id)}" class="rounded-lg border border-emerald-400 px-3 py-2">${label}</button>`).join('');
}

function renderDockPipelineCard(row, view, readOnly) {
    const fieldMarkup = dockPipelineFields.map(field=>dockPipelineFact(field,row)).join('');
    const instructions = view === 'docks_loading_crew' ? [
        ['generalloadinstr','GENERALLOADINSTR'],['okloadinstructions','OKLOADINSTRUCTIONS']
    ].map(field=>dockPipelineFact(field,row)).join('') : '';
    const fixed = view === 'docks_inspector_copy' && row.fixed_at ? '<p>🔧 Mistake Fixed — Re-Inspect</p>' : '';
    const loaded = row.stage === 'loaded' ? '<p>✓ Loaded</p>' : '';
    return `<article class="space-y-3 rounded-xl border border-emerald-700 bg-emerald-950 p-3 text-white" data-dock-pipeline-row="${pullHtml(row.unique_id)}">
        <h3 class="text-base font-bold">${pullHtml(row.commonname || row.itemcode)}</h3>
        ${fixed}${loaded}<dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">${fieldMarkup}</dl>
        <dl class="space-y-2 text-sm">${instructions}</dl><div class="flex flex-wrap gap-2">${dockPipelineRowButtons(row,view,readOnly)}</div></article>`;
}

function renderDockPipelineGroup(group, index, level) {
    const label = level ? 'STOPNUMBER '+(group.stopnumber || 'Unassigned') : 'DOCK '+(group.dock || 'Unassigned');
    const trip = level && group.trip ? ` · Trip ${pullHtml(group.trip)}` : '';
    const progress = level && group.total ? ` · ${Math.floor(100*group.completed/group.total)}% inspector complete` : '';
    return `<button type="button" data-dock-pipeline-group="${index}"
        class="block w-full rounded-xl border border-emerald-700 bg-emerald-950 p-3 text-left text-white">
        <strong>${pullHtml(label)}</strong>${trip} · ${group.rows} rows${progress}</button>`;
}

function paintDockPipeline(container, crumb, {view, page, query, error, busy, readOnly, writing}) {
    const rows = page?.rows || [];
    const groups = page?.groups || [];
    const level = Object.hasOwn(query,'stopnumber') ? 2 : Number(Object.hasOwn(query,'dock'));
    const title = level ? 'DOCK '+(query.dock || 'Unassigned') : 'Select a Dock';
    crumb.textContent = level === 2 ? title+' › STOPNUMBER '+(query.stopnumber || 'Unassigned') : title;
    container.setAttribute('aria-busy',String(busy));
    const cards = rows.slice(0,40).map(row=>renderDockPipelineCard(row,view,readOnly));
    const tag = rows.length && view === 'docks_tagging_view' && !readOnly
        ? `<button type="button" data-dock-pipeline-action="tag" data-order-id="${pullHtml(rows[0].unique_id)}"
            class="rounded-lg border border-emerald-700 p-3">✓ Tagging Done — Send STOPNUMBER to Loading Crew</button>` : '';
    const previous = query.offset ? '<button type="button" data-dock-pipeline-page="-40">Previous</button>' : '';
    const next = rows.length > 40 ? '<button type="button" data-dock-pipeline-page="40">Next</button>' : '';
    const summary = page?.summary;
    const completion = summary?.total ? `<p>${summary.completed}/${summary.total} Inspector completed (${Math.floor(summary.completed*100/summary.total)}%)</p>` : '';
    const message = error || (writing ? 'Saving change…' : busy && !page ? 'Loading orders…' : !rows.length && !groups.length ? 'No orders in this view.' : '');
    container.innerHTML = `<div class="space-y-2"><p role="status">${pullHtml(message)}</p>${completion}${tag}${groups.length ? '<div data-dock-pipeline-directory></div>' : ''}${cards.join('')}
        <div class="flex justify-between gap-3">${previous}${next}</div></div>`;
    const list = container.querySelector('[data-dock-pipeline-directory]');
    if (list) renderBloomscapesScrollCards(list,groups.map((group,index)=>({group,index})),
        ({group,index})=>bloomscapesListNode(renderDockPipelineGroup(group,index,level)),{size:40,estimate:60});
}
