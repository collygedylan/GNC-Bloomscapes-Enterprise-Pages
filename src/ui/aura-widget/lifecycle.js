import { createAuraConversation, reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

function current(widget) {
  if (widget.destroyed || !widget.options.isAuthorized()) {
    widget.destroy();
    return false;
  }
  return true;
}

function destroy(widget) {
  if (widget.destroyed) return;
  widget.destroyed = true; widget.session.stop();
  widget.geminiSpeech?.destroy(); widget.voicePreferenceController?.abort();
  widget.queryPanel?.destroy();
  widget.commandController?.abort();
  widget.commandController = null;
  widget.busy = false;
  widget.pendingChoice = null;
  widget.pendingIntent = null;
  widget.pendingRows = [];
  widget.matchCache.clear();
  widget.idempotencyKeys.clear();
  widget.conversation = createAuraConversation();
  widget.partyRef = null;
  widget.input.value = "";
  widget.message.textContent = "";
  if (widget.inactivityTimer != null) clearTimeout(widget.inactivityTimer);
  document.removeEventListener("visibilitychange", widget.onWidgetVisibilityChange);
  document.removeEventListener("pointerdown", widget.onFirstTrustedGesture, true);
  document.removeEventListener("keydown", widget.onFirstTrustedGesture, true);
  document.removeEventListener("touchstart", widget.onFirstTrustedGesture, true);
  widget.clearHandsFreeTimers();
  try { if (widget.wakeAudioContext) void widget.wakeAudioContext.close().catch(() => {}); } catch { /* Optional audio resource. */ }
  widget.session.destroy();
  if (window.GncAuraAudio === widget.audioCoordinator) delete window.GncAuraAudio;
  widget.fab.removeEventListener("click", widget.onAuraToggle);
  widget.fab.disabled = true;
  widget.fab.setAttribute("aria-expanded", "false");
  widget.fab.removeAttribute("data-microphone-active");
  widget.root.remove();
  if (widget.ownsStyle) widget.style?.remove();
}

function openVoice(widget, text = "") {
  if (widget.destroyed || !widget.current() || widget.busy || widget.audioOwners.size || document.visibilityState !== "visible") return false;
  widget.togglePanel(true); widget.voiceReplyMode = true; widget.prepareWakeAudio();
  if (String(text).trim()) { widget.input.value = String(text).trim(); void widget.submitCommand(widget.input.value, { source: "voice" }); }
  else void widget.session.startTapToTalk();
  return true;
}

function onSubmit(widget, event) {
  event.preventDefault();
  const value = widget.input.value.trim();
  if (!value) return;
  widget.submitCommand(value);
}

function onWidgetVisibilityChange(widget) {
  if (document.visibilityState === "hidden") {
    widget.clearHandsFreeTimers();
    widget.suspendWakeAudio();
    void widget.queryPanel?.cancel();
    widget.session.stop();
    widget.commandController?.abort();
    widget.commandController = null;
    widget.busy = false;
    widget.setRecognitionBusy(false);
    widget.wakeArmed = false;
    if (widget.conversation.auraMode !== "IDLE") widget.conversation = reduceAuraConversation(widget.conversation, { type: "PAUSE" });
    if (widget.inactivityTimer != null) clearTimeout(widget.inactivityTimer);
    widget.inactivityTimer = null;
    widget.renderCartControls();
  } else { widget.resumeWakeAudio(); if (widget.handsFreeEnabled) widget.resumeHandsFree(); }
}

function attachWidgetListeners(widget) {
  widget.onAuraToggle = () => { widget.voiceReplyMode = false; widget.togglePanel(); };
  widget.fab.addEventListener("click", widget.onAuraToggle);
  widget.root.addEventListener("click", () => { widget.voiceReplyMode = false; }, true);
  widget.closeButton.addEventListener("click", () => widget.togglePanel(false));
  widget.inputbar.addEventListener("submit", widget.onSubmit);
  widget.micButton.addEventListener("click", widget.onMicClick);
  document.addEventListener("visibilitychange", widget.onWidgetVisibilityChange);
  document.addEventListener("pointerdown", widget.onFirstTrustedGesture, true);
  document.addEventListener("keydown", widget.onFirstTrustedGesture, true);
  document.addEventListener("touchstart", widget.onFirstTrustedGesture, true);
  widget.renderVoiceMode();
  widget.renderStatus();
}

/**
 * Bind listeners, authorization and teardown to one mount.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraLifecycle(widget) {
  return {
    current: current.bind(null, widget),
    destroy: destroy.bind(null, widget),
    openVoice: openVoice.bind(null, widget),
    onSubmit: onSubmit.bind(null, widget),
    onWidgetVisibilityChange: onWidgetVisibilityChange.bind(null, widget),
    attachWidgetListeners: attachWidgetListeners.bind(null, widget),
  };
}
