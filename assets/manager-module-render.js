function renderManagers() {
    if(typeof syncInventoryExcelBars==='function') syncInventoryExcelBars();
    if (getCurrentVisibleViewId() !== 'managers') return;
    mountBloomscapesDepartmentShortcuts('managers');
    if (activeHomeTab === AV_BLANKS_PHOTO_BYPASS_SETTINGS_VIEW) ensureSeasonSalesNoteAccessFresh();
    const container = document.getElementById('managers-content');
    if (!container) return;
    if (keepManagerAssignedSurface(container) || deferActiveBlockClearingRender(container)) return;
    if (!canAccessView('managers')) {
        switchView(getDefaultViewForAccess());
        return;
    }
    const tabs = resolveManagerRenderTabs();
    if (!tabs || keepManagerModuleSurface(container)) return;
    let html = buildManagerRenderHtml(tabs);
    if (usesManagerTableShell()) {
        const table=activeHomeTab===MANAGER_TABLE_MANAGEMENT_VIEW ? managerTableManagementSelection : getManagerTableManagementKey(activeHomeTab);
        html=renderManagerTableManagementWorkspace(html,table);
    }
    patchManagerRenderedSurface(container, html);
    if (bloomscapesWorkflowTab(activeHomeTab)) mountBloomscapesWorkflowPanel(container, activeHomeTab);
    if (activeHomeTab === BLOOMSCAPES_ARCHITECTURE_TAB) void mountBloomscapesSandboxStatus(container);
    if (activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW) bindEvalReport2DrillCommands(container);
    mountManagerPrimarySurfaces(container, tabs.canViewRuntimeWatchdog);
    mountManagerPagedApprovals(container);
    mountManagerAuxiliarySurfaces(container);

    restoreManagerRenderedViewport(container);
}

function keepManagerAssignedSurface(container) {
    // The access editor owns its form and asynchronous directory updates.
    if (activeHomeTab === MANAGER_ACCESS_CONTROL_VIEW && isFullAppAdministrator()
        && container.querySelector('#canonical-user-access-editor')) return true;
    const assignedStateBeforeRender = getManagerAssignedColumnState();
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && assignedStateBeforeRender.opening && canViewAssignedItemsExport()) return true;
    if (assignedStateBeforeRender.editor && (activeHomeTab !== MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW
        || !canAccessView('managers') || !canViewAssignedItemsExport())) closeManagerAssignedColumnFilter(false, false);
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && canViewAssignedItemsExport()) {
        const state = assignedStateBeforeRender;
        const rows = getManagerAssignedItemsDisplayRows();
        const low = getManagerItemLowStockTargetsState();
        const fingerprint = JSON.stringify([managersSearchTerm, managerAssignedItemsAssignedToFilter, state.filters, state.sort,
            state.viewMode, state.editor?.field, [...managerEvalAssignmentSelection], [...(state.defaultPending || [])],
            state.defaultDrafts, [...low.drafts], [...low.saving], low.error, low.revision, getManagerAssignableOwnerUsers(),
            canManageEvalItemcodeAssignments(), canManageItemLowStockTargets(), isManagerAssignedSnapshotCurrent()]);
        if (state.view && state.viewHost?.isConnected && state.panelFingerprint === fingerprint && !state.restoreScroll
            && sameAssignedDisplayRows(state.panelRows, rows)) {
            state.panelRows = rows;
            return true;
        }
        state.panelRows = rows;
        state.panelFingerprint = fingerprint;
        const previousPanel = container.querySelector('.assigned-filter-controls');
        if (previousPanel && !assignedStateBeforeRender.restoreScroll && getCurrentVisibleViewId() === 'managers') {
            assignedStateBeforeRender.scroll = getMainAreaScrollTop();
            if (!assignedStateBeforeRender.view) assignedStateBeforeRender.restoreScroll = true;
            assignedStateBeforeRender.phoneExpanded = !!previousPanel.querySelector('.assigned-phone-filters[open]');
        }
        assignedStateBeforeRender.search = managersSearchTerm;
    }
    return false;
}

