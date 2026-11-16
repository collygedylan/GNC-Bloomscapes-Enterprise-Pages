const BLOOMSCAPES_BROWSE_VIEWS={sales:'sales',qc:'qc',production:'production','sales-inventory':'inventory','sales-office':'salesoffice'};

function getBloomscapesBrowseFilterHost(scope) {
    const view=Object.keys(BLOOMSCAPES_BROWSE_VIEWS).find(view=>BLOOMSCAPES_BROWSE_VIEWS[view]===scope);
    if (!view || getCurrentVisibleViewId()!==view) return null;
    const root=document.getElementById('view-'+view);
    return root?.querySelector('[data-main-browse-filters]') || null;
}

function mountBloomscapesInventoryBrowse(view) {
    const scope=BLOOMSCAPES_BROWSE_VIEWS[view],root=document.getElementById('view-'+view);
    if (!scope || !root || !nativeAuthSessionActive || !canAccessView('drive')) return;
    if (root.querySelector(':scope > [data-department-workspace]')) return;
    let section=root.querySelector(':scope > [data-main-inventory-browse]');
    const owner=getSupabaseReadIdentityScope()+':'+getBloomscapesFarm();
    if (section?.dataset.owner===owner) return;
    section?.remove();section=document.createElement('section');section.dataset.mainInventoryBrowse=scope;section.dataset.owner=owner;
    section.innerHTML='<h2>Inventory cards</h2><div data-main-browse-filters></div><div data-work-browser></div>';
    root.prepend(section);
    mountBloomscapesWorkBrowser(section.querySelector('[data-work-browser]'),openBloomscapesBrowseRow,{scope,browseOnly:true});
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
    if (!nativeAuthSessionActive || view!=='sales-office') return false;
    const root=document.getElementById('view-'+view);
    for (const child of root.children) {
        if (!child.hasAttribute('data-main-inventory-browse')) child.hidden=true;
    }
    return true;
}
