const driveTourModes = new Map([['name', 'Common Name'], ['loc', 'Block / Location']]);
const driveTourOptions = new WeakMap();

/** @returns {boolean} Whether the signed-in user has the sales tour. */
function isBloomscapesDriveTour() {
    if (!nativeAuthSessionActive) return false;
    const role = borrowedHelpPreview()?.role || nativeAuthProfile?.role;
    return ['rep', 'sales_rep'].includes(role);
}

/**
 * @param {string} tab Requested Drive tab.
 * @returns {string} Supported tour tab.
 */
function normalizeBloomscapesDriveTourTab(tab) {
    return driveTourModes.has(tab) ? tab : 'name';
}

/**
 * @param {HTMLElement} rail Mounted toolbar.
 * @param {string} mode Active Drive tour mode.
 * @returns {void} Updates the tour controls for the selected mode.
 */
function syncBloomscapesDriveTourToolbar(rail, mode) {
    const active = isBloomscapesDriveTour();
    rail.closest('#view-drive')?.classList.toggle('drive-tour', active);
    if (!mode) return;
    const original = driveTourOptions.get(mode);
    if (active && !original) {
        driveTourOptions.set(mode, [...mode.options]);
        activeDriveTab = 'name';
        resetDriveDrillSelectionState();
        mode.replaceChildren(...[...driveTourModes].map(([value, label]) => new Option(label, value)));
    } else if (!active && original) {
        mode.replaceChildren(...original);
        driveTourOptions.delete(mode);
    }
    if (active) mode.value = normalizeBloomscapesDriveTourTab(activeDriveTab);
    else if (original) mode.value = activeDriveTab;
}

/** @returns {void} Updates the mounted tour view. */
function syncBloomscapesDriveTourView() {
    const rail = document.getElementById('drive-toolbar-rail');
    if (rail) syncBloomscapesDriveTourToolbar(rail,document.getElementById('drive-mobile-mode'));
}

const moduleSearchSelectors = {
    qc: '[data-photo-ai-header-origin]',
    'disease-pest': '[data-photo-ai-header-origin]',
    reports: '[data-report-query], input[aria-label="Search report inventory"]',
    managers: '[data-report-query], [data-directory-query], [data-nursery-search], [data-schedule-search], [data-managed-table-search], [data-consolidation-query], #transactions-keyed-search',
    'inv-consolidation': '#inv-consolidation-search',
    'field-work-studio': '[data-work-search], [data-studio-menu-search], [data-ph-work-search], [data-ph-water-search]',
    production: '[data-work-search], [data-studio-menu-search], [data-ph-work-search], [data-ph-water-search], [data-schedule-search]',
    'borrowed-work': '[data-loan-search]',
    'time-cards': '[data-timecard-search]',
    timecards: '[data-timecard-search]',
    'historical-requests': '.historical-archive__search input',
    'request-history': '.historical-archive__search input',
    tasks: '[data-flyer-archive-search]',
    sales: '[data-sales-content] input[type="search"]',
    'sales-office': '[data-sales-content] input[type="search"]',
    messages: '[data-message-search], [data-comm-search]',
    docks: '[data-docks-search]',
    communication: '[data-comm-search]'
};

/**
 * @param {string} value Search query.
 * @param {Array} fields Searchable field values.
 * @returns {boolean} Whether every search word matches the supplied fields.
 */
function matchesBloomscapesModuleSearch(value, fields) {
    const text = fields.join(' ').toLowerCase().replaceAll('_',' ');
    return String(value || '').toLowerCase().trim().split(/\s+/).every(term => text.includes(term));
}

const archiveSearchViews = new Set(['historical-requests', 'request-history']);
const earlyModuleSearch = {
    qc: {placeholder:'Search AI photo scans…', input:value => setBloomscapesPhotoAiSearch(value)},
    'disease-pest': {placeholder:'Search AI photo scans…', input:value => setBloomscapesPhotoAiSearch(value)},
    reports: {placeholder:'Search report inventory…', input:value => setLegacyReportHeaderSearch(value)}
};
let activeModuleSearch;

function bindModuleSearchOrigin(owner,origin) {
    if (owner.origin) {
        owner.origin.hidden=false;
        owner.origin.removeEventListener('input',owner.mirror);
    }
    owner.origin=origin;
    if (!origin) return;
    owner.input.value=origin.value;
    owner.input.placeholder=origin.placeholder || owner.input.placeholder;
    owner.input.setAttribute('aria-label',origin.getAttribute('aria-label') || owner.input.placeholder);
    origin.hidden=!origin.hasAttribute('data-directory-query');
    origin.addEventListener('input',owner.mirror);
}

