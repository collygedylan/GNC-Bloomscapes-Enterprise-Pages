function getDrivePlantFilterScopeKey(baseItems) {
    return [
    getInventoryExcelState('drive').revision,
    String(driveBaseFilterCacheKey || ''),
    baseItems === driveBaseFilterCacheItems || baseItems === drivePlantFilterItemsCache
        ? String(driveBaseFilterCacheKey || `drive-base:${resolvedViewStateEpoch}:${baseItems.length}`)
        : `drive-manual:${resolvedViewStateEpoch}:${activeDriveTab}:${baseItems.length}`,
    driveGenusSelectionMode, [...selectedDriveGenusNames].sort().join(','), driveGenusSearchTerm,
    driveContSizeSelectionMode, [...selectedDriveContSizes].sort().join(','), driveContSizeSearchTerm,
    driveLocationSelectionMode, [...selectedDriveLocationCodes].sort().join(','), driveLocationSearchTerm,
    driveLotSelectionMode, [...selectedDriveLotCodes].sort().join(','), driveLotSearchTerm
].join('|');
}

function buildDriveModeRows(items) {
    return applyRepU3VisibilityScope(applyForemanPriorityRowScope(items)
        .filter(item=>!shouldHideNotOnInventoryApprovalRowFromInventory(item)));
}

function getDriveModeItems() {
    if (activeDriveMode!=='ok') return [];
    const snapshot = typeof getBloomscapesWarmFarm==='function' && typeof nativeAuthSessionActive!=='undefined' && nativeAuthSessionActive ? getBloomscapesWarmFarm(getBloomscapesFarm()) : null;
    return snapshot?.inventory===fullInventory && snapshot.driveProjection ? snapshot.driveProjection.rows : buildDriveModeRows(fullInventory);
}

function buildDrivePlantOptionLists(items) {
    return {
        genus:[...new Set(items.map(item=>getDrivePlantGenusValue(item)))].sort((a,b)=>String(a).localeCompare(String(b))),
        size:[...new Set(items.map(item=>getDrivePlantContSize(item)).filter(Boolean))].sort(compareDrivePlantContSize),
        location:[...new Set(items.map(item=>getDrivePlantLocationCode(item)).filter(Boolean))].sort(compareLocationCodeValues),
        lot:[...new Set(items.map(item=>getDrivePlantLotCode(item)).filter(Boolean))].sort((a,b)=>String(a || '').localeCompare(String(b || ''),undefined,{numeric:true,sensitivity:'base'}))
    };
}

function prepareBloomscapesDriveProjection(inventory) {
    const rows = buildDriveModeRows(inventory);
    return {rows,names:buildDriveCommonNameGroups(rows),options:buildDrivePlantOptionLists(rows),fields:buildDriveColumnFilterFields(rows),assignedFields:buildDriveColumnFilterFields(rows,true)};
}

function getDrivePlantOptionLists(items) {
    const snapshot = typeof getBloomscapesWarmFarm==='function' && typeof nativeAuthSessionActive!=='undefined' && nativeAuthSessionActive ? getBloomscapesWarmFarm(getBloomscapesFarm()) : null;
    const prepared = snapshot?.inventory===fullInventory ? snapshot.driveProjection : null;
    if (prepared && items.length===prepared.rows.length && items.every((row,index)=>row===prepared.rows[index])) return prepared.options;
    return buildDrivePlantOptionLists(items);
}

function filteredDrivePlantOptions(options,term) {
    const value = String(term || '').trim().toLowerCase();
    return value ? options.filter(option=>doesExcelFilterSearchMatchStart(option,value)) : options;
}

function getDrivePlantSelections(options) {
    return {
        genus:syncDriveGenusSelectionState(options.genus),size:syncDriveContSizeSelectionState(options.size),
        location:syncDriveLocationSelectionState(options.location),lot:syncDriveLotSelectionState(options.lot)
    };
}

