function inspectWatchdogFooter(view, doc, report) {
    const nav = doc.getElementById('bottom-nav');
    if (!nav) return report('UI_GEOMETRY_ANOMALY','navigation','FOOTER_MISSING');
    const viewport = view.visualViewport;
    const bottom = viewport?.height ? viewport.offsetTop + viewport.height : Math.max(view.innerHeight || 0,doc.documentElement?.clientHeight || 0);
    const editing = ['detail-measurement-keyboard-open','keyboard-open','measurement-keyboard-open'].some(key => doc.body?.classList?.contains(key))
        || (doc.activeElement?.matches?.('input,textarea,[contenteditable=true]') && viewport && viewport.height < view.innerHeight - 80);
    const style = view.getComputedStyle?.(nav);
    if (editing || style?.position === 'fixed' && parseFloat(style.bottom) === 0 || !(nav.getBoundingClientRect?.().bottom > bottom + 8)) return;
    nav.style.setProperty('position','fixed','important');
    nav.style.setProperty('bottom','0','important');
    if (nav.getBoundingClientRect().bottom > Math.max(bottom,view.innerHeight) + 8) report('UI_GEOMETRY_ANOMALY','navigation','FOOTER_OFFSCREEN');
}

function inspectWatchdogQueueControls(toolbar, visible) {
    const select = toolbar?.querySelector?.('#que-view-select');
    if (select?.offsetWidth > 0 && visible(select)) {
        const selectable = Array.from(select.options || []).some(option =>
            String(option.value || '').trim() && !option.disabled && !option.hidden);
        return selectable ? '' : 'EMPTY_TABS';
    }
    const tabs = Array.from(toolbar?.querySelectorAll?.('.request-category-chip, [role="tab"]') || [])
        .filter(tab => tab.offsetWidth > 0 && visible(tab));
    if (!tabs.length) return 'EMPTY_TABS';
    return toolbar.clientWidth > 0 && tabs.some(tab => tab.offsetWidth >= toolbar.clientWidth * 0.90) ? 'WIDE_TAB' : '';
}

function watchdogOperationMetadata(operation, error) {
    const safe = value => /^[a-z][a-z0-9_.:-]{0,159}$/i.test(String(value || '')) ? String(value) : '';
    const detail = operation && typeof operation === 'object' ? operation : {};
    const rpcName = safe(detail.rpcName || error?.rpcName);
    const tableName = safe(detail.tableName || error?.tableName);
    const action = safe(detail.action || error?.action || operation);
    const parsedStatus = String(error?.message || error || '').match(/\bHTTP[\s=]+(\d{3})\b/i)?.[1];
    const status = Number(detail.httpStatus || error?.status || parsedStatus || 0);
    const errorCode = String(detail.errorCode || '');
    return { rpcName, tableName, action, errorCode: /^[A-Z0-9_]{1,64}$/.test(errorCode) ? errorCode : '',
        httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0 };
}

function reportWatchdogField(deps, type, scope, code, driveCommand, operation) {
    const { state, FIELD_TYPES, FIELD_SCOPES, FIELD_CODES, view, fieldSeen, MAX_QUEUED_REPORTS, record } = deps;
    if (!state.configured || !state.username || !FIELD_TYPES.has(type) || !FIELD_SCOPES.has(scope) || !FIELD_CODES.has(code)) return false;
    const current = view().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'unknown';
    const command = /^drive-[a-z0-9_-]{8,175}$/i.test(driveCommand) ? driveCommand : '';
    const context = watchdogOperationMetadata(operation);
    const identifiers = [context.rpcName, context.tableName, context.action].filter(Boolean);
    const endpoint = identifiers.length ? ' rpcName=' + context.rpcName + ' tableName=' + context.tableName
        + ' action=' + context.action + ' HTTP=' + context.httpStatus : '';
    const diagnostic = context.errorCode ? ' errorCode=' + context.errorCode : '';
    const key = [state.username, current, scope, type, code, command, endpoint, diagnostic].join('|'), now = Date.now();
    if (fieldSeen.has(key) && now - fieldSeen.get(key) < 60000) return false;
    fieldSeen.delete(key);
    fieldSeen.set(key, now);
    if (fieldSeen.size > MAX_QUEUED_REPORTS) fieldSeen.delete(fieldSeen.keys().next().value);
    record(type, { view_id: current, sub_module: scope, error_message: [type, scope, code].join(':') + endpoint + diagnostic,
        driveCommand: command, suspected_functions: identifiers.length ? identifiers : [scope] });
    return true;
}

