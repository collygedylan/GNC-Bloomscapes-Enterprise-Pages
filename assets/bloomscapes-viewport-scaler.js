let bloomscapesViewportDisposer = null;

function detectBloomscapesViewport(width, height, touch = false) {
    const tabletPortrait = width >= 768 && height > width;
    const mode = width < 640 ? 'phone-portrait' : width >= 1200 ? 'desktop'
        : width >= 900 || tabletPortrait ? 'tablet' : 'phone-landscape';
    return {width,height,mode,touch,aspect:width / Math.max(1,height),
        orientation:width > height ? 'landscape' : 'portrait',
        scale:Math.max(.85,Math.min(1.15,width / 1200)),
        cardCols:width < 640 ? 1 : width < 1100 ? 2 : width < 1600 ? 3 : 4,
        filterCols:Math.max(1,Math.floor((width - 16) / 111))};
}

function mountBloomscapesViewportScaler() {
    if (bloomscapesViewportDisposer) return;
    const root = document.documentElement;
    const pointer = matchMedia('(pointer: coarse)');
    let frame = 0;
    const paint = () => {
        frame = 0;
        const viewport = window.visualViewport;
        const state = detectBloomscapesViewport(Math.round(viewport?.width || innerWidth),
            Math.round(viewport?.height || innerHeight),pointer.matches);
        const values = {'--app-vw':state.width+'px','--app-vh':state.height+'px',
            '--ui-scale':state.scale,'--card-cols':state.cardCols,'--filter-cols':state.filterCols,
            '--app-aspect':state.aspect,'--nav-label-size':Math.max(8,Math.min(12,state.width / 45))+'px'};
        for (const [key,value] of Object.entries(values)) root.style.setProperty(key,String(value));
        Object.assign(root.dataset,{viewportMode:state.mode,orientation:state.orientation,pointerMode:state.touch?'touch':'pointer'});
        if (typeof scheduleHomeDashboardFit === 'function') scheduleHomeDashboardFit('viewport-scaler');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    window.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    pointer.addEventListener('change',schedule);
    bloomscapesViewportDisposer = () => {
        observer.disconnect();cancelAnimationFrame(frame);
        window.removeEventListener('resize',schedule);
        window.visualViewport?.removeEventListener('resize',schedule);
        pointer.removeEventListener('change',schedule);
        bloomscapesViewportDisposer = null;
    };
    window.addEventListener('pagehide',() => {
        bloomscapesViewportDisposer?.();
        window.addEventListener('pageshow',mountBloomscapesViewportScaler,{once:true});
    },{once:true});
    paint();
}
