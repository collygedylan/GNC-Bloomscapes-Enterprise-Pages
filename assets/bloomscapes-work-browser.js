const BLOOMSCAPES_WORK_VIEWS = {
    BUNCH_NOTES:'BUNCH NOTES',CAN_FILLING:'CAN FILLING',SHEARING:'SHEARING',Y_GRADING:'Shift Grading',HAULING:'HAULING'
};

function bloomscapesWorkViewForPanel(tab) {
    return ({'bloomscapes-bunch-notes':'BUNCH_NOTES','bloomscapes-can-filling':'CAN_FILLING',
        'bloomscapes-grading':'Y_GRADING','bloomscapes-hauling':'HAULING',
        'bloomscapes-shearing':'SHEARING','bloomscapes-field-jobs':'BUNCH_NOTES'})[tab];
}

const bloomscapesWorkBrowserControllers=new WeakMap();

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
        const location=row.LOCATIONCODE || row.locationcode;
        const block=getDriveBlockAlphaLabel(getDriveBlockAlphaValue(row));
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
    return !path.length || getDriveBlockAlphaLabel(getDriveBlockAlphaValue(row))===path[0]
        && (path.length===1 || (row.LOCATIONCODE || row.locationcode)===path[1]);
}

function bloomscapesWorkLocationParts(row) {
    const location=String(row.LOCATIONCODE || row.locationcode || '').split('.');
    return [String(row.BLOCKALPHA || row.blockalpha || location[0] || 'Other'),
        String(row.BLOCKNUMBER || row.blocknumber || location[1] || 'Other'),row.LOCATIONCODE || row.locationcode || 'No location'];
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
        const parts=bloomscapesWorkBrowseParts(row,state.mode,state.options);
        if (!state.path.every((part,index)=>part===parts[index])) continue;
        rows.push(row);
        if (leaf) continue;
        const key=parts[state.path.length] || 'No common name recorded';
        const entry=groups.get(key) || {key,count:0,beds:new Set(),first:row};
        entry.count++;
        entry.beds.add(row.LOCATIONCODE || row.locationcode);
        groups.set(key,entry);
    }
    return {rows,leaf,groups:[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}))};
}

