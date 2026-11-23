let activeAvPhotoViewer = null;

function isAvPhotoViewerOpen() {
    return activeAvPhotoViewer?.dialog.open === true;
}

function closeAvPhotoViewer({ restoreFocus = true } = {}) {
    const viewer = activeAvPhotoViewer;
    if (!viewer) return false;

    activeAvPhotoViewer = null;
    viewer.abort.abort();
    viewer.resizeObserver.disconnect();
    releaseAvPhotoPointers(viewer);
    viewer.dialog.close();
    viewer.dialog.remove();
    if (restoreFocus && viewer.trigger?.isConnected) viewer.trigger.focus({ preventScroll: true });
    return true;
}

function openAvPhotoViewer(photoUrls, caption, startIndex = 0, trigger = document.activeElement) {
    const urls = getPhotoUrlList(photoUrls);
    if (!urls.length) return false;
    closeAvPhotoViewer({ restoreFocus: false });

    const dialog = document.createElement('dialog');
    const image = document.createElement('img');
    const status = document.createElement('span');
    const number = Math.trunc(Number(startIndex)) || 0;
    const viewer = {
        dialog, image, status, trigger, urls, caption: caption || 'Inventory photos',
        abort: new AbortController(),
        index: Math.max(0, Math.min(number, urls.length - 1)),
        pointers: new Map(), drag: null, pinch: null, lastTap: null,
        scale: 1, x: 0, y: 0, imageWidth: 0, imageHeight: 0,
        resizeObserver: new ResizeObserver(() => fitAvPhoto(viewer))
    };
    dialog.id = 'av-photo-viewer';
    dialog.style.zIndex = '9999';
    dialog.dataset.fastPressIgnore = '';
    dialog.setAttribute('aria-label', viewer.caption);
    dialog.setAttribute('aria-description', 'Swipe sideways to browse and swipe down to close. Double tap or pinch to zoom. Keyboard: arrow keys, plus, minus, zero, and Escape.');
    image.draggable = false;
    image.decoding = 'async';
    status.className = 'av-photo-viewer-status';
    status.setAttribute('role', 'status');
    dialog.append(image, status);
    if (window.matchMedia('(pointer: fine)').matches) {
        dialog.append(avPhotoButton(viewer, 'Previous photo', '‹', 'left', -1),
            avPhotoButton(viewer, 'Next photo', '›', 'right', 1), avPhotoButton(viewer, 'Close photos', '×', 'right', 0));
    }

    bindAvPhotoViewer(viewer);
    activeAvPhotoViewer = viewer;
    document.body.append(dialog);
    dialog.showModal();
    viewer.resizeObserver.observe(dialog);
    showAvPhoto(viewer);
    return false;
}

function avPhotoButton(viewer, label, text, side, direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.textContent = text;
    button.style.cssText = 'position:absolute;z-index:1;min-width:44px;min-height:44px;' +
        'border-radius:8px;background:#103220;color:#fff;font-size:26px;' +
        side + ':12px;' + (direction ? 'top:calc(50% - 22px)' : 'top:12px');
    button.addEventListener('click', () => direction ? stepAvPhotoViewer(viewer, direction) : closeAvPhotoViewer());
    return button;
}

function bindAvPhotoViewer(viewer) {
    const { dialog, image } = viewer;
    dialog.addEventListener('pointerdown', event => beginAvPhotoGesture(viewer, event));
    dialog.addEventListener('pointermove', event => moveAvPhotoGesture(viewer, event));
    dialog.addEventListener('pointerup', event => finishAvPhotoGesture(viewer, event, false));
    dialog.addEventListener('pointercancel', event => finishAvPhotoGesture(viewer, event, true));
    dialog.addEventListener('lostpointercapture', event => finishAvPhotoGesture(viewer, event, true));
    dialog.addEventListener('keydown', event => handleAvPhotoKey(viewer, event));
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeAvPhotoViewer();
    });
    window.addEventListener('pagehide', () => closeAvPhotoViewer({ restoreFocus: false }), { signal: viewer.abort.signal });
    image.addEventListener('load', () => fitAvPhoto(viewer));
    image.addEventListener('error', () => {
        const original = viewer.urls[viewer.index];
        if (image.getAttribute('src') !== original) {
            image.src = original;
            return;
        }
        image.hidden = true;
        viewer.status.textContent = 'Photo unavailable';
        viewer.status.classList.add('is-unavailable');
    });
}

