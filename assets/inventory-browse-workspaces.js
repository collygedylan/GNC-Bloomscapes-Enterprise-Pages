const BLOOMSCAPES_BROWSE_VIEWS={sales:'sales',qc:'qc',production:'production','sales-inventory':'inventory','sales-office':'salesoffice'};

function getBloomscapesBrowseFilterHost(scope) {
    const view=Object.keys(BLOOMSCAPES_BROWSE_VIEWS).find(view=>BLOOMSCAPES_BROWSE_VIEWS[view]===scope);
    if (!view || getCurrentVisibleViewId()!==view) return null;
    const root=document.getElementById('view-'+view);
    return root?.querySelector('[data-main-browse-filters]') || null;
}

function mountBloomscapesInventoryBrowse(view) {
    if (view==='drive') { mountInventoryExcelFilters('drive'); return; }
    if (view==='managers' && activeHomeTab===MANAGER_EVAL_REPORTS_2_VIEW) {
        mountInventoryExcelFilters('eval2');return;
    }
    const scope=BLOOMSCAPES_BROWSE_VIEWS[view],root=document.getElementById('view-'+view);
    if (root?.querySelector('[data-marketing-studio]')) return;
    if (!scope || !root || !nativeAuthSessionActive || !canAccessView('drive')) return;
    if (root.querySelector(':scope > [data-department-workspace]')) return;
    let section=root.querySelector(':scope > [data-main-inventory-browse]');
    const owner=getSupabaseReadIdentityScope()+':'+getBloomscapesFarm();
    if (section?.dataset.owner===owner) { mountInventoryExcelFilters(scope); return; }
    section?.remove();section=document.createElement('section');section.dataset.mainInventoryBrowse=scope;section.dataset.owner=owner;
    section.innerHTML='<h2>Inventory cards</h2><div data-main-browse-filters></div><div data-work-browser></div>';
    root.prepend(section);
    mountBloomscapesWorkBrowser(section.querySelector('[data-work-browser]'),openBloomscapesBrowseRow,{scope,browseOnly:true});
    const mode = section.querySelector('[data-work-modes]').closest('label');
    section.querySelector('[data-main-browse-filters]').prepend(mode);
    applyInventoryExcelFilters(scope,bloomscapesWorkBrowserRows());
}

function openBloomscapesBrowseRow(row) {
    openDetail(String(row.UNIQUE_ID || row.unique_id),'drive');
}

function refreshBloomscapesInventoryBrowse(scope) {
    const root=document.querySelector('[data-main-inventory-browse="'+scope+'"] [data-work-browser]');
    if (root) refreshBloomscapesWorkBrowser(root);
}

function renderBloomscapesNativeSalesOffice(view,section='design') {
    if (!nativeAuthSessionActive || !['sales','sales-office'].includes(view)) return false;
    const root=document.getElementById('view-'+view);
    const owner=getSupabaseReadIdentityScope()+':'+getBloomscapesFarm();
    const mounted=root.querySelector('[data-marketing-studio]');
    if (mounted?.dataset.owner===owner) return true;
    mounted?.remove();
    for (const child of root.children) child.hidden=true;
    const studio=root.appendChild(document.createElement('section'));
    studio.dataset.marketingStudio=view;
    studio.dataset.owner=owner;
    studio.innerHTML='<h2>Sales &amp; Marketing Studio</h2><nav data-studio-modules></nav><section data-sales-content></section>';
    const menu=studio.querySelector('nav');
    const entries=[['design','🎨 Design Studio'],['flyer','🗂️ Flyer Folders'],['history','🏛️ Flyer History Archive'],['rep','💼 Sales Rep Vault'],
        ['archive','📄 Inquiry PDF Vault'],['smart','🧠 Smart Sales']];
    for (const [key,title] of entries) {
        const button=menu.appendChild(document.createElement('button'));
        button.type='button';button.textContent=title;
        button.dataset.salesSection=key;button.setAttribute('aria-pressed','false');
        button.addEventListener('click',()=>openSalesStudioSection(studio,key));
    }
    openSalesStudioSection(studio,section);
    return true;
}

function openBloomscapesSalesFlyerStudio(view) {
    switchView(view);
    renderBloomscapesNativeSalesOffice(view,'flyer');
    const studio=document.querySelector('#view-'+view+' [data-marketing-studio]');
    if (!studio?.querySelector('[data-sales-section=flyer][aria-pressed=true]')) openSalesStudioSection(studio,'flyer');
}

function openSalesStudioSection(studio,key,canvas=null,options={}) {
    if (!studio) return;
    for (const button of studio.querySelectorAll('[data-sales-section]')) {
        button.setAttribute('aria-pressed',String(button.dataset.salesSection===key));
    }
    const host=studio.querySelector('[data-sales-content]');
    host.replaceChildren();
    if (key==='design') return openSalesStudioDesign(studio,host,canvas,options);
    if (key==='history') return mountBloomscapesFlyerHistory(host,(copy,settings)=>openSalesStudioSection(studio,'design',copy,settings));
    if (key==='archive') {
        host.innerHTML=renderBloomscapesWorkflowPanel('bloomscapes-vault');
        return mountBloomscapesWorkflowPanel(host,'bloomscapes-vault');
    }
    if (key==='rep') return mountSalesRepWorkspace(host);
    if (key==='flyer' && canAccessView('tasks')) {
        const folders=host.appendChild(document.createElement('button'));
        folders.type='button';folders.className='sales-studio-navigation';folders.textContent='Open Flyer Folders';
        folders.addEventListener('click',()=>{switchView('tasks');setTaskTab('flyer');});
    }
    if (key==='smart' && canAccessView('smart-moves')) {
        const moves=host.appendChild(document.createElement('button'));
        moves.type='button';moves.className='sales-studio-navigation';moves.textContent='Open Smart Sales & Move Intelligence';
        moves.addEventListener('click',()=>switchView('smart-moves'));
    }
    mountSalesStudioLots(host,key);
}

