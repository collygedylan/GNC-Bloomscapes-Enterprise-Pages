const BATTERY_IDLE_MS = 45000;

function batteryVisible(state) {
    return !state.stopped && !state.document.hidden && state.document.visibilityState !== 'hidden'
        && state.navigator.onLine !== false;
}

function batteryReport(state, error) {
    if (error?.name !== 'AbortError') state.report(error);
}

function batteryClearTimer(state) {
    if (state.timer !== null) state.cancel(state.timer);
    state.timer = null;
}

function batteryArm(state) {
    batteryClearTimer(state);
    if (!batteryVisible(state) || !state.jobs.size) return;
    const due = Math.min(...Array.from(state.jobs.values(), job => job.nextAt));
    if (!Number.isFinite(due)) return;
    state.timer = state.later(() => batteryTick(state), Math.max(1, due - state.now()));
}

async function batteryRunJob(state, name, job) {
    if (job.running || !batteryVisible(state)) return;
    job.running = true;
    const signal = state.controller.signal;
    try {
        await job.run(signal);
        job.failures = 0;
    } catch (error) {
        job.failures = Math.min(3, job.failures + 1);
        batteryReport(state, error);
    } finally {
        job.running = false;
        if (state.jobs.get(name) === job) {
            job.nextAt = state.now() + Math.min(300000, job.interval * 2 ** job.failures);
        }
        batteryArm(state);
    }
}

function batteryTick(state) {
    state.timer = null;
    if (!batteryVisible(state)) return;
    for (const [name, job] of state.jobs) {
        if (job.nextAt > state.now() || job.running) continue;
        job.nextAt = Infinity;
        void batteryRunJob(state, name, job);
    }
    if ([...state.jobs.values()].some(job => Number.isFinite(job.nextAt))) batteryArm(state);
}

function batterySchedule(state, name, run, interval = BATTERY_IDLE_MS) {
    const existing = state.jobs.get(name);
    if (existing) return existing.cancel;
    const delay = Math.max(BATTERY_IDLE_MS, Number(interval) || BATTERY_IDLE_MS);
    const job = { run, interval: delay, nextAt: state.now() + delay, running: false, failures: 0 };
    job.cancel = () => { state.jobs.delete(name); batteryArm(state); };
    state.jobs.set(name, job);
    batteryArm(state);
    return job.cancel;
}

function batteryPause(state) {
    batteryClearTimer(state);
    state.controller.abort();
    if (state.paused) return;
    state.paused = true;
    for (const resource of state.resources.values()) resource.pause?.();
}

function batteryWake(state, reason = 'visible') {
    if (!batteryVisible(state)) { batteryPause(state); return Promise.resolve(false); }
    if (state.paused) {
        state.paused = false;
        state.controller = new state.AbortController();
        for (const job of state.jobs.values()) job.nextAt = state.now() + job.interval;
        for (const resource of state.resources.values()) resource.resume?.();
    }
    batteryArm(state);
    if (state.flight && !state.flightSignal.aborted) return state.flight;
    if (!state.wake || state.now() < state.nextWakeAt) return Promise.resolve(false);
    state.nextWakeAt = state.now() + 1000;
    const signal = state.controller.signal;
    const token = {};
    state.flightToken = token;
    state.flightSignal = signal;
    state.flight = Promise.resolve().then(() => {
        if (!batteryVisible(state) || signal.aborted) return false;
        return state.wake({ reason, signal });
    }).catch(error => {
        if (!signal.aborted && state.flightToken === token) {
            state.nextWakeAt = state.now() + BATTERY_IDLE_MS;
            batteryReport(state, error);
        }
        return false;
    }).finally(() => { if (state.flightToken === token) state.flight = null; });
    return state.flight;
}

function batteryBind(state, api) {
    const onVisibility = () => { if (!batteryVisible(state)) state.nextWakeAt = 0; void api.wake('visibility'); };
    const onHide = () => { state.stopped = true; batteryPause(state); };
    const onShow = () => { state.stopped = false; void api.wake('pageshow'); };
    const onFocus = () => api.wake('focus');
    const onOnline = () => api.wake('online');
    const listeners = [[state.document, 'visibilitychange', onVisibility],
        [state.window, 'pagehide', onHide], [state.window, 'pageshow', onShow],
        [state.window, 'focus', onFocus], [state.window, 'online', onOnline],
        [state.window, 'offline', onVisibility]];
    for (const [target, event, handler] of listeners) target.addEventListener(event, handler);
    return () => { for (const [target, event, handler] of listeners) target.removeEventListener(event, handler); };
}

function batteryPrewarmAllowed(state) {
    if (!batteryVisible(state) || state.navigator.connection?.saveData === true) return false;
    return !state.battery || state.battery.charging || state.battery.level > 0.25;
}

function createBatteryLiveSyncGovernor(options = {}) {
    const state = { document: options.document || document, window: options.window || window,
        navigator: options.navigator || navigator, now: options.now || Date.now,
        later: options.setTimeout || globalThis.setTimeout.bind(globalThis),
        cancel: options.clearTimeout || globalThis.clearTimeout.bind(globalThis),
        AbortController: options.AbortController || AbortController,
        report: options.report || (error => globalThis.GncRuntimeWatchdog?.captureHandled?.('battery_governor', error)),
        jobs: new Map(), resources: new Map(), timer: null, paused: false, stopped: false,
        flight: null, wake: null, nextWakeAt: 0, battery: null };
    state.controller = new state.AbortController();
    const api = {
        schedule: (name, run, interval) => batterySchedule(state, name, run, interval),
        wake: reason => batteryWake(state, reason),
        visible: () => batteryVisible(state),
        signal: () => state.controller.signal,
        canPrewarm: () => batteryPrewarmAllowed(state),
        setWakeHandler: handler => { state.wake = handler; },
        register(name, resource) {
            state.resources.set(name, resource);
            if (!batteryVisible(state)) resource.pause?.();
            return () => state.resources.delete(name);
        },
        dispose() { state.stopped = true; batteryPause(state); unbind(); state.jobs.clear(); },
        snapshot: () => ({ paused: state.paused, timerActive: state.timer !== null, jobs: state.jobs.size })
    };
    const unbind = batteryBind(state, api);
    if (!batteryVisible(state)) batteryPause(state);
    if (state.navigator.getBattery) {
        void state.navigator.getBattery().then(battery => { state.battery = battery; }).catch(error => batteryReport(state, error));
    }
    return Object.freeze(api);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.BloomscapesBatteryGovernor = createBatteryLiveSyncGovernor();
}
