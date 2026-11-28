/** Render a bounded Assigned Items table for full or preview display.
 * @param {Array} rows
 * @param {boolean} preview
 * @returns {string}
 */
function renderManagerAssignedFallbackRows(rows = [], preview = false) {
    const state = getManagerAssignedColumnState(), limit = BLOOMSCAPES_LIST_PAGE_SIZE;
    const columns = getManagerAssignedColumnDefinitions().slice(0, 9), editable = canManageEvalItemcodeAssignments();
    return '<div data-assigned-fallback style="max-height:65vh;overflow:auto"' + (preview ? '' : ' onscroll="appendManagerAssignedFallbackPage(this)" onclick="handleManagerAssignedFallbackPicker(event)"') + '><table class="ai-primary-columns"><colgroup>' + (editable ? '<col class="ai-select-col">' : '')
        + columns.map(([field]) => '<col data-field="' + field + '">').join('') + '</colgroup><thead><tr>' + (editable ? '<th>Select</th>' : '')
        + columns.map(([field,label]) => '<th>' + (preview ? escapeHtml(label) : renderManagerAssignedColumnTrigger(field,label)) + '</th>').join('') + '</tr></thead><tbody>'
        + assignedFallbackSpacer(state.fallbackStart || 0, columns.length + Number(editable))
        + rows.slice(state.fallbackStart || 0, (state.fallbackStart || 0) + limit)
            .map(row => assignedFallbackRowHtml(row, { state, columns, editable, preview })).join('') + assignedFallbackSpacer(Math.max(0, rows.length - (state.fallbackStart || 0) - limit), columns.length + Number(editable)) + '</tbody></table>' + '</div>';
}

function handleManagerAssignedFallbackPicker(event) {
    const button = event.target.closest('[data-default-owner]');
    if (!button || !canManageEvalItemcodeAssignments() || !isManagerAssignedSnapshotCurrent()) return;
    const code = button.dataset.defaultOwner;
    const choices = [['','Unassigned'],...getManagerAssignableOwnerUsers().map(user =>
        [normalizeEvalAssignableUser(user),getEvalAssignableUserLabel(user)])];
    openBloomscapesChoicePicker(button,{label:'Itemcode Default Owner '+code,choices,value:button.dataset.ownerValue,
        current:()=>canManageEvalItemcodeAssignments() && isManagerAssignedSnapshotCurrent(),
        select:value=>assignManagerCheckedItemcodes(code,value)});
}

function appendManagerAssignedFallbackPage(scroller) {
    const state = getManagerAssignedColumnState();
    const rows = getManagerAssignedSelectionSnapshot().rows;
    const start = Math.max(0, Math.floor(scroller.scrollTop / 48) - 10);
    if (state.fallbackStart === start || state.fallbackFrame) return;
    state.fallbackFrame = requestAnimationFrame(() => {
        state.fallbackFrame = 0;
        if (!scroller.isConnected || state !== getManagerAssignedColumnState()) return;
        state.fallbackStart = Math.min(start, Math.max(0, rows.length - BLOOMSCAPES_LIST_PAGE_SIZE));
        const template = document.createElement('template');
        template.innerHTML = renderManagerAssignedFallbackRows(rows);
        scroller.querySelector('tbody').replaceChildren(...template.content.querySelector('tbody').childNodes);
    });
}

function assignedFallbackRowHtml(row, { state, columns, editable, preview }) {
            const code = buildManagerEvalAssignmentKey(row.ITEMCODE), attr = escapeHtml(JSON.stringify(code));
            return '<tr style="height:48px;white-space:nowrap" data-manager-assigned-item-row="' + escapeHtml(code) + '">'
                + (editable ? '<td><input type="checkbox" aria-label="Select ' + escapeHtml(code) + ' for bulk assignment" data-itemcode="' + escapeHtml(code) + '"' + (preview ? ' disabled' : '') + (managerEvalAssignmentSelection.has(code) ? ' checked' : '') + ' onchange="toggleManagerEvalAssignmentItem(' + attr + ',&quot;&quot;,this.checked);updateManagerAssignedItemsView()"></td>' : '')
                + columns.map(([field]) => assignedFallbackCellHtml(row, field, code, { state, editable, preview })).join('') + '</tr>';
}

function assignedFallbackCellHtml(row, field, code, { state, editable, preview }) {
    if (field === 'DEFAULT_ASSIGNEDTO' && editable && !preview) {
        const value = String(state.defaultDrafts?.[code]?.assignedto ?? row[field] ?? '');
        return '<td><button type="button" aria-haspopup="dialog" aria-label="Itemcode Default Owner ' + escapeHtml(code)
            + '" data-default-owner="' + escapeHtml(code) + '" data-owner-value="' + escapeHtml(value) + '">'
            + escapeHtml(value || 'Unassigned') + ' ▾</button></td>';
    }
    return '<td>' + escapeHtml(row[field] || (field === 'LOCATIONCODE' ? '—' : row[field] ?? '')) + '</td>';
}

