const tableDirectoryDetails = {
    'assigned-items':['Assigned Items','Set default owners for inventory items.'],
    'user-controls':['User Controls','Manage user profiles, farm access and permissions.'],
    'ph-job-codes':['10-PH Job Codes','Park Hill job codes and departments.'],
    'tx-job-codes':['20-TX Job Codes','El Campo job codes and descriptions.'],
    'user-role-access':['User & Role Access','Review individual permissions and role defaults.'],
    'company-directory':['Company Directory','Find people and manage their farm access.'],
    'customer-assignments':['Customer Assignments','Manage customer and consignee rep assignments.'],
    'action-discrepancy':['Action Discrepancy','Review discrepancies in recorded actions.'],
    'inquiry-coverage':['Inquiry Coverage','Manage primary and backup inquiry recipients.'],
    'av-note-users':['AV Note Users','Manage access to availability notes.'],
    season:['Season','Manage season settings.'],
    'season-priority':['Season Priority','Review priorities by season.'],
    'production-schedule':['Production Schedule','Review the production plan.'],
    'prod-schedule':['Production Schedule','Review the production plan.'],
    'president-command-center':['President Command Center','Review nursery planning decisions.'],
    'approved-execution-plan':['Approved Execution Plan','View approved work and planting plans.'],
    'bunch-notes-simulator':['Bunch Notes Simulator','Review proposed bunch notes and issues.'],
    'header-control':['Header Control','Map imported column headings to standard fields.'],
    'water-rating':['Water Rating','Review nursery water requirements.'],
    'nursery-items':['Items','Review nursery item references.'],
    'nursery-locations':['Locations','Review nursery blocks and locations.'],
    'scientific-evidence':['Scientific Evidence Log','Review evidence for nursery water ratings.']
};

function getManagerTableManagementItems(access = getManagersToolAccess()) {
    return [
        ...(globalThis.GncNurseryModel?.TABLES || []).map(item => ({...item,visible:canViewNurseryCommandTables()})),
        {id:'user-controls',label:'User_Controls',section:'editable',visible:access.canManageAccessControl && currentUser==='dylan_collyge'},
        {id:'ph-job-codes',label:'10-PH_job_codes',section:'editable',visible:isFullAppAdministrator() && getBloomscapesFarm()==='10-PH'},
        {id:'tx-job-codes',label:'20-TX_job_codes',section:'editable',visible:isFullAppAdministrator() && getBloomscapesFarm()==='20-TX'},
        { id:'assigned-items', label:'Assigned Items', section:'editable', visible:access.canViewAssignedItemsExport },
        { id:'action-discrepancy', label:'Action Discrepancy', section:'editable', visible:access.canViewTableManagement },
        { id:'company-directory', label:'Company Directory', section:'editable', visible:typeof canonicalFeaturePermission !== 'function' || canonicalFeaturePermission('can_access_manager_tab') !== false },
        { id:'inquiry-coverage', label:'Inquiry Coverage', section:'editable', visible:typeof canonicalFeaturePermission !== 'function' || canonicalFeaturePermission('can_access_manager_tab') !== false },
        { id:'customer-assignments', label:'Customer Assignments', section:'editable', visible:access.canManageCustomerRepMappings },
        { id:'user-role-access', label:'User & Role Access', section:'editable', visible:access.canManageAccessControl },
        { id:'av-note-users', label:'AV Note Users', section:'editable', visible:access.canManageAvBlanksPhotoBypass },
        { id:'season', label:'Season', section:'editable', visible:access.canManageSeasonSettings },
        { id:'season-priority', label:'Season Priority', section:'editable', visible:access.canViewSeasonPriority },
        { id:'production-schedule', label:'PROD SCHEDULE 102726 (2026-10-29_1232)', section:'schedule', visible:access.canViewProductionSchedule },
        { id:'historical-drive-mode', label:'Historical Drive Mode', section:'archive', visible:canUseHistoricalRequests() },
        { id:'historical-soc-open-orders', label:'Historical SOC Open Orders', section:'archive', visible:canUseHistoricalRequests() },
        { id:'historical-soc-reserves', label:'Historical SOC Reserves', section:'archive', visible:canUseHistoricalRequests() },
        { id:'historical-requests', label:'Historical Requests', section:'archive', visible:canUseHistoricalRequests() },
        { id:'photo-history', label:'Photo History', section:'archive', visible:canOpenPhotoHistory() }
    ].filter(item => item.visible).map(item => ({...item,label:tableDirectoryDetails[item.id]?.[0] || item.label}));
}

