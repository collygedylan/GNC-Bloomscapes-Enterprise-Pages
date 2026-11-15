const suspendTagApprovalQuery = new URLSearchParams(window.location.search);
let suspendTagApprovalOpenPending = suspendTagApprovalQuery.get('suspendApproval') || '';
let suspendTagApprovalDecisionPending = suspendTagApprovalQuery.get('suspendDecision') || '';
const notificationResumeState = {active:true,deadline:Date.now()+60000,inFlight:new Map(),backoff:1500};
function scheduleNotificationResume(resume) {
    const state = notificationResumeState;
    if (!state.active || document.hidden || Date.now()>=state.deadline || state.inFlight.has(resume)) return;
    state.inFlight.set(resume,setTimeout(()=>{
        state.inFlight.delete(resume);
        if (state.active && Date.now()<state.deadline) void resume();
    },state.backoff));
    state.backoff = Math.min(6000,state.backoff*2);
}
window.addEventListener('pagehide',()=>{
    notificationResumeState.active = false;
    notificationResumeState.inFlight.forEach(timer=>clearTimeout(timer));
    notificationResumeState.inFlight.clear();
});
async function resumeSuspendTagApproval() {
    if (!suspendTagApprovalOpenPending) return;
    const headers = typeof getNativeAuthRequestHeaders === 'function' ? await getNativeAuthRequestHeaders().catch(() => null) : null;
    if (!headers) { scheduleNotificationResume(resumeSuspendTagApproval); return; }
    const approvalId = suspendTagApprovalOpenPending;
    suspendTagApprovalOpenPending = '';
    const requestedDecision = ['approve', 'deny'].includes(suspendTagApprovalDecisionPending) ? suspendTagApprovalDecisionPending : '';
    suspendTagApprovalDecisionPending = '';
    let decision = '';
    const serviceWorker = navigator.serviceWorker;
    let registration = null;
    try {
        if (typeof serviceWorker?.getRegistration === 'function') registration = await serviceWorker.getRegistration('./');
    } catch { globalThis.reportHandledRuntimeIssue?.("resumeSuspendTagApproval", 'HANDLED_OPERATION_FAILURE'); }
    const controller = serviceWorker?.controller || registration?.active;
    if (controller && typeof MessageChannel !== 'undefined') {
        decision = await new Promise(resolve => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => { channel.port1.close(); resolve(''); },1000);
            channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data && event.data.decision || ''); };
            controller.postMessage({ type:'GNC_TAKE_SUSPEND_ACTION',approvalId },[channel.port2]);
        });
    }
    await openSuspendTagApproval(approvalId,decision || requestedDecision, suspendTagApprovalQuery.get('suspendCandidate') || '');
}
// Authentication may restore after either source or deferred runtime startup.
resumeSuspendTagApproval().catch(console.warn);
function resumeAssignedItemsNotification() {
    if (new URLSearchParams(window.location.search).get('assignedItems') !== 'unassigned') return;
    if (typeof isAuthenticatedAppSessionActive !== 'function' || !isAuthenticatedAppSessionActive()
        || !document.body.classList.contains('role-access-ready')) {
        scheduleNotificationResume(resumeAssignedItemsNotification);
        return;
    }
    const target = new URL(window.location.href);
    target.searchParams.delete('assignedItems');
    history.replaceState(history.state, '', target.href);
    openManagerUnassignedItems();
}
resumeAssignedItemsNotification();
const shellServiceWorker = navigator.serviceWorker;
if (shellServiceWorker) { void window.GncLiveAppUpdate?.start?.(); }
    

window.addEventListener('gnc-user-access-change',()=>{
    if (document.hidden) return;
    notificationResumeState.active=true;
    notificationResumeState.deadline=Date.now()+60000;
    notificationResumeState.backoff=1500;
    scheduleNotificationResume(resumeSuspendTagApproval);
    scheduleNotificationResume(resumeAssignedItemsNotification);
});
