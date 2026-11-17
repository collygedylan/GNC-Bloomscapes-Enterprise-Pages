function readProductionLiveRevisions(keys, options = {}) {
    return withProductionLiveSyncSignal(options.signal, signal => readProductionRevisionMetadata(keys, signal));
}

async function readProductionRevisionMetadata(keys, signal) {

    const owner = getSupabaseReadIdentityScope();
    let metadata;
    try {
        metadata = await supabaseRpc('get_my_dataset_revisions_v1', { p_dataset_keys: keys }, { timeoutMs: 15000, signal });
        metadata = normalizeOptionalBunchRevisionMetadata(metadata, keys);
        if (metadata?.contractVersion === 1 && Array.isArray(metadata.sources)) {
            window.GncRuntimeWatchdog?.setDatasetRevisions(Object.fromEntries(metadata.sources.map(source => [String(source.key || ''), { revision: String(source.revision ?? ''), state: String(source.state || '') }])));
        }
    } catch (error) {
        if (keys.includes('ph_master_inventory') && owner === getSupabaseReadIdentityScope() && !signal.aborted) {
            inventoryStatusSync?.setSourceReady(false);
        }
        throw error;
    }
    if (keys.includes('ph_master_inventory') && owner === getSupabaseReadIdentityScope() && !signal.aborted) {
        const master = metadata?.sources?.find(source => source.key === 'ph_master_inventory');
        inventoryStatusSync?.setSourceReady(metadata?.contractVersion === 1
            && metadata.permissionVersion === appAccessSnapshotState.snapshot?.dataPermissionVersion
            && master?.state === 'ready' && /^\d+$/.test(String(master.revision)) && isRowPatchSourceReady('ph_master_inventory'));
    }
    applyDashboardPublishedRevisionMetadata(metadata, owner);
    return metadata;
}
