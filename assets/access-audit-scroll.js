function accessControlMatrixQuery(state,subjectOffset=0) {
    return {subjectType:state.viewMode,search:String(managersSearchTerm || '').trim(),
        role:state.selectedRole==='all'?'':state.selectedRole,
        module:state.selectedModule==='all'?'':state.selectedModule,
        subjectOffset,subjectLimit:Number(state.subjectPageSize || 20),
        permissionOffset:Number(state.columnOffset || 0),permissionLimit:Number(state.columnPageSize || 8)};
}

async function readAccessControlMatrixWindow(query) {
    const name=isKaylaLimitedAccessManagerUser() ? 'get_limited_access_control_matrix_v1' : 'get_access_control_matrix_v2';
    const value=normalizeAccessControlMatrix(await supabaseRpc(name,{p_query:query},{timeoutMs:20000}));
    if (!value) throw new Error('ACCESS_CONTROL_RESPONSE_INVALID');
    return value;
}

function accessAuditColumnsControl(state,total,size) {
    if (total<=size) return '';
    const options=Array.from({length:Math.ceil(total/size)},(_,index)=>{
        const offset=index*size;
        const selected=offset===Number(state.columnOffset || 0) ? 'selected' : '';
        return '<option value="'+offset+'" '+selected+'>'+(offset+1)+'–'+Math.min(total,offset+size)+'</option>';
    });
    return '<label>Permission columns <select onchange="return setAccessControlColumnWindow(Number(this.value))">'
        +options.join('')+'</select></label>';
}

function mountAccessAuditScroll(container) {
    const end=container.querySelector('[data-access-audit-end]');
    if (end) observeContinuousListEnd(end,appendAccessAuditMatrix);
}

function mountManagerContinuousSurfaces(container,tab) {
    if (tab===MANAGER_ACCESS_CONTROL_VIEW) mountAccessAuditScroll(container);
    if (tab===MANAGER_HISTORICAL_REPORT_VIEW) mountContinuousImportedFilesPanel(container);
    if (tab===INVENTORY_TRANSACTION_HISTORY_VIEW) mountInventoryTransactionList(container);
}

async function appendAccessAuditMatrix() {
    const state=accessControlAdminState,base=state.data;
    if (!base || state.loading || state.appendPending || state.editor || !canViewAccessControl()) return;
    const subjects=state.viewMode==='roles' ? 'roles' : 'users';
    const offset=base[subjects].length;
    const query=accessControlMatrixQuery(state,offset);
    const scope=getSupabaseReadIdentityScope();
    state.appendPending=true;
    try {
        const next=await readAccessControlMatrixWindow(query);
        if (scope!==getSupabaseReadIdentityScope() || state.data!==base
            || JSON.stringify(query)!==JSON.stringify(accessControlMatrixQuery(state,offset))) return;
        state.data={...next,[subjects]:[...base[subjects],...next[subjects]]};
        if (!next[subjects].length) state.data.page={...next.page,subjectTotal:offset};
    } catch (error) {
        if (scope===getSupabaseReadIdentityScope()) state.error=getAccessControlErrorMessage(error);
    } finally {
        state.appendPending=false;
        if (scope===getSupabaseReadIdentityScope()) scheduleManagersRender(true);
    }
}

function setAccessControlColumnWindow(offset = 0) {
    accessControlAdminState.columnOffset = Math.max(0, Number(offset) || 0);
    accessControlAdminState.editor = null;
    loadAccessControlMatrix(true);
    return false;
}

