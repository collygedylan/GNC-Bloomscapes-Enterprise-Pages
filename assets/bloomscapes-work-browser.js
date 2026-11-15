const BLOOMSCAPES_WORK_VIEWS = {
    BUNCH_NOTES:'BUNCH NOTES',CAN_FILLING:'CAN FILLING',SHEARING:'SHEARING',Y_GRADING:'.Y GRADING',HAULING:'HAULING'
};

function bloomscapesWorkViewForPanel(tab) {
    return ({'bloomscapes-bunch-notes':'BUNCH_NOTES','bloomscapes-can-filling':'CAN_FILLING',
        'bloomscapes-grading':'Y_GRADING','bloomscapes-hauling':'HAULING',
        'bloomscapes-shearing':'SHEARING','bloomscapes-field-jobs':'BUNCH_NOTES'})[tab];
}

function bloomscapesWorkBrowserRows(search='',filters={}) {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (fullInventory || []).filter(bloomscapesFarmRowIsVisible).filter(row=>{
        const values = bloomscapesWorkBrowserIdentity(row);
        return Object.entries(filters).every(([key,value])=>!value || values[key]===value)
            && terms.every(term=>Object.values(values).join(' ').toLowerCase().includes(term));
    });
}

function bloomscapesWorkBrowserIdentity(row) {
    return {common:row.COMMONNAME || row.commonname || '',size:row.CONTSIZE || row.contsize || '',
        season:row.SEASON || row.season || '',location:row.LOCATIONCODE || row.locationcode || '',
        item:row.ITEMCODE || row.itemcode || '',lot:row.LOTCODE || row.lotcode || ''};
}

function mountBloomscapesWorkBrowser(host,onSelect) {
    const owner = getSupabaseReadIdentityScope();
    const search = host.appendChild(document.createElement('input'));
    search.type = 'search';
    search.placeholder = 'Search Drive Mode items, locations or lots';
    search.setAttribute('aria-label','Search work source inventory');
    const selectors = appendBloomscapesWorkBrowserFilters(host);
    const status = host.appendChild(document.createElement('p'));
    const list = host.appendChild(document.createElement('div'));
    list.dataset.workSourceCards = 'true';
    const next = host.appendChild(document.createElement('button'));
    next.type = 'button';
    next.textContent = 'Next 40 rows';
    let offset = 0;
    const render = ()=>{
        if (owner!==getSupabaseReadIdentityScope()) return;
        const filters = Object.fromEntries(selectors.map(select=>[select.dataset.field,select.value]));
        const rows = bloomscapesWorkBrowserRows(search.value,filters);
        status.textContent = `${rows.length} rows · ${getBloomscapesFarm()}`;
        list.replaceChildren(...rows.slice(offset,offset+40).map(row=>bloomscapesWorkSourceCard(row,onSelect)));
        next.disabled = offset+40>=rows.length;
    };
    const reset = ()=>{offset=0;render();};
    search.addEventListener('input',reset);
    selectors.forEach(select=>select.addEventListener('change',reset));
    next.addEventListener('click',()=>{offset+=40;render();});
    render();
}

function appendBloomscapesWorkBrowserFilters(host) {
    const rows = bloomscapesWorkBrowserRows();
    return ['common','size','season','location'].map(field=>{
        const select = host.appendChild(document.createElement('select'));
        select.dataset.field = field;
        select.setAttribute('aria-label',`Work source ${field}`);
        select.appendChild(new Option(`All ${field}`,''));
        const values = [...new Set(rows.map(row=>bloomscapesWorkBrowserIdentity(row)[field]))].filter(Boolean).sort();
        values.forEach(value=>select.appendChild(new Option(value,value)));
        return select;
    });
}

function bloomscapesWorkSourceCard(row,onSelect) {
    const canonical = resolveCanonicalInventoryRow(row);
    const identity = bloomscapesWorkBrowserIdentity(canonical);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.workSourceRow = String(row.UNIQUE_ID || row.unique_id);
    button.className = 'bloomscapes-work-source';
    button.textContent = [identity.common,identity.size,identity.item,identity.location,identity.lot,
        `On Hand ${canonical.PTRONHAND ?? canonical.ptronhand ?? 'Unknown'}`].join(' · ');
    button.addEventListener('click',()=>onSelect(row));
    return button;
}
