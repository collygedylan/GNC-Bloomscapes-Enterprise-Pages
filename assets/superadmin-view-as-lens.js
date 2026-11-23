const previewRoleOptions = [
    ['manager','Manager — Production',['studio','production-schedule','po'],true],
    ['supervisor','Supervisor — Docks',['docks','docks-issues','load-maximizer','dock-credit-vault','suspend'],true],
    ['crew','Order Puller / Crew',['docks','suspend','studio'],false],
    ['eval','Evaluator',['drive','av','eval2','requests','studio'],false],
    ['rep','Sales Rep',['drive','av','sales-design','sales-flyer','sales-history','sales-rep','sales-archive','requests','historical'],false],
    ['traffic','Traffic',['docks','docks-issues','load-maximizer','suspend'],false]
];
let superAdminLens;

function isSuperAdminLensOwner() {
    return nativeAuthSessionActive && nativeAuthProfile?.id === nativeAuthSessionUserId
        && nativeAuthProfile?.username === 'dylan_collyge' && nativeAuthProfile.role === 'super-admin'
        && currentUser === nativeAuthProfile.username && !window.__agdataSessionBoundary;
}

function borrowedHelpPreview() {
    if (!isSuperAdminLensOwner() || superAdminLens?.owner !== borrowedHelpIdentity()) return null;
    return superAdminLens.selected || null;
}

function superAdminPreviewRoles(receipt) {
    return previewRoleOptions.map(([role,label,routes,borrowed])=>({
        id:'role:'+role,role,label,borrowed,queue_scope:'assigned',loans:[],
        area_access:receipt?.roles?.[role] || Object.fromEntries(routes.map(key=>[key,'VIEW_ONLY']))
    }));
}

function mountSuperAdminViewAs() {
    const root = document.querySelector('.nav-header-meta-row');
    if (!root) return;
    const host = root.querySelector('[data-superadmin-lens]');
    if (!isSuperAdminLensOwner()) {
        host?.remove();
        document.querySelector('[data-superadmin-preview-banner]')?.remove();
        superAdminLens = null;
        return;
    }
    const owner = borrowedHelpIdentity();
    if (owner !== superAdminLens?.owner) superAdminLens = {owner,selected:null};
    const state = superAdminLens;
    const picker = host || root.appendChild(document.createElement('div'));
    picker.dataset.superadminLens = '';
    paintSuperAdminLens(picker,state);

}

function prepareSuperAdminLens(picker,state) {
    const publish = receipt => {
        if (state !== superAdminLens || state.owner !== borrowedHelpIdentity()) return;
        state.receipt = receipt;
        state.ready = receipt.next === null;
        if (picker.isConnected) paintSuperAdminLens(picker,state);
    };
    state.flight = readSuperAdminPreview(state.owner,publish).catch(error=>{
        state.retryAt = Date.now()+30000;
        if (picker.isConnected && state === superAdminLens) picker.title = error.message;
    }).finally(()=>{ state.flight = null; });
}

function paintSuperAdminLens(host,state) {
    if (!host.firstElementChild) initializeSuperAdminPicker(host);
    const trigger = host.querySelector('[data-lens-trigger]');
    trigger.textContent = '👁️ View As: '+(state.selected?.label || 'Myself (Super-Admin)')+' ▾';
    if (!host.querySelector('[data-lens-menu]').hidden) paintSuperAdminChoices(host,state);
}

function initializeSuperAdminPicker(host) {
    host.innerHTML = `<button type="button" data-lens-trigger class="${pullWorkspacePill}"
      aria-haspopup="dialog" aria-expanded="false"></button>
      <div data-lens-menu role="dialog" aria-label="👁️ View As" hidden>
        <button type="button" data-lens-close>Close</button>
        <input type="search" aria-label="Search people or roles">
        <div data-lens-choices></div></div>`;
    host.querySelector('[data-lens-trigger]').onclick = () => openSuperAdminPicker(host,superAdminLens);
    host.querySelector('[data-lens-close]').onclick = () => closeSuperAdminPicker(host);
    host.querySelector('input').oninput = () => paintSuperAdminChoices(host,superAdminLens);
    host.querySelector('[data-lens-menu]').onkeydown = event => {
        if (event.key === 'Escape') closeSuperAdminPicker(host);
    };
}

