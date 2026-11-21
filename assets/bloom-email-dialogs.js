function closeGroupedBloomNcrRecipientModal(choice = 'cancel') {
    const action = String(choice || 'cancel').trim().toLowerCase();
    if (action === 'send' && !getGroupedBloomNcrSelectedRecipientOptions().length) {
        const noun = String(firstNonEmptyValue(groupedBloomNcrRecipientModalOptions.selectionNoun, 'recipient') || 'recipient');
        showToast(`Select ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`, `Select at least one app user before continuing.`, true);
        syncGroupedBloomNcrRecipientUi();
        return false;
    }
    if (action === 'send' && isGroupedBloomNcrRowSelectionEnabled() && !getGroupedBloomNcrSelectedRows().length) {
        showToast('Select Rows', 'Choose at least one row to include in the email.', true);
        syncGroupedBloomNcrRecipientUi();
        return false;
    }
    const modal = document.getElementById('grouped-bloom-ncr-recipient-modal');
    if (modal) modal.classList.add('hidden');
    const selectedEmails = action === 'send'
        ? dedupeRequestEmailRecipients([
            ...getGroupedBloomNcrSelectedRecipientOptions().map((option) => option.email),
            ...getGroupedBloomNcrRequiredRecipientEmails()
        ])
        : null;
    const selectedRows = action === 'send' ? getGroupedBloomNcrSelectedRows() : null;
    const returnSelection = !!(groupedBloomNcrRecipientModalOptions && groupedBloomNcrRecipientModalOptions.returnSelection);
    groupedBloomNcrRecipientSearch = '';
    groupedBloomNcrSelectedRecipients = new Set();
    groupedBloomNcrRecipientItems = [];
    groupedBloomNcrSelectedRowKeys = new Set();
    groupedBloomNcrRecipientModalOptions = {};
    const search = document.getElementById('grouped-bloom-ncr-recipient-search');
    if (search) search.value = '';
    const resolver = groupedBloomNcrRecipientResolver;
    groupedBloomNcrRecipientResolver = null;
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('grouped-bloom-ncr-recipient-modal');
    if (resolver) resolver(returnSelection && action === 'send'
        ? { recipientEmails: selectedEmails || [], rows: selectedRows || [] }
        : selectedEmails);
    return false;
}

async function openGroupedBloomNcrRecipientModal(items = [], defaultEmails = [], options = {}) {
    const rows = (Array.isArray(items) ? items : []).filter(Boolean);
    const modal = mountBloomscapesStaticBody('grouped-bloom-ncr-recipient-modal');
    if (!modal) return options.recipientCapability || Array.isArray(options.allowedUsernames) ? null : dedupeRequestEmailRecipients(defaultEmails);
    groupedBloomNcrRecipientItems = rows.slice();
    groupedBloomNcrRecipientModalOptions = options && typeof options === 'object' ? { ...options } : {};
    groupedBloomNcrRecipientSearch = '';
    const requiredEmails = [
        ...(Array.isArray(groupedBloomNcrRecipientModalOptions.requiredEmails) ? groupedBloomNcrRecipientModalOptions.requiredEmails : []),
        ...(Array.isArray(groupedBloomNcrRecipientModalOptions.requiredRecipientEmails) ? groupedBloomNcrRecipientModalOptions.requiredRecipientEmails : [])
    ];
    groupedBloomNcrSelectedRecipients = new Set(dedupeRequestEmailRecipients([...(defaultEmails || []), ...requiredEmails]).map(normalizeBloomPurposeRecipientEmail).filter(Boolean));
    groupedBloomNcrSelectedRowKeys = new Set(getGroupedBloomNcrSelectableRows().map((entry) => entry.key));
    const search = document.getElementById('grouped-bloom-ncr-recipient-search');
    if (search) search.value = '';
    if (groupedBloomNcrRecipientResolver) {
        const previousResolver = groupedBloomNcrRecipientResolver;
        groupedBloomNcrRecipientResolver = null;
        previousResolver(null);
    }
    modal.classList.remove('hidden');
    syncGroupedBloomNcrRecipientUi();
    Promise.all([
        typeof ensureAssignableAppUsers === 'function' ? ensureAssignableAppUsers(false).catch(() => []) : Promise.resolve([]),
        typeof ensureAdminRecipientUsers === 'function' ? ensureAdminRecipientUsers(false).catch(() => []) : Promise.resolve([])
    ]).then(() => syncGroupedBloomNcrRecipientUi()).catch(() => syncGroupedBloomNcrRecipientUi());
    return new Promise((resolve) => {
        groupedBloomNcrRecipientResolver = resolve;
        focusGroupedBloomNcrRecipientSearch(search);
    });
}

