const driveBrowseModes = [['name', 'Common Name'], ['location', 'Location'], ['card', 'Card']];

const driveBrowseCollator = new Intl.Collator(undefined,{numeric:true});

function groupDriveBrowseRows(rows, keyFor, compare = driveBrowseCollator.compare) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFor(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups].sort(([left], [right]) => compare(left, right));
}

function createDriveBrowseState(mode = 'name') {
    return {mode, path:[], query:''};
}

function setDriveBrowseMode(state, mode) {
    if (!driveBrowseModes.some(([key]) => key === mode)) return;
    state.mode = mode;
    state.path = [];
}

function resolveDriveBrowseLevel(rows, state, dimensions) {
    const levels = dimensions[state.mode] || [];
    const path = state.path.slice(0, levels.length);
    const matching = rows.filter(row => path.every((key, index) => levels[index].key(row) === key));
    const level = levels[path.length];
    return {rows:matching, level, groups:level ? groupDriveBrowseRows(matching, level.key, level.compare) : []};
}

function filterDriveBrowseRows(rows, query, searchText) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(row => {
        const text = searchText(row);
        return terms.every(term => text.includes(term));
    });
}

const reportDriveDimensions = {
    name:[
        {key:row=>getDrivePlantCommonName(row) || 'Unknown', compare:(a,b)=>compareDriveCommonName(a,b), label:'Common Name'},
        {key:row=>getDrivePlantContSize(row), compare:(a,b)=>compareDrivePlantContSize(a,b), label:'Container Size'}
    ],
    location:[
        {key:row=>getDriveBlockAlphaValue(row), label:'Block Alpha', display:key=>getDriveBlockAlphaLabel(key)},
        {key:row=>LocationCode.normalize(getDrivePlantLocationCode(row)) || DRIVE_NO_BLOCK_NUMBER,
            label:'Location', display:key=>getDriveBlockNumberLabel(key)}
    ]
};

function evalReportBrowseMarkup() {
    return '<div class="report-drive-modes" aria-label="Inventory grouping">' + driveBrowseModes.map(([mode,label])=>
        '<button type="button" data-report-mode="' + mode + '">' + label + '</button>').join('') +
        '<button type="button" data-report-back data-secondary-back hidden>← Back</button></div>';
}

function bindEvalReportBrowseClick(event, state, rerender) {
    const button = event.target.closest('[data-report-mode], [data-report-back], [data-report-group]');
    if (!button) return false;
    if (button.hasAttribute('data-report-back')) state.path.pop();
    else if (button.dataset.reportMode) setDriveBrowseMode(state, button.dataset.reportMode);
    else state.path.push(button.dataset.reportGroup);
    const scroller = getMainAreaScrollTarget();
    if (scroller) scroller.scrollTop = 0;
    rerender();
    return true;
}

