async function loadManagerEvalReportSettings(force=false) {
    if (nativeAuthSessionActive) return loadBloomscapesEvalSettings();
    if (typeof shouldUseProductionLiveSyncSideLoad==='function' && shouldUseProductionLiveSyncSideLoad()) return loadCoordinatedEvalSettings(force);
    return loadLegacyEvalSettings(force);
}

function loadBloomscapesEvalSettings() {
    managerEvalReportSettings=normalizeManagerEvalReportSettings(null);
    Object.assign(managerEvalReportSettingsState,{loaded:true,loading:false,fallback:true,error:'',promise:null});
    return managerEvalReportSettings;
}

function getBloomscapesNativeBrowseKeys(view) {
    return nativeAuthSessionActive && view==='sales-office'?['master','soc','reserves']:null;
}

function loadCoordinatedEvalSettings(force) {
    const owner = getSupabaseReadIdentityScope();
    return ensureProductionLiveSyncSideData('managerEvalSettings', force, { state: managerEvalReportSettingsState })
        .then(() => managerEvalReportSettings)
        .catch((error) => {
            const status = getProductionLiveSyncCoordinator()?.getStatus?.() || {};
            const errorMessage = String(error?.message || error || '').trim();
            const denied = isSupabaseReadTerminalDenial(error)
                || status.authorizationDenied === true
                || [401, 403].includes(Number(error?.status || status.status || 0))
                || window.GncUserAccessControl?.getSelfState?.().denied === true
                || nativeAuthProfile?.active === false || nativeAuthProfile?.disabled_at != null;
            // ensureProductionLiveSyncSideData reports the current
            // coordinator message when ensure() joins an ordinary
            // in-flight revision check. Keep the current settings
            // as the read-only SWR value; the coordinator will
            // publish the refreshed settings when its check ends.
            if (owner === getSupabaseReadIdentityScope() && !denied
                && status.state === 'Syncing' && errorMessage && errorMessage === String(status.message || '').trim()) {
                managerEvalReportSettingsState.error = '';
                return managerEvalReportSettings;
            }
            throw error;
        });

}

function loadLegacyEvalSettings(force) {
    if (!canViewManagerEvalReports() && !canViewManagerEvalReports2()) return null;
    const state = managerEvalReportSettingsState;
    if (state.loading && state.promise) return state.promise;
    if (state.loaded && !force) return managerEvalReportSettings;
    state.loading = true;
    state.error = '';
    state.promise = supabaseRpc('get_eval_report_settings', {}, { timeoutMs: 15000 })
        .then((result) => {
            managerEvalReportSettings = normalizeManagerEvalReportSettings(result);
            state.loaded = true;
            state.fallback = false;
            state.error = '';
            invalidateManagerEvalReportCache();
            return managerEvalReportSettings;
        })
        .catch((error) => {
            managerEvalReportSettings = normalizeManagerEvalReportSettings(null);
            state.loaded = true;
            state.fallback = true;
            state.error = getFriendlyBackendErrorMessage(error, 'Could not load Eval Report settings.');
            invalidateManagerEvalReportCache();
            reportSemanticHealthEvent('eval_report_settings_load_failed', 'eval_reports', 'EVAL_REPORT_SETTINGS_LOAD_FAILED', {});
            return managerEvalReportSettings;
        })
        .finally(() => {
            state.loading = false;
            state.promise = null;
            if (getCurrentVisibleViewId() === 'managers' && [MANAGER_EVAL_REPORTS_VIEW, MANAGER_EVAL_REPORTS_2_VIEW].includes(activeHomeTab)) scheduleManagersRender(true);
        });
    if (getCurrentVisibleViewId() === 'managers' && [MANAGER_EVAL_REPORTS_VIEW, MANAGER_EVAL_REPORTS_2_VIEW].includes(activeHomeTab)) scheduleManagersRender(true);
    return state.promise;
}
