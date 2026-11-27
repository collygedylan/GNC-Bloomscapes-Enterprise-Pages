const avOptionCheckboxSelector = '[data-request-itemcode-option="true"]';
const avOptionDraftSelector = 'input[id^="suspend-split-"], [data-pull-code], [data-pull-lot]';

/** @param {HTMLElement} panel @param {object} state @returns {Set<string>} */
function rememberRequestAvOptionSelection(panel, state) {
    const selected = state.selectedOptionIds ||= new Set();
    if (panel?.__requestAvSelectionOwner !== state) return selected;
    for (const input of panel.querySelectorAll(avOptionCheckboxSelector)) {
        if (!input.value) continue;
        if (input.checked && !input.disabled) selected.add(input.value);
        else selected.delete(input.value);
    }
    return selected;
}

/** @param {HTMLInputElement|null} [input] @returns {boolean} */
function syncSuspendAvOptionSelectionControls(input = null) {
    const panel = input?.closest?.('#detail-av-options-panel, #req-matching-inventory-container')
        || document.getElementById('detail-av-options-panel') || document.getElementById('req-matching-inventory-container');
    if (!panel) return false;
    const state = panel.__requestAvSelectionOwner;
    const selectedCount = state ? rememberRequestAvOptionSelection(panel, state).size
        : panel.querySelectorAll('[data-request-itemcode-option="true"]:checked').length;
    const headerAction = panel.querySelector('[data-suspend-av-header-action="true"]');
    const sticky = panel.querySelector('[data-suspend-av-sticky]');
    const stickyAction = sticky?.querySelector('[data-suspend-av-add]');
    const countLabel = sticky?.querySelector('[data-suspend-av-selection-count]');
    if (headerAction) headerAction.disabled = selectedCount === 0;
    if (sticky) sticky.classList.toggle('hidden', selectedCount === 0);
    if (stickyAction) stickyAction.disabled = selectedCount === 0;
    if (countLabel) countLabel.textContent = `${selectedCount} selected`;
    return false;
}

/** @param {HTMLElement} panel @param {object} state @param {Array<object>} rows @returns {void} */
function syncRenderedAvOptionSelection(panel, state, rows) {
    const allowed = new Set(rows.map(getRequestItemCodeOptionMasterId));
    for (const id of state.selectedOptionIds) {
        if (!allowed.has(id)) state.selectedOptionIds.delete(id);
    }
    panel.__requestAvSelectionOwner = state;
    for (const input of panel.querySelectorAll(avOptionCheckboxSelector)) {
        input.checked = !input.disabled && state.selectedOptionIds.has(input.value);
    }
    syncSuspendAvOptionSelectionControls(panel.querySelector(avOptionCheckboxSelector));
}

/** @param {HTMLElement} panel @param {object} state @param {boolean} [restore] @returns {void} */
function keepRequestAvOptionDraftInputs(panel, state, restore = false) {
    if (panel.__requestAvSelectionOwner !== state) return;
    const drafts = state.optionInputDrafts ||= new Map();
    for (const input of panel.querySelectorAll(avOptionDraftSelector)) {
        const key = input.id || 'manual-lot';
        if (restore) input.value = drafts.get(key) || '';
        else if (input.value) drafts.set(key, input.value);
        else drafts.delete(key);
    }
}

let avInventoryOptionIndex = null;

function indexAvInventoryOptions(rows) {
    const byCode = new Map();
    for (const row of rows) {
        const code = getRequestItemCodeOptionItemCode(row);
        if (!code) continue;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push(row);
    }
    return byCode;
}

/** @param {object} item @param {Array<object>} rows @param {number} revision @returns {Array<object>} */
function getAvInventoryOptionRowsForItem(item, rows, revision) {
    const code = getRequestItemCodeOptionItemCode(item);
    if (!code || !Array.isArray(rows) || !rows.length) return [];
    const owner = getSupabaseReadIdentityScope();
    const index = avInventoryOptionIndex;
    if (index?.rows !== rows || index.owner !== owner || index.revision !== revision || index.count !== rows.length) {
        avInventoryOptionIndex = { rows, owner, revision, count: rows.length, byCode: indexAvInventoryOptions(rows) };
    }
    return avInventoryOptionIndex.byCode.get(code) || [];
}

