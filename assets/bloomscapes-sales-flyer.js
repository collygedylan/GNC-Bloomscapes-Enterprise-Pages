function startBloomscapesCartFlyerBuilder() {
    const items = Array.from(selectedItems, id => findItemByDomId(id)).filter(Boolean);
    if (!items.length) {
        showToast('Select Rows', 'Add one or more rows to Bloom Picker first.', true);
        return false;
    }
    return openBloomscapesFlyerBuilder(items, {closeCart:true, clearSelection:true, usePendingFolder:true});
}

async function openBloomscapesFlyerBuilder(items, options = {}) {
    const validItems = items.filter(item => canUseCartInventoryActions([item]));
    if (!validItems.length) {
        showToast('Not Available', 'Flyer works on inventory rows only.', true);
        return false;
    }
    const owner = getSupabaseReadIdentityScope();
    const farm = getBloomscapesFarm();
    const ownsCommand = () => owner === getSupabaseReadIdentityScope() && farm === getBloomscapesFarm();
    const existing = options.usePendingFolder ? String(pendingFlyerFolderTarget || '').trim() : '';
    const pendingAssignees = options.usePendingFolder ? pendingFlyerFolderAssignees : '';
    const isAddingToExistingFolder = existing !== '';
    const name = await requestBloomscapesFlyerFolderName(existing);
    if (!name || !ownsCommand()) return false;
    const folderName = existing || resolveNewFlyerFolderName(name);
    const defaultAssignees = String(pendingAssignees || getFlyerFolderAssignedNames(folderName).join(', ') || currentUserDisplay || currentUser || '').trim();
    openFlyerAssigneePicker({folderName, defaultAssignees, isAddingToExistingFolder}).then(assignees => {
        if (!assignees?.length || !ownsCommand()) return false;
        return createFlyerFolderRowsForItems(validItems, folderName, isAddingToExistingFolder, assignees, {
            closeCart:options.closeCart === true,
            clearSelection:options.clearSelection === true,
            emptyMessage:'No valid inventory rows were available for Flyer.'
        });
    }).catch(showFlyerFolderCreationFailure);
    return false;
}

async function requestBloomscapesFlyerFolderName(existing) {
    if (existing) return existing;
    const input = await showAppPrompt('Enter the flyer folder name for these rows.', buildDefaultFlyerFolderName(), {
        title:'Flyer Folder', confirmLabel:'Continue', cancelLabel:'Cancel', placeholder:'Folder name'
    });
    if (input === null) return '';
    const name = String(input || '').trim();
    if (!name) showToast('Folder Required', 'Enter a flyer folder name before creating the folder.', true);
    return name;
}
