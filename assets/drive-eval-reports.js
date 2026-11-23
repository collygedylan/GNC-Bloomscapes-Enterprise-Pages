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
    const second=api?.REPORT_IDS.map(id=>({id,label:api.REPORT_META[id].label})) || [];
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
            ? state.evaluator : receipt.evaluators[0]?.username || '';
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
    const evaluator=state.displays.get(state.evaluator);
    return evaluator?.reports.get(state.report===driveEvalReason.id?'hold-stop':state.report) || [];
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
    const entry=state.receipt.evaluators.find(item=>item.username===state.evaluator);
    if (!entry) return [];
    const owners=new Map(entry.row_ids.map(uid=>[uid,entry.username]));
    return driveEval2CandidateRows(state,id).filter(row=>resolveExactOwnerForRow(row,owners,state.farm)===entry.username);
}

function makeDriveEvaluatorControls(root,state) {
    root.innerHTML='<button type="button" data-drive-eval-exit>Exit evaluator reports</button>' +
        '<div data-drive-eval-user></div><div data-drive-eval-report></div><div data-drive-eval-plant></div>' +
        evalReportBrowseMarkup()+'<div data-drive-eval-results></div>';
    root.onclick=event=>{
        if (!currentDriveEvaluatorReport(state)) return;
        if (event.target.closest('[data-drive-eval-exit]')) return driveEvaluatorPick(state,'open',false);
        if (event.target.closest('[data-drive-eval-retry]')) return void loadDriveEvaluatorReport(state);
        bindEvalReportBrowseClick(event,state,()=>scheduleDriveRender(0,16,true));
    };
}

function paintDriveEvaluatorFilters(root,state,rows) {
    const users=state.receipt.evaluators.map(entry=>[entry.username,entry.display_name+' (@'+entry.username+')']);
    const evaluator=state.displays.get(state.evaluator);
    const choices=driveEvaluatorReportOptions().map(({id,label})=>[id,evaluator?evalRoleReportTitle(evaluator,label):label]);
    mountModuleSubviewDropdown(root.querySelector('[data-drive-eval-user]'),{label:'Username',choices:users,
        value:state.evaluator,select:value=>driveEvaluatorPick(state,'evaluator',value)});
    mountModuleSubviewDropdown(root.querySelector('[data-drive-eval-report]'),{label:'Report',choices,
        value:state.report,select:value=>driveEvaluatorPick(state,'report',value)});
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
        container.replaceChildren();
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

function mountDriveEvaluatorReports(crumb,container) {
    if (!crumb || !container) return false;
    let button=document.getElementById('drive-evaluator-reports-link');
    const scope=driveEvaluatorScope();
    if (!scope) {
        button?.remove();
        driveEvaluatorReport=null;
        return false;
    }
    if (driveEvaluatorReport?.key!==scope.key) driveEvaluatorReport={...scope,...createDriveBrowseState(),
        open:false,evaluator:'',report:EVAL_ROLE_REPORTS[0].id,plant:''};
    const state=driveEvaluatorReport;
    if (!button) {
        button=document.createElement('button');
        button.type='button';
        button.id='drive-evaluator-reports-link';
        button.textContent='Evaluator Reports ▾';
        crumb.before(button);
    }
    button.hidden=state.open;
    button.onclick=()=>{
        driveEvaluatorPick(state,'open',true);
        if (!state.receipt) void loadDriveEvaluatorReport(state);
    };
    if (!state.open) return false;
    if (state.receipt && state.dataset!==getDatasetLoadSignature('warehouseAssignedItems')) {
        state.receipt=null;
        state.visibleRows=null;
        void loadDriveEvaluatorReport(state);
    }
    paintDriveEvaluatorReport(container,state);
    return true;
}

function getDriveEvaluatorReportRows() {
    const state=driveEvaluatorReport;
    return state?.open && currentDriveEvaluatorReport(state) ? state.visibleRows || [] : null;
}
