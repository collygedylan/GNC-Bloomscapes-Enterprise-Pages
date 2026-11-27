const chunkedListMounts = new WeakMap();

function mountChunkedList(list,choices,render) {
    const generation = {};
    chunkedListMounts.set(list,generation);
    const first = choices.slice(0,40).map(render);
    list.replaceChildren(...first);
    if (choices.length > first.length) appendChunkedList(list,choices,render,generation,first.length);
}

function appendChunkedList(list,choices,render,generation,start) {
    requestAnimationFrame(() => {
        if (!list.isConnected || chunkedListMounts.get(list) !== generation) return;
        const end = Math.min(start+40,choices.length);
        list.append(...choices.slice(start,end).map(render));
        if (end < choices.length) appendChunkedList(list,choices,render,generation,end);
    });
}

const continuousListObservers = new WeakMap();

function observeContinuousListEnd(sentinel,load) {
    const previous=continuousListObservers.get(sentinel);
    if (previous) previous.disconnect();
    continuousListObservers.delete(sentinel);
    if (!load || typeof IntersectionObserver!=='function') return;
    const observer=new IntersectionObserver(entries=>{
        if (!sentinel.isConnected) { observer.disconnect(); return; }
        if (!entries.some(entry=>entry.isIntersecting)) return;
        observer.disconnect();
        void load();
    },{rootMargin:'80px'});
    continuousListObservers.set(sentinel,observer);
    observer.observe(sentinel);
}

const SUPERADMIN_LENS_SESSION_KEY = 'gnc-superadmin-lens-v1';
const SUPERADMIN_LENS_CACHE_MS = 300000;

function restoreSuperAdminLens(owner) {
    const state = {owner,selected:null};
    try {
        const saved = JSON.parse(sessionStorage.getItem(SUPERADMIN_LENS_SESSION_KEY) || 'null');
        if (owner && saved?.owner === owner && saved.expires > Date.now()) state.selected = saved.profile || null;
    } catch {
        return state;
    }
    return state;
}

function persistSuperAdminLens(state) {
    try {
        sessionStorage.setItem(SUPERADMIN_LENS_SESSION_KEY,JSON.stringify({
            owner:state.owner,selected:state.selected?.id || '',profile:state.selected,expires:Date.now()+SUPERADMIN_LENS_CACHE_MS
        }));
    } catch {
        // The verified preview remains in memory when session storage is unavailable.
    }
}

function searchSuperAdminChoices(host,state) {
    if (!currentSuperAdminLens(state)) return;
    state.searchText = host.querySelector('input').value;
    state.query = state.searchText.trim().toLowerCase();
    paintSuperAdminChoices(host,state);
}

function selectSuperAdminChoice(host,state,profile) {
    if (!currentSuperAdminLens(state)) return;
    state.selection = null;
    state.error = '';
    if (!profile.username) {
        closeSuperAdminPicker(host);
        applySuperAdminLens(state,profile.id === 'self' ? null : profile);
        return;
    }
    state.selection = {profile};
    paintSuperAdminChoices(host,state);
    void resolveSuperAdminChoice(host,state,state.selection);
}

