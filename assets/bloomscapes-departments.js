const BLOOMSCAPES_DEPARTMENT_LINKS = {
    managers:[['studio','Build Work Studio'],['smart-moves','Smart Sales & Move Intelligence'],
        ['bunch-notes','Bunch Notes'],['can-filling','Can Filling'],['grading','Shift Grading'],
        ['hauling','Hauling'],['shearing','Shear List'],['replenishment','Intercompany & CPB'],
        ['lab','Plant Health & Lab Reports'],['vault','My Work & Inquiry PDF Vault'],['sales-vault','Sales Rep Vault'],
        ['radio','Walkie-Talkie & AURA Voice'],['architecture','System Architecture & Table Map']],
    production:[['studio','Build Work Studio'],['bunch-notes','Bunch Notes'],['can-filling','Can Filling'],
        ['grading','Shift Grading'],['hauling','Hauling'],['shearing','Shear List'],['vault','My Work & Inquiry PDF Vault']],
    'hl-order':[['replenishment','Intercompany Replenishment & CPB']],
    sales:[['sales-vault','Sales Rep Vault'],['smart-moves','Smart Sales & Move Intelligence']],
    qc:[['lab','Plant Health & Lab Reports']],communication:[['radio','Walkie-Talkie & AURA Voice']]
};
const bloomscapesDepartmentTabs = new Map();
const bloomscapesDepartmentFrames = new Map();
const BLOOMSCAPES_DEPARTMENT_DEFAULTS={'hl-order':'bloomscapes-replenishment',communication:'bloomscapes-radio'};

function detachInactiveBloomscapesReceivingPanels(view) {
    for (const frame of document.querySelectorAll('[data-department-workspace="bloomscapes-replenishment"]')) {
        if (frame.closest('[id^="view-"]')?.id!=='view-'+view) frame.remove();
    }
}

function bloomscapesDepartmentKey(view) {
    return getSupabaseReadIdentityScope()+':'+view;
}

function openBloomscapesDepartmentModule(view,tab) {
    if (!canAccessView(view)) return false;
    if (tab==='smart-moves') return switchView('smart-moves');
    const module = tab.startsWith('bloomscapes-') ? tab : 'bloomscapes-'+tab;
    if (view==='managers') return openBloomscapesHomeModule(module);
    bloomscapesDepartmentTabs.set(bloomscapesDepartmentKey(view),module);
    markViewDirty(view);
    switchView(view);
    renderViewContent(view,false,true);
    syncGlobalHeaderChrome({reason:'department-module',force:true});
    return false;
}

function mountBloomscapesDepartmentShortcuts(view) {
    const links = BLOOMSCAPES_DEPARTMENT_LINKS[view];
    const root = document.getElementById('view-'+view);
    if (!links || !root || !nativeAuthSessionActive || !canAccessView(view)) return;
    let nav = root.querySelector(':scope > [data-department-shortcuts]');
    if (!nav) {
        nav = document.createElement('nav');
        nav.dataset.departmentShortcuts = view;
        nav.className = 'bloomscapes-department-shortcuts';
        nav.setAttribute('aria-label',view+' department modules');
        root.prepend(nav);
    }
    if (nav.dataset.owner===getSupabaseReadIdentityScope()) return;
    nav.replaceChildren(...links.filter(([id])=>id!=='architecture' || canViewBloomscapesArchitecture(currentUser,nativeAuthProfile,true))
        .map(([id,title])=>bloomscapesDepartmentButton(view,id,title)));
    nav.dataset.owner = getSupabaseReadIdentityScope();
}

function bloomscapesDepartmentButton(view,id,title) {
    const button = document.createElement('button');
    button.type = 'button';button.textContent = title;
    button.dataset.departmentModule = id;
    button.addEventListener('click',()=>openBloomscapesDepartmentModule(view,id));
    return button;
}

function renderBloomscapesDepartmentWorkspace(view) {
    if (!BLOOMSCAPES_DEPARTMENT_LINKS[view] || view==='managers' || !nativeAuthSessionActive) return false;
    const root = document.getElementById('view-'+view);
    if (!root) return false;
    const key = bloomscapesDepartmentKey(view);
    const tab = bloomscapesDepartmentTabs.get(key) || BLOOMSCAPES_DEPARTMENT_DEFAULTS[view] || '';
    const mounted = root.querySelector(':scope > [data-department-workspace]');
    if (!tab) {
        mounted?.remove();restoreBloomscapesDepartmentChildren(root);
        return false;
    }
    if (mounted?.dataset.departmentScope===key+':'+tab && !mounted.querySelector('[data-radio-disposed]')) return true;
    mounted?.remove();
    for (const child of root.children) {
        if (child.hidden || child.dataset.departmentShortcuts) continue;
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
    if (BLOOMSCAPES_DEPARTMENT_DEFAULTS[view] || !bloomscapesDepartmentTabs.has(bloomscapesDepartmentKey(view))) return false;
    bloomscapesDepartmentTabs.delete(bloomscapesDepartmentKey(view));
    markViewDirty(view);renderViewContent(view,false,true);updateGlobalBackButton();
    return true;
}

function renderCommunicationHub() {
    if (nativeAuthSessionActive) {
        if (getCurrentVisibleViewId()==='communication') {
            renderBloomscapesDepartmentWorkspace('communication');
            mountBloomscapesDepartmentShortcuts('communication');
        }
        return;
    }
    renderLegacyCommunicationHub();
}

function renderLegacyCommunicationHub() {
    const host = document.getElementById('view-communication');
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