function focusGroupedBloomNcrRecipientSearch(search) {
    if (!search) return;
    setTimeout(() => {
        if (!search.isConnected) return;
        try { search.focus({ preventScroll: true }); } catch { search.focus(); }
    }, 30);
}

function closeBloomEmailPurposeModal() {
    const modal = document.getElementById('bloom-email-purpose-modal');
    if (modal) modal.classList.add('hidden');
    bloomEmailPurposeItems = [];
    bloomEmailPurposeSelectionKind = '';
    bloomEmailPurposeAction = 'general';
    bloomEmailPurposeRecipientSearch = '';
    bloomEmailPurposeSelectedRecipients = new Set();
    bloomEmailPurposeSending = false;
    const recipientSearch = document.getElementById('bloom-email-purpose-recipient-search');
    if (recipientSearch) recipientSearch.value = '';
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('bloom-email-purpose-modal');
    return false;
}

function openBloomEmailPurposeModal(items = getCartSelectedItems(), selectionKind = getBloomDirectShareSelectionKind(items)) {
    const rows = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!rows.length) {
        showToast('Bloom Picker Empty', 'Add one or more rows to Bloom Picker first.', true);
        return false;
    }
    bloomEmailPurposeItems = rows.slice();
    bloomEmailPurposeSelectionKind = selectionKind || getBloomDirectShareSelectionKind(rows);
    bloomEmailPurposeAction = 'general';
    bloomEmailPurposeRecipientSearch = '';
    bloomEmailPurposeSelectedRecipients = new Set();
    bloomEmailPurposeSending = false;
    const modal = mountBloomscapesStaticBody('bloom-email-purpose-modal');
    const reason = document.getElementById('bloom-email-purpose-reason');
    if (reason) reason.value = '';
    const recipientSearch = document.getElementById('bloom-email-purpose-recipient-search');
    if (recipientSearch) recipientSearch.value = '';
    syncBloomEmailPurposeActionOptions(rows);
    if (modal) modal.classList.remove('hidden');
    syncBloomEmailPurposeModalUi();
    return false;
}

function openBloomActionRowFormModal(rows = [], options = {}) {
    const safeRows = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!safeRows.length) {
        showToast('Bloom Picker Empty', 'Add one or more rows to Bloom Picker first.', true);
        return false;
    }
    const now = new Date();
    const action = String(options.action || bloomEmailPurposeAction || 'general').trim() || 'general';
    const initialValuesByIndex = Array.isArray(options.initialValuesByIndex) ? options.initialValuesByIndex : [];
    bloomActionRowFormContext = {
        rows: safeRows.slice(),
        action,
        selectionKind: String(options.selectionKind || bloomEmailPurposeSelectionKind || getBloomDirectShareSelectionKind(safeRows) || '').trim(),
        reason: String(options.reason || '').trim(),
        recipientEmails: dedupeRequestEmailRecipients(options.recipientEmails || []),
        afterPersist: typeof options.afterPersist === 'function' ? options.afterPersist : null,
        emailOnly: options.emailOnly === true,
        recipientModalCompleted: options.recipientModalCompleted === true,
        timestampIso: now.toISOString(),
        timestampLabel: formatBloomActionRowTimestamp(now),
        currentIndex: 0,
        valuesByIndex: safeRows.map((item, index) => ({
            ...getBloomActionRowDefaultValues(item, action, now.toISOString()),
            ...((initialValuesByIndex[index] && typeof initialValuesByIndex[index] === 'object') ? initialValuesByIndex[index] : {})
        }))
    };
    bloomActionRowFormSubmitting = false;
    const purposeModal = document.getElementById('bloom-email-purpose-modal');
    if (purposeModal) purposeModal.classList.add('hidden');
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('bloom-email-purpose-modal');
    const modal = mountBloomscapesStaticBody('bloom-action-row-form-modal');
    if (modal) modal.classList.remove('hidden');
    syncBloomActionRowFormModalUi();
    return false;
}