function deferActiveBlockClearingRender(container) {
    if (activeHomeTab === MANAGER_BLOCK_CLEARING_VIEW && !managerBlockClearingDraftState.restore && container.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) {
        // Realtime/viewport updates must not replace a field while its native keyboard is open.
        if (!container.dataset.blockClearingRefreshDeferred) {
            container.dataset.blockClearingRefreshDeferred = '1';
            container.addEventListener('focusout', () => resumeBlockClearingManagerRender(container), { once: true });
        }
        return true;
    }
    return false;
}

function resumeBlockClearingManagerRender(container) {
    delete container.dataset.blockClearingRefreshDeferred;
    requestAnimationFrame(() => { if (activeHomeTab === MANAGER_BLOCK_CLEARING_VIEW) scheduleManagersRender(true); });
}

function resolveManagerRenderTabs() {
    const access = getManagersToolAccess();
    const managerApprovalTabs = getManagerApprovalTabs(access);
    const managerToolTabs = getManagerToolTabs(access);
    if (nativeAuthSessionActive) managerToolTabs.push(...BLOOMSCAPES_WORKFLOW_TABS.filter(tab=>tab.id!=='bloomscapes-radio'));
    const allowedTabs = new Set();
    if (nativeAuthSessionActive) allowedTabs.add('bloomscapes-radio');
    if (canViewBloomscapesArchitecture(currentUser, nativeAuthProfile, nativeAuthSessionActive)) allowedTabs.add(BLOOMSCAPES_ARCHITECTURE_TAB);
    allowedTabs.add('dashboard');
    const canViewRuntimeWatchdog = ['dylan_collyge', 'megan_kelly', 'jd_jones'].includes(String(currentUser || '').trim().toLowerCase());
    if (canViewRuntimeWatchdog) allowedTabs.add(MANAGER_RUNTIME_WATCHDOG_VIEW);
    if (access.canViewProductivity) allowedTabs.add('productivity');
    managerToolTabs.forEach((tab) => allowedTabs.add(tab.id));
    managerApprovalTabs.forEach((tab) => allowedTabs.add(tab.id));
    if (!allowedTabs.has(activeHomeTab)) {
        if (shouldRetainManagerModuleDuringAccessRefresh(activeHomeTab, allowedTabs, appAccessSnapshotState,
            currentUser, hasRetainedAuthenticatedAppAccess(), window.GncUserAccessControl?.getSelfState?.().denied === true)) return null;
        activeHomeTab = 'dashboard';
        selectedProductivityUser = '';
    }
    return { access, managerApprovalTabs, managerToolTabs, canViewRuntimeWatchdog };
}

