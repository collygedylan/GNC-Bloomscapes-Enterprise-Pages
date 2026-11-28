const bloomscapesDockProgressFlights = new Set();

async function toggleDockItemState(uid,type) {
    if (!requireCurrentDocksWriteProof()) return false;
    const row = findDockDisplayRowByUniqueId(uid) || socInventory.find(item=>String(item.UNIQUE_ID)===String(uid));
    const stage = type==='inspector' ? 'inspector' : 'checker';
    if (getDockItemProgress(uid)[stage]===true) return false;
    if (!row || !canCurrentUserMarkDockStage(row,stage)) {
        showToast('Restricted','This Dock row is not available for your current stage.',true);
        return false;
    }
    const owner = getSupabaseReadIdentityScope();
    const key = JSON.stringify([owner,uid,stage]);
    if (bloomscapesDockProgressFlights.has(key)) return false;
    bloomscapesDockProgressFlights.add(key);
    try {
        const receipt = await saveBloomscapesDockProgress(row,stage);
        if (owner!==getSupabaseReadIdentityScope()) return false;
        cacheDockItemProgress(uid,normalizeDockItemProgress(receipt));
        dockItemProgressLoaded = true;
        markViewDirty('docks');
        scheduleDocksRender(16);
    } catch (error) {
        if (owner===getSupabaseReadIdentityScope()) showToast('Dock progress',error.message,true);
    } finally { bloomscapesDockProgressFlights.delete(key); }
    return false;
}

/** @param {object} state Confirmed dock board state. @returns {void} Paints the visible board and refreshes dependent controls. */
function publishBloomscapesDockBoard(state) {
    const viewId = getCurrentVisibleViewId();
    const host = document.getElementById('view-'+viewId);
    if (host && Object.hasOwn(bloomscapesDockWorkspaceTitles,viewId)) paintBloomscapesDocksWorkspace(host,viewId,state);
    if (viewId === 'docks') {
        if (!isDatasetLoaded('soc','full')) invalidateDockWorkflowResolvedState();
        scheduleDocksRender(0,180,true);
    }
    if (viewId === 'request' && activeReqTab === 'suspend-tag') {
        markViewDirty('request');
        scheduleRequestRender(0);
    }
}

/** @returns {object|null} Current account and farm board when available. */
function currentBloomscapesDockBoard() {
    const state = getBloomscapesDockBoardState();
    return isBloomscapesDockStateCurrent(state) ? state.board : null;
}

/** @returns {number} Current board revision or zero before a confirmed board. */
function bloomscapesDockBoardRevision() {
    const state = getBloomscapesDockBoardState();
    return isBloomscapesDockStateCurrent(state) ? state.revision : 0;
}
