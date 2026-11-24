const driveReportAllRows = ['', 'All Rows (None)'];
const driveReportAllAssigned = ['', 'All Assigned (All Rows)'];

function driveSavedReportChoices(state,evaluator,scope) {
    if (scope === 'hidden') return [];
    const assigned = evaluator ? driveEvaluatorReportOptions().map(({id,label})=>['assigned:'+id,label]) : [];
    const saved = canUseDriveCustomReports(scope) ? state.saved.reports.map(entry=>['saved:'+entry.id,entry.report_name]) : [];
    const save = canUseDriveCustomReports(scope) ? [['save','+ Save Current Column Filters as Report']] : [];
    return [driveReportAllRows,...assigned,...saved,...save];
}

function canUseDriveCustomReports(scope = getActiveEvalReportsAccess().scope) {
    if (isBloomscapesDriveTour()) return false;
    return scope === 'all' || scope === 'legacy';
}

function activeDriveSavedReport(state,evaluator) {
    if (evaluator?.report) return 'assigned:'+evaluator.report;
    return state.scoped && state.savedId ? 'saved:'+state.savedId : '';
}

function chooseDriveSavedReport(state,evaluator,key) {
    if (!driveReport2StateCurrent(state)) return;
    if (key === 'save') return saveCurrentDriveColumnFilters(state);
    if (key.startsWith('saved:')) {
        if (!driveReport2ApplySaved(state,key.slice(6))) return;
        if (evaluator) evaluator.report = '';
    } else {
        driveReport2ApplySaved(state,'');
        if (evaluator) return selectDriveEvaluatorReport(evaluator,key.slice('assigned:'.length));
    }
    refreshDriveReportSelection();
}

function mountDriveAssignedUsers(evaluator) {
    const host = document.querySelector('[data-drive-assigned-users]');
    if (!host) return;
    host.hidden = !evaluator || activeDriveMode !== 'ok';
    if (host.hidden) return;
    const users = [...(evaluator.receipt?.evaluators || []),...(evaluator.additionalOwners || [])].map(({username,display_name})=>
        [username,(display_name || username)+' (@'+username+')']);
    const choices = evaluator.scope === 'own'
        ? users.length ? users : [[evaluator.evaluator,'@'+evaluator.evaluator]]
        : [driveReportAllAssigned,...users];
    syncDriveReportSelect(host,'Assigned User',choices,evaluator.evaluator,value=>selectDriveEvaluator(evaluator,value));
    host.onfocus = ()=>loadDriveEvaluatorPicker(evaluator);
    if (!evaluator.error) loadDriveEvaluatorPicker(evaluator);
}

function mountDriveSavedReports(state,evaluator) {
    const host = document.querySelector('[data-drive-saved-reports]');
    if (!host) return;
    const {scope} = getActiveEvalReportsAccess();
    host.hidden = scope === 'hidden' || activeDriveMode !== 'ok';
    if (!host.hidden) {
        const selected = activeDriveSavedReport(state,evaluator);
        syncDriveReportSelect(host,'Report',driveSavedReportChoices(state,evaluator,scope),selected,key=>{
            if (key === 'save') host.value = selected;
            chooseDriveSavedReport(state,evaluator,key);
        });
        host.onfocus = ()=>openDriveSavedReportPicker(state,evaluator,scope);
    }
    const columns = document.getElementById('drive-column-command');
    if (columns) columns.hidden = host.hidden;
    mountDriveAssignedUsers(evaluator);
}

function syncDriveReportSelect(control,label,choices,value,onChange) {
    const signature = JSON.stringify(choices);
    if (control.dataset.choices !== signature) {
        control.replaceChildren(...choices.map(([key,text])=>new Option(label+': '+text,key)));
        control.dataset.choices = signature;
    }
    control.value = value;
    control.onchange = () => onChange(control.value);
}

function openDriveSavedReportPicker(state,evaluator,scope) {
    loadDriveEvaluatorPicker(evaluator);
    if (canUseDriveCustomReports(scope) && state.authenticated && !state.savedSignature) {
        void loadDriveReport2Saved(state).then(()=>{
            if (driveReport2StateCurrent(state) && isViewVisible('drive')) mountDriveSavedReports(state,getDriveEvaluatorReportState());
        });
    }
}

function currentDriveSavedFilterRules() {
    const columns = Object.fromEntries(Object.keys(driveColumnFilters).map(key=>[key,getDriveColumnFilterForField(key)])
        .filter(([,rule])=>isDriveColumnFilterActive(rule)));
    const excel = Object.fromEntries(Object.entries(getInventoryExcelState('drive').filters)
        .filter(([,values])=>values !== null).map(([key,values])=>[key,[...values]]));
    return Object.keys(columns).length || Object.keys(excel).length ? {_column_filters:columns,_excel_filters:excel} : null;
}

async function saveCurrentDriveColumnFilters(state) {
    if (!state.savedSignature && state.authenticated) await loadDriveReport2Saved(state);
    if (!driveReport2StateCurrent(state) || !isViewVisible('drive') || !canUseDriveCustomReports()) return;
    if (!canManageDriveSavedReport(null,state.saved) || state.busy) return;
    const filter_rules = currentDriveSavedFilterRules();
    if (!filter_rules) return showDriveReportSaveStatus('Select column filters before saving a report.');
    const report_name = window.prompt('Name this column-filter report')?.trim().slice(0,100);
    if (!report_name) return;
    state.busy = true;
    try {
        const receipt = await upsertDriveSavedReport({report_name,farm_code:state.farm,visibility:'private',
            selected_columns:state.layout.columns,column_widths:{},filter_rules,sort_rules:[]});
        if (!driveReport2StateCurrent(state)) return;
        state.saved = {...state.saved,reports:[...state.saved.reports,receipt]};
        state.savedRevision = (state.savedRevision || 0)+1;
        state.savedSignature = JSON.stringify(state.saved);
        if (!isViewVisible('drive')) return;
        mountDriveSavedReports(state,getDriveEvaluatorReportState());
        showDriveReportSaveStatus('Report saved.');
    } catch (error) {
        if (driveReport2StateCurrent(state) && isViewVisible('drive')) showDriveReportSaveStatus(error.message);
    } finally {
        state.busy = false;
    }
}

function showDriveReportSaveStatus(message) {
    const status = document.querySelector('[data-drive-report-status]');
    if (status) status.textContent = message;
}

function resetDriveReportContent(container) {
    setContainerHtml(container,'');
    delete container.dataset.driveRenderKey;
    delete container.dataset.driveDetailedRecords;
    delete container.dataset.driveDisplay;
}