function keepManagerModuleSurface(container) {
    if (bloomscapesFarmWorkspaceSelection() && keepBloomscapesFarmWorkspace(container)) return true;
    if (activeHomeTab === MANAGER_ACCESS_CONTROL_VIEW && document.getElementById('effective-user-access-editor')) renderNavigationPreferencesEditor('access', document.getElementById('effective-user-access-editor'));
    if (activeHomeTab !== MANAGER_TABLE_MANAGEMENT_VIEW) destroyManagerTableManagement();
    if (activeHomeTab === MANAGER_TABLE_MANAGEMENT_VIEW && managerTableManagementInstance?.root?.isConnected
        && managerTableManagementInstance.identity === getSupabaseReadIdentityScope() && managerTableManagementInstance.selected === managerTableManagementSelection
        && managerTableManagementInstance.tableKeys === getManagerTableManagementItems().map(item => item.id).join('|')) { syncManagerTableManagementViewport(); return true; }
    if (activeHomeTab !== MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && managerAssignedColumnState.viewHost) destroyManagerAssignedItemsView();
    if (activeHomeTab !== MANAGER_CUSTOMER_REP_MAP_VIEW) destroyCustomerRepMappingView();
    if (activeHomeTab === MANAGER_CUSTOMER_REP_MAP_VIEW) {
        const existingMapRoot = container.querySelector('#manager-customer-rep-map-root');
        if (existingMapRoot) { mountCustomerRepMappingView(existingMapRoot); return true; }
    }
    // Dashboard is the first useful Managers content; postpone its
    // responsive hub work until after the module buttons can paint.
    if (activeHomeTab !== 'dashboard') {
        window.GncMobileWorkspace.syncHub('managers');
        syncManagersHeaderChrome();
    }
    if (activeHomeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) {
        const existingScheduleRoot = container.querySelector('#manager-production-schedule-root');
        if (existingScheduleRoot) {
            window.GncProductionSchedule?.mount(existingScheduleRoot, (payload, signal) => postAppFunctionJson(APP_API_FUNCTION_URL, payload, { timeoutMs: 30000, label: 'Production Schedule', signal }), getSupabaseReadIdentityScope());
            return true;
        }
    }
    if (activeHomeTab === MANAGER_HR_COMMAND_VIEW) {
        const existingHrRoot = container.querySelector('#manager-hr-command-root');
        if (existingHrRoot) { void mountAlphaCommandCenter('hr', existingHrRoot); return true; }
    }
    // User & Role Access has its own authenticated canonical resolver.
    // Keep that editor available when the optional legacy audit matrix
    // cannot load; renderAccessControlPanel provides its own fallback.
    if (!bloomscapesWorkflowTab(activeHomeTab) && activeHomeTab !== BLOOMSCAPES_ARCHITECTURE_TAB && activeHomeTab !== MANAGER_RUNTIME_WATCHDOG_VIEW && activeHomeTab !== 'dashboard' && activeHomeTab !== MANAGER_ACCESS_CONTROL_VIEW && activeHomeTab !== MANAGER_CUSTOMER_REP_MAP_VIEW && activeHomeTab !== MANAGER_TABLE_MANAGEMENT_VIEW && activeHomeTab !== MANAGER_SEASON_PRIORITY_VIEW && activeHomeTab !== MANAGER_PRODUCTION_SCHEDULE_VIEW && activeHomeTab !== MANAGER_HR_COMMAND_VIEW && activeHomeTab !== MANAGER_COMPANY_DIRECTORY_VIEW && activeHomeTab !== MANAGER_EVAL_REPORTS_2_VIEW && !(typeof getManagerTableManagementKey === 'function' && getManagerTableManagementKey(activeHomeTab)) && activeHomeTab !== MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && ensureViewDataForRender('managers')) return true;
    if (activeHomeTab !== 'productivity') selectedProductivityUser = '';
    return false;
}

