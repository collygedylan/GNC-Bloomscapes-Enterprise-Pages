const consolidationUsers = new Set(['dylan_collyge','megan_kelly']);

function canViewFieldWorkConsolidation(effectiveUser = activeConsolidationUser()) {
    if (!consolidationUsers.has(effectiveUser?.username)) return false;
    const level = effectiveUser.field_work_consolidation;
    return level === 'Y' || level === 'FULL_EDIT';
}

function activeConsolidationUser() {
    if (!nativeAuthSessionActive || !nativeAuthProfile?.id || getBloomscapesFarm() !== '10-PH') return null;
    const preview = borrowedHelpPreview();
    if (preview) return {username:preview.username,field_work_consolidation:preview.area_access?.field_work_consolidation};
    if (currentUser !== nativeAuthProfile.username) return null;
    const matrix = resolveUserAccessMatrix(currentUser);
    if (!matrix?.verified || matrix.profile_id !== nativeAuthProfile.id) return null;
    return {username:currentUser,field_work_consolidation:matrix.view_permissions?.field_work_consolidation};
}

function canEditConsolidationUserGrant(username) {
    return consolidationUsers.has(username);
}