function captureWatchdogOperation(deps, error, operation) {
    const { document, state, isIgnorableRuntimeNoise, FIELD_CODES, reportField, record } = deps;
    if (error?.name === 'AbortError' || ['ABORT_ERR', 'REQUEST_ABORTED', 'FARM_PREPARATION_PAUSED'].includes(error?.code)) return false;
    const metadata = watchdogOperationMetadata(operation, error);
    if ((document.hidden || document.visibilityState === 'hidden') && !metadata.httpStatus) return false;
    if (isIgnorableRuntimeNoise(error?.code || error?.message)) return false;
    const owner = metadata.rpcName || metadata.tableName || metadata.action || 'unknown';
    const code = String(error?.code || error?.name || 'Error').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 64);
    if (state.memoryOnly && state.configured) {
        if (metadata.action === 'docks_suspend_sync_guard' || /^gnc_pull_(board|command)$/.test(metadata.rpcName)) metadata.errorCode = code;
        return reportField('RPC_FAILURE', 'rpc', FIELD_CODES.has(code) ? code : 'ERROR', '', metadata);
    }
    record('OPERATIONAL_FAILURE', { severity: 'high', error_message: owner + ' failed (' + code + ') HTTP=' + metadata.httpStatus,
        suspected_functions: [owner] });
    return true;
}

function describeWatchdogRequest(input, init = {}) {
    const url = new URL(String(input?.url || input), globalThis.location?.href || 'https://bloomscapes.app/');
    const rpcName = url.pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)$/i)?.[1] || '';
    const tableName = rpcName ? '' : url.pathname.match(/\/rest\/v1\/([a-z0-9_]+)$/i)?.[1] || '';
    let action = '';
    if (typeof init.body === 'string' && url.pathname.endsWith('/functions/v1/app-api')) {
        try { action = JSON.parse(init.body)?.action || ''; }
        catch { action = 'invalid_json'; }
    }
    return watchdogOperationMetadata({ rpcName, tableName, action });
}

