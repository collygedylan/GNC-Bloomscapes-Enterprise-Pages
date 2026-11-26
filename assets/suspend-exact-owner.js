function suspendItemRowsByCode(rows) {
    const byCode=new Map();
    for (const row of rows) {
        const code=getRequestItemCodeOptionItemCode(row);
        if (!byCode.has(code)) byCode.set(code,[]);
        byCode.get(code).push(row);
    }
    return byCode;
}

function suspendItemNotesByUid(rows,notes) {
    const physical=window.AgMetricQueueInventory?.createIndex(rows);
    const latest=new Map();
    for (const note of notes) {
        const resolved=!note.unique_id && note.itemcode && note.locationcode && note.lotcode
            ? physical?.resolve({itemCode:note.itemcode,locationCode:note.locationcode,lotCode:note.lotcode}).row : null;
        const uid=note.unique_id || resolved?.unique_id || resolved?.UNIQUE_ID;
        const prior=latest.get(uid);
        if (uid && (!prior || String(note.updated_at || note.last_updated)>String(prior.updated_at || prior.last_updated))) latest.set(uid,note);
    }
    return latest;
}

function enrichSuspendItemRows(rows,notes,local) {
    const byUid=suspendItemNotesByUid(rows,notes);
    return rows.map(source=>{
        const row=local ? Object.fromEntries(Object.entries(source).map(([key,value])=>[key.toLowerCase(),value])) : source;
        const note=byUid.get(row.unique_id);
        if (!note) return row;
        const next={...row};
        for (const key of ['photo_link','photo_name','spec','caliper','av_note','sales_note','loc_match_pct']) {
            if (!next[key] && note[key]) next[key]=note[key];
        }
        return next;
    });
}

function publishSuspendItemBatchRow(code,entry,rows,notes,photoState,local) {
    if (notes) photoState.locationSalesNotes.set(code,notes);
    const enriched=enrichSuspendItemRows(rows,notes || photoState.locationSalesNotes.get(code) || [],local);
    const fingerprint=JSON.stringify(enriched);
    entry.loadedAt=Date.now();
    if (entry.fingerprint===fingerprint) return false;
    entry.fingerprint=fingerprint;
    entry.rows=formatFetchedRows(enriched,'ph_master_inventory').map(row=>buildSearchIndex(normalizeRowPhotoFields(row)));
    if (typeof rememberInventoryLocationPhotoRows==='function') rememberInventoryLocationPhotoRows(entry.rows,entry.owner);
    entry.index=window.AgMetricQueueInventory?.createIndex(entry.rows);
    return true;
}

async function hydrateSuspendItemBatch(group,scope) {
    if (!scope.current()) return;
    const {rows,evidence,hasLocalMaster}=await readSuspendItemBatch(group,scope.farm);
    if (!scope.current()) return;
    if (!hasLocalMaster && group.length>1) retainVerifiedCardLocationOnHandRows(rows);
    const photo=getManagerAssignedColumnState();
    if (photo.noteScope!==scope.owner || !photo.locationSalesNotes) photo.locationSalesNotes=new Map();
    photo.noteScope=scope.owner;
    const master=suspendItemRowsByCode(rows);
    const notes=Array.isArray(evidence) ? suspendItemRowsByCode(evidence) : null;
    if (!notes) console.warn('Suspend location evidence refresh deferred',evidence.error);
    const updated=[];
    for (const code of group) {
        const entry=suspendTagItemHydration.get(code);
        if (publishSuspendItemBatchRow(code,entry,master.get(code) || [],notes ? notes.get(code) || [] : null,photo,hasLocalMaster)) updated.push(code);
    }
    photo.photoGeneration=(photo.photoGeneration || 0)+1;
    if (!updated.length) return;
    queueCardInventoryRenderVersion++;
    markViewDirty('request');
    if (isViewVisible('request')) scheduleHydratedViewRender('request');
    if (isViewVisible('detail') && activeDetailSourceView==='request') refreshHydratedSuspendItemDetail(updated);
}

function scheduleSuspendItemBatch(codes,scope,previous) {
    const entries=codes.map(code=>{
        const entry={...suspendTagItemHydration.get(code),owner:scope.owner,permission:scope.permission,selection:scope.selection};
        entry.rows ||= [];
        suspendTagItemHydration.set(code,entry);
        return entry;
    });
    const promise=previous.then(()=>hydrateSuspendItemBatch(codes,scope)).catch(error=>{
        if (!scope.current()) return;
        for (const entry of entries) entry.loadedAt=Date.now()-115000;
        console.warn('Suspend item hydration deferred',error);
    }).finally(()=>{for (const entry of entries) entry.promise=null;});
    for (const entry of entries) entry.promise=promise;
    return promise;
}

