function hasBloomscapesDockWriteContext() {
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id || hasConfirmedCurrentAccountRevocation()) return false;
    if (!bloomscapesFarmState.confirmed || bloomscapesFarmState.busy || bloomscapesFarmState.owner!==String(currentUser)) return false;
    if (nativeAuthProfile.username!==currentUser || bloomscapesFarmState.readyFarm!==getBloomscapesFarm()) return false;
    return canAccessView('docks');
}

function requireCurrentDocksWriteProof(actionLabel = 'saving Docks changes') {
    if (hasBloomscapesDockWriteContext()) return true;
    const view = getCurrentVisibleViewId();
    if (!canUseProductionLiveSync() || (view !== 'docks' && !(view === 'detail' && activeDetailSourceView === 'docks'))) return true;
    return requireCurrentProductionLiveSyncProof(actionLabel);
}

function updateDocksWriteControlGate() {
    const view = getCurrentVisibleViewId();
    const isDocks = view === 'docks' || (view === 'detail' && activeDetailSourceView === 'docks');
    const verified = !isDocks || !canUseProductionLiveSync() || hasBloomscapesDockWriteContext() || hasCurrentProductionLiveSyncProof();
    docksWriteControlsVerified = verified;
    const roots = ['docks-content', 'view-detail', 'dock-info-modal', 'dock-mistake-modal', 'dock-mistake-detail-modal', 'dock-allocation-modal']
        .map((id) => document.getElementById(id)).filter(Boolean);
    roots.forEach((root) => {
        applyDocksWriteProofToNode(root, verified);
        observeBloomscapesDockControls(root,isDocks);
    });
    if (!isDocks) {
        docksWriteControlObservers.forEach(observer => observer.disconnect());
        docksWriteControlObservers.clear();
    }
}


function observeBloomscapesDockControls(root,isDocks) {
    if (!isDocks || typeof MutationObserver!=='function' || docksWriteControlObservers.has(root)) return;
    const observer=new MutationObserver(applyBloomscapesDockControlMutations);
    observer.observe(root,{childList:true,subtree:true});
    docksWriteControlObservers.set(root,observer);
}

function applyBloomscapesDockControlMutations(records) {
    for (const record of records) {
        for (const node of record.addedNodes) applyDocksWriteProofToNode(node,docksWriteControlsVerified);
    }
}