function managerTableDirectoryItems(items) {
    const order = ['assigned-items','user-controls','ph-job-codes','tx-job-codes','user-role-access','company-directory',
        'customer-assignments','action-discrepancy','inquiry-coverage','av-note-users','season','season-priority'];
    const schedules = items.filter(item => item.nursery
        || item.section === 'schedule' && !items.some(row => row.id === 'prod-schedule'));
    return [...order.map(key => items.find(item => item.id === key)).filter(Boolean), ...schedules];
}

function renderManagerTableWorkspaceMarkup(content, selected, items, query, escape) {
    const directory = managerTableDirectoryItems(items);
    if (!selected) return renderManagerTableDirectoryMarkup(directory, query, escape);
    const active = items.find(item => item.id === selected);
    const choices = [...directory, ...items.filter(item => item.section === 'archive')];
    const options = choices.map(item => renderManagerTableOption(item,selected,escape)).join('');
    const title = escape(active?.label || selected);
    return `<section id="view-table-management" data-table-directory-mode="table"
        data-selected-table="${escape(selected)}" aria-label="Table Management workspace">
        <nav class="table-management-selector" data-table-selector aria-label="Table navigation">
            <button type="button" data-table-all onclick="return openManagerTableManagement()">← All Tables</button>
            <strong class="table-management-title" title="${title}">${title}</strong>
            <select data-table-switch aria-label="Switch Table" onchange="return openManagerTableManagement(this.value)">
                <option value="" selected disabled>Switch Table ▾</option>${options}
            </select>
        </nav>
        <div class="table-management-workspace" data-table-workspace>${content}</div>
    </section>`;
}

function renderManagerTableOption(item,selected,escape) {
    return `<option value="${escape(item.id)}" data-manager-table-pill="${escape(item.id)}" aria-pressed="${item.id === selected}">${escape(item.label)}</option>`;
}

function renderManagerTableDirectoryMarkup(directory, query, escape) {
    const search = String(query || '').trim().toLowerCase();
    const cards = directory.map(item => renderManagerTableChoice(item,search,escape)).join('');
    return `<section id="view-table-management" data-table-directory-mode="index"
        data-selected-table="" aria-label="Table Management directory">
        <div class="table-management-directory" data-table-directory>${cards}</div>
    </section>`;
}

function renderManagerTableChoice(item,search,escape) {
    const description = tableDirectoryDetails[item.id]?.[1] || item.description || '';
    const hidden = search && !(item.label+' '+description).toLowerCase().includes(search) ? 'hidden' : '';
    return `<button type="button" class="admin-directory-card" data-manager-table-card="${escape(item.id)}" ${hidden}
        onclick="return openManagerTableManagement(this.dataset.managerTableCard)">
        <span class="admin-directory-copy"><strong>${escape(item.label)}</strong><small>${escape(description)}</small></span>
        <span class="admin-directory-chevron" aria-hidden="true">›</span>
    </button>`;
}
function indexAssignedPlantGroupSources(sources, index, indexRow) {
    for (const source of new Set(sources)) indexAssignedPlantGroupEntries(source, index, indexRow);
}

function indexAssignedPlantGroupEntries(source, index, indexRow) {
    for (const entry of source?.values?.() || []) {
        if (Array.isArray(entry)) entry.forEach(row => indexRow(index, row));
        else indexRow(index, entry);
    }
}

