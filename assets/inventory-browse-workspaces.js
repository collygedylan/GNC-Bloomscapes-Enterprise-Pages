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

function renderBloomscapesNativeSalesOffice(view) {
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
    const entries=[['flyer','Flyer Folders & Marketing Flyer Builder'],['rep','Sales Rep Vault'],
        ['archive','My Work & Inquiry PDF Vault'],['smart','Smart Sales & Move Intelligence']];
    for (const [key,title] of entries) {
        const button=menu.appendChild(document.createElement('button'));
        button.type='button';button.textContent=title;
        button.addEventListener('click',()=>openSalesStudioSection(studio,key));
    }
    return true;
}

function openBloomscapesSalesFlyerStudio(view) {
    switchView(view);
    renderBloomscapesNativeSalesOffice(view);
    openSalesStudioSection(document.querySelector('#view-'+view+' [data-marketing-studio]'),'flyer');
}

function openSalesStudioSection(studio,key) {
    const host=studio.querySelector('[data-sales-content]');
    host.replaceChildren();
    if (key==='archive') {
        host.innerHTML=renderBloomscapesWorkflowPanel('bloomscapes-vault');
        return mountBloomscapesWorkflowPanel(host,'bloomscapes-vault');
    }
    if (key==='rep') return mountSalesRepRecords(host);
    if (key==='flyer' && canAccessView('tasks')) {
        const folders=host.appendChild(document.createElement('button'));
        folders.textContent='Open Flyer Folders';
        folders.addEventListener('click',()=>{switchView('tasks');setTaskTab('flyer');});
    }
    if (key==='smart' && canAccessView('smart-moves')) {
        const moves=host.appendChild(document.createElement('button'));
        moves.textContent='Open Smart Sales & Move Intelligence';
        moves.addEventListener('click',()=>switchView('smart-moves'));
    }
    mountSalesStudioLots(host);
}

function mountSalesStudioLots(host) {
    const search=host.appendChild(document.createElement('input'));
    search.type='search';search.placeholder='Find evaluated inventory';search.setAttribute('aria-label',search.placeholder);
    const list=host.appendChild(document.createElement('div'));
    const render=()=>{
        const rows=bloomscapesWorkBrowserRows(search.value).map(row=>resolveCanonicalInventoryRow(row))
            .filter(row=>Number(row.LOC_PHOTO_MATCH)>0);
        list.replaceChildren(...rows.slice(0,50).map(salesStudioLot));
        if (rows.length>50) list.append('Showing 50 of '+rows.length+' lots. Refine your search.');
        if (!rows.length) list.textContent='No matching evaluated lots.';
    };
    search.addEventListener('input',render);render();
}

function salesStudioLot(row) {
    const card=document.createElement('article');
    card.textContent=[row.COMMONNAME,row.ITEMCODE,row.LOCATIONCODE,row.LOTCODE,'Loc Photo Match '+row.LOC_PHOTO_MATCH].join(' · ');
    for (const [action,label] of [['flyer','Add to Flyer'],['request_action','Add to Request']]) {
        const button=card.appendChild(document.createElement('button'));
        button.textContent=label;
        button.addEventListener('click',()=>addSalesStudioLot(row,action));
    }
    return card;
}

function addSalesStudioLot(row,action) {
    const id=row.DOM_ID;
    if (!id || !bloomscapesFarmRowIsVisible(row)) return;
    const selected=()=>getCartSelectedItems().some(item=>item.DOM_ID===id);
    if (!selected()) toggleGlobalItem(id);
    if (selected()) initiateBatchAction(action);
}

function mountSalesRepRecords(host) {
    const kind=host.appendChild(document.createElement('select'));
    kind.setAttribute('aria-label','Record type');
    for (const [key,label] of [['ORDER','Customer orders'],['RESERVE','Reserves'],['REQUEST_COMPLETED','Completed photo requests']])
        kind.add(new Option(label,key));
    const rep=host.appendChild(document.createElement('input'));
    rep.type='search';rep.placeholder='Filter by sales rep';rep.setAttribute('aria-label',rep.placeholder);
    const list=host.appendChild(document.createElement('div'));
    const more=host.appendChild(document.createElement('button'));more.textContent='Load more';
    let revision=0,page=0;
    const load=async(reset)=>{
        const current=++revision;
        if (reset) {page=0;list.replaceChildren();}
        more.disabled=true;
        try {
            const rows=await readBloomscapesPanel('sales-studio-records',{kind:kind.value,page,rep:rep.value.trim()});
            if (revision!==current || !list.isConnected) return;
            list.append(...rows.map(salesStudioRecord));
            if (!page && !rows.length) list.textContent='No matching records.';
            page++;more.hidden=rows.length<50;
        } catch (error) {if (revision===current) more.textContent='Retry · '+error.message;}
        finally {if (revision===current) more.disabled=false;}
    };
    rep.addEventListener('change',()=>load(true));
    kind.addEventListener('change',()=>load(true));
    more.addEventListener('click',()=>load(false));
    void load(true);
}

function salesStudioRecord(row) {
    const card=document.createElement('article');
    card.textContent=[row.rep,row.customer,row.itemcode,row.quantity].filter(Boolean).join(' · ');
    if (row.folder) {
        const link=card.appendChild(document.createElement('a'));
        link.href='?'+new URLSearchParams({request_gallery:row.folder,row_id:row.row_id});
        link.textContent='Open photo gallery';
        const pdf=card.appendChild(document.createElement('button'));
        pdf.textContent='Export PDF';pdf.addEventListener('click',()=>printSalesStudioGallery(row,pdf));
    }
    return card;
}

async function printSalesStudioGallery(row,button) {
    const popup=window.open('','_blank');
    if (!popup) return;
    popup.opener=null;
    popup.document.title='Request photos · '+(row.customer || row.itemcode);
    try {
        const gallery=await readRequestPhotoGallery(row.folder,row.row_id);
        for (const crop of gallery.rows) {
            const section=popup.document.body.appendChild(popup.document.createElement('section'));
            section.textContent=[crop.commonName,crop.size,crop.location,crop.avNote].filter(Boolean).join(' · ');
            for (const url of crop.photos) {
                const image=section.appendChild(popup.document.createElement('img'));
                image.src=url;image.style.cssText='display:block;max-width:100%;max-height:80vh';
            }
        }
        await Promise.all(Array.from(popup.document.images,img=>img.decode()));
        popup.print();
    } catch (error) {popup.close();button.textContent='Retry export · '+error.message;}
}