function openSuperAdminPicker(host,state) {
    if (!state || state.owner !== borrowedHelpIdentity()) return;
    const menu = host.querySelector('[data-lens-menu]');
    if (!menu.hidden) return closeSuperAdminPicker(host);
    host.querySelector('input').value = '';
    host.querySelector('[data-lens-trigger]').setAttribute('aria-expanded','true');
    menu.hidden = false;
    paintSuperAdminChoices(host,state);
    if (!state.ready && !state.flight && Date.now() >= (state.retryAt || 0)) prepareSuperAdminLens(host,state);
}

function closeSuperAdminPicker(host) {
    host.querySelector('[data-lens-trigger]').setAttribute('aria-expanded','false');
    host.querySelector('[data-lens-menu]').hidden = true;
}

function paintSuperAdminChoices(host,state) {
    const query = host.querySelector('input').value.toLowerCase().trim();
    const users = [...(state.receipt?.users || [])].sort((left,right)=>left.label.localeCompare(right.label));
    const profiles = [{id:'self',label:'Myself (Super-Admin)'},...superAdminPreviewRoles(state.receipt),...users];
    const list = host.querySelector('[data-lens-choices]');
    const choices = profiles.filter(profile=>profile.label.toLowerCase().includes(query));
    renderBloomscapesListWindow(list,choices,profile=>superAdminChoiceButton(host,state,profile),'No matching profiles.');
}

function superAdminChoiceButton(host,state,profile) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = profile.label;
    button.setAttribute('aria-pressed',String((state.selected?.id || 'self') === profile.id));
    button.onclick = () => {
        closeSuperAdminPicker(host);
        applySuperAdminLens(state,profile.id === 'self' ? null : profile);
    };
    return button;
}

function paintSuperAdminBanner(profile) {
    const chrome = document.getElementById('app-top-chrome');
    if (!chrome) return;
    const current = chrome.querySelector('[data-superadmin-preview-banner]');
    if (!profile) { current?.remove(); return; }
    const banner = current || chrome.appendChild(document.createElement('aside'));
    banner.dataset.superadminPreviewBanner = '';
    banner.className = 'flex flex-wrap items-center justify-center gap-2 bg-emerald-900 p-1 text-sm text-emerald-50';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = pullWorkspacePill;
    button.textContent = 'Return to Super-Admin';
    button.onclick = () => applySuperAdminLens(superAdminLens,null);
    banner.replaceChildren('👁️ Viewing UI as '+profile.label+' · ',button);
}

function applySuperAdminLens(state,profile) {
    if (!state || state !== superAdminLens || state.owner !== borrowedHelpIdentity() || !isSuperAdminLensOwner()) return;
    state.selected = profile || null;
    const trigger = document.querySelector('[data-lens-trigger]');
    if (trigger) trigger.textContent = '👁️ View As: '+(profile?.label || 'Myself (Super-Admin)')+' ▾';
    paintSuperAdminBanner(state.selected);
    const view = getCurrentVisibleViewId();
    if (view !== 'home' && !canDisplayNavigationView(view)) switchView('home');
    const grid = document.getElementById('home-dashboard-grid');
    syncBloomscapesHomeTileVisibility(grid);
    if (view === 'request' && getCurrentVisibleViewId() === 'request') {
        syncQueActiveCategory();
        mountBorrowedHelpQueue();
    }
    requestAnimationFrame(()=>finishSuperAdminLens(state,profile,grid));
}

function finishSuperAdminLens(state,profile,grid) {
    if (state !== superAdminLens || state.selected !== (profile || null) || state.owner !== borrowedHelpIdentity()) return;
    syncBloomscapesDrawerAreaHubs();
    syncNavigationVisibilityUi(getRoleAccessState(),'',grid);
    const view = getCurrentVisibleViewId();
    if (view === 'request') renderRequest();
    if (view === 'borrowed-work') renderBloomscapesBorrowedField(view);
}

function previewShowsAreaView(preview,key) {
    if (key === 'borrowed-help') return preview.borrowed;
    if (key === 'docks-issues') key = 'docks';
    return ['FULL_EDIT','VIEW_ONLY'].includes(preview.area_access?.[key]);
}

function previewShowsQueueRow(preview,row,tab) {
    if (tab === 'pending' && preview.queue_scope === 'all') return true;
    if (!preview.username) return false;
    const owner = getAssignedQueueOwner(row);
    const normalize = tab === 'suspend-tag' ? normalizeSuspendQueueOwner : normalizeEvalAssignableUser;
    return normalize(owner) === normalize(preview.username);
}