function bloomscapesStudioLocationProjection(state,rows) {
    if (state.locationIndex?.rows!==rows) {
        const blocks=new Map();
        for (const row of rows) {
            const block=getDriveBlockAlphaLabel(getDriveBlockAlphaValue(row)) || 'No common name recorded';
            const location=row.LOCATIONCODE || row.locationcode || 'No location';
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
    if (state.path.length>1) return {leaf:true,rows:parent?.children.get(location)?.rows || [],groups:[]};
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

function bloomscapesWorkBrowseParts(row,mode,options) {
    if (mode==='block' && options.locationDrill) return [getDriveBlockAlphaLabel(getDriveBlockAlphaValue(row)),row.LOCATIONCODE || row.locationcode || 'No location'];
    const identity=bloomscapesWorkBrowserIdentity(row);
    return mode==='block' ? bloomscapesWorkLocationParts(row) : [identity.common,identity.size,identity.lot || identity.season];
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

function refreshBloomscapesWorkBrowser(host) {
    bloomscapesWorkBrowserControllers.get(host)?.refresh();
}

function backBloomscapesActiveWorkBrowser() {
    const root=document.querySelector('dialog[open]') || document.getElementById('view-'+getCurrentVisibleViewId());
    const host=root?.querySelector('[data-work-browser]:not([hidden])');
    return bloomscapesWorkBrowserControllers.get(host)?.back() || false;
}

function bloomscapesWorkBrowserRows(search='',filters={}) {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const source = bloomscapesWorkBrowserDataset();
    if (!terms.length && !Object.values(filters).some(Boolean)) return source.rows;
    return source.rows.filter(row=>{
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

function bloomscapesWorkSourceCard(row,onSelect,options={}) {
    const card=document.createElement('article');
    if (options.browseOnly) {
        card.innerHTML=generateCard(row,'drive','status-green',{originView:getCurrentVisibleViewId()});
        return card;
    }
    card.innerHTML=bloomscapesWorkIdentityMarkup(row,{summary:true});
    const button=card.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workSourceRow=String(row.UNIQUE_ID || row.unique_id);
    button.textContent='Select this physical row';
    button.addEventListener('click',()=>onSelect(row));
    card.addEventListener('click',event=>{
        if (!event.target.closest('button,a,input,select,textarea,form,[data-work-row-editor]')) onSelect(row);
    });
    appendBloomscapesStudioRowActions(card,row,onSelect);
    return card;
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

function bloomscapesWorkBrowserDataset() {
    const owner = getSupabaseReadIdentityScope();
    const farm = getBloomscapesFarm();
    const epoch = typeof resolvedViewStateEpoch === 'number' ? resolvedViewStateEpoch : 0;
    const prior = bloomscapesWorkBrowserDataset.cached;
    if (prior?.source===fullInventory && prior.owner===owner && prior.farm===farm && prior.epoch===epoch) return prior;
    const rows = (fullInventory || []).filter(bloomscapesFarmRowIsVisible);
    return bloomscapesWorkBrowserDataset.cached = {source:fullInventory,owner,farm,epoch,rows,options:new Map()};
}

function bloomscapesWorkBrowserFilterOptions(key) {
    const dataset=bloomscapesWorkBrowserDataset();
    if (!dataset.options.has(key)) {
        const values=new Set();
        for (const row of dataset.rows) {
            const value=bloomscapesWorkBrowserIdentity(row)[key];
            if (value) values.add(value);
        }
        dataset.options.set(key,[...values].sort());
    }
    return dataset.options.get(key);
}

function getDriveBlockAlphaLabel(value = '') {
    return String(value || '') === DRIVE_NO_BLOCK_ALPHA ? 'No Block Alpha' : String(value || '').trim();
}

function getDriveBlockNumberLabel(value = '') {
    return String(value || '') === DRIVE_NO_BLOCK_NUMBER ? 'No Block Number' : String(value || '').trim();
}


function bloomscapesGrowerQuantity(row,fields) {
    const raw = firstNonEmptyValue(...fields.map((field) => row && row[field]), null);
    if (raw === null || String(raw).trim() === '') return null;
    const parsed = Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function sumBloomscapesGrowerQuantity(values) {
    return values.some((value) => value === null)
    ? 'Unknown'
    : formatShearDecisionNumber(values.reduce((total, value) => total + value, 0));
}

function renderBloomscapesGrowerInventoryGroup(group) {
    const expanded = growerScoutExpandedItem === group.key;
    const availableText = sumBloomscapesGrowerQuantity(group.rows.map((row) => bloomscapesGrowerQuantity(row, ['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable'])));
    const onHandText = sumBloomscapesGrowerQuantity(group.rows.map((row) => bloomscapesGrowerQuantity(row, ['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand'])));
    const photoRow = group.rows.find((row) => getPhotoUrlList(getRowPhotoLink(row, 'drive')).length > 0);
    const photoUrl = photoRow ? getPhotoUrlList(getRowPhotoLink(photoRow, 'drive'))[0] : '';
    const photoHtml = photoUrl
        ? buildDeferredCardPhotoImg(getDirectImageUrl(photoUrl, 'card-corner'), { className: 'grower-item-photo', alt: `${group.commonName} inventory photo` })
        : '<span class="grower-item-photo-placeholder" aria-hidden="true"><i class="ph-bold ph-image"></i></span>';
    const locations = new Map();
    group.rows.forEach((row) => {
        const name = String(firstNonEmptyValue(row.LOCATIONCODE, row.locationcode, 'No location'));
        if (!locations.has(name)) locations.set(name, []);
        locations.get(name).push(row);
    });
    const locationHtml = Array.from(locations.entries()).map(([name, locationRows]) => `<section class="grower-location-group"><div class="grower-location-total"><strong>Loc ${escapeHtml(name)}</strong><span>Avail ${escapeHtml(sumBloomscapesGrowerQuantity(locationRows.map((row) => bloomscapesGrowerQuantity(row, ['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable']))))} · OH ${escapeHtml(sumBloomscapesGrowerQuantity(locationRows.map((row) => bloomscapesGrowerQuantity(row, ['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand']))))}</span></div>${locationRows.map(renderGrowerInventoryRow).join('')}</section>`).join('');
    return `<article class="grower-inventory-item" data-grower-item-key="${escapeHtml(group.key)}"><button type="button" class="grower-item-toggle" aria-expanded="${expanded}" onclick="return toggleGrowerScoutItem('${escJsAttrValue(encodeURIComponent(group.key))}')">${photoHtml}<span><strong>${escapeHtml(group.commonName)}</strong><small>${escapeHtml(group.contSize)} · ${escapeHtml(group.itemCode)} · ${group.locations.size} locations · ${group.rows.length} rows</small></span><span class="grower-quantity-total">Avail ${escapeHtml(availableText)}<br>OH ${escapeHtml(onHandText)}</span></button>${expanded ? `<div class="grower-location-list">${locationHtml}</div>` : ''}</article>`;
}


function renderGrowerInventoryRow(row = null) {
    const uid = getShearDriveRowUid(row);
    const encoded = escJsAttrValue(encodeURIComponent(uid));
    const expanded = growerScoutExpandedRow === uid;
    const draft = growerScoutRowDrafts.get(uid) || { pestCode: '', sev: '', notes: '' };
    const location = String(firstNonEmptyValue(row.LOCATIONCODE, row.locationcode, '-'));
    const lot = String(firstNonEmptyValue(row.LOTCODE, row.lotcode, '-'));
    const available = bloomscapesGrowerQuantity(row,['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable']);
    const hand = bloomscapesGrowerQuantity(row,['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand']);
    const availableText = available === null ? 'Unknown' : formatShearDecisionNumber(available);
    const handText = hand === null ? 'Unknown' : formatShearDecisionNumber(hand);
    return `<section class="grower-inventory-row" data-grower-row-uid="${escapeHtml(uid)}"><button type="button" class="grower-row-toggle" aria-expanded="${expanded}" onclick="return toggleGrowerScoutRow('${encoded}')"><span>Loc ${escapeHtml(location)} · Lot ${escapeHtml(lot)}</span><strong>Avail ${escapeHtml(availableText)} · OH ${escapeHtml(handText)}</strong></button>${expanded ? `<div class="grower-row-details"><div class="grower-scout-input-grid"><label>Pest Code / ID<input data-grower-draft-field="pestCode" value="${escapeHtml(draft.pestCode)}" maxlength="80" oninput="return updateGrowerScoutDraft(this)"></label><label>Sev (0–50)<input type="number" min="0" max="50" step="1" inputmode="numeric" data-grower-draft-field="sev" value="${escapeHtml(draft.sev)}" oninput="return updateGrowerScoutDraft(this)"></label></div><label class="grower-scout-notes">Notes<textarea data-grower-draft-field="notes" rows="2" oninput="return updateGrowerScoutDraft(this)">${escapeHtml(draft.notes)}</textarea></label><button type="button" class="grower-scout-save" onclick="return saveGrowerScoutRowLog('${encoded}', this)">Save scouting log</button></div>` : ''}</section>`;
}
