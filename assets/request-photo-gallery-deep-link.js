
let requestPhotoGalleryState = null;
let requestPhotoGalleryAuthSubscription = null;
let requestPhotoGalleryConsumed = '';
let requestPhotoGalleryPendingIntent = null;

function requestPhotoGalleryIntent(search = window.location.search) {
    const query = new URLSearchParams(search);
    const folderId = String(query.get('request_gallery') || '').trim();
    const rowId = String(query.get('row_id') || '').trim();
    if (!folderId || folderId.length > 512 || rowId.length > 512) return null;
    return {folderId, rowId, key:JSON.stringify([folderId,rowId])};
}

function requestPhotoGalleryOwner() {
    return JSON.stringify([getSupabaseReadIdentityScope(), nativeAuthProfile?.id, getBloomscapesFarm()]);
}

function closeRequestPhotoGallery() {
    const state = requestPhotoGalleryState;
    if (!state) return false;
    requestPhotoGalleryState = null;
    state.abort.abort();
    state.modal.close();
    return true;
}

function requestPhotoGalleryCurrent(state) {
    if (requestPhotoGalleryState !== state) return false;
    if (!nativeAuthSessionActive || nativeAuthProfile?.disabled_at || nativeAuthProfile?.active === false
        || window.GncUserAccessControl?.getSelfState?.().denied === true || state.owner !== requestPhotoGalleryOwner()) {
        closeRequestPhotoGallery();
        return false;
    }
    return true;
}

function moveRequestPhotoGalleryPhoto(state, index) {
    if (!requestPhotoGalleryCurrent(state) || !state.gallery) return;
    const row = state.gallery.rows[state.rowIndex];
    state.photoIndex = Math.max(0, Math.min(index, row.photos.length - 1));
    state.modal.render(state);
}

function moveRequestPhotoGalleryRow(state, rowId) {
    if (!requestPhotoGalleryCurrent(state) || !state.gallery) return;
    const index = state.gallery.rows.findIndex(row => row.id === rowId);
    if (index < 0) return;
    state.rowIndex = index;
    state.photoIndex = 0;
    state.modal.render(state);
}

function watchRequestPhotoGalleryIdentity() {
    if (requestPhotoGalleryAuthSubscription) return;
    const client = getSupabaseBrowserClient();
    requestPhotoGalleryAuthSubscription = client?.auth?.onAuthStateChange((event, session) => {
        const state = requestPhotoGalleryState;
        if (!state) return;
        if (event === 'SIGNED_OUT' || session?.user?.id !== state.userId) closeRequestPhotoGallery();
    })?.data?.subscription || null;
}

async function resumeRequestPhotoGalleryDeepLink() {
    const intent = requestPhotoGalleryPendingIntent || requestPhotoGalleryIntent();
    if (!intent || !nativeAuthSessionActive || !currentUser || !nativeAuthProfile?.id) return false;
    const owner = requestPhotoGalleryOwner();
    const consumed = JSON.stringify([owner,intent.key]);
    if (requestPhotoGalleryState || requestPhotoGalleryConsumed === consumed) return false;
    watchRequestPhotoGalleryIdentity();
    const state = {owner, userId:nativeAuthProfile.id,
        abort:new AbortController(), gallery:null, rowIndex:0, photoIndex:0, modal:null};
    requestPhotoGalleryState = state;
    requestPhotoGalleryConsumed = consumed;
    state.modal = createRequestPhotoGalleryModal({close:closeRequestPhotoGallery,
        step:direction => moveRequestPhotoGalleryPhoto(state, state.photoIndex + direction),
        photo:index => moveRequestPhotoGalleryPhoto(state, index),
        row:rowId => moveRequestPhotoGalleryRow(state, rowId)});
    try {
        const gallery = await readRequestPhotoGallery(intent.folderId, intent.rowId, {signal:state.abort.signal});
        if (!requestPhotoGalleryCurrent(state)) return false;
        state.gallery = gallery;
        state.rowIndex = Math.max(0, gallery.rows.findIndex(row => row.id === intent.rowId));
        state.modal.render(state);
        return true;
    } catch (error) {
        if (requestPhotoGalleryCurrent(state)) state.modal.fail(error.message || 'Request photos could not load.');
        return false;
    }
}

