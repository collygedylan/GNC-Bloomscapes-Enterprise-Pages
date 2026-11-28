const BLOOMSCAPES_WORK_VIEWS = {
    BUNCH_NOTES:'BUNCH NOTES',CAN_FILLING:'CAN FILLING',SHEARING:'SHEARING',Y_GRADING:'Shift Grading',HAULING:'HAULING'
};

/** @param {string} tab Active work panel ID. @returns {string|undefined} Work type for a known panel. */
function bloomscapesWorkViewForPanel(tab) {
    return ({'bloomscapes-bunch-notes':'BUNCH_NOTES','bloomscapes-can-filling':'CAN_FILLING',
        'bloomscapes-grading':'Y_GRADING','bloomscapes-hauling':'HAULING',
        'bloomscapes-shearing':'SHEARING','bloomscapes-field-jobs':'BUNCH_NOTES'})[tab];
}

const bloomscapesWorkBrowserControllers=new WeakMap();

/** @param {HTMLElement} host Browser mount. @param {Function} onSelect Source choice handler. @param {object} [options] Scope and display options. @returns {void} */
function mountBloomscapesWorkBrowser(host,onSelect,options={}) {
    const state={owner:getSupabaseReadIdentityScope(),mode:'block',path:[],onSelect,options};
    const inventory=options.scope==='inventory';
    host.innerHTML='<label class="bloomscapes-compact-select">View<select data-work-modes aria-label="Work View"><option value="block">Block / Location</option><option value="common">Itemcodes / Common Name</option><option value="all">All Cards</option></select></label>'
        +(inventory ? '<label data-inventory-location class="bloomscapes-compact-select">Block <select aria-label="Block / Location"></select></label>' : '')
        +'<input type="search" data-work-search aria-label="Search work source inventory" placeholder="Search Names, ItemCodes, or Locations...">'
        +(inventory ? '' : '<details data-work-more><summary>More</summary><div data-work-filters></div></details>')
        +'<button type="button" data-work-back>Back in work inventory</button><p data-work-breadcrumb></p>'
        +'<div data-work-group-selection></div>'
        +'<p data-work-browser-status></p><div data-work-source-cards class="bloomscapes-work-cards"></div>';
    if (options.studioScopes || inventory) host.querySelector('[data-work-modes]').closest('label').hidden=true;
    if (inventory) mountBloomscapesInventoryLocation(host,state);
    else mountBloomscapesWorkFilters(host,state);
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

function mountBloomscapesInventoryLocation(host,state) {
    const select=state.locationFilter=host.querySelector('[data-inventory-location] select');
    select.add(new Option('All blocks / locations',''));
    select.addEventListener('change',()=>{
        state.path=[];
        renderBloomscapesWorkBrowser(host,state);
    });
}

function refreshBloomscapesInventoryLocation(state,rows) {
    const select=state.locationFilter;
    if (!select || state.locationOptionsRows===rows) return;
    state.locationOptionsRows=rows;
    const selected=select.value;
    select.replaceChildren(new Option('All blocks / locations',''));
    const locations=new Map();
    for (const row of rows) {
        const [block,location]=bloomscapesWorkLocationParts(row);
        if (block && !locations.has(block)) locations.set(block,new Set());
        if (location && block) locations.get(block).add(location);
    }
    for (const block of [...locations.keys()].sort(bloomscapesWorkGroupCollator.compare)) {
        const group=document.createElement('optgroup');
        group.label=block;
        group.appendChild(new Option(block,JSON.stringify([block])));
        for (const location of [...locations.get(block)].sort(bloomscapesWorkGroupCollator.compare)) {
            group.appendChild(new Option(location,JSON.stringify([block,location])));
        }
        select.appendChild(group);
    }
    select.value=selected;
    if (select.selectedIndex<0) select.selectedIndex=0;
}

function matchesBloomscapesInventoryLocation(row,path) {
    const parts=bloomscapesWorkLocationParts(row);
    return path.every((key,index)=>parts[index]===key);
}

function bloomscapesWorkBrowseProjection(host,state) {
    const search=state.searchInput.value;
    const filters=Object.fromEntries([...host.querySelectorAll('[data-work-filter]')].map(select=>[select.dataset.workFilter,select.value]));
    const filtered=applyInventoryExcelFilters(state.options.scope || 'studio',bloomscapesWorkBrowserRows(search,filters));
    if (state.locationFilter) refreshBloomscapesInventoryLocation(state,bloomscapesWorkBrowserRows());
    const location=state.locationFilter?.value;
    const path=location ? JSON.parse(location) : [];
    const all=path.length ? filtered.filter(row=>matchesBloomscapesInventoryLocation(row,path)) : filtered;
    const leaf=state.mode==='all' || (!state.options.studioScopes && search.trim()!=='') || state.path.length>=(state.mode==='block'?2:3);
    if (state.options.locationDrill && state.mode==='block' && (state.options.studioScopes || !search.trim())) {
        return bloomscapesStudioLocationProjection(state,all);
    }
    const rows=[], groups=new Map();
    for (const row of all) {
        const parts=bloomscapesWorkBrowseParts(row,state.mode);
        if (!state.path.every((part,index)=>part===parts[index])) continue;
        rows.push(row);
        if (leaf) continue;
        const key=parts[state.path.length] || 'No common name recorded';
        const entry=groups.get(key) || {key,count:0,beds:new Set(),first:row};
        entry.count++;
        entry.beds.add(row.LOCATIONCODE || row.locationcode);
        groups.set(key,entry);
    }
    return {rows:leaf && state.mode==='block' ? sortDriveLocationCards(rows) : rows,leaf,groups:[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}))};
}