async function resolveSuperAdminChoice(host,state,selection) {
    const profile = selection.profile;
    try {
        const receipt = await readSuperAdminPreviewPage(state.owner,-Number(profile.id.slice(5)));
        if (!currentSuperAdminLens(state) || state.selection !== selection) return;
        const exact = receipt.users.find(row=>row.id===profile.id && row.username===profile.username);
        if (!exact) throw Error('This profile is no longer available.');
        state.selection = null;
        closeSuperAdminPicker(host);
        applySuperAdminLens(state,exact);
    } catch (error) {
        if (!currentSuperAdminLens(state) || state.selection !== selection) return;
        state.selection = null;
        state.error = error.message;
        if (host.isConnected) paintSuperAdminChoices(host,state);
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

/** @returns {object|null} Current account-scoped borrowed-help preview. */
function borrowedHelpPreview() {
    if (!isSuperAdminLensOwner() || !superAdminLens) return null;
    const owner=borrowedHelpIdentity();
    if (superAdminLens.owner!==owner && !rebaseScopedSuperAdminLens(superAdminLens,owner)) return null;
    return superAdminLens.selected || null;
}

function rebaseScopedSuperAdminLens(state,owner) {
    const selected=state.selected;
    if (!selected?.module_access || !selected.allowed_warehouses?.includes(getBloomscapesFarm())
        || state.profileId!==nativeAuthSessionUserId || state.profileEpoch!==nativeAuthRecoveryEpoch) return false;
    state.owner=owner;
    state.selection=null;
    state.selected={...selected,loans:[]};
    persistSuperAdminLens(state);
    return true;
}

function superAdminPreviewRoles(receipt) {
    return previewRoleOptions.map(([role,label,routes,borrowed])=>({
        id:'role:'+role,role,label,borrowed,queue_scope:'assigned',loans:[],
        area_access:receipt?.roles?.[role] || Object.fromEntries(routes.map(key=>[key,'VIEW_ONLY']))
    }));
}

/** @returns {void} Mounts the authorized access preview controls. */
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
    if (changedOwner && !rebaseScopedSuperAdminLens(superAdminLens || {},owner)) {
        superAdminLens = {...restoreSuperAdminLens(owner),open:superAdminLens?.open===true,
            profileId:nativeAuthSessionUserId,profileEpoch:nativeAuthRecoveryEpoch};
    }
    const state = superAdminLens;
    state.roster = getAppAccessSnapshot()?.viewAsRoster || null;
    const picker = host || root.appendChild(document.createElement('div'));
    picker.dataset.superadminLens = '';
    paintSuperAdminLens(picker,state);
    if (changedOwner && owner) {
        paintSuperAdminBanner(state.selected);
    }
}

function currentSuperAdminLens(state) {
    return state && state === superAdminLens && state.owner === borrowedHelpIdentity() && isSuperAdminLensOwner();
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
    if (!isSuperAdminLensOwner()) return;
    if (state?.owner !== borrowedHelpIdentity()) {
        mountSuperAdminViewAs();
        state = superAdminLens;
        if (currentSuperAdminLens(state)) state.open = false;
    }
    if (!currentSuperAdminLens(state)) return;
    if (state.open) return closeSuperAdminPicker(host);
    state.open = true;
    state.query = '';
    state.searchText = '';
    paintSuperAdminLens(host,state);
    host.querySelector('input').focus();
}

function closeSuperAdminPicker(host) {
    if (!currentSuperAdminLens(superAdminLens)) return;
    superAdminLens.open = false;
    superAdminLens.selection = null;
    superAdminLens.error = '';
    paintSuperAdminLens(host,superAdminLens);
}

function paintSuperAdminChoices(host,state) {
    const input = host.querySelector('input');
    const query = state.query || '';
    if (input.value !== (state.searchText || '')) input.value = state.searchText || '';
    const users = [...(state.roster?.users || [])].sort((left,right)=>left.label.localeCompare(right.label));
    const self = {id:'self',label:'Myself — dylan_collyge (Super-Admin)'};
    host.querySelector('[data-lens-self]').replaceChildren(superAdminChoiceButton(host,state,self));
    const profiles = [...superAdminPreviewRoles(state.roster),...users];
    const list = host.querySelector('[data-lens-choices]');
    const choices = profiles.filter(profile => matchesSuperAdminPreview(profile,query));
    const status = host.querySelector('[data-lens-status]');
    status.textContent = state.error || (state.selection ? 'Loading access preview…' : state.roster ? '' : 'Loading active users…');
    mountChunkedList(list,choices,profile=>superAdminChoiceButton(host,state,profile));
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
        selectSuperAdminChoice(host,state,profile);
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
    if (typeof syncBloomscapesFarmSelector==='function') void syncBloomscapesFarmSelector();
    const view = getCurrentVisibleViewId();
    if (view === 'request') renderRequest();
    if (view === 'drive') renderDrive();
    if (view === 'av') renderAV();
    if (view === 'borrowed-work') renderBloomscapesBorrowedField(view);
}

/** @param {object} preview Selected access preview. @param {string} key Area or subview identifier. @returns {boolean} Whether the preview grants visibility. */
function previewShowsAreaView(preview,key) {
    if (key === 'borrowed-help') return preview.borrowed;
    if (key === 'docks-issues') key = 'docks';
    return ['FULL_EDIT','VIEW_ONLY'].includes(preview.area_access?.[key]);
}

/** @param {object} preview Selected access preview. @param {object} row Queue row. @param {string} tab Queue tab. @returns {boolean} Whether the preview includes the row. */
function previewShowsQueueRow(preview,row,tab) {
    if (tab === 'pending' && preview.queue_scope === 'all') return true;
    if (!preview.username) return false;
    const owner = getAssignedQueueOwner(row);
    const normalize = tab === 'suspend-tag' ? normalizeSuspendQueueOwner : normalizeEvalAssignableUser;
    return normalize(owner) === normalize(preview.username);
}
