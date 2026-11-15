const BLOOMSCAPES_CARD_SELECTOR='.inventory-card,.drive-card,.app-smart-card,.bloomscapes-field-work-card,.bloomscapes-transfer-card,[data-docks-dock-card],[data-docks-drop-card],[data-docks-stop-card],[data-bloomscapes-workflow] article';
function configureBloomscapesCardWindowNode(node) {
    node.style.removeProperty('content-visibility');
    node.style.removeProperty('contain-intrinsic-size');
}
function tuneNativeImagePerformance(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    let imgs = [];
    try {
        imgs = Array.from(scope.querySelectorAll('img:not([data-native-image-tuned="1"])'));
    } catch {
        imgs = [];
    }
    if (!imgs.length) return;
    const maxTune = getAdaptiveImageHydrationScanLimit();
    imgs.slice(0, maxTune).forEach((img) => {
        if (!img || !img.dataset) return;
        if (img.closest(BLOOMSCAPES_CARD_SELECTOR) || !img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (img.closest(BLOOMSCAPES_CARD_SELECTOR) || !img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
        if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority', 'low');
        img.draggable = false;
        img.dataset.nativeImageTuned = '1';
    });
}

function abortBloomscapesThumbnail(img) {
    if (!img.matches('img[data-deferred-card-photo]') && !img.closest(BLOOMSCAPES_CARD_SELECTOR)) return;
    delete img.dataset.photoObserved;delete img.dataset.photoObservedSrc;
    if (img.complete || !img.getAttribute('src')) return;
    if(!img.dataset.src)img.dataset.src=img.getAttribute('src');
    img.dataset.deferredCardPhoto='1';
    img.dataset.photoCancelled='1';
    img.removeAttribute('src');
    delete img.dataset.photoHydrated;
}
function abortBloomscapesCardThumbnails(root) {
    root.querySelectorAll('img').forEach(abortBloomscapesThumbnail);
}
