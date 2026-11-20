const bloomscapesDockRoutes = Object.freeze(['pull-tags','mistake-fix','traffic-office','borrowed-work','time-cards']);
const bloomscapesBorrowedRoutes = {scope:'',routes:[],flight:null};

function isBloomscapesDockRoute(view) {
    return bloomscapesDockRoutes.includes(view);
}

function currentBorrowedRouteScope() {
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id) return '';
    return JSON.stringify([getSupabaseReadIdentityScope(),getBloomscapesFarm()]);
}

function canOpenBloomscapesDocksWorkspace(view,userOverride='') {
    if (!isBloomscapesDockRoute(view) || !nativeAuthSessionActive || !nativeAuthProfile?.id) return false;
    if (userOverride && normalizeNavigationVisibilityUsername(userOverride)!==normalizeNavigationVisibilityUsername(currentUser)) return false;
    const granted=bloomscapesBorrowedRoutes.scope===currentBorrowedRouteScope() && bloomscapesBorrowedRoutes.routes.includes(view);
    if (['borrowed-work','time-cards'].includes(view)) return granted;
    const flag=resolveUserAccessMatrix(currentUser)?.view_permissions?.['view_'+view.replaceAll('-','_')];
    if (flag==='Y' || isFullAppAdministrator()) return true;
    if (flag!=='N' && canAccessView('docks')) return true;
    return granted;
}

function refreshBloomscapesBorrowedRoutes() {
    const scope=currentBorrowedRouteScope();
    if (!scope) return;
    const state=bloomscapesBorrowedRoutes;
    if (scope!==state.scope) Object.assign(state,{scope,routes:[],flight:null});
    if (state.flight) return state.flight;
    const farm=getBloomscapesFarm();
    const read=readBloomscapesBorrowedWorkRoutes(farm).then(routes=>{
        if (scope!==currentBorrowedRouteScope() || state.flight!==read) return;
        state.routes=routes;
        syncRoleAccessUi(getRoleAccessState());
    }).catch(error=>reportHandledRuntimeIssue('borrowed-work-routes',error.message))
        .finally(()=>{if (state.flight===read) state.flight=null;});
    state.flight=read;
    return read;
}