function filterDrivePlantRows(items,state) {
    return items.filter(item=>state.genus.selected.has(getDrivePlantGenusValue(item))
        && state.size.selected.has(getDrivePlantContSize(item)) && state.location.selected.has(getDrivePlantLocationCode(item))
        && state.lot.selected.has(getDrivePlantLotCode(item)));
}

function createDrivePlantFilterModel(baseItems,state) {
    const all = selection=>!!selection.options.length && selection.selected.size===selection.options.length;
    const genusAllSelected=all(state.genus),contSizeAllSelected=all(state.size),locationAllSelected=all(state.location),lotAllSelected=all(state.lot);
    return {
        baseItems,filteredItems:filterDrivePlantRows(baseItems,state),
        genusOptions:state.genus.options,filteredGenusOptions:filteredDrivePlantOptions(state.genus.options,driveGenusSearchTerm),
        sizeOptions:state.size.options,filteredSizeOptions:filteredDrivePlantOptions(state.size.options,driveContSizeSearchTerm),
        locationOptions:state.location.options,filteredLocationOptions:filteredDrivePlantOptions(state.location.options,driveLocationSearchTerm),
        lotOptions:state.lot.options,filteredLotOptions:filteredDrivePlantOptions(state.lot.options,driveLotSearchTerm),
        genusSelectedCount:state.genus.selected.size,contSizeSelectedCount:state.size.selected.size,
        locationSelectedCount:state.location.selected.size,lotSelectedCount:state.lot.selected.size,
        genusAllSelected,contSizeAllSelected,locationAllSelected,lotAllSelected,
        hasActiveFilters:!(genusAllSelected && contSizeAllSelected && locationAllSelected && lotAllSelected),
        hasTypedSearch:!![driveGenusSearchTerm,driveContSizeSearchTerm,driveLocationSearchTerm,driveLotSearchTerm].some(term=>String(term || '').trim())
    };
}

function buildDrivePlantFilterState(items = []) {
    const baseItems = Array.isArray(items) ? items : [];
    const stateScopeKey = getDrivePlantFilterScopeKey(baseItems);
    if (drivePlantFilterStateCacheKey===stateScopeKey && drivePlantFilterStateCache) {
        incrementInternalPerfCounter('viewStateCacheHits');
        return drivePlantFilterStateCache;
    }
    const state = getDrivePlantSelections(getDrivePlantOptionLists(baseItems));
    drivePlantFilterStateCacheKey = stateScopeKey;
    drivePlantFilterStateCache = createDrivePlantFilterModel(baseItems,state);
    return drivePlantFilterStateCache;
}

function buildDriveColumnFilterFields(items = [],exposeAssignedTo = false) {
    const fieldsByKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item || typeof item !== 'object') return;
        Object.keys(item).forEach((rawKey) => {
            const key = normalizeDriveColumnFilterKey(rawKey);
            if (key === 'ASSIGNEDTO' && !exposeAssignedTo) return;
            if (!key || fieldsByKey.has(key) || !DRIVE_COLUMN_FILTER_ALLOWED_HEADER_KEYS.has(key)) return;
            fieldsByKey.set(key, { key, sourceKey: rawKey, label: formatDriveColumnHeaderLabel(key) });
        });
    });
    if (exposeAssignedTo && !fieldsByKey.has('ASSIGNEDTO')) fieldsByKey.set('ASSIGNEDTO', { key: 'ASSIGNEDTO', sourceKey: 'ASSIGNEDTO', label: 'Assigned To' });
    const priorityIndex = new Map(DRIVE_COLUMN_FILTER_COMMON_HEADERS.map((key, index) => [key, index]));
    return DRIVE_COLUMN_FILTER_ALLOWED_HEADERS
        .filter((entry) => fieldsByKey.has(entry.key))
        .map((entry) => Object.assign({}, fieldsByKey.get(entry.key), { label: formatDriveColumnHeaderLabel(entry.key) }))
        .sort((a, b) => {
        const aPriority = priorityIndex.has(a.key) ? priorityIndex.get(a.key) : 9999;
        const bPriority = priorityIndex.has(b.key) ? priorityIndex.get(b.key) : 9999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return String(a.label || a.key).localeCompare(String(b.label || b.key), undefined, { numeric: true, sensitivity: 'base' });
    });
}


