let driveEvaluatorReport;
const driveEvalReason = {id:'hold-stop-reason',label:'Hold/Stop Reason'};
const driveEvalAudit = {id:'field-audit',label:'Season Y ≤ 2026 Audit'};
const driveEvalLeaf = {id:'hold-leaf-quality',label:'330 H/S Leaf Quality'};

function driveEvaluatorScope() {
    const {scope,preview} = getActiveEvalReportsAccess();
    if (!['own','all'].includes(scope)) return null;
    const farm=getBloomscapesFarm();
    return {scope,preview,farm,key:JSON.stringify([getSupabaseReadIdentityScope(),farm,scope,preview,
        appAccessSnapshotState.snapshot?.dataPermissionVersion])};
}

function currentDriveEvaluatorReport(state) {
    return driveEvaluatorReport===state && driveEvaluatorScope()?.key===state.key && isViewVisible('drive');
}

function driveEvaluatorReportOptions() {
    const api=getManagerEvalReports2Api();
    const names = {'low-stock':'Low Stock','not-in-f1':'Not in F1'};
    const second=api?.REPORT_IDS.map(id=>({id,label:names[id] || api.REPORT_META[id].label})) || [];
    return [...EVAL_ROLE_REPORTS,driveEvalReason,...second.concat(driveEvalAudit,driveEvalLeaf)
        .map(report=>({id:'eval2:'+report.id,label:'Eval Reports #2 · '+report.label}))];
}

async function loadDriveEvaluatorReport(state) {
    if (state.pending) return;
    state.pending=true;
    state.error='';
    try {
        const [receipt,loaded]=await Promise.all([readEvalReportsScope(state.farm,state.preview),
            loadCompleteEvalReportInventory(()=>currentDriveEvaluatorReport(state))]);
        if (!currentDriveEvaluatorReport(state)) return;
        if (!loaded || receipt.scope!==state.scope) throw new Error('Evaluator scope could not be verified.');
        state.receipt=receipt;
        state.dataset=getDatasetLoadSignature('warehouseAssignedItems');
        state.displays=null;
        state.evaluator=receipt.evaluators.some(entry=>entry.username===state.evaluator)
            ? state.evaluator : state.scope === 'all' ? '' : receipt.evaluators[0]?.username || '';
    } catch (error) {
        if (currentDriveEvaluatorReport(state)) state.error=error.message;
    } finally {
        state.pending=false;
        if (currentDriveEvaluatorReport(state)) scheduleDriveRender(0,16,true);
    }
}

function driveEvaluatorPick(state,key,value) {
    if (!currentDriveEvaluatorReport(state)) return;
    state[key]=value;
    state.path=[];
    if (key!=='plant') state.plant='';
    scheduleDriveRender(0,16,true);
}

function driveEvaluatorReportRows(state) {
    if (state.rows!==fullInventory) {
        state.rows=fullInventory;
        state.displays=null;
        state.eval2=null;
    }
    state.displays ||= buildEvalRoleReportsCatalog({rows:state.rows,evaluators:state.receipt.evaluators,
        farm:state.farm,activeAppSalesYear:getConfiguredCurrentSalesYearCode()});
    if (state.report.startsWith('eval2:')) return driveEval2ScopedRows(state,state.report.slice(6));
    const id = state.report === driveEvalReason.id ? 'hold-stop' : state.report;
    return driveEvaluatorEntries(state).flatMap(entry=>state.displays.get(entry.username)?.reports.get(id) || []);
}

function driveEval2CandidateRows(state,id) {
    if (id===driveEvalAudit.id) {
        const auditRows=state.rows.map(row=>({...fieldAuditNormalizeRow(row,false),source:row}));
        return fieldAuditMatchingRows(auditRows,{
            season:'Y',year:'2026max',status:'all',search:'',block:'',location:'',sort:'locationcode',direction:1
        }).map(row=>row.source);
    }
    if (id===driveEvalLeaf.id) {
        return state.rows.filter(row=>/^330(?:\D|$)/.test(evalReportPlantGroup(row))
            && /^(H|S)$/i.test(evalReportHoldCode(row))
            && /\bleaf\s+quality\b/i.test(String(row.holdstopreason ?? row.HOLDSTOPREASON ?? '')));
    }
    const api=getManagerEvalReports2Api();
    const next=getConfiguredNextSaleSeasonTarget();
    state.eval2 ||= api?.classifyScriptCompatibleRows(state.rows,{
        currentSeason:getConfiguredCurrentSeasonCode(),currentSalesYear:getConfiguredCurrentSalesYearCode(),
        nextSeason:next.season,nextSalesYear:next.salesYear,settings:managerEvalReportSettings,now:new Date()
    });
    return state.eval2?.reports[id] || [];
}

function driveEval2ScopedRows(state,id) {
    const owners = new Map(driveEvaluatorEntries(state).flatMap(entry=>entry.row_ids.map(uid=>[uid,entry.username])));
    return driveEval2CandidateRows(state,id).filter(row=>resolveExactOwnerForRow(row,owners,state.farm));
}

