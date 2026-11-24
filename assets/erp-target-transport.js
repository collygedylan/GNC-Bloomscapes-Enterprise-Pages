async function executeSelectedErpTarget(target, context) {
    if (target.key==='CAV_PROJECTION') return verifyOperationalCavProjection(target);
    const session = await getNativeAuthSession();
    if (!session?.access_token) throw new Error('An authenticated ERP session is required.');
    const owner = getSupabaseReadIdentityScope();
    return runNativeErpStage(target, context, owner);
}

function assertErpStageSession(owner) {
    if (owner !== getSupabaseReadIdentityScope() || !canRunManualInventoryImport()) {
        throw new Error('ERP account or permission changed.');
    }
    if (document.hidden || navigator.onLine === false) {
        throw new Error('ERP stage is retained; return online to read its receipt.');
    }
}

async function runNativeErpStage(target, context, owner) {
    assertErpStageSession(owner);
    let result = await supabaseRpc('gnc_run_erp_sync_stage', {
        p_target_key:target.key,p_triggered_by:currentUser,p_command_id:context.commandId
    }, {timeoutMs:15000});
    const commandId = result.command_id;
    const deadline = Date.now() + Math.min(context.timeoutMs,85000);
    let failures = 0;
    for (let attempt = 0; attempt < 40 && result.status === 'queued' && Date.now() < deadline; attempt += 1) {
        assertErpStageSession(owner);
        await new Promise(resolve => setTimeout(resolve,Math.min(2500,400 * Math.pow(1.3,attempt + failures))));
        try {
            result = await supabaseRpc('gnc_read_erp_sync_stage', {p_command_id:commandId}, {timeoutMs:10000});
            failures = 0;
        } catch (error) {
            failures += 1;
            if (failures >= 3) throw error;
        }
    }
    assertErpStageSession(owner);
    if (result.status === 'queued') throw Object.assign(new Error('ERP stage is still running; resume this command.'), {retryable:true});
    if (result.status === 'failed') throw new Error(result.error || 'ERP stage failed; source files are retained.');
    if (!result.verified) throw new Error('ERP live verification receipt is missing.');
    return result;
}

async function prefetchDashboardSyncMetadataAfterLogin() {
    if (!currentUser || navigator.onLine === false || !canViewDashboardSyncStatus()) return false;
    const owner=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm();
    const query=new URLSearchParams({select:'target_key,last_synced_at,last_file_name',
        farm_code:'eq.'+farm,order:'target_key.asc',limit:'25'});
    const result=await fetchDirectPostgrestReadPage('gnc_00_core_erp_sync_status',query.toString(),{timeoutMs:5000},false);
    if (owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm() || !canViewDashboardSyncStatus()) return false;
    if (!Array.isArray(result?.rows)) throw new Error('ERP Home metadata is unavailable.');
    const entries=result.rows.flatMap(row=>{
        const iso=getValidIsoTimestamp(row.last_synced_at);
        if (!iso) return [];
        const label=erpHomeSourceLabel(String(row.target_key));
        return [{label,iso,ms:Date.parse(iso),files:row.last_file_name ? [row.last_file_name] : [],authoritative:true}];
    });
    if (!entries.length) return false;
    const retained=dashboardSyncMetadataOwner===owner ? dashboardSyncMetadataSummaries : [];
    dashboardSyncMetadataSummaries=mergeDashboardSyncSummaries([...retained,...entries]);
    dashboardSyncMetadataOwner=owner;
    dashboardSyncMetadataFetchedAt=Date.now();
    updateDashboardSyncSummary();
    return true;
}

function erpHomeSourceLabel(key) {
    if (key==='PH_CAV') return 'CAV';
    if (key.endsWith('DRIVE_AROUND')) return 'Drive';
    if (key.endsWith('SOC_OPEN')) return 'SOC';
    if (key.endsWith('SOC_RESERVES')) return 'Reserves';
    return key;
}

async function verifyOperationalCavProjection(target) {
    const owner=getSupabaseReadIdentityScope();
    assertErpStageSession(owner);
    const page=await fetchDirectPostgrestReadPage('ph_cav_import','select=unique_id&limit=1',{count:true,timeoutMs:6000},false);
    assertErpStageSession(owner);
    if (page?.authSource!=='native' || !Number.isInteger(page.total) || page.total<0) throw Error('CAV publication could not be verified.');
    return {targetKey:target.key,status:'verified',row_count:page.total};
}
