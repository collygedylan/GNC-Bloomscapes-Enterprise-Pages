function renderContinuousImportedFilesPanel(render,state) {
    const template=document.createElement('template');
    template.innerHTML=render(state);
    replaceImportedSnapshotPicker(template.content,state);
    const body=template.content.querySelector('tbody');
    if (body) {
        const pager=template.content.querySelector('[onclick="return loadManagerImportedHistoryNextPage()"]');
        pager?.parentElement.remove();
        const end=document.createElement('div');
        end.className='h-px';
        end.dataset.importRowsEnd='';
        body.closest('table').after(end);
    }
    return template.innerHTML;
}

function replaceImportedSnapshotPicker(root,state) {
    const select=root.querySelector('[onchange="return selectManagerImportedHistorySnapshot(this.value)"]');
    if (!select) return;
    const list=document.createElement('div');
    list.className='max-h-40 overflow-auto rounded-xl border border-slate-200';
    list.setAttribute('aria-label','Snapshots');
    for (const option of Array.from(select.options).filter(option=>option.value)) {
        const button=list.appendChild(document.createElement('button'));
        button.type='button';
        button.className='block w-full p-2 text-left';
        button.textContent=option.textContent;
        button.dataset.importSnapshot=option.value;
        button.setAttribute('aria-current',String(option.value===state.selectedSnapshotId));
    }
    const end=list.appendChild(document.createElement('div'));
    end.className='h-px';
    end.dataset.importFilesEnd='';
    select.replaceWith(list);
    const older=root.querySelector('[onclick="return loadManagerImportedHistoryFiles(false)"]');
    older?.parentElement.remove();
}

/** @param {HTMLElement} container @returns {void} */
function mountContinuousImportedFilesPanel(container) {
    const root=container.querySelector('[aria-label="Imported files history"]');
    if (!root) return;
    const state=getManagerImportedHistoryState();
    for (const button of root.querySelectorAll('[data-import-snapshot]')) {
        button.onclick=()=>selectManagerImportedHistorySnapshot(button.dataset.importSnapshot);
    }
    const files=root.querySelector('[data-import-files-end]'),rows=root.querySelector('[data-import-rows-end]');
    if (files) observeContinuousListEnd(files,state.hasMoreFiles && !state.filesLoading && !state.filesError
        ? ()=>loadManagerImportedHistoryFiles(false) : null);
    if (rows) observeContinuousListEnd(rows,state.hasMoreRows && !state.rowsLoading && !state.rowsError
        ? loadManagerImportedHistoryNextPage : null);
}

/** @param {boolean} [refresh] @returns {*} */
function loadManagerImportedHistoryRows(refresh = true) {
    return loadManagerImportedHistoryRowsAt(0, refresh, 'reset');
}

/** @param {number} columnIndex @param {boolean} checked @returns {boolean} */
function toggleManagerImportedHistoryColumn(columnIndex, checked) {
    const state = getManagerImportedHistoryState(), columns = state.selectedSnapshot?.columns || [];
    const index = Number(columnIndex);
    if (!Number.isSafeInteger(index) || index < 0 || index >= columns.length) return false;
    const selected = new Set(state.selectedColumns);
    if (checked && !selected.has(index) && selected.size >= 8) state.columnError = 'Choose up to 8 columns for a fast row view.';
    else {
        state.columnError = '';
        if (checked) selected.add(index); else selected.delete(index);
        state.selectedColumns = columns.map((_, column) => column).filter(column => selected.has(column));
    }
    scheduleManagersRender(true);
    return false;
}

/** @param {*} [value] @returns {boolean} */
function setManagerImportedHistoryColumnSearch(value = '') {
    const state = getManagerImportedHistoryState();
    state.columnSearch = String(value || '').slice(0, 80);
    const root = document.querySelector('[aria-label="Imported files history"]');
    if (root) root.querySelectorAll('[data-import-column]').forEach(label => {
        label.hidden = !!state.columnSearch && !String(label.getAttribute('data-import-column') || '').toLowerCase().includes(state.columnSearch.trim().toLowerCase());
    });
    return false;
}

/** @returns {string} */
function renderManagerImportedFilesPanel() {
    const state = getManagerImportedHistoryState();
    const selected = state.selectedSnapshot;
    const viewState = {
        dataset: state.dataset, files: state.files, hasMoreFiles: state.hasMoreFiles,
        hasPreviousFiles: state.hasPreviousFiles, filePageNumber: state.filePageNumber,
        filesLoading: state.filesLoading, filesError: state.filesError, selectedSnapshotId: state.selectedSnapshotId,
        selectedSnapshot: selected, selectedColumnIndexes: state.selectedColumns, columnSearch: state.columnSearch,
        columnError: state.columnError, rows: state.rows, rowsLoading: state.rowsLoading,
        rowsRefreshing: state.rowsRefreshing, rowsError: state.rowsError, rowCount: state.rowCount,
        pageNumber: state.rowPageNumber, pageCount: Math.max(1, Math.ceil(state.rowCount / 50)),
        hasPrevious: state.rowPageNumber > 1, hasMoreRows: state.hasMoreRows
    };
    if (managerImportHistoryModule?.renderImportedFilesPanel) {
        return renderContinuousImportedFilesPanel(managerImportHistoryModule.renderImportedFilesPanel,viewState);
    }
    return '<div class="rounded-xl border border-emerald-100 bg-white p-6 text-center text-sm font-bold text-emerald-700">Loading Imported Files tools…</div>';
}

/** @returns {*} */
function loadManagerImportedHistoryNextPage() {
    const state = getManagerImportedHistoryState();
    if (!state.hasMoreRows || state.nextRow === null) return false;
    return loadManagerImportedHistoryRowsAt(state.nextRow, false, 'next');
}
