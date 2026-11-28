function prepareWakeAudio(widget) {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    widget.wakeAudioContext ||= new AudioContextCtor();
    if (widget.wakeAudioContext.state === "suspended") void widget.wakeAudioContext.resume().catch(() => {});
  } catch { /* Audio feedback is optional. */ }
}

function playWakeChime(widget) {
  try {
    widget.prepareWakeAudio();
    const context = widget.wakeAudioContext;
    if (!context) return;
    const now = context.currentTime;
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.1 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.11);
      oscillator.connect(gain); gain.connect(context.destination);
      widget.activeWakeOscillators.add(oscillator);
      oscillator.onended = () => widget.activeWakeOscillators.delete(oscillator);
      oscillator.start(now + index * 0.1); oscillator.stop(now + index * 0.1 + 0.12);
    }
  } catch { /* Wake feedback is optional on restricted browsers. */ }
}

function submitHandsFreeCommand(widget, command) {
  if (!widget.handsFreeEnabled || !widget.current() || !command || widget.busy || document.visibilityState !== "visible" || widget.audioOwners.size) return;
  widget.handsFreeWakeAt = 0;
  widget.handsFreeCommand = "";
  widget.wakeArmed = false;
  clearTimeout(widget.handsFreeQuietTimer); widget.handsFreeQuietTimer = null;
  clearTimeout(widget.handsFreeWakeTimer); widget.handsFreeWakeTimer = null;
  clearTimeout(widget.handsFreeCaptureTimer); widget.handsFreeCaptureTimer = null;
  widget.input.value = command;
  widget.renderStatus();
  void widget.submitCommand(command, { source: "voice" });
}

function findHandsFreeWake(fullText, results, recognitionId) {
  const wakePattern = /\b(?:hey|okay)\s+aura\b[\s,:-]*/ig;
  let wake = null, match;
  while ((match = wakePattern.exec(fullText)) !== null) wake = match;
  let wakeResultIndex = 0;
  if (wake && results.length) {
    let accumulated = "";
    for (const [index, result] of results.entries()) {
      accumulated += ` ${String(result?.transcript || "").trim()}`;
      if (accumulated.length >= wake.index + wake[0].length) { wakeResultIndex = index; break; }
    }
  }
  const wakePhrase = wake ? fullText.slice(wake.index).match(/^(?:hey|okay)\s+aura/i)?.[0].toLowerCase() || "" : "";
  const wakeKey = wake ? `${recognitionId}:${wakeResultIndex}:${wakePhrase}` : "";
  return { wake, wakeKey };
}

function armHandsFreeCapture(widget, wakeKey) {
  widget.handsFreeWakeAt = Date.now();
  widget.handsFreeCommand = "";
  widget.consumedHandsFreeWakeKeys.add(wakeKey);
  if (widget.consumedHandsFreeWakeKeys.size > 50) widget.consumedHandsFreeWakeKeys.delete(widget.consumedHandsFreeWakeKeys.values().next().value);
  widget.wakeArmed = true;
  widget.playWakeChime();
  if (!widget.panelOpen) widget.togglePanel(true);
  clearTimeout(widget.handsFreeWakeTimer);
  clearTimeout(widget.handsFreeCaptureTimer);
  widget.handsFreeWakeTimer = setTimeout(() => {
    if (widget.handsFreeWakeAt && !widget.handsFreeCommand) {
      widget.clearHandsFreeTimers(); widget.renderStatus();
    }
  }, 8000);
  widget.handsFreeCaptureTimer = setTimeout(() => {
    widget.clearHandsFreeTimers(); widget.renderStatus();
  }, 30_000);
}