function driveEvaluatorEntries(state) {
    return state.scope === 'all' && !state.evaluator ? state.receipt.evaluators
        : state.receipt.evaluators.filter(entry=>entry.username===state.evaluator);
}

function makeDriveEvaluatorControls(root,state) {
    root.innerHTML='<button type="button" data-drive-eval-exit>Exit evaluator reports</button>' +
        '<div data-drive-eval-title></div><div data-drive-eval-plant></div>' +
        evalReportBrowseMarkup()+'<div data-drive-eval-results></div>';
    root.onclick=event=>{
        if (!currentDriveEvaluatorReport(state)) return;
        if (event.target.closest('[data-drive-eval-exit]')) return driveEvaluatorPick(state,'open',false);
        if (event.target.closest('[data-drive-eval-retry]')) return void loadDriveEvaluatorReport(state);
        bindEvalReportBrowseClick(event,state,()=>scheduleDriveRender(0,16,true));
    };
}

function paintDriveEvaluatorFilters(root,state,rows) {
    const report = driveEvaluatorReportOptions().find(entry=>entry.id===state.report);
    const title = state.displays.get(state.evaluator);
    root.querySelector('[data-drive-eval-title]').textContent = report?.label + ' · '
        + (title ? title.displayName+' (@'+title.username+')' : 'All Evaluators');
    const plants=root.querySelector('[data-drive-eval-plant]');
    plants.hidden=!state.report.startsWith('hold-stop');
    if (plants.hidden) return rows;
    mountModuleSubviewDropdown(plants,{label:'Plant Group Code',
        choices:evalReportFacetChoices(rows,evalReportPlantGroup,'All Plant Groups'),
        value:state.plant,select:value=>driveEvaluatorPick(state,'plant',value)});
    return state.plant ? rows.filter(row=>evalReportPlantGroup(row)===state.plant) : rows;
}

function paintDriveEvaluatorReport(container,state) {
    let root=container.querySelector('[data-drive-eval-workspace]');
    if (root?.driveEvaluatorOwner!==state) {
        resetDriveReportContent(container);
        root=container.appendChild(document.createElement('section'));
        root.dataset.driveEvalWorkspace='';
        root.driveEvaluatorOwner=state;
        makeDriveEvaluatorControls(root,state);
    }
    const result=root.querySelector('[data-drive-eval-results]');
    if (!state.receipt) {
        result.innerHTML=state.error ? '<p role="status">'+esc(state.error)+'</p><button data-drive-eval-retry>Retry</button>'
            : '<p role="status">Loading evaluator reports…</p>';
        return;
    }
    const rows=paintDriveEvaluatorFilters(root,state,driveEvaluatorReportRows(state));
    state.visibleRows=paintReportInventoryDrill(result,state,rows,[state.key,state.evaluator,state.report,state.plant,
        getDatasetLoadSignature('master'),state.dataset],'',state.report.startsWith('hold-stop'),
        row=>generateCard(row,'drive',getDriveCardStatusClass(row),{originView:'drive'}));
    syncEvalReportBrowseControls(root,state);
}

function getDriveEvaluatorReportState() {
    const scope = driveEvaluatorScope();
    if (!scope) {
        driveEvaluatorReport = null;
        return null;
    }
    if (driveEvaluatorReport?.key !== scope.key) driveEvaluatorReport = {
        ...scope,...createDriveBrowseState(),open:false,evaluator:scope.preview || '',report:EVAL_ROLE_REPORTS[0].id,plant:''
    };
    return driveEvaluatorReport;
}

function selectDriveEvaluatorReport(state,report) {
    if (!currentDriveEvaluatorReport(state)) return;
    state.open = true;
    driveEvaluatorPick(state,'report',report);
    if (!state.receipt) void loadDriveEvaluatorReport(state);
}

function driveEvaluatorReportPicker(state) {
    if (state?.scope !== 'all') return null;
    const users = state.receipt?.evaluators || [];
    return {label:'Evaluator:',value:state.evaluator,choices:[['','All Evaluators'],...users.map(entry=>
        [entry.username,(entry.display_name || entry.username)+' (@'+entry.username+')'])],
    select:value=>driveEvaluatorPick(state,'evaluator',value)};
}

function loadDriveEvaluatorPicker(state) {
    if (state?.scope === 'all' && !state.receipt) void loadDriveEvaluatorReport(state);
}

function mountDriveEvaluatorReports(container,state) {
    if (!container || !state?.open) return false;
    if (state.receipt && state.dataset !== getDatasetLoadSignature('warehouseAssignedItems')) {
        state.receipt = null;
        state.visibleRows = null;
        void loadDriveEvaluatorReport(state);
    }
    paintDriveEvaluatorReport(container,state);
    return true;
}

function closeDriveEvaluatorReport() {
    if (driveEvaluatorReport?.open) driveEvaluatorReport.open = false;
}

function getDriveEvaluatorReportRows() {
    const state=driveEvaluatorReport;
    return state?.open && currentDriveEvaluatorReport(state) ? state.visibleRows || [] : null;
}
