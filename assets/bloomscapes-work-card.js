function bloomscapesWorkIdentityMarkup(source,options={}) {
    const row=resolveCanonicalInventoryRow(source);
    const identity=[['Common Name',row.COMMONNAME || row.commonname],['Itemcode',row.ITEMCODE || row.itemcode],
        ['ContSize',row.CONTSIZE || row.contsize],['Location',row.LOCATIONCODE || row.locationcode],
        ['Lot / Sale Year',[row.LOTCODE || row.lotcode,row.SALEYEAR || row.saleyear].filter(Boolean).join(' / ')],
        ['Source',row.SOURCE || row.source || getBloomscapesFarm().split('-')[1]],
        ['Assigned To',options.assignedTo || getAssignedQueueOwner(row) || 'Unassigned'],
        ['Hold Stop Reason',row.HOLDSTOPREASON || row.holdstopreason || 'None']];
    return generateCard(row,'drive','status-green',{workBuilder:true,originView:getCurrentVisibleViewId()})
        +'<dl class="bloomscapes-work-identity">'+identity.map(([title,value])=>
            '<div><dt>'+escapeHtml(title)+'</dt><dd>'+escapeHtml(String(value || 'Not recorded'))+'</dd></div>').join('')+'</dl>'
        +bloomscapesWorkSiblingMarkup(row)+(options.summary?'':bloomscapesPlanningCardMarkup(row));
}

function renderBloomscapesDriveShearBadge(row,renderMeta,sourceView) {
    if (renderMeta.workBuilder || sourceView!=='drive' || !nativeAuthSessionActive || !bloomscapesFarmRowIsVisible(row)) return '';
    return (row.SHEAR_STATUS || row.shear_status)==='ADD_TO_SHEAR_LIST' ? '<span data-needs-shear>#? Needs Shear</span>' : '';
}

function renderBloomscapesDetailDispatch() {
    const detail=document.getElementById('view-detail');
    detail?.querySelectorAll('[data-drive-dispatch],#bloomscapes-detail-dispatch').forEach(node=>node.remove());
    if (detail) detail.dataset.bloomscapesWorkActions='false';
}

function bloomscapesDriveCardActivation(row,renderMeta,sourceView) {
    return renderMeta.workBuilder ? '' : buildExactInventoryCardActivationAttrs(row,renderMeta.originView || sourceView,'Open drive row');
}
