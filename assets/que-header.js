function getRequestHeaderSearchMode() {
    if (activeReqTab === 'suspend-tag') return 'suspend-tag';
    if (activeReqTab !== 'reps') return 'queue';
    if (requestViewLevel === 0) return 'reps';
    if (requestViewLevel === 1) return 'customers';
    if (requestViewLevel === 2) return 'consignees';
    if (requestViewLevel === 3) return 'folders';
    return 'queue';
}

function getRequestHeaderSearchValue(mode) {
    switch (mode) {
        case 'queue': return getQueHeaderSearchTerm();
        case 'suspend-tag': return requestSuspendTagCommonNameSearchTerm;
        case 'folders': return requestFolderSearchTerm;
        case 'folderDate': return requestFolderDateFilter;
        case 'consignees': return requestConsigneeSearchTerm;
        case 'customers': return requestCustomerSearchTerm;
        case 'reps': return requestRepSearchTerm;
        default: return '';
    }
}

function syncRequestHeaderSearchChrome(options = {}) {
    syncQueHeaderLayout();
    const mode = getRequestHeaderSearchMode();
    const previousMode = lastRequestHeaderSearchMode;
    lastRequestHeaderSearchMode = mode;
    const container = document.getElementById('request-search-container');
    const input = document.getElementById('request-search');
    const value = getRequestHeaderSearchValue(mode);
    const placeholder = 'Search Que...';
    if (container) container.classList.toggle('hidden', !mode);
    if (input) {
        input.type = mode === 'folderDate' ? 'date' : 'text';
        if (document.activeElement !== input && input.value !== value) input.value = value;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', placeholder.replace(/\.\.\.$/, ''));
    }
    document.getElementById('request-search-clear')?.classList.toggle('hidden', !String(value || '').trim());
    if (options.forceHeader || previousMode !== mode) syncGlobalHeaderChrome({ reason:'request-search', force:true });
}

function setRequestLegacySearchValue(mode, value) {
    switch (mode) {
        case 'customers': requestCustomerSearchTerm = value; break;
        case 'consignees': requestConsigneeSearchTerm = value; break;
        case 'reps': requestRepSearchTerm = value; break;
        case 'folders': requestFolderSearchTerm = String(value || '').trim(); break;
        case 'folderDate': requestFolderDateFilter = value; break;
        default: return false;
    }
    return true;
}

function handleRequestHeaderSearch() {
    const mode = getRequestHeaderSearchMode();
    const value = document.getElementById('request-search')?.value || '';
    if (mode === 'queue') return setQueHeaderSearch(value);
    if (mode === 'suspend-tag') return setRequestSuspendTagCommonNameSearch(value);
    if (!setRequestLegacySearchValue(mode, value)) return false;
    document.getElementById('request-search-clear')?.classList.toggle('hidden', !String(value).trim());
    if (mode === 'folders' || mode === 'folderDate') {
        const id = mode === 'folders' ? 'request-folder-search-input' : 'request-folder-date-filter';
        const input = document.getElementById(id);
        if (input) input.value = value;
        return applyRequestFolderFilters();
    }
    return scheduleTrackedSearchViewRender('request', 'request-header-search:'+mode, value, { force:true, debounceDelay:1, typingDelay:18 });
}

function clearRequestHeaderSearch() {
    const input = document.getElementById('request-search');
    if (input) input.value = '';
    document.getElementById('request-search-clear')?.classList.add('hidden');
    if (getRequestHeaderSearchMode() === 'suspend-tag') return clearRequestSuspendTagCommonNameSearch();
    return handleRequestHeaderSearch();
}

function buildRequestPagedRenderPlan(mode, crumbText, items) {
    if (typeof rememberOperationalExport === 'function') rememberOperationalExport('request',items);
    const membershipKey = buildRequestBrowseMembershipKey(mode, items);
    const browsePage = getClientBrowsePage('request', membershipKey, items, 8);
    const renderKey = buildRequestChunkRenderKey(mode, crumbText, browsePage.rows);
    return {
        empty: !items.length, crumbText, items, rows: browsePage.rows,
        pageIndex: Number(browsePage.pageIndex), renderKey,
        renderSignature: `${renderKey}:page:${Number(browsePage.pageIndex)}:source:${browsePage.key}`,
        footerMarkup: renderClientBrowsePageFooter('request', browsePage.key, items.length, browsePage)
    };
}

