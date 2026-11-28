import { mountAuraQueryPanel } from "./auraQueryPanel.js?v=AgData%20v3.1.85";
import { make } from "../../src/ui/aura-widget/primitives.js?v=AgData%20v3.1.85";
import { initializeAuraState } from "../../src/ui/aura-widget/state.js?v=AgData%20v3.1.85";
import { mountAuraLayout } from "../../src/ui/aura-widget/layout.js?v=AgData%20v3.1.85";
import { bindAuraDisplay } from "../../src/ui/aura-widget/display.js?v=AgData%20v3.1.85";
import { bindAuraWake } from "../../src/ui/aura-widget/wake.js?v=AgData%20v3.1.85";
import { bindAuraRecognition } from "../../src/ui/aura-widget/recognition.js?v=AgData%20v3.1.85";
import { bindAuraSpeech } from "../../src/ui/aura-widget/speech.js?v=AgData%20v3.1.85";
import { bindAuraLifecycle } from "../../src/ui/aura-widget/lifecycle.js?v=AgData%20v3.1.85";
import { bindAuraCommandBudget } from "../../src/ui/aura-widget/command-budget.js?v=AgData%20v3.1.85";
import { bindAuraRouter } from "../../src/ui/aura-widget/router.js?v=AgData%20v3.1.85";
import { bindAuraDraft } from "../../src/ui/aura-widget/draft.js?v=AgData%20v3.1.85";
import { bindAuraLegacyRow } from "../../src/ui/aura-widget/legacy-row.js?v=AgData%20v3.1.85";
import { bindAuraLegacyCommand } from "../../src/ui/aura-widget/legacy-command.js?v=AgData%20v3.1.85";

const STYLE_ID = "aura-voice-widget-styles";