/** Render the initial window of Assigned Items into its host.
 * @param {Element} host
 * @param {Array} rows
 * @returns {void}
 */
function renderAssignedItemsFirstFrame(host, rows) {
    host.innerHTML = renderManagerTableManagementWorkspace(renderManagerAssignedFallbackRows([], true), 'assigned-items');
    const body = host.querySelector('[data-assigned-fallback] tbody');
    if (!body) return;
    const state = getManagerAssignedColumnState();
    const columns = getManagerAssignedColumnDefinitions().slice(0, 9);
    const editable = canManageEvalItemcodeAssignments();
    mountChunkedList(body, rows, row => (
        bloomscapesListNode(assignedFallbackRowHtml(row, {state, columns, editable, preview:true})).firstElementChild
    ));
}

async function mountManagerAssignedItemsView(host, rows = null, totalRows = null) {
    if (!host || !canViewAssignedItemsExport()) return null;
    const state = getManagerAssignedColumnState();
    const visibleRows = Array.isArray(rows) ? rows : getManagerAssignedItemsDisplayRows();
    const fullSourcesReady = isDatasetLoaded('master', 'full') && isDatasetLoaded('warehouseAssignedItems', 'full');
    if (!visibleRows.length && !fullSourcesReady) return state.view || null;
    let pageSource = null;
    if (!host.isConnected || !canViewAssignedItemsExport()) return null;
    state.viewPageSource = pageSource;
    state.viewRows = pageSource ? [] : rows;
    state.viewTotalRows = pageSource ? null : totalRows;
    const restoreScroll = state.restoreScroll ? state.scroll : null;
    if (state.viewHost === host && state.view) { updateManagerAssignedItemsView(); return state.view; }
    if (state.viewHost !== host) destroyManagerAssignedItemsView();
    state.viewHost = host;
    const ticket = state.viewTicket = (state.viewTicket || 0) + 1;
    if (!document.getElementById('manager-assigned-items-style')) {
        const link = document.createElement('link');
        link.id = 'manager-assigned-items-style'; link.rel = 'stylesheet';
        link.href = `./assets/assigned-items.css?v=${encodeURIComponent(APP_VERSION)}`;
        document.head.appendChild(link);
    }
    try {
        state.viewModule ||= import(new URL(`./assets/assigned-items-table.js?v=${encodeURIComponent(APP_VERSION)}`, document.baseURI).href);
        const module = await state.viewModule;
        if (state !== getManagerAssignedColumnState() || state.viewTicket !== ticket || !host.isConnected || !canViewAssignedItemsExport()) return null;
        state.view = module.mountAssignedItems(host, getManagerAssignedItemsViewProps(rows, totalRows));
        scheduleAssignedMountedScroll(state, ticket, host, restoreScroll);
        return state.view;
    } catch {
        if (state !== getManagerAssignedColumnState() || state.viewTicket !== ticket || !host.isConnected) return null;
        state.viewModule = null;
        globalThis.GncRuntimeWatchdog?.captureHandled?.('assigned_items_module_fallback');
        const update = () => { const props = getManagerAssignedItemsViewProps(); host.dataset.logicalRowCount = String(props.rows.length); host.innerHTML = renderManagerAssignedFallbackRows(props.rows); };
        state.view = { update, destroy() {} }; update(); return state.view;
    }
}

function assignedFallbackSpacer(count, columns) {
    return count > 0 ? '<tr aria-hidden="true"><td colspan="' + columns + '" style="padding:0;height:' + count * 48 + 'px"></td></tr>' : '';
}

function scheduleAssignedItemsPrewarm() {
    if (typeof currentUser !== 'string' || !currentUser || getCurrentVisibleViewId()!=='managers'
        || activeHomeTab!==MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW || !canViewAssignedItemsExport() || !fullInventory.length) return;
    const state = getManagerAssignedColumnState();
    if (state.prewarmPending) return;
    state.prewarmPending = true;
    setTimeout(() => {
        state.prewarmPending = false;
        if (state !== getManagerAssignedColumnState() || !canViewAssignedItemsExport()) return;
        prewarmAssignedItems(state);
    }, 0);
}

function prewarmAssignedItems(state) {
    const rows = getManagerAssignedItemsDisplayRows();
    rememberManagerAssignedColumnLabels(rows);
    state.viewModule ||= import(new URL('./assets/assigned-items-table.js?v=' + encodeURIComponent(APP_VERSION), document.baseURI).href);
    state.viewModule.catch(() => { if (state === getManagerAssignedColumnState()) state.viewModule = null; });
}