function handleHandsFreeRecognition(widget, { results = [], previewText = null, text = "", recognitionId = "" } = {}) {
  if (!widget.handsFreeEnabled || !widget.current()) return;
  const fullText = String(previewText ?? text).trim();
  if (!fullText) return;
  clearTimeout(widget.handsFreeQuietTimer); widget.handsFreeQuietTimer = null;
  const eventGeneration = ++widget.handsFreeResultGeneration;
  const { wake, wakeKey } = findHandsFreeWake(fullText, results, recognitionId);
  if (wake && !widget.handsFreeWakeAt && wakeKey && !widget.consumedHandsFreeWakeKeys.has(wakeKey)) armHandsFreeCapture(widget, wakeKey);
  if (!widget.handsFreeWakeAt) return;
  const marker = wake || fullText.match(/\b(?:hey|okay)\s+aura\b[\s,:-]*/i);
  if (!marker) return;
  const command = fullText.slice(marker.index + marker[0].length).trim();
  if (!command) return;
  clearTimeout(widget.handsFreeWakeTimer);
  widget.handsFreeWakeTimer = setTimeout(() => {
    if (widget.handsFreeWakeAt) { widget.clearHandsFreeTimers(); widget.renderStatus(); }
  }, 8000);
  widget.handsFreeCommand = command;
  widget.input.value = command;
  const relevant = results.filter(result => String(result?.[0]?.transcript || result?.transcript || "").trim());
  if (!relevant.length || !relevant.every(result => result.isFinal === true)) return;
  const finalizedCommand = command;
  widget.handsFreeQuietTimer = setTimeout(() => {
    if (eventGeneration === widget.handsFreeResultGeneration && finalizedCommand === widget.handsFreeCommand) widget.submitHandsFreeCommand(finalizedCommand);
  }, 800);
}

function suspendWakeAudio(widget) {
  for (const oscillator of widget.activeWakeOscillators) { try { oscillator.stop(); } catch { /* Already ended. */ } }
  widget.activeWakeOscillators.clear();
  try { if (widget.wakeAudioContext?.state === "running") void widget.wakeAudioContext.suspend().catch(() => {}); } catch { /* Optional audio resource. */ }
}

function resumeWakeAudio(widget) {
  try { if (widget.wakeAudioContext?.state === "suspended") void widget.wakeAudioContext.resume().catch(() => {}); } catch { /* Optional audio resource. */ }
}

function clearHandsFreeTimers(widget) {
  for (const timer of [widget.handsFreeQuietTimer, widget.handsFreeWakeTimer, widget.handsFreeCaptureTimer]) if (timer != null) clearTimeout(timer);
  widget.handsFreeQuietTimer = widget.handsFreeWakeTimer = widget.handsFreeCaptureTimer = null;
  widget.handsFreeWakeAt = 0; widget.handsFreeCommand = ""; widget.wakeArmed = false;
}

function resumeHandsFree(widget) {
  if (!widget.handsFreeEnabled || widget.destroyed || !widget.current() || document.visibilityState !== "visible" || widget.audioOwners.size || widget.busy) return false;
  void widget.session.startHandsFree();
  return true;
}

function startHandsFreeFromGesture(widget) {
  if (widget.destroyed || !widget.current() || widget.busy || document.visibilityState !== "visible" || widget.audioOwners.size) return false;
  const wasHandsFree = widget.handsFreeEnabled;
  widget.handsFreeEnabled = true;
  widget.prepareWakeAudio();
  if (widget.inactivityTimer != null) clearTimeout(widget.inactivityTimer);
  widget.inactivityTimer = null;
  // Keep the call in the trusted event stack so browsers can grant mic access.
  if (!wasHandsFree && widget.session.enabled) widget.session.stop();
  void widget.session.startHandsFree();
  return true;
}

function onFirstTrustedGesture(widget, event) {
  if (!widget.handsFreeAutostartEnabled || event.isTrusted !== true || document.visibilityState !== "visible" || widget.audioOwners.size || widget.busy || !widget.current()) return;
  document.removeEventListener("pointerdown", widget.onFirstTrustedGesture, true);
  document.removeEventListener("keydown", widget.onFirstTrustedGesture, true);
  document.removeEventListener("touchstart", widget.onFirstTrustedGesture, true);
  widget.startHandsFreeFromGesture();
}

/**
 * Bind per-mount wake, gesture and microphone controls.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraWake(widget) {
  return {
    prepareWakeAudio: prepareWakeAudio.bind(null, widget),
    playWakeChime: playWakeChime.bind(null, widget),
    submitHandsFreeCommand: submitHandsFreeCommand.bind(null, widget),
    handleHandsFreeRecognition: handleHandsFreeRecognition.bind(null, widget),
    suspendWakeAudio: suspendWakeAudio.bind(null, widget),
    resumeWakeAudio: resumeWakeAudio.bind(null, widget),
    clearHandsFreeTimers: clearHandsFreeTimers.bind(null, widget),
    resumeHandsFree: resumeHandsFree.bind(null, widget),
    startHandsFreeFromGesture: startHandsFreeFromGesture.bind(null, widget),
    onFirstTrustedGesture: onFirstTrustedGesture.bind(null, widget),
  };
}