function buildPendingRequestRenderPlan(items) {
    const crumbText = 'All Request Que';
    const eligible = items.filter(isRequestPendingVisible).filter(isRegularRequestQueueItem);
    prepareBloomscapesJobFacets(eligible);
    const candidates = eligible.filter(matchesQueHeaderSearch).filter(matchesBloomscapesJobBoardFilters);
    const pendingItems = typeof applyInventoryExcelFilters === 'function' ? applyInventoryExcelFilters('request',candidates) : candidates;
    if (typeof rememberOperationalExport === 'function') rememberOperationalExport('request',pendingItems);
    if (!pendingItems.length) return { empty: true, crumbText, items: [], rows: [], pageIndex: 0, renderKey: '', renderSignature: '', footerMarkup: '' };
    pendingItems.sort((a, b) => compareLocationCodeValues(a.LOCATIONCODE, b.LOCATIONCODE)
        || naturalCompare(a.LOTCODE, b.LOTCODE)
        || naturalCompare(getItemUniqueId(a), getItemUniqueId(b)));
    const plan = buildRequestPagedRenderPlan('request:pending', crumbText, pendingItems);
    refreshVisiblePendingRequestDelivery(plan.rows);
    return plan;
}

const queHeaderSearchTerms = new Map();

function queHeaderSearchKey() {
    return getSupabaseReadIdentityScope() + ':' + activeReqTab;
}

function getQueHeaderSearchTerm() {
    return queHeaderSearchTerms.get(queHeaderSearchKey()) || '';
}

function matchesQueHeaderSearch(row) {
    const query = getQueHeaderSearchTerm().trim().toLowerCase();
    const text = Object.values(row).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase();
    return query.split(/\s+/).every(word => text.includes(word));
}

function setQueHeaderSearch(value) {
    queHeaderSearchTerms.set(queHeaderSearchKey(), String(value || ''));
    const input = document.getElementById('request-search');
    if (input) input.value = value;
    document.getElementById('request-search-clear')?.classList.toggle('hidden', !value);
    const native = document.querySelector('#request-content input[type="search"], #request-content input[placeholder*="Search" i]');
    if (activeReqTab !== 'pending' && native) {
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(native, value);
native.dispatchEvent(new Event('input', { bubbles: true }));
return false;
    }
    return scheduleTrackedSearchViewRender('request', 'queue-header-search', value, { force: true, debounceDelay: 1, typingDelay: 18 });
}

function syncQueHeaderLayout() {
    const row = document.querySelector('#view-request > .freeze-panel');
    const toolbar = document.getElementById('request-filter-toolbar');
    if (getCurrentVisibleViewId() !== 'request' || !row || !toolbar) return;
    if (toolbar.parentElement !== row) row.prepend(toolbar);
    row.dataset.jobBoardHeader = 'true';
}

function syncQueCategoryControl(toolbar, counts) {
    const categories = bloomscapesJobBoardCategories().map(([category,label]) => ({
        key: category,
        label,
        count: bloomscapesWorkKind(category) ? bloomscapesWorkQueueCount(category) : Math.max(0, Number(counts[category]) || 0)
    }));
    syncQueCategoryButtons(toolbar.querySelector('.request-category-options'), categories);
}

function mountQueCategoryControl() {
    const toolbar = document.getElementById('request-filter-toolbar');
    if (!toolbar || toolbar.querySelector('#que-view-select')) return;
    syncQueCategoryControl(toolbar, getRequestTabQueueCounts());
}

function renderRequestCategoryToolbar(counts = null) {
    const toolbar = document.getElementById('request-filter-toolbar');
    if (!toolbar) return false;
    syncQueCategoryControl(toolbar, counts || getRequestTabQueueCounts());
    syncBloomscapesJobBoardToolbar(toolbar);
    toolbar.dataset.toolbarSingleRow = 'true';
    syncQueHeaderLayout();
    if (nativeAuthSessionActive) void ensureBloomscapesFieldQueue().catch(error=>
        globalThis.reportHandledRuntimeIssue?.('field_work_queue',error.code || 'FIELD_WORK_READ_FAILED'));
    return true;
}

function syncQueCategoryCounts(counts, allCounts) {
    const scope = getSupabaseReadIdentityScope();
    const snapshot = requestTabQueueCountsSnapshotScope === scope ? requestTabQueueCountsSnapshot : null;
    renderRequestCategoryToolbar({ ...snapshot, ...allCounts, ...counts });
}

function syncQueCategoryButtons(group, categories) {
    if (!group) return;
    const options = categories.map(({key,label,count}) =>
        `<option value="${escapeHtml(key)}"${activeReqTab===key ? ' selected' : ''}>${escapeHtml(label)} (${escapeHtml(formatRequestTabCount(count))})</option>`).join('');
    const markup = `<label class="bloomscapes-compact-select"><select id="que-view-select" aria-label="Queue" onchange="setReqTab(this.value)"${categories.length<=1 ? ' disabled' : ''}>${options}</select></label>`;
    const focused = group.contains(document.activeElement);
    if (syncRequestChromeMarkup(group,markup,requestCategoryToolbarMarkupByNode) && focused) {
        group.querySelector('select')?.focus({preventScroll:true});
    }
    group.hidden = categories.length === 0;
}

function syncQueActiveCategory(toolbar = document.getElementById('request-filter-toolbar')) {
    if (!toolbar) return;
    const select = toolbar.querySelector('#que-view-select');
    if (select) select.value = activeReqTab;
}

