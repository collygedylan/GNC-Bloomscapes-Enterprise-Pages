import { GEMINI_VOICES } from "./primitives.js?v=AgData%20v3.1.85";
import { createAuraGeminiSpeech } from "../../../services/auraGeminiSpeech.js?v=AgData%20v3.1.85";

function speakReply(widget, text, identity) {
  if (widget.audioOwners.size || !widget.voiceReplyMode || !widget.handsFreeEnabled && !widget.panelOpen) return false;
  if (widget.geminiSpeech && identity) { widget.speechNote.textContent = ""; void widget.geminiSpeech.speak(identity); return true; }
  return widget.session.speak(String(text || ""));
}

function cancelAuraSpeech(widget) { widget.geminiSpeech?.cancel(); widget.session.cancelSpeech({ resume: widget.audioOwners.size === 0 }); }

async function setVoicePreference(widget, value) {
  if (!widget.current() || !GEMINI_VOICES.includes(value) || typeof widget.options.requestAssistant !== "function") throw new Error("AURA voice is unavailable.");
  widget.voicePreferenceController?.abort();
  const controller = new AbortController(); widget.voicePreferenceController = controller;
  try {
    const response = await widget.options.requestAssistant({ mode: "voice_preferences", voiceName: value }, { signal: controller.signal });
    if (controller.signal.aborted || !widget.current()) throw new DOMException("Cancelled", "AbortError");
    if (!response?.ok || !GEMINI_VOICES.includes(response.voiceName)) throw new Error("AURA voice could not be saved.");
    widget.voiceName = response.voiceName; widget.voiceSelector.value = widget.voiceName; widget.speechNote.textContent = ""; widget.options.onVoicePreferenceChange(); return widget.voiceName;
  } catch (error) {
    if (widget.current() && !controller.signal.aborted) widget.speechNote.textContent = "Voice preference could not be saved. Please try again.";
    throw error;
  } finally { if (widget.voicePreferenceController === controller) widget.voicePreferenceController = null; }
}

function setHandsFreeAutoStart(widget, enabled) {
  widget.handsFreeAutostartEnabled = Boolean(enabled);
  try { if (widget.handsFreeStorageKey) window.localStorage.setItem(widget.handsFreeStorageKey, String(widget.handsFreeAutostartEnabled)); } catch { /* Storage can be disabled. */ }
  try { widget.options.onHandsFreePreferenceChange(widget.handsFreeAutostartEnabled); } catch { /* Settings synchronization is optional. */ }
  if (widget.handsFreeAutostartEnabled) widget.startHandsFreeFromGesture();
  else { widget.handsFreeEnabled = false; widget.clearHandsFreeTimers(); widget.session.stop(); }
  return widget.handsFreeAutostartEnabled;
}

function announcePlayback(widget, state) {
  widget.assistantState = state;
  widget.renderStatus();
  widget.options.onAssistantState(widget.assistantState);
  widget.options.onVoiceActivity(state === "responding");
}

function claimGeminiAudio(widget, owner) {
  const release = widget.audioCoordinator.claim(owner);
  announcePlayback(widget, "responding");
  return () => {
    if (widget.current()) announcePlayback(widget, "idle");
    release();
  };
}

function createGeminiVoice(widget) {
  widget.geminiSpeech = null;
  if (widget.options.voiceEngine !== "gemini-tts-v1" || typeof widget.options.requestAssistant !== "function") return;
  widget.geminiSpeech = createAuraGeminiSpeech({
    request: widget.options.requestAssistant,
    isCurrent: widget.current,
    getAudioContext: () => widget.wakeAudioContext,
    claimAudio: owner => claimGeminiAudio(widget, owner),
    onError: text => { if (widget.current()) widget.speechNote.textContent = text; },
  });
}

function publishAudioCoordinator(widget) {
  widget.audioCoordinator = {
    claim(owner = "external") {
      const key = String(owner);
      const wasEmpty = widget.audioOwners.size === 0;
      widget.audioOwners.add(key);
      if (wasEmpty) { widget.clearHandsFreeTimers(); widget.suspendWakeAudio(); widget.session.stop(); }
      return () => widget.audioCoordinator.release(key);
    },
    release(owner = "external") {
      widget.audioOwners.delete(String(owner));
      if (!widget.audioOwners.size) { widget.setRecognitionBusy(widget.busy); widget.resumeWakeAudio(); widget.resumeHandsFree(); }
    },
  };
  try { window.GncAuraAudio = widget.audioCoordinator; } catch { /* Exposed only where a window exists. */ }
}

/**
 * Bind speech playback, preferences and audio ownership.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraSpeech(widget) {
  return {
    speakReply: speakReply.bind(null, widget),
    cancelAuraSpeech: cancelAuraSpeech.bind(null, widget),
    setVoicePreference: setVoicePreference.bind(null, widget),
    setHandsFreeAutoStart: setHandsFreeAutoStart.bind(null, widget),
    createGeminiVoice: createGeminiVoice.bind(null, widget),
    publishAudioCoordinator: publishAudioCoordinator.bind(null, widget),
  };
}
