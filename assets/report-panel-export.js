function getManagerEvalReport2BrowseCrumbText() {
    const root = `Reports > ${getManagerEvalReport2Meta().label} > ${getManagerEvalAssignedUserLabel('eval2')}`;
    if (managerEvalReport2BrowseMode !== 'location') return `${root} > ITEMCODEs`;
    if (managerEvalReport2DrillLevel <= 0) return `${root} > Block Alpha`;
    const blockLabel = getDriveBlockAlphaLabel(managerEvalReport2SelectedBlockAlpha);
    if (managerEvalReport2DrillLevel === 1) return `${root} > ${blockLabel} > LocationCode`;
    return `${root} > ${blockLabel} > ${managerEvalReport2SelectedLocationCode || 'LocationCode'} > ITEMCODEs`;
}

function renderManagerEvalReports2LegacyPanel() {
    const paged = useManagerReportPages('eval2');
    if (!canViewManagerEvalReports2()) return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">Your active profile does not have access to Reports.</div>';
    const api = getManagerEvalReports2Api();
    if (!api) return '<div class="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm font-bold text-red-700">Reports could not start. Refresh the app to load the report engine.</div>';
    if (!paged && !managerEvalReport2DisplaySourcesReady() && !managerEvalReport2LoadState.loading && !managerEvalReport2Cache
        && (!managerEvalReport2LoadState.error || managerEvalReport2LoadState.owner !== getSupabaseReadIdentityScope())) setTimeout(() => loadManagerEvalReports2(false), 0);
    const index = getManagerEvalReport2Index();
    const accessibleTitle = '<h2 class="sr-only">'+escapeHtml(getManagerEvalReport2BrowseCrumbText())+'</h2>';
    if (!index && managerEvalReport2LoadState.loading) return `${accessibleTitle}<div class="flex min-h-[44px] items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[11px] font-bold text-blue-800"><span class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"></span>Loading evaluator report and assignments...</div>`;
    if (!index) return `${accessibleTitle}<div class="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800"><span>${escapeHtml(managerEvalReport2LoadState.error || 'Reports data is temporarily unavailable.')}</span><button type="button" class="min-h-[36px] rounded-lg border border-amber-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-amber-900" onclick="return loadManagerEvalReports2(true)">Retry</button></div>`;
    const meta = getManagerEvalReport2Meta();
    const sourceUpdated = managerEvalReport2LoadState.lastSourceUpdatedAt || getManagerEvalReport2LatestSourceUpdate();
    let statusHtml = managerEvalReport2AssignmentFilterRefreshing
        ? '<div class="flex min-h-[44px] items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[11px] font-bold text-blue-800"><span class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"></span>Verifying current AssignedTo ownership before showing results...</div>'
        : managerEvalReport2LoadState.error
        ? ''
        : managerEvalReport2LoadState.loading
            ? '<div class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">Refreshing complete inventory and assignments; current complete results remain visible.</div>'
            : '';
    const invalidHoldDateCount = Number(index.diagnostics && index.diagnostics.invalidHoldStartDateCount) || 0;
    const invalidLocationNoteDateCount = Number(index.diagnostics && index.diagnostics.invalidLocationNoteDateCount) || 0;
    if (invalidHoldDateCount || invalidLocationNoteDateCount) {
        statusHtml += `<div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">Data quality: ${escapeHtml(String(invalidHoldDateCount))} invalid Hold/Stop date${invalidHoldDateCount === 1 ? '' : 's'} and ${escapeHtml(String(invalidLocationNoteDateCount))} invalid Location Note date${invalidLocationNoteDateCount === 1 ? '' : 's'} were excluded from date-based report rules.</div>`;
    }
    if (managerEvalReport2DetailItemKey) return renderManagerEvalReport2ItemDetail();
    const moreHtml = renderManagerEvalReport2MoreMenu(index, meta, sourceUpdated);
    return `<div class="space-y-3">${accessibleTitle}${statusHtml}${renderManagerEvalReport2ReportsPanel(moreHtml)}</div>`;
}