function buildManagerRenderHtml({ access, managerApprovalTabs, managerToolTabs, canViewRuntimeWatchdog }) {
    if (bloomscapesFarmWorkspaceSelection()) return '<div id="bloomscapes-native-farm-root"></div>';
    if (bloomscapesWorkflowTab(activeHomeTab)) return renderBloomscapesWorkflowPanel(activeHomeTab);
    if (activeHomeTab === BLOOMSCAPES_ARCHITECTURE_TAB) return renderBloomscapesArchitecturePanel();
    if (activeHomeTab === 'dashboard') return renderManagerModulePicker(access, managerApprovalTabs, managerToolTabs);
    if (activeHomeTab === MANAGER_RUNTIME_WATCHDOG_VIEW && canViewRuntimeWatchdog) return renderManagerRuntimeWatchdogPanel();
    if (activeHomeTab === MANAGER_APPROVAL_HOME_VIEW) return renderManagerApprovalHomePanel(managerApprovalTabs);
    if (activeHomeTab === 'productivity') return renderProductivityHomePanel();
    if (activeHomeTab === 'moves') return globalThis.renderManagerMovesPanel();
    if (activeHomeTab === APP_SEASON_SETTINGS_VIEW) return renderCurrentSeasonSettingsPanel();
    if (activeHomeTab === AV_BLANKS_PHOTO_BYPASS_SETTINGS_VIEW) return renderAvBlanksPhotoBypassSettingsPanel();
    if (activeHomeTab === ITEM_INQUIRY_COVERAGE_SETTINGS_VIEW) return renderItemInquiryCoveragePanel();
    if (activeHomeTab === INVENTORY_TRANSACTION_HISTORY_VIEW) return renderInventoryTransactionHistoryPanel();
    if (activeHomeTab === MANAGER_TRANSACTIONS_KEYED_VIEW) return renderTransactionsKeyedPanel();
    if (activeHomeTab === MANAGER_ORDERS_VIEW) return renderManagerOrdersPanel();
    if (activeHomeTab === MANAGER_TABLE_MANAGEMENT_VIEW) return renderManagerTableManagementPanel();
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW) return renderManagerAssignedItemsExportPanel();
    if (activeHomeTab === MANAGER_CUSTOMER_REP_MAP_VIEW) return '<div id="manager-customer-rep-map-root" role="region" aria-label="Customer assignment management"></div>';
    if (activeHomeTab === MANAGER_EVAL_REPORTS_VIEW) return renderManagerEvalReportsPanel();
    if (activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW) return renderManagerEvalReports2Panel();
    if (activeHomeTab === MANAGER_HISTORICAL_REPORT_VIEW) return renderManagerHistoricalReportPanel();
    if (activeHomeTab === MANAGER_SHORTAGE_CANCEL_VIEW) return renderManagerShortageCancelPanel();
    if (activeHomeTab === MANAGER_BLOCK_CLEARING_VIEW) return renderManagerBlockClearingPanel();
    if (activeHomeTab === MANAGER_ACCESS_CONTROL_VIEW) return '<div id="canonical-user-access-editor"></div><details><summary>Navigation and shortcuts</summary><div id="effective-user-access-editor"></div></details><details><summary>Existing access audit and limited administration</summary>' + renderAccessControlPanel() + '</details>';
    if (activeHomeTab === MANAGER_CODEX_OPERATIONS_VIEW) return renderCodexOperationsPanel();
    if (activeHomeTab === MANAGER_DELIVERY_RECOVERY_VIEW) return renderManagerDeliveryRecoveryPanel();
    if (activeHomeTab === MANAGER_SEASON_PRIORITY_VIEW) return renderManagerSeasonPriorityPanel();
    if (activeHomeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) return '<div id="manager-production-schedule-root"></div>';
    if (activeHomeTab === MANAGER_HR_COMMAND_VIEW) return '<div id="manager-hr-command-root" role="status">Loading HR &amp; Labor…</div>';
    if (activeHomeTab === MANAGER_COMPANY_DIRECTORY_VIEW && getManagersToolAccess().canManageCompanyDirectory) return '<div id="manager-company-directory-root"></div>';
    if (isManagerApprovalTab(activeHomeTab)) return renderManagerApprovalPanel(activeHomeTab);
    return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm font-bold text-slate-400">No manager tools are available for this login.</div>';
}

function patchManagerRenderedSurface(container, html) {
    const retainEvalReportShell = activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW && !isEvalAggregateDashboardVisible();
    const retainedControls = retainEvalReportShell && !managerEvalReport2DetailItemKey
        ? container.querySelector('.manager-eval2-drive-controls') : null;
    const retainedRecords = retainEvalReportShell
        ? container.querySelector('#manager-eval-report-2-records') : null;
    const retainedReportPicker = retainEvalReportShell
        ? container.querySelector('details[data-manager-eval2-report-picker][open]') : null;
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && patchManagerAssignedItemsShell(container, html)) {
        // The React host stays attached, preserving native focus and scroll measurements.
    } else if (retainedRecords || retainedReportPicker || retainedControls) {
        const shell = document.createElement('div');
        shell.innerHTML = html;
        const slot = shell.querySelector('#manager-eval-report-2-records');
        if (slot && retainedRecords) slot.replaceWith(retainedRecords);
        const controlsSlot = shell.querySelector('.manager-eval2-drive-controls');
        if (retainedControls && controlsSlot) controlsSlot.replaceWith(retainedControls);
        const reportPickerSlot = shell.querySelector('details[data-manager-eval2-report-picker]');
        if (retainedReportPicker && reportPickerSlot) reportPickerSlot.replaceWith(retainedReportPicker);
        // While a refresh is loading, its index may be temporarily
        // unavailable and the panel renderer returns only a spinner.
        // Keep the last complete panel attached so the open report
        // picker and its current choices survive that intermediate render.
        if (!(retainedReportPicker && !reportPickerSlot && managerEvalReport2LoadState.loading)) {
            container.replaceChildren(...shell.childNodes);
        }
    } else container.innerHTML = html;
}

