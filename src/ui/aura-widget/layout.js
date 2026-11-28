import { make, GEMINI_VOICES } from "./primitives.js?v=AgData%20v3.1.85";

function buildPanelHeader(widget) {
  const head = make("header", "aura-head");
  const standby = make("div");
  standby.id = "aura-standby-control";
  head.append(standby);
  head.append(make("div", "aura-mark", "A"));
  const heading = make("div");
  heading.append(make("div", "aura-title", "AURA"));
  widget.status = make("small", "aura-status", "Ready when you are.");
  heading.append(widget.status);
  widget.voiceMode = make("small", "aura-mode", "Voice input mode not selected");
  widget.voiceMode.setAttribute("aria-live", "polite");
  widget.voiceMode.setAttribute("aria-atomic", "true");
  heading.append(widget.voiceMode);
  head.append(heading);
  const voiceLabel = make("label", "", "AURA Voice ");
  widget.voiceSelector = make("select");
  widget.voiceSelector.setAttribute("aria-label", "AURA Voice");
  for (const name of GEMINI_VOICES) {
    const option = make("option", "", name);
    option.value = name;
    widget.voiceSelector.append(option);
  }
  widget.voiceSelector.value = widget.voiceName;
  widget.voiceSelector.addEventListener("change", () => { void widget.setVoicePreference(widget.voiceSelector.value).catch(() => { widget.voiceSelector.value = widget.voiceName; }); });
  voiceLabel.append(widget.voiceSelector);
  head.append(voiceLabel);
  widget.speechNote = make("span", "aura-note");
  widget.speechNote.setAttribute("aria-live", "polite");
  heading.append(widget.speechNote);
  widget.closeButton = make("button", "aura-close", "×");
  widget.closeButton.type = "button";
  widget.closeButton.setAttribute("aria-label", "Close AURA");
  head.append(widget.closeButton);
  return head;
}

function buildCommandInput(widget) {
  widget.inputbar = make("form", "aura-inputbar");
  widget.input = make("input");
  widget.input.type = "text";
  widget.input.autocomplete = "off";
  widget.input.placeholder = "Type a nursery command…";
  widget.input.setAttribute("aria-label", "Type a command for AURA");
  widget.micButton = make("button", "aura-mic");
  widget.micButton.type = "button";
  widget.micButton.setAttribute("aria-label", "Start voice input");
  widget.micButton.setAttribute("aria-pressed", "false");
  widget.micButton.append(document.createTextNode("🎙"));
  const wave = make("span", "aura-wave");
  wave.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 5; i += 1) wave.append(make("i"));
  widget.micButton.append(wave);
  const sendButton = make("button", "aura-action primary", "Go");
  sendButton.type = "submit";
  widget.inputbar.append(widget.input, widget.micButton, sendButton);
}

function buildVoiceControls(widget) {
  const voiceControls = make("div", "aura-actions aura-chat-toolbar");
  widget.handsFreeButton = make("button", "aura-action", "Hands-Free Mode: Off");
  widget.handsFreeButton.type = "button";
  widget.handsFreeButton.setAttribute("aria-pressed", "false");
  widget.handsFreeButton.addEventListener("click", () => {
    if (widget.handsFreeEnabled) {
      widget.handsFreeEnabled = false;
      widget.clearHandsFreeTimers();
      widget.suspendWakeAudio();
      widget.session.stop();
    } else widget.startHandsFreeFromGesture();
    widget.renderStatus();
  });
  widget.resumeVoiceButton = make("button", "aura-action", "Tap to resume");
  widget.resumeVoiceButton.type = "button";
  widget.resumeVoiceButton.hidden = true;
  widget.resumeVoiceButton.addEventListener("click", widget.startHandsFreeFromGesture);
  voiceControls.append(widget.handsFreeButton, widget.resumeVoiceButton);
  return voiceControls;
}

/**
 * Attach the AURA panel, microphone controls and input to its root.
 * @param {object} widget Mounted AURA instance.
 * @returns {void}
 */
export function mountAuraLayout(widget) {
  widget.panel = make("section", "aura-panel");
  widget.panel.hidden = true;
  widget.panel.setAttribute("aria-label", "AURA assistant");
  const head = buildPanelHeader(widget);
  widget.content = make("div", "aura-content");
  widget.message = make("p", "aura-message", "Ask Aura a question.");
  widget.content.append(widget.message);
  buildCommandInput(widget);
  const voiceControls = buildVoiceControls(widget);
  widget.panel.append(head, voiceControls, widget.content, widget.inputbar);
  widget.root.append(widget.panel);
}
