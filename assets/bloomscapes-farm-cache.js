const BLOOMSCAPES_FARM_PREWARM_RECHECK_LIMIT = 15;

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

function bloomscapesFarmFlightContext(flight,assertCurrent,prewarmDelay) {
    const prewarm = flight.speculative ? bloomscapesFarmPrewarmContext(flight,assertCurrent,prewarmDelay) : null;
    const signal = flight.controller.signal;
    const foreground = flight.visit ? AbortSignal.any([signal,flight.visit]) : signal;
    const speculative = prewarm ? AbortSignal.any([foreground,prewarm.signal()]) : foreground;
    return {
        isSpeculative:()=>flight.speculative,
        signal:()=>flight.speculative ? speculative : foreground,
        checkpoint:async()=>{
            assertCurrent();
            if (flight.speculative) await prewarm.checkpoint();
            assertCurrent();
        }
    };
}

function bloomscapesFarmPrewarmContext(flight,assertCurrent,prewarmDelay) {
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
                const delay = prewarmDelay();
                if (delay<=0) return;
                await waitForBloomscapesFarmPrewarm(flight,delay);
            }
            assertCurrent();
            if (flight.speculative) throw bloomscapesFarmPrewarmPaused();
        }
    };
}

const BLOOMSCAPES_FARM_PREWARM_IDLE_MS = 12000;
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
        for (const flight of retired.pending.values()) {
            flight.controller.abort();
            flight.resume?.();
        }
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
    const owner = getSupabaseReadIdentityScope();
    const sameScope = cached?.owner===owner && cached.farm===farm;
    if (sameScope && cached.index && cached.epoch===state.dataEpoch) return cached.index;
    const overrides = sameScope ? cached.overrides : null;
    const rows = overrides || warehouseAssignedItemsInventory || [];
    const index = buildBloomscapesAssignmentIndex(farm,rows,(state.defaultOwnersByCode || new Map()).values());
    state.bloomscapesOwners = {farm,epoch:state.dataEpoch,owner,index,overrides,
        overrideKey:sameScope ? cached.overrideKey : null,receipt:sameScope ? cached.receipt : null};
    return index;
}

function publishBloomscapesOwnerIndex(state, snapshot, index) {
    const overrides = expandBloomscapesOwnerOverrides(snapshot);
    state.bloomscapesOwners = {farm:snapshot.farm,epoch:state.dataEpoch,owner:getSupabaseReadIdentityScope(),
        index:index || buildBloomscapesAssignmentIndex(snapshot.farm,overrides,state.defaultOwnersByCode.values()),
        overrides,overrideKey:JSON.stringify([snapshot.blocks,snapshot.overrides])};
}

function getBloomscapesWarmFarm(farm) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    const snapshot = cache.snapshots.get(farm);
    return snapshot?.indexes?.byItemCode && snapshot.indexes.byId ? snapshot : null;
}

function cancelBloomscapesFarmRead(farm) {
    const {pending} = getBloomscapesFarmCache();
    const flight = pending.get(farm);
    if (!flight) return;
    pending.delete(farm);
    flight.controller.abort();
    flight.resume?.();
}

