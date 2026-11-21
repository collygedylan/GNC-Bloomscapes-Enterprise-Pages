const BLOOMSCAPES_FARM_PREWARM_IDLE_MS = 12000;
const BLOOMSCAPES_FARM_PREWARM_RECHECK_LIMIT = 15;
const BLOOMSCAPES_FARM_PREWARM_RETRY_MS = 45000;

function createBloomscapesFarmCache(owner='') {
    return {owner,snapshots:new Map(),pending:new Map(),prewarmFailures:new Map(),cancelPrewarm:null};
}

let bloomscapesFarmCache = createBloomscapesFarmCache();

function bloomscapesFarmCacheOwner() {
    return JSON.stringify([nativeAuthProfile?.id || '',currentUser,currentRole,productionLiveSyncReadAuthEpoch,
        appAccessSnapshotState.snapshot?.dataPermissionVersion || '',currentMasterPreparationSeasonKey()]);
}

function getBloomscapesFarmCache() {
    const owner = bloomscapesFarmCacheOwner();
    if (bloomscapesFarmCache.owner!==owner) {
        const retired = bloomscapesFarmCache;
        bloomscapesFarmCache = createBloomscapesFarmCache(owner);
        retired.cancelPrewarm?.();
        for (const flight of retired.pending.values()) flight.resume?.();
    }
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

function canRetryBloomscapesFarmSnapshot(error,cache,farm,flight) {
    if (flight.speculative || !nativeAuthSessionActive || flight.epoch!==nativeAuthRecoveryEpoch) return false;
    if (error.code==='DATASET_READ_SCOPE_CHANGED') {
        const permission = appAccessSnapshotState.snapshot?.dataPermissionVersion;
        return Boolean(permission && permission!==flight.permission && farm===getBloomscapesFarm()
            && flight.scope===getSupabaseReadIdentityScope() && getBloomscapesAllowedFarms().includes(farm));
    }
    if (!['FARM_SNAPSHOT_SCOPE_CHANGED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code)) return false;
    const identity = owner=>JSON.stringify(JSON.parse(owner).slice(0,2));
    return identity(cache.owner)===identity(bloomscapesFarmCacheOwner());
}

function hasVerifiedBloomscapesFarmPermission() {
    const access = appAccessSnapshotState;
    return access.status==='ready' && !access.stale && access.snapshot?.dataPermissionVersion
        && access.profileId===nativeAuthProfile?.id && access.authEpoch===productionLiveSyncReadAuthEpoch
        && access.username===getRequestCapabilityUsernameKey(currentUser);
}

async function ensureBloomscapesWarmFarm(farm,refresh=false,attempt=0,speculative=false,visit=null) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    const pending = cache.pending.get(farm);
    if (pending && !pending.visit?.aborted && (!pending.visit || pending.visit===visit)) {
        if (!speculative) {
            pending.speculative = false;
            pending.resume?.();
        }
        return visit && !pending.visit ? waitForDocksRead(visit,()=>pending.promise) : pending.promise;
    }
    if (!refresh && cache.snapshots.has(farm)) {
        const snapshot = cache.snapshots.get(farm);
        scheduleBloomscapesWarmAssignments(snapshot);
        return snapshot;
    }
    const flight = {visit,speculative,resume:null,promise:null,scope:getSupabaseReadIdentityScope(),
        epoch:nativeAuthRecoveryEpoch,permission:appAccessSnapshotState.snapshot?.dataPermissionVersion || ''};
    const read = ()=>loadBloomscapesWarmFarm(cache,farm,refresh,flight);
    flight.promise = (visit ? waitForDocksRead(visit,read) : read()).catch(error=>{
        if (visit?.aborted) flight.resume?.();
        if (!attempt && cache.pending.get(farm)===flight && !visit?.aborted && canRetryBloomscapesFarmSnapshot(error,cache,farm,flight)) {
            cache.pending.delete(farm);
            const freshRead = error.code==='DATASET_READ_SCOPE_CHANGED' && !hasVerifiedBloomscapesFarmPermission();
            return ensureBloomscapesWarmFarm(farm,refresh || freshRead,1,false,visit);
        }
        throw error;
    }).finally(()=>{
        if (cache.pending.get(farm)===flight) cache.pending.delete(farm);
    });
    cache.pending.set(farm,flight);
    return flight.promise;
}

async function loadBloomscapesWarmFarm(cache,farm,refresh,flight) {
    const assertCurrent = ()=>{
        flight.visit?.throwIfAborted();
        if (flight.visit && cache.pending.get(farm)!==flight) throw new DOMException('Farm refresh superseded.','AbortError');
        assertBloomscapesFarmCache(cache,farm);
    };
    const prewarm = flight.speculative ? bloomscapesFarmPrewarmContext(flight,assertCurrent) : null;
    const background = flight.visit ? docksFarmReadContext(flight.visit,prewarm) : prewarm;
    const scope = JSON.stringify(JSON.parse(cache.owner).filter((_value,index)=>index !== 3));
    const key = 'bloomscapes-farm-v3111:'+scope+':'+farm;
    const existing = cache.snapshots.get(farm);
    if (refresh && existing?.lastSyncRevisionAt) {
        if (Date.now()-existing.verifiedAt < 45000) return existing;
        if (await readBloomscapesFarmRevision(farm,background)===existing.revision) {
            assertCurrent();
            existing.verifiedAt=Date.now();
            return existing;
        }
    }
    const saved = refresh ? null : await loadCacheValue(key);
    assertCurrent();
    const raw = isReusableBloomscapesFarmSnapshot(saved,scope,farm)
        ? saved : await readBloomscapesFarmSnapshot(farm,assertCurrent,background);
    if (background) await background.checkpoint();
    const snapshot = await prepareBloomscapesFarmPublication(raw,cache.owner,assertCurrent,background?.checkpoint);
    assertCurrent();
    if (raw !== saved) snapshot.verifiedAt = Date.now();
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

async function refreshBloomscapesWarmFarm(farm,visit=null) {
    const cache = getBloomscapesFarmCache();
    const previous = cache.snapshots.get(farm);
    try {
        const snapshot = await ensureBloomscapesWarmFarm(farm,true,0,false,visit);
        assertBloomscapesFarmCache(cache,farm);
        if (snapshot===previous || getBloomscapesFarm()!==farm || bloomscapesFarmState.busy) return;
        activateBloomscapesWarmFarm(snapshot);
        refreshAffectedViews(['master','soc','reserves','warehouseAssignedItems']);
    } catch(error) {
        if (!isObsoleteBloomscapesPreparation(cache,error)) globalThis.reportHandledRuntimeIssue?.('farm_refresh',error.code || 'FARM_REFRESH_FAILED');
    }
}

function prewarmBloomscapesFarms() {
    const cache = getBloomscapesFarmCache();
    const governor = window.BloomscapesBatteryGovernor;
    if (cache.cancelPrewarm || !bloomscapesFarmState.loaded || getBloomscapesAllowedFarms().length < 2 || !governor) return;
    cache.cancelPrewarm = governor.schedule('farm-prewarm',()=>runBloomscapesFarmPrewarm(cache),BLOOMSCAPES_FARM_PREWARM_RETRY_MS);
}

async function runBloomscapesFarmPrewarm(cache) {
    if (cache!==getBloomscapesFarmCache() || !nativeAuthSessionActive) return;
    const activeFarm = getBloomscapesFarm();
    const farms = getBloomscapesAllowedFarms().filter(farm=>farm!==activeFarm && !cache.snapshots.has(farm)
        && (cache.prewarmFailures.get(farm)?.count || 0)<3);
    if (!farms.length) { cache.cancelPrewarm?.(); cache.cancelPrewarm=null; return; }
    if (!window.BloomscapesBatteryGovernor.canPrewarm() || bloomscapesFarmPrewarmDelay()>0) return;
    const farm = farms.find(candidate=>Date.now()>=(cache.prewarmFailures.get(candidate)?.retryAt || 0));
    if (!farm) return;
    try {
        await ensureBloomscapesWarmFarm(farm,false,0,true);
        cache.prewarmFailures.delete(farm);
    } catch(error) {
        if (isObsoleteBloomscapesPreparation(cache,error) || error.name==='AbortError' || error.code==='REQUEST_ABORTED') return;
        const count = (cache.prewarmFailures.get(farm)?.count || 0)+1;
        cache.prewarmFailures.set(farm,{count,retryAt:Date.now()+BLOOMSCAPES_FARM_PREWARM_RETRY_MS*2**(count-1)});
        globalThis.reportHandledRuntimeIssue?.('farm_prewarm',error.code || 'FARM_PREWARM_FAILED');
    }
}

function bloomscapesFarmPrewarmDelay() {
    const quietMs = Date.now()-lastUserInteractionAt;
    if (quietMs<BLOOMSCAPES_FARM_PREWARM_IDLE_MS) return BLOOMSCAPES_FARM_PREWARM_IDLE_MS-quietMs;
    return bloomscapesFarmState.busy || shouldDeferInteractiveBackgroundWork() ? BLOOMSCAPES_FARM_PREWARM_IDLE_MS : 0;
}

function bloomscapesFarmPrewarmPaused() {
    return Object.assign(new Error('Farm prewarming paused.'),{code:'FARM_PREPARATION_PAUSED'});
}

function waitForBloomscapesFarmPrewarm(flight,delay) {
    return new Promise(resolve=>{
        const wake = ()=>{ clearTimeout(timer); flight.resume=null; resolve(); };
        const timer = setTimeout(wake,delay);
        flight.resume = wake;
    });
}

function bloomscapesFarmPrewarmContext(flight,assertCurrent) {
    const governor = window.BloomscapesBatteryGovernor;
    const signal = governor.signal();
    return {
        isSpeculative:()=>flight.speculative,
        signal:()=>flight.speculative ? signal : governor.viewSignal(),
        checkpoint:async()=>{
            for (let check=0;check<BLOOMSCAPES_FARM_PREWARM_RECHECK_LIMIT;check++) {
                assertCurrent();
                if (!flight.speculative) return;
                if (signal.aborted || !governor.canPrewarm()) throw bloomscapesFarmPrewarmPaused();
                const delay = bloomscapesFarmPrewarmDelay();
                if (delay<=0) return;
                await waitForBloomscapesFarmPrewarm(flight,delay);
            }
            assertCurrent();
            if (flight.speculative) throw bloomscapesFarmPrewarmPaused();
        }
    };
}

function isObsoleteBloomscapesPreparation(cache,error) {
    return error.name==='AbortError' || ['FARM_PREPARATION_PAUSED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code) || cache.owner!==bloomscapesFarmCacheOwner();
}

function isReusableBloomscapesFarmSnapshot(saved,scope,farm,now = Date.now()) {
    const age = now - Number(saved?.loadedAt);
    return !!saved?.lastSyncRevisionAt && saved.cacheScope === scope && saved.farm === farm
        && Array.isArray(saved.inventory) && saved.inventoryRowCount === saved.inventory.length
        && Number.isFinite(age) && age >= 0 && age < 604800000;
}
