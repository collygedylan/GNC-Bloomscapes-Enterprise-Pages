const consolidationNaturalOrder = new Intl.Collator(undefined,{numeric:true});
const consolidationPickPageSize = 36;

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
        if (block) item.blocks.add(block);
        const year = consolidationField(row,'SALEYEAR');
        const quantity = Number(consolidationField(row,'PTRONHAND').replaceAll(',',''));
        if (!/^20\d{2}$/.test(year) || !(quantity > 0)) continue;
        recordConsolidationLot(item,year,row,location,block,quantity);
    }
    return [...items.values()].sort((a,b)=>consolidationNaturalOrder.compare(a.name,b.name) || a.code.localeCompare(b.code));
}

function createConsolidationIndexItem(code,{common,size}) {
    const name = common || code;
    return {code,name,size,searchCode:code.toLowerCase(),searchName:name.toLowerCase(),years:new Map(),blocks:new Set()};
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

function consolidationPickerGroups(items,mode,path) {
    if (mode==='common') return items.map(item=>path.length ? item.size || 'Size not recorded' : item.name);
    return items.flatMap(item=>[...item.blocks].filter(block=>!path.length || block.split('.')[0]===path[0])
        .map(block=>path.length ? block : block.split('.')[0]));
}

function fieldWorkConsolidationPicker(items,{mode,path,query,split,page}) {
    const search = query.trim().toLowerCase();
    const matches = items.filter(item=>{
        if (search) return item.searchCode.includes(search) || item.searchName.includes(search);
        const distributed = [...item.years.values()].some(group=>[...group.blocks].filter(Boolean).length>1);
        return (!split || distributed) && consolidationMatchesPath(item,mode,path);
    });
    const leaf = search || path.length===2;
    const choices = leaf ? matches : [...new Set(consolidationPickerGroups(matches,mode,path))].sort(consolidationNaturalOrder.compare);
    if (search) {
        const exact = choices.findIndex(item=>item.searchCode===search);
        if (exact>0) choices.unshift(...choices.splice(exact,1));
    }
    const start = page * consolidationPickPageSize;
    return {many:choices.length>start+consolidationPickPageSize,options:choices.slice(start,start+consolidationPickPageSize)};
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
