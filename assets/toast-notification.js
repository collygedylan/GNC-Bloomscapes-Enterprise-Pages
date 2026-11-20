let toastHideTimer = null;
let toastClearTimer = null;
let toastToken = 0;
let toastLastFingerprint = '';
let toastLastShownAt = 0;
let toastPointerState = null;

function clearToastTimers() {
    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (toastClearTimer) clearTimeout(toastClearTimer);
    toastHideTimer = null;
    toastClearTimer = null;
}

function clearToastContent(token = toastToken) {
    const toast = document.getElementById('toast-notification');
    if (!toast || token !== toastToken) return;
    toast.innerHTML = '';
    toast.style.background = '';
    toast.style.removeProperty('--toast-drag-y');
    toast.classList.remove('toast-dismissing', 'toast-dragging');
    toast.removeAttribute('data-kind');
    toastClearTimer = null;
}

function dismissToast(reason = 'dismiss') {
    const toast = document.getElementById('toast-notification');
    if (!toast || !toast.classList.contains('show')) return false;
    const token = toastToken;
    clearToastTimers();
    toastPointerState = null;
    toast.classList.remove('toast-dragging');
    toast.classList.add('toast-dismissing');
    toast.setAttribute('data-dismiss-reason', String(reason || 'dismiss').slice(0, 32));
    requestAnimationFrame(() => {
        if (token !== toastToken) return;
        toast.classList.remove('show');
    });
    toastClearTimer = setTimeout(() => clearToastContent(token), 320);
    return true;
}

function bindToastDismissInteractions(toast) {
    if (!toast || toast.dataset.dismissBound === 'true') return;
    toast.dataset.dismissBound = 'true';
    toast.addEventListener('click', (event) => {
        if (event.target && event.target.closest && event.target.closest('[data-toast-dismiss]')) dismissToast('close-button');
    });
    toast.addEventListener('pointerdown', (event) => {
        if (!toast.classList.contains('show') || (event.target && event.target.closest && event.target.closest('[data-toast-dismiss]'))) return;
        toastPointerState = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            startedAt: performance.now()
        };
        toast.classList.add('toast-dragging');
        try { toast.setPointerCapture(event.pointerId); } catch { globalThis.reportHandledRuntimeIssue?.("bindToastDismissInteractions", 'HANDLED_OPERATION_FAILURE'); }
    });
    toast.addEventListener('pointermove', (event) => {
        if (!toastPointerState || toastPointerState.pointerId !== event.pointerId) return;
        toastPointerState.lastY = event.clientY;
        const deltaY = Math.min(0, event.clientY - toastPointerState.startY);
        toast.style.setProperty('--toast-drag-y', `${Math.max(-160, deltaY)}px`);
    });
    const finishSwipe = (event) => {
        if (!toastPointerState || toastPointerState.pointerId !== event.pointerId) return;
        const state = toastPointerState;
        toastPointerState = null;
        toast.classList.remove('toast-dragging');
        const deltaY = Math.min(0, Number(event.clientY || state.lastY) - state.startY);
        const elapsed = Math.max(1, performance.now() - state.startedAt);
        const velocity = deltaY / elapsed;
        if (deltaY <= -46 || velocity <= -0.42) {
            dismissToast('swipe-up');
            return;
        }
        toast.style.setProperty('--toast-drag-y', '0px');
    };
    toast.addEventListener('pointerup', finishSwipe);
    toast.addEventListener('pointercancel', finishSwipe);
}

function escapeToastHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function expireToast(toast, token) {
    if (token !== toastToken) return;
    toast.classList.remove('show');
    toastHideTimer = null;
    toastClearTimer = setTimeout(() => clearToastContent(token), 360);
}

function showToast(title, message = '', isAlert = false, options = {}) {
    if (window.__gncOpsPilot && typeof window.__gncOpsPilot.observeToast === 'function') {
        window.__gncOpsPilot.observeToast(title, message, isAlert);
    }
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    const toastTitle = String(title ?? '').trim();
    const toastMessage = String(message ?? '').trim();
    const errorPattern = /(error|failed|fail|timeout|missing|required|invalid|not found|unable|denied|blocked|network|dropped|try again)/i;
    const isErrorToast = isAlert === true || errorPattern.test(toastTitle);
    if (isErrorToast && !options.requestInputGuidance) window.GncRuntimeWatchdog?.observeError?.(toastTitle,toastMessage,true,'UI_ERROR_BANNER_SHOWN',options.driveCommand);
    const fingerprint = String(options.fingerprint || `${isErrorToast ? 'error' : 'notice'}|${toastTitle}|${toastMessage}`)
        .trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 420);
    const now = Date.now();
    const dedupeWindowMs = Math.max(1000, Number(options.dedupeWindowMs) || 15000);
    if (fingerprint && fingerprint === toastLastFingerprint && now - toastLastShownAt < dedupeWindowMs) {
        return false;
    }
    bindToastDismissInteractions(toast);
    clearToastTimers();
    toastLastFingerprint = fingerprint;
    toastLastShownAt = now;
    const token = ++toastToken;
    const requestedDuration = Number(options.duration || options.timeout || 0);
    const compact = !isErrorToast && toastTitle === 'Tag Complete';
    toast.classList.toggle('tag-complete-pill',compact);
    const duration = compact ? 1600 : Math.max(isErrorToast ? 9000 : 3600, requestedDuration || 0);

    toast.classList.remove('toast-dismissing', 'toast-dragging');
    toast.style.setProperty('--toast-drag-y', '0px');
    toast.dataset.kind = options.requestInputGuidance ? 'input-guidance' : isErrorToast ? 'error' : 'success';
    toast.dataset.driveCommand = /^drive-[a-z0-9_-]{8,175}$/i.test(options.driveCommand || '') ? options.driveCommand : '';
    toast.setAttribute('role', isErrorToast ? 'alert' : 'status');
    toast.setAttribute('aria-live', isErrorToast ? 'assertive' : 'polite');
    toast.removeAttribute('data-dismiss-reason');
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${escapeToastHtml(toastTitle || (isErrorToast ? 'Error' : 'Notice'))}</div>
            ${toastMessage ? `<div class="toast-message">${escapeToastHtml(toastMessage)}</div>` : ''}
        </div>
        <button type="button" class="toast-dismiss" data-toast-dismiss aria-label="Dismiss notification"><i class="ph-bold ph-x" aria-hidden="true"></i></button>
    `;
    toast.classList.add('show');

    toastHideTimer = setTimeout(() => expireToast(toast, token), duration);
    return true;
}
