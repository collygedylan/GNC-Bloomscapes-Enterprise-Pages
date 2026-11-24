const consolidationNaturalOrder = new Intl.Collator(undefined,{numeric:true});


function consolidationField(row,key) {
    return String(row[key] ?? row[key.toLowerCase()] ?? '').trim();
}

function buildFieldWorkConsolidationIndex(rows, resolve = resolveCanonicalInventoryRow) {
    const items = new Map();
    for (const input of rows.flatMap(row=>row.__physicalInventoryRows || [row])) {
        const identity = bloomscapesWorkBrowserIdentity(input);
        const code = identity.item.trim();
        if (!code) continue;
        if (!items.has(code)) items.set(code,createConsolidationIndexItem(code,identity));
        const item = items.get(code);
        const row = resolve(input);
        const location = LocationCode.normalize(consolidationField(row,'LOCATIONCODE'));
        const block = LocationCode.base(location);
        addConsolidationBrowseLocation(item,location,block);
        const year = consolidationField(row,'SALEYEAR');
        const quantity = Number(consolidationField(row,'PTRONHAND').replaceAll(',',''));
        if (!/^20\d{2}$/.test(year) || !(quantity > 0)) continue;
        recordConsolidationLot(item,year,row,location,block,quantity);
    }
    const entries = [...items.values()];
    for (const item of entries) item.distributed = [...item.years.values()].some(group=>group.blocks.size - Number(group.blocks.has('')) > 1);
    return entries.sort((a,b)=>consolidationNaturalOrder.compare(a.name,b.name) || a.code.localeCompare(b.code));
}

function createConsolidationIndexItem(code,{common,size}) {
    const name = typeof normalizeEscapedDisplayText === 'function' ? normalizeEscapedDisplayText(common || code) : common || code;
    return {code,name,size,searchCode:code.toLowerCase(),searchName:name.toLowerCase(),years:new Map(),blocks:new Set(),locations:new Map(),rowCount:0};
}

function addConsolidationBrowseLocation(item,location,block) {
    item.rowCount++;
    if (!block) return;
    item.blocks.add(block);
    const previous = item.locations.get(block);
    const first = previous && LocationCode.compare(previous.first,location) <= 0 ? previous.first : location;
    item.locations.set(block,{first,count:(previous?.count || 0)+1});
}

function recordConsolidationLot(item,year,row,location,block,quantity) {
    if (!item.years.has(year)) item.years.set(year,{year,cans:0,excluded:0,blocks:new Set(),lots:[]});
    const group = item.years.get(year);
    const lot = consolidationField(row,'LOTCODE');
    if (consolidationField(row,'SEASON').toUpperCase()==='Y' || /\.Y$/i.test(lot)) {
        group.excluded += quantity;
        return;
    }
    group.cans += quantity;
    const canonicalBlock = /^[A-Z]+\.\d{1,2}$/.test(block) ? block.replace(/\.(\d)$/,'.0$1')+'.000' : '';
    group.blocks.add(canonicalBlock);
    group.lots.push({location,block:canonicalBlock,lot,source:consolidationField(row,'SOURCE'),quantity});
}

function consolidationMatchesPath(item,mode,path) {
    const [first,second] = path;
    if (!first) return true;
    if (mode==='common') return item.name===first && (!second || (item.size || 'Size not recorded')===second);
    return second ? item.blocks.has(second) : [...item.blocks].some(block=>block.split('.')[0]===first);
}

function addConsolidationGroup(groups,key,count,child) {
    if (!groups.has(key)) groups.set(key,{rowCount:0,children:new Set()});
    const group = groups.get(key);
    group.rowCount += count;
    if (child) group.children.add(child);
}

function consolidationPickerGroups(items,mode,path) {
    const groups = new Map();
    for (const item of items) {
        if (mode === 'common') {
            const size = item.size || 'Size not recorded';
            addConsolidationGroup(groups,path.length ? size : item.name,item.rowCount,path.length ? '' : size);
        } else {
            addConsolidationBlockGroups(groups,item,path);
        }
    }
    return groups;
}

function addConsolidationBlockGroups(groups,item,[parent]) {
    for (const [block,{count}] of item.locations) {
        const alpha = block.split('.')[0];
        if (parent && alpha !== parent) continue;
        addConsolidationGroup(groups,parent ? block : alpha,count,parent ? '' : block);
    }
}

function fieldWorkConsolidationPicker(items,{mode,path,query,split}) {
    const search = query.trim().toLowerCase();
    const matches = items.filter(item=>{
        if (search) return item.searchCode.includes(search) || item.searchName.includes(search);
        return (!split || item.distributed) && consolidationMatchesPath(item,mode,path);
    });
    if (!search && path.length < 2 && mode !== 'card') {
        const groups = consolidationPickerGroups(matches,mode,path);
        return {groups,options:[...groups.keys()].sort(consolidationNaturalOrder.compare)};
    }
    if (mode === 'block' && path.length === 2 && !search) {
        const block = path[1];
        matches.sort((a,b)=>LocationCode.compare(a.locations.get(block).first,b.locations.get(block).first));
    }
    const exact = search ? matches.findIndex(item=>item.searchCode===search) : -1;
    if (exact>0) matches.unshift(...matches.splice(exact,1));
    return {options:matches};
}

function rankFieldWorkConsolidation(group,suggestions,locations) {
    const configured = new Map(locations.map(row=>[row.locationcode,row]));
    const existing = [], fallback = [];
    const counts = new Map();
    for (const lot of group.lots) {
        counts.set(lot.block,(counts.get(lot.block) || 0)+lot.quantity);
    }
    for (const row of suggestions) {
        if (!group.blocks.has(row.source_locationcode)) continue;
        const beds = configured.get(row.destination_locationcode);
        if (!beds) continue;
        const fits = Number(beds.total_beds)>0 && row.fits_capacity && row.shade_compatible && row.water_compatible;
        const option = {row,beds,fits,destinationCans:counts.get(row.destination_locationcode) || 0};
        (option.destinationCans ? existing : fallback).push(option);
    }
    const rank = (a,b)=>Number(b.fits)-Number(a.fits) || a.row.cans_to_move_in-b.row.cans_to_move_in
        || b.destinationCans-a.destinationCans || LocationCode.compare(a.row.destination_locationcode,b.row.destination_locationcode);
    existing.sort(rank);
    fallback.sort(rank);
    return {existing,fallback,winner:existing.find(option=>option.fits) || fallback.find(option=>option.fits)};
}
