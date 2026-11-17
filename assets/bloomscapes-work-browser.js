const BLOOMSCAPES_WORK_VIEWS = {
    BUNCH_NOTES:'BUNCH NOTES',CAN_FILLING:'CAN FILLING',SHEARING:'SHEARING',Y_GRADING:'Shift Grading',HAULING:'HAULING'
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
        item:row.ITEMCODE || row.itemcode || '',lot:row.LOTCODE || row.lotcode || '',
        year:String(row.SALEYEAR || row.saleyear || ''),hold:String(row.HOLDSTOPCODE || row.holdstopcode || 'None')};
}

const bloomscapesWorkBrowserControllers=new WeakMap();

function mountBloomscapesWorkBrowser(host,onSelect,options={}) {
    const state={owner:getSupabaseReadIdentityScope(),mode:'block',path:[],onSelect,options};
    host.innerHTML='<label class="bloomscapes-compact-select">View<select data-work-modes aria-label="Work View"><option value="block">Block / Location</option><option value="common">Itemcodes / Common Name</option><option value="all">All Cards</option></select></label>'
        +'<h3>Step 2: BlockAlpha → BlockNumber → All Rows / Cards</h3>'
        +'<input type="search" data-work-search aria-label="Search work source inventory" placeholder="Search Names, ItemCodes, or Locations...">'
        +'<details data-work-more><summary>More</summary><div data-work-filters></div></details>'
        +'<button type="button" data-work-back>Back in work inventory</button><p data-work-breadcrumb></p>'
        +'<div data-work-group-selection></div>'
        +'<p data-work-browser-status></p><div data-work-source-cards class="bloomscapes-work-cards"></div>';
    mountBloomscapesWorkFilters(host,state);
    state.searchInput=host.querySelector('[data-work-search]');
    state.searchInput.addEventListener('input',()=>{renderBloomscapesWorkBrowser(host,state);});
    host.querySelector('[data-work-modes]').addEventListener('change',event=>{
        const mode=event.target.value;
        if (!mode) return;
        state.mode=mode;state.path=[];renderBloomscapesWorkBrowser(host,state);
    });
    const back=()=>{if (!state.path.length) return false;state.path.pop();renderBloomscapesWorkBrowser(host,state);return true;};
    host.querySelector('[data-work-back]').addEventListener('click',back);
    bloomscapesWorkBrowserControllers.set(host,{back,refresh:()=>{state.path=[];renderBloomscapesWorkBrowser(host,state);}});
    renderBloomscapesWorkBrowser(host,state);
}

function bloomscapesWorkLocationParts(row) {
    const location=String(row.LOCATIONCODE || row.locationcode || '').split('.');
    return [String(row.BLOCKALPHA || row.blockalpha || location[0] || 'Other'),
        String(row.BLOCKNUMBER || row.blocknumber || location[1] || 'Other'),row.LOCATIONCODE || row.locationcode || 'No location'];
}

function bloomscapesWorkBrowseProjection(host,state) {
    const search=state.searchInput.value;
    const filters=Object.fromEntries([...host.querySelectorAll('[data-work-filter]')].map(select=>[select.dataset.workFilter,select.value]));
    const all=applyInventoryExcelFilters(state.options.scope || 'studio',bloomscapesWorkBrowserRows(search,filters));
    const rows=all.filter(row=>{
        const parts=bloomscapesWorkBrowseParts(row,state.mode);
        return state.path.every((part,index)=>part===parts[index]);
    });
    const leaf=state.mode==='all' || search.trim()!=='' || state.path.length>=(state.mode==='block'?2:3);
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
    if (typeof parkBloomscapesWorkRowEditor==='function') parkBloomscapesWorkRowEditor(host);
    const cards=projection.leaf ? projection.rows.map(row=>bloomscapesWorkSourceCard(row,state.onSelect,state.options))
        : projection.groups.map(([key,count])=>bloomscapesWorkBrowseGroup(host,state,key,count,projection.rows));
    list.dataset.planningRevision=String(Number(list.dataset.planningRevision || 0)+1);
    list.replaceChildren(...cards);
    if (projection.leaf && !state.options.browseOnly) hydrateBloomscapesPlanningCards(list,projection.rows);
}

