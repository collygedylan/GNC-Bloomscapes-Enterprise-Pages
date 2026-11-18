function syncHeaderBloomPlacement(view = getCurrentVisibleViewId()) {
    const bloom = document.getElementById('footer-cart-btn');
    const host = document.getElementById('global-header-search-row');
    const farm = document.getElementById('bloomscapes-farm-selector')?.parentElement;
    if (!bloom || !host) return;
    placeBloomscapesFarmFilter(farm, view, host);
    if (farm?.parentElement === host && farm.nextElementSibling !== bloom) farm.after(bloom);
    else if (bloom.parentElement !== host) host.appendChild(bloom);
}

function openBloomPicker() {
    return toggleCartPanel(true);
}

function toggleCartPanel(forceOpen = null) {
    if (forceOpen !== false && !canAccessView('bloom')) {
        showToast('Access unavailable', 'You do not have permission to open Bloom Picker.', true);
        return false;
    }
    if (forceOpen !== false) restoreBloomCartSelection();
    if (!selectedItems.size && forceOpen !== false && !hasSavedBloomCartRows()) {
        restoreBloomPickerOrderDraftSelection(true);
    }
    const nextOpen = forceOpen === null ? !cartPanelOpen : !!forceOpen;
    if (nextOpen !== cartPanelOpen) {
        bloomPickerActionsOpen = false;
        if (!nextOpen) bloomShareMenuOpen = false;
    }
    cartPanelOpen = nextOpen;
    updateGlobalActionBar();
    return false;
}

function openBloomPickerFlyerFolders() {
    if (!canAccessView('tasks')) {
        showToast('Access unavailable', 'You do not have permission to open Flyer Folders.', true);
        return false;
    }
    toggleCartPanel(false);
    const view=['sales','sales-office'].find(view=>canAccessView(view));
    if (!view) {switchView('tasks');return setTaskTab('flyer');}
    openBloomscapesSalesFlyerStudio(view);
    return false;
}

function mountBloomPickerDrawer(bar, hasItems) {
    if (!bar) return;
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Bloom Picker and Flyer Folders');
    let tools = bar.querySelector('[data-bloom-picker-tools]');
    if (!tools) {
        tools = document.createElement('div');
        tools.dataset.bloomPickerTools = '';
        tools.innerHTML = '<button type="button" data-bloom-folders>Flyer Folders</button><button type="button" data-bloom-close aria-label="Close Bloom Picker">Close</button><p data-bloom-empty>Select rows from Drive Mode or AV to use Bloom Picker actions.</p>';
        tools.querySelector('[data-bloom-folders]').addEventListener('click', openBloomPickerFlyerFolders);
        tools.querySelector('[data-bloom-close]').addEventListener('click', () => toggleCartPanel(false));
        bar.prepend(tools);
    }
    tools.querySelector('[data-bloom-folders]').hidden = !canAccessView('tasks');
    const empty = tools.querySelector('[data-bloom-empty]');
    empty.hidden = hasItems;
    empty.textContent = hasSavedBloomCartRows()
        ? 'Saved rows will appear as inventory becomes available.'
        : 'Select rows from Drive Mode or AV to use Bloom Picker actions.';
    bar.classList.toggle('hidden', !cartPanelOpen || !currentUser || !canAccessView('bloom'));
}

function updateGlobalActionBar() {
    const items = getCartSelectedItems();
    const hasItems = selectedItems.size > 0;
    const visibility = getBloomPickerActionVisibility(items);
    const share = !!(visibility.showCopy || visibility.showEmail || visibility.showText);
    const anyAction = !!(share || visibility.showAssign || visibility.showEvalTask || visibility.showNcr
        || visibility.showRequest || visibility.showMove || visibility.showFlyer || visibility.showTakeBack
        || visibility.showEndCap || visibility.showShear || visibility.showBloomOrder || visibility.showProject);
    if (!hasItems || !cartPanelOpen || !anyAction) {
        bloomPickerActionsOpen = false;
        bloomShareMenuOpen = false;
    }
    renderBloomPickerTrayRows(items);
    const count = document.getElementById('sel-count');
    if (count) count.innerText = selectedItems.size;
    const button = document.getElementById('footer-cart-btn');
    if (button) {
        button.classList.toggle('hidden', !currentUser || !canAccessView('bloom'));
        button.classList.toggle('active', cartPanelOpen);
        button.setAttribute('aria-expanded', String(cartPanelOpen));
        button.setAttribute('aria-controls', 'global-action-bar');
    }
    const badge = document.getElementById('footer-cart-badge');
    if (badge) {
        badge.innerText = selectedItems.size > 99 ? '99+' : String(selectedItems.size);
        badge.classList.toggle('hidden', !hasItems);
    }
    syncBloomPickerActions(visibility, {hasItems, share, anyAction});
    mountBloomPickerDrawer(document.getElementById('global-action-bar'), hasItems);
    syncBloomShareMenuUi(visibility);
    syncGlobalHeaderChrome({reason: 'selection'});
}

function syncBloomPickerActions(visibility, {hasItems, share, anyAction}) {
    const toggle = document.getElementById('bloom-picker-actions-toggle');
    if (toggle) {
        const visible = hasItems && cartPanelOpen && anyAction;
        toggle.classList.toggle('hidden', !visible);
        toggle.classList.toggle('flex', visible);
        toggle.setAttribute('aria-expanded', String(bloomPickerActionsOpen));
        for (const name of ['bg-[#007a4d]', 'text-white']) toggle.classList.toggle(name, bloomPickerActionsOpen);
        for (const name of ['bg-emerald-50', 'text-[#007a4d]']) toggle.classList.toggle(name, !bloomPickerActionsOpen);
    }
    const icon = document.getElementById('bloom-picker-actions-icon');
    if (icon) icon.className = 'ph-bold ' + (bloomPickerActionsOpen ? 'ph-caret-up' : 'ph-caret-down');
    const actions = {'assign':'showAssign', 'eval-task':'showEvalTask', 'ncr':'showNcr',
        'request':'showRequest', 'move':'showMove', 'flyer':'showFlyer', 'take-back':'showTakeBack',
        'endcap':'showEndCap', 'shear':'showShear', 'bloom-order':'showBloomOrder', 'project':'showProject'};
    for (const [id, key] of Object.entries(actions)) {
        document.getElementById('batch-btn-' + id)?.classList.toggle('hidden', !bloomPickerActionsOpen || !visibility[key]);
    }
    document.getElementById('bloom-picker-actions-list')?.classList.toggle('hidden', !bloomPickerActionsOpen);
    document.getElementById('batch-share-menu-wrap')?.classList.toggle('hidden', !bloomPickerActionsOpen || !hasItems || !share);
    document.getElementById('cart-helper-text')?.classList.toggle('hidden',
        !bloomPickerActionsOpen || !hasItems || visibility.canUseInventoryActions || visibility.canUseBloomOrders);
}
