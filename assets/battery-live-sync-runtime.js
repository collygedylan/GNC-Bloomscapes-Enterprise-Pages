function batteryRuntimeError(error) {
    if (error?.name !== 'AbortError') globalThis.reportHandledRuntimeIssue?.('battery_live_sync', error?.code || 'READ_FAILED');
}

async function requestBatteryMediaStream(constraints) {
    const governor = window.BloomscapesBatteryGovernor;
    const signal = governor.signal();
    if (!governor.visible()) throw new DOMException('Recording paused while hidden.', 'AbortError');
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (signal.aborted || !governor.visible()) {
        stream.getTracks().forEach(track => track.stop());
        throw new DOMException('Recording paused while hidden.', 'AbortError');
    }
    return stream;
}

async function checkBatteryActiveView({ signal }) {
    if (!currentUser || signal.aborted || !window.BloomscapesBatteryGovernor.visible()) return false;
    return runBatteryRevisionSync(signal);
}

function pauseBatteryMedia() {
    stopBloomscapesWalkie(true);
    for (const capture of [...bloomscapesRadioCaptures]) endBloomscapesTransmission(capture);
    void stopChatVoiceRecorderStream().catch(batteryRuntimeError);
    stopGrowerScoutRecorderStream();
    clearInterval(inventoryGalleryDeepLinkFocusTimer);
    inventoryGalleryDeepLinkFocusTimer = null;
    clearTimeout(appSessionHousekeepingTimer);
    appSessionHousekeepingTimer = null;
    releaseBloomscapesCommAudio();
    suspendBloomscapesCommChirps();
    pauseBloomscapesCommunicationChannels();
}

async function resumeBatteryAuthRefresh() {
    if (!window.BloomscapesBatteryGovernor.visible()) return;
    const auth = getSupabaseBrowserClient()?.auth;
    await auth?.startAutoRefresh();
    if (!window.BloomscapesBatteryGovernor.visible()) await auth?.stopAutoRefresh();
}

function resumeBatteryMedia() {
    void resumeBatteryAuthRefresh().catch(batteryRuntimeError);
    connectBatteryRealtime();
    if (nativeAuthSessionActive && currentUser) void connectBloomscapesRadioInbox(false).catch(batteryRuntimeError);
}

function installBatteryLiveSyncRuntime() {
    const governor = window.BloomscapesBatteryGovernor;
    governor.setWakeHandler(checkBatteryActiveView);
    subscribeBatteryRealtime('revision-pulse', queueBatteryRevisionEvents);
    installMandatoryWalkiePush();
    window.AgMetricLifecycle.subscribe(({type}) => { if (type === 'view') releaseSavedDetailPreviewUrls(); });
    governor.register('media', { pause: pauseBatteryMedia, resume: resumeBatteryMedia });
    governor.schedule('active-revision', signal => checkBatteryActiveView({ signal, reason: 'tick' }));
    window.addEventListener('gnc-user-access-change', () => void governor.wake('access'));
}