function getManagerToolTabs(access = getManagersToolAccess()) {
    const tabs = [];
    if (access.canViewApproval) tabs.push({ id: MANAGER_APPROVAL_HOME_VIEW, label: 'Approval' });
    if (access.canViewMoves) tabs.push({ id: 'moves', label: 'Move' });
    if (access.canManageSeasonSettings) tabs.push({ id: APP_SEASON_SETTINGS_VIEW, label: 'Season' });
    if (access.canViewSeasonPriority) tabs.push({ id: MANAGER_SEASON_PRIORITY_VIEW, label: 'Season Priority' });
    if (access.canViewProductionSchedule) tabs.push({ id: MANAGER_PRODUCTION_SCHEDULE_VIEW, label: 'Production Schedule' });
    if (access.canViewHrCommand) tabs.push({ id: MANAGER_HR_COMMAND_VIEW, label: 'HR & Labor' });
    if (access.canManageCompanyDirectory) tabs.push({ id: MANAGER_COMPANY_DIRECTORY_VIEW, label: 'Company Directory' });
    if (access.canManageAvBlanksPhotoBypass) tabs.push({ id: AV_BLANKS_PHOTO_BYPASS_SETTINGS_VIEW, label: 'AV Note Users' });
    if (access.canManageItemInquiryCoverage) tabs.push({ id: ITEM_INQUIRY_COVERAGE_SETTINGS_VIEW, label: 'Inquiry Coverage' });
    if (access.canViewInventoryTransactions) tabs.push({ id: INVENTORY_TRANSACTION_HISTORY_VIEW, label: 'Transaction History' });
    if (access.canViewTransactionsKeyed) tabs.push({ id: MANAGER_TRANSACTIONS_KEYED_VIEW, label: 'Transactions Keyed' });
    if (access.canViewOrders) tabs.push({ id: MANAGER_ORDERS_VIEW, label: 'Orders' });
    if (access.canViewTableManagement) {
        tabs.push({ id: MANAGER_TABLE_MANAGEMENT_VIEW, label: 'Table Management' });
        tabs.push({ id: 'action-discrepancy', label: 'Action Discrepancy' });
    }
    if (access.canViewAssignedItemsExport) tabs.push({ id: MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW, label: 'Assigned Items' });
    if (access.canManageCustomerRepMappings) tabs.push({ id: MANAGER_CUSTOMER_REP_MAP_VIEW, label: 'Customer Assignments' });
    if (access.canViewEvalReports) tabs.push({ id: MANAGER_EVAL_REPORTS_VIEW, label: 'Eval Reports' });
    if (access.canViewEvalReports2) tabs.push({ id: MANAGER_EVAL_REPORTS_2_VIEW, label: 'Reports' });
    if (access.canViewHistoricalReport) tabs.push({ id: MANAGER_HISTORICAL_REPORT_VIEW, label: 'Historical Report' });
    if (access.canViewShortageCancel) tabs.push({ id: MANAGER_SHORTAGE_CANCEL_VIEW, label: 'Shortage/Cancel' });
    if (access.canViewBlockClearing) tabs.push({ id: MANAGER_BLOCK_CLEARING_VIEW, label: 'Block Clearing' });
    if (access.canManageAccessControl) tabs.push({ id: MANAGER_ACCESS_CONTROL_VIEW, label: 'User & Role Access' });
    if (access.canViewCodexOperations) tabs.push({ id: MANAGER_CODEX_OPERATIONS_VIEW, label: 'Codex Operations' });

    if (access.canManageDeliveryRecovery) tabs.push({ id: MANAGER_DELIVERY_RECOVERY_VIEW, label: 'Delivery Recovery' });
    if (access.canViewLaborHours) tabs.push({ id: 'hours', label: 'Labor Hours' });
    return tabs;
}


