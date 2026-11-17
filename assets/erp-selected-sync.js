
let selectedErpRun = null;
let selectedErpState = null;

function getSelectedErpSyncKeys() {
    try { return readSelectedErpSyncKeys(localStorage); }
    catch (error) {
        globalThis.reportHandledRuntimeIssue?.('erp_selection',error.message);
        return [...DEFAULT_CORE_SYNC_KEYS];
    }
}

function setSelectedErpSyncKeys(keys) {
    return writeSelectedErpSyncKeys(localStorage,keys);
}

function getSelectedErpSyncState() {
    return selectedErpState?.owner===getSupabaseReadIdentityScope() ? selectedErpState : null;
}

function runSelectedErpSyncTargets(targetKeysOverride) {
    if (selectedErpRun) return selectedErpRun;
    if (!canRunManualInventoryImport()) return Promise.reject(new Error('ERP sync access is required.'));
    const keys = targetKeysOverride===undefined ? getSelectedErpSyncKeys() : targetKeysOverride;
    selectErpSyncTargets(keys);
    const owner = getSupabaseReadIdentityScope();
    const runner = createErpTargetRunner({commandId:()=>crypto.randomUUID(),
        assertCurrent:()=>assertSelectedErpOwner(owner),execute:executeSelectedErpTarget,
        delay:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
        publish:state=>{ selectedErpState={...state,owner}; renderErpSyncProgressModal(); }
    });
    openErpSyncProgressModal();
    selectedErpRun = runner(keys).then(async receipts=>{
        assertSelectedErpOwner(owner);
        await refreshBloomscapesWarmFarm(getBloomscapesFarm());
        return receipts;
    }).finally(()=>{ selectedErpRun=null; });
    return selectedErpRun;
}

function assertSelectedErpOwner(owner) {
    if (owner!==getSupabaseReadIdentityScope() || !canRunManualInventoryImport()) throw new Error('ERP account or farm changed.');
    if (document.hidden || navigator.onLine===false) throw new Error('ERP sync paused; return online and run again to resume.');
}
