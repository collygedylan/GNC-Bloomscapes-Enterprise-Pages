const CLIENT_BROWSE_PAGE_SIZE = BLOOMSCAPES_LIST_PAGE_SIZE;
const clientBrowsePageCounts = new Map();
const CLIENT_BROWSE_PAGE_KEY_CACHE_LIMIT = 12;
const clientBrowsePageKeyCache = new Map();
const clientBrowsePageKeyCacheOrder = [];
let clientBrowsePageKeyCacheEntryCount = 0;
let clientBrowsePageKeyCacheIdentityKey = null;
function clearClientBrowsePageKeyCache(identityKey = '') {
    clientBrowsePageKeyCache.clear();
    clientBrowsePageKeyCacheOrder.length = 0;
    clientBrowsePageKeyCacheEntryCount = 0;
    clientBrowsePageKeyCacheIdentityKey = String(identityKey);
}
function getClientBrowsePageKey(view = '', key = '') {
    const safeView = String(view || '').trim();
    const identityKey = String(typeof getSupabaseReadIdentityScope === 'function' ? getSupabaseReadIdentityScope() : '');
    if (clientBrowsePageKeyCacheIdentityKey !== identityKey) clearClientBrowsePageKeyCache(identityKey);
    const sourceKey = String(key || '').trim();
    let viewCache = clientBrowsePageKeyCache.get(safeView);
    if (viewCache?.has(sourceKey)) return viewCache.get(sourceKey);
    const pageKey = `${safeView}:${buildRowsRenderSignature(`browse:${safeView}`, [{ UNIQUE_ID: `${identityKey}:${sourceKey}` }])}`;
    while (clientBrowsePageKeyCacheEntryCount >= CLIENT_BROWSE_PAGE_KEY_CACHE_LIMIT) {
        const oldest = clientBrowsePageKeyCacheOrder.shift();
        if (!oldest) break;
        const oldestViewCache = clientBrowsePageKeyCache.get(oldest.view);
        if (oldestViewCache?.delete(oldest.sourceKey)) clientBrowsePageKeyCacheEntryCount--;
        if (oldestViewCache && !oldestViewCache.size) clientBrowsePageKeyCache.delete(oldest.view);
    }
    viewCache = clientBrowsePageKeyCache.get(safeView);
    if (!viewCache) {
        viewCache = new Map();
        clientBrowsePageKeyCache.set(safeView, viewCache);
    }
    viewCache.set(sourceKey, pageKey);
    clientBrowsePageKeyCacheOrder.push({ view: safeView, sourceKey });
    clientBrowsePageKeyCacheEntryCount++;
    return pageKey;
}
function getClientBrowsePage(view = '', key = '', rows = [], limit = CLIENT_BROWSE_PAGE_SIZE) {
    const safeView = String(view || '').trim();
    const safeKey = getClientBrowsePageKey(safeView, key);
    const safeRows = Array.isArray(rows) ? rows : [];
    const page = bloomscapesListWindow(safeRows,clientBrowsePageCounts.get(safeKey),limit);
    const end = page.start + page.rows.length;
    return {key:safeKey,pageIndex:page.index,pageCount:page.pages,start:page.start,end,
        visibleCount:end,rows:safeRows.slice(0,end),pageSize:page.limit};
}
function renderClientBrowsePageFooter(view = '', key = '', total = 0, page = {}) {
    if (page.end >= total) return '';
    const identity = encodeURIComponent(JSON.stringify([view,key]));
    return '<bloomscapes-page-edge data-page="client-browse" data-key="'+identity+'"></bloomscapes-page-edge>';
}

function advanceClientBrowseEdge(identity) {
    const [view,key] = JSON.parse(decodeURIComponent(identity));
    loadMoreClientBrowseRows(view,key);
}

function loadMoreClientBrowseRows(view = '', key = '', direction = 1) {
    const safeView = String(view || '').trim();
    const safeKey = String(key || '').trim();
    const pageIndex = Math.floor(Number(clientBrowsePageCounts.get(safeKey)) || 0);
    clientBrowsePageCounts.set(safeKey, Math.max(0, pageIndex + (Number(direction) < 0 ? -1 : 1)));
    while (clientBrowsePageCounts.size > 24) clientBrowsePageCounts.delete(clientBrowsePageCounts.keys().next().value);
    const render = {av:()=>scheduleAVRender(0),drive:()=>scheduleDriveFilterRender(0,32,true),
        request:()=>scheduleRequestRender(0,44,true),docks:()=>scheduleDocksRender(0)};
    if (Object.hasOwn(render,safeView)) render[safeView]();
    return false;
}