function getDriveColumnFilterFields(items = []) {
    const snapshot = typeof getBloomscapesWarmFarm==='function' && typeof nativeAuthSessionActive!=='undefined' && nativeAuthSessionActive ? getBloomscapesWarmFarm(getBloomscapesFarm()) : null;
    const prepared = snapshot?.inventory===fullInventory ? snapshot.driveProjection : null;
    const exposeAssignedTo = activeDriveTab==='season-sales-notes';
    if (prepared && items.length===prepared.rows.length && items.every((row,index)=>row===prepared.rows[index])) return exposeAssignedTo ? prepared.assignedFields : prepared.fields;
    return buildDriveColumnFilterFields(items,exposeAssignedTo);
}

function renderDriveCommonNameDrill(container, crumb, driveModeLabel = '', viewStateOverride = null) {
    ensureDriveToolbarControls();
    const resolvedDriveModeLabel = String(driveModeLabel || DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode');
    const driveViewState = viewStateOverride && typeof viewStateOverride === 'object'
        ? viewStateOverride
        : buildDriveVisibleItemsState();
    const { visibleItems, resolvedStateKey } = driveViewState;
    const forceTopLevelSearchResults = shouldLockDriveSearchToTopLevel();
    if (!visibleItems.length) {
        applyDriveRenderMarkup(container, crumb, `${resolvedDriveModeLabel} > Common Name`, `<div class="p-8 text-center text-gray-400">No rows match the current Drive filters.</div>`, 'drive:name:empty');
        container.dataset.driveCommonnameState = 'complete'; container.dataset.driveCommonnameCount = '0';
        return;
    }
    if (driveViewLevel <= 0 || !selectedDriveName || forceTopLevelSearchResults) {
        renderDriveCommonNameList(container,crumb,resolvedDriveModeLabel,visibleItems,resolvedStateKey);
        return;
    }
    const selectedNameItems = visibleItems.filter((item) => getDrivePlantCommonName(item) === selectedDriveName);
    if (!selectedNameItems.length) {
        applyDriveRenderMarkup(container, crumb, `${resolvedDriveModeLabel} > ${selectedDriveName}`, `<div class="p-8 text-center text-gray-400">No rows match the current Drive filters for ${esc(selectedDriveName)}.</div>`, 'drive:name:selected-empty');
        return;
    }
    if (driveViewLevel <= 1 || !selectedDriveSize) {
        renderDriveCommonNameSizes(container,crumb,resolvedDriveModeLabel,selectedNameItems);
        return;
    }
    const selectedSizeIsAll = isDriveDrillAllValue(selectedDriveSize);
    const selectedSizeLabel = getDriveDrillDisplayValue(selectedDriveSize);
    const selectedSizeItems = selectedSizeIsAll ? selectedNameItems : selectedNameItems.filter((item) => getDrivePlantContSize(item) === selectedDriveSize);
    if (!selectedSizeItems.length) {
        applyDriveRenderMarkup(container, crumb, `${resolvedDriveModeLabel} > ${selectedDriveName} > ${selectedSizeLabel}`, `<div class="p-8 text-center text-gray-400">No rows match the current Drive filters for ${esc(selectedSizeLabel)}.</div>`, 'drive:name:size-empty');
        return;
    }
    if (driveViewLevel <= 2 || !selectedDriveSeason) {
        renderDriveCommonNameSeasons(container,crumb,resolvedDriveModeLabel,selectedSizeItems,selectedSizeLabel);
        return;
    }
    renderDriveCommonNameRows(container,crumb,resolvedDriveModeLabel,selectedSizeItems,selectedSizeLabel);
}

function renderDriveCommonNameList(container,crumb,resolvedDriveModeLabel,visibleItems,resolvedStateKey) {
    const groupCacheKey = `drive:name:list:${resolvedStateKey || ''}`;
    let groups = driveDrillGroupStateCache instanceof Map ? driveDrillGroupStateCache.get(groupCacheKey) : null;
    if (Array.isArray(groups)) {
        incrementInternalPerfCounter('viewStateCacheHits');
    } else {
        const snapshot = typeof getBloomscapesWarmFarm==='function' && nativeAuthSessionActive ? getBloomscapesWarmFarm(getBloomscapesFarm()) : null;
        const prepared = snapshot?.inventory===fullInventory ? snapshot.driveProjection : null;
        groups = prepared && visibleItems.length===prepared.rows.length && visibleItems.every((row,index)=>row===prepared.rows[index])
            ? prepared.names : buildDriveCommonNameGroups(visibleItems);
        if (!(driveDrillGroupStateCache instanceof Map)) driveDrillGroupStateCache = new Map();
        driveDrillGroupStateCache.set(groupCacheKey, groups);
        while (driveDrillGroupStateCache.size > 16) {
            const oldest = driveDrillGroupStateCache.keys().next();
            if (oldest && !oldest.done) driveDrillGroupStateCache.delete(oldest.value);
            else break;
        }
    }
    renderDriveDrillEntries(container, crumb, `${resolvedDriveModeLabel} > Select Common Name (${groups.length} names)`, groups, 'drive:name:list', renderDriveCommonNameGroupCard, {
        emptyMessage: 'No common names match the current Drive search.',
        approxCardHeight: 84
    });
    return;
}

function renderDriveCommonNameSizes(container,crumb,resolvedDriveModeLabel,selectedNameItems) {
    const sizeMap = new Map();
    selectedNameItems.forEach((item) => {
        const contSize = getDrivePlantContSize(item) || '-';
        if (!sizeMap.has(contSize)) sizeMap.set(contSize, { size: contSize, rowCount: 0, seasons: new Set(), __driveRenderKeyValue: '' });
        const entry = sizeMap.get(contSize);
        entry.rowCount += 1;
        entry.seasons.add(String(firstNonEmptyValue(item.SEASON, '') || '').trim().toUpperCase() || 'UNKNOWN');
    });
    const groups = [...sizeMap.values()]
        .map((entry) => ({
            size: entry.size,
            rowCount: entry.rowCount,
            seasonCount: entry.seasons.size,
            __driveRenderKeyValue: `${selectedDriveName}|${entry.size}|${entry.rowCount}|${entry.seasons.size}`
        }))
        .sort((a, b) => compareDrivePlantContSize(a.size, b.size));
    const allSeasons = new Set(selectedNameItems.map((item) => String(firstNonEmptyValue(item.SEASON, '') || '').trim().toUpperCase() || 'UNKNOWN'));
    const sizeGroups = [{
        size: DRIVE_DRILL_ALL_VALUE,
        displaySize: DRIVE_DRILL_ALL_LABEL,
        rowCount: selectedNameItems.length,
        seasonCount: allSeasons.size,
        isAll: true,
        __driveRenderKeyValue: `${selectedDriveName}|ALL|${selectedNameItems.length}|${allSeasons.size}`
    }].concat(groups);
    renderDriveDrillEntries(container, crumb, `${resolvedDriveModeLabel} > ${selectedDriveName} > Select Container Size (${groups.length} sizes)`, sizeGroups, 'drive:name:sizes', renderDriveContSizeGroupCard, {
        emptyMessage: 'No container sizes match the current Drive filters.',
        approxCardHeight: 84
    });
    return;
}

function renderDriveCommonNameSeasons(container,crumb,resolvedDriveModeLabel,selectedSizeItems,selectedSizeLabel) {
    const seasonMap = new Map();
    selectedSizeItems.forEach((item) => {
        const seasonValue = String(firstNonEmptyValue(item.SEASON, '') || '').trim().toUpperCase() || 'UNKNOWN';
        if (!seasonMap.has(seasonValue)) seasonMap.set(seasonValue, { season: seasonValue, rowCount: 0, __driveRenderKeyValue: '' });
        seasonMap.get(seasonValue).rowCount += 1;
    });
    const groups = [...seasonMap.values()]
        .map((entry) => ({
            season: entry.season,
            rowCount: entry.rowCount,
            __driveRenderKeyValue: `${selectedDriveName}|${selectedDriveSize}|${entry.season}|${entry.rowCount}`
        }))
        .sort((a, b) => {
            const seasonCompare = getDriveSeasonOptionRank(a.season) - getDriveSeasonOptionRank(b.season);
            if (seasonCompare !== 0) return seasonCompare;
            return String(a.season || '').localeCompare(String(b.season || ''));
        });
    const seasonGroups = [{
        season: DRIVE_DRILL_ALL_VALUE,
        displaySeason: DRIVE_DRILL_ALL_LABEL,
        rowCount: selectedSizeItems.length,
        isAll: true,
        __driveRenderKeyValue: `${selectedDriveName}|${selectedSizeLabel}|ALL|${selectedSizeItems.length}`
    }].concat(groups);
    renderDriveDrillEntries(container, crumb, `${resolvedDriveModeLabel} > ${selectedDriveName} > ${selectedSizeLabel} > Select Season (${groups.length} seasons)`, seasonGroups, 'drive:name:seasons', renderDriveSeasonGroupCard, {
        emptyMessage: 'No seasons match the current Drive filters.',
        approxCardHeight: 84
    });
    return;
}

function renderDriveCommonNameRows(container,crumb,resolvedDriveModeLabel,selectedSizeItems,selectedSizeLabel) {
    const selectedSeasonIsAll = isDriveDrillAllValue(selectedDriveSeason);
    const selectedSeasonLabel = getDriveDrillDisplayValue(selectedDriveSeason, 'Unknown');
    const seasonItems = sortDriveCardItems(selectedSeasonIsAll ? selectedSizeItems : selectedSizeItems.filter((item) => String(firstNonEmptyValue(item.SEASON, '') || '').trim().toUpperCase() === String(selectedDriveSeason || '').trim().toUpperCase()));
    if (!seasonItems.length) {
        const crumbText = `${resolvedDriveModeLabel} > ${selectedDriveName} > ${selectedSizeLabel} > ${selectedSeasonLabel} (0 items)`;
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">No rows match the selected season.</div>`, 'drive:name:cards-empty');
        return;
    }
    const finalItems = seasonItems;
    const crumbText = `${resolvedDriveModeLabel} > ${selectedDriveName} > ${selectedSizeLabel} > ${selectedSeasonLabel} (${finalItems.length} items)`;
    const renderKey = buildDriveRenderKey('drive:name:cards', crumbText, finalItems);
    if (!finalItems.length) {
        applyDriveRenderMarkup(container, crumb, crumbText, `<div class="p-8 text-center text-gray-400">No rows match the selected season.</div>`, 'drive:name:cards-empty');
        return;
    }
    renderDriveRecordResults('drive-name-card', container, crumb, finalItems, crumbText, renderKey, {
        approxCardHeight: 310
    });
}

function buildDriveCommonNameGroups(visibleItems) {
    const nameMap = new Map();
    visibleItems.forEach((item) => {
        const commonName = getDrivePlantCommonName(item) || 'Unknown';
        if (!nameMap.has(commonName)) nameMap.set(commonName, { name: commonName, rowCount: 0, sizes: new Set(), __driveRenderKeyValue: '' });
        const entry = nameMap.get(commonName);
        entry.rowCount += 1;
        entry.sizes.add(getDrivePlantContSize(item) || '-');
    });
    return [...nameMap.values()]
        .map((entry) => ({
            name: entry.name,
            rowCount: entry.rowCount,
            sizeCount: entry.sizes.size,
            __driveRenderKeyValue: `${entry.name}|${entry.rowCount}|${entry.sizes.size}`
        }))
        .sort((a, b) => compareDriveCommonName(a.name, b.name));
}
