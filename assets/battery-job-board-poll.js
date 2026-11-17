const bloomscapesJobBoardRefresh = {timer:null,pending:false,failures:0,bound:false};

function canRefreshBloomscapesJobBoard() {
    return Boolean(currentUser && nativeAuthSessionActive && !document.hidden && navigator.onLine!==false
        && document.getElementById('view-request')?.classList.contains('hidden')===false);
}

function stopBloomscapesJobBoardRefresh() {
    bloomscapesJobBoardRefresh.timer?.();
    bloomscapesJobBoardRefresh.timer = null;
}

function startBloomscapesJobBoardRefresh() {
    const state = bloomscapesJobBoardRefresh;
    if (!state.bound) {
        state.bound = true;
        document.addEventListener('visibilitychange',()=>{
            if (document.hidden) stopBloomscapesJobBoardRefresh();
            else startBloomscapesJobBoardRefresh();
        });
        window.addEventListener('pagehide',stopBloomscapesJobBoardRefresh);
        window.addEventListener('online',startBloomscapesJobBoardRefresh);
        window.addEventListener('offline',stopBloomscapesJobBoardRefresh);
    }
    if (state.timer || state.pending || !canRefreshBloomscapesJobBoard()) return;
    const delay = Math.min(300000,45000*2**Math.min(state.failures,3));
    state.timer = window.BloomscapesBatteryGovernor.schedule('job-board',refreshBloomscapesJobBoardRevision,delay);
}

async function refreshBloomscapesJobBoardRevision() {
    const state = bloomscapesJobBoardRefresh;
    stopBloomscapesJobBoardRefresh();
    if (state.pending || !canRefreshBloomscapesJobBoard()) return;
    state.pending = true;
    const owner = getSupabaseReadIdentityScope();
    try {
        const next = await readBloomscapesJobBoardRevision();
        if (owner!==getSupabaseReadIdentityScope() || !canRefreshBloomscapesJobBoard()) return;
        if (next.revision!==bloomscapesFieldQueueState.revision) {
            await ensureBloomscapesFieldQueue(true);
            if (owner===getSupabaseReadIdentityScope()) scheduleTrackedSearchViewRender('request','job-board-revision','',{force:true,debounceDelay:1});
        }
        state.failures = 0;
    } catch (error) {
        state.failures = Math.min(3,state.failures+1);
        globalThis.reportHandledRuntimeIssue?.('job_board_revision',error.code || 'JOB_BOARD_REFRESH_FAILED');
    } finally {
        state.pending = false;
        startBloomscapesJobBoardRefresh();
    }
}
