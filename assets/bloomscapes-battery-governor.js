const bloomscapesBatteryResources=new Map();
let bloomscapesBatteryPaused=false;
function registerBloomscapesBatteryResource(name,resource) {
    if (name==='radio' || name==='push') throw Error('Radio and push remain independent of inventory suspension.');
    bloomscapesBatteryResources.set(name,resource);
    return ()=>bloomscapesBatteryResources.delete(name);
}
function syncBloomscapesBatteryState() {
    if (typeof currentUser==='undefined') return;
    const paused=document.hidden || navigator.onLine===false;
    if (!paused && typeof prewarmBloomscapesFarms==='function') void prewarmBloomscapesFarms();
    if (paused===bloomscapesBatteryPaused) return;
    bloomscapesBatteryPaused=paused;
    for(const resource of bloomscapesBatteryResources.values()) {
        if (paused) resource.pause();
        else resource.resume();
    }
}
function pauseBloomscapesInventoryUi() {
    if (typeof productionLiveSyncCoordinator==='undefined') return;
    productionLiveSyncCoordinator?.suspend();
    clearManagerApprovalLiveRefresh();
    clearReclassDeliveryPollTimer();
    stopBloomscapesJobBoardRefresh();
    cancelAnimationFrame(deferredCardPhotoHydrationFrame);
    clearTimeout(deferredCardPhotoHydrationIdleTimer);
    deferredCardPhotoHydrationFrame=0;
    deferredCardPhotoHydrationIdleTimer=0;
    deferredCardPhotoHydrationRoots.clear();
    deferredCardPhotoObserver?.disconnect();
    docksWriteControlObservers.forEach(observer=>observer.disconnect());
    docksWriteControlObservers.clear();
    abortBloomscapesCardThumbnails(document);
}
function resumeBloomscapesInventoryUi() {
    if (!currentUser) return;
    if (typeof prewarmBloomscapesFarms==='function') void prewarmBloomscapesFarms();
    getProductionLiveSyncCoordinator()?.signal('battery-foreground');
    scheduleManagerApprovalLiveRefresh();
    startReclassDeliveryPolling();
    startBloomscapesJobBoardRefresh();
    updateDocksWriteControlGate();
    scheduleDeferredCardPhotoHydration();
}
function pruneBloomscapesFarmInventoryCaches() {
    const caches=[taskScopedQueueItemsCache,taskHotStateCache,taskFilteredItemsCache,taskGenusOptionsCache,
        taskContSizeOptionsCache,taskLocationDetailStateCache,ncrApprovalTaskQueueCacheByView];
    caches.forEach(cache=>cache.clear());
    docksScopedItemsCache=null;
    docksScopedItemsCacheKey='';
    // The canonical farm publication replaces master arrays and indexes itself.
    // Release derived arrays from prior farms after that receipt, retaining drafts.
}
registerBloomscapesBatteryResource('inventory-ui',{pause:pauseBloomscapesInventoryUi,resume:resumeBloomscapesInventoryUi});
document.addEventListener('visibilitychange',syncBloomscapesBatteryState);
window.addEventListener('gnc-user-access-change',syncBloomscapesBatteryState);
window.addEventListener('offline',syncBloomscapesBatteryState);
window.addEventListener('online',syncBloomscapesBatteryState);
window.addEventListener('pagehide',()=>{
    bloomscapesBatteryPaused=true;
    pauseBloomscapesInventoryUi();
});
window.addEventListener('pageshow',syncBloomscapesBatteryState);
