function reconcileDriveNameSelection(visibleItems) {
    let changed=false;
    const hasSelectedName = !!(selectedDriveName && visibleItems.some((item) => getDrivePlantCommonName(item) === selectedDriveName));
    if (!hasSelectedName) {
        if (selectedDriveName || selectedDriveSize || selectedDriveSeason || selectedDriveProgram || driveViewLevel !== 0) changed = true;
        driveViewLevel = 0;
        selectedDriveName = null;
        selectedDriveSize = null;
        selectedDriveSeason = null;
        selectedDriveProgram = null;
        return changed;
    }
    if (driveViewLevel < 1) {
        driveViewLevel = 1;
        changed = true;
    }
    const nameItems = visibleItems.filter((item) => getDrivePlantCommonName(item) === selectedDriveName);
    const selectedSizeIsAll = isDriveDrillAllValue(selectedDriveSize);
    const hasSelectedSize = !!(selectedDriveSize && (selectedSizeIsAll || nameItems.some((item) => getDrivePlantContSize(item) === selectedDriveSize)));
    if (!hasSelectedSize) {
        if (selectedDriveSize || selectedDriveSeason || selectedDriveProgram || driveViewLevel !== 1) changed = true;
        driveViewLevel = 1;
        selectedDriveSize = null;
        selectedDriveSeason = null;
        selectedDriveProgram = null;
        return changed;
    }
    if (driveViewLevel < 2) {
        driveViewLevel = 2;
        changed = true;
    }
    return reconcileDriveSeasonSelection(nameItems,selectedSizeIsAll,changed);
}

function reconcileDriveSeasonSelection(nameItems,selectedSizeIsAll,changed) {
    const sizeItems = selectedSizeIsAll ? nameItems : nameItems.filter((item) => getDrivePlantContSize(item) === selectedDriveSize);
    const normalizedSeason = String(selectedDriveSeason || '').trim().toUpperCase();
    const selectedSeasonIsAll = isDriveDrillAllValue(selectedDriveSeason);
    const hasSelectedSeason = !!(normalizedSeason && (selectedSeasonIsAll || sizeItems.some((item) => String(firstNonEmptyValue(item.SEASON, '') || '').trim().toUpperCase() === normalizedSeason)));
    if (!hasSelectedSeason) {
        if (selectedDriveSeason || selectedDriveProgram || driveViewLevel !== 2) changed = true;
        driveViewLevel = 2;
        selectedDriveSeason = null;
        selectedDriveProgram = null;
        return changed;
    }
    if (driveViewLevel < 3) {
        driveViewLevel = 3;
        changed = true;
    }
    if (selectedDriveProgram || driveViewLevel > 3) {
        selectedDriveProgram = null;
        driveViewLevel = 3;
        changed = true;
    }
    return changed;
}

function reconcileDriveLocationSelection(visibleItems) {
    let changed=false;
    const hasSelectedBlock = !!(selectedDriveBlock && visibleItems.some((item) => getDriveBlockAlphaValue(item) === selectedDriveBlock));
    if (!hasSelectedBlock) {
        if (selectedDriveBlock || selectedDriveLoc || driveViewLevel !== 0) changed = true;
        driveViewLevel = 0;
        selectedDriveBlock = null;
        selectedDriveLoc = null;
        return changed;
    }
    if (driveViewLevel < 1) {
        driveViewLevel = 1;
        changed = true;
    }
    const blockItems = visibleItems.filter((item) => getDriveBlockAlphaValue(item) === selectedDriveBlock);
    const hasSelectedBlockNumber = !!(selectedDriveLoc && blockItems.some((item) => LocationCode.base(getDrivePlantLocationCode(item)) === selectedDriveLoc));
    if (!hasSelectedBlockNumber) {
        if (selectedDriveLoc || driveViewLevel !== 1) changed = true;
        driveViewLevel = 1;
        selectedDriveLoc = null;
        return changed;
    }
    if (driveViewLevel < 2) {
        driveViewLevel = 2;
        changed = true;
    }
    return changed;
}

/** @param {Array<object>} [visibleItems] @returns {*} */
function reconcileDriveDrillSelectionWithVisibleItems(visibleItems = []) {
    if (!Array.isArray(visibleItems) || shouldLockDriveSearchToTopLevel()) return false;
    const masterState = getDatasetState('master');
    if (masterState && masterState.initialLoaded === true && masterState.rowCompleteness !== 'complete') return false;
    if (activeDriveTab === 'name') return reconcileDriveNameSelection(visibleItems);
    if (activeDriveTab === 'loc') return reconcileDriveLocationSelection(visibleItems);
    return false;
}

function driveLocationExportRows(sourceRows,scopeParts,forceTopLevelSearchResults) {
    let rows=sourceRows;
    scopeParts.push('Location');
    if (forceTopLevelSearchResults) {
        scopeParts.push('Search Results');
    } else {
        if (selectedDriveBlock) {
            rows = rows.filter((item) => getDriveBlockAlphaValue(item) === selectedDriveBlock);
            scopeParts.push(getDriveBlockAlphaLabel(selectedDriveBlock));
        }
        if (selectedDriveLoc) {
            rows = rows.filter((item) => LocationCode.base(getDrivePlantLocationCode(item)) === selectedDriveLoc);
            scopeParts.push(getDriveBlockNumberLabel(selectedDriveLoc));
            const locationSearchTerm = shouldScopeDriveSearchToSelectedLocation() ? getDriveSearchTerm() : '';
            if (locationSearchTerm) rows = filterBySearch(rows, locationSearchTerm, 'drive_card');
        }
    }
    return sortDriveLocationCards(sortDriveCardItems(rows));
}

