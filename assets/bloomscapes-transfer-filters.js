const bloomscapesTransferFilters=new Map();

function getBloomscapesTransferFilters() {
    const owner=bloomscapesTransferOwner();
    if (!bloomscapesTransferFilters.has(owner)) {
        bloomscapesTransferFilters.clear();
        bloomscapesTransferFilters.set(owner,{origin:'ALL',season:'ALL',history:false});
    }
    return bloomscapesTransferFilters.get(owner);
}

function selectBloomscapesTransferFilter(filters,key,value) {
    const allowed={origin:['ALL',...BLOOMSCAPES_TRANSFER_ORIGINS],season:['ALL','F1','S1','OTHER']};
    if (key==='history') filters.history=value===true;
    else if (allowed[key]?.includes(value)) filters[key]=value;
    return filters;
}

function reconcileBloomscapesTransferSeason(filters,rows) {
    const cohort=rows.filter(po=>filters.origin==='ALL' || po.origin_farm===filters.origin);
    if (!cohort.some(po=>matchesBloomscapesPoSeason(po,filters.season))) filters.season='ALL';
    return cohort;
}
