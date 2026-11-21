let activeDriveReport2State;

function newDriveReport2State(context) {
    const fields = new Map(context.fields.map(field => [field.key, field]));
    return {
        ...context, fields, layout: driveReport2Layout(context.fields), rawRows: null, rows: [], filtered: [],
        saved: { reports: [] }, savedId: '', savedMessage: '', busy: false, cards: false, generation: 0
    };
}

function driveReport2StateCurrent(state) {
    return state === activeDriveReport2State && state.owner === getSupabaseReadIdentityScope() && state.farm === getBloomscapesFarm();
}

function driveReport2Shell() {
    return `<section id="drive-custom-reports-v2" aria-label="Reports #2">
        <div class="drive-custom-reports-v2-toolbar">
            <select data-drive-custom-reports-v2-saved aria-label="Saved Reports"></select>
            <button type="button" data-drive-custom-reports-v2-columns>⊞ Columns</button>
            <button type="button" data-drive-custom-reports-v2-save disabled>💾 Save</button>
            <button type="button" data-drive-custom-reports-v2-cards aria-pressed="false">🚗 Cards</button>
            <button type="button" data-drive-custom-reports-v2-csv>📥 CSV</button>
            <button type="button" data-drive-custom-reports-v2-clear>✕ Clear</button>
            <output data-drive-custom-reports-v2-totals aria-live="polite"></output>
        </div>
        <output data-drive-custom-reports-v2-saved-status aria-live="polite"></output>
        <button type="button" data-drive-custom-reports-v2-retry hidden>Retry saved reports</button>
        <div class="drive-custom-reports-v2-grid" role="region" aria-label="Report rows" tabindex="0"></div>
        <div class="drive-custom-reports-v2-cards" hidden></div>
        <dialog class="drive-custom-reports-v2-dialog" aria-label="Report settings"></dialog>
    </section>`;
}

function driveReport2FilteredRows(state, ignored = '') {
    return driveReport2FilterRows(state.rows, state.layout.filters, state.fields, ignored);
}

function driveReport2Result(state) {
    const signature = JSON.stringify([state.layout.filters, state.layout.sorting]);
    if (state.result?.rows === state.rows && state.result.signature === signature) return state.result;
    const filtered = driveReport2SortRows(driveReport2FilteredRows(state), state.layout.sorting, state.fields);
    state.result = { rows: state.rows, signature, filtered, offset: 0, totals: driveReport2Totals([]) };
    return state.result;
}

function displayDriveReport2Totals(output, result) {
    const { filtered, offset, totals } = result;
    const parts = [[filtered.length, 'Rows']];
    if (offset === filtered.length) parts.push([totals.PTRONHAND, 'On Hand'], [totals.PTRAVAILABLE, 'Avail'], [totals.LOC_MATCH_QTY, 'Photo Match']);
    output.textContent = parts.map(([value, label]) => `${label} ${value === null ? '–' : value.toLocaleString()}`).join(' · ');
}

async function updateDriveReport2Totals(state, result) {
    const output = state.root.querySelector('[data-drive-custom-reports-v2-totals]');
    displayDriveReport2Totals(output, result);
    if (result.pending || result.offset === result.filtered.length) return;
    result.pending = true;
    try {
        while (result.offset < result.filtered.length) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (state.result !== result || !state.root.isConnected || !driveReport2StateCurrent(state)) return;
            const until = performance.now() + 4;
            do {
                const end = Math.min(result.filtered.length, result.offset + 16);
                driveReport2Totals(result.filtered, result.totals, result.offset, end);
                result.offset = end;
            } while (result.offset < result.filtered.length && performance.now() < until);
        }
        displayDriveReport2Totals(state.root.querySelector('[data-drive-custom-reports-v2-totals]'), result);
    } finally {
        result.pending = false;
    }
}

function paintDriveReport2(state) {
    const root = state.root;
    const scroll = root.querySelector('.drive-custom-reports-v2-grid');
    const cards = root.querySelector('.drive-custom-reports-v2-cards');
    const result = driveReport2Result(state);
    state.filtered = result.filtered;
    state.generation++;
    root.querySelector('[data-drive-custom-reports-v2-cards]').setAttribute('aria-pressed', String(state.cards));
    scroll.hidden = state.cards;
    cards.hidden = !state.cards;
    if (state.cards) {
        state.renderCards(cards, state.filtered.map(entry => entry.row), state.generation, state.layout.filters);
        scroll.replaceChildren();
    } else {
        window.GncCardWindow?.destroy(cards);
        cards.replaceChildren();
        renderDriveReport2Grid(scroll, state.filtered, state.fields, state.layout);
    }
    paintDriveReport2Saved(root, state);
    void updateDriveReport2Totals(state, result);
}

