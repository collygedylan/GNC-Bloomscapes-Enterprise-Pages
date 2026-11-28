import { createAuraVoiceSession } from "../../../services/auraVoiceService.js?v=AgData%20v3.1.85";
import { parseAuraIntent } from "../../../utils/auraIntentParser.js?v=AgData%20v3.1.85";
import { acceptsAuraFollowUp, reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";

function joinedResults(results) {
  const spans = [];
  let text = "";
  results.forEach((result, index) => {
    const transcript = String(result.transcript ?? "").trim();
    if (!transcript) return;
    if (text) text += " ";
    const start = text.length;
    text += transcript;
    spans.push({ start, end: text.length, isFinal: result.isFinal === true, index });
  });
  return { text, spans };
}

function recognitionCommand(widget, fullText, activatedByTap) {
  const wake = fullText.match(/\b(?:hey|okay)\s+aura\b[\s,:-]*/i);
  const start = wake ? wake.index + wake[0].length : 0;
  if (activatedByTap || wake) {
    widget.wakeArmed = !activatedByTap;
    if (widget.wakeArmed) widget.renderStatus();
    if (!widget.panelOpen) widget.togglePanel(true);
    return { text: fullText.slice(start).trim(), start };
  }
  if (widget.wakeArmed || acceptsAuraFollowUp(widget.conversation) || widget.conversation.auraMode === "CHOOSING") {
    return { text: fullText, start };
  }
  return null;
}

function handleRecognition(widget, { results = [], text = "", previewText = null, epoch = null, recognitionId = null, recognitionMode: resultMode = null, handsFree = false, tapToTalk = false } = {}) {
  if (!widget.current()) return;
  if (handsFree) { widget.handleHandsFreeRecognition({ results, text, previewText, recognitionId }); return; }
  epoch = recognitionId ?? epoch;
  if (widget.recognitionEpoch !== epoch) {
    widget.recognitionEpoch = epoch;
    widget.lastConsumedResultIndex = -1;
    widget.wakeArmed = false;
  }
  // SpeechRecognition repeats its accumulated result list. Work only on the
  // unconsumed suffix so replaying the same final event cannot execute twice.
  const freshStart = Math.max(0, widget.lastConsumedResultIndex + 1);
  const freshResults = results.slice(freshStart);
  if (results.length && !freshResults.length) return;
  const stream = widget.joinedResults(freshResults);
  const fullText = resultMode === "browser" ? String(previewText ?? text).trim() : stream.text || String(text ?? "").trim();
  if (resultMode === "browser") widget.input.value = fullText.replace(/^.*?\b(?:hey|okay)\s+aura\b[\s,:-]*/i, "").trim();
  if (!fullText) return;

  // Browser speech and local tap-to-talk each have one explicit activation.
  const command = recognitionCommand(widget, fullText, resultMode === "browser" || tapToTalk);
  if (!command) return;
  const { text: commandText, start: commandStart } = command;
  const numericChoice = widget.conversation.auraMode === "CHOOSING" && /^[1-5]$/.test(commandText);
  widget.input.value = commandText;
  // Browser results are previews. The service completes the whole turn on
  // speech end, including an explicitly marked interim-only fallback.
  if (resultMode === "browser") return;
  if (!commandText || (commandText.length < 2 && !numericChoice)) return;
  const commandSpans = stream.spans.filter((span) => span.end > commandStart);
  if (!commandSpans.length || !commandSpans.every((span) => span.isFinal)) return;
  const recognizedIntent = parseAuraIntent(commandText, { auraMode: widget.conversation.auraMode });
  if (widget.busy && recognizedIntent.type !== "CANCEL_REQUEST") return;

  const finalIndexes = commandSpans.filter((span) => span.isFinal).map((span) => span.index + freshStart);
  if (finalIndexes.length) widget.lastConsumedResultIndex = Math.max(...finalIndexes);
  widget.wakeArmed = false;
  widget.renderStatus();
  widget.input.value = commandText;
  void widget.submitCommand(commandText, { source: "voice" });
}

function armInactivityPause(widget) {
  if (widget.inactivityTimer != null) clearTimeout(widget.inactivityTimer);
  widget.inactivityTimer = setTimeout(() => {
    widget.inactivityTimer = null;
    if (widget.current() && (widget.session.enabled || widget.conversation.auraMode !== "IDLE")) {
      widget.session.stop();
      void widget.queryPanel?.cancel();
      widget.commandController?.abort();
      widget.commandController = null;
      widget.busy = false;
      widget.setRecognitionBusy(false);
      if (widget.conversation.auraMode !== "IDLE") widget.conversation = reduceAuraConversation(widget.conversation, { type: "PAUSE" });
      widget.renderCartControls();
      widget.voiceStatus = { status: "paused", message: "Paused after two quiet minutes. Tap Resume to listen again." };
      widget.renderStatus();
      widget.setMessage("Paused after two quiet minutes. Tap Resume to continue your request.");
      if (!widget.panelOpen) widget.togglePanel(true);
    }
  }, 120_000);
}

function onMicClick(widget) {
  if (!widget.current() || widget.busy || widget.audioOwners.size) return;
  widget.prepareWakeAudio();
  if (widget.session.enabled && widget.handsFreeEnabled) {
    widget.handsFreeEnabled = false; widget.clearHandsFreeTimers(); widget.session.stop();
    void widget.session.startTapToTalk(); widget.armInactivityPause();
  }
  else if (widget.session.enabled) { widget.handsFreeEnabled = false; widget.clearHandsFreeTimers(); widget.session.stop(); if (widget.inactivityTimer != null) clearTimeout(widget.inactivityTimer); widget.inactivityTimer = null; }
  else {
    widget.handsFreeEnabled = false;
    if (widget.conversation.auraMode === "PAUSED") widget.conversation = reduceAuraConversation(widget.conversation, { type: "RESUME" });
    if (widget.conversation.auraMode === "CHOOSING" && widget.conversation.choice) widget.renderChoiceButtons(widget.conversation.choice.items, widget.selectChoice);
    widget.renderCartControls();
    void widget.session.startTapToTalk(); widget.armInactivityPause();
  }
}

function setRecognitionBusy(widget, value) { widget.session.setBusy(Boolean(value) || widget.audioOwners.size > 0); }

function startVoiceSession(widget) {
  widget.session = createAuraVoiceSession({
    onState: (next) => {
      widget.options.onVoiceActivity(["listening", "hearing", "speaking", "starting"].includes(next?.status));
      widget.voiceStatus = next;
      if (Object.prototype.hasOwnProperty.call(next || {}, "recognitionMode")) {
        if (next.recognitionMode === "local" || next.recognitionMode === "browser") {
          widget.recognitionMode = next.recognitionMode;
        }
      }
      widget.renderVoiceMode();
      widget.renderStatus();
    },
    onRecognition: widget.handleRecognition,
    onTranscript: (text, metadata = {}) => {
      if (metadata.recognitionMode !== "browser" || !widget.current()) return;
      if (widget.completedBrowserRecognitionId === metadata.recognitionId) return;
      widget.completedBrowserRecognitionId = metadata.recognitionId;
      if (metadata.handsFree) return;
      const command = String(text || "").replace(/^.*?\b(?:hey|okay)\s+aura\b[\s,:-]*/i, "").trim();
      widget.input.value = command;
      if (command && (!widget.busy || /^(?:stop|cancel(?: that)?|never\s?mind)$/i.test(command))) void widget.submitCommand(command, { source: "voice" });
    },
  });
  void widget.session.prepare();
}

/**
 * Bind transcription and pause handling to the mounted voice session.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraRecognition(widget) {
  return {
    joinedResults,
    handleRecognition: handleRecognition.bind(null, widget),
    armInactivityPause: armInactivityPause.bind(null, widget),
    onMicClick: onMicClick.bind(null, widget),
    setRecognitionBusy: setRecognitionBusy.bind(null, widget),
    startVoiceSession: startVoiceSession.bind(null, widget),
  };
}
