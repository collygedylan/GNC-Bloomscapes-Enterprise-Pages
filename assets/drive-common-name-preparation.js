function appendDriveCommonNameHtml(pending, html, firstBatch) {
    const template = pending.container.ownerDocument.createElement('template');
    template.innerHTML = html;
    pending.fragment.appendChild(template.content);
    if (firstBatch) pending.container.replaceChildren(pending.fragment);
    else pending.container.appendChild(pending.fragment);
}

function updateDriveCommonNameProgress(pending, total) {
    const progress = pending.container.querySelector('[data-drive-commonname-progress]');
    if (progress) progress.textContent = `${pending.index} of ${total} names`;
}

function runDriveCommonNameBatch(options) {
    const { pending, entries, renderEntry } = options;
    if (!options.isCurrent()) {
        options.onStale();
        return;
    }
    try {
        const started = performance.now();
        const batchSize = 40;
        const budgetMs = pending.index === 0 ? 16 : 8;
        let html = '', count = 0;
        while (pending.index < entries.length && count < batchSize
            && (count === 0 || performance.now() - started < budgetMs)) {
            html += renderEntry(entries[pending.index++]);
            count += 1;
        }
        const firstBatch = pending.index === count;
        (options.appendHtml || appendDriveCommonNameHtml)(pending, html, firstBatch);
        (options.updateProgress || updateDriveCommonNameProgress)(pending, entries.length);
        if (pending.index < entries.length) {
            pending.frame = (options.requestFrame || requestAnimationFrame)(() => runDriveCommonNameBatch(options));
            return;
        }
        if (!options.isCurrent()) return;
        const countRendered = options.getRenderedCount
            ? options.getRenderedCount() : pending.container.querySelectorAll('[role="button"]').length;
        if (countRendered !== entries.length) throw new Error('The complete Common Name list could not be prepared. Please retry.');
        options.onComplete();
    } catch (error) {
        options.onError(error);
    }
}

function prepareDriveCommonNameBatches(options = {}) {
    const callbacks = ['renderEntry', 'isCurrent', 'onStale', 'onComplete', 'onError'];
    if (!options.pending || !Array.isArray(options.entries)
        || callbacks.some(name => typeof options[name] !== 'function')) {
        throw new TypeError('Drive Common Name preparation requires state, entries and lifecycle callbacks.');
    }
    runDriveCommonNameBatch(options);
    return options.pending;
}

