const SUPERADMIN_LENS_SESSION_KEY = 'gnc-superadmin-lens-v1';
const SUPERADMIN_LENS_CACHE_MS = 300000;

function restoreSuperAdminLens(owner) {
    const state = {owner,selected:null};
    try {
        const saved = JSON.parse(sessionStorage.getItem(SUPERADMIN_LENS_SESSION_KEY) || 'null');
        if (!owner || saved?.owner !== owner || saved.expires <= Date.now()) return state;
        state.receipt = saved.receipt;
        if (saved.selected?.startsWith('role:')) {
            state.selected = superAdminPreviewRoles(saved.receipt).find(role=>role.id===saved.selected) || null;
        } else {
            state.selected = saved.receipt?.users.find(profile=>profile.id===saved.selected) || null;
        }
    } catch {
        return {owner,selected:null};
    }
    return state;
}

function persistSuperAdminLens(state) {
    try {
        sessionStorage.setItem(SUPERADMIN_LENS_SESSION_KEY,JSON.stringify({
            owner:state.owner,selected:state.selected?.id || '',receipt:state.receipt,
            expires:Date.now()+SUPERADMIN_LENS_CACHE_MS
        }));
    } catch {
        // The verified preview remains in memory when session storage is unavailable.
    }
}

function mergeSuperAdminProfiles(previous = [],incoming) {
    return [...new Map([...previous,...incoming].map(profile=>[profile.id,profile])).values()];
}

function searchSuperAdminChoices(host,state) {
    if (!currentSuperAdminLens(state)) return;
    state.searchText = host.querySelector('input').value;
    const query = state.query = state.searchText.trim().toLowerCase();
    paintSuperAdminChoices(host,state);
    if (!/^@[a-z][a-z0-9_]+_[a-z0-9_]+$/.test(query)) return;
    const username = query.slice(1);
    if (state.receipt?.users.some(profile=>profile.username===username) || state.lookup?.username===username) return;
    const lookup = {username};
    state.lookup = lookup;
    void findSuperAdminChoice(host,state,lookup);
}

async function findSuperAdminChoice(host,state,lookup) {
    try {
        const profile = await readExactSuperAdminPreview(state.owner,lookup.username);
        if (!profile || !currentSuperAdminLens(state) || state.lookup !== lookup) return;
        state.receipt = {...state.receipt,users:mergeSuperAdminProfiles(state.receipt?.users,[profile])};
        persistSuperAdminLens(state);
        if (host.isConnected) paintSuperAdminLens(host,state);
    } catch (error) {
        if (currentSuperAdminLens(state)) host.title = error.message;
    } finally {
        if (state.lookup === lookup) state.lookup = null;
        warmSuperAdminLens(host,state);
    }
}

const previewRoleOptions = [
    ['admin','Admin',['drive','av','inventory-office','studio','po','docks','suspend','requests','tables'],true],
    ['manager','Manager — Production',['studio','production-schedule','po'],true],
    ['supervisor','Supervisor — Docks',['docks','docks-issues','load-maximizer','dock-credit-vault','suspend'],true],
    ['crew','Order Puller / Crew',['docks','suspend','studio'],false],
    ['eval','Evaluator',['drive','av','eval2','requests','studio'],false],
    ['rep','Sales Rep',['drive','av','sales-design','sales-flyer','sales-history','sales-rep','sales-archive','requests','historical'],false],
    ['csr','CSR',['drive','av','requests','sales-rep','historical','messages'],false],
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
    const changedOwner = owner !== superAdminLens?.owner;
    if (changedOwner) superAdminLens = {...restoreSuperAdminLens(owner),open:superAdminLens?.open === true};
    const state = superAdminLens;
    const picker = host || root.appendChild(document.createElement('div'));
    picker.dataset.superadminLens = '';
    paintSuperAdminLens(picker,state);
    if (changedOwner && owner) {
        paintSuperAdminBanner(state.selected);
        warmSuperAdminLens(picker,state);
    }
}

function currentSuperAdminLens(state) {
    return state && state === superAdminLens && state.owner === borrowedHelpIdentity() && isSuperAdminLensOwner();
}

function warmSuperAdminLens(picker,state,delay=800) {
    if (!currentSuperAdminLens(state) || state.ready || state.flight || state.queued) return;
    state.queued = true;
    const current = () => currentSuperAdminLens(state) && picker.isConnected;
    scheduleBloomscapesIdleTask('preview-roster',()=>prepareSuperAdminLens(picker,state),current,delay,()=>{state.queued=false;});
}

async function prepareSuperAdminLens(picker,state) {
    state.queued = false;
    if (state.flight || state.ready || state.lookup) return;
    state.flight = true;
    try {
        const receipt = await readSuperAdminPreviewPage(state.owner,state.after || 0);
        if (!currentSuperAdminLens(state)) return;
        if (receipt.next !== null) state.pageCount = (state.pageCount || 0) + 1;
        state.ready = receipt.next === null || state.pageCount >= 64;
        state.after = receipt.next;
        state.receipt = {...receipt,users:mergeSuperAdminProfiles(state.receipt?.users,receipt.users)};
        persistSuperAdminLens(state);
        paintSuperAdminLens(picker,state);
    } catch (error) {
        if (currentSuperAdminLens(state)) picker.title = error.message;
        return;
    } finally {
        state.flight = false;
    }
    warmSuperAdminLens(picker,state,150);
}