function syncEvalReportBrowseControls(host, state) {
    for (const button of host.querySelectorAll('[data-report-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.reportMode === state.mode));
    }
    host.querySelector('[data-report-back]').hidden = !state.path.length;
}

function evalReportSearchText(row) {
    return [row.COMMONNAME ?? row.commonname, row.ITEMCODE ?? row.itemcode, row.LOTCODE ?? row.lotcode,
        row.LOCATIONCODE ?? row.locationcode, row.CONTSIZE ?? row.contsize].join(' ').toLowerCase();
}

function filterReportBrowseInventory(rows, state) {
    return filterDriveBrowseRows(rows, state.query, evalReportSearchText);
}

function evalReportDrillGroup(key, rows, level) {
    const name = level.display?.(key) || key;
    return '<button type="button" class="app-smart-card app-drive-compact-card report-drive-group" data-report-group="' +
        esc(key) + '"><strong>' + esc(name) + '</strong><span>' + rows.length.toLocaleString() + ' rows</span></button>';
}

function evalReportInventoryCard(row, showHold, cardRenderer) {
    const card = cardRenderer(row);
    if (!showHold) return card;
    return '<div><p class="report-hold-badge">' + esc(evalReportHoldReason(row)) + '</p>' + card + '</div>';
}

function paintReportInventoryDrill(content, state, rows, signature, before = '', showHold = false, cardRenderer) {
    const view = resolveDriveBrowseLevel(rows, state, reportDriveDimensions);
    const key = JSON.stringify([signature, state.mode, state.path]);
    if (!view.rows.length) {
        setContainerHtmlWithSignature(content, before + '<p role="status">No matching inventory rows.</p>', key);
    } else if (view.level) {
        const caption = '<h3 class="report-drive-level">' + esc(view.level.label) + '</h3>';
        const render = ([name, group])=>evalReportDrillGroup(name, group, view.level);
        if (!renderInventoryCardWindow(content, view.groups, render, {view:'reports', signature:key, estimatedHeight:72, prefixHtml:before+caption})) {
            setContainerHtmlWithSignature(content, before + caption + view.groups.map(render).join(''), key);
        }
    } else {
        const render = row=>evalReportInventoryCard(row,showHold,cardRenderer || renderReportDriveCard);
        if (!renderInventoryCardWindow(content, view.rows, render, {view:'reports', signature:key, prefixHtml:before})) {
            setContainerHtmlWithSignature(content, before + view.rows.map(render).join(''), key);
        }
    }
    return view.rows;
}

function renderReportDriveCard(row) {
    return generateCard(row, 'drive', getDriveCardStatusClass(row), {originView:'reports'});
}

function paintEvalReportHoldFilters(host,state,rows,pick) {
    const panel = host.querySelector('[data-hold-filters]');
    panel.hidden = !state.report.startsWith('hold-stop');
    if (panel.hidden) return rows;
    const username = state.access.preview || state.receipt.evaluators[0]?.username || '';
    panel.querySelector('[data-report-username]').textContent = state.access.scope === 'own' ? '@' + username : '';
    const plants = evalReportFacetChoices(filterEvalReportHoldRows(rows, '', state.reason),evalReportPlantGroup,'All Plant Groups');
    const reasons = evalReportFacetChoices(filterEvalReportHoldRows(rows, state.plantGroup, ''),evalReportHoldReason,'All Reasons');
    mountModuleSubviewDropdown(panel.querySelector('[data-report-plant-group]'), {
        label:'Plant Group', choices:plants, value:state.plantGroup, select:value=>pick('plantGroup',value)
    });
    mountModuleSubviewDropdown(panel.querySelector('[data-report-hold-reason]'), {
        label:'Hold/Stop Reason', choices:reasons, value:state.reason, select:value=>pick('reason',value)
    });
    return filterEvalReportHoldRows(rows,state.plantGroup,state.reason);
}

let evalReportsWorkspace;
let evalReportsPreviewObserver;
const evalReasonReport = {id:'hold-stop-reason',label:'Hold/Stop Reason'};
const evalReportOptions = [...EVAL_ROLE_REPORTS,evalReasonReport];
const evalReportRowsFor = (entry,id)=>entry.reports.get(id===evalReasonReport.id ? 'hold-stop' : id);

function evalReportsStateKey(access) {
    return JSON.stringify([getSupabaseReadIdentityScope(), getBloomscapesFarm(), access.scope,
        access.preview, appAccessSnapshotState.snapshot?.dataPermissionVersion]);
}

function getEvalReportsWorkspace(access) {
    const key = evalReportsStateKey(access);
    if (evalReportsWorkspace?.key !== key) {
        evalReportsWorkspace = {key, access, farm:getBloomscapesFarm(), evaluator:'', report:EVAL_ROLE_REPORTS[0].id,
            ...createDriveBrowseState(), location:'', plantGroup:'', reason:'', receipt:null, generation:0};
    }
    return evalReportsWorkspace;
}

function isCurrentEvalReportsWorkspace(state) {
    return state === evalReportsWorkspace && state.key === evalReportsStateKey(getActiveEvalReportsAccess())
        && isViewVisible('reports');
}

function watchEvalReportsPreview() {
    if (evalReportsPreviewObserver) return;
    const chrome = document.getElementById('app-top-chrome');
    if (!chrome) return;
    evalReportsPreviewObserver = new MutationObserver(() => {
        if (!isViewVisible('reports')) return;
        if (evalReportsWorkspace?.key !== evalReportsStateKey(getActiveEvalReportsAccess())) renderReports();
    });
    evalReportsPreviewObserver.observe(chrome, {childList:true, subtree:true});
    globalThis.addEventListener('bloomscapes-farm-ready', () => {
        if (isViewVisible('reports')) renderReports();
    });
}

async function loadCompleteEvalReportInventory(state) {
    if (isMasterFullProjectionReady()) return true;
    await hydrateColdSource('master');
    if (isMasterFullProjectionReady()) return true;
    if (!isCurrentEvalReportsWorkspace(state)) return false;
    return ensureDatasetLoaded('master', 'full', {bypassLiveSyncCoordinator:true,
        force:true, retryOnCancellation:true, retainOnGenerationChange:true});
}

async function loadEvalReportsWorkspace(state) {
    if (state.pending) return;
    state.pending = true;
    state.assignmentSignature = getDatasetLoadSignature('warehouseAssignedItems');
    state.error = '';
    try {
        const results = await Promise.all([
            readEvalReportsScope(state.farm, state.access.preview),
            loadCompleteEvalReportInventory(state)
        ]);
        if (!isCurrentEvalReportsWorkspace(state)) return;
        const [receipt, loaded] = results;
        if (receipt.scope !== state.access.scope || !loaded || !isMasterFullProjectionReady()) {
            throw new Error('The complete evaluator report could not be verified.');
        }
        state.receipt = receipt;
        state.catalog = null;
    } catch (error) {
        if (isCurrentEvalReportsWorkspace(state) && error.name !== 'AbortError' && error.code !== 'REQUEST_ABORTED') {
            state.error = error.message || 'Report data unavailable.';
        }
    } finally {
        state.pending = false;
        if (isCurrentEvalReportsWorkspace(state) && (state.receipt || state.error)) renderReports();
    }
}

function evalReportsCatalog(state) {
    const activeAppSalesYear = getConfiguredCurrentSalesYearCode();
    const inventorySignature = getDatasetLoadSignature('master');
    if (state.catalog && state.rows === fullInventory && state.year === activeAppSalesYear
        && state.inventorySignature === inventorySignature) return state.catalog;
    Object.assign(state, { rows:fullInventory, year:activeAppSalesYear, inventorySignature, generation:state.generation + 1 });
    state.catalog = buildEvalRoleReportsCatalog({rows:fullInventory, evaluators:state.receipt.evaluators,
        farm:state.farm, activeAppSalesYear});
    return state.catalog;
}

function evalReportsControlMarkup(host) {
    host.innerHTML = '<div class="flex flex-wrap gap-2" data-eval-report-pickers>' +
        '<div data-eval-picker></div><div data-report-picker></div></div>' +
        evalReportBrowseMarkup() + '<div class="flex flex-wrap items-center gap-2">' +
        '<input type="search" class="input-field min-w-0 !mb-0 max-w-64" aria-label="Search report inventory" placeholder="Search plants, items, or lots" data-report-query>' +
        '<select class="input-field min-w-0 !mb-0 max-w-48" aria-label="Report location" data-report-location></select>' +
        '<button type="button" class="rounded-lg bg-emerald-800 px-3 py-2 font-bold text-emerald-50" data-report-export>Export Excel</button></div>' +
        '<div class="flex flex-wrap gap-2" data-hold-filters hidden><span data-report-username></span>' +
        '<div data-report-plant-group></div><div data-report-hold-reason></div></div>';
    host.oninput = event => updateEvalReportsFilter(event.target);
    host.onclick = event => {
        if (event.target.closest('[data-report-export]')) exportEvalRoleReport();
        else bindEvalReportBrowseClick(event, evalReportsWorkspace, renderReports);
    };
    document.getElementById('reports-content').onclick = event => {
        if (evalReportsWorkspace) bindEvalReportBrowseClick(event, evalReportsWorkspace, renderReports);
    };
}

function updateEvalReportsFilter(input) {
    const state = evalReportsWorkspace;
    if (!state || !isCurrentEvalReportsWorkspace(state)) return;
    if (input.matches('[data-report-query]')) state.query = input.value;
    else if (input.matches('[data-report-location]')) state.location = input.value;
    else return;
    state.path = [];
    if (state.paintFrame) return;
    state.paintFrame = requestAnimationFrame(() => {
        state.paintFrame = 0;
        if (isCurrentEvalReportsWorkspace(state)) renderReports();
    });
}

function pickEvalReportsValue(state, key, value) {
    if (!isCurrentEvalReportsWorkspace(state)) return;
    state[key] = value;
    state.location = '';
    state.path = [];
    if (key === 'report' || key === 'evaluator') Object.assign(state, {plantGroup:'', reason:''});
    state.visibleRows = null;
    const content = document.getElementById('reports-content');
    content.hidden = true;
    if (state.paintFrame) return;
    state.paintFrame = requestAnimationFrame(() => {
        state.paintFrame = 0;
        if (isCurrentEvalReportsWorkspace(state)) renderReports();
    });
}

function evalReportsGroups(state, catalog) {
    return state.evaluator && catalog.has(state.evaluator) ? [catalog.get(state.evaluator)] : [...catalog.values()];
}

function paintEvalReportsPickers(host, state, catalog, groups) {
    const evaluator = host.querySelector('[data-eval-picker]');
    evaluator.hidden = state.access.scope !== 'all';
    if (evaluator.hidden) evaluator.replaceChildren();
    else {
        const choices = [['', state.report.startsWith('hold-stop') ? 'All Users' : 'All Evaluators'], ...Array.from(catalog.values(), entry =>
            [entry.username, entry.displayName + ' (@' + entry.username + ')'])];
        mountModuleSubviewDropdown(evaluator, {label:state.report.startsWith('hold-stop') ? 'Username' : 'Evaluator', choices, value:state.evaluator,
            select:value => pickEvalReportsValue(state, 'evaluator', value)});
    }
    const choices = evalReportOptions.map(({id, label}) => {
        const count = groups.reduce((total, entry) => total + evalReportRowsFor(entry,id).length, 0);
        return [id, (groups.length === 1 ? evalRoleReportTitle(groups[0], label) : label) + ' (' + count + ')'];
    });
    mountModuleSubviewDropdown(host.querySelector('[data-report-picker]'), {label:'Report', choices, value:state.report,
        select:value => pickEvalReportsValue(state, 'report', value)});
}

function evalReportLocation(row) {
    return String(row.LOCATIONCODE ?? row.locationcode ?? '');
}

function paintEvalReportsFilters(host, state, rows) {
    const input = host.querySelector('[data-report-query]');
    if (input.value !== state.query) input.value = state.query;
    const location = host.querySelector('[data-report-location]');
    const locations = [...new Set(rows.map(evalReportLocation).filter(Boolean))].sort();
    if (state.location && !locations.includes(state.location)) state.location = '';
    const signature = JSON.stringify(locations);
    if (location.dataset.locations !== signature) {
        location.replaceChildren(new Option('All locations', ''), ...locations.map(value => new Option(value, value)));
        location.dataset.locations = signature;
    }
    location.value = state.location;
}

function paintEvalReportRows(content, state, rows) {
    const matched = filterReportBrowseInventory(rows.filter(row=>!state.location || evalReportLocation(row)===state.location),state);
    const signature = [state.key, state.generation, state.evaluator, state.report, state.query, state.location, state.plantGroup, state.reason];
    const quantity = matched.reduce((total,row)=>total + (Number(row.PTRONHAND ?? row.ptronhand) || 0), 0);
    const summary = '<p class="report-drive-count">' + matched.length.toLocaleString() + ' rows · ' +
        quantity.toLocaleString() + ' on hand</p>';
    state.visibleRows = paintReportInventoryDrill(content,state,matched,signature,summary,state.report.startsWith('hold-stop'));
}

function paintEvalReportsStatus(host, content, state) {
    host.hidden = true;
    const message = state?.error || (state ? 'Loading evaluator reports…' : 'Choose an evaluator account to preview Reports.');
    const retry = state?.error ? '<button type="button" data-retry-eval-reports>Retry</button>' : '';
    setContainerHtmlWithSignature(content, '<p role="status">' + esc(message) + '</p>' + retry, message);
    if (state?.error) content.querySelector('[data-retry-eval-reports]').onclick = () => {
        void loadEvalReportsWorkspace(state);
        renderReports();
    };
}

function renderEvalRoleReports() {
    const access = getActiveEvalReportsAccess();
    const host = document.getElementById('eval-reports-controls');
    const content = document.getElementById('reports-content');
    const legacy = document.getElementById('legacy-reports-controls');
    if (!host || !content || !legacy) return false;
    content.hidden = false;
    watchEvalReportsPreview();
    legacy.hidden = access.scope !== 'legacy';
    host.hidden = access.scope === 'legacy';
    if (access.scope === 'legacy') {
        evalReportsWorkspace = null;
        host.replaceChildren();
        return false;
    }
    const state = access.scope === 'hidden' ? null : getEvalReportsWorkspace(access);
    if (!state?.receipt) {
        host.replaceChildren();
        paintEvalReportsStatus(host, content, state);
        if (state && !state.pending && !state.error) void loadEvalReportsWorkspace(state);
        return true;
    }
    if (state.assignmentSignature !== getDatasetLoadSignature('warehouseAssignedItems')) {
        void loadEvalReportsWorkspace(state);
    }
    paintEvalReportsWorkspace(host,content,state);
    return true;
}

function paintEvalReportsWorkspace(host,content,state) {
    const catalog = evalReportsCatalog(state);
    const groups = evalReportsGroups(state, catalog);
    const rows = groups.flatMap(entry => evalReportRowsFor(entry,state.report));
    if (!host.firstElementChild) evalReportsControlMarkup(host);
    paintEvalReportsPickers(host, state, catalog, groups);
    paintEvalReportsFilters(host, state, rows);
    syncEvalReportBrowseControls(host,state);
    paintEvalReportRows(content,state,paintEvalReportHoldFilters(host,state,rows,(key,value)=>pickEvalReportsValue(state,key,value)));
}
function exportEvalRoleReport() {
    const state = evalReportsWorkspace;
    if (!state || !isCurrentEvalReportsWorkspace(state) || !state.visibleRows?.length) {
        showToast('Export Excel', 'There are no matching report rows to export.');
        return;
    }
    const label = evalReportOptions.find(report => report.id === state.report).label;
    const title = label + ' · ' + (state.evaluator || state.access.preview || 'Evaluator Reports');
    downloadExcelWorkbook(getDriveReportExportColumns(), state.visibleRows, title, state.query, 'eval-' + state.report,
        [['Sales Year', String(state.year)], ['Location', state.location || 'All'], ['Rows Exported', String(state.visibleRows.length)]],
        DRIVE_MODE_EXCEL_OPTIONS);
}
