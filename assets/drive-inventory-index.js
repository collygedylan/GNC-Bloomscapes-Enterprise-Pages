
let selectedDriveCommonNames = new Set();
let driveCommonNameSearchTerm = '';
let driveCommonNameFilterOpen = false;

const driveIndexOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const driveIndexLocation = row => LocationCode.base(getDrivePlantLocationCode(row)) || DRIVE_NO_BLOCK_NUMBER;

function addDriveIndexRow(blocks, row) {
    const block = getDriveBlockAlphaValue(row);
    const location = driveIndexLocation(row);
    if (!blocks.has(block)) blocks.set(block, { rows: [], locations: new Map() });
    const entry = blocks.get(block);
    entry.rows.push(row);
    if (!entry.locations.has(location)) entry.locations.set(location, []);
    entry.locations.get(location).push(row);
}

function finishDriveLocationIndex(blocks, reportSort = false) {
    const groups = Array.from(blocks, ([block, entry]) => ({
            block, rowCount: entry.rows.length, blockNumberCount: entry.locations.size,
            __driveRenderKeyValue: [block, entry.rows.length, entry.locations.size].join('|')
        }));
    if (!reportSort) groups.sort((a, b) => driveIndexOrder(getDriveBlockAlphaLabel(a.block), getDriveBlockAlphaLabel(b.block)));
    return { blocks, groups };
}

function getDriveLocationIndex(rows, reportSort = false) {
    return getCanonicalDriveProjection(rows, reportSort ? 'drive-blocks:report-order' : 'drive-blocks', () => {
        const blocks = new Map();
        for (const row of rows) addDriveIndexRow(blocks, row);
        return finishDriveLocationIndex(blocks, reportSort);
    });
}

function getDriveBlockNumberGroups(block, entry, reportSort = false) {
    return getCanonicalDriveProjection(entry.rows, reportSort ? 'drive-locations:report-order' : 'drive-locations', () => {
        const groups = Array.from(entry.locations, ([location, rows]) => ({
            location, rowCount: rows.length, __driveRenderKeyValue: [block, location, rows.length].join('|')
        }));
        if (!reportSort) groups.sort((a, b) => driveIndexOrder(getDriveBlockNumberLabel(a.location), getDriveBlockNumberLabel(b.location)));
        return groups;
    });
}

function getDriveVisibleProjectionKey() {
    return [driveBaseFilterCacheKey, getDrivePlantFilterScopeKey(driveBaseFilterCacheItems),
        getDriveQuickFilterStateKey('visible'), activeDriveTab === 'hold' ? driveReportEvalUserFilter : ''].join('::');
}

function readDriveVisibleProjection(baseSearchFilteredItems, drivePlantFilterState, resolvedStateKey) {
    return getCanonicalDriveProjection(baseSearchFilteredItems, resolvedStateKey, () => {
        const columnRows = applyDriveColumnFiltersToItems(drivePlantFilterState.filteredItems);
        const visibleItems = applyDriveQuickFiltersToItems(columnRows, 'plant:' + resolvedStateKey);
        return { baseSearchFilteredItems, drivePlantFilterState, visibleItems, resolvedStateKey };
    });
}

let driveListIdentity = 0;

function getDriveListSignature(entries, mode, crumbText) {
    const id = getCanonicalDriveProjection(entries, 'list-signature', () => ++driveListIdentity);
    return [mode, crumbText, getCanonicalInventoryRevision(), id, entries.length].join('::');
}

function canWarmCanonicalInventory() {
    return typeof document !== 'undefined' && !document.hidden && nativeAuthSessionActive
        && getCurrentVisibleViewId() === 'home' && window.BloomscapesBatteryGovernor?.canPrewarm()
        && (canAccessView('drive') || canAccessView('av')) && !hasConfirmedCurrentAccountRevocation()
        && (productionDisplayMasterReceipt?.rows === fullInventory || warmAvInventoryOwners.get(fullInventory) === getSupabaseReadIdentityScope())
        && fullInventory.length > 0;
}

let driveWarmJob = null;

function scheduleDriveIndexSlice(job) {
    const run = deadline => warmDriveInventorySlice(job, deadline);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
    else setTimeout(run, 16);
}

function scheduleCanonicalInventoryPrewarm() {
    if (!canWarmCanonicalInventory()) return;
    const revision = getCanonicalInventoryRevision();
    if (driveWarmJob?.revision === revision) return;
    driveWarmJob = { revision, offset: 0, rows: null, blocks: new Map(), names: new Map(), reports: [], indexed: false, ownerIndex: null };
    scheduleDriveIndexSlice(driveWarmJob);
}

