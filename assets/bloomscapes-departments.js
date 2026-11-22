const BLOOMSCAPES_LEGACY_COMMUNICATION=`                    <div class="freeze-panel">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div class="text-xs font-bold text-[#007a4d] uppercase tracking-[0.16em]">Communication</div>
                                <div class="text-xl font-black text-slate-900">Communication</div>
                            </div>
                            <div class="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700">Hub</div>
                        </div>
                    </div>
                    <div id="communication-hub-grid" class="grid gap-3 md:grid-cols-3">
                        <button type="button" class="communication-hub-card rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('chat')">
                            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><i class="ph-bold ph-chats-circle text-2xl"></i></div>
                            <div class="text-lg font-black text-slate-900">Chat</div>
                            <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Messages</div>
                        </button>
                        <button type="button" class="communication-hub-card rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('department-calendar')">
                            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-calendar-check text-2xl"></i></div>
                            <div class="text-lg font-black text-slate-900">Calendar</div>
                            <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Time off, projects, meetings</div>
                        </button>
                        <button type="button" id="communication-email-placeholder" class="communication-hub-card rounded-2xl border border-indigo-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return openCommunicationPlaceholder('email')">
                            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><i class="ph-bold ph-envelope-simple text-2xl"></i></div>
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-lg font-black text-slate-900">Email</div>
                                <span class="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Placeholder</span>
                            </div>
                            <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Mail</div>
                        </button>
                    </div>
                    <div id="alpha-communications-root" class="hidden"></div>
                `;
const bloomscapesDepartmentViews = new Set(['production','hl-order','po-management','sales','qc','disease-pest','communication']);
const bloomscapesDepartmentTabs = new Map();
const bloomscapesDepartmentFrames = new Map();
const BLOOMSCAPES_DEPARTMENT_DEFAULTS={production:'bloomscapes-studio','hl-order':'bloomscapes-replenishment','po-management':'bloomscapes-replenishment','disease-pest':'bloomscapes-lab',communication:'bloomscapes-radio'};

function detachInactiveBloomscapesReceivingPanels(view) {
    for (const frame of document.querySelectorAll('[data-department-workspace="bloomscapes-replenishment"]')) {
        if (frame.closest('[id^="view-"]')?.id!=='view-'+view) frame.remove();
    }
}

function bloomscapesDepartmentKey(view) {
    return getSupabaseReadIdentityScope()+':'+getBloomscapesFarm()+':'+view;
}

function openBloomscapesDepartmentModule(view,tab) {
    if (!canAccessView(view)) return false;
    if (tab==='bloomscapes-radio' || tab==='radio') bloomscapesCommState.mode='voice';
    if (tab==='smart-moves') return switchView('smart-moves');
    const module = tab.startsWith('bloomscapes-') ? tab : 'bloomscapes-'+tab;
    if (module==='bloomscapes-studio' && !canUseBloomscapesWorkStudio()) return false;
    if (view==='managers') return openBloomscapesHomeModule(module);
    bloomscapesDepartmentTabs.set(bloomscapesDepartmentKey(view),module);
    markViewDirty(view);
    return switchView(view);
}

function mountBloomscapesDepartmentShortcuts(view) {
    document.getElementById('view-'+view)?.querySelector(':scope > [data-department-shortcuts]')?.remove();
}

