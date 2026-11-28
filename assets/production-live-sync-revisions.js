/**
 * @param {string[]} keys Canonical revision keys in the active cohort.
 * @param {object} [options] Active read cancellation options.
 * @returns {Promise<object>} The published dataset revision metadata.
 */
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

/**
 * @param {object[]} summaries Known and incoming Home source receipts.
 * @param {Function} selectFilename Canonical chooser for names at one revision and timestamp.
 * @returns {object[]} One published summary per source label.
 */
function mergeHomeSyncRevisionSummaries(summaries, selectFilename) {
    const byLabel = new Map();
    for (const entry of Array.isArray(summaries) ? summaries : []) {
        if (!entry?.label || (!entry.iso && !entry.files?.length)) continue;
        const current = byLabel.get(entry.label);
        byLabel.set(entry.label, mergeHomeSyncRevisionEntry(entry, current, selectFilename));
    }
    return Array.from(byLabel.values());
}

function parseHomeSyncRevision(value) {
    return /^\d+$/.test(String(value ?? '')) ? BigInt(value) : null;
}

function mergeHomeSyncRevisionEntry(entry, current, selectFilename) {
    const revision = parseHomeSyncRevision(entry.revision);
    const filename = selectFilename(entry.files || []);
    const candidate = {
        label: entry.label,
        iso: entry.iso || '',
        ms: Number(entry.ms || -1),
        revision: revision === null ? '' : String(entry.revision),
        authoritative: entry.authoritative === true,
        files: filename ? [filename] : [],
    };
    if (!current) return candidate;
    const currentRevision = parseHomeSyncRevision(current.revision);
    const sameRevision = revision === currentRevision;
    const sameAuthority = candidate.authoritative === current.authoritative;
    const newerRevision = revision !== null && (currentRevision === null || revision > currentRevision);
    if ((candidate.authoritative && !current.authoritative)
        || (sameAuthority && (newerRevision || (sameRevision && candidate.ms > current.ms)))) {
        return {...candidate, files: filename ? candidate.files : current.files};
    }
    // Late receipts from a different revision cannot fill or replace this revision's filename.
    if (!sameRevision || !filename) return current;
    if (!current.files.length || (sameAuthority && candidate.ms === current.ms)) {
        return {...current, files: [selectFilename([...current.files, filename])]};
    }
    return current;
}