function openAssignedItemsFirstFrame(state) {
    const host = document.getElementById('managers-content');
    if (!host) return;
    state.fallbackStart = 0;
    const input = fullInventory.length ? fullInventory : warehouseAssignedItemsInventory;
    const warm = state.displayCache?.input === input && state.displayCache.signature === getManagerAssignedDisplaySignature(state, input === fullInventory, getManagerItemLowStockTargetsState().revision);
    if (warm) {
        state.opening = null;
        return renderManagers();
    }
    const ticket = state.opening = {};
    const rows = getManagerAssignedItemsDisplayRows(input.slice(0, BLOOMSCAPES_LIST_PAGE_SIZE), { useMaster: input === fullInventory });
    renderAssignedItemsFirstFrame(host, rows);
    requestAnimationFrame(() => setTimeout(() => finishAssignedItemsFirstFrame(state, ticket), 0));
}

function finishAssignedItemsFirstFrame(state, ticket) {
    if (state !== getManagerAssignedColumnState() || state.opening !== ticket
        || activeHomeTab !== MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW || !isViewVisible('managers') || !canViewAssignedItemsExport()) return;
    prewarmAssignedItems(state);
    state.opening = null;
    renderManagers();
}

function restoreAssignedMountedScroll(state, ticket, host, restoreScroll) {
    if (state !== getManagerAssignedColumnState() || state.viewTicket !== ticket || !host.isConnected) return;
    schedulePostRenderMainAreaScrollRestore('managers', 'assigned-items-mounted', restoreScroll);
}

function scheduleAssignedMountedScroll(state, ticket, host, restoreScroll) {
    if (restoreScroll == null || state.viewUi?.anchor) return;
    requestAnimationFrame(() => requestAnimationFrame(() => restoreAssignedMountedScroll(state, ticket, host, restoreScroll)));
}

const ASSIGNED_OPTION_HEIGHT = 36;
const assignedOptionsWindows = new WeakMap();

function renderManagerAssignedColumnOptions() {
    const editor = getManagerAssignedColumnState().editor;
    const host = document.getElementById('manager-assigned-filter-options');
    if (!editor || !host) return;
    const options = getManagerAssignedPopoverOptions(editor);
    scopeManagerAssignedSearch(editor,options);
    let window = assignedOptionsWindows.get(host);
    if (!window) {
        window = {frame:0,start:-1};
        assignedOptionsWindows.set(host,window);
        host.addEventListener('scroll',()=>scheduleAssignedOptionWindow(host,window),{passive:true});
    }
    Object.assign(window,{editor,options,start:-1});
    paintAssignedOptionWindow(host,window);
}

function scheduleAssignedOptionWindow(host,window) {
    if (window.frame) return;
    window.frame = requestAnimationFrame(()=>{
        window.frame = 0;
        if (host.isConnected && getManagerAssignedColumnState().editor===window.editor) paintAssignedOptionWindow(host,window);
    });
}

function paintAssignedOptionWindow(host,window) {
    const {editor,options} = window;
    const scroll = host.scrollTop;
    const start = Math.max(0,Math.floor(scroll/ASSIGNED_OPTION_HEIGHT)-4);
    const count = Math.ceil((host.clientHeight || 300)/ASSIGNED_OPTION_HEIGHT)+9;
    const stop = Math.min(start+count,options.length);
    if (start===window.start && stop===window.stop) return;
    Object.assign(window,{start,stop});
    const selected = editor.values===null ? null : new Set(editor.values);
    const active = host.contains(document.activeElement) ? document.activeElement.value : null;
    const entries = options.slice(start,stop).map(option=>buildAssignedOption(option,selected));
    host.replaceChildren(assignedOptionSpacer(start),...entries,assignedOptionSpacer(options.length-stop));
    if (!options.length) host.textContent = 'No values match.';
    if (active!==null) {
        const retained = entries.find(label=>label.firstChild.value===active)?.firstChild;
        (retained || document.getElementById('manager-assigned-value-search'))?.focus({preventScroll:true});
    }
    host.scrollTop = scroll;
}

function assignedOptionSpacer(count) {
    const spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden','true');
    spacer.style.height = count * ASSIGNED_OPTION_HEIGHT + 'px';
    return spacer;
}

function buildAssignedOption({value,label,count},selected) {
    const row = document.createElement('label');
    row.className = 'excel-filter-option assigned-filter-option';
    const input = row.appendChild(document.createElement('input'));
    input.type = 'checkbox';
    input.value = value;
    input.checked = !selected || selected.has(value);
    input.onchange = () => toggleManagerAssignedColumnValue(value,input.checked);
    row.appendChild(document.createElement('span')).textContent = label + ' (' + count + ')';
    return row;
}