function renderBloomscapesWorkGroupSelection(host,state,rows) {
    const tools=host.querySelector('[data-work-group-selection]');tools.replaceChildren();
    if (state.options.browseOnly) return;
    if (state.mode!=='block' || state.path.length<2 || !rows.length) return;
    const [alpha,number]=state.path;
    const badge=tools.appendChild(document.createElement('strong'));badge.dataset.blockLifecycle='true';
    badge.textContent=alpha+'.'+number+' · '+bloomscapesBlockLifecycleStage(alpha,number);
    const button=tools.appendChild(document.createElement('button'));button.type='button';button.dataset.selectWorkScope='BLOCK';
    button.textContent='⚡ Queue Whole Block '+alpha+'.'+number+' ('+rows.length+' rows)';button.addEventListener('click',()=>state.onSelect(rows[0],'BLOCK'));
    if (state.path.length===2) renderBloomscapesWorkLocations(tools,host,state,rows);
    if (state.path.length===3) {
        const location=tools.appendChild(document.createElement('button'));location.type='button';location.dataset.selectWorkScope='LOCATION';
        location.textContent='Select Location '+state.path[2];location.addEventListener('click',()=>state.onSelect(rows[0],'LOCATION'));
    }
}

function bloomscapesWorkBrowseGroup(host,state,key,count,rows) {
    const group=document.createElement('section');
    const button=group.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workBrowseGroup=key;
    const cohort=rows.filter(row=>bloomscapesWorkBrowseParts(row,state.mode)[state.path.length]===key);
    const beds=new Set(cohort.map(row=>row.LOCATIONCODE || row.locationcode)).size;
    button.className='bloomscapes-work-group';button.textContent=key+' · '+count+' rows · '+beds+' beds';
    if (state.mode==='block' && state.path.length===1) button.textContent+=' · '+bloomscapesBlockLifecycleStage(state.path[0],key);
    button.addEventListener('click',()=>{state.path.push(key);renderBloomscapesWorkBrowser(host,state);});
    if (!state.options.browseOnly && state.mode==='block' && state.path.length===1) {
        const quick=group.appendChild(document.createElement('button'));quick.type='button';quick.dataset.queueWorkBlock=key;
        quick.textContent='⚡ Queue Whole Block '+state.path[0]+'.'+key+' ('+count+' rows)';
        quick.addEventListener('click',()=>state.onSelect(cohort[0],'BLOCK'));
    }
    return group;
}

function renderBloomscapesWorkLocations(tools,host,state,rows) {
    for (const key of new Set(rows.map(row=>row.LOCATIONCODE || row.locationcode))) {
        const button=tools.appendChild(document.createElement('button'));button.type='button';button.dataset.workBrowseGroup=key;
        button.textContent='Location '+key;
        button.addEventListener('click',()=>{state.path.push(key);renderBloomscapesWorkBrowser(host,state);});
    }
}

function mountBloomscapesWorkFilters(host,state) {
    const filters=host.querySelector('[data-work-filters]');
    for (const [key,title] of [['common','Common name'],['year','Year'],['season','Season'],['lot','Lot'],['size','Size'],['hold','Hold']]) {
        const label=filters.appendChild(document.createElement('label'));label.textContent=title;
        const select=label.appendChild(document.createElement('select'));select.dataset.workFilter=key;
        const all=document.createElement('option');all.textContent='All';all.value='';select.appendChild(all);
        const values=[...new Set(bloomscapesWorkBrowserRows().map(row=>bloomscapesWorkBrowserIdentity(row)[key]))].filter(Boolean).sort();
        values.forEach(value=>{const option=document.createElement('option');option.textContent=value;option.value=value;select.appendChild(option);});
        select.addEventListener('change',()=>{state.path=[];renderBloomscapesWorkBrowser(host,state);});
    }
    const clear=filters.appendChild(document.createElement('button'));clear.type='button';clear.textContent='Clear Filters';
    clear.addEventListener('click',()=>{
        for (const select of filters.querySelectorAll('select')) select.value='';
        state.searchInput.value='';state.path=[];renderBloomscapesWorkBrowser(host,state);
    });
}