window.addEventListener('bloomscapes-farm-ready', () => {
    if (requestPhotoGalleryState) requestPhotoGalleryCurrent(requestPhotoGalleryState);
    void resumeRequestPhotoGalleryDeepLink();
});
window.addEventListener('popstate', () => {
    closeRequestPhotoGallery();
    requestPhotoGalleryPendingIntent = null;
    requestPhotoGalleryConsumed = '';
    void resumeRequestPhotoGalleryDeepLink();
});
window.addEventListener('pagehide', closeRequestPhotoGallery);
window.addEventListener('gnc-user-access-change', () => {
    if (requestPhotoGalleryState) requestPhotoGalleryCurrent(requestPhotoGalleryState);
});
document.addEventListener('change', event => {
    if (event.target.id === 'bloomscapes-farm-selector') closeRequestPhotoGallery();
}, {capture:true});

function openRequestPhotoGalleryNotification(event) {
    if (event.data?.type !== 'GNC_OPEN_VIEW' || typeof event.data.url !== 'string') return;
    try {
        const base = new URL('./', window.location.href);
        const target = new URL(event.data.url, base);
        if (target.origin !== base.origin || ![base.pathname,base.pathname + 'index.html'].includes(target.pathname)) return;
        const intent = requestPhotoGalleryIntent(target.search);
        if (!intent?.rowId) return;
        closeRequestPhotoGallery();
        requestPhotoGalleryPendingIntent = intent;
        requestPhotoGalleryConsumed = '';
        void resumeRequestPhotoGalleryDeepLink();
    } catch { return; }
}

navigator.serviceWorker?.addEventListener('message', openRequestPhotoGalleryNotification);

function readInventoryGalleryDeepLink() {
    const params = new URLSearchParams(window.location.search || '');
    if (!params.get('gallery')) return null;
    const photos = String(params.get('p') || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!photos.length) return null;
    return {
        itemCode: String(params.get('item') || '').trim().toUpperCase(),
        locationCode: String(params.get('loc') || '').trim().toUpperCase(),
        lotCode: String(params.get('lot') || '').trim().toUpperCase(),
        title: String(params.get('title') || 'Photo Gallery').trim() || 'Photo Gallery',
        photos
    };
}

function focusInventoryGalleryDeepLinkRow(link) {
    if (!link || !currentUser || !Array.isArray(fullInventory) || !fullInventory.length) return false;
    const row = (masterInventoryByItemCode.get(link.itemCode) || []).find(item => String(firstNonEmptyValue(item && item.LOCATIONCODE, item && item.locationcode, '') || '').trim().toUpperCase() === link.locationCode
        && String(firstNonEmptyValue(item && item.LOTCODE, item && item.lotcode, '') || '').trim().toUpperCase() === link.lotCode);
    if (!row) return false;
    const uid = String(firstNonEmptyValue(row.UNIQUE_ID, row.unique_id, row.DOM_ID, '') || '').trim();
    if (uid && typeof openDetail === 'function') openDetail(uid, 'drive');
    else switchView('drive');
    openPhotoModal(link.photos.join(','), link.title);
    return true;
}

var pendingInventoryGallery;

function cancelInventoryGalleryFocus() {
    if (pendingInventoryGallery) clearTimeout(pendingInventoryGallery.expiry);
    pendingInventoryGallery=null;
}

function resumeInventoryGalleryFocus() {
    const pending=pendingInventoryGallery;
    if (!pending || !currentUser || document.hidden) return;
    if (pending.owner && pending.owner!==currentUser) return cancelInventoryGalleryFocus();
    if (focusInventoryGalleryDeepLinkRow(pending.link)) cancelInventoryGalleryFocus();
}

function openInventoryGalleryDeepLink() {
    const link=readInventoryGalleryDeepLink();
    if (!link) return false;
    cancelInventoryGalleryFocus();
    openPhotoModal(link.photos.join(','),link.title);
    pendingInventoryGallery={link,owner:currentUser,expiry:setTimeout(cancelInventoryGalleryFocus,60000)};
    resumeInventoryGalleryFocus();
    return true;
}
