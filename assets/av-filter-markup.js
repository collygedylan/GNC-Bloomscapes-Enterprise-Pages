/** @param {HTMLElement} container Mounted controls. @returns {boolean} Whether the compact AV controls were mounted. */
function ensureAvTopControlsShell(container) {
    if (!container) return false;
    ensureAvControlsVisible(container);
    const shellSignature = 'av-top-controls-shell:v20';
    if (container.dataset.avTopControlsShell === shellSignature) {
        ensureAvControlsVisible(container);
        return false;
    }
    container.dataset.avTopControlsShell = shellSignature;
    setContainerHtml(container, buildAvRailMarkup());
    ensureAvControlsVisible(container);
    return true;
}

function buildAvRailMarkup() {
    return `<div id="av-filter-options" class="av-top-controls-row">${buildAvRailStockField()}${buildAvRailViewFields()}
        <section class="inventory-excel-bar" data-inventory-excel-scope="av"></section></div>
        <details data-av-more><summary>More</summary><div id="av-toolbar-primary">
            <button type="button" id="av-valid-photos" aria-pressed="false" onclick="return toggleAvValidPhotos()">📸 Valid Photos</button>
            <button type="button" id="av-kiosk-toggle" class="ui-action" aria-pressed="false" onclick="return toggleAvToolbarKioskMode(this)">Kiosk Mode</button>
        </div></details>`;
}

function buildAvRailStockField() {
    return `            <div class="task-top-control-shell av-filter-shell rounded-[1.05rem] border border-emerald-100 bg-white/96 shadow-sm" data-av-filter-shell="source">
                <button type="button" data-role="button" ${buildExcelFilterFastAttrs('toggleAvSourceDropdown')}>
                    <i class="ph-bold ph-calendar-blank text-sm"></i>
                    <span class="flex min-w-0 flex-1 flex-col leading-none">
                        <span class="task-top-control-title truncate">Stock</span>
                        <span class="task-top-control-summary truncate" data-role="summary">Season</span>
                    </span>
                    <i class="ph-bold ph-caret-down text-xs opacity-70 transition-transform" data-role="caret"></i>
                </button>
                <div class="task-top-control-panel excel-filter-panel excel-filter-panel--viewport-safe av-excel-filter-panel mt-2 hidden overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm" data-role="panel"><div data-role="body"></div></div>
            </div>`;
}

/** @param {HTMLButtonElement} button Toolbar button. @returns {void} Updates the button caption and pressed state. */
function syncAvToolbarKioskButton(button) {
    if (!button) return;
    const active = window.__agdataAvKioskState?.active === true;
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '✓ Kiosk Mode ON · Exit Kiosk Mode' : 'Kiosk Mode';
}

/** @param {HTMLButtonElement} button Toolbar button. @returns {boolean} The click handler result. */
function toggleAvToolbarKioskMode(button) {
    syncAvKioskMode(window.__agdataAvKioskState?.active !== true);
    syncAvToolbarKioskButton(button);
    renderAV();
    return false;
}

function buildAvRailViewFields() {
    return '<label class="bloomscapes-compact-select av-filter-shell" data-av-filter-shell="season"><span>View</span>'
        +'<select data-av-view-select aria-label="AV View" onchange="return setAvPhotoMode(this.value)">'
        +'<option value="all">All Rows</option><option value="valid_photos">Photos</option></select></label>';
}

/** @param {HTMLElement} container Mounted controls. @param {string} shellName Filter control key. @param {object} config Options supplied by the caller. @returns {void} Paints the matching control in the mounted AV toolbar. */
function syncAvTopControlShell(container, shellName, config = {}) {
    if (!container) return;
    const shell = container.querySelector(`[data-av-filter-shell="${shellName}"]`);
    if (shellName==='season') {
        const select = shell?.querySelector('[data-av-view-select]');
        if (select) select.value = getAvPhotoMode();
        return;
    }
    if (!shell) return;
    shell.classList.toggle('hidden', !!config.hidden);
    shell.classList.toggle('av-filter-shell--open', !!config.open);
    const button = shell.querySelector('[data-role="button"]');
    if (button && config.buttonClass) setNodeClassNameIfChanged(button, config.buttonClass);
    const summary = shell.querySelector('[data-role="summary"]');
    if (summary) setNodeTextIfChanged(summary, config.summary || '');
    const caret = shell.querySelector('[data-role="caret"]');
    if (caret) caret.classList.toggle('rotate-180', !!config.open);
    const body = shell.querySelector('[data-role="body"]');
    if (body && typeof config.bodyHtml === 'string') {
        setContainerHtmlWithSignature(body, config.bodyHtml, config.bodySignature || `${shellName}:${config.open ? 'open' : 'closed'}`);
    }
    const panel = shell.querySelector('[data-role="panel"]');
    const hasBodyContent = !!(body && String(body.innerHTML || '').trim());
    if (panel) {
        button?.setAttribute('aria-expanded', String(!!config.open));
        panel.classList.toggle('hidden', !config.open || !hasBodyContent);
        if (config.open && hasBodyContent) positionAvTopControlFloatingPanel(shellName, shell, panel, button);
        else clearAvTopControlFloatingPanel(panel);
    }
}

/** @param {HTMLElement} panel Floating controls panel. @returns {void} Releases the floating panel position. */
function clearAvTopControlFloatingPanel(panel) {
    if (!panel) return;
    if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover();
    panel.classList.remove('av-excel-filter-panel--floating');
    for (const property of ['left', 'top', 'width', 'max-height']) {
        panel.style.removeProperty('--av-filter-panel-' + property);
    }
}

function getAvTopControlFloatingPanelBaseWidth(shellName) {
    const widths = { source: 272, season: 224, contsize: 292, hold: 232, genus: 316, salesrep: 336, customer: 360 };
    return widths[shellName] || 288;
}

/** @param {string} shellName Filter control key. @param {HTMLElement} shell Owning filter shell. @param {HTMLElement} panel Floating controls panel. @param {HTMLButtonElement} button Toolbar button. @returns {void} Positions the expanded panel beside its button. */
function positionAvTopControlFloatingPanel(shellName, shell, panel, button) {
    const rect = button?.getBoundingClientRect?.();
    if (!shell || !panel || !rect?.width || !Number.isFinite(rect.bottom)) {
        clearAvTopControlFloatingPanel(panel);
        return;
    }
    const viewportWidth = Math.max(320, Math.round(window.innerWidth || document.documentElement.clientWidth || 0));
    const viewportHeight = Math.max(320, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
    const gutter = 12;
    const width = Math.min(viewportWidth - 2 * gutter, Math.max(Math.round(rect.width), getAvTopControlFloatingPanelBaseWidth(shellName)));
    const top = Math.max(gutter, Math.round(rect.bottom + 8));
    const left = Math.max(gutter, Math.min(rect.left, viewportWidth - width - gutter));
    const height = Math.max(180, Math.min(520, viewportHeight - top - gutter));
    panel.classList.add('av-excel-filter-panel--floating');
    panel.style.setProperty('--av-filter-panel-left', left + 'px');
    panel.style.setProperty('--av-filter-panel-top', top + 'px');
    panel.style.setProperty('--av-filter-panel-width', width + 'px');
    panel.style.setProperty('--av-filter-panel-max-height', height + 'px');
    if (panel.isConnected && typeof panel.showPopover === 'function' && !panel.matches(':popover-open')) {
        panel.setAttribute('popover', 'manual');
        panel.showPopover();
    }
}