function bloomscapesWorkSourceCard(row,onSelect,options={}) {
    const card=document.createElement('article');
    if (options.browseOnly) {
        card.innerHTML=generateCard(row,'drive','status-green',{originView:getCurrentVisibleViewId()});
        return card;
    }
    card.innerHTML=bloomscapesWorkIdentityMarkup(row);
    const button=card.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workSourceRow=String(row.UNIQUE_ID || row.unique_id);
    button.textContent='Select this physical row';
    button.addEventListener('click',()=>onSelect(row));
    appendBloomscapesStudioRowActions(card,row,onSelect);
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

function appendBloomscapesStudioRowActions(card,row,onSelect) {
    const controls=card.appendChild(document.createElement('div'));controls.dataset.workRowActions='true';
    for (const [action,title] of [['Bunch & Tie','🌿 Bunch'],['Shift Grading','📏 Grade (Shift Grading)'],
        ['Consolidate','🔗 Consolidate'],['Haul','🚜 Haul'],['Bunch Count','🔢 Count / Poly / Spread']]) {
        const button=controls.appendChild(document.createElement('button'));button.type='button';button.dataset.workRowAction=action;
        button.textContent=title;button.addEventListener('click',()=>onSelect(row,'SINGLE_ROW',action));
    }
}

function bloomscapesConsolidationCandidates(source) {
    const setting=typeof getCurrentAppSeasonSettings==='function'?getCurrentAppSeasonSettings().salesYear:null;
    const year=bloomscapesStudioSaleYear(setting);
    const sourceYear=bloomscapesStudioSaleYear(source.SALEYEAR ?? source.saleyear);
    if (year===null || sourceYear===null || sourceYear>year) return [];
    const item=source.ITEMCODE || source.itemcode,location=source.LOCATIONCODE || source.locationcode;
    return bloomscapesWorkBrowserRows().map(row=>resolveCanonicalInventoryRow(row)).filter(row=>{
        const candidateYear=bloomscapesStudioSaleYear(row.SALEYEAR ?? row.saleyear);
        return (row.ITEMCODE || row.itemcode)===item && (row.LOCATIONCODE || row.locationcode)!==location
            && candidateYear!==null && candidateYear<=year;
    }).sort((a,b)=>String(a.LOCATIONCODE || a.locationcode).localeCompare(String(b.LOCATIONCODE || b.locationcode),undefined,{numeric:true}));
}

function bloomscapesStudioSaleYear(value) {
    const text=String(value ?? '').trim();
    if (!/^(?:20)?[0-9]{2}$/.test(text)) return null;
    return Number(text.length===2?'20'+text:text);
}

function bloomscapesConsolidationDestinationLabel(row) {
    const value=key=>String(row[key] ?? row[key.toLowerCase()] ?? 'Not recorded');
    const beds=row.OPENBEDS ?? row.open_beds ?? 'Not recorded';
    const space=row.CANSPACE ?? row.can_space ?? 'Not recorded';
    return 'LOCATIONCODE '+value('LOCATIONCODE')+' · LOTCODE '+value('LOTCODE')+' · PTRAVAILABLE '+value('PTRAVAILABLE')
        +' · PTRREVIEW '+value('PTRREVIEW')+' · PTRONHAND '+value('PTRONHAND')+' · Open Beds / Can Space '+beds+' beds / '+space+' cans';
}