function closeBloomActionRowFormModal() {
    const modal = document.getElementById('bloom-action-row-form-modal');
    if (modal) modal.classList.add('hidden');
    const list = document.getElementById('bloom-action-row-form-list');
    if (list) list.innerHTML = '';
    bloomActionRowFormContext = null;
    bloomActionRowFormSubmitting = false;
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('bloom-action-row-form-modal');
    return false;
}

function getGroupedBloomNcrRecipientOptions() {
    const byEmail = new Map();
    const appUsersOnly = !!(groupedBloomNcrRecipientModalOptions && groupedBloomNcrRecipientModalOptions.appUsersOnly);
    const allowedUsernames = new Set((Array.isArray(groupedBloomNcrRecipientModalOptions && groupedBloomNcrRecipientModalOptions.allowedUsernames) ? groupedBloomNcrRecipientModalOptions.allowedUsernames : []).map(normalizePushUsername).filter(Boolean));
    const addRecipient = (entry = {}) => {
        const username = normalizePushUsername(firstNonEmptyValue(entry.username, entry.userName, entry.display, ''));
        const email = normalizeBloomPurposeRecipientEmail(firstNonEmptyValue(entry.email, entry.address, resolveRequestRecipientEmail(username), getGreenleafEmailForUsername(username), ''));
        if (!email) return;
        const display = String(firstNonEmptyValue(entry.display, entry.name, formatBloomPurposeDisplayName(username || email), '') || '').trim() || formatBloomPurposeDisplayName(email);
        const role = String(firstNonEmptyValue(entry.role, entry.ROLE, '') || '').trim();
        byEmail.set(email, { email, username, display, role });
    };
    if (appUsersOnly) {
        try { (allowedUsernames.size ? getEvalWorkAssignableUserOptions(Array.from(allowedUsernames)) : getAssignableAppUserOptions()).forEach(addRecipient); } catch { globalThis.reportHandledRuntimeIssue?.("getGroupedBloomNcrRecipientOptions", 'HANDLED_OPERATION_FAILURE'); }
    } else {
        try { getBloomPurposeRecipientOptions().forEach(addRecipient); } catch { globalThis.reportHandledRuntimeIssue?.("getGroupedBloomNcrRecipientOptions", 'HANDLED_OPERATION_FAILURE'); }
        try { getAssignableAppUserOptions([...PRIVILEGED_MANAGER_USER_KEYS]).forEach(addRecipient); } catch { globalThis.reportHandledRuntimeIssue?.("getGroupedBloomNcrRecipientOptions", 'HANDLED_OPERATION_FAILURE'); }
        try { (Array.isArray(appAdminRecipientUsers) ? appAdminRecipientUsers : []).forEach(addRecipient); } catch { globalThis.reportHandledRuntimeIssue?.("getGroupedBloomNcrRecipientOptions", 'HANDLED_OPERATION_FAILURE'); }
        BLOOM_GROUPED_NCR_ALLOWED_USER_KEYS.forEach((username) => addRecipient({ username, display: formatBloomPurposeDisplayName(username), role: 'NCR' }));
        Array.from(groupedBloomNcrSelectedRecipients || []).forEach((email) => {
            const safeEmail = normalizeBloomPurposeRecipientEmail(email);
            if (safeEmail && !byEmail.has(safeEmail)) addRecipient({ email: safeEmail, display: formatBloomPurposeDisplayName(safeEmail), role: 'Selected' });
        });
    }
    const capability=groupedBloomNcrRecipientModalOptions?.recipientCapability;
    const users=capability ? eligiblePickerRows([...byEmail.values()],capability) : [...byEmail.values()];
    return users.filter((entry) => !Array.isArray(groupedBloomNcrRecipientModalOptions?.allowedUsernames) || allowedUsernames.has(normalizePushUsername(entry.username))).sort((a, b) => a.display.localeCompare(b.display));
}