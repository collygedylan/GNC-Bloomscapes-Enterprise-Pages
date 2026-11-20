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
    if (cached?.index && cached.farm===farm && cached.epoch===state.dataEpoch && cached.owner===bloomscapesFarmCacheOwner()) return cached.index;
    const index = buildBloomscapesAssignmentIndex(farm,warehouseAssignedItemsInventory || [],
        [...(state.defaultOwnersByCode || new Map()).values()]);
    state.bloomscapesOwners = {farm,epoch:state.dataEpoch,owner:bloomscapesFarmCacheOwner(),index};
    return index;
}

function getBloomscapesWarmFarm(farm) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    const snapshot = cache.snapshots.get(farm);
    return snapshot?.indexes?.byItemCode && snapshot.indexes.byId ? snapshot : null;
}

async function ensureBloomscapesWarmFarm(farm,refresh=false,attempt=0) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    if (cache.pending.has(farm)) return cache.pending.get(farm);
    if (!refresh && cache.snapshots.has(farm)) {
        const snapshot = cache.snapshots.get(farm);
        scheduleBloomscapesWarmAssignments(snapshot);
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
        if (cache.prewarming && farm !== getBloomscapesFarm() && !window.BloomscapesBatteryGovernor.canPrewarm()) throw Object.assign(new Error('Farm prewarming paused.'),{code:'FARM_PREPARATION_PAUSED'});
        if (cache.prewarming && (document.hidden || navigator.onLine===false)) throw Object.assign(new Error('Farm prewarming paused.'),{code:'FARM_PREPARATION_PAUSED'});
    };
    const scope = JSON.stringify(JSON.parse(cache.owner).filter((_value,index)=>index !== 3));
    const key = 'bloomscapes-farm-v3111:'+scope+':'+farm;
    const existing = cache.snapshots.get(farm);
    if (refresh && existing?.lastSyncRevisionAt && await readBloomscapesFarmRevision(farm)===existing.revision) return existing;
    const saved = refresh ? null : await loadCacheValue(key);
    assertCurrent();
    const raw = isReusableBloomscapesFarmSnapshot(saved,scope,farm)
        ? saved : await readBloomscapesFarmSnapshot(farm,assertCurrent);
    const snapshot = await prepareBloomscapesFarmPublication(raw,cache.owner,assertCurrent);
    assertCurrent();
    cache.snapshots.set(farm,snapshot);
    void saveCacheValue(key,{...raw,cacheScope:scope,inventoryRowCount:raw.inventory.length,loadedAt:raw === saved ? raw.loadedAt : snapshot.loadedAt});
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
        snapshot.assignedMap ||= buildBloomscapesAssignmentIndex(snapshot.farm,snapshot.assigned,snapshot.defaultOwnersByCode.values());
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
    if (cache.prewarming || !bloomscapesFarmState.loaded || !window.BloomscapesBatteryGovernor.canPrewarm()) return;
    cache.prewarming = true;
    try {
        for (const farm of getBloomscapesAllowedFarms()) {
            assertBloomscapesFarmCache(cache,farm);
            if (!window.BloomscapesBatteryGovernor.canPrewarm()) return;
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

function isReusableBloomscapesFarmSnapshot(saved,scope,farm,now = Date.now()) {
    const age = now - Number(saved?.loadedAt);
    return !!saved?.lastSyncRevisionAt && saved.cacheScope === scope && saved.farm === farm
        && Array.isArray(saved.inventory) && saved.inventoryRowCount === saved.inventory.length
        && Number.isFinite(age) && age >= 0 && age < 604800000;
}