const CSS = `
[data-aura-root] .aura-head>div{min-width:0;flex:1}[data-aura-root] .aura-head>label{display:flex;flex-direction:column;gap:3px;font-size:11px;flex-shrink:0}[data-aura-root] .aura-head select{max-width:90px;min-height:30px;background:var(--aura-bg);color:var(--aura-text);border:1px solid var(--aura-border);border-radius:7px}
[data-aura-root]{--aura-bg:var(--bg-surface,#0a120e);--aura-text:var(--text-main,#f0fdf4);--aura-muted:var(--text-muted,#b7c8bd);--aura-accent:var(--accent,#22c55e);--aura-border:var(--border-subtle,rgba(34,197,94,.2));color:var(--aura-text);font:500 14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
[data-aura-root] *{box-sizing:border-box}
[data-aura-root] button:focus-visible,[data-aura-root] input:focus-visible{outline:3px solid #4ade80;outline-offset:2px}
/* The persistent footer trigger owns no space above the dock. */
#footer-aura-btn[data-microphone-active="true"]{color:#4ade80;box-shadow:inset 0 0 0 2px #4ade80}
[data-aura-root] .aura-orb{font-size:22px;font-weight:750;letter-spacing:-.08em;text-shadow:0 0 12px rgba(34,197,94,.55)}
[data-aura-root] .aura-panel{position:fixed;z-index:10041;right:max(12px,env(safe-area-inset-right));bottom:calc(var(--mobile-bottom-nav-height,64px) + 8px);width:min(420px,calc(100vw - 24px));max-height:min(72dvh,calc(100dvh - var(--mobile-bottom-nav-height,64px) - 24px),720px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--aura-border);border-radius:20px;color:var(--aura-text);background:var(--aura-bg);background:linear-gradient(145deg,color-mix(in srgb,var(--aura-bg) 94%,white 6%),var(--aura-bg) 58%,color-mix(in srgb,var(--aura-bg) 94%,#16a34a 6%));box-shadow:0 0 0 1px rgba(255,255,255,.1) inset,0 18px 54px rgba(0,0,0,.5),0 0 22px -8px rgba(34,197,94,.2);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
[data-aura-root] .aura-panel[hidden]{display:none}
[data-aura-root] .aura-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--aura-border);background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,0))}
[data-aura-root] .aura-head>div:nth-child(2){flex:1 1 auto;min-width:0}
[data-aura-root] .aura-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(74,222,128,.55);border-radius:12px;color:#4ade80;font-weight:800;box-shadow:0 0 14px -5px rgba(34,197,94,.55)}
[data-aura-root] .aura-title{font-size:15px;font-weight:800;letter-spacing:.12em}[data-aura-root] .aura-status{display:block;color:var(--aura-muted);font-size:12px;letter-spacing:0;font-weight:500}
[data-aura-root] .aura-mode{display:none}
[data-aura-root] .aura-mode[data-mode="local"]{color:var(--aura-text);border-color:rgba(34,197,94,.38)}
[data-aura-root] .aura-mode[data-mode="browser"]{color:var(--aura-text);border-color:rgba(245,158,11,.55);background:rgba(245,158,11,.08)}
[data-aura-root] .aura-close{margin-left:auto;flex:0 0 44px;min-width:44px;width:44px;height:44px;border:1px solid var(--aura-border);border-radius:12px;color:var(--aura-text);background:transparent;cursor:pointer;font-size:20px}
[data-aura-root] .aura-content{min-height:0;padding:14px;overflow:auto;overscroll-behavior:contain}
[data-aura-root] .aura-message{margin:0 0 12px;padding:11px 12px;border:1px solid var(--aura-border);border-radius:12px;background:rgba(255,255,255,.035);color:var(--aura-muted);white-space:pre-wrap}
[data-aura-root] .aura-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--aura-border)}
[data-aura-root] .aura-row>.aura-action{grid-column:1/-1}
[data-aura-root] .aura-row strong{display:block;color:var(--aura-text)}[data-aura-root] .aura-row small{display:block;color:var(--aura-muted);font-size:12px}
[data-aura-root] .aura-num{display:grid;gap:3px;font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
[data-aura-root] .aura-action{min-height:44px;padding:10px 14px;border:1px solid rgba(74,222,128,.65);border-radius:12px;color:var(--aura-text);background:rgba(34,197,94,.12);font:700 13px system-ui,sans-serif;cursor:pointer;max-width:100%;white-space:normal;overflow-wrap:anywhere}
[data-aura-root] .aura-choice{display:block;width:100%;text-align:left;margin:6px 0}
[data-aura-root] .aura-action.primary{color:#052e16;background:#4ade80;border-color:#4ade80}
[data-aura-root] .aura-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
[data-aura-root] .aura-chat-toolbar{padding:0 12px 10px;border-bottom:1px solid var(--aura-border)}
[data-aura-root] .aura-chat-title{display:block;width:100%;font-size:12px;color:var(--aura-muted)}
[data-aura-root] .aura-chat-history p{margin:6px 0;overflow-wrap:anywhere}
[data-aura-root] .aura-chat-history dt{font-size:11px;color:var(--aura-muted)}
[data-aura-root] .aura-chat-history dd{margin:0 0 5px;overflow-wrap:anywhere}
[data-aura-root] .aura-chat-user{border-left:3px solid var(--aura-accent)}
[data-aura-root] .aura-chat-history .aura-action{margin:4px;min-height:44px}
[data-aura-root] .aura-inputbar{display:grid;grid-template-columns:minmax(0,1fr) 48px 48px;gap:8px;padding:12px;border-top:1px solid var(--aura-border);background:rgba(0,0,0,.12)}
[data-aura-root] input{width:100%;min-width:0;min-height:48px;padding:10px 12px;border:1px solid var(--aura-border);border-radius:12px;color:var(--aura-text);background:rgba(0,0,0,.16);font:16px/1.3 system-ui,sans-serif}
[data-aura-root] .aura-mic{position:relative;overflow:hidden;width:48px;height:48px;border:1px solid rgba(74,222,128,.7);border-radius:14px;color:#f0fdf4;background:rgba(34,197,94,.12);cursor:pointer}
[data-aura-root] .aura-mic[aria-pressed="true"]{box-shadow:0 0 16px -2px rgba(34,197,94,.45);background:rgba(34,197,94,.24)}
[data-aura-root] .aura-wave{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:2px;opacity:0;pointer-events:none}
[data-aura-root] .aura-mic[aria-pressed="true"] .aura-wave{opacity:1}[data-aura-root] .aura-wave i{width:2px;height:7px;border-radius:2px;background:#4ade80;animation:aura-wave 700ms ease-in-out infinite alternate}[data-aura-root] .aura-wave i:nth-child(2){animation-delay:100ms}[data-aura-root] .aura-wave i:nth-child(3){animation-delay:200ms}[data-aura-root] .aura-wave i:nth-child(4){animation-delay:300ms}[data-aura-root] .aura-wave i:nth-child(5){animation-delay:400ms}
@keyframes aura-wave{to{height:20px;opacity:.55}}
@media(prefers-reduced-motion:reduce){[data-aura-root] *,[data-aura-root] *::before,[data-aura-root] *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){[data-aura-root] .aura-panel{backdrop-filter:none;-webkit-backdrop-filter:none}}
`;

