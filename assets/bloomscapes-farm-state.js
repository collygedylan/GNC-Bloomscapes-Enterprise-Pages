let bloomscapesFarmState = {owner:'',farm:'10-PH',busy:false};

function getBloomscapesFarm() {
    const owner = String(typeof currentUser === 'undefined' ? '' : currentUser);
    if (owner !== bloomscapesFarmState.owner) bloomscapesFarmState = {owner,farm:'10-PH',busy:false};
    return bloomscapesFarmState.farm;
}

function bloomscapesFarmRowIsVisible(row) {
    const farm = getBloomscapesFarm();
    const rowFarm = bloomscapesRowFarm(row);
    return farm === 'ALL' ? ['10-PH','60-HL'].includes(rowFarm) : rowFarm === farm;
}

async function selectBloomscapesFarm(farm) {
    if (!['10-PH','60-HL','ALL'].includes(farm)) throw new Error('Choose a valid farm.');
    const previous = getBloomscapesFarm();
    const state = bloomscapesFarmState;
    if (state.busy || previous === farm) return previous;
    state.busy = true;
    state.farm = farm;
    try {
        const loaded = await ensureDatasetLoaded('master','full',{force:true,bypassLiveSyncCoordinator:true});
        if (bloomscapesFarmState !== state) throw new Error('Signed-in account changed.');
        if (!loaded) throw new Error('Farm data is unavailable; previous inventory retained.');
        refreshAffectedViews(['master','avOpen','requests','soc']);
        return farm;
    } catch (error) {
        if (bloomscapesFarmState === state) state.farm = previous;
        throw error;
    } finally { state.busy = false; }
}

function getSupabaseReadIdentityScope() {
    return JSON.stringify([
        typeof SUPABASE_URL === 'string' ? SUPABASE_URL : '',
        typeof nativeAuthSessionActive !== 'undefined' && !!nativeAuthSessionActive,
        typeof nativeAuthProfile !== 'undefined' ? nativeAuthProfile?.id || '' : '',
        typeof currentUser !== 'undefined' ? String(currentUser || '').trim().toLowerCase() : '',
        typeof currentRole !== 'undefined' ? String(currentRole || '').trim().toLowerCase() : '',
        typeof currentUserDivision !== 'undefined' ? String(currentUserDivision || '') : '',
        typeof getCurrentLoginCacheScopeKey === 'function' ? getCurrentLoginCacheScopeKey() : '',
        // A learned revision hash is not a session boundary. Reads keep
        // their account owner while server-side permission checks refresh.
        productionLiveSyncReadAuthEpoch,
        getBloomscapesFarm()
    ]);
}


function getScopedDocksItems(items = socInventory, cacheScopeKey = '') {
    const { isAdmin, isRep, isQcSupervisor, isQc } = getRoleAccessState();
    // Docks is an operational snapshot, not a date report. A missing or
    // old PLANSTART value must never hide a currently imported dock row.
    let nextItems = getActiveSuspendDockRows(Array.isArray(items) ? items : []).filter((row) => {
        const dock = normalizeDockViewDockKey(firstNonEmptyValue(row && row.DOCK, row && row.dock, row && row.DOCK_NUM, row && row.dock_num, ''));
        return dock !== 'Unassigned' && bloomscapesFarmRowIsVisible(row);
    });
    const scopeKey = String(firstNonEmptyValue(cacheScopeKey, items === socInventory ? getDatasetLoadSignature('soc') : '', '')).trim();
    const canUseCache = !!scopeKey;
    const cacheKey = canUseCache ? [
        resolvedViewStateEpoch,
        dockWorkflowStateEpoch,
        scopeKey,
        getBloomscapesFarm(),
        currentUser,
        currentUserDisplay,
        isAdmin ? '1' : '0',
        isRep ? '1' : '0',
        isQcSupervisor ? '1' : '0',
        isQc ? '1' : '0'
    ].join('|') : '';
    if (canUseCache && docksScopedItemsCacheKey === cacheKey && Array.isArray(docksScopedItemsCache)) {
        incrementInternalPerfCounter('viewStateCacheHits');
        return docksScopedItemsCache.slice();
    }
    if (isRep) {
        nextItems = nextItems.filter(item => isMyRep(firstNonEmptyValue(item && item.SALESREPNAME, item && item.SALESREP, item && item.SALES_REP, item && item.SALESREPID, '')));
    }
    if (canUseCache) {
        docksScopedItemsCacheKey = cacheKey;
        docksScopedItemsCache = nextItems.slice();
    }
    return nextItems;
}