function mountManagerPrimarySurfaces(container, canViewRuntimeWatchdog) {
    if (bloomscapesFarmWorkspaceSelection()) {
        mountBloomscapesFarmWorkspace(container.querySelector('#bloomscapes-native-farm-root'),bloomscapesFarmWorkspaceSelection());
        return;
    }
    if (typeof syncManagerTableManagementViewport === 'function') syncManagerTableManagementViewport();
    if (activeHomeTab === MANAGER_RUNTIME_WATCHDOG_VIEW && canViewRuntimeWatchdog) void refreshRuntimeWatchdogPanel();
    else if (activeHomeTab === 'dashboard' && canViewRuntimeWatchdog) void refreshRuntimeWatchdogBadge();
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW) void mountManagerAssignedItemsView(container.querySelector('#manager-assigned-items-root'));
    if (activeHomeTab === MANAGER_TABLE_MANAGEMENT_VIEW) mountManagerTableManagementPanel(container.querySelector('#manager-table-management-root'));
}

function mountManagerPagedApprovals(container) {
    if (!(isManagerApprovalTab(activeHomeTab) && ['ncr-approvals', 'move-up-approvals', 'move-down-approvals', 'hold-release-approvals', 'recount-approvals', 'not-on-inventory-approvals'].includes(String(activeHomeTab).toLowerCase()))) return;
    const host = container.querySelector('[data-manager-paged-approval="true"]');
    if (host && useManagerReportPages('approval')) {
        const query = buildManagerReportPageQuery('approval', 'rows', { filters:{ approvalTab:activeHomeTab, queue:'queue' } });
        mountPagedManagerReport(host, query, row => isNotOnInventoryApprovalTaskView(activeHomeTab)
            ? renderNotOnInventoryApprovalTaskCard(row) : renderNcrApprovalTaskCard(row), {
            estimateSize:280, emptyHtml:`<div class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-[12px] font-semibold text-slate-400">No ${esc(getManagerApprovalTabLabel(activeHomeTab))} rows waiting for ${esc(getManagerApprovalStageLabel())}.</div>`,
            getKey:row => String(row?.id || row?.ncr_id || row?.request_id || row?.unique_id || row?.master_unique_id || ''),
            onState:result => updateManagerApprovalCount(host, result)
        });
    }
    const outboxHost = container.querySelector('[data-manager-paged-outbox="true"]');
    if (outboxHost && useManagerReportPages('approval') && isNcrApprovalTaskView(activeHomeTab)) {
        const approvalType = getNcrApprovalTypeForTaskView(activeHomeTab);
        const query = buildManagerReportPageQuery('approval', 'rows', { filters:{ approvalTab:activeHomeTab, queue:'outbox' } });
        mountPagedManagerReport(outboxHost, query, (value, index) => renderNcrApprovalTaskCard(normalizePagedNcrOutboxRow(value, index, approvalType)), {
            estimateSize:280, emptyHtml:'<div class="rounded-xl border border-dashed border-amber-200 bg-white/80 px-4 py-6 text-center text-[12px] font-bold text-amber-500">No approved rows are waiting in the NCR session.</div>',
            getKey:(row, index) => String(row?.unique_id || row?.UNIQUE_ID || index),
            onState:result => updateManagerOutboxState(outboxHost, approvalType, result)
        });
    }
}

