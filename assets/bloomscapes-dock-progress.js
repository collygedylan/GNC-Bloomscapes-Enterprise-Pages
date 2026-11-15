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
