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
