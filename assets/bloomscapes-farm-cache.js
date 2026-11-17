let bloomscapesFarmCache = {owner:'',snapshots:new Map(),pending:new Map(),prewarming:false};

function bloomscapesFarmCacheOwner() {
    return JSON.stringify([nativeAuthProfile?.id || '',currentUser,currentRole,productionLiveSyncReadAuthEpoch,
        appAccessSnapshotState.snapshot?.dataPermissionVersion || '',currentMasterPreparationSeasonKey()]);
}

function getBloomscapesFarmCache() {
    const owner = bloomscapesFarmCacheOwner();
    if (bloomscapesFarmCache.owner!==owner) bloomscapesFarmCache = {owner,snapshots:new Map(),pending:new Map(),prewarming:false};
    return bloomscapesFarmCache;
}

function assertBloomscapesFarmCache(cache,farm) {
    if (cache!==getBloomscapesFarmCache() || !nativeAuthSessionActive || !getBloomscapesAllowedFarms().includes(farm)) {
        throw Object.assign(new Error('Farm snapshot account or permissions changed.'),{code:'FARM_SNAPSHOT_SCOPE_CHANGED'});
    }
}

function getBloomscapesAssignmentIndex() {
    const state = getManagerAssignedColumnState();
    const cached = state.bloomscapesOwners;
    const farm = getBloomscapesFarm();
    if (cached?.farm===farm && cached.epoch===state.dataEpoch && cached.owner===bloomscapesFarmCacheOwner()) return cached.index;
    const index = buildBloomscapesAssignmentIndex(farm,warehouseAssignedItemsInventory || [],
        [...(state.defaultOwnersByCode || new Map()).values()]);
    state.bloomscapesOwners = {farm,epoch:state.dataEpoch,owner:bloomscapesFarmCacheOwner(),index};
    return index;
}

function getBloomscapesWarmFarm(farm) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    const snapshot = cache.snapshots.get(farm);
    return snapshot?.assignedMap && snapshot.driveProjection ? snapshot : null;
}

async function ensureBloomscapesWarmFarm(farm,refresh=false,attempt=0) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    if (cache.pending.has(farm)) return cache.pending.get(farm);
    if (!refresh && cache.snapshots.has(farm)) {
        const snapshot = cache.snapshots.get(farm);
        snapshot.assignedMap ||= buildBloomscapesAssignmentIndex(farm,snapshot.assigned,snapshot.defaults);
        snapshot.driveProjection ||= prepareBloomscapesDriveProjection(snapshot.inventory);
        return snapshot;
    }
    const task = loadBloomscapesWarmFarm(cache,farm,refresh).catch(error=>{
        const sameAccount = JSON.stringify(JSON.parse(cache.owner).slice(0,2))===JSON.stringify(JSON.parse(bloomscapesFarmCacheOwner()).slice(0,2));
        if (!attempt && sameAccount && ['FARM_SNAPSHOT_SCOPE_CHANGED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code)) {
            cache.pending.delete(farm);
            return ensureBloomscapesWarmFarm(farm,refresh,1);
        }
        throw error;
    }).finally(()=>cache.pending.delete(farm));
    cache.pending.set(farm,task);
    return task;
}

async function loadBloomscapesWarmFarm(cache,farm,refresh) {
    const assertCurrent = ()=>{
        assertBloomscapesFarmCache(cache,farm);
        if (document.hidden || navigator.onLine===false) throw Object.assign(new Error('Farm preparation paused while the page is inactive.'),{code:'FARM_PREPARATION_PAUSED'});
    };
    const key = 'bloomscapes-farm-v94:'+cache.owner+':'+farm;
    const existing = cache.snapshots.get(farm);
    if (refresh && existing && await readBloomscapesFarmRevision(farm)===existing.revision) return existing;
    const saved = refresh ? null : await loadCacheValue(key);
    assertCurrent();
    const raw = saved?.owner===cache.owner && saved.farm===farm && Array.isArray(saved.inventory) && Date.now()-saved.loadedAt<1800000
        ? saved : await readBloomscapesFarmSnapshot(farm,assertCurrent);
    const snapshot = await prepareBloomscapesFarmPublication(raw,cache.owner,assertCurrent);
    assertCurrent();
    cache.snapshots.set(farm,snapshot);
    void saveCacheValue(key,{...raw,owner:cache.owner,loadedAt:snapshot.loadedAt});
    return snapshot;
}

function activateBloomscapesWarmFarm(snapshot) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,snapshot.farm);
    if (snapshot.owner!==cache.owner || cache.snapshots.get(snapshot.farm)!==snapshot) throw new Error('Stale farm snapshot rejected.');
    publishPreparedBloomscapesFarm(snapshot);
    snapshot.active = true;
}

function rememberBloomscapesFarmPublication(invalidateDrive=false) {
    const snapshot = getBloomscapesFarmCache().snapshots.get(getBloomscapesFarm());
    if (snapshot?.active && bloomscapesFarmState.readyFarm===snapshot.farm) captureBloomscapesFarmPublication(snapshot,invalidateDrive);
}

function scheduleBloomscapesWarmAssignments(snapshot) {
    if (snapshot.assignedMap && snapshot.driveProjection || snapshot.ownersPending) return;
    snapshot.ownersPending = true;
    const prepare = ()=>{
        snapshot.ownersPending = false;
        const cache = getBloomscapesFarmCache();
        if (snapshot.owner!==cache.owner || cache.snapshots.get(snapshot.farm)!==snapshot
            || document.hidden || navigator.onLine===false) return;
        snapshot.assignedMap ||= buildBloomscapesAssignmentIndex(snapshot.farm,snapshot.assigned,snapshot.defaults);
        snapshot.driveProjection ||= prepareBloomscapesDriveProjection(snapshot.inventory);
    };
    if (typeof requestIdleCallback==='function') requestIdleCallback(prepare,{timeout:1500});
    else setTimeout(prepare,200);
}

async function refreshBloomscapesWarmFarm(farm) {
    const cache = getBloomscapesFarmCache();
    const previous = cache.snapshots.get(farm);
    try {
        const snapshot = await ensureBloomscapesWarmFarm(farm,true);
        assertBloomscapesFarmCache(cache,farm);
        if (snapshot===previous || getBloomscapesFarm()!==farm || bloomscapesFarmState.busy) return;
        activateBloomscapesWarmFarm(snapshot);
        refreshAffectedViews(['master','soc','reserves','warehouseAssignedItems']);
    } catch(error) {
        if (!isObsoleteBloomscapesPreparation(cache,error)) globalThis.reportHandledRuntimeIssue?.('farm_refresh',error.code || 'FARM_REFRESH_FAILED');
    }
}

async function prewarmBloomscapesFarms() {
    const cache = getBloomscapesFarmCache();
    if (cache.prewarming || !bloomscapesFarmState.loaded || document.hidden || navigator.onLine===false) return;
    cache.prewarming = true;
    try {
        for (const farm of getBloomscapesAllowedFarms()) {
            assertBloomscapesFarmCache(cache,farm);
            if (document.hidden || navigator.onLine===false) return;
            await ensureBloomscapesWarmFarm(farm);
        }
    } catch(error) {
        if (!isObsoleteBloomscapesPreparation(cache,error)) globalThis.reportHandledRuntimeIssue?.('farm_prewarm',error.code || 'FARM_PREWARM_FAILED');
    }
    finally { cache.prewarming = false; }
}

function isObsoleteBloomscapesPreparation(cache,error) {
    return ['FARM_PREPARATION_PAUSED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code) || cache.owner!==bloomscapesFarmCacheOwner();
}
