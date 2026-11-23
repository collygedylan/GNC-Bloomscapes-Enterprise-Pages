function renderAvReservePhotoThumb(link, caption, { cardClass, imageClass, frameClass, suffix = '', preset = 'card-corner' }) {
    if (!link) return '';
    const firstUrl = getPhotoUrlList(link)[0];
    const thumbUrl = firstUrl ? getDirectImageUrl(firstUrl, preset) : '';
    if (!thumbUrl.startsWith('http')) return '';
    const image = buildDeferredCardPhotoImg(thumbUrl, { className: imageClass });
    const media = frameClass ? '<span class="' + frameClass + '">' + image + '</span>' : image;
    return '<button type="button" data-fast-press-ignore data-av-photo-open class="' + cardClass + '" aria-label="View photos" onclick="event.stopPropagation(); return openAvPhotoViewer(\'' + escJsAttrValue(link) + '\', \'' + escJsAttrValue(caption) + '\', 0, this)">' + media + suffix + '</button>';
}

function renderAvReserveDriveThumb(item, photoUrls, photoLink) {
    const photoDateLabel = resolveAndFormatPhotoDate(item, photoUrls[0] || photoLink);
    const photoDateHtml = photoDateLabel ? `<span class="photo-thumb-date" data-photo-taken-date="${esc(photoDateLabel)}">${esc(photoDateLabel)}</span>` : '';
    if (!photoLink) return '';
    const thumbUrl = getDirectImageUrl(photoUrls[0], 'card-corner');
    if (!thumbUrl.startsWith('http')) return '';
    return `<button type="button" data-fast-press-ignore data-av-photo-open class="absolute top-3 right-3 app-inline-thumb-column" aria-label="View photos" onclick="event.stopPropagation(); return openAvPhotoViewer('${escJsAttrValue(photoLink)}', '${escJsAttrValue(item.COMMONNAME || 'Reserve photo')}', 0, this)"><span class="app-inline-thumb-box">${buildDeferredCardPhotoImg(thumbUrl, { className: 'h-full w-full object-cover' })}<span class="app-av-photo-count" aria-hidden="true">1/${photoUrls.length}</span></span>${photoDateHtml}</button>`;
}

function renderAvReserveDetailCell(label, value) {
    const displayValue = value == null || String(value).trim() === '' ? '-' : String(value);
    return `<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div class="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">${label}</div><div class="mt-1 text-[13px] font-bold text-slate-700 break-words">${esc(displayValue)}</div></div>`;
}

function generateAvReserveDriveCard(item) {
    normalizeRowPhotoFields(item);
    const photoUrls = resolveCanonicalPhotoUrls(item, 'av');
    const photoLink = photoUrls.join(',');
    const thumbHtml = renderAvReserveDriveThumb(item, photoUrls, photoLink);
    const cornerThumbHtml = thumbHtml || `<div class="absolute top-3 right-3 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-1 text-center text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">No Photo</div>`;
    const driveOrderHtml = getInventoryCardBottomRailHtml(item.DOM_ID, '', { sourceView: 'drive' });
    const quantityChipsHtml = buildInventoryQuantityChipsHtml(item, { compact: true });
    const compactCardFieldChipsHtml = buildInventoryCardFieldChipsHtml(item, { compact: true });
    return `<div class="mb-3 app-card-shell app-smart-card app-smart-card--inventory ${driveOrderHtml ? 'app-card-with-bottom-rail' : ''} rounded-[20px] border border-slate-200 bg-white p-3 pr-[3.75rem] sm:pr-[4.25rem] shadow-sm active:scale-[0.99] transition-transform cursor-pointer overflow-hidden relative" ${buildAvCardPhotoActivationAttrs(Boolean(thumbHtml))}>${cornerThumbHtml}<div class="text-[9px] font-black uppercase tracking-[0.16em] text-sky-600">Drive Mode Row</div><div class="app-card-topline mt-1"><span class="app-card-topline-common">${esc(item.COMMONNAME || 'Unknown')}</span><span class="app-card-topline-size">${esc(item.CONTSIZE || '-')}</span></div><div class="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-mono font-bold text-slate-600"><i class="ph-bold ph-barcode text-slate-400"></i><span class="truncate">${item.ITEMCODE || '-'}</span></div><div class="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[0.12em]"><span class="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-blue-700">Loc ${item.LOCATIONCODE || 'No Loc'}</span><span class="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">Lot ${item.LOTCODE || '-'}</span>${quantityChipsHtml}<span class="rounded-full border border-orange-100 bg-orange-50 px-2 py-1 text-orange-700">Pri ${item.PRIORITY || '-'}</span>${compactCardFieldChipsHtml}</div>${driveOrderHtml}</div>`;
}

