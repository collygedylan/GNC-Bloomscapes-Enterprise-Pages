'use strict';
async function drainBloomscapesNetworkWrite(response, settled) {
    let reader;
    try {
        reader = response.clone().body?.getReader();
        if (reader) while (!(await reader.read()).done) { /* Discard the clone. */ }
    } catch {
        // Keeping the primary response readable takes priority over write tracking.
    } finally {
        reader?.releaseLock();
        settled();
    }
}

if (!(typeof window !== 'undefined' ? window : globalThis).AgMetricLifecycle) {
    const root = typeof window !== 'undefined' ? window : globalThis;
    // Shell maintenance must never own login or authenticated view readiness.
    root.withBootDeadline = (work, fallback = null) => new Promise(resolve => {
        const timer = root.setTimeout(() => resolve(fallback), 1200);
        Promise.resolve(work).then(value => { root.clearTimeout(timer); resolve(value); },
            () => { root.clearTimeout(timer); resolve(fallback); });
    });
    const originalFetch = typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    const pendingNetworkWrites = new Set(), networkSubscribers = new Set();
    const notifyNetwork = () => { for(const fn of [...networkSubscribers])try{fn();}catch(_){} };
    root.GncLiveUpdateNetwork = Object.freeze({get pendingWrites(){return pendingNetworkWrites.size;},subscribe(fn){networkSubscribers.add(fn);return()=>networkSubscribers.delete(fn);}});
    const isMutationFetch = (url,input,init) => {
        const method=String(init?.method || input?.method || 'GET').toUpperCase();
        if(!['POST','PATCH','PUT','DELETE'].includes(method) || url.hostname!==root.GncBloomscapesEnvironment?.supabaseHostname)return false;
        if(!/^\/(?:rest|functions|storage)\/v1\//.test(url.pathname))return false;
        if(method==='POST' && /\/rpc\/(?:get_|read_|list_|watchdog_)/.test(url.pathname))return false;
        if (method === 'POST' && typeof init?.body === 'string') {
            try {
                const body = JSON.parse(init.body);
                if (/^(?:inventory_read|dataset_read|av_read|watchdog_|native_session_bridge)/.test(String(body.action || ''))
                    || /^(?:list|read|get|capabilities|inbox|rows)$/.test(String(body.operation || ''))) return false;
                if (url.pathname === '/functions/v1/app-api' && (body.action === 'manual_sync_status' && !body.operation
                    || body.action === 'erp_sync' && body.operation === 'status' && body.autoRelay === false)) return false;
            } catch { /* Unknown payloads retain the write safeguard. */ }
        }
        return true;
    };
    if (originalFetch) root.fetch = (input, init) => {
        const url=new URL(typeof input==='string' || input instanceof URL ? input : input.url,root.location.href);
        const options=url.hostname===root.GncBloomscapesEnvironment?.supabaseHostname ? {...init,referrerPolicy:'no-referrer'} : init;
        const token=isMutationFetch(url,input,options) ? {} : null;
        const settled=()=>{if(token && pendingNetworkWrites.delete(token))notifyNetwork();};
        if(token){pendingNetworkWrites.add(token);notifyNetwork();}
        let pending;try{pending=originalFetch(input,options);}catch(error){settled();throw error;}
        return Promise.resolve(pending).then(response => {
            if (token) void drainBloomscapesNetworkWrite(response, settled);
            return response;
        }, error => {
            settled();
            throw error;
        });
    };
    root.navigator?.serviceWorker?.addEventListener?.('message', event => {
        if (event.data?.type === 'AGDATA_SW_CLIENT_VERSION' && event.source === root.navigator.serviceWorker.controller) {
            event.ports?.[0]?.postMessage({ build: root.__APP_SHELL_VERSION__ || '', updateCheckpoint: true });
        }
    });
    const doc = root.document;
    const cameraKey = 'agdata_camera_capture_v1';
    let savedCamera = null;
    try { savedCamera = JSON.parse(root.sessionStorage.getItem(cameraKey) || 'null'); } catch (_) {}
    const state = root.GncCameraState = {cameraCaptureInFlight:!!(savedCamera?.cameraCaptureInFlight && Date.now()-savedCamera.startedAt < 30*60_000),startedAt:savedCamera?.startedAt || 0,returnUntil:Number(savedCamera?.returnUntil)||0,captureId:Number(savedCamera?.captureId)||0};
    const photoUploads = new Set();
    let cameraPickerOpen = state.cameraCaptureInFlight;
    root.isCameraCaptureProtected = () => state.cameraCaptureInFlight || Date.now() < state.returnUntil;
    root.persistCameraCaptureState = () => {
        if (state.cameraCaptureInFlight && !state.startedAt) state.startedAt = Date.now();
        try { root.sessionStorage.setItem(cameraKey,JSON.stringify(state)); } catch (_) {}
        const message = {type:'CAMERA_CAPTURE_STATE',active:root.isCameraCaptureProtected?.(),until:state.cameraCaptureInFlight ? Date.now()+30*60_000 : state.returnUntil};
        root.navigator?.serviceWorker?.controller?.postMessage(message);
        root.navigator?.serviceWorker?.getRegistration?.().then(reg => { reg?.waiting?.postMessage(message); reg?.installing?.postMessage(message); }).catch(() => {});
    };
    const updateCameraActivity = () => {
        const active = cameraPickerOpen || photoUploads.size > 0;
        if (state.cameraCaptureInFlight === active) return;
        state.cameraCaptureInFlight = active;
        if (!active) { state.startedAt = 0; state.returnUntil = Date.now()+15_000; }
        root.persistCameraCaptureState();
        if (!active) root.dispatchEvent(new Event('agdata:camera-settled'));
    };
    root.beginCameraCapture = () => { cameraPickerOpen = true; updateCameraActivity(); };
    root.finishCameraCapture = () => { cameraPickerOpen = false; updateCameraActivity(); };
    root.protectCameraPhotoUpload = pending => {
        photoUploads.add(pending);
        updateCameraActivity();
        const release = () => { photoUploads.delete(pending); updateCameraActivity(); };
        pending.then(release, release);
    };
    root.clearCameraPhotoUploads = () => {
        photoUploads.clear();
        cameraPickerOpen = false;
        updateCameraActivity();
    };
    doc?.addEventListener('visibilitychange', () => { if (!doc.hidden) root.finishCameraCapture(); }, {passive:true});
    root.addEventListener('pageshow', () => { if (!doc.hidden) root.finishCameraCapture(); }, {passive:true});
    ['change','cancel'].forEach(type => doc?.addEventListener(type, event => {
        const captureId = event.target?.__gncCameraCaptureId;
        if (event.target?.type !== 'file' || !captureId || captureId !== state.captureId) return;
        root.finishCameraCapture();
        try {
            const saved = JSON.parse(root.sessionStorage.getItem('agdata_camera_detail_v1') || 'null');
            if (saved?.captureId === captureId) root.sessionStorage.removeItem('agdata_camera_detail_v1');
        } catch (_) { /* Native picker completion must not depend on storage. */ }
    }, true));
    const controllers = new Map(['document', 'session', 'view', 'foreground'].map(key => [key, new root.AbortController()]));
    const subscribers = new Set();
    let navigationCommitted = false;
    let viewKey = '';
    let runtimeRecoveryTimer = null;
    const signal = kind => {
        if (!controllers.has(kind)) throw new TypeError('Unknown lifecycle lifetime.');
        return controllers.get(kind).signal;
    };
    const abort = kind => controllers.get(kind).abort();
    const renew = kind => { if (signal(kind).aborted) controllers.set(kind, new root.AbortController()); };
    const notify = (type, reason) => {
        for (const fn of [...subscribers]) {
            try { fn({ type, reason }); } catch (error) { root.console?.error('Lifecycle subscriber failed.', error); }
        }
    };
    function suspendNavigation(committed = true) {
        navigationCommitted = navigationCommitted || committed;
        for (const key of controllers.keys()) abort(key);
        notify('suspend', committed ? 'pagehide' : 'beforeunload');
    }
    function resume(event) {
        if (!event.isTrusted) return;
        if (event.type === 'pageshow') navigationCommitted = false;
        if (doc.hidden || navigationCommitted) return;
        const suspended = signal('document').aborted;
        for (const key of controllers.keys()) renew(key);
        if (suspended || event.type === 'focus' || event.type === 'pageshow') notify('resume', event.type);
    }
    function resetSession() {
        for (const key of ['session', 'view']) {
            abort(key);
            if (!signal('document').aborted) renew(key);
        }
        viewKey = '';
        notify('session', 'session-reset');
    }
    function enterView(key) {
        const next = String(key || '');
        if (next === viewKey) return;
        viewKey = next;
        abort('view');
        if (!signal('document').aborted) renew('view');
        notify('view', 'view-change');
    }
    function createScope({ lifetime = 'view', foreground = false } = {}) {
        if (!['document', 'session', 'view'].includes(lifetime)) throw new TypeError('Unknown lifecycle lifetime.');
        const controller = new root.AbortController();
        const cleanups = new Set();
        const parents = ['document', ...(lifetime !== 'document' ? ['session'] : []), ...(lifetime === 'view' ? ['view'] : []), ...(foreground ? ['foreground'] : [])].map(signal);
        const dispose = () => {
            controller.abort();
            for (const cleanup of [...cleanups]) cleanup();
            cleanups.clear();
        };
        const isCurrent = () => !controller.signal.aborted && parents.every(parent => !parent.aborted);
        for (const parent of parents) {
            parent.addEventListener('abort', dispose, { once: true });
            cleanups.add(() => parent.removeEventListener('abort', dispose));
        }
        if (parents.some(parent => parent.aborted) || foreground && doc.hidden) dispose();
        const guard = fn => (...args) => isCurrent() ? fn(...args) : undefined;
        function schedule(fn, delay, idle) {
            if (!isCurrent()) return () => {};
            const useIdle = idle && typeof root.requestIdleCallback === 'function';
            let id;
            const cancel = () => {
                if (useIdle) root.cancelIdleCallback?.(id);
                else root.clearTimeout(id);
                cleanups.delete(cancel);
            };
            const run = (...args) => { cleanups.delete(cancel); if (isCurrent()) fn(...args); };
            id = useIdle ? root.requestIdleCallback(run, delay) : root.setTimeout(run, idle ? 0 : delay);
            cleanups.add(cancel);
            return cancel;
        }
        return Object.freeze({ signal: controller.signal, isCurrent, guard, dispose,
            timeout: (fn, ms = 0) => schedule(fn, ms, false),
            idle: (fn, options = {}) => schedule(fn, options, true) });
    }
    root.AgMetricLifecycle = Object.freeze({ getSignal: (kind = 'document') => signal(kind),
        suspendNavigation, resetSession, enterView, createScope,
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } });
    // Compatibility adapters: existing callers share this owner, not another controller.
    root.getShellMaintenanceSignal = () => signal('document');
    root.suspendShellMaintenanceForNavigation = suspendNavigation;
    root.addEventListener('beforeunload', () => suspendNavigation(false));
    root.addEventListener('pagehide', () => suspendNavigation());
    root.addEventListener('pageshow', resume);
    root.addEventListener('focus', resume);
    doc.addEventListener('pointerdown', resume, { capture: true, passive: true });
    doc.addEventListener('keydown', resume, { capture: true });
    doc.addEventListener('visibilitychange', event => {
        if (doc.hidden) abort('foreground');
        else resume(event);
        notify('visibility', doc.hidden ? 'hidden' : 'visible');
    });
    root.addEventListener('online', () => notify('online', 'online'));
    root.addEventListener('offline', () => notify('offline', 'offline'));

    root.markAgDataRuntimeReady = () => {
        root.__AGDATA_RUNTIME_READY__ = true;
        if (runtimeRecoveryTimer) root.clearTimeout(runtimeRecoveryTimer);
        runtimeRecoveryTimer = null;
        return true;
    };

    const isShellRelease = value => /^(?:V?\d{4}\.\d{2}\.\d{2}\.\d+|AgData v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.test(value);
    const normalizeAgDataVersion = value => String(value || '').trim().match(/(?:AgData\s+v|v)?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))/i)?.[1] || '';
    const compareAgDataVersions = (left, right) => {
        const a = normalizeAgDataVersion(left).split('.').map(Number);
        const b = normalizeAgDataVersion(right).split('.').map(Number);
        for (let index = 0; index < 3; index += 1) {
            const delta = (a[index] || 0) - (b[index] || 0);
            if (delta) return Math.sign(delta);
        }
        return 0;
    };
    root.compareAgDataVersions = compareAgDataVersions;
    const isAuthTransitionActive = () => {
        const spinner = doc.getElementById?.('loading-spinner');
        const loginView = doc.getElementById?.('view-login');
        const spinnerVisible = !!spinner && !spinner.classList?.contains?.('hidden') && spinner.style?.display !== 'none';
        return !!doc.documentElement?.classList?.contains?.('booting-session')
            || (spinnerVisible && (!loginView || loginView.style?.display !== 'none'));
    };
    root.isAgDataAuthTransitionActive = isAuthTransitionActive;
    root.isAgDataEditorActive = () => {
        const detail = doc?.getElementById?.('view-detail');
        return !!(detail && !detail.classList.contains('hidden') && !detail.hidden
            || Array.from(doc?.querySelectorAll?.('[role="dialog"],dialog[open],.fixed.inset-0[id*="modal"]') || []).some(el => el.getClientRects().length && !el.classList.contains('hidden'))
            || root.pendingPhotoUploads?.size);
    };
    const reloadClaims = new Set();
    const reloadCooldownKey = 'agdata_ios_reload_guard_v23154';
    const reloadFuseKey = 'gnc_version_reload_fuse_v1';
    const reloadFuseMs = 5 * 60 * 1000;

    function recentShellReloads(raw, now) {
        const previous = JSON.parse(raw || 'null');
        const entries = previous?.target ? [[previous.target, previous.at]] : Object.entries(previous || {});
        return Object.fromEntries(entries.filter(([, at]) => Number.isFinite(at) && at <= now && now - at < reloadFuseMs));
    }

    function prepareShellReloadClaim(target) {
        const session = root.sessionStorage, local = root.localStorage, now = Date.now();
        const key = 'agdata_sw_reload_once_' + target;
        if (reloadClaims.has(key) || session.getItem(key)) return null;
        const cooldown = session.getItem(reloadCooldownKey), history = local.getItem(reloadFuseKey);
        const prior = JSON.parse(cooldown || 'null'), recent = recentShellReloads(history, now);
        if (prior?.target === target || (prior && now - prior.at < 60000) || Object.hasOwn(recent, target)) return null;
        return {key, changes:[
            [session, reloadCooldownKey, cooldown, JSON.stringify({target, at:now})],
            [session, key, null, '1'],
            [local, reloadFuseKey, history, JSON.stringify({...recent, [target]:now})],
        ]};
    }

    function writeShellReloadClaim(changes) {
        try {
            for (const [store, key, , intended] of changes) store.setItem(key, intended);
            return true;
        } catch { return false; }
    }

    function restoreShellReloadClaim(changes) {
        for (const [store, key, previous, intended] of changes) {
            try {
                if (store.getItem(key) !== intended) continue;
                if (previous === null) store.removeItem(key);
                else store.setItem(key, previous);
            } catch { /* A retained claim safely prevents a repeat navigation. */ }
        }
    }

    root.claimShellReloadOnce = (version, navigate = () => true) => {
        if (root.isAgDataAuthTransitionActive() || root.isAgDataEditorActive?.() || root.isCameraCaptureProtected?.()) return false;
        const value = String(version || root.__APP_SHELL_VERSION__ || '').trim();
        const target = /^V?\d{4}\.\d{2}\.\d{2}\.\d+$/.test(value) ? value.replace(/^V/, '') : normalizeAgDataVersion(value);
        if (!target) return false;
        let claim;
        try { claim = prepareShellReloadClaim(target); } catch { return false; }
        if (!claim) return false;
        let navigated = false;
        try {
            navigated = writeShellReloadClaim(claim.changes) && navigate() === true;
            if (navigated) reloadClaims.add(claim.key);
            return navigated;
        } finally {
            if (!navigated) restoreShellReloadClaim(claim.changes);
        }
    };
    root.forceAgDataVersionUpgrade = (targetVersion, currentVersion = '', options = {}) => root.requestLiveAppUpdate?.(targetVersion, options) || Promise.resolve(false);
    root.checkAgDataVersion = (reason, options = {}) => root.checkForLiveAppUpdate?.(reason, options) || Promise.resolve(false);
    // Filters are disposable UI state. Auth, inventory, drafts and outboxes are not.
    root.invalidateAppFiltersForVersion = targetBuild => { const target=String(targetBuild || '').trim(); if(!isShellRelease(target))return false; for(const name of ['localStorage','sessionStorage'])try{root[name].setItem('gnc_app_filter_version_v1',target);}catch(_){} return true; };
    const activeSession = () => {
        try { return root.isAuthenticatedAppSessionActive?.() === true; } catch (_) { return false; }
    };
    // One reload owner per document; the worker's version reply can refine the
    // target during the short toast, even when its registration URL is older.
    root.reloadForServiceWorkerUpdate = targetBuild => { void root.requestLiveAppUpdate?.(targetBuild,{reason:'worker-update'}); return false; };


    root.clearOwnedShellControllerState = async targetBuild => {
        const safeTarget = String(targetBuild || '').trim();
        // Keep the active worker and downloaded shell available during origin failures.
        const registration = await root.withBootDeadline(root.navigator?.serviceWorker?.getRegistration?.('./'));
        if (registration) void root.withBootDeadline(registration.update?.());
        return Boolean(safeTarget);

    };

    root.recoverAppLoadFailure = reason => { root.__gncShellUpdateReady=true; return root.checkForLiveAppUpdate?.(String(reason || 'runtime-load-failure')) || Promise.resolve(false); };

    doc.addEventListener('click', event => {
        const target = event.target?.closest?.('button,a');
        if (String(target?.textContent || '').trim().toLowerCase() !== 'reload app') return;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        void root.recoverAppLoadFailure('reload-app');
    }, true);

    root.addEventListener('error', event => {
        if (root.__AGDATA_RUNTIME_READY__ === true) return;
        const source = String(event?.filename || event?.target?.src || '');
        if (/\/assets\/app-runtime\.js(?:\?|$)/i.test(source)) void root.recoverAppLoadFailure('runtime-script-error');
    }, true);

    const armRuntimeRecovery = () => {
        if (root.__AGDATA_RUNTIME_READY__ === true || runtimeRecoveryTimer) return;
        runtimeRecoveryTimer = root.setTimeout(() => {
            runtimeRecoveryTimer = null;
            if (root.__AGDATA_RUNTIME_READY__ !== true && !isAuthTransitionActive() && !activeSession()) {
                void root.recoverAppLoadFailure('runtime-not-ready');
            }
        }, 8000);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', armRuntimeRecovery, { once: true });
    else armRuntimeRecovery();

    root.registerGncServiceWorkerSafely = async (serviceWorker, scriptUrl, options, handlers = {}) => {
        const unavailable = reason => {
            try { handlers.onUnavailable?.(reason); } catch (error) { globalThis.GncRuntimeWatchdog?.capture?.(error, 'app-lifecycle');}
            return null;
        };
        if (typeof serviceWorker?.register !== 'function') return unavailable('registration-api-unavailable');
        try {
            const registrationPromise = serviceWorker.register(scriptUrl, options);
            if (!registrationPromise || typeof registrationPromise.then !== 'function') {
                return unavailable('registration-promise-unavailable');
            }
            const registration = await root.withBootDeadline(registrationPromise);
            if (!registration || typeof registration !== 'object') return unavailable('registration-result-unavailable');
            return registration;
        } catch (error) {
            try { handlers.onError?.(error); } catch (error) { globalThis.GncRuntimeWatchdog?.capture?.(error, 'app-lifecycle');}
            return null;
        }
    };

    // Available before the application runtime, including when an old runtime fails.
    // CacheStorage contains downloaded assets; IndexedDB contains unsent field work.
    root.recoverShellVersionMismatch = (...builds) => root.requestLiveAppUpdate?.(builds[1], { reason: 'worker-version-mismatch' }) || Promise.resolve(false);
}
