const dockPipelineViews = Object.freeze([
    ['docks_order_pulling','Order Pulling'],
    ['docks_checker_copy','Checker Copy'],
    ['docks_inspector_copy','Inspector Copy'],
    ['docks_mistake_guy','Mistake Guy'],
    ['docks_tagging_view','Tagging View'],
    ['docks_loading_crew','Loading Crew']
]);

const dockPipelineActions = Object.freeze({
    docks_checker_copy:[['check','✓ Check Off Load']],
    docks_inspector_copy:[['flag','⚠ Mark Mistake'],['inspect','✓ Mark Completed']],
    docks_mistake_guy:[['fix','✓ Fixed — Mark Done']],
    docks_loading_crew:[['load','✓ Mark Loaded']]
});

function dockPipelineQuery({view,trip,offset,preview}, search, {level,dock,stop}) {
    const query = {view,search,offset};
    if (preview) query.preview = preview;
    if (level >= 1) query.dock = dock;
    if (level >= 2) {
        query.trip = trip;
        query.stopnumber = stop;
    }
    return query;
}
