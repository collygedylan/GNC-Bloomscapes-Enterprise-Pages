function measureHomeDashboardFit() {
    const body = document.body;
    if (!body?.classList.contains('current-view-home') || !body.classList.contains('home-dashboard-mode')
        || ['keyboard-open','detail-field-active','measurement-keyboard-open'].some(name=>body.classList.contains(name))) return null;
    const homeView = document.getElementById('view-home');
    const mainArea = document.getElementById('main-scroll-area');
    const grid = getActiveHomeDashboardGrid();
    if (!homeView || !mainArea || !grid || homeView.classList.contains('hidden')) return null;
    const tiles = [...grid.children].filter(isHomeDashboardTileVisible);
    const main = mainArea.getBoundingClientRect();
    const bounds = grid.getBoundingClientRect();
    const nav = document.getElementById('bottom-nav')?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const bottom = viewport ? Math.round(viewport.offsetTop+viewport.height) : window.innerHeight;
    const availableHeight = Math.max(0,Math.floor(Math.min(main.bottom || bottom,nav?.height ? nav.top : bottom,bottom)-4)-Math.ceil(bounds.top));
    if (!availableHeight || bounds.top<=0) return null;
    return {homeView,profile:getResponsiveViewportProfile(),tileCount:tiles.length,
        gridWidth:Math.floor(bounds.width),availableHeight,expanded:!!grid.dataset.bloomscapesHome};
}

function calculateHomeDashboardFit(input) {
    const {profile,tileCount,gridWidth,availableHeight,expanded} = input;
    const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
    const compact = profile.width<768;
    const columns = expanded ? (compact?3:5) : compact?2:getHomeDesktopColumnCount(tileCount);
    const rows = Math.max(1,Math.ceil(tileCount/columns));
    const minimum = expanded ? 44 : compact?54:72;
    let rowGap = compact?4:12;
    const colGap = compact?4:12;
    const clearance = compact?clamp(Math.round(profile.height*.018),8,18):clamp(Math.round(profile.height*.036),24,48);
    let fitHeight = Math.floor((availableHeight-clearance-rowGap*(rows-1))/rows);
    if (fitHeight<minimum) { rowGap=2;fitHeight=Math.floor((availableHeight-clearance-rowGap*(rows-1))/rows); }
    const height = Math.max(minimum,Math.min(compact?72:104,fitHeight));
    return {columns,rows,rowGap,colGap,clearance,height,fitHeight,minimum,availableHeight,
        width:Math.max(minimum,Math.floor((gridWidth-colGap*(columns-1))/columns)),
        icon:compact?18:clamp(Math.round(height*.3),24,32),label:compact?11:clamp(Math.round(height*.14),12,15),
        gap:compact?3:clamp(Math.round(height*.06),3,6),padding:compact?4:clamp(Math.round(height*.09),6,10)};
}

function applyHomeDashboardFit(homeView,fit,key) {
    if (homeDashboardFitLastKey===key) return true;
    homeDashboardFitLastKey = key;
    const values = {'--home-fit-tile-height':fit.height,'--home-fit-row-gap':fit.rowGap,
        '--home-fit-col-gap':fit.colGap,'--home-fit-card-width':fit.width,'--home-fit-bottom-clearance':fit.clearance,
        '--home-fit-available-height':fit.availableHeight,'--home-phone-tile-height':fit.height,
        '--home-phone-row-gap':fit.rowGap,'--home-phone-col-gap':fit.colGap,'--home-phone-tile-padding-y':fit.padding,
        '--home-phone-tile-gap':fit.gap,'--home-phone-icon-size':fit.icon,'--home-phone-label-size':fit.label};
    for (const [name,value] of Object.entries(values)) homeView.style.setProperty(name,value+'px');
    homeView.style.setProperty('--home-fit-columns',String(fit.columns));
    homeView.dataset.homeFitComplete = String(fit.fitHeight>=fit.minimum);
    homeView.dataset.homeFitColumns = String(fit.columns);
    homeView.dataset.homeFitRows = String(fit.rows);
    homeView.dataset.homeFitClearance = String(fit.clearance);
    return true;
}

function syncHomeDashboardPhoneFit() {
    homeDashboardFitFrame = 0;
    syncHomeDashboardBodyMode(false);
    const input = measureHomeDashboardFit();
    if (!input) { clearHomeDashboardPhoneFit();return false; }
    const fit = calculateHomeDashboardFit(input);
    return applyHomeDashboardFit(input.homeView,fit,JSON.stringify([input.profile.width,input.profile.height,input.tileCount,fit]));
}