function warmDriveInventorySlice(job, deadline) {
    if (driveWarmJob !== job) return;
    if (!canWarmCanonicalInventory() || job.revision !== getCanonicalInventoryRevision()) {
        driveWarmJob = null;
        if (canWarmCanonicalInventory()) scheduleCanonicalInventoryPrewarm();
        return;
    }
    job.rows ||= getDriveModeItems();
    if (!job.rows.length) return;
    const start = performance.now();
    job.ownerIndex ||= getBloomscapesAssignmentIndex();
    do {
        const row = job.rows[job.offset++];
        if (job.indexed) {
            resolveCanonicalInventoryRow(row);
            resolveBloomscapesAssignedOwner(row, job.ownerIndex);
        } else {
            getSearchValuesForProfile(row, 'drive_universal');
            addDriveIndexRow(job.blocks, row);
            addDriveCommonNameGroup(job.names, row);
            job.reports.push(projectDriveReport2Row(row));
        }
    } while (job.offset < job.rows.length && performance.now() - start < 6 && (!deadline || deadline.timeRemaining() > 1));
    if (!job.indexed && job.offset === job.rows.length) finishDriveIndexWarmup(job);
    if (job.offset < job.rows.length) scheduleDriveIndexSlice(job);
}

function finishDriveIndexWarmup(job) {
    getCanonicalDriveProjection(job.rows, 'drive-blocks', () => finishDriveLocationIndex(job.blocks));
    getCanonicalDriveProjection(job.rows, 'reports-v2:rows', () => job.reports);
    getCanonicalDriveProjection(job.rows, 'common-names', () => finishDriveCommonNameGroups(job.names));
    job.names = null;
    job.reports = null;
    job.blocks = null;
    job.indexed = true;
    job.offset = 0;
}

function renderDriveLocationDrill(container, crumb, driveModeLabel = '', viewStateOverride = null) {
    ensureDriveToolbarControls();
    const resolvedDriveModeLabel = String(driveModeLabel || DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode');
    const driveViewState = viewStateOverride && typeof viewStateOverride === 'object'
        ? viewStateOverride
        : buildDriveVisibleItemsState();
    const { visibleItems, reportCards, reportSort } = driveViewState;
    const forceTopLevelSearchResults = shouldLockDriveSearchToTopLevel();
    if (!visibleItems.length) {
        applyDriveRenderMarkup(container, crumb, `${resolvedDriveModeLabel} > Location`, `<div class="p-8 text-center text-gray-400">No rows match the current Drive filters.</div>`, 'drive:loc:empty');
        return;
    }
    if (driveViewLevel <= 0 || !selectedDriveBlock || forceTopLevelSearchResults) {
        const groups = getDriveLocationIndex(visibleItems, reportSort).groups;
        renderDriveDrillEntries(container, crumb, `${resolvedDriveModeLabel} > Location > Select Block Alpha (${groups.length})`, groups, 'drive:loc:blocks', renderDriveBlockGroupCard, {
            emptyMessage: 'No Block Alpha values match the current Drive filters.',
            approxCardHeight: 84, reportCards
        });
        return;
    }
    const blockEntry = getDriveLocationIndex(visibleItems, reportSort).blocks.get(selectedDriveBlock);
    const selectedBlockItems = blockEntry?.rows || [];
    const selectedBlockLabel = getDriveBlockAlphaLabel(selectedDriveBlock);
    if (!selectedBlockItems.length) {
        applyDriveRenderMarkup(container, crumb, `${resolvedDriveModeLabel} > ${selectedBlockLabel}`, `<div class="p-8 text-center text-gray-400">No rows match the current Drive filters for ${esc(selectedBlockLabel)}.</div>`, 'drive:loc:block-empty');
        return;
    }
    if (driveViewLevel <= 1 || !selectedDriveLoc) {
        const groups = getDriveBlockNumberGroups(selectedDriveBlock, blockEntry, reportSort);
        renderDriveDrillEntries(container, crumb, `${resolvedDriveModeLabel} > ${selectedBlockLabel} > Select Block Number (${groups.length})`, groups, 'drive:loc:blocknumbers', renderDriveLocationGroupCard, {
            emptyMessage: 'No Block Number values match the selected Block Alpha.',
            approxCardHeight: 84, reportSort
        });
        return;
    }
    const selectedBlockNumberItems = blockEntry.locations.get(selectedDriveLoc) || [];
    const finalItems = sortDriveLocationCards(reportCards ? selectedBlockNumberItems : sortDriveCardItems(selectedBlockNumberItems));
    const selectedBlockNumberLabel = getDriveBlockNumberLabel(selectedDriveLoc);
    const crumbText = `${resolvedDriveModeLabel} > ${selectedBlockLabel} > ${selectedBlockNumberLabel} (${finalItems.length} physical rows)`;
    const renderKey = buildDriveRenderKey('drive:loc:cards', crumbText, finalItems);
    if (!finalItems.length) {
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">No physical rows match the selected Block Alpha and Block Number.</div>`, 'drive:loc:cards-empty');
        return;
    }
    renderDriveRecordResults('drive-loc-card', container, crumb, finalItems, crumbText, renderKey, {
        approxCardHeight: 310, reportCards
    });
}