function showAvPhoto(viewer) {
    const { image, status, index, urls, caption } = viewer;
    const original = urls[index];
    const expanded = findPendingPhotoPreviewByUrl(original)?.url || original;
    const label = caption + ', photo ' + (index + 1) + ' of ' + urls.length;
    viewer.lastTap = null;
    resetAvPhotoTransform(viewer);
    status.classList.remove('is-unavailable');
    viewer.imageWidth = 0;
    viewer.imageHeight = 0;
    image.style.removeProperty('width');
    image.style.removeProperty('height');
    status.textContent = label;
    image.alt = label;
    image.hidden = false;
    image.src = expanded;
    if (image.complete) fitAvPhoto(viewer);
}

function fitAvPhoto(viewer) {
    const { dialog, image } = viewer;
    if (!dialog.open || !image.naturalWidth || !image.naturalHeight) return;
    const ratio = Math.min(dialog.clientWidth / image.naturalWidth, dialog.clientHeight / image.naturalHeight);
    viewer.imageWidth = image.naturalWidth * ratio;
    viewer.imageHeight = image.naturalHeight * ratio;
    image.style.width = viewer.imageWidth + 'px';
    image.style.height = viewer.imageHeight + 'px';
    applyAvPhotoTransform(viewer, viewer.scale, viewer.x, viewer.y);
}

function applyAvPhotoTransform(viewer, scale, x, y) {
    const limitX = Math.max(0, (viewer.imageWidth * scale - viewer.dialog.clientWidth) / 2);
    const limitY = Math.max(0, (viewer.imageHeight * scale - viewer.dialog.clientHeight) / 2);
    viewer.scale = scale;
    viewer.x = Math.min(limitX, Math.max(-limitX, x));
    viewer.y = Math.min(limitY, Math.max(-limitY, y));
    viewer.image.style.transform = 'translate(-50%, -50%) translate(' + viewer.x + 'px, ' + viewer.y + 'px) scale(' + scale + ')';
}

function resetAvPhotoTransform(viewer) {
    applyAvPhotoTransform(viewer, 1, 0, 0);
}

function stepAvPhotoViewer(viewer, direction) {
    const next = Math.max(0, Math.min(viewer.index + direction, viewer.urls.length - 1));
    if (next === viewer.index) return;
    viewer.index = next;
    showAvPhoto(viewer);
}

function avPhotoGesturePoint(event) {
    return { x: event.clientX, y: event.clientY };
}

function avPhotoPinchPoints(pointers) {
    const [first, second] = pointers.values();
    return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y))
    };
}

function beginAvPhotoDrag(viewer, point, followsPinch = false) {
    viewer.drag = { ...point, originX: viewer.x, originY: viewer.y, moved: false, followsPinch };
}

function beginAvPhotoGesture(viewer, event) {
    if (event.button !== 0 || viewer.pointers.size >= 2 || event.target.closest('button')) return;
    const point = avPhotoGesturePoint(event);
    event.preventDefault();
    viewer.pointers.set(event.pointerId, point);
    viewer.dialog.setPointerCapture(event.pointerId);
    if (viewer.pointers.size === 1) {
        beginAvPhotoDrag(viewer, point);
        return;
    }
    viewer.lastTap = null;
    viewer.drag = null;
    viewer.pinch = { ...avPhotoPinchPoints(viewer.pointers), scale: viewer.scale, originX: viewer.x, originY: viewer.y };
}