/** @param {number} direction @returns {boolean} */
function changeRequestAvOptionPage(direction) {
    if (!activeItem || requestAvOptionsDropdownOpen !== true) return false;
    const state = ensureRequestItemCodeOptionState(activeItem);
    state.optionPage = Math.max(0, (state.optionPage || 0) + (direction < 0 ? -1 : 1));
    renderRequestMatchingInventoryOptions(activeItem, activeDetailSourceView || lastView || '', { skipLoad: true });
    return false;
}

function renderRequestAvOptionPager(page, total) {
    if (page.start+page.rows.length >= total) return '';
    return '<bloomscapes-page-edge data-page="request-av-options"></bloomscapes-page-edge>';
}

function prepareRequestAvOptions(item, detailSourceView, options) {
            const sharedPanel = document.getElementById('detail-av-options-panel');
            const legacyPanel = document.getElementById('req-matching-inventory-container');
            const panel = sharedPanel || legacyPanel;
            if (!panel) return null;
            const hidePanels = (panels) => {
                panels.filter(Boolean).forEach((target) => {
                    target.classList.add('hidden');
                    target.innerHTML = '';
                });
            };
            const safeSourceView = String(detailSourceView || activeDetailSourceView || lastView || '').trim().toLowerCase();
            if (safeSourceView === 'crop-roll') {
                hidePanels([panel, legacyPanel]);
                requestAvOptionsDropdownOpen = false;
                syncDetailSharedPanelsVisibility();
                syncRequestDetailScrollMode();
                return null;
            }
            const canShowAvOptions = !!(item && getRequestItemCodeOptionItemCode(item));
            const isRequestDetail = item && isRequestDetailItem(item, safeSourceView);
            const canAddOptions = !!(isRequestDetail && canAddRequestItemCodeOptions());
            if (!canShowAvOptions) {
                hidePanels([panel, legacyPanel]);
                syncDetailSharedPanelsVisibility();
                syncRequestDetailScrollMode();
                return null;
            }
            const state = ensureRequestItemCodeOptionState(item);
            if (!options || options.skipLoad !== true) void loadRequestItemCodeOptions(item, state.key);
            const allRows = getRequestItemCodeOptionRows(item);
            const rows = isDockSuspendDcRequestMirrorRow(item) ? allRows : filterDriveNegativeSltsAvOptionRows(allRows, safeSourceView);
            const hiddenCurrentSeasonRows = Math.max(0, allRows.length - rows.length);
            const isOpen = requestAvOptionsDropdownOpen === true;
            const suspendFillTag = isDockSuspendDcRequestMirrorRow(item);
            return { panel, sharedPanel, legacyPanel, state, rows, hiddenCurrentSeasonRows, isOpen, suspendFillTag, canAddOptions };
}

