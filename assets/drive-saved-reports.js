const legacyDriveReports = ['hold-stop','negative-slts','open-stock'];

function canUseDriveCustomReports(scope = getActiveEvalReportsAccess().scope) {
    return scope === 'all' || scope === 'legacy';
}

function driveSavedReportChoices(state,evaluator,scope) {
    if (scope === 'hidden') return [];
    const owner = scope === 'own' ? ' · @'+(evaluator?.preview || currentUser) : '';
    const assigned = evaluator ? driveEvaluatorReportOptions().map(({id,label})=>['assigned:'+id,label+owner]) : [];
    if (scope === 'own') return assigned;
    const saved = state.saved.reports.map(entry=>['saved:'+entry.id,
        (entry.visibility === 'public' ? 'Public' : 'Private')+' · '+entry.report_name]);
    const existing = legacyDriveReports.map(id=>['legacy:'+id,getDriveHoldStopReportLabel(id)]);
    const presets = fieldAuditDrivePresets().map(([id,label])=>['preset:'+id,
        'Inventory · '+(id === 'season-y' ? 'Season Y ≤ 2026 Audit' : label)]);
    return [...assigned,['table','Custom Report Table'],...existing,...presets,...saved];
}

function activeDriveSavedReport(state,evaluator) {
    if (evaluator?.open) return 'assigned:'+evaluator.report;
    if (state.scoped && state.savedId) return 'saved:'+state.savedId;
    if (activeDriveTab === 'reports-v2') return 'table';
    if (activeDriveTab !== 'hold') return '';
    if (fieldAuditState().modes.drive === 'audit') return 'preset:'+fieldAuditDriveState().preset;
    const mode = activeDriveHoldStopReport;
    return 'legacy:'+(['hold','stop'].includes(mode) ? mode+'-only' : mode);
}

function chooseDriveSavedReport(state,evaluator,key) {
    const [kind,...parts] = key.split(':');
    const id = parts.join(':');
    if (kind === 'assigned') return selectDriveEvaluatorReport(evaluator,id);
    if (evaluator) evaluator.open = false;
    if (kind === 'saved' && driveReport2ApplySaved(state,id)) {
        return openDriveReport2View(state,driveReport2BrowseTab(activeDriveTab) ? activeDriveTab : 'name');
    }
    if (kind === 'table') return setDriveTab('reports-v2');
    state.scoped = false;
    if (kind === 'legacy') {
        fieldAuditState().modes.drive = 'legacy';
        return setDriveHoldStopReport(id);
    }
    if (kind === 'preset') {
        fieldAuditState().modes.drive = 'audit';
        fieldAuditDriveFilter('preset',id);
        return setDriveTab('hold');
    }
}

function mountDriveSavedReports(state,evaluator) {
    const host = document.querySelector('[data-drive-saved-reports]');
    if (!host) return;
    const {scope} = getActiveEvalReportsAccess();
    const choices = driveSavedReportChoices(state,evaluator,scope);
    host.hidden = !choices.length || activeDriveMode !== 'ok';
    if (host.hidden) return;
    mountModuleSubviewDropdown(host,{label:'📊 Saved Reports',choices,
        search:'Search reports',value:activeDriveSavedReport(state,evaluator),
        tools:driveEvaluatorReportPicker(evaluator),
        select:key=>chooseDriveSavedReport(state,evaluator,key),
        onOpen:()=>openDriveSavedReportPicker(state,evaluator,scope)});
}

function openDriveSavedReportPicker(state,evaluator,scope) {
    loadDriveEvaluatorPicker(evaluator);
    if (scope !== 'own' && state.authenticated && !state.savedSignature) {
        void loadDriveReport2Saved(state).then(()=>{
            if (driveReport2StateCurrent(state) && isViewVisible('drive')) mountDriveSavedReports(state,getDriveEvaluatorReportState());
        });
    }
}

function resetDriveReportContent(container) {
    setContainerHtml(container,'');
    delete container.dataset.driveRenderKey;
    delete container.dataset.driveDetailedRecords;
    delete container.dataset.driveDisplay;
}
