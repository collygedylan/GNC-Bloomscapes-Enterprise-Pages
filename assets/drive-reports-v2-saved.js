function driveReport2ColumnControls(columns, fields, layout) {
    return columns.map((field, index) => {
        const selected = layout.columns.includes(field.key);
        const pinned = layout.pinned.includes(field.key);
        return `<div class="drive-custom-reports-v2-column" data-column="${esc(field.key)}">
            <label><input type="checkbox" data-column-action="toggle"${selected ? ' checked' : ''}>${esc(field.label)}</label>
            <button type="button" data-column-action="up" aria-label="Move ${esc(field.label)} up"${!selected || index === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" data-column-action="down" aria-label="Move ${esc(field.label)} down"${!selected || index >= layout.columns.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" data-column-action="pin" aria-label="Pin ${esc(field.label)}" aria-pressed="${pinned}"${selected ? '' : ' disabled'}>📌</button>
            <input type="number" data-column-action="width" aria-label="${esc(fields.get(field.key).label)} width" min="82" max="420" value="${layout.widths[field.key] || 124}"${selected ? '' : ' disabled'}>
        </div>`;
    }).join('');
}

/** @param {HTMLDialogElement} dialog Report dialog. @param {Map} fields Available report fields by key. @param {object} layout Mutable column layout. @returns {void} Renders the ordered report columns in the dialog. */
function renderDriveReport2Columns(dialog, fields, layout) {
    const columns = [...layout.columns.map(key => fields.get(key)), ...[...fields.values()].filter(field => !layout.columns.includes(field.key))];
    const scroll = dialog.querySelector('.drive-custom-reports-v2-dialog-scroll');
    const scrollTop = scroll?.scrollTop || 0;
    dialog.innerHTML = `<div class="drive-custom-reports-v2-dialog-head"><strong>Columns</strong><button type="button" data-close-dialog aria-label="Close">✕</button></div>
        <div class="drive-custom-reports-v2-dialog-scroll">${driveReport2ColumnControls(columns, fields, layout)}</div>`;
    dialog.querySelector('.drive-custom-reports-v2-dialog-scroll').scrollTop = scrollTop;
    if (!dialog.open) dialog.showModal();
}

function driveReport2EditColumnOrder(columns, key, action) {
    const index = columns.indexOf(key);
    const to = index + (action === 'up' ? -1 : 1);
    if (index < 0 || to < 0 || to >= columns.length) return;
    columns.splice(index, 1);
    columns.splice(to, 0, key);
}

/** @param {object} layout Mutable column layout. @param {string} key Selected field or route key. @param {string} action Selected column action. @param {HTMLElement} control Edited control. @returns {void} Applies the selected layout edit. */
function editDriveReport2Column(layout, key, action, control) {
    const { columns, pinned, widths } = layout;
    const checked = control.checked;
    if (action === 'toggle' && checked) columns.push(key);
    if (action === 'toggle' && !checked && columns.length > 1) {
        layout.columns = columns.filter(column => column !== key);
        layout.pinned = pinned.filter(column => column !== key);
    }
    if (action === 'pin') layout.pinned = pinned.includes(key) ? pinned.filter(column => column !== key) : [...pinned, key];
    if (action === 'width') widths[key] = driveReport2Width(control.value, widths[key]);
    if (action === 'up' || action === 'down') driveReport2EditColumnOrder(columns, key, action);
}