function openManagerAssignedColumnFilter(field, trigger) {
    if (!canViewAssignedItemsExport() || !getManagerAssignedColumnDefinitions().some(([key]) => key === field)) return false;
    const state = getManagerAssignedColumnState();
    state.editor = { field, values: Array.isArray(state.filters[field]) ? state.filters[field].slice() : null,
        sort: state.sort ? { ...state.sort } : null, search: '', trigger };
    let host = document.getElementById('manager-assigned-filter-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'manager-assigned-filter-host';
        document.body.appendChild(host);
    }
    const label = getManagerAssignedColumnDefinitions().find(([key]) => key === field)[1];
    host.innerHTML = `<section id="manager-assigned-filter-panel" class="excel-filter-panel assigned-column-panel fixed" role="dialog" aria-modal="false" aria-label="${escapeHtml(label)} filter" onkeydown="handleManagerAssignedFilterKey(event)">
        <div class="assigned-filter-body"><strong>${escapeHtml(label)}</strong>
        <div class="assigned-filter-sort"><button type="button" data-assigned-sort="asc" onclick="setManagerAssignedDraftSort('asc')">Sort A–Z ↑</button><button type="button" data-assigned-sort="desc" onclick="setManagerAssignedDraftSort('desc')">Sort Z–A ↓</button><button type="button" data-assigned-sort="none" onclick="setManagerAssignedDraftSort('none')">Clear Sort</button></div>
        <label class="excel-filter-search-wrap">Search values<input id="manager-assigned-value-search" class="excel-filter-search" type="search" autocomplete="off" oninput="searchManagerAssignedColumnOptions(this.value)"></label>
        <div class="assigned-filter-selection"><button type="button" onclick="selectManagerAssignedColumnValues(true)">Select All</button><button type="button" onclick="selectManagerAssignedColumnValues(false)">Clear Selection</button><button type="button" onclick="clearManagerAssignedColumnFilter('${field}')">Clear Column Filter</button></div>
        <div id="manager-assigned-filter-options" class="excel-filter-options"></div></div>
        <div class="excel-filter-footer assigned-filter-actions"><button type="button" onclick="closeManagerAssignedColumnFilter()">Cancel</button><button type="button" class="assigned-filter-apply" onclick="applyManagerAssignedColumnFilter()">Apply</button></div>
    </section>`;
    document.querySelectorAll('[data-assigned-filter-trigger]').forEach(button => button.setAttribute('aria-expanded', String(button.dataset.assignedFilterTrigger === field)));
    renderManagerAssignedColumnOptions();
    syncManagerAssignedDraftSortButtons();
    positionManagerAssignedColumnFilter();
    document.getElementById('manager-assigned-value-search').focus({ preventScroll: true });
    document.addEventListener('keydown', handleManagerAssignedFilterEscape, true);
    window.addEventListener('resize', positionManagerAssignedColumnFilter);
    window.visualViewport?.addEventListener('resize', positionManagerAssignedColumnFilter);
    window.visualViewport?.addEventListener('scroll', positionManagerAssignedColumnFilter);
    ensureNativeBackGuard();
    return false;
}

function searchManagerAssignedColumnOptions(value) {
    const editor = getManagerAssignedColumnState().editor;
    if (!editor) return;
    if (value.trim() && !editor.searchDraft) {
        editor.searchDraft = { before:editor.values === null ? null : new Set(editor.values), choices:new Map() };
    } else if (!value.trim() && editor.searchDraft) {
        editor.values = editor.searchDraft.before === null ? null : Array.from(editor.searchDraft.before);
        delete editor.searchDraft;
    }
    editor.search = value;
    const host = typeof document !== 'undefined' && document.getElementById('manager-assigned-filter-options');
    if (host) host.scrollTop = 0;
    renderManagerAssignedColumnOptions();
}

function selectManagerAssignedColumnValues(all) {
    const editor = getManagerAssignedColumnState().editor;
    if (!editor) return;
    const options = getManagerAssignedPopoverOptions(editor);
    const values = new Set(options.filter(option => editor.values === null || editor.values.includes(option.value)).map(option => option.value));
    for (const option of options) {
        editor.searchDraft?.choices.set(option.value, all);
        if (all) values.add(option.value);
        else values.delete(option.value);
    }
    editor.values = Array.from(values);
    renderManagerAssignedColumnOptions();
}


function toggleManagerAssignedColumnValue(value, checked) {
    const editor = getManagerAssignedColumnState().editor;
    if (!editor) return;
    const values = new Set(editor.values === null ? getManagerAssignedColumnOptions(editor.field).map(option => option.value) : editor.values);
    editor.searchDraft?.choices.set(value, checked);
    if (checked) values.add(value); else values.delete(value);
    editor.values = Array.from(values);
}