function updateManagerOutboxState(host, approvalType, result) {
    const total = Number(result.total ?? result.page?.total ?? 0);
    const activeLines = Number(result.page?.metadata?.activeLineCount ?? result.page?.metadata?.active_line_count
        ?? result.rows.reduce((sum, value, index) => sum + (getPaperNcrPackageFromItem(normalizePagedNcrOutboxRow(value, index, approvalType))?.activeRows?.length || 0), 0));
    const panel = host.closest('.rounded-2xl');
    const label = panel?.querySelector('[data-manager-outbox-count]');
    const send = panel?.querySelector('[data-manager-outbox-send]');
    if (label) label.textContent = `${total} item package${total === 1 ? '' : 's'} / ${activeLines} row${activeLines === 1 ? '' : 's'}`;
    if (send) send.disabled = total <= 0;
    if (result.error) {
        host.setAttribute('role', 'alert');
        host.textContent = result.error.message;
    }
}

function updateManagerApprovalCount(host, result) {
    const count = result.page?.metadata?.filteredRowCount ?? result.page?.total ?? result.total;
    if (!Number.isFinite(Number(count))) return;
    const label = host.closest('[data-manager-approval-panel]')?.querySelector('[data-manager-approval-count]');
    if (label) label.textContent = String(count);
}

function mountManagerAuxiliarySurfaces(container) {
    if (activeHomeTab === MANAGER_SEASON_PRIORITY_VIEW && useManagerReportPages('season-priority')) {
        mountManagerSeasonPriorityReportRows(container.querySelector('#manager-season-priority-report-rows'));
    }
    if (activeHomeTab === MANAGER_CUSTOMER_REP_MAP_VIEW) mountCustomerRepMappingView(container.querySelector('#manager-customer-rep-map-root'));
    if (activeHomeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) {
        const scheduleRoot = container.querySelector('#manager-production-schedule-root');
        if (scheduleRoot) window.GncProductionSchedule?.mount(scheduleRoot, (payload, signal) => postAppFunctionJson(APP_API_FUNCTION_URL, payload, { timeoutMs: 30000, label: 'Production Schedule', signal }), getSupabaseReadIdentityScope());
    }
    if (activeHomeTab === MANAGER_HR_COMMAND_VIEW) void mountAlphaCommandCenter('hr', container.querySelector('#manager-hr-command-root'));
    if (activeHomeTab === MANAGER_COMPANY_DIRECTORY_VIEW && getManagersToolAccess().canManageCompanyDirectory) mountCompanyDirectoryPanel(container.querySelector('#manager-company-directory-root'));
    if (activeHomeTab === MANAGER_ACCESS_CONTROL_VIEW && document.getElementById('effective-user-access-editor')) renderNavigationPreferencesEditor('access', document.getElementById('effective-user-access-editor'));
}

function restoreManagerRenderedViewport(container) {
    if (activeHomeTab === 'dashboard') {
        requestAnimationFrame(() => {
            if (getCurrentVisibleViewId() !== 'managers' || activeHomeTab !== 'dashboard') return;
            window.GncMobileWorkspace.syncHub('managers');
            syncManagersHeaderChrome();
        });
    } else {
        window.GncMobileWorkspace.syncHub('managers');
        syncManagersHeaderChrome();
    }
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && getManagerAssignedColumnState().editor) {
        renderManagerAssignedColumnOptions();
        positionManagerAssignedColumnFilter();
    }
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && getManagerAssignedColumnState().restoreScroll) {
        const assignedState = getManagerAssignedColumnState();
        assignedState.restoreScroll = false;
        schedulePostRenderMainAreaScrollRestore('managers', 'assigned-items-navigation', assignedState.scroll || 0);
    }
    if (activeHomeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW && getManagerAssignedColumnState().restoreFocus) {
        const assignedState = getManagerAssignedColumnState(), field = assignedState.restoreFocus;
        assignedState.restoreFocus = '';
        const phone = window.innerWidth < 768;
        const details = container.querySelector('.assigned-phone-filters');
        if (phone && details) details.open = true;
        const scope = container.querySelector(phone ? '.assigned-phone-filters' : '[data-manager-assigned-desktop-table]');
        scope?.querySelector(`[data-assigned-filter-trigger="${field}"]`)?.focus({ preventScroll: true });
    }
    if (activeHomeTab === MANAGER_BLOCK_CLEARING_VIEW) restoreManagerBlockClearingScrollAfterRender();
    if (activeHomeTab === MANAGER_EVAL_REPORTS_VIEW) requestAnimationFrame(renderManagerEvalReportRecords);
    if (activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW) renderManagerEvalReport2Viewport();
}

