const SALES_STUDIO_LABELS = {
    ORDER:'Order', RESERVE:'Reserve', REQUEST_COMPLETED:'Completed request',
    flyer:'Evaluated inventory', smart:'Evaluated inventory'
};

function appendSalesCardNode(parent, tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return parent.appendChild(node);
}

function salesStudioIdentityKey(row) {
    const parts = [row.warehouse_id || row.farm_code || bloomscapesRowFarm(row), row.itemcode || row.ITEMCODE,
        row.locationcode || row.LOCATIONCODE, canonicalInventoryLot(row)];
    return parts.every(Boolean) ? JSON.stringify(parts.map(value=>String(value).trim().toUpperCase())) : '';
}

function indexSalesStudioTarget(index, key, row) {
    if (key) index.set(key,index.has(key) ? null : row);
}

function createSalesStudioTargetLookup() {
    const byId = new Map(), byLot = new Map();
    for (const row of bloomscapesWorkBrowserRows()) {
        indexSalesStudioTarget(byId,JSON.stringify([bloomscapesRowFarm(row),canonicalInventoryRowUid(row)]),row);
        indexSalesStudioTarget(byLot,salesStudioIdentityKey(row),row);
    }
    return record => {
        const farm = record.warehouse_id || record.farm_code;
        if (!farm) return null;
        const lot = salesStudioIdentityKey(record);
        if (!record.master_id) return byLot.get(lot) || null;
        const row = byId.get(JSON.stringify([farm,String(record.master_id)]));
        return row && (!lot || salesStudioIdentityKey(row) === lot) ? row : null;
    };
}

function buildBloomscapesSalesInventoryCard(row, kind) {
    return renderBloomscapesSalesCard({
        kind, itemcode:row.ITEMCODE, commonname:row.COMMONNAME, locationcode:row.LOCATIONCODE,
        lotcode:row.LOTCODE, quantity:row.PTRONHAND ?? row.ON_HAND, quantityContext:'On hand',
        photoMatch:row.LOC_PHOTO_MATCH
    }, row);
}

function renderBloomscapesSalesCard(record, row, pdfAction = null) {
    const card = document.createElement('article');
    card.className = 'bloomscapes-sales-card';
    card.dataset.salesCardKind = record.kind || 'archive';
    const header = appendSalesCardNode(card,'header','sales-card-header','');
    appendSalesCardNode(header,'span','sales-card-status',SALES_STUDIO_LABELS[record.kind] || record.work_type || 'Archived PDF');
    if (record.customer) appendSalesCardNode(header,'span','sales-card-badge','Customer: '+record.customer);
    if (record.rep) appendSalesCardNode(header,'span','sales-card-badge','Sales rep: '+record.rep);
    if (record.username) appendSalesCardNode(header,'span','sales-card-badge',record.username);
    const body = appendSalesCardNode(card,'div','sales-card-body','');
    const identity = appendSalesCardNode(body,'div','sales-card-identity','');
    appendSalesCardNode(identity,'h3','sales-card-name',record.commonname || row?.COMMONNAME || row?.commonname || 'Common name unavailable');
    const meta = appendSalesCardNode(identity,'div','sales-card-meta','');
    appendSalesCardNode(meta,'code','sales-card-item',record.itemcode || 'Item code unavailable');
    appendSalesCardNode(meta,'span','sales-card-location','Location: '+(record.locationcode || 'Unavailable'));
    if (record.lotcode) appendSalesCardNode(meta,'span','sales-card-location','Lot: '+record.lotcode);
    if (record.photoMatch != null) appendSalesCardNode(meta,'span','sales-card-location','Photo match: '+record.photoMatch);
    const quantity = appendSalesCardNode(body,'div','sales-card-qty','');
    appendSalesCardNode(quantity,'span','sales-card-qty-label','Qty');
    appendSalesCardNode(quantity,'strong','sales-card-qty-value',formatSalesStudioQuantity(record.quantity));
    if (record.quantityContext) quantity.title = record.quantityContext;
    if (record.created_at) appendSalesCardNode(meta,'time','sales-card-location',String(record.created_at).slice(0,10)).dateTime = record.created_at;
    if (record.sandbox_delivery_status === 'sandbox_archived_for_dylan') {
        appendSalesCardNode(card,'small','sales-card-receipt','Archived for Dylan. Storage and local copies verified.');
    }
    appendSalesStudioActions(card,record,row,pdfAction);
    return card;
}

function formatSalesStudioQuantity(value) {
    if (value == null || String(value).trim() === '') return '—';
    const number = Number(String(value).replaceAll(',',''));
    return Number.isFinite(number) ? number.toLocaleString('en-US',{maximumFractionDigits:6}) : String(value);
}

