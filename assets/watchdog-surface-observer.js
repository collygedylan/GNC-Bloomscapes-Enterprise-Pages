/**
 * @param {object} env
 * @param {Function} inspect
 * @param {Function} onFailure
 * @returns {Function} Single-flight inspection scheduler.
 */
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

/**
 * @param {HTMLDocument} doc
 * @param {unknown} observer
 * @param {Function} active
 * @returns {void} Binds the observer to active operational surfaces.
 */
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

/**
 * @param {string} selector
 * @param {Function} visible
 * @param {Function} report
 * @param {string} owner
 * @returns {Function} Inspector for visible operational error banners.
 */
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

/**
 * @param {HTMLDocument} doc
 * @param {object} Observer
 * @param {object} view
 * @param {Function} enabled
 * @param {string} selector
 * @param {Function} inspect
 * @param {Function} schedule
 * @returns {unknown} Installed surface observer and lifecycle result.
 */
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
