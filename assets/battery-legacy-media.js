async function beginChatVoiceRecording(forComposer = false) {
    if (chatVoiceUploadInFlight) {
        showToast('Upload In Progress', 'Wait for the current voice note to finish uploading.', true);
        return false;
    }
    if (!isChatVoiceSupported()) {
        showToast('Voice Notes Unavailable', 'This device does not support in-app voice recording here.', true);
        return false;
    }
    if (navigator.onLine === false) {
        showToast('Offline', 'Reconnect before recording a voice note.', true);
        return false;
    }
    if (!forComposer && !activeChatConversationId) {
        showToast('Open Chat', 'Choose a conversation first.', true);
        return false;
    }
    const mimeType = getSupportedChatVoiceMimeType();
    try {
        const stream = await requestBatteryMediaStream({ audio: true, video: false });
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chatVoiceRecorderStream = stream;
        chatVoiceRecorder = recorder;
        chatVoiceChunks = [];
        chatVoiceRecordingForComposer = !!forComposer;
        chatVoiceRecordingActive = true;
        chatVoiceRecordingStartAt = Date.now();
        chatVoiceRecordMimeType = mimeType || recorder.mimeType || 'audio/webm';
        recorder.ondataavailable = (event) => {
            if (event && event.data && event.data.size > 0) chatVoiceChunks.push(event.data);
        };
        recorder.onerror = () => {
            showToast('Voice Note Error', 'Recording stopped unexpectedly.', true);
            resetChatVoiceRecording({ preserveRecorder: false }).catch(() => {});
        };
        recorder.start();
        clearChatVoiceRecordTimer();
        updateChatVoiceRecordingUi();
        syncChatVoiceRecordTimerVisibility();
        chatLastRenderSignature = '';
        renderChat();
        return true;
    } catch (error) {
        if (error?.name === 'AbortError') return false;
        showToast('Microphone Blocked', 'Allow microphone access to send voice notes.', true);
        await resetChatVoiceRecording({ preserveRecorder: false });
        return false;
    }
}


async function startGrowerScoutRecording(event = null) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (growerScoutRecordingActive) return stopGrowerScoutRecording(event);
    if (!isGrowerScoutAudioSupported()) {
        showToast('Voice Unavailable', 'This device does not support in-app recording here.', true);
        return false;
    }
    if (navigator.onLine === false) {
        showToast('Offline', 'Reconnect before recording a scouting note.', true);
        return false;
    }
    try {
        const mimeType = getGrowerScoutAudioMimeType();
        const stream = await requestBatteryMediaStream({ audio: true, video: false });
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        growerScoutRecorderStream = stream;
        growerScoutRecorder = recorder;
        growerScoutAudioChunks = [];
        growerScoutAudioBlob = null;
        growerScoutAudioDurationSeconds = 0;
        growerScoutRecordMimeType = mimeType || recorder.mimeType || 'audio/webm';
        growerScoutRecordingActive = true;
        growerScoutRecordingStartedAt = Date.now();
        recorder.ondataavailable = (recordEvent) => {
            if (recordEvent && recordEvent.data && recordEvent.data.size > 0) growerScoutAudioChunks.push(recordEvent.data);
        };
        recorder.onerror = () => {
            showToast('Recording Stopped', 'The voice note stopped unexpectedly.', true);
            stopGrowerScoutRecorderStream();
            growerScoutRecordingActive = false;
            clearGrowerScoutRecordingTimer();
            updateGrowerScoutRecordingUi();
        };
        recorder.start(1000);
        clearGrowerScoutRecordingTimer();
        updateGrowerScoutRecordingUi();
        syncGrowerScoutRecordingTimerVisibility();
    } catch (error) {
        if (error?.name === 'AbortError') return false;
        stopGrowerScoutRecorderStream();
        growerScoutRecordingActive = false;
        clearGrowerScoutRecordingTimer();
        showToast('Microphone Blocked', 'Allow microphone access to record scouting notes.', true);
    }
    return false;
}

