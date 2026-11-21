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

function paintDriveReport2Saved(root, state) {
    const select = root.querySelector('[data-drive-custom-reports-v2-saved]');
    const status = root.querySelector('[data-drive-custom-reports-v2-saved-status]');
    const save = root.querySelector('[data-drive-custom-reports-v2-save]');
    root.querySelector('[data-drive-custom-reports-v2-retry]').hidden = !state.savedLoadFailed;
    const report = state.saved.reports.find(entry => String(entry.id) === state.savedId);
    select.innerHTML = '<option value="">Saved Reports ▾</option>' + state.saved.reports.map(entry =>
        `<option value="${esc(String(entry.id))}">${entry.visibility === 'public' ? '🌐 Public' : '🔒 Private'} · ${esc(entry.report_name)}</option>`).join('');
    select.value = state.savedId;
    save.disabled = !canManageDriveSavedReport(undefined, state.saved);
    save.textContent = report && !canManageDriveSavedReport(report, state.saved) ? 'Save as My Report' : '💾 Save';
    status.textContent = state.savedMessage;
}

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
