import { acceptsAuraFollowUp, reduceAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";
import { make, formatQuantity } from "./primitives.js?v=AgData%20v3.1.85";

function setMessage(widget, text) {
  widget.message.textContent = text;
  widget.content.scrollTop = widget.content.scrollHeight;
}

function renderVoiceMode(widget) {
  if (widget.recognitionMode === "local") {
    widget.voiceMode.textContent = "On-device speech";
    widget.voiceMode.dataset.mode = "local";
  } else if (widget.recognitionMode === "browser") {
    widget.voiceMode.textContent = "Browser speech — tap per command · may use network";
    widget.voiceMode.dataset.mode = "browser";
  } else {
    widget.voiceMode.textContent = "Voice input mode not selected";
    widget.voiceMode.dataset.mode = "unknown";
  }
}

function statusMode(widget, micOpen) {
  if (widget.assistantState === "processing") return "processing";
  if (widget.assistantState === "responding" || widget.voiceStatus.status === "speaking") return "responding";
  if (widget.busy || widget.voiceStatus.status === "hearing") return "processing";
  return micOpen || widget.wakeArmed || widget.voiceStatus.status === "listening" ? "listening" : "idle";
}

function statusText(widget, micOpen) {
  if (widget.status.dataset.state === "processing") return "Processing…";
  if (widget.status.dataset.state === "responding") return "Responding…";
  if (widget.handsFreeEnabled && widget.wakeArmed) return "Listening for your command…";
  if (widget.handsFreeEnabled && micOpen) return "Hands-free listening";
  if (widget.status.dataset.state === "listening") return "Listening…";
  if (widget.voiceStatus.status === "idle" && widget.recognitionMode === "browser") return "Tap mic to speak";
  if (widget.voiceStatus.status === "error" || widget.voiceStatus.status === "unavailable") return widget.voiceStatus.message || "Voice unavailable. Tap mic to retry.";
  if (widget.voiceStatus.status === "paused") return "Paused while app is hidden";
  if (widget.voiceStatus.status === "speaking") return "Aura responding…";
  if (widget.voiceStatus.status === "hearing") return "Checking request…";
  if (widget.voiceStatus.status === "listening") return widget.handsFreeEnabled ? "Hands-free listening" : "Listening…";
  if (widget.voiceStatus.status === "starting") return "Starting voice…";
  if (widget.voiceStatus.status === "restarting") return "Reconnecting…";
  if (widget.voiceStatus.message && !/^checking speech recognition|starting on-device|starting browser|on-device english recognition is ready|using browser speech recognition/i.test(widget.voiceStatus.message)) return widget.voiceStatus.message;
  if (widget.wakeArmed) return "Say your command";
  return "Ready when you are.";
}

function renderStatus(widget) {
  const micOpen = widget.session.listening;
  widget.handsFreeButton.setAttribute("aria-pressed", String(widget.handsFreeEnabled));
  widget.handsFreeButton.textContent = "Hands-Free Mode: " + (widget.handsFreeEnabled ? "On" : "Off");
  widget.resumeVoiceButton.hidden = !widget.handsFreeEnabled || widget.session.enabled || widget.busy || widget.audioOwners.size > 0 || document.visibilityState !== "visible";
  widget.micButton.setAttribute("aria-pressed", micOpen ? "true" : "false");
  widget.fab.dataset.handsFreeListening = String(widget.handsFreeEnabled && micOpen);
  widget.fab.dataset.microphoneActive = String(micOpen);
  widget.status.dataset.state = statusMode(widget, micOpen);
  widget.fab.setAttribute("aria-description", micOpen ? widget.handsFreeEnabled ? "Hands-free microphone is listening" : "Microphone is listening" : "");
  const paused = widget.voiceStatus.status === "paused" || widget.conversation.auraMode === "PAUSED";
  widget.micButton.setAttribute("aria-label", paused ? "Resume voice input" : widget.session.enabled ? "Pause voice input" : "Start voice input");
  widget.status.textContent = statusText(widget, micOpen);
}

function showRows(widget, rows, actionLabel, onChoose) {
  widget.content.querySelectorAll(".aura-row,.aura-actions").forEach((node) => node.remove());
  rows.forEach((row, index) => {
    const card = make("div", "aura-row");
    const details = make("div");
    const name = row.commonname || widget.pendingIntent?.commonName || "Inventory match";
    details.append(make("strong", "", name));
    details.append(make("small", "", `${row.contsize || widget.pendingIntent?.contSize || "Size unavailable"} · ${row.locationcode || "Location unavailable"} · Lot ${row.lotcode || "—"}`));
    const quantities = make("div", "aura-num");
    quantities.append(make("span", "", `AVL ${formatQuantity(row.ptravailable)}`));
    quantities.append(make("span", "", `OH ${formatQuantity(row.ptronhand)}`));
    card.append(details, quantities);
    if (typeof onChoose === "function") {
      const choose = make("button", "aura-action", actionLabel);
      choose.type = "button";
      choose.addEventListener("click", () => onChoose(row, index));
      card.append(choose);
    }
    widget.content.append(card);
  });
}

function chooseCurrentOption(widget, revision, onChoose, index) {
  const selectable = widget.current() && !widget.busy && widget.conversation.auraMode === "CHOOSING"
    && widget.conversation.revision === revision;
  widget.content.querySelectorAll(".aura-choice").forEach((node) => node.remove());
  if (selectable) onChoose(index);
}

function renderChoiceButtons(widget, items, onChoose) {
  widget.content.querySelectorAll(".aura-choice").forEach((node) => node.remove());
  items.slice(0, 5).forEach((item, index) => {
    const label = item.label || item.customerName || `${item.commonname} · ${item.contsize} (${item.itemcode})`;
    const button = make("button", "aura-action aura-choice", `${index + 1}. ${label}`);
    button.type = "button";
    const revision = widget.conversation.revision;
    button.addEventListener("click", () => chooseCurrentOption(widget, revision, onChoose, index), { once: true });
    widget.content.append(button);
  });
}

function renderCartControls(widget) {
  widget.content.querySelectorAll(".aura-cart-controls").forEach((node) => node.remove());
  if (!widget.conversation.party && widget.conversation.auraMode !== "PAUSED" && widget.conversation.auraMode !== "CHOOSING") return;
  const controls = make("div", "aura-cart-controls aura-actions");
  if (widget.conversation.party) {
    controls.append(make("p", "aura-message", `${widget.conversation.lines.length} request line${widget.conversation.lines.length === 1 ? "" : "s"} for ${widget.conversation.party.label || widget.conversation.party.customerName}.`));
    const review = make("button", "aura-action primary", "Review request"); review.type = "button";
    review.disabled = widget.conversation.auraMode !== "BUILDING_REQUEST" || widget.busy;
    review.addEventListener("click", () => void widget.reviewRequest());
    const undo = make("button", "aura-action", "Undo last item"); undo.type = "button";
    undo.disabled = widget.conversation.auraMode !== "BUILDING_REQUEST" || widget.busy || !widget.conversation.history.length;
    undo.addEventListener("click", () => { widget.conversation = reduceAuraConversation(widget.conversation, { type: "UNDO" }); widget.renderCartControls(); widget.setMessage("Last item removed from the draft."); });
    controls.append(review, undo);
  }
  widget.content.append(controls);
  if (widget.conversation.auraMode === "PAUSED") {
    const resume = make("button", "aura-action", "Resume request"); resume.type = "button";
    resume.addEventListener("click", () => {
      if (!widget.current() || widget.busy) return;
      widget.conversation = reduceAuraConversation(widget.conversation, { type: "RESUME" });
      if (widget.conversation.auraMode === "CHOOSING" && widget.conversation.choice) widget.renderChoiceButtons(widget.conversation.choice.items, widget.selectChoice);
      if (acceptsAuraFollowUp(widget.conversation)) {
        void widget.session.startIfAllowed();
        widget.armInactivityPause();
      }
      widget.renderCartControls();
      widget.setMessage(widget.conversation.auraMode === "CHOOSING" ? "Choose an option or say its number." : "Request resumed. Add another item or review it.");
    });
    controls.append(resume);
  }
  widget.renderStatus();
}

function togglePanel(widget, force) {
  widget.panelOpen = typeof force === "boolean" ? force : !widget.panelOpen;
  widget.options.onPanelOpenChange(widget.panelOpen);
  widget.panel.hidden = !widget.panelOpen;
  widget.fab.setAttribute("aria-expanded", String(widget.panelOpen));
  widget.fab.setAttribute("aria-label", widget.panelOpen ? "Close AURA assistant" : "Open AURA voice assistant");
  if (widget.panelOpen) widget.input.focus({ preventScroll: true });
}

/**
 * Bind the AURA panel renderers.
 * @param {object} widget Mounted AURA instance.
 * @returns {object} Bound operations owned by this module.
 */
export function bindAuraDisplay(widget) {
  return {
    setMessage: setMessage.bind(null, widget),
    renderVoiceMode: renderVoiceMode.bind(null, widget),
    renderStatus: renderStatus.bind(null, widget),
    showRows: showRows.bind(null, widget),
    renderChoiceButtons: renderChoiceButtons.bind(null, widget),
    renderCartControls: renderCartControls.bind(null, widget),
    togglePanel: togglePanel.bind(null, widget),
  };
}
