const moduleSubviewPickers = new WeakMap();

function mountModuleSubviewDropdown(host, { label = 'View', choices, value, select }) {
    let picker = moduleSubviewPickers.get(host);
    if (!picker) {
        picker = createModuleSubviewDropdown(host);
        moduleSubviewPickers.set(host, picker);
    }
    Object.assign(picker, { label, choices, value, select });
    const shown = picker.pending?.value ?? value;
    updateModuleSubviewTrigger(picker, shown);
    picker.trigger.disabled = !choices.length;
    paintModuleSubviewOptions(picker, choices, shown);
    return picker.trigger;
}

function updateModuleSubviewTrigger(picker, value) {
    const selected = picker.choices.find(([key]) => key === value);
    const text = picker.label + ': ' + (selected?.[1] || 'Choose') + ' ▾';
    if (picker.trigger.textContent !== text) picker.trigger.textContent = text;
}

function createModuleSubviewDropdown(host) {
    const container = host.appendChild(document.createElement('div'));
    container.dataset.moduleSubview = '';
    const trigger = container.appendChild(document.createElement('button'));
    trigger.type = 'button';
    trigger.dataset.moduleSubviewTrigger = '';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    const options = container.appendChild(document.createElement('div'));
    options.dataset.moduleSubviewOptions = '';
    options.setAttribute('popover', 'auto');
    options.setAttribute('role', 'dialog');
    options.setAttribute('aria-label', 'Views');
    if (!options.showPopover) {
        options.removeAttribute('popover');
        options.hidden = true;
    }
    const picker = { trigger, options };
    trigger.onclick = () => toggleModuleSubviewDropdown(picker);
    options.onclick = event => chooseModuleSubview(picker, event);
    options.addEventListener('toggle', event => trigger.setAttribute('aria-expanded', String(event.newState === 'open')));
    options.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeModuleSubviewDropdown(picker);
    });
    return picker;
}

function toggleModuleSubviewDropdown(picker) {
    const { trigger, options } = picker;
    if (picker.pending) return;
    if (trigger.getAttribute('aria-expanded') === 'true') return closeModuleSubviewDropdown(picker);
    picker.openScope = moduleSubviewScope();
    const box = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(box.width, 225), innerWidth - 16);
    options.style.width = width + 'px';
    options.style.left = Math.max(8, Math.min(box.left, innerWidth - width - 8)) + 'px';
    options.style.top = Math.min(box.bottom + 4, innerHeight - 168) + 'px';
    if (options.showPopover) options.showPopover();
    else options.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    (options.querySelector('button[aria-current="true"]') || options.firstElementChild)?.focus({preventScroll:true});
}

function closeModuleSubviewDropdown({ trigger, options }) {
    if (options.hidePopover) options.hidePopover();
    else options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (trigger.isConnected && !trigger.disabled) trigger.focus({preventScroll:true});
}

function chooseModuleSubview(picker, event) {
    const option = event.target.closest('[data-module-subview-value]');
    if (!option || !picker.options.contains(option)) return;
    const selection = { ...(picker.openScope || moduleSubviewScope()), value: option.dataset.moduleSubviewValue };
    picker.pending = selection;
    updateModuleSubviewTrigger(picker, selection.value);
    picker.options.style.visibility = 'hidden';
    picker.trigger.setAttribute('aria-expanded', 'false');
    picker.trigger.setAttribute('aria-busy', 'true');
    requestAnimationFrame(() => setTimeout(() => dispatchModuleSubview(picker, selection), 0));
}

function moduleSubviewScope() {
    return {scope:getSupabaseReadIdentityScope(), view:getCurrentVisibleViewId(), navigation:navTransitionSeq};
}

function dispatchModuleSubview(picker, selection) {
    if (picker.pending !== selection) return;
    picker.pending = null;
    picker.openScope = null;
    picker.options.style.removeProperty('visibility');
    const active = picker.trigger.isConnected && selection.scope === getSupabaseReadIdentityScope()
        && selection.view === getCurrentVisibleViewId() && selection.navigation === navTransitionSeq;
    try {
        closeModuleSubviewDropdown(picker);
        if (active && picker.choices.some(([key]) => key === selection.value)) picker.select(selection.value);
        else updateModuleSubviewTrigger(picker, picker.value);
    } finally {
        if (!picker.pending) picker.trigger.removeAttribute('aria-busy');
    }
}

