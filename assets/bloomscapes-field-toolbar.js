function placeBloomscapesFarmFilter(farm, _view, header = document.getElementById('global-header-search-row')) {
    if (farm && header && farm.parentElement !== header) header.appendChild(farm);
}

function mountDocksPrimaryFilters(root, bar) {
    const disclosure = root?.querySelector('.docks-filter-disclosure');
    if (!disclosure || !bar) return;
    let primary = root.querySelector('[data-docks-primary-filters]');
    if (!primary) {
        primary = document.createElement('div');
        primary.dataset.docksPrimaryFilters = '';
        disclosure.before(primary);
    }
    for (const key of ['commonname','contsize']) {
        const field = bar.querySelector('[data-field="' + key + '"]')?.closest('.inventory-excel-field');
        if (!field) continue;
        primary.querySelector('[data-primary-field="' + key + '"]')?.remove();
        field.dataset.primaryField = key;
        primary.appendChild(field);
    }
    placeBloomscapesFarmFilter(document.getElementById('bloomscapes-farm-selector')?.parentElement, 'docks');
}

function renderHomeSyncTimestamp(stamp, value) {
    const date = new Date(value || '');
    if (!value || !Number.isFinite(date.getTime())) {
        stamp.textContent = 'Awaiting imported file data';
        return;
    }
    const lines = [date.toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'}),
        date.toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})];
    stamp.replaceChildren(...lines.map((text, index) => {
        const line = document.createElement('span');
        line.dataset.syncTimestampLine = String(index + 1);
        line.textContent = text;
        return line;
    }));
}
