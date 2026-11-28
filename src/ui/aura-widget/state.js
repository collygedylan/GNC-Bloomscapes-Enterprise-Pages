import { createAuraConversation } from "../../../services/auraConversation.js?v=AgData%20v3.1.85";
import { GEMINI_VOICES } from "./primitives.js?v=AgData%20v3.1.85";

/**
 * Initialize state, including remembered hands-free consent, for one mount.
 * @param {object} widget Mounted AURA instance.
 * @returns {void}
 */
export function initializeAuraState(widget) {
  widget.destroyed = false;
  widget.voiceName = GEMINI_VOICES.includes(widget.options.initialVoiceName) ? widget.options.initialVoiceName : "Kore";
  widget.voicePreferenceController = null;
  widget.panelOpen = false;
  widget.commandController = null;
  widget.pendingIntent = null;
  widget.pendingRows = [];
  widget.pendingChoice = null;
  widget.currentCommandText = "";
  widget.idempotencyKeys = new Map();
  widget.wakeArmed = false;
  widget.recognitionEpoch = null;
  widget.lastConsumedResultIndex = -1;
  widget.conversation = createAuraConversation();
  widget.partyRef = null;
  widget.selectedPrivacyParty = null;
  widget.routerSelection = null;
  widget.matchCache = new Map();
  widget.commandBudgets = new WeakMap();
  widget.explicitReadRetry = false;
  widget.completedBrowserRecognitionId = null;
  widget.busy = false;
  widget.inactivityTimer = null;
  initializeHandsFreeState(widget);
  widget.voiceStatus = { status: "idle", message: "" };
  widget.assistantState = "idle";
  widget.recognitionMode = null;
}

function initializeHandsFreeState(widget) {
  widget.handsFreeQuietTimer = null;
  widget.handsFreeWakeTimer = null;
  widget.handsFreeCaptureTimer = null;
  widget.handsFreeResultGeneration = 0;
  widget.consumedHandsFreeWakeKeys = new Set();
  widget.activeWakeOscillators = new Set();
  widget.wakeAudioContext = null;
  widget.handsFreeEnabled = false;
  widget.handsFreeWakeAt = 0;
  widget.handsFreeCommand = "";
  widget.voiceReplyMode = false;
  widget.audioOwners = new Set();
  widget.handsFreeStorageKey = widget.options.userId ? `aura.handsFree.autostart:${widget.options.userId}` : "";
  const readHandsFreePreference = () => {
    try { return widget.handsFreeStorageKey ? window.localStorage.getItem(widget.handsFreeStorageKey) === "true" : widget.options.handsFreeAutostart === true; }
    catch { return widget.options.handsFreeAutostart === true; }
  };
  widget.handsFreeAutostartEnabled = readHandsFreePreference();
}
