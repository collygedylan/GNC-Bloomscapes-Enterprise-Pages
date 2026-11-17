function getInventoryExcelPopoverHost(scope, create = false) {
    let host = document.getElementById(scope + '-excel-popover');
    if (host || !create) return host;
    host = document.createElement('div');
    host.id = scope + '-excel-popover';
    host.className = 'inventory-excel-portal';
    host.hidden = true;
    if (typeof host.showPopover === 'function') host.setAttribute('popover', 'auto');
    document.body.appendChild(host);
    document.addEventListener('pointerdown', event => {
        if (!host.hidden && !host.contains(event.target) && !host.anchor?.contains(event.target)) closeInventoryExcelPopover(scope);
    }, { passive: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeInventoryExcelPopover(scope);
    });
    window.addEventListener('scroll', event => {
        if (host.hidden || host.contains(event.target)) return;
        const rect = host.anchor?.getBoundingClientRect?.();
        if (!rect || Math.abs(rect.left - host.anchorLeft) > 1 || Math.abs(rect.top - host.anchorTop) > 1) closeInventoryExcelPopover(scope);
    }, { capture: true, passive: true });
    window.addEventListener('resize', () => {
        if (!host.hidden) positionDriveExcelPopover(host, host.anchor);
    }, { passive: true });
    return host;
}
function positionDriveExcelPopover(host,anchor) {
    const rect=anchor?.getBoundingClientRect?.() || {left:8,bottom:100},width=Math.min(340,window.innerWidth-16);
    host.anchor=anchor;host.anchorLeft=rect.left;host.anchorTop=rect.top;host.style.width=width+'px';host.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
    host.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-180))+'px';
    host.hidden=false;if(typeof host.showPopover==='function' && !host.matches(':popover-open'))host.showPopover();
}
function closeInventoryExcelPopover(scope) {
    const host=getInventoryExcelPopoverHost(scope);if(!host)return false;
    if(host.classList.contains('inventory-excel-portal')){if(typeof host.hidePopover==='function' && host.matches(':popover-open'))host.hidePopover();host.hidden=true;host.anchor=null;}
    host.replaceChildren();return false;
}