function generateAvReserveCustomerCard(customerCard) {
    const safeKeyJs = esc(customerCard && customerCard.key || '');
    const customerName = firstNonEmptyValue(customerCard && customerCard.customerName, 'Unknown Customer');
    const rowCount = Number(customerCard && customerCard.rowCount || 0);
    const lotCount = Number(customerCard && customerCard.lotCount || 0);
    const linkedDriveCount = Number(customerCard && customerCard.linkedDriveCount || 0);
    const totalPhotoCount = Number(customerCard && customerCard.totalPhotoCount || 0);
    const salesRepPreview = firstNonEmptyValue(customerCard && customerCard.salesRepPreview, selectedAvResRep, 'Unknown Rep');
    const consigneePreview = firstNonEmptyValue(customerCard && customerCard.consigneePreview, '-');
    const shareRows = getAvReserveCustomerShareRows(customerCard);
    const actionVisibility = getBloomPickerActionVisibility(shareRows.length ? shareRows : (customerCard && customerCard.rows) || []);
    let previewLink = '';
    const reservePreviewRow = ((customerCard && customerCard.rows) || []).find((row) => getPhotoUrlList(getRowPhotoLink(row, 'av')).length);
    const drivePreviewRow = reservePreviewRow ? null : ((customerCard && customerCard.linkedDriveRows) || []).find((row) => getPhotoUrlList(getRowPhotoLink(row, 'drive')).length);
    if (reservePreviewRow) previewLink = getRowPhotoLink(reservePreviewRow, 'av');
    else if (drivePreviewRow) previewLink = getRowPhotoLink(drivePreviewRow, 'drive');
    const thumbHtml = renderAvReservePhotoThumb(previewLink, customerName + ' - ' + (selectedAvResName || 'My Reserves'), {
        cardClass: 'absolute top-3 right-3 flex flex-col items-end',
        imageClass: 'app-smart-thumb h-full w-full object-cover active:scale-95 transition-transform',
        frameClass: 'flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden border border-gray-300 shadow-sm bg-white',
        suffix: '<span class="mt-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Photo Ready</span>'
    });
    const cornerThumbHtml = thumbHtml || `<div class="absolute top-3 right-3 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-1 text-center text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">No Photo</div>`;
    const quickShareHtml = `<div class="mt-3 grid ${actionVisibility.showText ? 'grid-cols-3' : 'grid-cols-2'} gap-2"><button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveCustomerCard('copy', '${safeKeyJs}')"><i class="ph-bold ph-copy text-base"></i>Copy</button><button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveCustomerCard('email', '${safeKeyJs}')"><i class="ph-bold ph-envelope-simple text-base"></i>Email</button>${actionVisibility.showText ? `<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveCustomerCard('text', '${safeKeyJs}')"><i class="ph-bold ph-chat-circle-dots text-base"></i>Text</button>` : ''}</div>`;
    return `<div class="mb-3 rounded-[22px] border border-emerald-200 bg-white p-4 pr-[5.25rem] shadow-sm active:scale-[0.99] transition-transform cursor-pointer overflow-hidden relative" onclick="return selectAvReserveCustomerCard('${safeKeyJs}')">${cornerThumbHtml}<div class="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Customer Card</div><div class="mt-2 font-black text-[22px] leading-tight text-slate-900 break-words">${esc(customerName)}</div><div class="mt-1 text-[13px] font-bold text-[#007a4d] break-words">${esc(salesRepPreview)}</div><div class="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">${renderAvReserveDetailCell('Consignee', consigneePreview)}${renderAvReserveDetailCell('Reserve Rows', rowCount)}${renderAvReserveDetailCell('Lot Codes', lotCount)}${renderAvReserveDetailCell('Linked Drive Rows', linkedDriveCount)}</div><div class="mt-3 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[0.12em]"><span class="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700">${rowCount} reserve row${rowCount === 1 ? '' : 's'}</span><span class="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">${lotCount} lot${lotCount === 1 ? '' : 's'}</span><span class="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-700">${linkedDriveCount} drive row${linkedDriveCount === 1 ? '' : 's'}</span><span class="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-indigo-700">${totalPhotoCount} photo${totalPhotoCount === 1 ? '' : 's'}</span></div>${quickShareHtml}</div>`;
}

