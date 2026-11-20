function mountBloomscapesOrderDocuments(host,audience) {
    if (!host || !nativeAuthSessionActive) return;
    const scope=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm();
    const existing=host.querySelector('[data-split-documents]');
    if (existing?.dataset.owner===scope && existing.dataset.farm===farm) return;
    existing?.remove();
    const details=document.createElement('details');
    details.dataset.splitDocuments=audience;
    details.dataset.owner=scope;
    details.dataset.farm=farm;
    details.className='app-smart-card';
    details.appendChild(document.createElement('summary')).textContent=audience==='office'?'Argos Office · split-location orders':'Split-location order documents';
    const content=details.appendChild(document.createElement('div'));
    const state={offset:0,busy:false,details,content,scope,farm,audience};
    details.addEventListener('toggle',()=>{if(details.open) void loadSplitOrderDocuments(state);});
    host.appendChild(details);
}

async function loadSplitOrderDocuments(state) {
    if (state.busy) return;
    state.busy=true;
    try {
        const rows=await readBloomscapesSplitOrderDocuments(state.farm,state.audience,state.offset);
        if (!state.details.isConnected || state.scope!==getSupabaseReadIdentityScope() || state.farm!==getBloomscapesFarm()) return;
        const fragment=document.createDocumentFragment();
        rows.forEach(row=>fragment.appendChild(renderSplitOrderDocument(row)));
        if (!rows.length) fragment.appendChild(document.createTextNode('No split-location orders on this page.'));
        appendSplitDocumentPager(fragment,state,rows.length);
        state.content.replaceChildren(fragment);
    } catch(error) {
        if (state.details.isConnected && state.scope===getSupabaseReadIdentityScope()) state.content.textContent=error.message;
    } finally {state.busy=false;}
}

function renderSplitOrderDocument(row) {
    const item=document.createElement('article');
    item.appendChild(document.createElement('h4')).textContent=[row.customer,row.consignee].filter(Boolean).join(' · ');
    item.appendChild(document.createElement('p')).textContent=[row.itemcode,row.commonname,'Dock '+row.dock,'Drop '+row.drop].join(' · ');
    for(const segment of row.segments) {
        item.appendChild(document.createElement('p')).textContent=segment.locationcode+' · Qty '+segment.quantity;
    }
    return item;
}

function appendSplitDocumentPager(host,state,count) {
    for(const [label,step] of [['Previous',-40],['Next',40]]) {
        if ((step<0 && !state.offset) || (step>0 && count<40)) continue;
        const button=host.appendChild(document.createElement('button'));
        button.type='button';
        button.textContent=label;
        button.addEventListener('click',()=>{
            if (state.busy) return;
            state.offset=Math.max(0,state.offset+step);
            void loadSplitOrderDocuments(state);
        });
    }
}

function mountBloomscapesDockLinks() {
    const host=document.getElementById('docks-dispatch-links');
    if (!host) return;
    const buttons=[];
    for (const [view,label] of Object.entries(bloomscapesDockWorkspaceTitles)) {
        if (!canOpenBloomscapesDocksWorkspace(view)) continue;
        const button=document.createElement('button');
        button.type='button';
        button.className='sales-card-action';
        button.textContent=label;
        button.addEventListener('click',()=>switchView(view));
        buttons.push(button);
    }
    host.replaceChildren(...buttons);
}

function mountBloomscapesDockShell(doc) {
    const root=doc.getElementById('view-docks');
    if (!root || root.querySelector('#docks-content')) return;
    root.innerHTML=`<div class="freeze-panel ops-module-filter-band">
<div id="docks-search-container" class="sticky-search relative mb-2">
<input type="text" id="docks-search" class="input-field w-full pr-10 !mb-0" placeholder="Search common name or location..." oninput="handleDocksSearch(event)" onkeydown="dismissSearchKeyboard(event)" autocomplete="off">
<button id="docks-search-clear" type="button" aria-label="Clear Docks search" class="absolute right-0 top-0 text-gray-400 text-lg hidden" onclick="clearDocksSearch()"><i class="ph-bold ph-x" aria-hidden="true"></i></button>
</div>
<div id="docks-filter-controls" class="docks-top-inline workflow-control-rail mb-3"></div>
<div id="docks-mode-toggle" class="hidden" aria-hidden="true">
<button id="dock-mode-btn-docks" class="rounded-xl border border-green-200 bg-[#007a4d] px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-sm active:scale-95" onclick="setDockViewMode('docks')">Docks</button>
<button id="dock-mode-btn-mistakes" class="rounded-xl border border-red-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-red-600 shadow-sm active:scale-95" onclick="setDockViewMode('mistakes')">Mistake</button>
<button id="dock-mode-btn-dropoff" class="rounded-xl border border-green-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#007a4d] shadow-sm active:scale-95" onclick="setDockViewMode('dropoff')">Drop Off</button>
</div>
<div id="docks-crumb" class="text-xs font-bold text-orange-600 mb-3 mt-3">Select a Dock</div>
</div>
<nav id="docks-dispatch-links" class="flex gap-2 overflow-x-auto" aria-label="Dock workflows"></nav>
<div id="docks-content"></div>`;
    root.insertAdjacentHTML('beforebegin',`<div id="view-pull-tags" class="hidden" aria-label="Pull Tags"></div>
<div id="view-borrowed-work" class="hidden" aria-label="Borrowed Work"></div>
<div id="view-mistake-fix" class="hidden" aria-label="Mistake Fix"></div>
<div id="view-traffic-office" class="hidden" aria-label="Traffic Office"></div>`);
}

function mountBloomscapesDockDrawerLinks(drawer) {
    const menu=drawer?.querySelector('#drawer-docks-btn');
    if (!menu || drawer.querySelector('[data-drawer-view="time-cards"]')) return;
    menu.insertAdjacentHTML('beforebegin',`<button type="button" class="drawer-item hidden" hidden data-drawer-view="pull-tags" onclick="return openDrawerView('pull-tags')">Pull Tags</button>
<button type="button" class="drawer-item hidden" hidden data-drawer-view="time-cards" onclick="return openDrawerView('time-cards')">Time Cards</button>
<button type="button" class="drawer-item hidden" hidden data-drawer-view="borrowed-work" onclick="return openDrawerView('borrowed-work')">Borrowed Work</button>
<button type="button" class="drawer-item hidden" hidden data-drawer-view="mistake-fix" onclick="return openDrawerView('mistake-fix')">Mistake Fix</button>
<button type="button" class="drawer-item hidden" hidden data-drawer-view="traffic-office" onclick="return openDrawerView('traffic-office')">Traffic Office</button>`);
}

mountBloomscapesDockShell(document);
