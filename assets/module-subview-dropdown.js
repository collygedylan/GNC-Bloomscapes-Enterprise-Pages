const moduleSubviewPickers = new WeakMap();
function mountModuleSubviewDropdown(host, { label = 'View', choices, value, select, search = '', onOpen, tools = '' }) {
    let picker = moduleSubviewPickers.get(host);
    if (!picker) {
        picker = createModuleSubviewDropdown(host);
        moduleSubviewPickers.set(host, picker);
    }
    Object.assign(picker, { label, choices, value, select, onOpen });
    if (search && !picker.search) addModuleSubviewSearch(picker,search);
    if (tools && !picker.tools) {
        picker.tools = document.createElement("div");
        picker.tools.dataset.moduleSubviewTools = "";
        picker.options.insertBefore(picker.tools,picker.list);
    }
    if (picker.tools) mountModuleSubviewSelect(picker.tools,tools);
    const shown = picker.pending?.value ?? value;
    updateModuleSubviewTrigger(picker, shown);
    picker.trigger.disabled = !choices.length;
    paintModuleSubviewOptions(picker, choices, shown);
    return picker.trigger;
}
function updateModuleSubviewTrigger(picker, value) {
    const selected = picker.choices.find(([key]) => key === value);
    const text = picker.search ? picker.label + ' ▾' : picker.label + ': ' + (selected?.[1] || 'Choose') + ' ▾';
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
    const list = options.appendChild(document.createElement('div'));
    list.dataset.moduleSubviewList = '';
    const picker = { trigger, options, list };
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
    if (picker.search) {
        picker.search.value = '';
        filterModuleSubviewOptions(picker);
    }
    (picker.search || picker.list.querySelector('button[aria-current="true"]') || picker.list.firstElementChild)?.focus({preventScroll:true});
    picker.onOpen?.();
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
    picker.list.replaceChildren(...buttons);
    filterModuleSubviewOptions(picker);
    if (focused !== null) buttons.find(button => button.dataset.moduleSubviewValue === focused)?.focus({preventScroll:true});
}

function addModuleSubviewSearch(picker,label) {
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = label;
    search.setAttribute('aria-label',label);
    picker.options.prepend(search);
    picker.search = search;
    search.oninput = () => filterModuleSubviewOptions(picker);
}

function filterModuleSubviewOptions(picker) {
    if (!picker.search) return;
    const terms = picker.search.value.trim().toLowerCase().split(/\s+/);
    for (const button of picker.list.children) {
        const text = button.textContent.toLowerCase();
        button.hidden = !terms.every(term=>text.includes(term));
    }
}

function mountModuleSubviewSelect(host,settings) {
    host.hidden = !settings;
    if (!settings) {
        host.replaceChildren();
        return;
    }
    if (!host.firstElementChild) {
        const label = host.appendChild(document.createElement('label'));
        label.append(settings.label+' ');
        label.append(document.createElement('select'));
    }
    const select = host.querySelector('select');
    const signature = JSON.stringify(settings.choices);
    if (select.dataset.choices !== signature) {
        select.replaceChildren(...settings.choices.map(([key,title])=>new Option(title,key)));
        select.dataset.choices = signature;
    }
    select.value = settings.value;
    select.onchange = () => settings.select(select.value);
}

function mountModuleButtonSubview(source, selector, keyFor, valueFor, { phase, available = () => true, permitted = () => true } = {}) {
    if (!source || source.hasAttribute('data-module-subview-source')) return;
    const host = document.createElement('div');
    host.dataset.moduleSubviewRail = '';
    source.before(host);
    source.dataset.moduleSubviewSource = '';
    const refresh = () => {
        host.hidden = !available();
        const buttons = [...source.querySelectorAll(selector)].filter(button => !button.disabled && !button.hidden);
        const entries = new Map(buttons.map(button => [keyFor(button), button]).filter(([key]) => permitted(key)));
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
            buttons => buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.salesSection,
            {permitted:key=>allowsBloomscapesAreaSubview('sales-'+key)});
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
            button => button.dataset.openModule, () => phase?.dataset.studioPhase,
            {phase,permitted:canDisplayFieldWorkSubview});
    }
}

function canDisplayFieldWorkSubview(key) {
    if (key === 'water') return typeof phWaterMayOpen === 'function' && phWaterMayOpen();
    return key === 'consolidate' ? canViewFieldWorkConsolidation()
        : allowsBloomscapesAreaSubview(bloomscapesStudioPermission(key));
}

function mountFieldWorkConsolidationSubview(frame) {
    const rail = frame.querySelector('[data-consolidation-subview]');
    const choices = BLOOMSCAPES_STUDIO_PHASES.filter(([key])=>canDisplayFieldWorkSubview(key));
    mountModuleSubviewDropdown(rail,{choices,value:'consolidate',select:key=>{
        if (key !== 'consolidate') openBloomscapesFieldWorkStudio(key);
    }});
}

function syncManagerModuleSubview(container, {access, managerApprovalTabs, managerToolTabs}) {
    const host = document.getElementById('manager-subview-rail');
    if (!host || !container.parentElement.contains(host)) return;
    const options = getManagerModuleOptions(access, managerApprovalTabs, managerToolTabs)
        .filter(option => allowsBloomscapesAreaSubview(bloomscapesAreaManagerKey(option.id)))
        .filter(option => option.id === MANAGER_ACCESS_CONTROL_VIEW || !getManagerTableManagementKey(option.id));
    const choices = [['dashboard', 'Manager Modules'], ...options.map(option => [option.id,
        option.label || getManagerModuleMeta(option.id).label])];
    mountModuleSubviewDropdown(host, {choices, value:activeHomeTab, select:setHomeTab});
}