function appendSalesStudioActions(card, record, row, pdfAction) {
    const actions = appendSalesCardNode(card,'footer','sales-card-actions','');
    const owner = getSupabaseReadIdentityScope();
    const farm = getBloomscapesFarm();
    const ownsAction = () => card.isConnected && owner === getSupabaseReadIdentityScope() && farm === getBloomscapesFarm();
    const exactRow = () => ownsAction() && resolveSalesStudioActionRow(row);
    const entries = [
        ['Open Item Detail', Boolean(row) && canAccessView('drive'), () => openSalesStudioItem(exactRow())],
        ['+ Flyer', canAddSalesStudioFlyer(row), () => addSalesStudioFlyer(exactRow())],
        ['Request Photo', canRequestSalesStudioPhoto(row), () => requestSalesStudioPhoto(exactRow())],
        ['Export PDF', true, button => pdfAction ? pdfAction(button) : printSalesStudioCard(record,button)]
    ];
    for (const [label, available, dispatch] of entries) {
        const button = appendSalesCardNode(actions,'button','sales-card-action',label);
        button.type = 'button';
        button.disabled = !available;
        if (!available) button.title = row ? 'Unavailable for your access' : 'No exact inventory row is available';
        button.addEventListener('click', () => { if (ownsAction()) dispatch(button); });
    }
    if (record.folder && record.row_id) {
        const gallery = appendSalesCardNode(actions,'a','sales-card-action','Open photo gallery');
        gallery.href = '?'+new URLSearchParams({request_gallery:record.folder,row_id:record.row_id});
    }
}

function resolveSalesStudioActionRow(row) {
    if (!row?.DOM_ID) return null;
    const item = findItemByDomId(row.DOM_ID);
    const identity = inventoryCardDetailIdentity(row);
    return bloomscapesFarmRowIsVisible(item) && bloomscapesRowFarm(item) === bloomscapesRowFarm(row)
        && matchesInventoryCardDetailIdentity(item,identity[0],identity) ? item : null;
}

function openSalesStudioItem(row) {
    if (!row || !canAccessView('drive')) return;
    const cardIdentity = inventoryCardDetailIdentity(row);
    openDetail(cardIdentity[0],getCurrentVisibleViewId(),{cardIdentity,sourceDomId:row.DOM_ID});
}

function canAddSalesStudioFlyer(item) {
    if (!item?.DOM_ID || !canUseCartInventoryActions([item])) return false;
    const access = getRoleAccessState();
    const allowed = resolveUserAccessMatrix()?.flyer_folder_access;
    return allowed !== 'N' && !access.isForeman && (allowed === 'Y' || !access.isRepLike || canUseDriveQuickRequest());
}

function addSalesStudioFlyer(row) {
    if (canAddSalesStudioFlyer(row)) void openBloomscapesFlyerBuilder([row]);
}

function canRequestSalesStudioPhoto(row) {
    return Boolean(row?.DOM_ID && canUseCartInventoryActions([row]) && getRequestEntryCapabilities()?.canCreateGeneral);
}

function requestSalesStudioPhoto(row) {
    if (!canRequestSalesStudioPhoto(row)) return;
    detailRequestSourceDomIds = [row.DOM_ID];
    void openRequestModal('detail');
}

function openSalesStudioPrint(title, button) {
    const popup = window.open('','_blank');
    if (!popup) {
        button.title = 'Allow pop-ups to export the PDF';
        showToast('Export PDF',button.title,true);
        return null;
    }
    popup.opener = null;
    popup.document.title = title;
    return popup;
}

function printSalesStudioCard(record,button) {
    const popup = openSalesStudioPrint('Bloomscapes · '+(record.itemcode || 'Sales record'),button);
    if (!popup) return;
    const fields = [
        ['Customer',record.customer], ['Sales rep',record.rep], ['Item code',record.itemcode],
        ['Common name',record.commonname], ['Location',record.locationcode], ['Lot',record.lotcode],
        [record.quantityContext || 'Qty',formatSalesStudioQuantity(record.quantity)], ['Date',record.created_at]
    ];
    const content = popup.document.body;
    const heading = content.appendChild(popup.document.createElement('h1'));
    heading.textContent = popup.document.title;
    for (const [label,value] of fields) {
        if (!value) continue;
        const line = content.appendChild(popup.document.createElement('p'));
        line.textContent = label+': '+value;
    }
    popup.print();
}

async function printSalesStudioGallery(row,button) {
    const popup = openSalesStudioPrint('Request photos · '+(row.customer || row.itemcode),button);
    if (!popup) return;
    try {
        const gallery = await readRequestPhotoGallery(row.folder,row.row_id);
        for (const crop of gallery.rows) appendSalesStudioGalleryCrop(popup.document,crop);
        await Promise.all(Array.from(popup.document.images,img=>img.decode()));
        popup.print();
    } catch (error) {
        popup.close();
        showToast('Export PDF',error.message,true);
    }
}

function appendSalesStudioGalleryCrop(doc,crop) {
    const section = doc.body.appendChild(doc.createElement('section'));
    const heading = section.appendChild(doc.createElement('h2'));
    heading.textContent = [crop.commonName,crop.size,crop.location,crop.avNote].filter(Boolean).join(' · ');
    for (const url of crop.photos) {
        const image = section.appendChild(doc.createElement('img'));
        image.alt = crop.commonName || 'Request photo';
        image.src = url;
        image.style.cssText = 'display:block;max-width:100%;max-height:80vh';
    }
}