function zoomAvPhotoFromPoints(viewer, scale, originPoint, nextPoint) {
    const nextScale = Math.max(1, Math.min(5, scale));
    const { x, y, width, height } = viewer.dialog.getBoundingClientRect();
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const ratio = nextScale / originPoint.scale;
    applyAvPhotoTransform(viewer, nextScale,
        nextPoint.x - centerX - (originPoint.x - centerX - originPoint.originX) * ratio,
        nextPoint.y - centerY - (originPoint.y - centerY - originPoint.originY) * ratio);
}

function moveAvPhotoGesture(viewer, event) {
    if (!viewer.pointers.has(event.pointerId)) return;
    const point = avPhotoGesturePoint(event);
    viewer.pointers.set(event.pointerId, point);
    if (viewer.pinch) {
        const reference = viewer.pinch;
        const pinch = avPhotoPinchPoints(viewer.pointers);
        zoomAvPhotoFromPoints(viewer, reference.scale * pinch.distance / reference.distance, reference, pinch);
        return;
    }
    const { drag } = viewer;
    if (!drag) return;
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    drag.moved ||= Math.abs(dx) > 10 || Math.abs(dy) > 10;
    if (viewer.scale > 1) applyAvPhotoTransform(viewer, viewer.scale, drag.originX + dx, drag.originY + dy);
}

function finishAvPhotoGesture(viewer, event, cancelled) {
    if (!viewer.pointers.delete(event.pointerId)) return;
    if (viewer.pinch) {
        viewer.pinch = null;
        beginAvPhotoDrag(viewer, viewer.pointers.values().next().value, true);
        return;
    }
    const { drag } = viewer;
    viewer.drag = null;
    if (cancelled || !drag || drag.followsPinch) {
        viewer.lastTap = null;
        return;
    }

    const point = avPhotoGesturePoint(event);
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (drag.moved || Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        viewer.lastTap = null;
        finishAvPhotoSwipe(viewer, dx, dy);
        return;
    }
    if (event.pointerType === 'mouse' && viewer.scale === 1) {
        const {left, width} = viewer.dialog.getBoundingClientRect();
        const zone = (point.x - left) / width;
        if (zone < 0.25 || zone > 0.75) stepAvPhotoViewer(viewer, zone < 0.25 ? -1 : 1);
        return;
    }
    finishAvPhotoTap(viewer, point, event.timeStamp);
}

function finishAvPhotoSwipe(viewer, dx, dy) {
    if (viewer.scale > 1) return;
    const x = Math.abs(dx);
    const y = Math.abs(dy);
    if (dy >= 68 && dy > x * 1.25) {
        closeAvPhotoViewer();
        return;
    }
    if (x >= 50 && x > y * 1.25) stepAvPhotoViewer(viewer, dx < 0 ? 1 : -1);
}

function finishAvPhotoTap(viewer, point, stamp) {
    const previous = viewer.lastTap;
    viewer.lastTap = { ...point, stamp };
    if (!previous || stamp - previous.stamp > 320 || Math.hypot(point.x - previous.x, point.y - previous.y) > 30) return;
    viewer.lastTap = null;
    const origin = { ...point, scale: viewer.scale, originX: viewer.x, originY: viewer.y };
    zoomAvPhotoFromPoints(viewer, viewer.scale === 1 ? 2.5 : 1, origin, point);
}

function releaseAvPhotoPointers(viewer) {
    for (const id of viewer.pointers.keys()) {
        if (viewer.dialog.hasPointerCapture(id)) viewer.dialog.releasePointerCapture(id);
    }
    viewer.pointers.clear();
}

function handleAvPhotoKey(viewer, event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAvPhotoViewer();
        return;
    }
    const actions = {
        ArrowLeft: () => stepAvPhotoViewer(viewer, -1),
        ArrowRight: () => stepAvPhotoViewer(viewer, 1),
        '+': () => applyAvPhotoTransform(viewer, Math.min(5, viewer.scale + 0.5), viewer.x, viewer.y),
        '-': () => applyAvPhotoTransform(viewer, Math.max(1, viewer.scale - 0.5), viewer.x, viewer.y),
        '0': () => resetAvPhotoTransform(viewer)
    };
    if (!Object.hasOwn(actions, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    actions[event.key]();
}