function exportManagerEvalReport2ToExcel() {
    if (!canViewManagerEvalReports2()) return false;
    if (useManagerReportPages('eval2')) return exportPagedManagerEvalReport('eval2');
    if (!isManagerEvalReport2SnapshotReadyForEdits()) {
        showToast('Checking for updates', 'Wait for the current report data before exporting.', true);
        return false;
    }
    const index = getManagerEvalReport2Index();
    if (!index) {
        showToast('Inventory Not Ready', 'Load the complete inventory before exporting Reports.', true);
        return false;
    }
    const model = managerEvalReport2Mode === 'inquiry' ? getManagerEvalReport2InquiryModel() : null;
    const rows = model ? model.matchedRows : getFilteredManagerEvalReport2Rows();
    const meta = getManagerEvalReport2Meta();
    if (!rows.length) {
        showToast('No Rows', 'There are no Reports rows to export in this view.', true);
        return false;
    }
    const fileLabel = `eval-reports-2-${String(meta.label || activeManagerEvalReport2).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`;
    const metaRows = [
        ['Module', 'Reports'],
        ['Mode', managerEvalReport2Mode === 'inquiry' ? 'Item Inquiry' : 'Reports'],
        ['Report', meta.label],
        ['Sales Year Cutoff', String(index.currentSalesYear)],
        ['Next Target', `${index.nextSeason} ${index.nextSalesYear}`],
        ['Low Stock Limit', String(index.settings.lowStockMaxSLts)],
        ['Hold Age Days', String(index.settings.holdAgeDays)],
        ['Location Note Age Days', String(index.settings.locationNoteAgeDays)],
        ['Rows Exported', String(rows.length)]
    ];
    downloadExcelWorkbook(getDriveReportExportColumns(), rows, `Reports ${meta.label}`, managersSearchTerm || '', fileLabel, metaRows, DRIVE_MODE_EXCEL_OPTIONS);
    showToast('Export Ready', `Downloading ${rows.length} ${meta.label} row${rows.length === 1 ? '' : 's'} as Excel.`);
    return false;
}

function hasCurrentInventoryExportReceipt(view) {
    if (!canAccessView(view) || !isMasterFullProjectionReady() || hasConfirmedCurrentAccountRevocation()) return false;
    if (hasCurrentProductionLiveSyncProof()) return true;
    if (!nativeAuthSessionActive || !hasAuthenticatedOperationalReadIdentity()) return false;
    const farm = getBloomscapesFarm();
    if (!getBloomscapesAllowedFarms().includes(farm)) return false;
    const receipt = productionDisplayMasterReceipt;
    const permission = String(appAccessSnapshotState.snapshot?.dataPermissionVersion || '');
    if (receipt?.rows !== fullInventory || receipt.readScope !== getSupabaseReadIdentityScope()
        || receipt.permission !== permission || getDatasetState('master').rowCompleteness !== 'complete') return false;
    if (view !== 'av' || activeAVTab === 'open') return true;
    const snapshot = getBloomscapesWarmFarm(farm);
    return !!(snapshot?.active && snapshot.reserves === reservesInventory);
}

function exportCurrentAVToExcel() {
    if (ensureViewDataForRender('av')) return false;
    if (!isMasterFullProjectionReady()) {
        void ensureMasterFullProjection('exporting AV data').then((ready) => { if (ready) exportCurrentAVToExcel(); });
        return false;
    }
    if (!hasCurrentInventoryExportReceipt('av') && !requireCurrentProductionLiveSyncProof('exporting AV data')) return false;
    const { items, term } = getCurrentAVBaseItems();
    const exportContext = buildAVExportContext(items, term);
    updateAVExportButton(exportContext.rows.length);
    if (!exportContext.rows.length) {
        showToast('No Rows', 'There are no AV rows to export right now.', true);
        return false;
    }
    const columns = getAVExportColumns();
    downloadExcelWorkbook(columns, exportContext.rows, exportContext.title, exportContext.searchTerm, exportContext.fileLabel);
    showToast('Export Ready', `Downloading ${exportContext.rows.length} AV row${exportContext.rows.length === 1 ? '' : 's'} as Excel.`);
    return false;
}

function exportCurrentDriveModeToExcel() {
    if (ensureViewDataForRender('drive')) return false;
    if (!isMasterFullProjectionReady()) {
        void ensureMasterFullProjection('exporting Drive Mode data').then((ready) => { if (ready) exportCurrentDriveModeToExcel(); });
        return false;
    }
    if (!hasCurrentInventoryExportReceipt('drive') && !requireCurrentProductionLiveSyncProof('exporting Drive Mode data')) return false;
    const context = buildDriveCurrentExportContext();
    if (!context.rows.length) {
        showToast('No Rows', 'There are no Drive Mode rows to export in this view.', true);
        return false;
    }
    const columns = getDriveReportExportColumns();
    const title = context.scopeLabel || 'Drive Mode';
    downloadExcelWorkbook(columns, context.rows, title, getDriveSearchTerm(), getDriveCurrentExportFileLabel(context), buildDriveCurrentExportMetaRows(context), DRIVE_MODE_EXCEL_OPTIONS);
    showToast('Export Ready', `Downloading ${context.rows.length} Drive Mode row${context.rows.length === 1 ? '' : 's'} as Excel.`);
    return false;
}