(function (root, api) {
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.GncDriveCommonNamePreparation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this,
    Object.freeze({ prepareDriveCommonNameBatches }));

function mountDriveCompleteNameWindow(container,entries,renderEntry,renderKey) {
    if (!window.GncCardWindow) return false;
    if (getCurrentVisibleViewId() !== 'drive') return true;
    cancelDriveCommonNamePreparation();
    renderInventoryCardWindow(container,entries,renderEntry,{
        view:'drive',signature:renderKey,estimatedHeight:110,progressive:true
    });
    container.dataset.driveRenderKey = renderKey;
    container.dataset.driveCommonnameState = 'complete';
    container.dataset.driveCommonnameCount = String(entries.length);
    container.setAttribute('aria-busy','false');
    return true;
}

function renderDriveCompleteCommonNames(container, crumb, crumbText, entries, renderEntry, renderKey) {
    ensureDriveToolbarControls();
    syncDriveCrumb(crumb, crumbText);
    if (mountDriveCompleteNameWindow(container,entries,renderEntry,renderKey)) return;
    if (container.dataset.driveRenderKey === renderKey && container.dataset.driveCommonnameState === 'complete') return;
    if (driveCommonNamePreparation?.renderKey === renderKey && isDriveCommonNamePreparationCurrent(driveCommonNamePreparation)) return;
    if (productionLiveSyncRendering && productionLiveSyncActiveRender && entries.length
        && container.dataset.driveCommonnameState === 'complete') {
        return stageDriveCommonNamesDuringRefresh(container,crumb,crumbText,entries,renderEntry,renderKey);
    }
    cancelChunkRenderWorkForContainer(container, 'drive:name:list');
    const token = bumpChunkRenderTokenByKey('drive:name:list');
    delete container.dataset.driveRenderKey;
    // Keep the current cards until the first replacement batch is ready.
    setContainerChunkRenderState(container, 'drive:name:list', token);
    container.dataset.driveCommonnameState = 'preparing';
    const status = getProductionLiveSyncCoordinator()?.getStatus();
    if (status) renderProductionDataFreshness(status);
    container.setAttribute('aria-busy', 'true');
    setContainerUiState(container, 'loading');
    const pending = { container, renderKey, token, index: 0, frame: 0, fragment: document.createDocumentFragment(),
        native: canUseProductionLiveSync(), proof: productionVerifiedViewKey(), generation: productionLiveSyncReadGeneration,
        selection: getDriveDrillSelectionStateKey(), search: String(document.getElementById('drive-search')?.value || ''),
        filterKey: driveVisibleItemsStateCacheKey, user: String(currentUser || ''), role: String(currentRole || '') };
    driveCommonNamePreparation = pending;
    window.GncDriveCommonNamePreparation.prepareDriveCommonNameBatches({
        pending, entries, renderEntry,
        isCurrent: () => isDriveCommonNamePreparationCurrent(pending),
        onStale: () => recoverStaleDriveCommonNamePreparation(pending),
        onComplete: () => completeDriveCommonNamePreparation(pending, entries),
        onError: error => failDriveCommonNamePreparation(pending, error)
    });
}

function stageDriveCommonNamesDuringRefresh(container,crumb,crumbText,entries,renderEntry,renderKey) {
    return stageProductionRefreshList('drive:name:list', container, crumb, entries, crumbText, renderEntry, {
        renderSignature: renderKey, initialRows: 40, chunkSize: 40, perFrameRows: 40,
        verifyRowSelector: '[role="button"]',
        onComplete: () => {
            container.dataset.driveRenderKey = renderKey;
            container.dataset.driveCommonnameState = 'complete';
            container.dataset.driveCommonnameCount = String(entries.length);
            container.setAttribute('aria-busy', 'false');
            setContainerUiState(container, 'content');
        }
    });
}

const DRIVE_CARD_CHUNK_SIZE = 60;

function appendDriveCardChunk(state, replace = false) {
    const start = state.end;
    const end = Math.min(start+DRIVE_CARD_CHUNK_SIZE,state.rows.length);
    const template = state.container.ownerDocument.createElement('template');
    const prefix = replace ? state.options.prefixHtml || '' : '';
    const body = getCanonicalDriveProjection(state.rows,'drive-chunk:'+state.signature+':'+start,
        ()=>state.rows.slice(start,end).map(state.renderRow).join(''));
    template.innerHTML = prefix+body;
    state.end = end;
    state.container.dataset.driveChunkCount = String(end);
    if (replace) state.container.replaceChildren(template.content,state.sentinel);
    else state.sentinel.before(template.content);
    if (end === state.rows.length) finishDriveCardChunks(state);
    hydrateDriveCardChunk(state,start,end);
}

function finishDriveCardChunks(state) {
    state.observer?.disconnect();
    if (state.options.footerHtml) state.sentinel.insertAdjacentHTML('beforebegin',state.options.footerHtml);
    state.sentinel.remove();
}

function hydrateDriveCardChunk(state,start,end) {
    requestAnimationFrame(()=>{
        if (!state.isCurrent()) return;
        const ids = state.rows.slice(start,end).map(row=>row.DOM_ID).filter(Boolean);
        if (ids.length) refreshCartButtons(ids);
        refreshInventoryCardWindowPhotos(state.container,'drive');
    });
}

function connectDriveCardChunks(state) {
    if (state.end === state.rows.length || state.observer || !state.isCurrent()) return;
    state.observer = new IntersectionObserver(entries=>{
        if (entries.some(entry=>entry.isIntersecting) && state.isCurrent()) appendDriveCardChunk(state);
    },{root:getMainAreaScrollTarget(),rootMargin:'900px 0px'});
    state.observer.observe(state.sentinel);
}

function mountDriveCardChunks(container,rows,renderRow,options,signature,scope) {
    if (typeof IntersectionObserver !== 'function' || !rows.length) return false;
    const sentinel = container.ownerDocument.createElement('span');
    sentinel.dataset.driveChunkSentinel = '';
    sentinel.style.cssText = 'grid-column:1 / -1;display:block;height:1px';
    sentinel.setAttribute('aria-hidden','true');
    const state = {container,rows,renderRow,options,signature,scope,sentinel,end:0,disposed:false,
        isCurrent:()=>!state.disposed && container.__gncCardWindow===state && container.isConnected
            && getCurrentVisibleViewId()==='drive' && getSupabaseReadIdentityScope()===scope,
        refresh:()=>connectDriveCardChunks(state),destroy:()=>state.dispose(),
        dispose:()=>{
            state.disposed = true;
            state.observer?.disconnect();
            delete container.dataset.driveChunkCount;
            if (container.__gncCardWindow === state) delete container.__gncCardWindow;
        }};
    container.__gncCardWindow?.dispose();
    container.__gncCardWindow = state;
    appendDriveCardChunk(state,true);
    connectDriveCardChunks(state);
    return true;
}
