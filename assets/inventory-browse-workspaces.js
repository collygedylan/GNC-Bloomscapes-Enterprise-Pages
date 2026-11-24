const BLOOMSCAPES_BROWSE_VIEWS={sales:'sales',qc:'qc',production:'production','sales-inventory':'inventory','sales-office':'salesoffice'};
const BLOOMSCAPES_REP_VAULT_PAGE_SIZE=12;

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
    if (scope==='inventory' && (inventory84DirectMode || inventoryFieldCountingMode)) {
        root.querySelector('[data-main-inventory-browse]')?.remove();
        return;
    }
    if (root.querySelector(':scope > [data-department-workspace]')) return;
    let section=root.querySelector(':scope > [data-main-inventory-browse]');
    const owner=getSupabaseReadIdentityScope()+':'+getBloomscapesFarm();
    if (section?.dataset.owner===owner) {
        mountInventoryExcelFilters(scope);
        moveInventoryBrowseBorrowTrigger(root,section,scope);
        return;
    }
    section?.remove();section=document.createElement('section');section.dataset.mainInventoryBrowse=scope;section.dataset.owner=owner;
    section.innerHTML='<div data-main-browse-filters></div><div data-work-browser></div>';
    root.prepend(section);
    mountBloomscapesWorkBrowser(section.querySelector('[data-work-browser]'),openBloomscapesBrowseRow,{scope,browseOnly:true,locationDrill:scope==='inventory'});
    const mode = section.querySelector('[data-work-modes]').closest('label');
    const bar=section.querySelector('[data-main-browse-filters]');
    if (scope==='inventory') bar.prepend(section.querySelector('[data-inventory-location]'));
    else bar.prepend(mode);
    moveInventoryBrowseBorrowTrigger(root,section,scope);
    applyInventoryExcelFilters(scope,bloomscapesWorkBrowserRows());
}

function moveInventoryBrowseBorrowTrigger(root,section,scope) {
    if (scope!=='inventory') return;
    const button=root.querySelector('.freeze-panel [data-borrowed-field-trigger]');
    if (button) section.querySelector('[data-main-browse-filters]').appendChild(button);
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
        renderBloomscapesScrollCards(list,rows,row=>buildBloomscapesSalesInventoryCard(row,key),{empty:'No matching evaluated lots.'});
    };
    search.addEventListener('input',render);render();
    syncGlobalHeaderChrome({reason:'sales-studio-search',force:true});
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
    const status=host.appendChild(document.createElement('p'));
    status.setAttribute('role','status');
    const edge=host.appendChild(document.createElement('div'));
    edge.dataset.scrollPageEdge='';
    edge.hidden=true;
    const state={kind,rep,list,status,edge,rows:[],revision:0,owner:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm()};
    rep.addEventListener('change',()=>void loadSalesRepRecords(state,0));
    kind.addEventListener('change',()=>void loadSalesRepRecords(state,0));
    void loadSalesRepRecords(state,0);
}

async function loadSalesRepRecords(state,page) {
    const {kind,rep,edge,status}=state;
    const current=++state.revision;
    state.observer?.disconnect();
    edge.hidden=true;
    status.textContent='Loading records…';
    try {
        const rows=await readBloomscapesPanel('sales-studio-records',{kind:kind.value,page,rep:rep.value.trim()});
        if (ownsSalesRepPage(state,current)) showSalesRepPage(state,rows,page);
    } catch (error) {
        if (ownsSalesRepPage(state,current)) showSalesRepReadError(state,page,error);
    }
}

function showSalesRepReadError(state,page,error) {
    state.status.textContent=error.message+' ';
    const retry=state.status.appendChild(document.createElement('button'));
    retry.type='button';
    retry.textContent='Retry';
    retry.addEventListener('click',()=>void loadSalesRepRecords(state,page),{once:true});
}

function ownsSalesRepPage(state,revision) {
    return state.revision===revision && state.list.isConnected
        && state.owner===getSupabaseReadIdentityScope() && state.farm===getBloomscapesFarm();
}

function showSalesRepPage(state,rows,page) {
    const lookup=createSalesStudioTargetLookup();
    state.rows=page ? state.rows.concat(rows) : rows;
    renderBloomscapesScrollCards(state.list,state.rows,row=>buildSalesRepRecordCard(row,lookup(row)),{
        size:BLOOMSCAPES_REP_VAULT_PAGE_SIZE,empty:'No matching records.'
    });
    state.status.textContent='';
    state.edge.hidden=rows.length<50;
    if (!state.edge.hidden) state.observer=observeBloomscapesPageEdge(state.edge,()=>void loadSalesRepRecords(state,page+1));
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