function renderRequestAvOptionCard(row, index, item, context, existingKeysForRender) {
    const {canAddOptions, suspendFillTag} = context;
                const uid = getRequestItemCodeOptionMasterId(row);
                const location = String(firstNonEmptyValue(row.LOCATIONCODE, row.locationcode, 'No Loc') || 'No Loc');
                const lot = String(firstNonEmptyValue(row.LOTCODE, row.lotcode, '-') || '-');
                const candidateState = getRequestItemCodeOptionCandidateState(row, item, existingKeysForRender);
                const selectable = canAddOptions && candidateState.selectable;
                const disabledAttr = selectable ? '' : ' disabled aria-disabled="true"';
                const reasonText = canAddOptions && candidateState.reason ? String(candidateState.reason || '').trim() : '';
                const optionRow = row && typeof row === 'object' ? row : {};
                if (!optionRow.DOM_ID) optionRow.DOM_ID = `reqopt_${uid || index}`;
                normalizeRowPhotoFields(optionRow);
                const sendToEvalHtml = '';
                const selectText = selectable ? 'Select Option' : (canAddOptions ? 'Unavailable Option' : 'AV Option');
                const selectControlHtml = canAddOptions
                    ? `<label class="request-av-option-selectbar" onclick="event.stopPropagation();">
                        <span class="request-av-option-selectbar-main"><input type="checkbox" data-request-itemcode-option="true" value="${esc(uid)}"${disabledAttr}${suspendFillTag ? ' onchange="return syncSuspendAvOptionSelectionControls(this)"' : ''}><span>${escapeShareHtml(selectText)}</span></span>
                        <span class="request-av-option-selectbar-meta">${escapeShareHtml(location)} | Lot ${escapeShareHtml(lot)}</span>
                        ${reasonText ? `<span class="request-av-option-selectbar-reason">${escapeShareHtml(reasonText)}</span>` : ''}
                    </label>`
                    : `<div class="request-av-option-selectbar">
                        <span class="request-av-option-selectbar-main"><span>${escapeShareHtml(selectText)}</span></span>
                        <span class="request-av-option-selectbar-meta">${escapeShareHtml(location)} | Lot ${escapeShareHtml(lot)}</span>
                    </div>`;
                return `<div class="request-av-option-full-card ${selectable || !canAddOptions ? '' : 'is-disabled'}" data-request-itemcode-option-card="${esc(uid)}">
                    ${selectControlHtml}
                    ${sendToEvalHtml}
                    <div class="mb-2 flex flex-wrap gap-1.5">${getRequestItemCodeOptionHoldBadgeHtml(optionRow)}${getRequestItemCodeOptionValidBadgeHtml(optionRow)}</div>
                    ${suspendFillTag ? `<div class="suspend-av-option-evidence"><div class="request-av-option-card-shell">${generateCard(optionRow, 'drive')}</div></div>` : `<div class="request-av-option-card-shell">${generateCard(optionRow, 'drive')}</div>`}
                    ${suspendFillTag && selectable ? buildSuspendLocationOptionActions(item, optionRow) : ''}
                </div>`;
}