function bloomscapesStudioLocationProjection(state,rows) {
    if (state.locationIndex?.rows!==rows) {
        const blocks=new Map();
        for (const row of rows) {
            const [block,location]=bloomscapesWorkLocationParts(row);
            const parent=bloomscapesWorkIndexGroup(blocks,block,row);
            parent.beds.add(row.LOCATIONCODE || row.locationcode);
            const child=bloomscapesWorkIndexGroup(parent.children,location,row);
            child.beds.add(row.LOCATIONCODE || row.locationcode);
        }
        state.locationIndex={rows,blocks};
    }
    const {blocks}=state.locationIndex;
    const [block,location]=state.path;
    const parent=blocks.get(block);
    if (state.path.length>1) return {leaf:true,rows:sortDriveLocationCards(parent?.children.get(location)?.rows || []),groups:[]};
    const compare=bloomscapesWorkGroupCollator.compare;
    const groups=[...(block ? parent?.children.values() || [] : blocks.values())].sort((a,b)=>compare(a.key,b.key));
    return {leaf:false,rows:block ? parent?.rows || [] : rows,groups};
}

const bloomscapesWorkGroupCollator=new Intl.Collator(undefined,{numeric:true});

function bloomscapesWorkIndexGroup(groups,key,row) {
    let group=groups.get(key);
    if (!group) {
        group={key,first:row,count:0,beds:new Set(),children:new Map(),rows:[]};
        groups.set(key,group);
    }
    group.count++;
    group.rows.push(row);
    return group;
}