function renderManagerEvalReport2Viewport() {
    if (productionLiveSyncRendering) {
        renderManagerEvalReport2Records();
        return;
    }
    const token = Number(latestViewRenderTokensByView.managers);
    requestAnimationFrame(() => {
        if (getCurrentVisibleViewId() === 'managers' && activeHomeTab === MANAGER_EVAL_REPORTS_2_VIEW
            && Number(latestViewRenderTokensByView.managers) === token) renderManagerEvalReport2Records();
    });
}

function shouldRetainManagerModuleDuringAccessRefresh(tab, allowedTabs, accessState, username, retainedAccess, accessDenied) {
    const activeTab = String(tab || '').trim().toLowerCase();
    const userKey = getRequestCapabilityUsernameKey(username);
    const snapshot = accessState?.snapshot;
    const snapshotUser = getRequestCapabilityUsernameKey(snapshot?.username || accessState?.username || '');
    const refreshPending = accessState?.stale === true || ['loading', 'error'].includes(String(accessState?.status || ''));
    return activeTab !== 'dashboard' && !allowedTabs.has(activeTab) && refreshPending
        && !!snapshot && !!userKey && userKey === snapshotUser && retainedAccess === true && accessDenied !== true;
}

function hasDirectManagerUserDirectory() {
    return activeHomeTab===MANAGER_ACCESS_CONTROL_VIEW && !managerTableManagementSelection;
}

function usesManagerTableShell() {
    return typeof renderManagerTableManagementWorkspace==='function' && !hasDirectManagerUserDirectory() &&
        (activeHomeTab===MANAGER_TABLE_MANAGEMENT_VIEW || getManagerTableManagementKey(activeHomeTab));
}

function renderManagerModulePicker(access = getManagersToolAccess(), approvalTabs = null, toolTabs = null) {
    const options=getManagerModuleOptions(access,approvalTabs,toolTabs).filter(option=>
        option.id===MANAGER_ACCESS_CONTROL_VIEW || !getManagerTableManagementKey(option.id));
    const search=normalizeSearchValue(managersSearchTerm || '');
    const cards=options.map(option=>{
        const meta=getManagerModuleMeta(option.id);
        return {...option,...meta,label:option.label || meta.label};
    }).filter(option=>!search || managerTextMatchesSearch([option.label,option.description,option.id]));
    if (!cards.length) {
        return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">No manager modules match that search.</div>';
    }
    return '<div class="manager-module-grid">'+cards.map(renderManagerModuleCard).join('')+'</div>';
}

function renderManagerModuleCard(option) {
    const label=option.label || 'Module';
    const description=option.description || 'Open a manager workflow.';
    const name=esc(label+': '+description);
    const key=option.id===MANAGER_RUNTIME_WATCHDOG_VIEW ? 'watchdog-monitor' : esc(option.id);
    const count=option.id===MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW ? getManagerUnassignedItemcodes().length : 0;
    const badge=count ? '<span data-manager-unassigned-badge class="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">'+count+' unassigned</span>' : '';
    return '<button type="button" class="manager-module-card" data-manager-module="'+key+'" title="'+name+'" aria-label="'+name+
        '" onclick="return setHomeTab(\''+escJsAttrValue(option.id)+'\')">'+
        '<span class="manager-module-icon"><i class="ph-bold '+esc(option.icon || 'ph-squares-four')+'"></i></span>'+
        '<span class="manager-module-title">'+esc(label)+'</span>'+badge+'</button>';
}