function renderLegacyRequestAvOptions(item, context) {
    const {rows, state, hiddenCurrentSeasonRows, isOpen, suspendFillTag, canAddOptions, page} = context;
    const itemCode = getRequestItemCodeOptionItemCode(item);
    const visibleRows = isOpen ? rows.slice(0,page.start+page.rows.length) : [];
    const existing = isOpen ? getExistingRequestItemCodeOptionKeys(item) : { masterIds:new Set(), exactKeys:new Set() };
    const selectableRowCount = isOpen && !suspendFillTag ? rows.filter(row => getRequestItemCodeOptionCandidateState(row, item, existing).selectable).length : 0;
            const ptrValues = rows.map((row) => getRequestAvailableQty(row)).filter((value) => Number.isFinite(value));
            const bestPtr = ptrValues.length ? Math.max(...ptrValues) : 0;
            const totalPtr = ptrValues.reduce((sum, value) => sum + value, 0);
            const formatPtr = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '0';
            const loadingHtml = '';
            const errorHtml = state.error ? `<div class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">${escapeShareHtml(state.error)}</div>` : '';
            const hiddenCurrentSeasonHtml = hiddenCurrentSeasonRows
                ? `<div class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-amber-800">${escapeShareHtml(String(hiddenCurrentSeasonRows))} current season row${hiddenCurrentSeasonRows === 1 ? '' : 's'} hidden in Negative SLTS.</div>`
                : '';
            const emptyRowsMessage = hiddenCurrentSeasonRows
                ? 'No AV options outside current season for this itemcode.'
                : 'No AV options found for this itemcode.';
    const rowsHtml = visibleRows.map((row,index) => renderRequestAvOptionCard(row,index,item,context,existing)).join('') || (isOpen ? `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-[12px] font-bold text-slate-400">${state.loading ? 'Loading AV options...' : escapeShareHtml(emptyRowsMessage)}</div>` : '');
            const pagerHtml = renderRequestAvOptionPager(page, rows.length);
            const addOptionsLabel = suspendFillTag ? '+ Add Selected AV Option(s) / Fill Tag' : 'Add Selected Options';
            const addButtonHtml = canAddOptions && (suspendFillTag || selectableRowCount) ? `<button type="button" data-suspend-av-add${suspendFillTag ? ' data-suspend-av-header-action="true"' : ''} class="rounded-xl bg-[#007a4d] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"${suspendFillTag ? ' disabled' : ''} onclick="event.stopPropagation(); return addSelectedRequestItemCodeOptions()">${escapeShareHtml(addOptionsLabel)}</button>` : '';
            return `<div class="flex flex-col">
                <div class="request-av-options-header flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-left shadow-sm dark:bg-[var(--bg-surface)] dark:text-[var(--text-main)] dark:border-[var(--border-subtle)]">
                    <button type="button" class="min-w-0 flex-1 bg-transparent p-0 text-left" onclick="return toggleRequestAvOptionsDropdown()" aria-expanded="${isOpen ? 'true' : 'false'}">
                    <span class="min-w-0">
                        <span class="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700"><i class="ph-bold ph-map-pin-line text-sm"></i><span>AV Options</span></span>
                        <span class="mt-1 block truncate text-sm font-black text-slate-900">${escapeShareHtml(itemCode || 'Itemcode')} <span class="text-slate-400">|</span> ${escapeShareHtml(String(rows.length))} row${rows.length === 1 ? '' : 's'}</span>
                        <span class="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[0.12em]">
                            <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800">Best PTR ${escapeShareHtml(formatPtr(bestPtr))}</span>
                            <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 dark:bg-[var(--bg-surface)] dark:text-[var(--text-main)] dark:border-[var(--border-subtle)]">Total PTR ${escapeShareHtml(formatPtr(totalPtr))}</span>
                        </span>
                    </span>
                    <span class="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800">${isOpen ? 'Hide' : 'Show'}<i class="ph-bold ${isOpen ? 'ph-caret-up' : 'ph-caret-down'} text-sm"></i></span>
                    </button>

                </div>
                ${isOpen && suspendFillTag && canAddOptions ? buildSuspendManualPullSelector(visibleRows) : ''}
                    ${loadingHtml}${errorHtml}${hiddenCurrentSeasonHtml}
                ${isOpen ? `${addButtonHtml && !suspendFillTag ? `<div class="mt-3 flex justify-end">${addButtonHtml}</div>` : ''}<div class="mt-3 space-y-2">${rowsHtml}</div>${pagerHtml}${suspendFillTag && addButtonHtml ? `<div data-suspend-av-sticky class="sticky bottom-2 z-30 mt-3 hidden rounded-2xl border border-emerald-200 bg-white/95 p-2 shadow-xl dark:border-emerald-800 dark:bg-slate-900/95"><div class="flex items-center justify-between gap-3"><span data-suspend-av-selection-count class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-200">0 selected</span><button type="button" data-suspend-av-add class="rounded-xl bg-[#007a4d] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50" disabled onclick="event.stopPropagation(); return addSelectedRequestItemCodeOptions()">+ ADD SELECTED LOCATION(S) TO TAG</button></div></div>` : ''}` : ''}
            </div>`;
}