function suspendItemReadScope() {
    const owner=getSupabaseReadIdentityScope(), permission=getPassiveNativeReadPermissionVersion();
    const farm=getBloomscapesFarm(), selection=bloomscapesFarmState.selectionToken;
    return {owner,permission,farm,selection,current:()=>hasAuthenticatedOperationalReadIdentity()
        && owner===getSupabaseReadIdentityScope() && permission===getPassiveNativeReadPermissionVersion()
        && farm===getBloomscapesFarm() && selection===bloomscapesFarmState.selectionToken};
}

function hydrateSuspendTagItemOptions(items=[]) {
    if (!hasAuthenticatedOperationalReadIdentity()) return;
    const scope=suspendItemReadScope();
    const pending=new Set();
    for (const [key,entry] of suspendTagItemHydration) {
        if (entry.owner!==scope.owner || entry.permission!==scope.permission || entry.selection!==scope.selection) suspendTagItemHydration.delete(key);
        else if (entry.promise) pending.add(entry.promise);
    }
    const needsRead=code=>{
        const prior=suspendTagItemHydration.get(code);
        return code && !prior?.promise && !(Date.now()-prior?.loadedAt<120000);
    };
    const codes=[...new Set(items.map(getRequestItemCodeOptionItemCode).filter(needsRead))];
    let previous=Promise.all(pending);
    for (let start=0;start<codes.length;start+=32) previous=scheduleSuspendItemBatch(codes.slice(start,start+32),scope,previous);
}

function resolveExactSuspendOwner(item, code, state) {
    const canonicalCode = normalizeSuspendOwnerCode(code);
    let projection = item?.suspend_owner_zone_override !== undefined || item?.SUSPEND_OWNER_ZONE_OVERRIDE !== undefined ? item : null;
    if (!projection && typeof suspendTagInventory !== 'undefined' && suspendTagInventoryScope === getSupabaseReadIdentityScope()) {
        const uid = getDockSuspendDcRequestSourceUid(item);
        const identity = getSuspendTagInventoryIdentity(item,item);
        projection = suspendTagInventory.find(row => getDockSuspendDcRequestSourceUid(row) === uid
            && matchesSuspendTagInventoryIdentity(row,identity)) || null;
        if (!projection && suspendTagInventory.some(row => getDockSuspendDcRequestSourceUid(row) === uid)) return 'Unassigned';
    }
    const ownerEvidence = projection || item;
    const projected = validSuspendOwner(ownerEvidence?.suspend_eval_owner || ownerEvidence?.SUSPEND_EVAL_OWNER);
    if (projection?.suspend_owner_zone_override === true || projection?.SUSPEND_OWNER_ZONE_OVERRIDE === true) {
        return projected || 'Unassigned';
    }
    const linked = typeof getQueueCardInventoryRow === 'function' ? getQueueCardInventoryRow(item, 'request') : null;
    const target = linked && matchesSuspendTagInventoryIdentity(linked, getSuspendTagInventoryIdentity(item, item)) ? linked : item;
    const identity = { ...target, ITEMCODE: canonicalCode, itemcode: canonicalCode };
    const assignment = typeof getWarehouseAssignedRowForItem === 'function'
        ? getWarehouseAssignedRowForItem(identity) : null;
    if (assignment && typeof resolveManagerAssignedOwnerEvidence === 'function') {
        const evidence = resolveManagerAssignedOwnerEvidence(identity, state, true);
        const owner = validSuspendOwner(evidence.worker);
        if (owner) return owner;
    }
    return resolveSuspendOwnerFallback(canonicalCode, state, projected);

}

function canCurrentUserViewDockSuspendDcRequests(item = null) {
    if (item?.DOCK_SUSPEND_DC_REQUEST === true) {
        const scope = queueAccessScope('suspend-tag');
        return canReadSuspendQueue() && (scope.all || resolveSuspendOwner(item) === scope.user);
    }
    if (!item && activeReqTab === 'suspend-tag') return canReadSuspendQueue();
    if (item && resolveCanonicalRowAccess(currentUser, item).canCompleteTag) return true;
    return resolveCanonicalRowAccess(currentUser, {}).canEditAnyRow;
}

function resolveSuspendOwner(item) {
    const code = buildManagerEvalAssignmentKey(item?.ITEMCODE || item?.itemcode || item?.ITEM || item?.item);
    const state = getManagerAssignedColumnState();
    if (typeof nativeAuthSessionActive!=='undefined' && nativeAuthSessionActive && typeof getBloomscapesAssignmentIndex==='function') {
        return resolveBloomscapesAssignedOwner(item,getBloomscapesAssignmentIndex()) || 'Unassigned';
    }
    if (item?.DOCK_SUSPEND_DC_REQUEST === true || isDockSuspendDcRequestSource(item)) {
        return resolveExactSuspendOwner(item, code, state);
    }
    const { exact, family } = getCardEvalOwnerIndex(state);
    const owner = exact.get(code) || family.get(code.split('.')[0]);
    if (owner) return owner;
    for (const field of ['eval_user', 'assigned_user', 'default_owner', 'effective_worker', 'assignedto']) {
        const assigned = normalizeEvalAssignableUser(item?.[field] || item?.[field.toUpperCase()]);
        if (assigned && !['none', 'null', 'unassigned', 'n_a'].includes(assigned)) return assigned;
    }
    return 'Unassigned';
}

