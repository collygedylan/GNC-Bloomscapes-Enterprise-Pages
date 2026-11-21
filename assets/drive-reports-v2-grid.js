const driveReport2RowHeight = 34;

function driveReport2ColumnPositions(layout) {
    const pinned = new Set(layout.pinned);
    const columns = [...layout.columns.filter(key => pinned.has(key)), ...layout.columns.filter(key => !pinned.has(key))];
    let left = 0;
    return columns.map(key => {
        const width = layout.widths[key] || 124;
        const position = { key, width, left: pinned.has(key) ? left : null };
        if (pinned.has(key)) left += width;
        return position;
    });
}

function driveReport2PinnedAttrs(left) {
    return left === null ? '' : ` class="drive-custom-reports-v2-pinned" style="left:${left}px"`;
}

function driveReport2Header(column, field, layout) {
    const { key, left } = column;
    const sort = layout.sorting.find(rule => rule.column === key);
    const direction = sort?.direction === 'asc' ? 'ascending' : 'descending';
    const active = Boolean(layout.filters[key]);
    const suffix = `${sort ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}${active ? ' •' : ''}`;
    return `<th scope="col"${driveReport2PinnedAttrs(left)}${sort ? ` aria-sort="${direction}"` : ''}>
        <button type="button" aria-label="Filter ${esc(field.label)}" aria-haspopup="dialog" data-drive-custom-reports-v2-filter="${esc(key)}">${esc(field.label + suffix)} <span aria-hidden="true">▾</span></button></th>`;
}

function driveReport2GridRow(row, columns, index) {
    const cells = columns.map(({ key, left }) => {
        const value = esc(row.value(key));
        return `<td${driveReport2PinnedAttrs(left)} title="${value}">${value}</td>`;
    }).join('');
    return `<tr tabindex="0" data-drive-custom-reports-v2-row="${index}" aria-label="Open ${esc(row.value('COMMONNAME') || 'item')}" aria-rowindex="${index + 2}">${cells}</tr>`;
}

function driveReport2Spacer(length, height) {
    return height ? `<tr aria-hidden="true"><td colspan="${length}" style="height:${height}px"></td></tr>` : '';
}

function driveReport2PaintGridBody(grid) {
    const { body, scroll, rows, columns } = grid;
    const range = driveReport2Window(rows.length, scroll.scrollTop, scroll.clientHeight || 340, driveReport2RowHeight);
    const key = `${range.offset}:${range.end}`;
    if (key === grid.windowKey) return;
    grid.windowKey = key;
    const visible = rows.slice(range.offset, range.end).map((row, i) => driveReport2GridRow(row, columns, range.offset + i)).join('');
    body.innerHTML = driveReport2Spacer(columns.length, range.before) + visible + driveReport2Spacer(columns.length, range.after);
}

function bindDriveReport2GridScroll(scroll) {
    let frame = 0;
    scroll.addEventListener('scroll', () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            const grid = scroll.driveReport2Grid;
            if (grid?.body.isConnected) driveReport2PaintGridBody(grid);
        });
    }, { passive: true });
}

function renderDriveReport2Grid(scroll, rows, fields, layout) {
    const columns = driveReport2ColumnPositions(layout);
    const sizes = columns.map(({ width }) => `<col style="width:${width}px">`).join('');
    const labels = columns.map(column => driveReport2Header(column, fields.get(column.key), layout)).join('');
    const width = columns.reduce((sum, column) => sum + column.width, 0);
    const compact = columns.length > 34;
    scroll.classList.toggle('drive-custom-reports-v2-grid-dense', compact);
    scroll.innerHTML = `<table aria-label="Drive Reports #2" aria-rowcount="${rows.length + 1}" style="min-width:${width}px"><colgroup>${sizes}</colgroup><thead><tr>${labels}</tr></thead><tbody></tbody></table>${rows.length ? '' : '<p>No matching rows</p>'}`;
    const grid = { body: scroll.querySelector('tbody'), scroll, rows, columns };
    scroll.driveReport2Grid = grid;
    driveReport2PaintGridBody(grid);
}

function driveReport2GridColumnOrder(layout) {
    return driveReport2ColumnPositions(layout).map(column => column.key);
}