function renderBloomscapesDepartmentWorkspace(view) {
    if (!bloomscapesDepartmentViews.has(view) || !nativeAuthSessionActive) return false;
    const root = document.getElementById('view-'+view);
    if (!root) return false;
    const key = bloomscapesDepartmentKey(view);
    const tab = bloomscapesDepartmentTabs.get(key) || BLOOMSCAPES_DEPARTMENT_DEFAULTS[view] || '';
    const mounted = root.querySelector(':scope > [data-department-workspace]');
    if (!tab || (tab==='bloomscapes-studio' && !canUseBloomscapesWorkStudio())) {
        mounted?.remove();restoreBloomscapesDepartmentChildren(root);
        return false;
    }
    if (mounted?.dataset.departmentScope===key+':'+tab && !mounted.querySelector('[data-radio-disposed]')) {
        if (tab==='bloomscapes-radio') renderBloomscapesComm();
        return true;
    }
    mounted?.remove();
    for (const child of root.children) {
        if (child.hidden) continue;
        child.dataset.departmentHidden = 'true';child.hidden = true;
    }
    let frame = bloomscapesDepartmentFrames.get(key+':'+tab);
    const fresh = !frame || tab==='bloomscapes-radio';
    if (fresh) {
        frame = document.createElement('section');
        frame.dataset.departmentWorkspace = tab;
        frame.dataset.departmentScope = key+':'+tab;
        frame.innerHTML = renderBloomscapesWorkflowPanel(tab);
        bloomscapesDepartmentFrames.set(key+':'+tab,frame);
    }
    root.appendChild(frame);
    if (fresh || tab==='bloomscapes-replenishment') mountBloomscapesWorkflowPanel(frame,tab);
    return true;
}

function restoreBloomscapesDepartmentChildren(root) {
    for (const child of root.querySelectorAll(':scope > [data-department-hidden]')) {
        child.hidden = false;delete child.dataset.departmentHidden;
    }
}

function backBloomscapesDepartmentWorkspace(view) {
    const back=document.getElementById('view-'+view)?.querySelector('[data-module-back]');
    if (back) {back.click();return true;}
    if (BLOOMSCAPES_DEPARTMENT_DEFAULTS[view] || !bloomscapesDepartmentTabs.has(bloomscapesDepartmentKey(view))) return false;
    const studio=bloomscapesDepartmentTabs.get(bloomscapesDepartmentKey(view))==='bloomscapes-studio';
    bloomscapesDepartmentTabs.delete(bloomscapesDepartmentKey(view));
    if (studio) {fastBackHome();return true;}
    markViewDirty(view);renderViewContent(view,false,true);updateGlobalBackButton();
    return true;
}

function bloomscapesDepartmentTitle(view) {
    if (view==='hl-order' || view==='po-management') return 'PO Management';
    if (nativeAuthSessionActive && (view==='sales' || view==='sales-office')) return 'Sales & Marketing Studio';
    if (view==='production' && canUseBloomscapesWorkStudio()) return 'Field Work Studio';
    if (view==='chat') return 'Messages';
    const tab=bloomscapesDepartmentTabs.get(bloomscapesDepartmentKey(view));
    if (tab==='bloomscapes-studio') return 'Field Work Studio';
    if (tab==='bloomscapes-radio') return 'Push to Talk Walkie';
    return '';
}

function renderCommunicationHub() {
    if (nativeAuthSessionActive) {
        if (getCurrentVisibleViewId()==='communication') {
            renderBloomscapesDepartmentWorkspace('communication');
        }
        return;
    }
    renderLegacyCommunicationHub();
}

function renderLegacyCommunicationHub() {
    const host = document.getElementById('view-communication');
    if (host && !host.querySelector('#communication-hub-grid')) host.innerHTML=BLOOMSCAPES_LEGACY_COMMUNICATION;
    if (host && !host.querySelector('[data-suspend-approval-inbox]')) {
        const inbox = document.createElement('section'); inbox.dataset.suspendApprovalInbox = 'true';
        inbox.className = 'p-4'; host.prepend(inbox);
    }
    void refreshSuspendApprovalInbox(true);
    updateFooterChatBadge();
    const root = document.getElementById('alpha-communications-root');
    if (!root) return;
    const enabled = isAuraWidgetAuthorized();
    document.getElementById('communication-hub-grid')?.classList.toggle('hidden', enabled);
    document.querySelector('#view-communication > .freeze-panel')?.classList.toggle('hidden', enabled);
    root.classList.toggle('hidden', !enabled);
    if (enabled) void mountAlphaCommandCenter('communications', root);
    else unmountAlphaCommandCenter('communications');
}