function renderTransactionsKeyedPanel() {
    if (!canViewTransactionsKeyed()) return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">Transactions Keyed is available only to Dylan, Megan, and JD.</div>';
    const state = managerTransactionsKeyedState;
    if (!state.loaded && !state.loading) setTimeout(() => loadTransactionsKeyedDashboard(false), 0);
    const summary = state.summary || {};
    const summaryCards = [
        ['Canonical Files', summary.canonicalFiles, 'ph-files'],
        ['Rows', summary.totalRows, 'ph-list-numbers'],
        ['Creators', summary.distinctCreators, 'ph-users-three'],
        ['Duplicates', summary.duplicateFiles, 'ph-copy'],
        ['Excluded', summary.excludedRows, 'ph-warning-circle']
    ].map(([label, value, icon]) => `<div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="flex items-center justify-between gap-2"><div class="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">${escapeHtml(label)}</div><i class="ph-bold ${icon} text-emerald-500"></i></div><div class="mt-2 text-2xl font-black text-slate-900">${escapeHtml(formatTransactionsKeyedCount(value))}</div></div>`).join('');
    const dateOptions = state.availableDates.map((entry) => `<option value="${escapeHtml(String(entry.transaction_date || '').slice(0, 10))}" ${String(entry.transaction_date || '').slice(0, 10) === state.selectedDate ? 'selected' : ''}>${escapeHtml(formatTransactionsKeyedDate(entry.transaction_date))} — ${escapeHtml(formatTransactionsKeyedCount(entry.row_count))} rows</option>`).join('');
    const errorHtml = state.error ? `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><div>${escapeHtml(state.error)}</div><button type="button" class="mt-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-700" onclick="return loadTransactionsKeyedDashboard(true)">Retry</button></div>` : '';
    const loadingHtml = state.loading && !state.loaded ? '<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">Loading Transactions Keyed...</div>' : '';
    return `<div class="space-y-5">
        <div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div class="text-[10px] font-black uppercase tracking-[0.16em] text-[#007a4d]">Manager Reporting</div><div class="mt-1 text-xl font-black text-slate-900">Transactions Keyed</div><div class="mt-1 max-w-3xl text-[12px] font-semibold text-slate-500">Each imported row is one keyed occurrence. Daily shares use Transaction Date in America/Chicago; exact duplicate workbooks are archived without double-counting.</div></div><button type="button" class="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.13em] text-emerald-800 ${state.loading ? 'pointer-events-none opacity-60' : ''}" onclick="return loadTransactionsKeyedDashboard(true)"><i class="ph-bold ph-arrows-clockwise mr-1"></i>${state.loading ? 'Refreshing' : 'Refresh'}</button></div><div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"><label class="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Date<select class="mt-1 min-h-[48px] w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-black text-slate-900" onchange="return setTransactionsKeyedDate(this.value)">${dateOptions || '<option value="">No dates imported</option>'}</select></label><label class="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Created By Search<div class="mt-1 flex gap-2"><input id="transactions-keyed-search" type="search" class="min-h-[48px] min-w-0 flex-1 rounded-xl border border-emerald-100 bg-white px-3 text-sm font-bold text-slate-900" value="${escapeHtml(state.search || '')}" placeholder="Search a name" oninput="return setTransactionsKeyedSearch(this.value)"><button type="button" class="min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase text-slate-600" onclick="return clearTransactionsKeyedSearch()">Clear</button></div></label></div></div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">${summaryCards}</div>
        <div class="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div class="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Imported Range</div><div class="mt-1 text-sm font-black text-slate-800">${escapeHtml(formatTransactionsKeyedDate(summary.firstTransactionDate))} – ${escapeHtml(formatTransactionsKeyedDate(summary.lastTransactionDate))}</div></div>
        ${errorHtml}${loadingHtml}
        <section class="space-y-3"><div class="flex flex-wrap items-end justify-between gap-2"><div><div class="text-[10px] font-black uppercase tracking-[0.15em] text-[#007a4d]">Date View</div><h3 class="mt-1 text-lg font-black text-slate-900">${escapeHtml(formatTransactionsKeyedDate(state.selectedDate || summary.selectedDate))}</h3></div><div class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">${escapeHtml(formatTransactionsKeyedCount(state.dateMetrics.length))} names</div></div>${renderTransactionsKeyedMetricTable(state.dateMetrics, false)}</section>
        <section class="space-y-3"><div class="flex flex-wrap items-end justify-between gap-2"><div><div class="text-[10px] font-black uppercase tracking-[0.15em] text-[#007a4d]">All Dates</div><h3 class="mt-1 text-lg font-black text-slate-900">Daily and Historical Shares</h3></div><div class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">${escapeHtml(formatTransactionsKeyedCount(state.allDates.length))} of ${escapeHtml(formatTransactionsKeyedCount(state.allDatesTotal))}</div></div>${renderTransactionsKeyedMetricTable(state.allDates, true)}${state.allDatesHasMore && !state.loadingMoreDates && !state.error ? `<bloomscapes-page-edge data-page="share-dates"></bloomscapes-page-edge>` : ''}</section>
        <section class="space-y-3"><div class="flex flex-wrap items-end justify-between gap-2"><div><div class="text-[10px] font-black uppercase tracking-[0.15em] text-[#007a4d]">Processed Files</div><h3 class="mt-1 text-lg font-black text-slate-900">Import Ledger</h3></div><div class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">${escapeHtml(formatTransactionsKeyedCount(state.files.length))} of ${escapeHtml(formatTransactionsKeyedCount(state.filesTotal))}</div></div>${renderTransactionsKeyedFiles(state.files)}${state.filesHasMore && !state.loadingMoreFiles && !state.error ? `<bloomscapes-page-edge data-page="share-files"></bloomscapes-page-edge>` : ''}</section>
    </div>`;
}

