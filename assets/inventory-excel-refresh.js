function refreshInventoryExcelView(scope) {
    closeInventoryExcelPopover(scope);
    const actions={av:refreshAvExcelProjection,drive:refreshDriveExcelProjection,docks:renderDocks,
        smart:renderSmartMovesIntelligence,shear:renderShearList,eval2:refreshEval2ExcelProjection,
        eval1:refreshEval1ExcelProjection,studio:refreshStudioExcelProjection,po:refreshBloomscapesTransferFilters};
    if (['sales','qc','production','inventory','salesoffice'].includes(scope)) refreshBloomscapesInventoryBrowse(scope);
    else if (actions[scope]) actions[scope]();
    else {completedPendingRequestRender=null;renderRequest();}
    mountInventoryExcelFilters(scope);
}

function refreshAvExcelProjection() {
    avResolvedBaseStateKey='';avSharedFilteredRowsCacheKey='';scheduleAVRender(0);
}
function refreshDriveExcelProjection() {
    driveBaseFilterCacheKey='';renderDrive();
}
function refreshEval2ExcelProjection() {
    managerEvalReport2ProgressiveRowsState?.observer?.disconnect();managerEvalReport2ProgressiveRowsState=null;
    resetManagerEvalReport2Drill();scheduleManagersRender(true);
}
function refreshEval1ExcelProjection() {
    getManagerReportPageController().refresh('eval1');scheduleManagersRender(true);
}
function refreshStudioExcelProjection() {
    const host=getInventoryExcelHost('studio')?.parentElement?.querySelector('[data-work-browser]');
    if (host) refreshBloomscapesWorkBrowser(host);
}
