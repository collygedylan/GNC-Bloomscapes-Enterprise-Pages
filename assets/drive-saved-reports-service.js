function canManageDriveSavedReport(report, access) {
    return access?.can_manage === true && (
        !report || access.manage_all === true || report.owner_username === access.username
    );
}

async function driveSavedReportsRpc(name, params) {
    const farm = getBloomscapesFarm();
    const {client, owner} = await requireBloomscapesSession();
    if (farm !== getBloomscapesFarm()) throw new Error('The Drive farm changed.');
    const result = await client.rpc(name, params).abortSignal(AbortSignal.timeout(8000));
    await requireBloomscapesOwner(owner);
    if (farm !== getBloomscapesFarm()) throw new Error('The Drive farm changed.');
    return bloomscapesData(result);
}

async function listDriveSavedReports(farmCode = getBloomscapesFarm()) {
    if (farmCode !== getBloomscapesFarm()) throw new Error('The Drive farm changed.');
    const data = await driveSavedReportsRpc('list_drive_saved_reports_v1', {p_farm: farmCode});
    if (!Array.isArray(data?.reports) || !data.username) throw new Error('Saved reports could not be verified.');
    return data;
}

async function upsertDriveSavedReport(report) {
    const id = report.id || crypto.randomUUID();
    const scope = report.farm_code || getBloomscapesFarm();
    const input = {
        id,
        report_name: report.report_name.trim(),
        farm_code: scope,
        visibility: report.visibility,
        selected_columns: report.selected_columns,
        column_widths: report.column_widths,
        filter_rules: report.filter_rules,
        sort_rules: report.sort_rules
    };
    const data = await driveSavedReportsRpc('upsert_drive_saved_report_v1', {p_report: input, p_create: !report.id});
    if (data?.id !== id || data.farm_code !== scope || data.report_name !== input.report_name
        || data.visibility !== input.visibility) {
        throw new Error('The saved report receipt did not match this report.');
    }
    return data;
}

async function deleteDriveSavedReport(id) {
    const data = await driveSavedReportsRpc('delete_drive_saved_report_v1', {p_id: id});
    if (data !== id) throw new Error('The deletion receipt did not match this report.');
    return data;
}
