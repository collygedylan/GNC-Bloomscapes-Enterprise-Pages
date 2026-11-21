function driveReport2FilterMarkup(field, rule) {
    const operators = driveReport2ConditionOptions.map(([key, label]) => `<option value="${key}"${rule.operator === key ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const ascending = field.numeric ? 'Smallest→Largest' : 'A→Z';
    const descending = field.numeric ? 'Largest→Smallest' : 'Z→A';
    return `<form class="drive-custom-reports-v2-filter" aria-label="Filter ${esc(field.label)}">
        <strong>${esc(field.label)}</strong>
        <div class="drive-custom-reports-v2-actions"><button type="button" data-sort="asc">Sort ${ascending}</button><button type="button" data-sort="desc">Sort ${descending}</button></div>
        <div class="drive-custom-reports-v2-actions"><label>Condition <select name="operator">${operators}</select></label>
        <input name="first" aria-label="Condition value" value="${esc(rule.first || '')}" maxlength="500">
        <input name="second" aria-label="Upper bound" value="${esc(rule.second || '')}" maxlength="500"></div>
        <input name="valuesearch" aria-label="Search values" placeholder="Search values">
        <div class="drive-custom-reports-v2-actions"><button type="button" data-check="all">Select All</button><button type="button" data-check="none">Clear Selection</button></div>
        <div class="drive-custom-reports-v2-values" role="group" aria-label="Column values" tabindex="0"></div>
        <div class="drive-custom-reports-v2-actions"><button type="submit">Apply</button><button type="button" data-clear>Clear Filter</button><button type="button" data-cancel>Cancel</button></div>
    </form>`;
}

function driveReport2PaintFilterValues(scroll, values, selected) {
    const range = driveReport2Window(values.length, scroll.scrollTop, scroll.clientHeight || 180, 28);
    const listings = values.slice(range.offset, range.end).map(([value, count], offset) =>
        `<label><span>${esc(value || '(Blank)')}</span><small>${count}</small><input type="checkbox" data-value-index="${range.offset + offset}"${selected.has(value) ? ' checked' : ''}></label>`).join('');
    scroll.innerHTML = `<div style="height:${range.before}px"></div>${listings}<div style="height:${range.after}px"></div>`;
}

function driveReport2FilterFormChange(event, form, state) {
    const input = event.target;
    if (input.name === 'operator') driveReport2UpdateConditionControls(form);
    if (input.dataset.valueIndex === undefined) return;
    const entry = state.visible[Number(input.dataset.valueIndex)];
    if (!entry) return;
    if (input.checked) state.selected.add(entry[0]);
    else state.selected.delete(entry[0]);
    state.changed = true;
}

function driveReport2UpdateConditionControls(form) {
    const { operator, first, second } = form.elements;
    first.hidden = ['', 'blank', 'not-blank'].includes(operator.value);
    second.hidden = operator.value !== 'between';
    first.required = !first.hidden;
    second.required = !second.hidden;
}

function driveReport2ApplyFilterSelection(state, checked) {
    for (const [value] of state.visible) {
        if (checked) state.selected.add(value);
        else state.selected.delete(value);
    }
    state.changed = true;
}

function driveReport2ReadCondition(form, state, rule) {
    const { operator, first, second } = form.elements;
    const next = operator.value ? { operator: operator.value, first: first.value, second: second.value } : {};
    const full = state.values.every(([value]) => state.selected.has(value));
    const hasValuesRule = Array.isArray(rule.values) || (state.changed && !full);
    if (hasValuesRule) next.values = [...state.selected];
    return Object.keys(next).length ? next : null;
}

function driveReport2FilterAction(event, state, paint, commands, close) {
    const { sort, check, clear, cancel } = event.target.dataset;
    if (sort) { commands.sort(sort); close(); }
    if (check) { driveReport2ApplyFilterSelection(state, check === 'all'); paint(); }
    if (clear !== undefined) { commands.filter(null); close(); }
    if (cancel !== undefined) close();
}

function openDriveReport2Filter(anchor, field, values, rule = {}, commands) {
    const scope = 'drive-custom-reports-v2';
    const host = getInventoryExcelPopoverHost(scope, true);
    const close = () => closeInventoryExcelPopover(scope);
    host.innerHTML = driveReport2FilterMarkup(field, rule);
    const form = host.querySelector('form');
    const scroll = form.querySelector('.drive-custom-reports-v2-values');
    const state = { values, visible: values, selected: new Set(rule.values || values.map(([value]) => value)), changed: false };
    const paint = () => driveReport2PaintFilterValues(scroll, state.visible, state.selected);
    let frame = 0;
    scroll.addEventListener('scroll', () => {
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = 0; if (scroll.isConnected) paint(); });
    }, { passive: true });
    form.elements.valuesearch.addEventListener('input', event => {
        const words = event.target.value.trim().toLocaleLowerCase().split(/\s+/);
        state.visible = state.values.filter(([value]) => words.every(word => (value || '(Blank)').toLocaleLowerCase().includes(word)));
        scroll.scrollTop = 0;
        paint();
    });
    form.addEventListener('change', event => driveReport2FilterFormChange(event, form, state));
    form.addEventListener('click', event => driveReport2FilterAction(event, state, paint, commands, close));
    form.addEventListener('submit', event => {
        event.preventDefault();
        commands.filter(driveReport2ReadCondition(form, state, rule));
        close();
    });
    driveReport2UpdateConditionControls(form);
    positionDriveExcelPopover(host, anchor);
    paint();
    form.elements.valuesearch.focus({ preventScroll: true });
}
