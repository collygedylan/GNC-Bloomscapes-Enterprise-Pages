async function prepareProductionMasterSnapshot(sourceRows = [], options = {}) {
    const identity = String(options.identity || getSupabaseReadIdentityScope());
    const permissionVersion = String(options.permissionVersion ?? appAccessSnapshotState.snapshot?.dataPermissionVersion ?? '');
    const seasonKey = String(options.seasonKey || currentMasterPreparationSeasonKey());
    const assertCurrent = options.assertCurrent || (() => assertMasterPreparationCurrent(identity,permissionVersion,seasonKey,options.signal));
    const context = {rawRows:[],displayRows:[],avOpenRows:[],avOpenByMasterId:new Map(),
        indexMaps:createMasterInventoryIndexMaps(),inheritanceCandidates:{ncr:[],moved:[]}};
    const rows = Array.isArray(sourceRows) ? sourceRows : [];
    const limit = Number.isInteger(options.limit) ? Math.max(0,Math.min(rows.length,options.limit)) : rows.length;
    await prepareMasterDisplayBatches(rows.slice(0,limit),context,assertCurrent,options.includeRawRows!==false);
    await prepareMasterSeasonAssignments(context.displayRows,assertCurrent);
    await prepareMasterAvBatches(context,assertCurrent);
    assertCurrent();
    preparedMasterRows.set(context.displayRows,{identity,permissionVersion,seasonKey,...context});
    return {rawRows:context.rawRows,payload:{data:context.displayRows},rowCount:context.displayRows.length};
}

async function prepareMasterDisplayBatches(rows,context,assertCurrent,includeRaw) {
    const yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    for (let offset=0;offset<rows.length;offset+=MASTER_PREPARATION_BATCH_SIZE) {
        assertCurrent();
        const batch = rows.slice(offset,offset+MASTER_PREPARATION_BATCH_SIZE);
        if (includeRaw) context.rawRows.push(...JSON.parse(JSON.stringify(batch)));
        const formatted = formatFetchedRows(JSON.parse(JSON.stringify(batch)),'ph_master_inventory');
        formatted.forEach((item,index) => {
            item.DOM_ID = 'fi_'+(offset+index);
            buildSearchIndex(item);
            addMasterInventoryRowToIndexes(context.indexMaps,item);
            if (hasNcrLocationNote(item)) context.inheritanceCandidates.ncr.push(item);
            if (isMovedSeasonAvSourceSeason(item)) context.inheritanceCandidates.moved.push(item);
            context.displayRows.push(item);
        });
        const pause = yieldIfNeeded(batch.length);
        if (pause) await pause;
    }
}

async function prepareMasterAvBatches(context,assertCurrent) {
    const masterById = new Map(context.displayRows.map(item=>[String(item?.UNIQUE_ID || '').trim(),item]));
    const yieldIfNeeded = createMasterPreparationYieldController(assertCurrent);
    for (const master of context.displayRows) {
        assertCurrent();
        if (master && shouldIncludeMasterItemInAvSeasonView(master)) prepareMasterAvRow(master,masterById,context);
        const pause = yieldIfNeeded();
        if (pause) await pause;
    }
}

function prepareMasterAvRow(master,masterById,context) {
    const item = {...master};
    const id = String(item.UNIQUE_ID || '').trim();
    syncMasterFieldsToRow(masterById.get(id) || findLinkedMasterRow(item) || master,item,EXACT_ROW_SYNC_KEYS,{attachMasterLink:false});
    if (!isEvalScopedDataRowVisibleToCurrentUser(item) || !shouldIncludeMasterItemInAvSeasonView(item)) return;
    item.DOM_ID = 'avo_'+(item.UNIQUE_ID || context.avOpenRows.length);
    context.avOpenByMasterId.set(id,item);
    context.avOpenRows.push(item);
}

function takePreparedMasterIndexMaps(prepared, rowsUnchanged = false) {
    if (!rowsUnchanged || !prepared?.indexMaps || prepared.indexesConsumed) return null;
    prepared.indexesConsumed = true;
    return prepared.indexMaps;
}
