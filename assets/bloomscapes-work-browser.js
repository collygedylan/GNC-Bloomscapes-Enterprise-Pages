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

const bloomscapesWorkBrowserControllers=new WeakMap();

function mountBloomscapesWorkBrowser(host,onSelect,options={}) {
    const state={owner:getSupabaseReadIdentityScope(),mode:'block',path:[],offset:0,onSelect,options};
    host.innerHTML='<nav data-work-modes><button type="button" data-work-mode="block">📍 Block View</button>'
        +'<button type="button" data-work-mode="common">🌿 Common Name View</button></nav>'
        +'<input type="search" data-work-search aria-label="Search work source inventory" placeholder="Search Drive Mode items, locations or lots">'
        +'<button type="button" data-work-back>Back in work inventory</button><p data-work-breadcrumb></p>'
        +'<div data-work-group-selection></div>'
        +'<p data-work-browser-status></p><div data-work-source-cards class="bloomscapes-work-cards"></div>'
        +'<button type="button" data-work-next>Next 40 rows</button>';
    host.querySelector('[data-work-search]').addEventListener('input',()=>{state.offset=0;renderBloomscapesWorkBrowser(host,state);});
    host.querySelector('[data-work-modes]').addEventListener('click',event=>{
        const mode=event.target.closest('[data-work-mode]')?.dataset.workMode;
        if (!mode) return;
        state.mode=mode;state.path=[];state.offset=0;renderBloomscapesWorkBrowser(host,state);
    });
    const back=()=>{if (!state.path.length) return false;state.path.pop();state.offset=0;renderBloomscapesWorkBrowser(host,state);return true;};
    host.querySelector('[data-work-back]').addEventListener('click',back);
    host.querySelector('[data-work-next]').addEventListener('click',()=>{state.offset+=40;renderBloomscapesWorkBrowser(host,state);});
    bloomscapesWorkBrowserControllers.set(host,{back,refresh:()=>{state.path=[];state.offset=0;renderBloomscapesWorkBrowser(host,state);}});
    renderBloomscapesWorkBrowser(host,state);
}

function bloomscapesWorkLocationParts(row) {
    const location=String(row.LOCATIONCODE || row.locationcode || '').split('.');
    return [String(row.BLOCKALPHA || row.blockalpha || location[0] || 'Other'),
        String(row.BLOCKNUMBER || row.blocknumber || location[1] || 'Other'),row.LOCATIONCODE || row.locationcode || 'No location'];
}

function bloomscapesWorkBrowseProjection(host,state) {
    const search=host.querySelector('[data-work-search]').value;
    const kind=state.options.getWorkView?.();
    const all=bloomscapesWorkBrowserRows(search).filter(row=>kind!=='Y_GRADING' || ['Y','.Y'].includes(String(row.SEASON || row.season).toUpperCase()));
    const rows=all.filter(row=>{
        const parts=bloomscapesWorkBrowseParts(row,state.mode);
        return state.path.every((part,index)=>part===parts[index]);
    });
    const leaf=search.trim()!=='' || state.path.length===3;
    if (leaf) return {rows,leaf,groups:[]};
    const groups=new Map();
    for (const row of rows) {
        const parts=bloomscapesWorkBrowseParts(row,state.mode);
        const key=parts[state.path.length] || 'No common name recorded';
        groups.set(key,(groups.get(key) || 0)+1);
    }
    return {rows,leaf,groups:[...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))};
}

function bloomscapesWorkBrowseParts(row,mode) {
    const identity=bloomscapesWorkBrowserIdentity(row);
    return mode==='block' ? bloomscapesWorkLocationParts(row) : [identity.common,identity.size,identity.lot || identity.season];
}

function renderBloomscapesWorkBrowser(host,state) {
    if (state.owner!==getSupabaseReadIdentityScope()) return;
    const projection=bloomscapesWorkBrowseProjection(host,state);
    renderBloomscapesWorkGroupSelection(host,state,projection.rows);
    host.querySelector('[data-work-browser-status]').textContent=`${projection.rows.length} rows · ${getBloomscapesFarm()}`;
    host.querySelector('[data-work-breadcrumb]').textContent=[state.mode==='block' ? 'Block View' : 'Common Name View',...state.path].join(' → ');
    host.querySelector('[data-work-back]').hidden=state.path.length===0;
    for (const button of host.querySelectorAll('[data-work-mode]')) button.setAttribute('aria-pressed',String(button.dataset.workMode===state.mode));
    const list=host.querySelector('[data-work-source-cards]');
    const cards=projection.leaf ? projection.rows.slice(state.offset,state.offset+40).map(row=>bloomscapesWorkSourceCard(row,state.onSelect))
        : projection.groups.map(([key,count])=>bloomscapesWorkBrowseGroup(host,state,key,count));
    list.replaceChildren(...cards);
    host.querySelector('[data-work-next]').hidden=!projection.leaf;
    host.querySelector('[data-work-next]').disabled=state.offset+40>=projection.rows.length;
}

function renderBloomscapesWorkGroupSelection(host,state,rows) {
    const tools=host.querySelector('[data-work-group-selection]');tools.replaceChildren();
    if (state.mode!=='block' || state.path.length<2 || !rows.length) return;
    const [alpha,number]=state.path;
    const badge=tools.appendChild(document.createElement('strong'));badge.dataset.blockLifecycle='true';
    badge.textContent=alpha+'.'+number+' · '+bloomscapesBlockLifecycleStage(alpha,number);
    const button=tools.appendChild(document.createElement('button'));button.type='button';button.dataset.selectWorkScope='BLOCK';
    button.textContent='Select Whole Block '+alpha+'.'+number;button.addEventListener('click',()=>state.onSelect(rows[0],'BLOCK'));
    if (state.path.length===3) {
        const location=tools.appendChild(document.createElement('button'));location.type='button';location.dataset.selectWorkScope='LOCATION';
        location.textContent='Select Location '+state.path[2];location.addEventListener('click',()=>state.onSelect(rows[0],'LOCATION'));
    }
}

function bloomscapesWorkBrowseGroup(host,state,key,count) {
    const button=document.createElement('button');
    button.type='button';button.dataset.workBrowseGroup=key;
    button.className='bloomscapes-work-group';button.textContent=key+' · '+count+' rows';
    if (state.mode==='block' && state.path.length===1) button.textContent+=' · '+bloomscapesBlockLifecycleStage(state.path[0],key);
    button.addEventListener('click',()=>{state.path.push(key);state.offset=0;renderBloomscapesWorkBrowser(host,state);});
    return button;
}

function bloomscapesWorkSourceCard(row,onSelect) {
    const card=document.createElement('article');
    card.innerHTML=bloomscapesWorkIdentityMarkup(row);
    const button=card.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workSourceRow=String(row.UNIQUE_ID || row.unique_id);
    button.textContent='Select this physical row';
    button.addEventListener('click',()=>onSelect(row));
    return card;
}

function refreshBloomscapesWorkBrowser(host) {
    bloomscapesWorkBrowserControllers.get(host)?.refresh();
}

function backBloomscapesActiveWorkBrowser() {
    const root=document.querySelector('dialog[open]') || document.getElementById('view-'+getCurrentVisibleViewId());
    const host=root?.querySelector('[data-work-browser]:not([hidden])');
    return bloomscapesWorkBrowserControllers.get(host)?.back() || false;
}