function renderManagerOrdersPanel() {
    if (!canViewManagerOrders()) return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">Orders is available only to active managers.</div>';
    const state = managerOrdersState;
    const sourceLabel = getManagerOrderSourceLabel(state.sourceKey);
    if (!state.loaded && !state.loading && state.level === 'sources') setTimeout(() => loadManagerOrderSources(false), 0);
    const errorHtml = state.error ? `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><div>${escapeHtml(state.error)}</div><button type="button" class="mt-3 min-h-[44px] rounded-xl border border-red-200 bg-white px-4 text-[10px] font-black uppercase" onclick="return refreshManagerOrders()">Retry</button></div>` : '';
    const loadingHtml = state.loading && !state.rows.length && !state.batches.length ? '<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">Loading Orders...</div>' : '';
    const header = `<div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="flex flex-wrap items-center justify-between gap-3"><div class="flex min-w-0 items-center gap-3">${state.level !== 'sources' ? '<button data-secondary-back="true" aria-hidden="true" type="button" class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-800" aria-label="Back" onclick="return backManagerOrders()"><i class="ph-bold ph-arrow-left"></i></button>' : ''}<div class="min-w-0"><div class="text-[10px] font-black uppercase tracking-[0.16em] text-[#007a4d]">Managers · Orders</div><div class="mt-1 truncate text-xl font-black text-slate-900">${escapeHtml(state.level === 'detail' && state.batch ? state.batch.displayName : state.level === 'batches' ? sourceLabel : 'Orders')}</div><div class="mt-1 text-[11px] font-semibold text-slate-500">Frozen Drive Mode history from processed order files.</div></div></div><button type="button" class="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800 ${state.loading ? 'pointer-events-none opacity-60' : ''}" onclick="return refreshManagerOrders()"><i class="ph-bold ph-arrows-clockwise mr-1"></i>Refresh</button></div></div>`;

    if (state.level === 'sources') {
        const cards = renderManagerOrderSourceCards(state.sources);
        return `<div class="space-y-5">${header}${errorHtml}${loadingHtml}<div class="space-y-3">${cards}</div></div>`;
    }

    if (state.level === 'batches') {
        const cards = renderManagerOrderBatchCards(state.batches,sourceLabel);
        return `<div class="space-y-5">${header}${errorHtml}${loadingHtml}<div class="space-y-3">${cards}</div>${state.batchesHasMore && !state.loading && !state.error ? `<bloomscapes-page-edge data-page="order-batches"></bloomscapes-page-edge>` : ''}</div>`;
    }

    const selected = state.selectedAssigneeKeys || new Set();
    const assigneeButtons = [`<button type="button" class="min-h-[44px] rounded-full border px-4 text-[10px] font-black uppercase ${selected.size === 0 ? 'border-[#007a4d] bg-[#007a4d] text-white' : 'border-emerald-200 bg-white text-emerald-800'}" onclick="return toggleManagerOrderAssignee('all')">All</button>`]
        .concat(state.assignees.map((entry) => `<button type="button" class="min-h-[44px] rounded-full border px-4 text-[10px] font-black uppercase ${selected.has(String(entry.key || '').toLowerCase()) ? 'border-[#007a4d] bg-[#007a4d] text-white' : 'border-emerald-200 bg-white text-emerald-800'}" onclick="return toggleManagerOrderAssignee('${escJsAttrValue(String(entry.key || ''))}')">${escapeHtml(entry.label || 'Unassigned')} · ${escapeHtml(String(entry.rowCount || 0))}</button>`)).join('');
    const unmatchedTotal = Number(state.batch && state.batch.unmatchedItemCount || state.unmatchedItems.length);
    const unmatchedHtml = state.unmatchedItems.length ? `<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div class="flex items-center gap-2 text-sm font-black text-amber-900"><i class="ph-bold ph-warning"></i>${escapeHtml(String(unmatchedTotal))} unmatched Item${unmatchedTotal === 1 ? '' : 's'}</div><div class="mt-2 flex flex-wrap gap-2">${state.unmatchedItems.slice(0, 25).map((entry) => `<span class="rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-black text-amber-800">${escapeHtml(entry.itemcode || '-')}</span>`).join('')}${unmatchedTotal > 25 ? `<span class="px-2 py-1 text-[10px] font-black text-amber-700">+${escapeHtml(String(unmatchedTotal - 25))} more</span>` : ''}</div></div>` : '';
    const rowsHtml = state.rows.length ? state.rows.map(renderManagerOrderDriveCard).join('') : (!state.loading ? '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No Drive Mode rows match this AssignedTo filter.</div>' : '');
    return `<div class="space-y-5">${header}${errorHtml}${loadingHtml}${state.batch ? `<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">${[['Source Rows', state.batch.sourceRowCount], ['Items', state.batch.distinctItemCount], ['Matched Items', state.batch.matchedItemCount], ['Drive Rows', state.batch.inventoryRowCount]].map(([label, value]) => `<div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">${escapeHtml(label)}</div><div class="mt-2 text-2xl font-black text-slate-900">${escapeHtml(String(value || 0))}</div></div>`).join('')}</div>` : ''}${unmatchedHtml}<section class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">AssignedTo</div><div class="mt-3 flex flex-wrap gap-2">${assigneeButtons}</div></section><div class="flex items-center justify-between gap-3"><div class="text-sm font-black text-slate-800">${escapeHtml(String(state.filteredRowCount || 0))} matching rows</div><div class="text-[10px] font-black uppercase text-slate-400">Frozen at import</div></div><div class="space-y-3">${rowsHtml}</div>${state.rowsHasMore && !state.loading && !state.error ? `<bloomscapes-page-edge data-page="order-rows"></bloomscapes-page-edge>` : ''}</div>`;
}