function getSuspendEvalOwner(item) {
    return resolveSuspendOwner(item);
}

function normalizeSuspendOwnerCode(value) {
    const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\.+$/, '');
    if (/^\d{1,6}$/.test(code)) return code.padStart(6, '0');
    const parts = code.match(/^(\d{1,6})\.(\d{1,3})(?:\.(\d+))?$/);
    return parts ? parts[1].padStart(6,'0')+'.'+parts[2].padStart(3,'0')+'.'+(Number(parts[3] || 1)) : code;
}

function validSuspendOwner(value) {
    const owner = normalizeSuspendQueueOwner(value);
    return owner && !['none','null','Unassigned','n_a'].includes(owner) ? owner : '';
}

function suspendOwnerFromRow(row) {
    if (typeof row === 'string') return validSuspendOwner(row);
    return validSuspendOwner(row?.assignedto || row?.ASSIGNEDTO || row?.default_owner || row?.DEFAULT_OWNER
        || row?.default_assignedto || row?.effective_worker || row?.EFFECTIVE_WORKER || row?.eval_user || row?.EVAL_USER);
}

function resolveSuspendOwnerFallback(code, state, projected) {
    const defaults = state.itemcodeDefaultOwners || state.defaultOwnersByCode;
    const exactDefault = defaults?.get(code);
    if (defaults?.has(code) && (exactDefault === null || exactDefault?.assignedto === null)) return 'Unassigned';
    const direct = suspendOwnerFromRow(exactDefault);
    if (direct) return direct;
    const { exact } = getCardEvalOwnerIndex(state, true);
    const indexed = validSuspendOwner(exact.get(code));
    if (indexed) return indexed;
    const entries = [...(defaults?.entries() || [])];
    const inventory = state.fullInventory || [];
    const normalized = collectSuspendOwnerCandidates(entries, inventory, code, false);
    if (normalized.size === 1) return [...normalized][0];
    if (normalized.size > 1) return 'Unassigned';
    const confirmed = validSuspendOwner(projected);
    if (confirmed) return confirmed;
    const family = collectSuspendOwnerCandidates(entries, inventory, code, true);
    return family.size === 1 ? [...family][0] : 'Unassigned';
}

function collectSuspendOwnerCandidates(entries, inventory, code, family) {
    const owners = new Set();
    const matches = candidate => family ? candidate.split('.')[0] === code.split('.')[0] : candidate === code;
    for (const [key, row] of entries) {
        const candidate = normalizeSuspendOwnerCode(row?.itemcode_normalized || row?.itemcode || key);
        const owner = suspendOwnerFromRow(row);
        if (matches(candidate) && owner) owners.add(owner);
    }
    for (const row of inventory) {
        if (row.present_in_drive === false) continue;
        const candidate = normalizeSuspendOwnerCode(row.ITEMCODE || row.itemcode);
        const owner = suspendOwnerFromRow(row);
        if (matches(candidate) && owner) owners.add(owner);
    }
    return owners;
}

function getAssignedQueueOwner(row,index) {
    if (nativeAuthSessionActive) return resolveSuspendOwner(row);
    // Rows without any tag provenance do not need the Dock classification path.
    const hasDockEvidence = row && (row.IS_SUSPEND_TAG || row.is_suspend_tag || row.REQUEST_TYPE || row.request_type
        || row.SUSPEND || row.suspend || row.Suspend || row.DOCK_SUSPEND_DC_REQUEST
        || row.UNIQUE_ID || row.unique_id || row.DOCK_SUSPEND_SOURCE_UID || row.dock_suspend_source_uid
        || (row.SOURCE_TABLE || row.source_table) && (row.REQUEST_SOURCE || row.request_source));
    if (hasDockEvidence && (isDockSuspendDcRequestMirrorRow(row) || isDockSuspendDcRequestSource(row))) return resolveSuspendOwner(row);
    const rawCode = row?.ITEMCODE || row?.itemcode || row?.ITEM || row?.item;
    const code = typeof rawCode === 'string' && /^[0-9]{6}\.[0-9]{3}\.[0-9]+$/.test(rawCode)
        ? rawCode : buildManagerEvalAssignmentKey(rawCode);
    const lookup=index ?? getCardEvalOwnerIndex(getManagerAssignedColumnState(),true);
    return lookup.exact.get(code) || lookup.family.get(code.slice(0,6)) || '';
}