/** @param {HTMLDialogElement} dialog Report dialog. @param {object|null} report Currently selected report. @param {boolean} canEdit Report editing permission. @param {string} farm Current farm code. @param {Array} farmOptions Available farm codes. @returns {void} Shows the report name, visibility and farm controls. */
function renderDriveReport2SaveDialog(dialog, report, canEdit, farm, farmOptions) {
    const edit = report && canEdit;
    const targets = [...new Set([farm, ...farmOptions])];
    const defaultFarm = edit ? report.farm_code : farm;
    const options = targets.map(code => `<option value="${esc(code)}"${code === defaultFarm ? ' selected' : ''}>${esc(code === 'ALL' ? 'All farms' : code)}</option>`).join('');
    const deleteButton = edit ? '<button type="button" data-drive-custom-reports-v2-delete>Delete</button>' : '';
    dialog.innerHTML = `<form data-drive-custom-reports-v2-save-form>
        <div class="drive-custom-reports-v2-dialog-head"><strong>${report && !edit ? 'Save as My Report' : 'Save Report'}</strong><button type="button" data-close-dialog aria-label="Close">✕</button></div>
        <label>Report name<input name="reportName" required maxlength="120" value="${esc(edit ? report.report_name : '')}"></label>
        <label>Visibility<select name="visibility"><option value="private">🔒 Private</option><option value="public"${edit && report.visibility === 'public' ? ' selected' : ''}>🌐 Public</option></select></label>
        <label>Farm<select name="farm">${options}</select></label>
        <div class="drive-custom-reports-v2-actions"><button type="submit">Save</button>${deleteButton}</div>
        <output aria-live="polite"></output></form>`;
    if (!dialog.open) dialog.showModal();
}

/** @param {Element|Document} root Root of the mounted surface. @param {object} state Current view state. @returns {void} Updates saved report selection and actions. */
function paintDriveReport2Saved(root, state) {
    const select = root.querySelector('[data-drive-custom-reports-v2-saved]');
    const status = root.querySelector('[data-drive-custom-reports-v2-saved-status]');
    const save = root.querySelector('[data-drive-custom-reports-v2-save]');
    root.querySelector('[data-drive-custom-reports-v2-retry]').hidden = !state.savedLoadFailed;
    const report = state.saved.reports.find(entry => String(entry.id) === state.savedId);
    syncDriveReport2Options(select, state, 'Saved Reports ▾');
    select.value = state.savedId;
    save.disabled = !canManageDriveSavedReport(undefined, state.saved);
    save.textContent = report && !canManageDriveSavedReport(report, state.saved) ? 'Save as My Report' : '💾 Save';
    status.textContent = state.savedMessage;
    root.querySelector('[data-drive-report-exit]').hidden = !state.scoped;
}

/** @param {HTMLFormElement} form Current form. @param {object} state Current view state. @param {object|null} report Currently selected report. @returns {object} The saved report fields from the form and current layout. */
function driveReport2SavedInput(form, state, report) {
    const entry = {
        report_name: form.elements.reportName.value.trim(),
        farm_code: form.elements.farm.value,
        visibility: form.elements.visibility.value,
        selected_columns: [...state.layout.columns],
        column_widths: { ...state.layout.widths, _pinned: [...state.layout.pinned] },
        filter_rules: state.layout.filters,
        sort_rules: state.layout.sorting
    };
    if (report && canManageDriveSavedReport(report, state.saved)) entry.id = report.id;
    return entry;
}

function syncDriveReport2Options(select, state, label) {
    if (select.driveReportOptions === state.savedSignature && select.options.length) return;
    select.driveReportOptions = state.savedSignature;
    select.innerHTML = '<option value="">' + label + '</option>' + state.saved.reports.map(entry =>
        `<option value="${esc(String(entry.id))}">${entry.visibility === 'public' ? '🌐 Public' : '🔒 Private'} · ${esc(entry.report_name)}</option>`).join('');
}

function driveReport2ViewButtons(includeTable) {
    const modes = [['loc', '📍 Location'], ['name', '🌿 Common Name'], ['card', '🚗 Cards']];
    if (includeTable) modes.unshift(['reports-v2', 'Table']);
    return modes.map(([mode, label]) => `<button type="button" data-drive-report-view="${mode}">${label}</button>`).join('');
}

function paintDriveReport2Picker(bar, state) {
    const select = bar.querySelector('select');
    syncDriveReport2Options(select, state, '📊 Saved Reports ▾');
    select.value = state.scoped ? state.savedId : '';
    const retry = bar.querySelector('[data-drive-report-retry]');
    retry.hidden = !state.savedLoadFailed;
    bar.querySelector('[data-drive-report-status]').textContent = state.savedLoadFailed ? state.savedMessage : '';
}

/** @returns {void} Hides the mounted browse toolbar when present. */
function hideDriveReport2BrowseBar() {
    const bar = document.getElementById('drive-report-browse');
    if (bar) bar.hidden = true;
}
