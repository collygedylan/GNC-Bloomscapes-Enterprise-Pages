async function acquireManualErpWakeLock(state, request) {
    try {
        const lock = await Promise.resolve().then(() => request('screen'));
        if (state.wanted) state.sentinel = lock;
        else await lock.release();
    } catch {
        // Sync can continue on the server when the browser declines the lock.
    } finally {
        state.pending = null;
    }
}

function releaseManualErpWakeLock(state) {
    const lock = state.sentinel;
    state.sentinel = null;
    if (lock && !lock.released) void lock.release().catch(() => {});
}

function createManualErpScreenWakeLock(request) {
    const state = { sentinel: null, pending: null, wanted: false };
    return next => {
        state.wanted = next;
        if (!next) releaseManualErpWakeLock(state);
        else if (!state.pending && (!state.sentinel || state.sentinel.released)) state.pending = acquireManualErpWakeLock(state, request);
        return state.pending;
    };
}

/**
 * @param {HTMLDocument} doc
 * @param {Window} win
 * @param {object} screenLock
 * @param {Function} owner
 * @returns {void} Binds screen wake ownership to the open progress modal.
 */
function bindManualErpProgressWakeLock(doc, win, screenLock, owner) {
    const modal = doc.getElementById('erp-sync-progress-modal');
    if (!modal || !screenLock?.request || !win.MutationObserver) return;
    const setWanted = createManualErpScreenWakeLock(screenLock.request.bind(screenLock));
    const sync = () => {
        const open = !modal.classList.contains('hidden') && modal.style.display !== 'none';
        void setWanted(open && doc.visibilityState === 'visible' && !!modal.dataset.owner && modal.dataset.owner === owner());
    };
    const observer = new win.MutationObserver(sync);
    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'style', 'data-owner'] });
    doc.addEventListener('visibilitychange', sync);
    win.addEventListener('pagehide', () => setWanted(false));
    win.addEventListener('pageshow', sync);
}
