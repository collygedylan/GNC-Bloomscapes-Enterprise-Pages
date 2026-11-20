function inventoryFacetValue(row,...keys) {
    for (const key of keys) {
        const value=row?.[key] ?? row?.[key.toUpperCase()];
        if (value!=null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function inventoryExcelDemandIndex(state) {
    const soc=typeof socInventory==='undefined'?[]:socInventory;
    const reserves=typeof reservesInventory==='undefined'?[]:reservesInventory;
    if (state.demand?.soc===soc && state.demand?.reserves===reserves) return state.demand.index;
    const index=new Map();
    for (const row of [...soc,...reserves]) {
        if (nativeAuthSessionActive && !bloomscapesFarmRowIsVisible(row)) continue;
        const code=inventoryFacetValue(row,'itemcode','item_code','item').toUpperCase();
        if (!code) continue;
        if (!index.has(code)) index.set(code,[]);
        index.get(code).push({salesrep:inventoryFacetValue(row,'salesrepname','salesrep','sales_rep','salesrepid'),
            customer:[inventoryFacetValue(row,'customername','customer'),inventoryFacetValue(row,'consigneename','consignee')].filter(Boolean)});
    }
    state.demand={soc,reserves,index};
    return index;
}

function buildInventoryExcelFact(item) {
    const code=inventoryFacetValue(item,'itemcode','item_code','item').toUpperCase();
    const metadata=typeof masterInventoryByItemCode==='undefined'?null:masterInventoryByItemCode?.get(code)?.[0];
    const field=(...keys)=>inventoryFacetValue(item,...keys) || inventoryFacetValue(metadata,...keys);
    const location=inventoryFacetValue(item,'locationcode','source_locationcode','location');
    const lot=inventoryFacetValue(item,'lotcode','lot');
    const year=Number(field('saleyear','salesyear','sales_year') || lot.match(/^\d+/)?.[0]);
    const fullYear=year<100?2000+year:year;
    const current=getCurrentAppSeasonSettings();
    const activeYear=Number(current.salesYear)<100?2000+Number(current.salesYear):Number(current.salesYear);
    const season=field('season') || lot.split('.')[1] || '';
    const stock=fullYear===activeYear?'Current Season':fullYear===activeYear+1?'Next Season':fullYear>activeYear+1?'Future Seasons':'Historical Stock';
    return {username:Array.isArray(item.assigned_usernames)?item.assigned_usernames:resolveSuspendOwner(item),
        stock,view:typeof hasValidRowPhoto==='function' && hasValidRowPhoto(item)?['All Rows','Photos']:['All Rows'],
        genus:field('genusname','genus'),plantgroupcode:field('plantgroupcode','plt_grp','plant_group_code'),
        commonname:field('commonname','common_name'),contsize:field('contsize','container_size'),
        blockalpha:field('blockalpha','block_alpha') || location.match(/^[A-Za-z]+/)?.[0] || '',
        locationcode:location,season,lotcode:lot,salesyear:String(fullYear || ''),holdstopcode:field('holdstopcode','hold_stop_code')};
}

function buildInventoryExcelFacts(row,state) {
    const input=row.sourceRow?{...row.values,...row.sourceRow}:row.row?{...row,...row.row}:row;
    const parts=Array.isArray(input.lines)&&input.lines.length?input.lines:[input];
    return parts.flatMap(part=>{
        const item=part===input?input:{...input,...part};
        const fact=buildInventoryExcelFact(item);
        const code=inventoryFacetValue(item,'itemcode','item_code','item').toUpperCase();
        const demand=inventoryExcelDemandIndex(state).get(code) || [{salesrep:'',customer:[]}];
        return demand.map(link=>normalizeInventoryExcelFact({...fact,...link}));
    });
}

function getManagerEvalReport2UserFilterOptions(rows = null) {
    if (!nativeAuthSessionActive && !Array.isArray(rows) && useManagerReportPages('eval2')) {
        const metadata = getManagerReportPageController().state('eval2').metadata;
        const local = getManagerEvalReports2Api()?.browseUserOptions(metadata, buildManagerReportPageQuery('eval2').filters);
        if (local) return local;
        return [{ value:'all', label:'All Users ('+Number(metadata.filteredRowCount || 0)+')' },
            ...(metadata.evaluatorDirectory || metadata.assignedToOptions || []).map(value => ({value,label:value}))];
    }
    const sourceRows = Array.isArray(rows) ? rows : nativeAuthSessionActive ? fullInventory.filter(bloomscapesFarmRowIsVisible) : getManagerEvalReport2Rows();
    const itemCodesByUser = new Map();
    const allItemCodes = new Set();
    const unassignedItemCodes = new Set();
    const selectedSeasons = getManagerEvalReport2SeasonFilters();
    sourceRows.forEach((row) => {
        if (!doesManagerEvalReport2RowMatchSeasonFilter(row, selectedSeasons)) return;
        if (managerEvalReport2ContSizeFilter !== 'all' && getManagerEvalReportRowContSize(row) !== managerEvalReport2ContSizeFilter) return;
        if (managerEvalReport2LocationFilter !== 'all' && getManagerEvalReportRowLocation(row) !== managerEvalReport2LocationFilter) return;
        const priority = getManagerEvalReportRowPriority(row);
        if (managerEvalReport2PriorityFilter === 'with' && !priority) return;
        if (managerEvalReport2PriorityFilter === 'without' && priority) return;
        if (!managerEvalReportRowMatchesSearch(row)) return;
        const itemCode = getManagerEvalReport2ItemCode(row);
        if (!itemCode) return;
        allItemCodes.add(itemCode);
        const users = (nativeAuthSessionActive ? [resolveSuspendOwner(row)] : getManagerEvalReportRowAssignedToUsers(row)).map(normalizeManagerEvalAssignedUser).filter(Boolean);
        const namedUsers = users.filter((value) => value !== '(Unassigned)');
        if (!namedUsers.length) unassignedItemCodes.add(itemCode);
        namedUsers.forEach((value) => {
            const key = value.toLocaleLowerCase();
            if (!itemCodesByUser.has(key)) itemCodesByUser.set(key, { label:value, itemCodes:new Set() });
            itemCodesByUser.get(key).itemCodes.add(itemCode);
        });
    });
    const options = [{ value:'all', label:`All Users (${allItemCodes.size})` }];
    const selectedUser = getManagerEvalAssignedUsers('eval2')[0] || '';
    if (unassignedItemCodes.size || selectedUser.toLocaleLowerCase() === '(unassigned)') {
        options.push({ value:'(Unassigned)', label:`Unassigned (${unassignedItemCodes.size})` });
    }
    const users = Array.from(itemCodesByUser.values());
    if (selectedUser && selectedUser.toLocaleLowerCase() !== '(unassigned)'
        && !itemCodesByUser.has(selectedUser.toLocaleLowerCase())) users.push({ label:selectedUser, itemCodes:new Set() });
    users.sort((left, right) => compareManagerEvalReport2Natural(left.label, right.label))
        .forEach((entry) => options.push({ value:entry.label, label:`${entry.label} (${entry.itemCodes.size})` }));
    return options;
}


function normalizeInventoryExcelFact(fact) {
    return Object.fromEntries(Object.entries(fact).map(([key,value])=>[key,normalizeInventoryExcelValues(key,value)]));
}

function normalizeInventoryExcelValues(key,value) {
    return [...new Set((Array.isArray(value)?value:[value]).map(entry=>String(entry || '').trim() || (key==='username'?'Unassigned':'(Blank)')))];
}