function canRetryBloomscapesFarmSnapshot(error,cache,farm,flight) {
    if (flight.speculative || !nativeAuthSessionActive || flight.epoch!==nativeAuthRecoveryEpoch) return false;
    if (farm!==getBloomscapesFarm() || !getBloomscapesAllowedFarms().includes(farm)) return false;
    const currentOwner = bloomscapesFarmCacheOwner();
    const identity = owner=>JSON.stringify(JSON.parse(owner).slice(0,2));
    if (identity(cache.owner)!==identity(currentOwner)) return false;
    if (cache.owner!==currentOwner) return true;
    if (error.code==='DATASET_READ_SCOPE_CHANGED') {
        const permission = appAccessSnapshotState.snapshot?.dataPermissionVersion;
        return Boolean(permission && permission!==flight.permission && flight.scope===getSupabaseReadIdentityScope());
    }
    return isRetryableFarmReadTransport(error) || ['FARM_SNAPSHOT_SCOPE_CHANGED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code);
}

async function ensureBloomscapesWarmFarm(farm,refresh=false,attempt=0,speculative=false,visit=null) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,farm);
    if (!refresh && !speculative && bloomscapesFarmState.confirmed && bloomscapesFarmState.busy && farm===getBloomscapesFarm()) {
        hydrateBloomscapesReferenceSnapshot();
    }
    if (!refresh && cache.snapshots.has(farm)) {
        const snapshot = cache.snapshots.get(farm);
        scheduleBloomscapesWarmAssignments(snapshot);
        return snapshot;
    }
    const pending = cache.pending.get(farm);
    if (pending && (speculative || !pending.speculative) && !pending.visit?.aborted && (!pending.visit || pending.visit===visit)) {
        return visit && !pending.visit ? waitForDocksRead(visit,()=>pending.promise) : pending.promise;
    }
    // A speculative HTTP read may already be bound to a paused governor signal.
    // Start a foreground flight instead of adopting that transport.
    pending?.controller.abort();
    pending?.resume?.();
    const flight = {visit,speculative,resume:null,promise:null,controller:new AbortController(),scope:getSupabaseReadIdentityScope(),
        epoch:nativeAuthRecoveryEpoch,selection:bloomscapesFarmState.selectionToken,permission:appAccessSnapshotState.snapshot?.dataPermissionVersion || ''};
    const read = ()=>loadBloomscapesWarmFarm(cache,farm,refresh,flight);
    flight.promise = Promise.resolve().then(()=>visit ? waitForDocksRead(visit,read) : read()).catch(async error=>{
        if (visit?.aborted) flight.resume?.();
        if (attempt < 2 && cache.pending.get(farm)===flight && !visit?.aborted && canRetryBloomscapesFarmSnapshot(error,cache,farm,flight)) {
            cache.pending.delete(farm);
            const freshRead = error.code==='DATASET_READ_SCOPE_CHANGED' && !hasVerifiedBloomscapesFarmPermission();
            if (appAccessSnapshotLoadPromise) await appAccessSnapshotLoadPromise;
            if (flight.selection !== bloomscapesFarmState.selectionToken || farm !== getBloomscapesFarm()) throw error;
            return ensureBloomscapesWarmFarm(farm,refresh || freshRead,attempt+1,false,visit);
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
        assertBloomscapesFarmCache(cache,farm);
        flight.controller.signal.throwIfAborted();
        flight.visit?.throwIfAborted();
        if (cache.pending.get(farm)!==flight) throw new DOMException('Farm refresh superseded.','AbortError');
    };
    const background = bloomscapesFarmFlightContext(flight,assertCurrent,bloomscapesFarmPrewarmDelay);
    const existing = cache.snapshots.get(farm);
    if (refresh && existing?.lastSyncRevisionAt) {
        if (Date.now()-existing.verifiedAt < 45000) return existing;
        if (await readBloomscapesFarmRevision(farm,background)===existing.revision) {
            assertCurrent();
            existing.verifiedAt=Date.now();
            return existing;
        }
    }
    const saved = refresh ? null : await readBloomscapesPersistedFarm(farm,cache.owner);
    assertCurrent();
    if (!refresh && !saved && farm===getBloomscapesFarm() && bloomscapesFarmState.confirmed) {
        await restoreBloomscapesBootMaster();
        assertCurrent();
    }
    const raw = saved?.owners ? saved : saved
        ? {...saved,cacheScope:null,owners:await readBloomscapesAssignedOwnerSnapshot(farm,bloomscapesFarmSnapshotSignal(background),background)}
        : await readBloomscapesFarmSnapshot(farm,assertCurrent,background,publishVerifiedBloomscapesOwners);
    assertCurrent();
    persistBloomscapesReadyFarm(raw,cache.owner);
    if (background) await background.checkpoint();
    const snapshot = await prepareBloomscapesFarmPublication(raw,cache.owner,assertCurrent,background?.checkpoint);
    assertCurrent();
    cache.snapshots.set(farm,snapshot);
    if (!saved) snapshot.verifiedAt = Date.now();
    return snapshot;
}

function activateBloomscapesWarmFarm(snapshot) {
    const cache = getBloomscapesFarmCache();
    assertBloomscapesFarmCache(cache,snapshot.farm);
    if (snapshot.owner!==cache.owner || cache.snapshots.get(snapshot.farm)!==snapshot) throw new Error('Stale farm snapshot rejected.');
    publishPreparedBloomscapesFarm(snapshot);
    snapshot.active = true;
    if (snapshot.farm===getBloomscapesFarm()) hydrateBloomscapesReferenceSnapshot();
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

async function refreshBloomscapesWarmFarm(farm,visit=null,current=()=>farm===getBloomscapesFarm()) {
    const cache = getBloomscapesFarmCache();
    const previous = cache.snapshots.get(farm);
    try {
        const snapshot = await ensureBloomscapesWarmFarm(farm,true,0,false,visit);
        assertBloomscapesFarmCache(cache,farm);
        if (snapshot===previous || !current() || bloomscapesFarmState.busy) return;
        activateBloomscapesWarmFarm(snapshot);
        refreshAffectedViews(['master','soc','reserves','warehouseAssignedItems']);
    } catch(error) {
        if (current() && !isObsoleteBloomscapesPreparation(cache,error)) globalThis.reportHandledRuntimeIssue?.('farm_refresh',error.code || 'FARM_REFRESH_FAILED');
    }
}

function prewarmBloomscapesFarms() {
    const cache = getBloomscapesFarmCache();
    const governor = window.BloomscapesBatteryGovernor;
    if (cache.cancelPrewarm || !bloomscapesFarmState.loaded || getBloomscapesAllowedFarms().length < 2 || !governor) return;
    cache.cancelPrewarm = governor.schedule('farm-prewarm',()=>queueBloomscapesFarmPrewarm(cache),BLOOMSCAPES_FARM_PREWARM_RETRY_MS);
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

function isObsoleteBloomscapesPreparation(cache,error) {
    return error.name==='AbortError' || error.code==='REQUEST_ABORTED'
        || ['FARM_PREPARATION_PAUSED','FARM_SNAPSHOT_REVISION_CHANGED'].includes(error.code)
        || cache.owner!==bloomscapesFarmCacheOwner();
}

function isReusableBloomscapesFarmSnapshot(saved,scope,farm,now = Date.now()) {
    const age = now - Number(saved?.loadedAt);
    return !!saved?.lastSyncRevisionAt && saved.cacheScope === scope && saved.farm === farm
        && Array.isArray(saved.inventory) && saved.inventoryRowCount === saved.inventory.length
        && Number.isFinite(age) && age >= 0 && age < 604800000;
}

function bloomscapesFarmStorageScope(owner) {
    return JSON.stringify(JSON.parse(owner).filter((_,index)=>index!==3 && index!==5));
}

/**
 * @param {string} farm
 * @param {string} [owner]
 * @returns {string} Scoped key for the persisted farm snapshot.
 */
function bloomscapesFarmStorageKey(farm,owner = bloomscapesFarmCacheOwner()) {
    return 'bloomscapes-farm-v3154:'+bloomscapesFarmStorageScope(owner)+':'+farm;
}

/**
 * @param {string} farm
 * @param {string} owner
 * @returns {Promise<object|null>} Reusable current or legacy farm snapshot.
 */
async function readBloomscapesPersistedFarm(farm,owner) {
    const scope = bloomscapesFarmStorageScope(owner);
    const saved = await readFarmSnapshotCache(bloomscapesFarmStorageKey(farm,owner));
    if (isReusableBloomscapesFarmSnapshot(saved,scope,farm)) return saved;
    const legacyScope = JSON.stringify(JSON.parse(owner).filter((_,index)=>index!==3));
    const legacy = await loadCacheValue('bloomscapes-farm-v3111:'+legacyScope+':'+farm);
    return isReusableBloomscapesFarmSnapshot(legacy,legacyScope,farm) ? legacy : null;
}

/**
 * @param {object} raw
 * @param {string} owner
 * @returns {void} Publishes the verified farm snapshot under its scoped key.
 */
function persistBloomscapesReadyFarm(raw,owner) {
    const scope = bloomscapesFarmStorageScope(owner);
    if (raw.cacheScope === scope) return;
    void writeFarmSnapshotCache(bloomscapesFarmStorageKey(raw.farm,owner),{...raw,cacheScope:scope,
        inventoryRowCount:raw.inventory.length,loadedAt:raw.loadedAt || Date.now()});
}

const bloomscapesReferenceFlights = new Map();
let bloomscapesReferenceCurrent;

function getBloomscapesReferenceScope() {
    const profile = nativeAuthProfile;
    const access = getAppAccessSnapshot();
    if (!nativeAuthSessionActive || !profile?.id || !access?.dataPermissionVersion || profile.disabled_at
        || hasConfirmedCurrentAccountRevocation()) return null;
    const farm = getBloomscapesFarm();
    const withCapacity = canViewFieldWorkConsolidation();
    return {farm,withCapacity,key:JSON.stringify([profile.id,currentUser,currentRole,access.dataPermissionVersion,farm,withCapacity])};
}

function getBloomscapesReferenceSnapshot() {
    const scope = getBloomscapesReferenceScope();
    return scope && scope.key === bloomscapesReferenceCurrent?.key ? bloomscapesReferenceCurrent : null;
}

function hydrateBloomscapesReferenceSnapshot() {
    const scope = getBloomscapesReferenceScope();
    if (!scope || bloomscapesReferenceFlights.has(scope.key)) return;
    if (Date.now()-(getBloomscapesReferenceSnapshot()?.checkedAt || 0) < 300000) return;
    const flight = loadBloomscapesReferenceSnapshot(scope).finally(()=>bloomscapesReferenceFlights.delete(scope.key));
    bloomscapesReferenceFlights.set(scope.key,flight);
}

async function loadBloomscapesReferenceSnapshot(scope) {
    const cacheKey = 'bloomscapes-reference-v1:'+scope.key;
    const current = ()=>getBloomscapesReferenceScope()?.key === scope.key;
    const cached = await loadCacheValue(cacheKey);
    if (!current()) return;
    const prior = cached?.key === scope.key ? cached : null;
    if (prior) bloomscapesReferenceCurrent = prior;
    if (navigator.onLine === false) return;
    try {
        const live = await readBloomscapesReferenceSnapshot(scope.farm,scope.withCapacity);
        if (!current()) return;
        const checkedAt = Date.now();
        const complete = live.scheduleSummary && (!scope.withCapacity || live.cpb && live.beds);
        const snapshot = {key:scope.key,checkedAt,verifiedAt:complete ? checkedAt : prior?.verifiedAt,
            scheduleSummary:live.scheduleSummary ?? prior?.scheduleSummary,
            cpb:live.cpb ?? prior?.cpb,beds:live.beds ?? prior?.beds};
        bloomscapesReferenceCurrent = snapshot;
        await saveCacheValue(cacheKey,snapshot);
    } catch (error) {
        if (current() && error.name !== 'AbortError') globalThis.reportHandledRuntimeIssue?.('reference_snapshot',error.code || 'REFERENCE_READ_FAILED');
    }
}

function getCachedFieldWorkCapacity(item) {
    const snapshot = getBloomscapesReferenceSnapshot();
    const cpb = snapshot?.cpb?.find(row=>row.itemcode===item.code);
    return cpb ? {cpb,locations:snapshot.beds || []} : null;
}