function attachAuraRoot(widget) {
  widget.root = make("div");
  widget.root.dataset.auraRoot = "";
  widget.fab = document.getElementById("footer-aura-btn");
  if (!widget.fab) return false;
  widget.fab.disabled = false;
  widget.fab.type = "button";
  widget.fab.setAttribute("aria-label", "Open AURA voice assistant");
  widget.fab.setAttribute("aria-expanded", "false");

  widget.options.host.append(widget.root);

  widget.style = document.getElementById(STYLE_ID);
  widget.ownsStyle = !widget.style;
  if (!widget.style) {
    widget.style = make("style");
    widget.style.id = STYLE_ID;
    widget.style.textContent = CSS;
    document.head.append(widget.style);
  }
  return true;
}

function mountQueryPanel(widget) {
  widget.queryPanel = typeof widget.options.requestAssistant === "function" ? mountAuraQueryPanel({
    panel: widget.panel, content: widget.content, input: widget.input, request: widget.options.requestAssistant, isAuthorized: widget.current,
    onAssistantState: value => { widget.assistantState = value; widget.renderStatus(); widget.options.onAssistantState(value); },
    speak: (text, identity) => widget.speakReply(text, identity),
    cancelSpeech: () => widget.cancelAuraSpeech(),
    setBusy: value => { widget.busy = value; widget.setRecognitionBusy(value); widget.renderStatus(); },
    openAction: async action => {
      if (typeof widget.options.openAssistantAction !== "function") throw new Error("Open the relevant app screen to review this request.");
      await widget.options.openAssistantAction(action); widget.togglePanel(false);
    },
  }) : null;
}

function bindWidgetOperations(widget) {
  Object.assign(widget,
    bindAuraDisplay(widget),
    bindAuraWake(widget),
    bindAuraRecognition(widget),
    bindAuraSpeech(widget),
    bindAuraLifecycle(widget),
    bindAuraCommandBudget(widget),
    bindAuraRouter(widget),
    bindAuraDraft(widget),
    bindAuraLegacyRow(widget),
    bindAuraLegacyCommand(widget),
  );
}

/**
 * Mount the AURA voice and query panel for the authorized account.
 * @param {object} [options] Host, capability and application integration callbacks.
 * @returns {object} Controls for the mounted widget and its resources.
 */
export function mountAuraWidget({ host = document.body, requestInventory, requestV2, requestLlm, requestAssistant, openAssistantAction, bindParty, resolveOrderParty, openDraft, saveScout, openOrder, sendMessage, isAuthorized = () => false, userId = "", handsFreeAutostart = false, initialVoiceName = "Kore", voiceEngine = "browser", onVoicePreferenceChange = () => {}, onVoiceActivity = () => {}, onPanelOpenChange = () => {}, onHandsFreePreferenceChange = () => {}, onAssistantState = () => {} } = {}) {
  if (typeof document === "undefined" || !host || !isAuthorized()) return { destroy() {} };
  const widget = { options: {
    host, requestInventory, requestV2, requestLlm, requestAssistant, openAssistantAction, bindParty, resolveOrderParty,
    openDraft, saveScout, openOrder, sendMessage, isAuthorized, userId, handsFreeAutostart, initialVoiceName,
    voiceEngine, onVoicePreferenceChange, onVoiceActivity, onPanelOpenChange, onHandsFreePreferenceChange, onAssistantState,
  } };
  initializeAuraState(widget);
  if (!attachAuraRoot(widget)) return { destroy() {} };
  bindWidgetOperations(widget);
  widget.startVoiceSession();
  mountAuraLayout(widget);
  mountQueryPanel(widget);
  widget.createGeminiVoice();
  widget.publishAudioCoordinator();
  widget.attachWidgetListeners();
  return {
    destroy: widget.destroy,
    openVoice: widget.openVoice,
    getVoicePreference: () => widget.voiceName,
    setVoicePreference: widget.setVoicePreference,
    // Starts listening only if microphone permission is already granted; it never prompts.
    startIfAllowed: () => widget.session.startIfAllowed(),
    startHandsFreeFromGesture: widget.startHandsFreeFromGesture,
    getHandsFreeAutoStart: () => widget.handsFreeAutostartEnabled,
    setHandsFreeAutoStart: widget.setHandsFreeAutoStart,
    claimAudio: widget.audioCoordinator.claim,
    releaseAudio: widget.audioCoordinator.release,
  };
}

export default mountAuraWidget;