function paintSuperAdminLens(host,state) {
    if (!host.firstElementChild) initializeSuperAdminPicker(host);
    const trigger = host.querySelector('[data-lens-trigger]');
    trigger.textContent = '👁️ View As: '+(state.selected?.label || 'Myself (Super-Admin)')+' ▾';
    const menu = host.querySelector('[data-lens-menu]');
    menu.hidden = !state.open;
    trigger.setAttribute('aria-expanded',String(Boolean(state.open)));
    if (state.open) paintSuperAdminChoices(host,state);
}

function initializeSuperAdminPicker(host) {
    host.innerHTML = `<button type="button" data-lens-trigger class="${pullWorkspacePill}"
      aria-haspopup="dialog" aria-expanded="false"></button>
      <div data-lens-menu role="dialog" aria-label="👁️ View As" hidden>
        <button type="button" data-lens-close>Close</button>
        <input type="search" aria-label="Search people or roles" placeholder="Search any user or role...">
        <div data-lens-self></div><p role="status" data-lens-status></p>
        <div data-lens-choices></div></div>`;
    host.querySelector('[data-lens-trigger]').onclick = () => openSuperAdminPicker(host,superAdminLens);
    host.querySelector('[data-lens-close]').onclick = () => closeSuperAdminPicker(host);
    host.querySelector('input').oninput = () => searchSuperAdminChoices(host,superAdminLens);
    host.querySelector('[data-lens-menu]').onkeydown = event => {
        if (event.key === 'Escape') closeSuperAdminPicker(host);
    };
}

function openSuperAdminPicker(host,state) {
    if (!state || state.owner !== borrowedHelpIdentity()) return;
    if (state.open) return closeSuperAdminPicker(host);
    state.open = true;
    state.query = '';
    state.searchText = '';
    paintSuperAdminLens(host,state);
    host.querySelector('input').focus();
    if (!state.receipt) void prepareSuperAdminLens(host,state);
    else warmSuperAdminLens(host,state);
}

function closeSuperAdminPicker(host) {
    if (!currentSuperAdminLens(superAdminLens)) return;
    superAdminLens.open = false;
    paintSuperAdminLens(host,superAdminLens);
}

function paintSuperAdminChoices(host,state) {
    const input = host.querySelector('input');
    const query = state.query || '';
    if (input.value !== (state.searchText || '')) input.value = state.searchText || '';
    const users = [...(state.receipt?.users || [])].sort((left,right)=>left.label.localeCompare(right.label));
    const self = {id:'self',label:'Myself — dylan_collyge (Super-Admin)'};
    host.querySelector('[data-lens-self]').replaceChildren(superAdminChoiceButton(host,state,self));
    const profiles = [...superAdminPreviewRoles(state.receipt),...users];
    const list = host.querySelector('[data-lens-choices]');
    const choices = profiles.filter(profile => matchesSuperAdminPreview(profile,query));
    const status = host.querySelector('[data-lens-status]');
    status.textContent = state.ready ? '' : 'Loading active users…';
    list.replaceChildren(...choices.map(profile=>superAdminChoiceButton(host,state,profile)));
    if (!choices.length) list.textContent = 'No matching profiles.';
}

function matchesSuperAdminPreview(profile,query) {
    if (!query) return true;
    const search = [profile.label,profile.username && '@'+profile.username,profile.role,...(profile.farm_scopes || [])]
        .filter(Boolean).join(' ').toLowerCase();
    return query.split(/\s+/).every(word => search.includes(word));
}

function superAdminChoiceButton(host,state,profile) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = describeSuperAdminPreview(profile);
    button.setAttribute('aria-pressed',String((state.selected?.id || 'self') === profile.id));
    button.onclick = () => {
        closeSuperAdminPicker(host);
        applySuperAdminLens(state,profile.id === 'self' ? null : profile);
    };
    return button;
}

function describeSuperAdminPreview(profile) {
    if (!profile.username) return profile.label;
    const farms = profile.farm_scopes?.join(', ') || 'No farms';
    return [profile.label,'@'+profile.username,profile.role,farms,'Assigned Rows: '+(profile.assigned_rows ?? 0)].join(' · ');
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
    button.textContent = 'Exit View As';
    button.onclick = () => applySuperAdminLens(superAdminLens,null);
    const account = profile.username ? ' (@'+profile.username+' · '+profile.role+')' : '';
    banner.replaceChildren('👁️ Viewing as '+profile.label+account+' · ',button);
}

function applySuperAdminLens(state,profile) {
    if (!state || state !== superAdminLens || state.owner !== borrowedHelpIdentity() || !isSuperAdminLensOwner()) return;
    state.selected = profile || null;
    persistSuperAdminLens(state);
    avResolvedBaseStateKey = '';
    driveVisibleItemsStateCache = null;
    driveVisibleItemsStateCacheKey = '';
    const trigger = document.querySelector('[data-lens-trigger]');
    if (trigger) trigger.textContent = '👁️ View As: '+(profile?.label || 'Myself (Super-Admin)')+' ▾';
    paintSuperAdminBanner(state.selected);
    const view = getCurrentVisibleViewId();
    if (view !== 'home' && !canDisplayNavigationView(view)) switchView('home');
    const grid = document.getElementById('home-dashboard-grid');
    clearBloomscapesHomeDepartment();
    syncBloomscapesHomeTileVisibility(grid);
    updateFooterNavState();
    updateGlobalBackButton();
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
    if (view === 'drive') renderDrive();
    if (view === 'av') renderAV();
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