function renderManagerOrderSourceCards(sources) {
    if (!sources.length) return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No order sources are available yet.</div>';
    return sources.map(renderManagerOrderSourceCard).join('');
}

function renderManagerOrderSourceCard(source) {
    return `<button type="button" class="w-full rounded-2xl border border-emerald-200 bg-white p-5 text-left shadow-sm active:scale-[0.99]" onclick="return openManagerOrderSource('${escJsAttrValue(source.sourceKey || 'pikes')}')"><div class="flex items-start justify-between gap-4"><div><div class="text-2xl font-black text-[#007a4d]">${escapeHtml(source.label || 'Pikes')}</div><div class="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">${escapeHtml(String(source.batchCount || 0))} historical batches${Number(source.failedCount || 0) ? ` • ${escapeHtml(String(source.failedCount))} pending failure${Number(source.failedCount) === 1 ? '' : 's'}` : ''}</div>${source.latestDisplayName ? `<div class="mt-2 text-sm font-bold text-slate-600">Latest: ${escapeHtml(source.latestDisplayName)}</div>` : ''}</div><i class="ph-bold ph-caret-right text-2xl text-emerald-500"></i></div></button>`;
}

function renderManagerOrderBatchCards(batches,sourceLabel) {
    const cards = batches.length ? batches.map((batch) => `<button type="button" class="w-full rounded-2xl border border-emerald-200 bg-white p-5 text-left shadow-sm active:scale-[0.99]" onclick="return openManagerOrderBatch('${escJsAttrValue(batch.batchId || '')}')"><div class="flex items-start justify-between gap-4"><div class="min-w-0"><div class="truncate text-xl font-black text-[#007a4d]">${escapeHtml(batch.displayName || sourceLabel)}</div><div class="mt-1 break-words text-[11px] font-semibold text-slate-500">${escapeHtml(batch.fileName || '-')}</div><div class="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase"><span class="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">${escapeHtml(String(batch.inventoryRowCount || 0))} Drive rows</span><span class="rounded-full bg-sky-50 px-3 py-1 text-sky-800">${escapeHtml(String(batch.distinctItemCount || 0))} Items</span>${Number(batch.unmatchedItemCount || 0) ? `<span class="rounded-full bg-amber-100 px-3 py-1 text-amber-800">${escapeHtml(String(batch.unmatchedItemCount))} unmatched</span>` : ''}</div></div><i class="ph-bold ph-caret-right text-2xl text-emerald-500"></i></div></button>`).join('') : `<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No processed ${escapeHtml(sourceLabel)} files yet.</div>`;
    return cards;
}