async function loadDriveReport2Saved(state) {
    if (state.loadingSaved || !driveReport2StateCurrent(state)) return;
    state.loadingSaved = true;
    const revision = state.savedRevision;
    const hadFailure = state.savedLoadFailed;
    try {
        const saved = await listDriveSavedReports(state.farm);
        if (!driveReport2StateCurrent(state) || revision !== state.savedRevision) return;
        state.savedLoadFailed = false;
        const signature = JSON.stringify(saved);
        if (signature === state.savedSignature && !hadFailure) return;
        state.savedMessage = '';
        state.savedSignature = signature;
        state.saved = saved;
        paintDriveReport2Saved(state.root, state);
    } catch (error) {
        if (!driveReport2StateCurrent(state)) return;
        state.savedLoadFailed = true;
        state.savedMessage = error?.message || 'Saved reports could not be loaded.';
        paintDriveReport2Saved(state.root, state);
    } finally {
        state.loadingSaved = false;
    }
}

function driveReport2Selected(state) {
    return state.saved.reports.find(report => String(report.id) === state.savedId);
}

function driveReport2ResetGrid(state) {
    state.root.querySelector('.drive-custom-reports-v2-grid').scrollTop = 0;
    paintDriveReport2(state);
}

function driveReport2ApplySaved(state, id) {
    state.savedId = id;
    state.layout = driveReport2Layout([...state.fields.values()], driveReport2Selected(state));
    driveReport2ResetGrid(state);
}

function driveReport2SetFilter(state, key, rule) {
    const { filters } = state.layout;
    if (rule) filters[key] = rule;
    else delete filters[key];
    driveReport2ResetGrid(state);
}

function driveReport2SetSort(state, key, direction) {
    state.layout.sorting = [{ column: key, direction }, ...state.layout.sorting.filter(rule => rule.column !== key)];
    driveReport2ResetGrid(state);
}

function driveReport2OpenColumnFilter(state, control) {
    const key = control.dataset.driveCustomReportsV2Filter;
    const field = state.fields.get(key);
    const values = driveReport2Values(driveReport2FilteredRows(state, key), key, field.numeric);
    openDriveReport2Filter(control, field, values, state.layout.filters[key], {
        filter: rule => driveReport2SetFilter(state, key, rule),
        sort: direction => driveReport2SetSort(state, key, direction)
    });
}