function paintModuleSubviewOptions(picker, choices, value) {
    const signature = JSON.stringify([choices, value]);
    if (picker.signature === signature) return;
    picker.signature = signature;
    const focused = picker.options.contains(document.activeElement) ? document.activeElement.dataset.moduleSubviewValue : null;
    const buttons = choices.map(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.moduleSubviewValue = key;
        button.textContent = label;
        if (key === value) button.setAttribute('aria-current', 'true');
        return button;
    });
    picker.options.replaceChildren(...buttons);
    if (focused !== null) buttons.find(button => button.dataset.moduleSubviewValue === focused)?.focus({preventScroll:true});
}

function mountModuleButtonSubview(source, selector, keyFor, valueFor, { phase, available = () => true } = {}) {
    if (!source || source.hasAttribute('data-module-subview-source')) return;
    const host = document.createElement('div');
    host.dataset.moduleSubviewRail = '';
    source.before(host);
    source.dataset.moduleSubviewSource = '';
    const refresh = () => {
        host.hidden = !available();
        const buttons = [...source.querySelectorAll(selector)].filter(button => !button.disabled && !button.hidden);
        const entries = new Map(buttons.map(button => [keyFor(button), button]));
        const choices = [...entries].map(([key, button]) => [key, [...button.childNodes].map(node => node.textContent.trim()).filter(Boolean).join(' · ').replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')]);
        mountModuleSubviewDropdown(host, { choices, value: valueFor(buttons), select: key => { entries.get(key)?.click(); refresh(); } });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(source, { subtree:true, childList:true, attributes:true,
        attributeFilter:['aria-pressed', 'class', 'disabled', 'hidden'] });
    if (phase) observer.observe(phase, { attributes:true, attributeFilter:['data-studio-phase'] });
}

function closeActiveModuleSubview() {
    const selector = '[data-module-subview-options]';
    const options = document.querySelector(selector + ':not([popover]):not([hidden])')
        || (CSS.supports('selector(:popover-open)') && document.querySelector(selector + ':popover-open'));
    const trigger = options?.previousElementSibling;
    if (!trigger) return false;
    closeModuleSubviewDropdown({trigger, options});
    return true;
}

function syncBloomscapesLegacySubview(view) {
    const root = document.getElementById('view-' + view);
    if (view === 'sales' || view === 'sales-office') {
        mountModuleButtonSubview(root?.querySelector('[data-marketing-studio] [data-studio-modules]'),
            '[data-sales-section]', button => button.dataset.salesSection,
            buttons => buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.salesSection);
    }
    if (view === 'reports') {
        mountModuleButtonSubview(root?.querySelector('.detail-tabs:has(.report-tab)'), '.report-tab',
            button => button.id.slice(5), () => activeReportTab);
    }
    if (view === 'moves') {
        mountModuleButtonSubview(root?.querySelector('#moves-office-tab-strip'), 'button',
            button => button.id.slice('moves-office-tab-'.length), () => activeInventoryOfficeApprovalType,
            { available: () => activeMovesTab === 'office' });
    }
    if (view === 'production') {
        const studio = root?.querySelector('[data-bloomscapes-studio]');
        const phase = studio?.querySelector('[data-studio-module]');
        mountModuleButtonSubview(studio?.querySelector('[data-studio-modules]'), '[data-open-module]',
            button => button.dataset.openModule, () => phase?.dataset.studioPhase, {phase});
    }
}

function mountHistoricalArchiveSubview(root) {
    mountModuleButtonSubview(root?.querySelector('.historical-archive__tabs'), 'button',
        button => button.textContent.trim(), buttons => buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.textContent.trim());
}

globalThis.GncHistoricalArchiveSubview = mountHistoricalArchiveSubview;

function syncManagerModuleSubview(container, {access, managerApprovalTabs, managerToolTabs}) {
    const host = document.getElementById('manager-subview-rail');
    if (!host || !container.parentElement.contains(host)) return;
    const options = getManagerModuleOptions(access, managerApprovalTabs, managerToolTabs)
        .filter(option => option.id === MANAGER_ACCESS_CONTROL_VIEW || !getManagerTableManagementKey(option.id));
    const choices = [['dashboard', 'Manager Modules'], ...options.map(option => [option.id,
        option.label || getManagerModuleMeta(option.id).label])];
    mountModuleSubviewDropdown(host, {choices, value:activeHomeTab, select:setHomeTab});
}