function mountSalesRepWorkspace(host) {
    mountBloomscapesDockCreditVault(host);
    const records=host.appendChild(document.createElement('details'));
    records.appendChild(document.createElement('summary')).textContent='Other Sales Rep records';
    const body=records.appendChild(document.createElement('div'));
    records.addEventListener('toggle',()=>{ if (records.open && !body.firstChild) mountSalesRepRecords(body); });
}

function mountSalesStudioLots(host,key) {
    const search=host.appendChild(document.createElement('input'));
    search.type='search';search.placeholder='Find evaluated inventory';search.setAttribute('aria-label',search.placeholder);
    const list=host.appendChild(document.createElement('div'));
    list.className='bloomscapes-sales-card-list';
    const render=()=>{
        const rows=bloomscapesWorkBrowserRows(search.value).map(row=>resolveCanonicalInventoryRow(row))
            .filter(row=>Number(row.LOC_PHOTO_MATCH)>0);
        renderBloomscapesListWindow(list,rows,row=>buildBloomscapesSalesInventoryCard(row,key),'No matching evaluated lots.');
    };
    search.addEventListener('input',render);render();
}

function mountSalesRepRecords(host) {
    const kind=host.appendChild(document.createElement('select'));
    kind.setAttribute('aria-label','Record type');
    for (const [key,label] of [['ORDER','Customer orders'],['RESERVE','Reserves'],['REQUEST_COMPLETED','Completed photo requests']])
        kind.add(new Option(label,key));
    const rep=host.appendChild(document.createElement('input'));
    rep.type='search';rep.placeholder='Filter by sales rep';rep.setAttribute('aria-label',rep.placeholder);
    const list=host.appendChild(document.createElement('div'));
    list.className='bloomscapes-sales-card-list';
    const previous=host.appendChild(document.createElement('button'));
    previous.type='button';previous.className='sales-studio-navigation';previous.textContent='Previous';
    const more=host.appendChild(document.createElement('button'));
    more.type='button';more.className='sales-studio-navigation';more.textContent='Load more';
    const state={kind,rep,list,more,previous,page:0,revision:0,owner:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm()};
    rep.addEventListener('change',()=>loadSalesRepRecords(state,0));
    kind.addEventListener('change',()=>loadSalesRepRecords(state,0));
    previous.addEventListener('click',()=>loadSalesRepRecords(state,state.page-1));
    more.addEventListener('click',()=>loadSalesRepRecords(state,state.retryPage ?? state.page+1));
    void loadSalesRepRecords(state,0);
}

async function loadSalesRepRecords(state, page) {
    const {kind,rep,more}=state;
    const current=++state.revision;
    state.previous.disabled=true;
    state.retryPage=page;
    more.disabled=true;
    more.textContent='Next';
    try {
        const rows=await readBloomscapesPanel('sales-studio-records',{kind:kind.value,page,rep:rep.value.trim()});
        if (ownsSalesRepPage(state,current)) showSalesRepPage(state,rows,page);
    } catch (error) {
        if (ownsSalesRepPage(state,current)) {
            more.hidden=false;
            more.textContent='Retry · '+error.message;
        }
    } finally {
        if (state.revision===current) { more.disabled=false; state.previous.disabled=state.page===0; }
    }
}

function ownsSalesRepPage(state, revision) {
    return state.revision===revision && state.list.isConnected
        && state.owner===getSupabaseReadIdentityScope() && state.farm===getBloomscapesFarm();
}

function showSalesRepPage(state, rows, page) {
    const lookup=createSalesStudioTargetLookup();
    state.retryPage=null;
    if (page && !rows.length) { state.more.hidden=true; return; }
    state.page=page;
    state.list.replaceChildren(...rows.slice(0,50).map(row=>buildSalesRepRecordCard(row,lookup(row))));
    if (!state.page && !rows.length) state.list.textContent='No matching records.';
    state.more.hidden=rows.length<50;
}

function buildSalesRepRecordCard(record, row) {
    const pdfAction = record.folder ? button=>printSalesStudioGallery(record,button) : null;
    return renderBloomscapesSalesCard(record,row,pdfAction);
}

function openSalesStudioDesign(studio,host,canvas,options) {
    const saved=canvas ? {canvas,options} : studio.flyerDraft || {canvas:null,options:{}};
    if (canvas && !options.readOnly) studio.flyerDraft=saved;
    const onChange=updated=>{
        if (!saved.options.readOnly && studio.isConnected && studio.dataset.owner===getSupabaseReadIdentityScope()+':'+getBloomscapesFarm()) {
            studio.flyerDraft={canvas:updated,options:saved.options};
        }
    };
    return mountBloomscapesFlyerDesigner(host,saved.canvas,{...saved.options,onChange});
}
