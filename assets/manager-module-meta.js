function canViewCodexOperations() {
    if (nativeAuthSessionActive || getCodexOpsCurrentUserKey() !== 'dylan_collyge') return false;
    if (!codexOpsState.capabilitiesLoaded && !codexOpsState.capabilitiesLoading) loadCodexOpsCapabilities(false).catch(() => {});
    const capabilities = codexOpsState.capabilities;
    return !!(capabilities && capabilities.canView === true && capabilities.submissionEnabled === true);
}

function getManagerModuleMeta(tab = activeHomeTab) {
    const safeTab = String(tab || '').trim().toLowerCase();
    const workflow = bloomscapesWorkflowTab(safeTab);
    if (workflow) return {label:workflow.label,description:'Farm '+getBloomscapesFarm()+' work',icon:'ph-plant'};
    if (safeTab === MANAGER_APPROVAL_HOME_VIEW) return { label: 'Approval', description: 'Open Shear and NCR approval work.', icon: 'ph-seal-check' };
    if (safeTab === MANAGER_RUNTIME_WATCHDOG_VIEW) return { label: 'WATCHDOG MONITOR', description: 'Review runtime incidents and role parity.', icon: 'ph-shield-warning' };
    if (safeTab === 'moves') return { label: 'Move', description: 'Build location-code move sessions from Drive Mode rows.', icon: 'ph-map-pin-line' };
    if (safeTab === APP_SEASON_SETTINGS_VIEW) return { label: 'Season', description: 'Set the current and next sales season logic.', icon: 'ph-calendar-check' };
    if (safeTab === AV_BLANKS_PHOTO_BYPASS_SETTINGS_VIEW) return { label: 'AV Note Users', description: 'Choose who can enter Season Sales Notes and finish AV Blanks without photo/spec.', icon: 'ph-note-pencil' };
    if (safeTab === ITEM_INQUIRY_COVERAGE_SETTINGS_VIEW) return { label: 'Inquiry Coverage', description: 'Mark Sharon Here or Gone and automatically copy Sunday while Sharon is away.', icon: 'ph-users-three' };
    if (safeTab === INVENTORY_TRANSACTION_HISTORY_VIEW) return { label: 'Transaction History', description: 'Look up who made QTY, Transfer, and Reclass changes.', icon: 'ph-clock-counter-clockwise' };
    if (safeTab === MANAGER_TRANSACTIONS_KEYED_VIEW) return { label: 'Transactions Keyed', description: 'Compare keyed transaction counts and daily or historical shares.', icon: 'ph-table' };
    if (safeTab === MANAGER_ORDERS_VIEW) return { label: 'Orders', description: 'Open frozen order-file history and matched Drive Mode rows.', icon: 'ph-package' };
    if (safeTab === MANAGER_TABLE_MANAGEMENT_VIEW) return { label: 'Table Management', description: 'Manage authorized maintained tables and browse read-only history.', icon: 'ph-table' };
    if (safeTab === MANAGER_ASSIGNED_ITEMS_EXPORT_VIEW) return { label: 'Assigned Items', description: 'Export warehouse assigned item rows by AssignedTo.', icon: 'ph-user-list' };
    if (safeTab === MANAGER_CUSTOMER_REP_MAP_VIEW) return { label: 'Customer Assignments', description: 'Assign customer and consignee sales reps, or restore their imported assignments.', icon: 'ph-address-book' };
    if (safeTab === MANAGER_EVAL_REPORTS_VIEW) return { label: 'Eval Reports', description: 'Open live Drive-based Eval inventory reports.', icon: 'ph-chart-bar' };
    if (safeTab === MANAGER_EVAL_REPORTS_2_VIEW) return { label: 'Reports', description: 'Open Apps Script-compatible reports and Item Inquiry from live Park Hill inventory.', icon: 'ph-chart-line-up' };
    if (safeTab === MANAGER_HISTORICAL_REPORT_VIEW) return { label: 'Historical Report', description: 'Search Common Name and ContSize history with selectable columns.', icon: 'ph-clock-counter-clockwise' };
    if (safeTab === MANAGER_SHORTAGE_CANCEL_VIEW) return { label: 'Shortage/Cancel', description: 'Review SOC rows where ordered and shipped quantities do not match.', icon: 'ph-warning-circle' };
    if (safeTab === MANAGER_BLOCK_CLEARING_VIEW) return { label: 'Block Clearing', description: 'Email grouped clearing instructions from Drive Mode rows.', icon: 'ph-broom' };
    if (safeTab === MANAGER_ACCESS_CONTROL_VIEW) return { label: 'User & Role Access', description: 'Set inherited role permissions and individual feature overrides.', icon: 'ph-shield-checkered' };
    if (safeTab === MANAGER_CODEX_OPERATIONS_VIEW) return { label: 'Codex Operations', description: 'Report a defect, review the repair, and approve one exact commit.', icon: 'ph-terminal-window' };
    if (safeTab === MANAGER_SALES_REPS_VIEW) return { label: 'Request History', description: 'Search assigned requests and completed history.', icon: 'ph-users-three' };
    if (safeTab === MANAGER_DELIVERY_RECOVERY_VIEW) return { label: 'Delivery Recovery', description: 'Review and retry stalled request deliveries.', icon: 'ph-lifebuoy' };
    if (safeTab === MANAGER_SEASON_PRIORITY_VIEW) return { label: 'Season Priority', description: 'Request priority 1 for selected Season Sales Notes.', icon: 'ph-list-numbers' };
    if (safeTab === MANAGER_PRODUCTION_SCHEDULE_VIEW) return { label: 'Production Schedule', description: 'Browse the 2027 workbook and refresh its seven sheets.', icon: 'ph-calendar-dots' };
    if (safeTab === MANAGER_HR_COMMAND_VIEW) return { label: 'HR & Labor', description: 'Weekly employee labor and time off.', icon: 'ph-identification-card' };
    if (safeTab === MANAGER_COMPANY_DIRECTORY_VIEW) return { label: 'Company Directory', description: 'Manage company contacts, block capacities, and production codes.', icon: 'ph-address-book' };
    if (safeTab === 'hours') return { label: 'Labor Hours', description: 'Open the labor-hours entry form.', icon: 'ph-clock' };
    if (safeTab === 'productivity') return { label: 'Productivity', description: 'Review completed work by user and date.', icon: 'ph-chart-line-up' };
    if (safeTab === SHEAR_APPROVAL_VIEW) return { label: 'Shear Approvals', description: 'Approve explicit Add To Shear List requests before they enter Que.', icon: 'ph-scissors' };
    if (safeTab === NCR_APPROVAL_NEW_CROP_VIEW) return { label: 'NCR Approvals', description: 'Approve future season new crop release rows.', icon: 'ph-seal-check' };
    if (safeTab === NOT_ON_INVENTORY_APPROVAL_VIEW) return { label: 'Not On Inventory', description: 'Review rows flagged outside inventory.', icon: 'ph-clipboard-text' };
    return { label: getManagerApprovalTabLabel(safeTab) || 'Manager Module', description: 'Open a manager workflow.', icon: 'ph-squares-four' };
}