function renderCompactAvOption(row, item, existing, canAdd) {
    const candidate = getRequestItemCodeOptionCandidateState(row, item, existing);
    const uid = getRequestItemCodeOptionMasterId(row);
    const metrics = resolveCanonicalInventoryRow(row) || row;
    const values = [row.LOCATIONCODE || row.locationcode, row.LOTCODE || row.lotcode,
        firstNonEmptyValue(row.PRIORITY,row.priority,'--'), getCardPtrOnHandValue(metrics),
        getCardPtrAvailableValue(metrics), getCardOpenStockValue(metrics), getRequestAvailableQty(metrics)];
    const labels = ['Location','Lot','Priority','On Hand','Available','Open Stock','PTR'];
    const cells = values.map((value,index) => `<span><small>${escapeShareHtml(labels[index])}</small>${escapeShareHtml(String(value ?? '--'))}</span>`).join('');
    return `<label class="detail-av-option" title="${escapeShareHtml(candidate.reason || '')}">
        <input type="checkbox" data-request-itemcode-option="true" value="${escapeShareHtml(uid)}"
            aria-label="Select ${escapeShareHtml(String(values[0]))} ${escapeShareHtml(String(values[1]))}"
            ${canAdd && candidate.selectable ? '' : 'disabled'} onchange="return syncSuspendAvOptionSelectionControls(this)">
        <span class="detail-av-option-values">${cells}</span></label>`;
}

function renderCompactRequestAvOptions(item, context) {
    const {rows, state, isOpen, canAddOptions, suspendFillTag, page} = context;
    const values = rows.map(getRequestAvailableQty).filter(Number.isFinite);
    const best = values.length ? Math.max(...values) : 0;
    const total = values.reduce((sum,value) => sum + value,0);
    const existing = isOpen ? getExistingRequestItemCodeOptionKeys(item) : null;
    const destination = suspendFillTag ? 'Suspend' : 'Request';
    const candidates = isOpen ? rows.slice(0,page.start+page.rows.length).map(row => renderCompactAvOption(row,item,existing,canAddOptions)).join('') : '';
    const error = state.error ? `<p role="alert">${escapeShareHtml(state.error)}</p>` : '';
    return `<div class="detail-av-dropdown">
        <button type="button" class="detail-av-trigger" aria-expanded="${isOpen}" aria-controls="detail-av-options-list"
            onclick="return toggleRequestAvOptionsDropdown()">📍 AV Options (${rows.length} rows · Best PTR ${best} · Total ${total}) ${isOpen ? '▴' : '▾'}</button>
        ${isOpen ? `<div id="detail-av-options-list" class="detail-av-menu" aria-label="AV inventory options">
            ${error}${candidates || '<p>No AV options found for this item.</p>'}${renderRequestAvOptionPager(page, rows.length)}
            ${canAddOptions ? `<button type="button" class="detail-av-add" data-suspend-av-add data-suspend-av-header-action="true" disabled
                onclick="return addSelectedRequestItemCodeOptions()">+ Add Selected to ${destination}</button>` : ''}</div>` : ''}</div>`;
}

/** @param {object} [item] @param {string} [detailSourceView] @param {object} [options] @returns {void} */
function renderRequestMatchingInventoryOptions(item = activeItem, detailSourceView = '', options = {}) {
    const context = prepareRequestAvOptions(item,detailSourceView,options);
    if (!context) return;
    const {panel, sharedPanel, legacyPanel, state, rows} = context;
    const compact = isCompactQueueDetail(item,detailSourceView || activeDetailSourceView || lastView);
    rememberRequestAvOptionSelection(panel, state);
    keepRequestAvOptionDraftInputs(panel, state);
    context.page = bloomscapesListWindow(rows, state.optionPage, compact ? 20 : 8);
    state.optionPage = context.page.index;
    panel.innerHTML = compact ? renderCompactRequestAvOptions(item,context) : renderLegacyRequestAvOptions(item,context);
    if (context.isOpen && context.canAddOptions) {
        syncRenderedAvOptionSelection(panel, state, rows);
        keepRequestAvOptionDraftInputs(panel, state, true);
    }
    panel.classList.remove('hidden');
    if (sharedPanel && legacyPanel && legacyPanel !== sharedPanel) {
        legacyPanel.classList.add('hidden');
        legacyPanel.replaceChildren();
    }
    syncDetailSharedPanelsVisibility();
    syncRequestDetailScrollMode();
}
