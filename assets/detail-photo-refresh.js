function refreshPendingPhotoUiForItem(item, prefix = '') {
    releaseSavedDetailPreviewUrls();
    if (prefix === 'eval-') { scheduleRequestRender(0,0,true); return; }
    if (!item) return;
    const uid = String(item.UNIQUE_ID || '').trim();
    const sameActiveItem = activeItem && String(activeItem.UNIQUE_ID || '').trim() === uid;
    const renderKey = `${sameActiveItem ? 'active-' : ''}photo-preview-${uid}-${getPhotoBucketKey(prefix)}`;
    scheduleUiRender(renderKey, () => {
        if (sameActiveItem) {
            if (!activeItem || String(activeItem.UNIQUE_ID || '').trim() !== uid) return;
            incrementInternalPerfCounter('photoUiOnlyRefreshes');
            renderSavedPhotoSlots(prefix);
            if (activeDetailTab === 'gallery') renderPhotoGallery();
            return;
        }
        const view = getCurrentVisibleViewId();
        if (!view || view === 'detail' || !TRACKED_VIEW_IDS.includes(view)) return;
        incrementInternalPerfCounter('photoUiOnlyRefreshes');
        markViewDirty(view);
        queueInteractiveViewRender(view,false,false,0,140);
    },16);
}

function patchDetailPhotoSlots(container, html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const strip = container.querySelector('[data-photo-slots]');
    if (!strip) {
        container.replaceChildren(template.content);
        return;
    }
    const retained = new Map([...strip.children].map(slot=>[slot.dataset.photoSlot,slot]));
    const desired = [...template.content.querySelector('[data-photo-slots]').children];
    const keys = new Set(desired.map(slot=>slot.dataset.photoSlot));
    for (const slot of [...strip.children]) if (!keys.has(slot.dataset.photoSlot)) slot.remove();
    desired.forEach((next,index)=>{
        const current = retained.get(next.dataset.photoSlot);
        const slot = current || next;
        if (current && current.innerHTML !== next.innerHTML) patchSavedDetailPhotoSlot(current,next);
        if (strip.children[index] !== slot) strip.insertBefore(slot,strip.children[index] || null);
    });
}

function copyDetailPhotoAttributes(current, next) {
    for (const attribute of [...current.attributes]) {
        if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of next.attributes) current.setAttribute(attribute.name, attribute.value);
}

function patchSavedDetailPhotoSlot(current, next) {
    const button = current.querySelector('[data-photo-open]');
    const nextButton = next.querySelector('[data-photo-open]');
    const img = button?.querySelector('img');
    if (!img || !nextButton) return replaceDetailMediaPreservingImages(current,next.innerHTML);
    copyDetailPhotoAttributes(button, nextButton);
    const desiredImage = nextButton.querySelector('img');
    img.dataset.photoUrl = desiredImage.dataset.photoUrl;
    img.dataset.localPreviewUrl ||= desiredImage.dataset.localPreviewUrl;
    const status = current.querySelector('[data-photo-status]');
    const nextStatus = next.querySelector('[data-photo-status]');
    if (status && nextStatus) {
        copyDetailPhotoAttributes(status, nextStatus);
        status.textContent = nextStatus.textContent;
    }
    for (const child of [...current.children]) if (child !== button && child !== status) child.remove();
    for (const child of [...next.children]) {
        if (child === nextButton || child === nextStatus && status) continue;
        const beforeButton = [...next.children].indexOf(child) < [...next.children].indexOf(nextButton);
        if (beforeButton) current.insertBefore(child,button);
        else current.appendChild(child);
    }
}
