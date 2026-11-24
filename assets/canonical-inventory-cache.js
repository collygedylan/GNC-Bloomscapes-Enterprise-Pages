// Derived inventory reads are owned by one authenticated snapshot. Row generations
// outlive projection eviction so an exact edit keeps unrelated hydration warm.
let canonicalBrowseRevision = 0;
let canonicalBrowseCache = null;
const stalePreparedDriveRows = new WeakSet();

function canonicalPreparedDriveIsCurrent(rows) {
    return !stalePreparedDriveRows.has(rows);
}

function canonicalReadSources() {
    if (typeof fullInventory === 'undefined' || typeof getSupabaseReadIdentityScope !== 'function'
        || typeof getManagerAssignedColumnState !== 'function') return null;
    const state = getManagerAssignedColumnState();
    return [getSupabaseReadIdentityScope(), fullInventory, fullInventory.length, state.locationSalesNotes,
        state.noteScope, state.defaultOwnersByCode, state.dataEpoch,
        typeof warehouseAssignedItemsInventory === 'undefined' ? null : warehouseAssignedItemsInventory,
        typeof requestsInventory === 'undefined' ? null : requestsInventory,
        typeof suspendTagInventory === 'undefined' ? null : suspendTagInventory,
        typeof appAccessSnapshotState === 'undefined' ? null : appAccessSnapshotState.snapshot?.dataPermissionVersion,
        state.photoGeneration];
}

function currentCanonicalBrowseCache() {
    const sources = canonicalReadSources();
    if (!sources) return null;
    if (canonicalBrowseCache && sources.every((source, i) => source === canonicalBrowseCache.sources[i])) return canonicalBrowseCache;
    canonicalBrowseCache = { sources, revision: ++canonicalBrowseRevision, rows: new WeakMap(),
        groups: new Map(), projections: new WeakMap(), ownerRows: new WeakMap() };
    return canonicalBrowseCache;
}

function getCanonicalInventoryRevision() {
    return currentCanonicalBrowseCache()?.revision || 0;
}

function canonicalReadLocation(row) {
    const code = String(row?.ITEMCODE ?? row?.itemcode ?? '').trim().toUpperCase();
    const location = String(row?.LOCATIONCODE ?? row?.locationcode ?? '').trim().toUpperCase();
    return code && location ? JSON.stringify([code, location]) : '';
}

function dirtyCanonicalInventoryRows(rows) {
    const cache = canonicalBrowseCache;
    if (!cache) return;
    for (const row of rows) {
        if (!row) continue;
        const group = canonicalReadLocation(row);
        if (group) cache.groups.set(group, (cache.groups.get(group) || 0) + 1);
        cache.rows.delete(row);
        cache.ownerRows.delete(row);
        row._reportMaskYear = undefined;
        row._searchKey = undefined;
        if (row._searchProfileValues) row._searchProfileValues = {};
        if (row._searchProfileWordStarts) row._searchProfileWordStarts = {};
    }
    stalePreparedDriveRows.add(cache.sources[1]);
    cache.sources[2] = cache.sources[1].length;
    cache.sources[cache.sources.length - 1] = getManagerAssignedColumnState().photoGeneration;
    cache.revision = ++canonicalBrowseRevision;
    cache.projections = new WeakMap();
}

function dirtyCanonicalCollectionRows(collection, rows) {
    if (!canonicalBrowseCache) return;
    if (collection === fullInventory || collection === avOpenInventory || collection === requestsInventory || collection === suspendTagInventory) {
        dirtyCanonicalInventoryRows(rows);
    }
}

function getCanonicalDriveProjection(rows, key, build) {
    const cache = currentCanonicalBrowseCache();
    if (!cache || !Array.isArray(rows)) return build();
    let entries = cache.projections.get(rows);
    if (!entries) cache.projections.set(rows, entries = new Map());
    if (entries.has(key)) return entries.get(key);
    const value = build();
    if (entries.size >= 24) entries.delete(entries.keys().next().value);
    entries.set(key, value);
    return value;
}

function canRetainCanonicalEvidence(notes) {
    return !notes?.some(note => note.PHOTO_LINK || note.photo_link || note.SAVED_PHOTO_LINK || note.saved_photo_link
        || note.PHOTOS?.length || note.photos?.length || note.PHOTO_URL || note.photo_url);
}

function readCanonicalInventoryBase(row, target, notes, build) {
    const cache = currentCanonicalBrowseCache();
    if (!cache || row !== target || !canRetainCanonicalEvidence(notes)) return build();
    const group = canonicalReadLocation(target);
    const generation = cache.groups.get(group);
    const prior = cache.rows.get(row);
    if (prior?.target === target && prior.notes === notes && prior.group === group && prior.generation === generation) return prior.value;
    const value = build();
    cache.rows.set(row, { target, notes, group, generation, value });
    return value;
}

function readCanonicalAssignedOwner(row, index, build) {
    const cache = currentCanonicalBrowseCache();
    if (!cache) return build();
    const group = canonicalReadLocation(row);
    const block = row.blockalpha ?? row.BLOCKALPHA;
    const prior = cache.ownerRows.get(row);
    if (prior?.index === index && prior.group === group && prior.block === block) return prior.owner;
    const owner = build();
    cache.ownerRows.set(row, { index, group, block, owner });
    return owner;
}
