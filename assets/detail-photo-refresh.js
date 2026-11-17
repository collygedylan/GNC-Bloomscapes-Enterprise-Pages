function refreshPendingPhotoUiForItem(item, prefix = '') {
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
        if (current && current.innerHTML !== next.innerHTML) replaceDetailMediaPreservingImages(current,next.innerHTML);
        if (strip.children[index] !== slot) strip.insertBefore(slot,strip.children[index] || null);
    });
}