function generateAvReserveRowCard(item) {
    const safeDomIdJs = esc(item.DOM_ID || '');
    const isChecked = selectedItems.has(item.DOM_ID) ? 'checked' : '';
    const itemCode = firstNonEmptyValue(item.ITEMCODE, '-');
    const commonName = firstNonEmptyValue(item.COMMONNAME, item.ITEMCODE, 'Unknown');
    const contSize = firstNonEmptyValue(item.CONTSIZE, '-');
    const customerName = firstNonEmptyValue(item.CUSTOMERNAME, item.CUSTOMER, 'Unknown Customer');
    const consigneeName = firstNonEmptyValue(item.CONSIGNEENAME, item.CONSIGNEE, '-');
    const salesRepName = firstNonEmptyValue(item.SALESREPNAME, item.SALESREP, item.SALES_REP, '-');
    const locationCode = firstNonEmptyValue(item.LOCATIONCODE, 'No Loc');
    const requestDate = getAvReserveRequestDateLabel(item);
    const lotCode = firstNonEmptyValue(item.LOTCODE, '-');
    const qtyOrdered = firstNonEmptyValue(item.QTY_ORDERED, item.QUANTITYORDERED, '0');
    const qtyShipped = firstNonEmptyValue(item.QTY_SHIPPED, item.QUANTITYSHIPPED, '0');
    const locPhotoMatch = getAvOpenStockLocPhotoMatch(item);
    const specText = firstNonEmptyValue(getItemDisplayValue(item, 'SPEC', 'av'), '-');
    const caliperText = firstNonEmptyValue(getItemDisplayValue(item, 'CALIPER', 'av'), '-');
    const avNote = firstNonEmptyValue(getItemDisplayValue(item, 'AV_NOTE', 'av'), '-');
    const showSpecFields = avReserveNeedsCaliper(item);
    const actionVisibility = getBloomPickerActionVisibility([item]);
    const photoLink = resolveCanonicalPhotoUrls(item, 'av').join(',');
    const photoDateLabel = resolveAndFormatPhotoDate(item, String(photoLink).split(',')[0] || photoLink);
    const photoDateHtml = photoDateLabel ? `<span class="photo-thumb-date" data-photo-taken-date="${esc(photoDateLabel)}">${esc(photoDateLabel)}</span>` : '';
    const thumbHtml = renderAvReservePhotoThumb(photoLink, commonName + ' - ' + contSize, {
        cardClass: 'ml-3 flex-shrink-0 flex flex-col items-center',
        imageClass: 'app-smart-thumb w-16 h-16 rounded-md object-cover border border-gray-300 shadow-sm active:scale-95 transition-transform',
        preset: 'card-inline', suffix: photoDateHtml
    });
    const inlineThumbHtml = thumbHtml || `<div class="ml-3 flex-shrink-0"><div class="app-smart-thumb w-16 h-16 rounded-md border border-gray-300 bg-slate-100 shadow-sm flex items-center justify-center text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">No Photo</div></div>`;
    const quickShareHtml = `<div class="mt-3 grid ${actionVisibility.showText ? 'grid-cols-3' : 'grid-cols-2'} gap-2"><button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveRow('copy', '${safeDomIdJs}')"><i class="ph-bold ph-copy text-base"></i>Copy</button><button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveRow('email', '${safeDomIdJs}')"><i class="ph-bold ph-envelope-simple text-base"></i>Email</button>${actionVisibility.showText ? `<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 shadow-sm active:scale-[0.98]" onclick="event.stopPropagation(); return shareAvReserveRow('text', '${safeDomIdJs}')"><i class="ph-bold ph-chat-circle-dots text-base"></i>Text</button>` : ''}</div>`;
    const bottomRailHtml = getInventoryCardBottomRailHtml(item.DOM_ID, '', { sourceView: 'av' });
    return `<div class="flex items-start w-full mb-3 item-row app-smart-card relative bg-white p-4 rounded-xl border border-indigo-200 shadow-sm active:scale-[0.99] transition-transform cursor-pointer overflow-hidden ${bottomRailHtml ? 'app-card-with-bottom-rail' : ''}" data-dom-id="${item.DOM_ID}" oncontextmenu="return handleCardContextMenu(event, '${item.DOM_ID}')" ${buildAvCardPhotoActivationAttrs(Boolean(thumbHtml))}><div class="card-checkbox-container flex-shrink-0 mt-1"><input type="checkbox" class="card-checkbox w-6 h-6 rounded border-gray-300 text-[#007a4d] focus:ring-[#007a4d] shadow-sm" ${isChecked} onclick="event.stopPropagation(); toggleGlobalItem('${item.DOM_ID}', this.checked, 'av')"></div><div class="flex flex-grow items-start justify-between min-w-0"><div class="app-card-main flex-grow min-w-0 pr-2"><div class="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Item Code</div><div class="mt-1 font-mono font-black text-[16px] text-indigo-800 break-all">${esc(itemCode)}</div><div class="mt-3 font-black text-slate-900 text-[20px] leading-tight break-words">${esc(commonName)}</div><div class="mt-1 text-[14px] font-bold text-[#007a4d]">${esc(contSize)}</div><div class="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">${renderAvReserveDetailCell('Customer Name', customerName)}${renderAvReserveDetailCell('Consignee Name', consigneeName)}${renderAvReserveDetailCell('Sales Rep Name', salesRepName)}${renderAvReserveDetailCell('Location', locationCode)}${renderAvReserveDetailCell('DesigLoc', getInventoryCardDesigLocValue(item))}${renderAvReserveDetailCell('Request Date', requestDate)}${renderAvReserveDetailCell('Lot Code', lotCode)}${renderAvReserveDetailCell('Quantity Ordered', qtyOrdered)}${renderAvReserveDetailCell('Quantity Shipped', qtyShipped)}${renderAvReserveDetailCell('LOC PHOTO MATCH', locPhotoMatch)}${showSpecFields ? renderAvReserveDetailCell('Spec', specText) : ''}${showSpecFields ? renderAvReserveDetailCell('Caliper', caliperText) : ''}${renderAvReserveDetailCell('AV Note', avNote)}</div>${quickShareHtml}</div>${inlineThumbHtml}</div>${bottomRailHtml}</div>`;
}
