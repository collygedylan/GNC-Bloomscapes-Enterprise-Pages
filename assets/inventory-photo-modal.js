function openPhotoModal(urlStr, caption, startIndex = 0) {
    const view = getCurrentVisibleViewId();
    if (['av','drive','reports','request','docks','detail'].includes(view)) {
        return openAvPhotoViewer(urlStr,caption,startIndex);
    }
    return openLegacyPhotoModal(urlStr,caption,startIndex);
}

function openLegacyPhotoModal(urlStr, caption, startIndex = 0) {
    const modal = document.getElementById('photo-modal');
    const gallery = document.getElementById('photo-modal-gallery');
    const swipeHint = document.getElementById('photo-swipe-hint');
    const urls = getPhotoUrlList(urlStr);
    if (!modal || !gallery) return;
    if (!urls.length) {
        showToast('No Photo', 'There is no photo on file for this item.', true);
        return;
    }
    closePhotoModal();
    const initialIndex = Math.max(0, Math.min(urls.length - 1, Number.isFinite(Number(startIndex)) ? Math.trunc(Number(startIndex)) : 0));
    const displayUrls = urls.map(url => findPendingPhotoPreviewByUrl(url)?.url || getExpandedImageUrl(url) || url);
    photoModalState.urls = urls;
    photoModalState.displayUrls = displayUrls;
    photoModalState.index = initialIndex;
    photoModalState.primedKey = '';
    primePhotoModalAroundIndex(initialIndex);
    gallery.innerHTML = displayUrls.map((url, index) => `<div class="photo-modal-slide photo-date-badge-host" data-photo-index="${index}"><img src="${esc(url)}" data-full-src="${esc(urls[index] || url)}" sizes="100vw" alt="${esc(caption || `Photo ${index + 1}`)}" loading="${Math.abs(index - initialIndex) <= 1 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${Math.abs(index - initialIndex) <= 1 ? 'high' : 'low'}" draggable="false">${buildPhotoTakenDateBadge(null, urls[index] || url)}</div>`).join('');
    bindLegacyPhotoMotion(gallery);
    bindLegacyPhotoPointers(gallery);
    bindLegacyPhotoControls(modal,gallery);
    document.getElementById('photo-modal-caption').innerText = caption || 'Photo Gallery';
    swipeHint.classList.toggle('hidden', urls.length <= 1);
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        snapPhotoModalToIndex(initialIndex, false);
        updatePhotoModalCounter();
    });
}

function bindLegacyPhotoMotion(gallery) {
    photoModalState.scrollHandler = () => {
        markScrollActivity();
        if (photoModalState.scrollFrame) return;
        photoModalState.scrollFrame = requestAnimationFrame(() => {
            photoModalState.scrollFrame = null;
            syncPhotoModalIndexFromScroll();
        });
        if (photoModalState.scrollTimer) clearTimeout(photoModalState.scrollTimer);
        photoModalState.scrollTimer = setTimeout(() => {
            requestAnimationFrame(() => {
                snapPhotoModalToIndex(photoModalState.index, false);
            });
        }, 120);
    };
    photoModalState.wheelHandler = (event) => {
        markScrollActivity();
        if (!window.matchMedia('(pointer: coarse)').matches && Math.abs(Number(event.deltaY) || 0) > Math.abs(Number(event.deltaX) || 0)) {
            gallery.scrollLeft += Number(event.deltaY) || 0;
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
    };
    photoModalState.touchMoveHandler = () => markScrollActivity();
}

function bindLegacyPhotoPointers(gallery) {
    photoModalState.pointerDownHandler = (event) => {
        if (window.matchMedia('(pointer: coarse)').matches || event.button !== 0 || photoModalState.urls.length <= 1) return;
        photoModalState.pointerDragging = true;
        photoModalState.pointerDragMoved = false;
        photoModalState.pointerDragStartX = Number(event.clientX) || 0;
        photoModalState.pointerDragStartScrollLeft = Number(gallery.scrollLeft) || 0;
        gallery.classList.add('photo-modal-dragging');
        try { gallery.setPointerCapture(event.pointerId); } catch { globalThis.reportHandledRuntimeIssue?.("openPhotoModal", 'HANDLED_OPERATION_FAILURE'); }
        markScrollActivity();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    };
    photoModalState.pointerMoveHandler = (event) => {
        if (!photoModalState.pointerDragging) return;
        const nextX = Number(event.clientX) || 0;
        const deltaX = nextX - photoModalState.pointerDragStartX;
        if (Math.abs(deltaX) > 4) photoModalState.pointerDragMoved = true;
        gallery.scrollLeft = photoModalState.pointerDragStartScrollLeft - deltaX;
        markScrollActivity();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    };
    photoModalState.pointerUpHandler = (event) => {
        if (!photoModalState.pointerDragging) return;
        const moved = !!photoModalState.pointerDragMoved;
        photoModalState.pointerDragging = false;
        photoModalState.pointerDragMoved = false;
        gallery.classList.remove('photo-modal-dragging');
        try { gallery.releasePointerCapture(event.pointerId); } catch { globalThis.reportHandledRuntimeIssue?.("openPhotoModal", 'HANDLED_OPERATION_FAILURE'); }
        syncPhotoModalIndexFromScroll();
        snapPhotoModalToIndex(photoModalState.index, true);
        if (moved) photoModalState.pointerSuppressClickUntil = Date.now() + 260;
    };
    photoModalState.pointerCancelHandler = (event) => {
        if (!photoModalState.pointerDragging) return;
        photoModalState.pointerDragging = false;
        photoModalState.pointerDragMoved = false;
        gallery.classList.remove('photo-modal-dragging');
        try { gallery.releasePointerCapture(event.pointerId); } catch { globalThis.reportHandledRuntimeIssue?.("openPhotoModal", 'HANDLED_OPERATION_FAILURE'); }
        syncPhotoModalIndexFromScroll();
    };
}

function bindLegacyPhotoControls(modal,gallery) {
    gallery.addEventListener('scroll', photoModalState.scrollHandler, { passive: true });
    gallery.addEventListener('wheel', photoModalState.wheelHandler, { passive: false });
    gallery.addEventListener('touchmove', photoModalState.touchMoveHandler, { passive: true });
    gallery.addEventListener('pointerdown', photoModalState.pointerDownHandler);
    gallery.addEventListener('pointermove', photoModalState.pointerMoveHandler);
    gallery.addEventListener('pointerup', photoModalState.pointerUpHandler);
    gallery.addEventListener('pointercancel', photoModalState.pointerCancelHandler);
    photoModalState.galleryClickHandler = (event) => {
        if (window.matchMedia('(pointer: coarse)').matches) return;
        if (photoModalState.urls.length <= 1) return;
        if (Date.now() < photoModalState.pointerSuppressClickUntil) {
            event.preventDefault();
            return;
        }
        stepPhotoModal(1);
    };
    gallery.addEventListener('click', photoModalState.galleryClickHandler);
    gallery.classList.toggle('photo-gallery-clickzone', photoModalState.urls.length > 1 && !window.matchMedia('(pointer: coarse)').matches);
    photoModalState.keyHandler = event => handleLegacyPhotoKey(event,modal);
    window.addEventListener('keydown', photoModalState.keyHandler);
}

function handleLegacyPhotoKey(event,modal) {
    if (modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') return closePhotoModal();
    if (!['ArrowRight','ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    stepPhotoModal(event.key === 'ArrowRight' ? 1 : -1);
}
