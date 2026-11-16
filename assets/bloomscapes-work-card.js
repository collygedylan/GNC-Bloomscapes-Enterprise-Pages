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
        +bloomscapesWorkSiblingMarkup(row);
}

function renderBloomscapesDriveDispatchActions(row) {
    if (!nativeAuthSessionActive || !bloomscapesFarmRowIsVisible(row)) return '';
    const id=escapeHtml(escJsAttrValue(String(row.UNIQUE_ID || row.unique_id)));
    const badge=(row.SHEAR_STATUS || row.shear_status)==='ADD_TO_SHEAR_LIST' ? '<span data-needs-shear>#? Needs Shear</span>' : '';
    return badge+'<div class="bloomscapes-drive-dispatch" onclick="event.stopPropagation()">'
        +'<button type="button" data-drive-dispatch="HAULING" onclick="event.stopPropagation();return openBloomscapesQuickWork(\'HAULING\',\''+id+'\')">🚜 Consolidate Inventory</button>'
        +'<button type="button" data-drive-dispatch="SHEARING" onclick="event.stopPropagation();return openBloomscapesQuickWork(\'SHEARING\',\''+id+'\')">✂️ Add to Shear List</button></div>';
}

function renderBloomscapesDriveShearBadge(row,renderMeta,sourceView) {
    if (renderMeta.workBuilder || sourceView!=='drive' || !nativeAuthSessionActive || !bloomscapesFarmRowIsVisible(row)) return '';
    return (row.SHEAR_STATUS || row.shear_status)==='ADD_TO_SHEAR_LIST' ? '<span data-needs-shear>#? Needs Shear</span>' : '';
}

function renderBloomscapesDetailDispatch(item,sourceView) {
    const parent = document.getElementById('det-title-row')?.parentElement;
    if (!parent) return;
    let host = document.getElementById('bloomscapes-detail-dispatch');
    if (!host) {
        host = document.createElement('section');
        host.id = 'bloomscapes-detail-dispatch';
        host.className = 'mt-6';
        parent.appendChild(host);
    }
    const source = sourceView || activeDetailSourceView || lastView;
    host.innerHTML = item && source==='drive' ? renderBloomscapesDriveDispatchActions(item) : '';
    host.hidden = !host.firstChild;
    document.getElementById('view-detail').dataset.bloomscapesWorkActions = String(!host.hidden);
}

function bloomscapesDriveCardActivation(row,renderMeta,sourceView) {
    return renderMeta.workBuilder ? '' : buildExactInventoryCardActivationAttrs(row,renderMeta.originView || sourceView,'Open drive row');
}

async function openBloomscapesQuickWork(kind,id) {
    try {
        await ensureBloomscapesFieldQueue();
        const source=findItemByUniqueId(id) || findItemByDomId(id);
        if (!source || !bloomscapesFarmRowIsVisible(source)) throw new Error('Open a physical row in your active farm.');
        await openBloomscapesJobBoardCreator(bloomscapesWorkTab(kind),{source,quick:true});
    } catch (error) { showToast('Work dispatch',error.message,true); }
    return false;
}