function driveNameExportRows(sourceRows,scopeParts,forceTopLevelSearchResults) {
    let rows=sourceRows;
    scopeParts.push('Common Name');
    if (forceTopLevelSearchResults) {
        scopeParts.push('Search Results');
        return sortDriveCardItems(rows);
    }
    if (selectedDriveName) {
        rows = rows.filter((item) => getDrivePlantCommonName(item) === selectedDriveName);
        scopeParts.push(selectedDriveName);
    }
    if (selectedDriveSize) {
        const selectedSizeIsAll = isDriveDrillAllValue(selectedDriveSize);
        scopeParts.push(getDriveDrillDisplayValue(selectedDriveSize));
        if (!selectedSizeIsAll) rows = rows.filter((item) => getDrivePlantContSize(item) === selectedDriveSize);
    }
    if (selectedDriveSeason) {
        const selectedSeasonIsAll = isDriveDrillAllValue(selectedDriveSeason);
        const normalizedSeason = String(selectedDriveSeason || '').trim().toUpperCase();
        scopeParts.push(getDriveDrillDisplayValue(selectedDriveSeason, 'Unknown'));
        if (!selectedSeasonIsAll) rows = rows.filter((item) => String(firstNonEmptyValue(item && item.SEASON, '') || '').trim().toUpperCase() === normalizedSeason);
    }
    const selectedProgram = normalizeDriveItemProgram(selectedDriveProgram);
    if (selectedProgram) {
        rows = filterDriveItemsByProgram(rows, selectedProgram);
        scopeParts.push(getDriveItemProgramLabel(selectedProgram));
    }
    return sortDriveCardItems(rows);
}

/** @param {object|null} [viewStateOverride] @returns {object} */
function buildDriveCurrentExportContext(viewStateOverride = null) {
    const driveViewState = viewStateOverride && typeof viewStateOverride === 'object'
        ? viewStateOverride
        : buildDriveVisibleItemsState();
    const driveModeLabel = DRIVE_MODE_LABELS[activeDriveMode] || 'Drive Mode';
    const tab = String(activeDriveTab || 'name').trim().toLowerCase();
    const tabLabel = getDriveExportTabLabel(tab);
    const sourceRows = Array.isArray(driveViewState.visibleItems) ? driveViewState.visibleItems : [];
    const scopeParts = [driveModeLabel];
    let rows = scopeDriveSavedReportRows(sourceRows,driveViewState.resolvedStateKey);
    if (activeDriveMode !== 'ok') {
        return { driveViewState, driveModeLabel, tab, tabLabel, scopeLabel: driveModeLabel, rows: [] };
    }
    if (tab === 'hold') {
        const reportContext = buildDriveReportExportContext(driveViewState);
        const evalLabel = getDriveReportEvalUserFilterLabel(reportContext.evalFilter || driveReportEvalUserFilter);
        const evalScope = normalizeDriveReportEvalUserFilter(reportContext.evalFilter || driveReportEvalUserFilter) === DRIVE_REPORT_ALL_EVAL_USERS ? '' : ` > ${evalLabel}`;
        return {
            driveViewState,
            driveModeLabel,
            tab,
            tabLabel,
            reportMode: reportContext.reportMode,
            reportLabel: reportContext.reportLabel,
            evalFilter: reportContext.evalFilter,
            scopeLabel: `${driveModeLabel} > ${reportContext.reportLabel}${evalScope}`,
            rows: reportContext.rows || []
        };
    }
    if (tab === 'season-sales-notes') {
        scopeParts.push('Season Sales Notes');
        rows = sortDriveCardItems(sourceRows);
        return { driveViewState, driveModeLabel, tab, tabLabel, scopeLabel: scopeParts.join(' > '), rows };
    }
    const forceTopLevelSearchResults = shouldLockDriveSearchToTopLevel();
    if (tab === 'loc') return {driveViewState,driveModeLabel,tab,tabLabel,rows:driveLocationExportRows(rows,scopeParts,forceTopLevelSearchResults),scopeLabel:scopeParts.join(' > ')};
    if (tab === 'name') return {driveViewState,driveModeLabel,tab,tabLabel,rows:driveNameExportRows(rows,scopeParts,forceTopLevelSearchResults),scopeLabel:scopeParts.join(' > ')};
    const resolvedState = buildDriveResolvedCardState(driveModeLabel,{...driveViewState,visibleItems:rows});
    rows = Array.isArray(resolvedState.finalItems) ? resolvedState.finalItems : sourceRows;
    const crumbText = String(resolvedState.crumbText || driveModeLabel).replace(/\s*\(\d+\s+items?\)\s*$/i, '').trim();
    return { driveViewState, driveModeLabel, tab, tabLabel, scopeLabel: crumbText || driveModeLabel, rows };
}
