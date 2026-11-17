async function pollReclassDeliveryJobs() {
    if (document.hidden || inFlight) return false;
    const actor = getCurrentReclassDeliveryActor();
    const identity = typeof getSupabaseReadIdentityScope === 'function' ? getSupabaseReadIdentityScope() : null;
    const current = () => !document.hidden && getCurrentReclassDeliveryActor() === actor
        && (identity === null || getSupabaseReadIdentityScope() === identity);
    const jobs = actor ? activeReclassDeliveryJobs(actor) : [];
    renderReclassDeliveryStatusTray();
    if (!jobs.length) return false;
    inFlight = true;
    let checked = true;
    try {
        for (const job of jobs) {
            if (!current()) return false;
            if (!await reconcileReclassDeliveryJob(job, current)) checked = false;
        }
        return checked;
    } finally {
        inFlight = false;
        renderReclassDeliveryStatusTray();
    }
}

function activeReclassDeliveryJobs(actor) {
    return readReclassDeliveryJobs().filter(job => job.actorUsername === actor
        && ['queued', 'processing', 'pending_create'].includes(String(job.status || '').toLowerCase()));
}

async function reconcileReclassDeliveryJob(job, current) {
    try {
        if (job.pendingCreate) {
            await dispatchPendingReclassDeliveryDraft(job);
            return true;
        }
        const result = await readReclassDeliveryStatus(job);
        if (current() && result?.status && result.status !== 'missing') applyReclassDeliveryStatus(job, result);
        return true;
    } catch (error) {
        if (current() && job.pendingCreate && !error?.inventoryStatusPending && !isInventoryStatusOutcomeUncertain(error)) {
            upsertReclassDeliveryJob({
                ...job, status: 'failed', pendingCreate: true,
                errorCode: String(error?.code || error?.status || ''),
                message: getFriendlyBackendErrorMessage(error, 'The inquiry was not queued. Your saved draft is available to retry.')
            });
        }
        return false;
    }
}

function readReclassDeliveryStatus(job) {
    const source = String(job.sourceView || '').trim().toLowerCase();
    const protectedInquiry = ['drive', 'suspend-tag'].includes(source)
        || job.payload?.workflowPolicyVersion === RECLASS_ACTION_WORKFLOW_V7_POLICY_VERSION;
    if (protectedInquiry) return driveReclassApi('status', { idempotencyToken: job.token }, { timeoutMs: 12000 });
    return postGoogleScriptRawJsonPayload({
        type: 'reclass_inquiry_status', idempotencyToken: job.token
    }, 12000, 'Reclass Background Status');
}

function applyReclassDeliveryStatus(job, result) {
    const status = String(result.status).toLowerCase();
    const update = {
        ...job,
        status,
        jobId: String(result.jobId || job.jobId || ''),
        queuedAt: String(result.queuedAt || job.queuedAt || ''),
        deliveredAt: String(result.deliveredAt || ''),
        attemptCount: Number(result.attemptCount || 0),
        errorCode: String(result.errorCode || ''),
        message: String(result.message || '')
    };
    if (status === 'delivered') Object.assign(update, { payload: null, recipientEmails: [], notified: true });
    upsertReclassDeliveryJob(update);
}

const RECLASS_DELIVERY_IDLE_MS = 300000;
let reclassDeliveryPollTimer = null;
let inFlight = false;
let reclassDeliveryPollOwner = '';
let reclassDeliveryBackoffDelay = RECLASS_DELIVERY_IDLE_MS;
let reclassDeliveryNextCheckAt = 0;

function clearReclassDeliveryPollTimer() {
    if (reclassDeliveryPollTimer === null) return;
    reclassDeliveryPollTimer();
    reclassDeliveryPollTimer = null;
}

function isReclassDeliveryPollingAllowed() {
    return document.visibilityState === 'visible' && navigator.onLine !== false && isQuotaBackgroundPollingAllowed();
}

async function runReclassDeliveryBackgroundCheck() {
    if (!isReclassDeliveryPollingAllowed()) {
        clearReclassDeliveryPollTimer();
        return;
    }
    const owner = getSupabaseReadIdentityScope();
    if (owner !== reclassDeliveryPollOwner) {
        reclassDeliveryPollOwner = owner;
        reclassDeliveryBackoffDelay = RECLASS_DELIVERY_IDLE_MS;
        reclassDeliveryNextCheckAt = 0;
    }
    if (Date.now() < reclassDeliveryNextCheckAt || inFlight
        || !activeReclassDeliveryJobs(getCurrentReclassDeliveryActor()).length) return;
    const started = Date.now();
    reclassDeliveryNextCheckAt = started + RECLASS_DELIVERY_IDLE_MS;
    const checked = await pollReclassDeliveryJobs();
    if (getSupabaseReadIdentityScope() !== owner) return;
    reclassDeliveryBackoffDelay = checked ? RECLASS_DELIVERY_IDLE_MS
        : Math.min(4 * RECLASS_DELIVERY_IDLE_MS, 2 * reclassDeliveryBackoffDelay);
    reclassDeliveryNextCheckAt = (checked ? started : Date.now()) + reclassDeliveryBackoffDelay;
}

function startReclassDeliveryPolling() {
    queueArgosReclassMoveRecovery();
    renderReclassDeliveryStatusTray();
    if (!isReclassDeliveryPollingAllowed()) {
        clearReclassDeliveryPollTimer();
        return;
    }
    if (reclassDeliveryPollTimer === null) {
        reclassDeliveryPollTimer = window.BloomscapesBatteryGovernor.schedule('reclass-delivery',runReclassDeliveryBackgroundCheck,RECLASS_DELIVERY_IDLE_MS);
    }
}

function bindReclassDeliveryPolling() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') startReclassDeliveryPolling();
        else clearReclassDeliveryPollTimer();
    }, { passive: true });
}