function watchdogFailureCode(value, shown) {
    const sql = value.match(/(?:^|[^a-z0-9])(55P03|42501|P0001)(?![a-z0-9])/i);
    const http = value.match(/\b(?:http|status|returned|rpc)[\s:_(]*([45]\d{2})\b/i);
    if (/lock.*timed? ?out|lock timeout/i.test(value)) return 'LOCK_TIMEOUT';
    if (sql) return sql[1].toUpperCase();
    if (http) return ['400','401','403','409','500','504'].includes(http[1]) ? 'HTTP_' + http[1] : 'ERROR';
    if (/timed?\s*out|timeout/i.test(value)) return 'TIMEOUT';
    if (/remains? locked|unlock not confirmed/i.test(value)) return 'ROW_LOCKED';
    if (/move not saved/i.test(value)) return 'MOVE_NOT_SAVED';
    if (/restricted|forbidden|denied|do not have access|only update rows assigned/i.test(value)) return 'RESTRICTED';
    if (/failed to fetch|networkerror|connection lost/i.test(value)) return 'NETWORK';
    if (!shown && !/could not|failed|\berror\b|DATABASE_/i.test(value)) return '';
    if (/save|write/i.test(value)) return 'SAVE_FAILED';
    if (/load|refresh/i.test(value)) return 'LOAD_FAILED';
    if (/required|invalid/i.test(value)) return '';
    return 'OPERATION_FAILED';
}

function watchdogFailureScope(value, kind, view, scopes) {
    if (/suspend|complete tag/i.test(value)) return 'suspend-tag';
    if (/unlock|row remains locked/i.test(value)) return 'unlock';
    if (/reclass|move not saved/i.test(value)) return 'reclass';
    if (/request/i.test(value)) return 'request';
    if (kind === 'RPC_FAILURE') return 'rpc';
    return scopes.has(view()) ? view() : 'ui';
}

function observeWatchdogError(deps, title, message, shown, kind, driveCommand) {
    const { document, isIgnorableRuntimeNoise, FIELD_SCOPES, view, reportField } = deps;
    const metadata = watchdogOperationMetadata(title, message);
    const label = metadata.rpcName || metadata.tableName || metadata.action || String(title || '');
    const value = (label.slice(0,160) + ' ' + String(message?.message || message || '').slice(0,900)).trim();
    if ((document.hidden || document.visibilityState === 'hidden') && !metadata.httpStatus) return false;
    if (message?.name === 'AbortError' || ['REQUEST_ABORTED','ABORT_ERR','FARM_PREPARATION_PAUSED'].includes(message?.code)) return false;
    if (kind === 'UI_ERROR_BANNER_SHOWN' && !shown) return false;
    if (!value || isIgnorableRuntimeNoise(value)
        || /REQUEST_ABORTED|AbortError|watchdog_(log|list|resolve)_event|resolve_runtime_watchdog_events_v23158/i.test(value)) return false;
    const code = watchdogFailureCode(value, shown);
    if (!code) return false;
    if (kind === 'UI_ERROR_BANNER_SHOWN' && view() === 'docks' && ['OPERATION_FAILED','SAVE_FAILED','LOAD_FAILED'].includes(code)
        && !/could not|cannot|unable|fail|\berror\b|not (?:saved|confirmed|available)/i.test(value)) return false;
    const scope = watchdogFailureScope(value, kind, view, FIELD_SCOPES);
    return reportField(kind, scope, code, driveCommand, metadata);
}

function createWatchdogInspectionScheduler(env, inspect, onFailure) {
    let pending = false;
    const run = () => {
        pending = false;
        try { inspect(); }
        catch { onFailure('watchdog-inspect'); }
    };
    return function() {
        if (pending) return;
        pending = true;
        if (env.requestIdleCallback) env.requestIdleCallback(run,{timeout:200});
        else env.setTimeout(run,80);
    };
}

function bindWatchdogSurfaces(doc,observer,active) {
    if (!doc.body || !active) return;
    const full={childList:true,subtree:true,characterData:true,attributes:true,
        attributeFilter:['class','aria-busy','data-kind','data-loading','data-eval-report-counts-ready','data-eval-report-count']};
    const shallow={childList:true,attributes:true,attributeFilter:['data-current-view','class']};
    observer.disconnect();
    observer.observe(active,full);
    let child=active;
    while (child.parentElement && child!==doc.body) {
        const parent=child.parentElement;
        observer.observe(parent,shallow);
        if (parent.id!=='view-wrapper') observeWatchdogSiblings(parent,child,observer,full);
        child=parent;
    }
}

function observeWatchdogSiblings(parent,child,observer,options) {
    for (const sibling of parent.children) {
        if (sibling!==child && !sibling.matches('script,style,link,template')) observer.observe(sibling,options);
    }
}

function createWatchdogBannerInspector(selector,visible,report,owner) {
    const seen=new WeakMap();
    return function(node) {
        if (!node) return;
        if (!visible(node) || !node.matches?.(selector) || ['success','input-guidance','info','loading','empty'].includes(node.dataset?.kind)) {
            seen.delete(node);
            return;
        }
        if (node.closest?.('#runtime-watchdog-events,#runtime-watchdog-header-badge')) return;
        const value=String(node.textContent || '').trim().slice(0,1024);
        if (!value || (node.getClientRects && !node.getClientRects().length)) return;
        const content=node.firstChild || node, account=owner(), previous=seen.get(node);
        if (previous?.content===content && previous.value===value && previous.owner===account) return;
        seen.set(node,{content,value,owner:account});
        report('',value,true,'UI_ERROR_BANNER_SHOWN',node.dataset?.driveCommand);
    };
}

function installWatchdogSurfaceObserver(doc,Observer,view,enabled,selector,inspect,schedule) {
    let active;
    function refresh(rebind=false) {
        const root=doc.getElementById('view-'+view());
        if (!root || (root===active && !rebind)) return;
        bindWatchdogSurfaces(doc,observer,root);
        active=root;
    }
    const observer=new Observer(records=>{
        if (!enabled()) return;
        refresh(records.some(entry=>entry.type==='childList' && entry.target!==active && entry.target.contains?.(active)));
        for (const entry of records) inspectWatchdogMutation(entry,selector,inspect);
        schedule();
    });
    if (doc.body) observer.observe(doc.body,{attributes:true,childList:true,attributeFilter:['data-current-view']});
    doc.addEventListener?.('DOMContentLoaded',refresh,{once:true});
    refresh();
}

function inspectWatchdogMutation(entry,selector,inspect) {
    const target=entry.target?.nodeType===3 ? entry.target.parentElement : entry.target;
    inspect(target?.closest?.(selector));
    for (const node of entry.addedNodes || []) {
        if (node.nodeType===1 && node.matches?.(selector)) inspect(node);
    }
}