function createModuleSearch(view, origin) {
    const host = document.createElement('div');
    host.id = 'drive-module-header-search-' + view;
    const input = host.appendChild(document.createElement('input'));
    input.type = 'search';
    input.className = 'input-field';
    input.value = origin?.value || '';
    input.placeholder = origin?.placeholder || earlyModuleSearch[view]?.placeholder || 'Search completed requests…';
    input.setAttribute('aria-label', origin?.getAttribute('aria-label') || input.placeholder);
    input.autocomplete = 'off';
    input.enterKeyHint = 'search';
    const owner={view,host,input,origin:null,mirror:()=>{input.value=owner.origin.value;}};
    bindModuleSearchOrigin(owner,origin);
    input.addEventListener('input', () => {
        const source = activeModuleSearch?.host === host ? activeModuleSearch.origin : null;
        if (!source) return earlyModuleSearch[view]?.input(input.value);
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        valueSetter?.call(source,input.value);
        const type=source.hasAttribute('data-directory-query') ? 'directory-query' : 'input';
        source.dispatchEvent(new Event(type, {bubbles:true}));
    });
    document.getElementById('view-' + view)?.prepend(host);
    return owner;
}

/**
 * @param {string} view Selected view identifier.
 * @returns {HTMLElement|null} Search host for the view.
 */
function getBloomscapesDriveModuleSearch(view) {
    if ((view==='qc' || view==='disease-pest') && !bloomscapesPhotoAiHeaderEnabled(view)) return null;
    const selector = moduleSearchSelectors[view];
    const root = document.getElementById('view-' + view);
    if (!root || (!selector && !archiveSearchViews.has(view))) return null;
    const active = activeModuleSearch;
    const inputs = selector ? [...root.querySelectorAll(selector)] : [];
    const origin = inputs.find(input => !input.parentElement?.closest('[hidden],.hidden')
        && (input === active?.origin || !input.hidden || input.hasAttribute('data-ph-work-search')));
    if (active?.view === view && active.host.isConnected) {
        if (active.origin !== origin) bindModuleSearchOrigin(active,origin);
        return active.host;
    }
    if (active) {
        bindModuleSearchOrigin(active,null);
        active.host.remove();
        activeModuleSearch = undefined;
    }
    if (!origin && !archiveSearchViews.has(view) && !earlyModuleSearch[view]) return null;
    activeModuleSearch = createModuleSearch(view, origin);
    return activeModuleSearch.host;
}

/**
 * @param {string} view Selected view identifier.
 * @returns {void} Restores the underlying search input.
 */
function clearBloomscapesDriveModuleSearch(view) {
    if (!activeModuleSearch || activeModuleSearch.view === view) return;
    bindModuleSearchOrigin(activeModuleSearch,null);
    activeModuleSearch.host.remove();
    activeModuleSearch = undefined;
}

/**
 * @param {HTMLButtonElement} button Toolbar button.
 * @param {string} view Selected view identifier.
 * @returns {void} Updates the caption for the footer destination.
 */
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


/**
 * @param {string} view Selected view identifier.
 * @param {object} profile Verified user profile.
 * @param {boolean} preview Whether routing uses the access preview.
 * @returns {boolean} Whether the sales profile may open this route.
 */
function bloomscapesSalesRepRoute(view, profile, preview) {
    if (view === 'docks') return ['FULL_EDIT','VIEW_ONLY'].includes(profile.area_access?.['dock-credit-vault']);
    if (!['drive','tasks','flyer'].includes(view)) return false;
    const area = view === 'drive' ? 'drive' : 'sales-flyer';
    const flag = view === 'drive' ? 'view_drive_mode' : 'view_flyers';
    if (preview) return profile.area_access?.[area] === 'VIEW_ONLY';
    const matrix = resolveUserAccessMatrix(profile.username);
    return matrix?.verified === true && matrix.view_permissions?.[flag] === 'Y';
}

/** @param {Event} event Text input on a mounted view. @returns {void} */
function handleMobileTextEntryInput(event) {
    const target = event && event.target ? event.target : null;
    if (!isMobileTextEntryTarget(target)) return;
    lastTypingAt = Date.now();
    const directoryInput=target.hasAttribute('data-directory-query') ||
        (target===activeModuleSearch?.input && activeModuleSearch.origin?.hasAttribute('data-directory-query'));
    if (directoryInput && !shouldUseMobileTextEntryStabilizer()) return;
    if (!mobileTextEntryState.target) beginMobileTextEntryStability(target);
    const isTextarea = String(target.tagName || '').toUpperCase() === 'TEXTAREA';
    const managedDetailKeyboardInput = !!(
        (typeof isDetailMeasurementKeyboardInput === 'function' && isDetailMeasurementKeyboardInput(target))
        || (typeof isDetailMeasurementKeyboardActiveForInput === 'function' && isDetailMeasurementKeyboardActiveForInput(target))
    );
    extendMobileTextEntryStability(target, { skipVisibilitySettle: true });
    if (!document.body.classList.contains('mobile-text-entry-active')) updateMobileTextEntryBodyState(target);
    if (!isTextarea && !getFastFocusableSearchInput(target) && !managedDetailKeyboardInput && !(isIOSDevice() && isMobileFilterEntryTarget(target))) scheduleMobileTextEntryPostInputSettle(target);
}
