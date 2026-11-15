function renderCanonicalManagerApprovalHome(approvalTabs = null) {
    setTimeout(() => { void refreshSuspendApprovalInbox(); }, 0);
    const tabs = (Array.isArray(approvalTabs) ? approvalTabs : getManagerApprovalTabs(getManagersToolAccess()))
        .filter((tab) => [SHEAR_APPROVAL_VIEW, NCR_APPROVAL_NEW_CROP_VIEW].includes(String(tab && tab.id || '').trim().toLowerCase()));
    const cardsHtml = tabs.map((tab) => {
        const meta = getManagerModuleMeta(tab.id);
        const label = tab.label || meta.label || 'Module';
        const description = meta.description || 'Open approval work.';
        return `<button type="button" class="manager-module-card" title="${esc(`${label}: ${description}`)}" aria-label="${esc(label)}" onclick="return setHomeTab('${escJsAttrValue(tab.id)}')">
            <span class="manager-module-icon"><i class="ph-bold ${esc(meta.icon || 'ph-seal-check')}"></i></span>
            <span class="manager-module-title">${esc(label)}</span>
        </button>`;
    }).join('');
    if (!cardsHtml) {
        return '<section data-suspend-approval-inbox class="p-4"></section><div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm font-bold text-slate-400">No approval queues are available for this login.</div>';
    }
    return `<div class="space-y-4">
        <div class="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div class="text-[10px] font-black uppercase tracking-[0.16em] text-[#007a4d]">Manager Approval</div>
            <div class="mt-1 text-xl font-black text-slate-900">Approval</div>
            <div class="mt-1 text-[12px] font-semibold text-slate-500">Choose the approval queue to work. Shear and NCR approvals stay grouped here.</div>
        </div>
        <section data-suspend-approval-inbox class="p-4"></section><div class="manager-module-grid">${cardsHtml}</div>
    </div>`;
}