function renderAccessControlPanel() {
    if (!canViewAccessControl()) return '<div class="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm font-bold text-red-700">Access Control is available only to active Admin and Manager profiles.</div>';
    const state = accessControlAdminState;
    if (!state.loaded && !state.loading) setTimeout(() => loadAccessControlMatrix(false), 0);
    const data = state.data;
    if (!data && state.loading) return '<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center text-sm font-black text-emerald-700">Loading the access audit matrix…</div>';
    const errorHtml = state.error ? `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><div>${escapeHtml(state.error)}</div><button type="button" class="mt-3 min-h-[44px] rounded-xl border border-red-200 bg-white px-4 text-[10px] font-black uppercase text-red-700" onclick="return refreshAccessControlMatrix()">Retry</button></div>` : '';
    if (!data) return `${errorHtml}<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">The access audit matrix is unavailable.</div>`;
    const page = data.page || {};
    const pageSize = Math.max(1, Number(state.columnPageSize) || 8);
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    const subjects = state.viewMode === 'roles' ? (data.roles || []) : (data.users || []);
    const modules = Array.isArray(data.filters && data.filters.modules) ? data.filters.modules : [];
    const roles = Array.isArray(data.filters && data.filters.roles) ? data.filters.roles : [];
    const summary = data.summary || {};
    const limitedLive = state.capabilities && state.capabilities.editScope === 'limited-users';
    const statusCards = [
        ['Active Users', summary.userCount, 'ph-users-three'],
        ['Permissions', summary.permissionCount, 'ph-key'],
        ['Draft Differences', summary.mismatchCount, 'ph-git-diff'],
        ['Missing Baselines', summary.baselineMissingCount, 'ph-warning-circle']
    ].map(([label, value, icon]) => `<div class="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm"><div class="flex items-center justify-between gap-2"><div class="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">${escapeHtml(label)}</div><i class="ph-bold ${icon} text-emerald-500"></i></div><div class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(String(value || 0))}</div></div>`).join('');
    const auditBanner = limitedLive
        ? '<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950"><div class="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Limited Live Access</div><div class="mt-1">Kayla can manage module access only for active CSR, Sales Rep, and Sales/Marketing users. Manager and security access cannot be granted here.</div></div>'
        : data.enforcementMode === 'audit'
        ? '<div class="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900"><div class="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Audit Mode · No Live Access Changes</div><div class="mt-1">Edits build a reviewed policy for comparison. Existing production authorization remains authoritative.</div></div>'
        : '<div class="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-black text-red-800">Centralized enforcement is active.</div>';
    const publishDisabled = state.publishing || String(state.publishReason || '').trim().length < 4;
    const permissionTotal = Number(page.permissionTotal || permissions.length);
    const subjectTotal = Number(page.subjectTotal || subjects.length);
    const columnWindowHtml = accessAuditColumnsControl(state,permissionTotal,pageSize);
    const subjectWindowHtml = subjectTotal > subjects.length && !state.error && !state.loading
        ? '<div class="h-px" data-access-audit-end></div>' : '';
    const editHelp = canManageAccessControl()
        ? (limitedLive ? 'Tap a cell to change this user’s live module access.' : 'Tap a cell to edit the audit draft.')
        : 'Read-only manager view. Dylan, Megan, and JD can edit the audit draft.';
    const publishHtml = canPublishAccessControl() ? `<section class="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><div class="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">Publish Reviewed Audit Snapshot</div><div class="mt-1 text-sm font-bold text-indigo-950">This records an immutable reviewed version and starts the next draft. It does not enable centralized enforcement.</div><div class="mt-3 flex flex-col gap-2 md:flex-row"><input type="text" maxlength="500" class="min-h-[48px] min-w-0 flex-1 rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold text-slate-900" value="${escapeHtml(state.publishReason || '')}" placeholder="Required review reason" oninput="return updateAccessControlPublishReason(this.value)"><button type="button" class="min-h-[48px] rounded-xl bg-indigo-700 px-5 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50" ${publishDisabled ? 'disabled' : ''} onclick="return publishAccessControlAuditPolicy()">${state.publishing ? 'Publishing…' : 'Publish Audit Snapshot'}</button></div></section>` : '';
    const viewControl = limitedLive
        ? '<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"><div class="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600">View</div><div class="mt-1 text-sm font-black text-emerald-900">Managed Users Only</div></div>'
        : `<label class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">View<select class="mt-1 min-h-[46px] w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-slate-900" onchange="return setAccessControlViewMode(this.value)"><option value="users" ${state.viewMode === 'users' ? 'selected' : ''}>Users</option><option value="roles" ${state.viewMode === 'roles' ? 'selected' : ''}>Role Defaults</option></select></label>`;
    return `<div class="space-y-5">${auditBanner}${errorHtml}<section class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div class="text-[10px] font-black uppercase tracking-[0.16em] text-[#007a4d]">Managers · Access Control</div><div class="mt-1 text-xl font-black text-slate-900">Policy v${escapeHtml(String(data.policy.version || 0))} · Revision ${escapeHtml(String(data.policy.revision || 0))}</div><div class="mt-1 text-[12px] font-semibold text-slate-500">Y/N shows effective access. Role supplies the default; a user override takes precedence. ${escapeHtml(editHelp)}</div></div><div class="flex flex-wrap gap-2"><button type="button" class="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[10px] font-black uppercase text-emerald-800" onclick="return refreshAccessControlMatrix()"><i class="ph-bold ph-arrows-clockwise mr-1"></i>Refresh</button><button type="button" class="min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 px-4 text-[10px] font-black uppercase text-blue-800" onclick="return exportAccessControlCsv()"><i class="ph-bold ph-download-simple mr-1"></i>CSV</button></div></div><div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">${statusCards}</div></section>${renderAccessControlEditor()}<section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="grid gap-3 md:grid-cols-4">${viewControl}<label class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Module<select class="mt-1 min-h-[46px] w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-slate-900" onchange="return setAccessControlModuleFilter(this.value)"><option value="all">All Modules</option>${modules.map((moduleKey) => `<option value="${escapeHtml(moduleKey)}" ${state.selectedModule === moduleKey ? 'selected' : ''}>${escapeHtml(moduleKey)}</option>`).join('')}</select></label><label class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Role Filter<select class="mt-1 min-h-[46px] w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-slate-900" onchange="return setAccessControlRoleFilter(this.value)" ${state.viewMode === 'roles' ? 'disabled' : ''}><option value="all">All Roles</option>${roles.map((roleKey) => `<option value="${escapeHtml(roleKey)}" ${state.selectedRole === roleKey ? 'selected' : ''}>${escapeHtml(roleKey)}</option>`).join('')}</select></label><div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div class="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Shown</div><div class="mt-1 text-lg font-black text-slate-900">${escapeHtml(String(subjects.length))} × ${escapeHtml(String(permissions.length))}</div></div></div></section>${columnWindowHtml}${renderAccessControlMatrixTable(subjects, permissions)}${subjectWindowHtml}${publishHtml}</div>`;
}
