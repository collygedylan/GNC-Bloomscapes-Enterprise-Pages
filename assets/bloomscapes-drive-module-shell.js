const driveTourModes = new Map([['name', 'Common Name'], ['loc', 'Block / Location']]);
const driveTourOptions = new WeakMap();

function isBloomscapesDriveTour() {
    if (!nativeAuthSessionActive) return false;
    const role = borrowedHelpPreview()?.role || nativeAuthProfile?.role;
    return ['rep', 'sales_rep'].includes(role);
}

function normalizeBloomscapesDriveTourTab(tab) {
    return driveTourModes.has(tab) ? tab : 'name';
}

function syncBloomscapesDriveTourToolbar(rail, mode) {
    const active = isBloomscapesDriveTour();
    rail.closest('#view-drive')?.classList.toggle('drive-tour', active);
    if (!mode) return;
    const original = driveTourOptions.get(mode);
    if (active && !original) {
        driveTourOptions.set(mode, [...mode.options]);
        mode.replaceChildren(...[...driveTourModes].map(([value, label]) => new Option(label, value)));
    } else if (!active && original) {
        mode.replaceChildren(...original);
        driveTourOptions.delete(mode);
    }
    if (active) mode.value = normalizeBloomscapesDriveTourTab(activeDriveTab);
    else if (original) mode.value = activeDriveTab;
}

const moduleSearchSelectors = {
    reports: '[data-report-query], input[aria-label="Search report inventory"]',
    managers: '[data-report-query], [data-directory-query], [data-manager-table-search]',
    'inv-consolidation': '#inv-consolidation-search',
    'field-work-studio': '[data-work-search]',
    production: '[data-work-search]',
    'borrowed-work': '[data-loan-search]',
    'time-cards': '[data-timecard-search]',
    timecards: '[data-timecard-search]',
    'historical-requests': '.historical-archive__search input',
    'request-history': '.historical-archive__search input',
    tasks: '[data-flyer-archive-search]',
    messages: '[data-message-search], [data-comm-search]',
    docks: '[data-docks-search]',
    communication: '[data-comm-search]'
};

function matchesBloomscapesModuleSearch(value, fields) {
    const text = fields.join(' ').toLowerCase().replaceAll('_',' ');
    return String(value || '').toLowerCase().trim().split(/\s+/).every(term => text.includes(term));
}

const archiveSearchViews = new Set(['historical-requests', 'request-history']);
let activeModuleSearch;

function createModuleSearch(view, origin) {
    const host = document.createElement('div');
    host.id = 'drive-module-header-search-' + view;
    const input = host.appendChild(document.createElement('input'));
    input.type = 'search';
    input.className = 'input-field';
    input.value = origin?.value || '';
    input.placeholder = origin?.placeholder || 'Search completed requests…';
    input.setAttribute('aria-label', origin?.getAttribute('aria-label') || input.placeholder);
    input.autocomplete = 'off';
    input.enterKeyHint = 'search';
    if (origin) origin.hidden = true;
    input.addEventListener('input', () => {
        const source = activeModuleSearch?.host === host ? activeModuleSearch.origin : null;
        if (!source) return;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        valueSetter?.call(source,input.value);
        source.dispatchEvent(new Event('input', {bubbles:true}));
    });
    document.getElementById('view-' + view)?.prepend(host);
    return {view, host, input, origin};
}

function getBloomscapesDriveModuleSearch(view) {
    const selector = moduleSearchSelectors[view];
    const root = document.getElementById('view-' + view);
    if (!root || (!selector && !archiveSearchViews.has(view))) return null;
    const active = activeModuleSearch;
    const inputs = selector ? [...root.querySelectorAll(selector)] : [];
    const origin = inputs.find(input => input === active?.origin || !input.closest('[hidden],.hidden'));
    if (active?.view === view && active.host.isConnected) {
        if (active.origin !== origin) {
            if (active.origin) active.origin.hidden = false;
            active.origin = origin;
            if (origin) origin.value = active.input.value;
        }
        if (origin) origin.hidden = true;
        return active.host;
    }
    if (active) {
        if (active.origin) active.origin.hidden = false;
        active.host.remove();
        activeModuleSearch = undefined;
    }
    if (!origin && !archiveSearchViews.has(view)) return null;
    activeModuleSearch = createModuleSearch(view, origin);
    return activeModuleSearch.host;
}

function clearBloomscapesDriveModuleSearch(view) {
    if (!activeModuleSearch || activeModuleSearch.view === view) return;
    const {host, origin} = activeModuleSearch;
    if (origin) origin.hidden = false;
    host.remove();
    activeModuleSearch = undefined;
}

function syncBloomscapesFooterCaption(button, view) {
    const label = {home:'Home', drive:'Drive', av:'AV', 'historical-requests':'Historical',
        'request-history':'Historical', messages:'Messages', menu:'Menu'}[view];
    const caption = button.querySelector('span:not(.footer-nav-badge)');
    if (label && caption && !caption.children.length && caption.textContent !== label) caption.textContent = label;
}

function mountHistoricalArchiveSubview(root) {
    const tabs = root?.querySelector('.historical-archive__tabs');
    const completed = tabs?.querySelector('[data-archive-tab="requests"]');
    if (completed && completed.textContent !== 'Completed Requests') completed.textContent = 'Completed Requests';
    mountModuleButtonSubview(tabs, 'button',
        button => button.textContent.trim(), buttons => buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.textContent.trim());
    if (root?.closest('#app-wrapper')) syncGlobalHeaderChrome({reason:'historical-module-search',force:true});
}

globalThis.GncHistoricalArchiveSubview = mountHistoricalArchiveSubview;


function bloomscapesSalesRepRoute(view, profile, preview) {
    if (view === 'docks') return ['FULL_EDIT','VIEW_ONLY'].includes(profile.area_access?.['dock-credit-vault']);
    if (!['drive','tasks','flyer'].includes(view)) return false;
    const area = view === 'drive' ? 'drive' : 'sales-flyer';
    const flag = view === 'drive' ? 'view_drive_mode' : 'view_flyers';
    if (preview) return profile.area_access?.[area] === 'VIEW_ONLY';
    const matrix = resolveUserAccessMatrix(profile.username);
    return matrix?.verified === true && matrix.view_permissions?.[flag] === 'Y';
}