function renderBloomscapesWorkBrowser(host,state) {
    if (state.owner!==getSupabaseReadIdentityScope()) return;
    state.options.onPathChange?.();
    const projection=bloomscapesWorkBrowseProjection(host,state);
    renderBloomscapesWorkGroupSelection(host,state,projection.rows);
    host.querySelector('[data-work-browser-status]').textContent=`${projection.rows.length} rows · ${getBloomscapesFarm()}`;
    host.querySelector('[data-work-breadcrumb]').textContent=[state.mode==='block' ? 'Block View' : 'Common Name View',...state.path].join(' → ');
    host.querySelector('[data-work-back]').hidden=state.path.length===0;
    for (const button of host.querySelectorAll('[data-work-mode]')) button.setAttribute('aria-pressed',String(button.dataset.workMode===state.mode));
    const list=host.querySelector('[data-work-source-cards]');
    if (typeof parkBloomscapesWorkRowEditor==='function') parkBloomscapesWorkRowEditor(host);
    if (projection.leaf && state.options.studioScopes) return renderBloomscapesStudioScopes(host,list,projection.rows,state);
    list.classList.toggle('inventory-block-tiles',state.options.scope==='inventory' && !projection.leaf);
    if (projection.leaf) renderBloomscapesScrollCards(list,projection.rows,row=>bloomscapesWorkSourceCard(row,state.onSelect,state.options),{estimate:340});
    else {
        mountBloomscapesScrollWindow(list,[],{});
        renderBloomscapesListWindow(list,projection.groups,entry=>bloomscapesWorkBrowseGroup(host,state,entry));
    }
}

function renderBloomscapesWorkGroupSelection(host,state,rows) {
    const tools=host.querySelector('[data-work-group-selection]');tools.replaceChildren();
    if (state.options.browseOnly || state.options.locationDrill) return;
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

function bloomscapesWorkBrowseGroup(host,state,{key,count,beds,first}) {
    const group=document.createElement('section');
    const button=group.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workBrowseGroup=key;
    const title=state.options.scope==='inventory' && state.mode==='block' && !state.path.length ? 'Block '+key : key;
    button.className='bloomscapes-work-group';button.textContent=title+' · '+count+' rows · '+beds.size+' beds';
    if (!state.options.locationDrill && state.mode==='block' && state.path.length===1) button.textContent+=' · '+bloomscapesBlockLifecycleStage(state.path[0],key);
    button.addEventListener('click',()=>{state.path.push(key);renderBloomscapesWorkBrowser(host,state);});
    if (!state.options.browseOnly && !state.options.locationDrill && state.mode==='block' && state.path.length===1) {
        const quick=group.appendChild(document.createElement('button'));quick.type='button';quick.dataset.queueWorkBlock=key;
        quick.textContent='⚡ Queue Whole Block '+state.path[0]+'.'+key+' ('+count+' rows)';
        quick.addEventListener('click',()=>state.onSelect(first,'BLOCK'));
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
    const fields=[['common','Common name'],['year','Year'],['season','Season'],['lot','Lot'],['size','Size'],['hold','Hold']];
    filters.innerHTML=fields.map(([key,title])=>renderBloomscapesChoiceField(key,title,key,'','All',
        {attributes:'data-work-filter="'+key+'"'})).join('');
    const sources=Object.fromEntries(fields.map(([key])=>[key,()=>[['','All'],...bloomscapesWorkBrowserFilterOptions(key).map(value=>[value,value])]]));
    bindBloomscapesChoiceFields(filters,sources);
    filters.onchange=()=>{state.path=[];renderBloomscapesWorkBrowser(host,state);};
    const clear=filters.appendChild(document.createElement('button'));clear.type='button';clear.textContent='Clear Filters';
    clear.addEventListener('click',()=>{
        for (const select of filters.querySelectorAll('select')) setBloomscapesChoiceFieldValue(select,'','All');
        state.searchInput.value='';state.path=[];renderBloomscapesWorkBrowser(host,state);
    });
}

/** @param {HTMLElement} host Existing browser mount. @returns {void} */
function refreshBloomscapesWorkBrowser(host) {
    bloomscapesWorkBrowserControllers.get(host)?.refresh();
}

/** @returns {boolean} Whether Back popped the current work browser's drill path. */
function backBloomscapesActiveWorkBrowser() {
    const root=document.querySelector('dialog[open]') || document.getElementById('view-'+getCurrentVisibleViewId());
    const host=root?.querySelector('[data-work-browser]:not([hidden])');
    return bloomscapesWorkBrowserControllers.get(host)?.back() || false;
}