function renderManagerHistoricalReportPanel() {
    if (!canViewManagerHistoricalReport()) {
        return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">Historical Reports are available only to Dylan and Megan.</div>';
    }
    const state = managerHistoricalReportState;
    const modeTabs = `<div class="inline-flex flex-wrap gap-2 rounded-2xl border border-emerald-100 bg-white p-2"><button type="button" aria-pressed="${managerHistoricalReportMode === 'inventory-history'}" class="min-h-[42px] rounded-xl border px-4 text-[10px] font-black uppercase tracking-[0.12em] ${managerHistoricalReportMode === 'inventory-history' ? 'border-[#007a4d] bg-[#007a4d] text-white' : 'border-slate-200 bg-white text-slate-600'}" onclick="return setManagerHistoricalReportMode('inventory-history')">Inventory History</button><button type="button" aria-pressed="${managerHistoricalReportMode === 'imported-files'}" class="min-h-[42px] rounded-xl border px-4 text-[10px] font-black uppercase tracking-[0.12em] ${managerHistoricalReportMode === 'imported-files' ? 'border-[#007a4d] bg-[#007a4d] text-white' : 'border-slate-200 bg-white text-slate-600'}" onclick="return setManagerHistoricalReportMode('imported-files')">Imported Files</button></div>`;
    if (managerHistoricalReportMode === 'imported-files') return `<div class="space-y-4">${modeTabs}${renderManagerImportedFilesPanel()}</div>`;
    const errorHtml = state.error ? `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><div>${escapeHtml(state.error)}</div><button type="button" class="mt-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-700" onclick="return ${state.level === 'names' ? 'loadManagerHistoricalCommonNames(managersSearchTerm, true)' : (state.level === 'sizes' ? `selectManagerHistoricalCommonName('${escJsAttrValue(state.selectedCommonName)}')` : 'loadManagerHistoricalRows(true)')}">Retry</button></div>` : '';
    if (state.level === 'names') {
        const {content,crumbText} = projectManagerHistoricalNames(state);
        return `<div class="space-y-4">${modeTabs}<div class="space-y-4">${renderManagerHistoricalDriveChrome(crumbText, state.commonNames.length ? `${formatManagerHistoricalCount(state.commonNames.length)} names` : '')}${errorHtml}${content}</div></div>`;
    }
    if (state.level === 'sizes') {
        const {content,filteredSizes} = projectManagerHistoricalSizes(state);
        const crumbText = `Historical Report > ${state.selectedCommonName} > Select ContSize (${filteredSizes.length} sizes)`;
        return `<div class="space-y-4">${modeTabs}<div class="space-y-4">${renderManagerHistoricalDriveChrome(crumbText, `${formatManagerHistoricalCount(filteredSizes.length)} sizes`)}${errorHtml}${content}</div></div>`;
    }
    const rows = getFilteredManagerHistoricalRows();
    const selectedCount = Array.isArray(state.selectedColumns) ? state.selectedColumns.length : 0;
    const dirtyNotice = state.dirty ? '<span class="rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-orange-700">Run Report to apply changes</span>' : '';
    const resultHtml = state.loading
        ? '<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">Loading historical rows...</div>'
        : (rows.length
            ? (state.displayMode === 'grid' ? renderManagerHistoricalRowsGrid(rows) : `<div class="space-y-3">${rows.map(renderManagerHistoricalRowCard).join('')}</div>`)
            : '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No historical rows matched this Common Name, ContSize, and date range.</div>');
    const crumbText = `Historical Report > ${state.selectedCommonName} > ${state.selectedContSize} (${rows.length} rows)`;
    return `<div class="space-y-4">${modeTabs}<div class="space-y-4">${renderManagerHistoricalDriveChrome(crumbText, `${formatManagerHistoricalCount(rows.length)} loaded`)}<div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div class="text-[10px] font-black uppercase tracking-[0.16em] text-[#007a4d]">Historical Drive Rows</div><div class="mt-1 text-[12px] font-semibold text-slate-500">Newest report dates appear first.</div></div><div class="flex flex-wrap gap-2">${dirtyNotice}<button type="button" class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 ${rows.length ? '' : 'pointer-events-none opacity-50'}" onclick="return exportManagerHistoricalLoadedRowsToExcel()"><i class="ph-bold ph-download-simple mr-1"></i>Export Loaded</button></div></div><div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]"><label class="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">From<input type="date" class="mt-1 w-full rounded-xl border border-emerald-100 px-3 py-3 text-sm font-black text-slate-900" value="${escapeHtml(state.dateStart)}" onchange="setManagerHistoricalDateRange('start', this.value)"></label><label class="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">To<input type="date" class="mt-1 w-full rounded-xl border border-emerald-100 px-3 py-3 text-sm font-black text-slate-900" value="${escapeHtml(state.dateEnd)}" onchange="setManagerHistoricalDateRange('end', this.value)"></label><button type="button" class="min-h-[48px] self-end rounded-xl bg-[#007a4d] px-5 py-3 text-[11px] font-black uppercase tracking-[0.13em] text-white shadow-sm ${selectedCount ? '' : 'pointer-events-none opacity-50'}" onclick="return loadManagerHistoricalRows(true)"><i class="ph-bold ph-play mr-1"></i>Run Report</button></div></div>${renderManagerHistoricalColumnChooser()}${errorHtml}${resultHtml}${state.hasMore && !state.loadingMore && !state.error ? `<bloomscapes-page-edge data-page="historical"></bloomscapes-page-edge>` : ''}</div></div>`;
}

function projectManagerHistoricalNames(state) {
    const term = String(firstNonEmptyValue(managersSearchTerm, state.lastSearch, '') || '').trim();
    const content = state.loading
        ? `<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">${term ? 'Searching' : 'Loading'} historical Common Names...</div>`
        : (state.commonNames.length
            ? renderManagerHistoricalDrillResults(state.commonNames, 'names')
            : `<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">${term ? 'No historical Common Names matched that search.' : 'No historical Common Names are available.'}</div>`);
    const crumbText = term ? `Historical Report > Select Common Name (${state.commonNames.length} matches)` : `Historical Report > Browse Common Name (${state.commonNames.length} loaded)`;
    return {content,crumbText};
}

function projectManagerHistoricalSizes(state) {
    const filteredSizes = (Array.isArray(state.containerSizes) ? state.containerSizes : []).filter((row) => managerTextMatchesSearch([row && row.contsize]));
    const content = state.loading
        ? '<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">Loading historical container sizes...</div>'
        : (filteredSizes.length ? renderManagerHistoricalDrillResults(filteredSizes, 'sizes') : '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No historical container sizes matched.</div>');
    return {content,filteredSizes};
}