function driveReport2Download(state) {
    const columns = driveReport2GridColumnOrder(state.layout);
    const csv = driveReport2Csv(state.filtered, columns, state.fields);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Drive-Reports-2.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function driveReport2HandleColumn(state, dialog, control) {
    const key = control.closest('[data-column]')?.dataset.column;
    if (!state.fields.has(key)) return;
    editDriveReport2Column(state.layout, key, control.dataset.columnAction, control);
    renderDriveReport2Columns(dialog, state.fields, state.layout);
    paintDriveReport2(state);
}

function driveReport2SetPending(state, form, busy) {
    state.busy = busy;
    for (const control of form.querySelectorAll('button')) control.disabled = busy;
}

async function driveReport2SaveCommand(state, dialog, form, deleting = false) {
    if (state.busy || !driveReport2StateCurrent(state)) return;
    const report = driveReport2Selected(state);
    if (!canManageDriveSavedReport(deleting ? report : undefined, state.saved)) return;
    if (deleting && (!report || !canManageDriveSavedReport(report, state.saved) || !window.confirm(`Delete ${report.report_name}?`))) return;
    driveReport2SetPending(state, form, true);
    try {
        const receipt = deleting ? await deleteDriveSavedReport(report.id) : await upsertDriveSavedReport(driveReport2SavedInput(form, state, report));
        if (!driveReport2StateCurrent(state)) return;
        const id = String(deleting ? receipt : receipt.id);
        state.saved.reports = state.saved.reports.filter(entry => String(entry.id) !== id);
        if (!deleting) state.saved.reports.push(receipt);
        state.savedRevision = (state.savedRevision || 0) + 1;
        state.savedSignature = JSON.stringify(state.saved);
        state.savedId = deleting ? '' : id;
        state.savedMessage = deleting ? 'Report deleted.' : 'Report saved.';
        paintDriveReport2Saved(state.root, state);
        if (dialog.open) dialog.close();
    } catch (error) {
        if (driveReport2StateCurrent(state)) form.querySelector('output').textContent = error?.message || 'Report could not be saved.';
    } finally {
        driveReport2SetPending(state, form, false);
    }
}

function driveReport2OpenRow(state, element) {
    const row = state.filtered[Number(element.dataset.driveCustomReportsV2Row)];
    if (row && driveReport2StateCurrent(state)) state.openRow(row.row);
}

function driveReport2HandleClick(event, state, dialog) {
    const button = event.target.closest('button');
    const row = event.target.closest('[data-drive-custom-reports-v2-row]');
    if (row) return driveReport2OpenRow(state, row);
    if (!button) return;
    const data = button.dataset;
    if (data.driveCustomReportsV2Filter) return driveReport2OpenColumnFilter(state, button);
    if (data.columnAction) return driveReport2HandleColumn(state, dialog, button);
    if (data.closeDialog !== undefined) return dialog.close();
    if (data.driveCustomReportsV2Cards !== undefined) { state.cards = !state.cards; return paintDriveReport2(state); }
    if (data.driveCustomReportsV2Columns !== undefined) return renderDriveReport2Columns(dialog, state.fields, state.layout);
    if (data.driveCustomReportsV2Csv !== undefined) return driveReport2Download(state);
    if (data.driveCustomReportsV2Retry !== undefined) return loadDriveReport2Saved(state);
    if (data.driveCustomReportsV2Clear !== undefined) return driveReport2ApplySaved(state, '');
    if (data.driveCustomReportsV2Delete !== undefined) return driveReport2SaveCommand(state, dialog, button.form, true);
    if (data.driveCustomReportsV2Save === undefined) return;
    const report = driveReport2Selected(state);
    const canEdit = canManageDriveSavedReport(report, state.saved);
    renderDriveReport2SaveDialog(dialog, report, canEdit, state.farm, ['ALL', ...(canEdit && report ? [report.farm_code] : [])]);
}

function bindDriveReport2Events(state) {
    const root = state.root;
    const dialog = root.querySelector('dialog');
    bindDriveReport2GridScroll(root.querySelector('.drive-custom-reports-v2-grid'));
    root.addEventListener('click', event => driveReport2HandleClick(event, state, dialog));
    root.addEventListener('change', event => {
        const control = event.target;
        if (control.matches('[data-drive-custom-reports-v2-saved]')) driveReport2ApplySaved(state, control.value);
        if (control.matches('input[data-column-action]')) driveReport2HandleColumn(state, dialog, control);
    });
    root.addEventListener('keydown', event => {
        const row = event.target.closest('[data-drive-custom-reports-v2-row]');
        if (!row || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        driveReport2OpenRow(state, row);
    });
    dialog.addEventListener('submit', event => {
        event.preventDefault();
        driveReport2SaveCommand(state, dialog, event.target);
    });
}

function mountDriveReport2(container, context) {
    const existing = activeDriveReport2State;
    const sameScope = existing?.owner === context.owner && existing?.farm === context.farm;
    const state = sameScope ? existing : newDriveReport2State(context);
    activeDriveReport2State = state;
    const remount = !state.root?.isConnected || !container.contains(state.root);
    if (remount) {
        setContainerHtml(container, driveReport2Shell());
        state.root = container.firstElementChild;
        bindDriveReport2Events(state);
    }
    const changed = state.rawRows !== context.rows || state.sourceKey !== context.sourceKey;
    if (changed) {
        state.rawRows = context.rows;
        state.sourceKey = context.sourceKey;
        state.rows = getCanonicalDriveProjection(context.rows, 'reports-v2:rows', () => context.rows.map(context.projectRow));
    }
    if (remount || changed) paintDriveReport2(state);
    if (context.authenticated && (remount || !state.savedRequestedAt) && Date.now() - (state.savedRequestedAt || 0) >= 60000) {
        state.savedRequestedAt = Date.now();
        requestAnimationFrame(() => {
            if (state.root.isConnected && driveReport2StateCurrent(state)) void loadDriveReport2Saved(state);
        });
    }
}
