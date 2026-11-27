/**
 * @param {string} attribute Delegated data attribute owned by the toolbar.
 * @param {string} action Value dispatched by its click handler.
 * @param {string} label Visible button text.
 * @param {boolean} [pressed] Current selection for toggle buttons.
 * @returns {string} Button markup for a compact operational toolbar.
 */
function renderCompactToolbarButton(attribute,action,label,pressed) {
    const active = pressed == null ? '' : ' aria-pressed="'+Boolean(pressed)+'"';
    return '<button type="button" '+attribute+'="'+esc(String(action))+'"'+active+'>'+esc(String(label))+'</button>';
}

/**
 * @param {object} state Current dispatch form.
 * @returns {object} Crew size and route origin.
 */
function phWorkChosenCrew(state) {
    const id = state.root.querySelector('[data-ph-dispatch-team]').value;
    const team = state.snapshot.teams.find(entry => entry.team_id === id);
    return {hasPartner:Boolean(team ? team.puller_helper : state.draft.helper),origin:team?.previous_dock_zone};
}

/**
 * @param {object|null} load Estimated route metrics.
 * @param {number} fuelDigits Decimal places shown for gallons.
 * @returns {string} Accessible metric pills, or empty markup without a load.
 */
function phBuggyMetricPills(load,fuelDigits = 3) {
    if (!load) return '';
    const values = [
        ['Fuel','⛽ '+load.fuelGal.toFixed(fuelDigits)+' gal'],
        ['Get Load','⏱️ Get Load: '+load.getLoadMin+'m'],
        ['Unload','📦 Unload ('+load.dockLabel+'): '+load.unloadMin+'m'],
        ['Total cycle','🔄 Total: '+load.totalCycleMin+'m'],
        ['Road distance','📏 '+load.miles.toFixed(1)+' mi']
    ];
    return '<div class="ph-load-metrics" data-ph-load-metrics aria-label="Estimated load metrics">'
        +values.map(([label,value]) => '<span title="'+esc(label)+'">'+esc(value)+'</span>').join('')+'</div>';
}

/**
 * @param {object} state Current load selection.
 * @returns {void}
 */
function paintPhSelectedMetrics(state) {
    const rows = state.snapshot.rows.filter(row => state.selected.has(row.pull_tag_id));
    const load = rows.length && phEstimateBuggyLoad(rows,phWorkChosenCrew(state));
    const output = state.root.querySelector('[data-ph-selected-metrics]');
    output.innerHTML = phBuggyMetricPills(load);
    if (rows.length && !load) output.textContent = 'Estimate unavailable for this route.';
}

/**
 * @param {object} row Inventory row or pull tag.
 * @returns {string} Explicit pull side or the side specified in its pick note.
 */
function phPullSideLabel(row) {
    const explicit = row?.PULL_SIDE || row?.pull_side || row?.PULLSIDE || row?.pullside;
    if (explicit) return String(explicit).trim();
    const note = String(row?.PICK_NOTE || row?.PICKNOTE || row?.pick_note || row?.picknote || '');
    return note.match(/\bpull\s+side\s*[:=\-]\s*([^;|\r\n.]{1,64})/i)?.[1].trim() || '';
}

/**
 * @param {object} item Displayed inventory row.
 * @returns {string} Pull side for the active Park Hill row.
 */
function phInventoryPullSide(item) {
    if (typeof getBloomscapesFarm !== 'function' || getBloomscapesFarm() !== '10-PH') return '';
    const farm = item?.WAREHOUSEID || item?.WAREHOUSE_ID || item?.warehouse_id || item?.warehouse || item?.FARM_CODE;
    if (farm && farm !== '10-PH') return '';
    return phPullSideLabel(item);
}

const phWorkButtonClass = 'rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold';
const phWorkSelectClass = 'input-field w-full';

function phWorkMarkup() {
    return '<div class="space-y-3" data-ph-pull-work data-drive-layout-active>'
        +'<input type="search" data-ph-work-search hidden aria-label="Search unassigned pull tags">'
        +'<div class="flex flex-wrap gap-2 items-end"><label>View<select data-ph-view class="'+phWorkSelectClass+'">'
        +'<option value="pull-tags">Pull Tags & Teams</option><option value="teams">Teams</option></select></label>'
        +'<button type="button" data-ph-action="refresh" class="'+phWorkButtonClass+'">Refresh</button></div>'
        +'<p data-ph-status role="status"></p><output class="ph-water-override" data-ph-wet-paused hidden></output><section data-ph-teams></section>'
        +'<section data-ph-pool class="space-y-3"><div class="flex flex-wrap gap-2 items-end">'
        +'<button type="button" data-ph-action="auto" class="'+phWorkButtonClass+'">Auto-Group Full Buggy (≤ 650 WDU)</button>'
        +'<button type="button" data-ph-action="auto-dispatch" class="'+phWorkButtonClass+'">⚡ Auto-Assign Ready Teams</button>'
        +'<output data-ph-total aria-live="polite"></output><label>Assign Batch to Team (Unit #)'
        +'<select data-ph-dispatch-team class="'+phWorkSelectClass+'"></select></label>'
        +'<button type="button" data-ph-action="dispatch" class="'+phWorkButtonClass+'">Assign Batch to Team</button>'
        +'</div><div data-ph-selected-metrics></div><div data-ph-rows class="grid gap-2 md:grid-cols-2 xl:grid-cols-3"></div></section></div>';
}

function phWorkOptions(options, selected = '') {
    return options.map(value => '<option'+(value === selected ? ' selected' : '')+'>'+esc(value)+'</option>').join('');
}

function phWorkTeamCard(team) {
    const id = esc(team.team_id);
    return '<article class="rounded-lg border border-emerald-700 p-3 space-y-2">'
        +'<strong>Unit '+esc(team.unit_number)+' · '+esc(team.puller_primary)
        +(team.puller_helper ? ' + '+esc(team.puller_helper) : '')+'</strong><p>'+(team.batch_open ? 'Active load' : 'Standby / Ready')+'</p>'
        +'<div class="flex flex-wrap gap-2">'
        +'<button type="button" class="'+phWorkButtonClass+'" data-ph-action="edit" data-team-id="'+id+'">Change Unit / Partner</button>'
        +'<button type="button" class="'+phWorkButtonClass+'" data-ph-action="release" data-team-id="'+id+'">Release</button>'
        +'</div></article>';
}

function paintPhWorkTeams(state) {
    const {snapshot,draft,root} = state;
    const choices = phPullTeamChoices(snapshot,draft.id,draft.primary);
    const select = (label,name,options,value,prompt) => '<label>'+label+'<select data-ph-field="'+name
        +'" class="'+phWorkSelectClass+'"><option value="">'+prompt+'</option>'+phWorkOptions(options,value)+'</select></label>';
    root.querySelector('[data-ph-teams]').innerHTML = '<div class="flex flex-wrap gap-2 items-end">'
        +select('Unit #','unit',choices.units,draft.unit,'Select a unit')
        +select('Puller 1','primary',choices.primary,draft.primary,'Select a puller')
        +select('Puller Helper (Puller 2)','helper',choices.helper,draft.helper,'None')
        +'<button type="button" class="'+phWorkButtonClass+'" data-ph-action="save">'
        +(draft.id ? 'Save Changes' : 'Assign Team')+'</button>'
        +(draft.id ? '<button type="button" class="'+phWorkButtonClass+'" data-ph-action="cancel">Cancel Edit</button>' : '')
        +'</div><div class="grid gap-2 my-3 sm:grid-cols-2 xl:grid-cols-3">'+snapshot.teams.map(phWorkTeamCard).join('')+'</div>';
}

function phWorkTagCard(row, selected) {
    const id = esc(row.pull_tag_id);
    const side = phPullSideLabel(row);
    const drop = phQrPullDrop(row) || 'Dock '+row.dock+' · Drop '+row.stopnumber;
    return bloomscapesListNode('<article class="rounded-lg border border-emerald-700 p-3">'
        +'<label class="flex gap-2 items-start"><input type="checkbox" data-ph-tag="'+id+'"'
        +(selected.has(row.pull_tag_id) ? ' checked' : '')+'>'
        +'<span>'+(phPullDockLabel(row.dock_status) === 'Live Driver' ? '<b class="ph-live-driver">🚨 URGENT · LIVE DRIVER</b> ' : '')
        +'<strong>'+esc(row.common_name || row.itemcode)+'</strong> · '+esc(row.container_size)
        +'<br>'+esc(row.itemcode)+' · '+esc(phQrPullLocation(row))+' · Lot '+esc(row.lotcode)
        +(side ? ' · Pull Side: '+esc(side) : '')
        +'<br>On Hand '+esc(String(row.onhand ?? '—'))+' · Quantity Ordered '+esc(String(row.quantityordered ?? '—'))
        +'<br>'+esc(drop)
        +' · '+esc(String(row.wingdingunits))+' WDU'
        +(row.trip_total>1 ? '<br>Trip '+row.trip_index+'/'+row.trip_total+' · Pull '+row.pull_qty : '')
        +'</span></label></article>');
}

function paintPhWorkRows(state,rows) {
    const {root,selected} = state;
    mountChunkedList(root.querySelector('[data-ph-rows]'),rows,row => phWorkTagCard(row,selected));
    paintPhWorkSelection(state);
}

function paintPhWorkSelection(state) {
    const {root,selected,snapshot,pending} = state;
    const total = phPullSelectedWdu(snapshot.rows,selected)/1e12;
    root.querySelector('[data-ph-total]').textContent = 'Selected: '+total+' / '+PH_PULL_CAP+' WDU';
    paintPhSelectedMetrics(state);
    const team = root.querySelector('[data-ph-dispatch-team]');
    root.querySelector('[data-ph-action="dispatch"]').disabled = Boolean(pending || !selected.size || !team.value);
}

function paintPhWorkState(state, rows) {
    const {root,snapshot,pending} = state;
    const dispatch = root.querySelector('[data-ph-dispatch-team]');
    const current = dispatch.value;
    dispatch.replaceChildren(new Option('Select a team',''),...snapshot.teams
        .filter(team => !team.batch_open).map(team => new Option('Unit '+team.unit_number,team.team_id)));
    if (snapshot.teams.some(team => team.team_id === current && !team.batch_open)) dispatch.value = current;
    paintPhWorkTeams(state);
    paintPhWorkRows(state,rows);
    for (const control of root.querySelectorAll('[data-ph-action]:not([data-ph-action="dispatch"])')) {
        control.disabled = Boolean(pending);
    }
}

let bloomscapesStudioEntry = '';

function openBloomscapesFieldWorkStudio(phase='') {
    const parkHillStudio=typeof canBuildPhOrderPullWork==='function' && canBuildPhOrderPullWork()
        && canUseBloomscapesWorkStudio();
    return switchView('field-work-studio',{studioPhase:phase,parkHillStudio});
}

function prepareBloomscapesStudioNavigation(requested,options) {
    const route=requested==='production-workflow' ? productionWorkflowActive : requested;
    const phase=route==='field-work-studio' ? options?.studioPhase || '' : bloomscapesStudioRoute(route);
    delete BLOOMSCAPES_DEPARTMENT_DEFAULTS.production;
    const key=bloomscapesDepartmentKey('production');
    if (phase!==undefined) selectBloomscapesStudioEntry(key,phase);
    else if (!options?.fromHistory && bloomscapesDepartmentTabs.delete(key)) markViewDirty('production');
}

function selectBloomscapesStudioEntry(key,phase) {
    bloomscapesDepartmentTabs.set(key,'bloomscapes-studio');
    const frame=bloomscapesDepartmentFrames.get(key+':bloomscapes-studio');
    const panel=frame?.querySelector('[data-studio-module]');
    if (!frame) bloomscapesStudioEntry=phase;
    else if (phase && phase!==panel?.dataset.studioPhase) {
        frame.querySelector('[data-open-module="'+phase+'"]')?.click();
    }
    markViewDirty('production');
}

function renderBloomscapesWorkStudio() {
    if (!canUseBloomscapesWorkStudio()) return '';
    return '<section data-bloomscapes-studio><nav data-studio-modules aria-label="Work types">'
        +'<input type="search" data-studio-menu-search placeholder="Search work types…" aria-label="Search work types">'
        +BLOOMSCAPES_STUDIO_PHASES.map(([key,label,kind,,description])=>'<button type="button" data-open-module="'+key+'" data-work-type="'+(kind==='HAULING'?'CONSOLIDATE_INVENTORY':kind)+'"><strong>'+esc(label)+'</strong>'
            +(description ? '<span>'+esc(description)+'</span>' : '')+'</button>').join('')
        +(typeof canCreateBloomscapesTreeGrading==='function' && canCreateBloomscapesTreeGrading()
            ? '<button type="button" data-open-module="tree-grading"><strong>Tree Grading</strong></button>' : '')
        +(typeof phWaterMayOpen==='function' && phWaterMayOpen()
            ? '<button type="button" data-open-module="water"><strong>💧 Water</strong></button>' : '')
        +'</nav><div data-studio-module></div></section>';
}

function mountBloomscapesWorkStudio(host) {
    const menu=host.querySelector('[data-studio-modules]');
    const panel=host.querySelector('[data-studio-module]');
    if (!menu || !panel || !canUseBloomscapesWorkStudio()) return;
    menu.addEventListener('click',event=>{
        const key=event.target.closest('[data-open-module]')?.dataset.openModule;
        if (key) void openBloomscapesStudioModule(menu,panel,key).catch(error=>studioFailure(panel,error));
    });
    const search = menu.querySelector('[data-studio-menu-search]');
    search.oninput = () => {
        for (const control of menu.querySelectorAll('[data-open-module]')) {
            control.hidden = !matchesBloomscapesModuleSearch(search.value,[control.textContent]);
        }
    };
    syncGlobalHeaderChrome({reason:'studio-module-search',force:true});
    const entry=bloomscapesStudioEntry;
    bloomscapesStudioEntry='';
    if (entry) menu.querySelector('[data-open-module="'+entry+'"]')?.click();
}

async function openBloomscapesStudioModule(menu,panel,key) {
    if (!canUseBloomscapesWorkStudio()) return;
    if (key==='water' && !phWaterMayOpen()) return;
    panel.dataset.studioPhase=key;
    menu.hidden=true;
    const titles = {'tree-grading':'Tree Grading',water:'Water'};
    const title = titles[key] || BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===key)[1];
    panel.innerHTML='<header class="studio-breadcrumb"><button type="button" data-module-back>← Work Types</button><h3>'+title+'</h3><span data-module-summary></span></header><div data-module-body></div>';
    const body=panel.querySelector('[data-module-body]');
    panel.querySelector('[data-module-back]').addEventListener('click',()=>{panel.replaceChildren();delete panel.dataset.studioPhase;menu.hidden=false;syncGlobalHeaderChrome({reason:'studio-modules',force:true});});
    if (key==='tree-grading') return mountBloomscapesTreeGrading(body);
    if (key==='water') return mountPhProductionWater(body);
    body.appendChild(document.createElement('div')).dataset.studioExcel='true';
    const browser=body.appendChild(document.createElement('section'));
    browser.dataset.workBrowser='true';
    const work=body.appendChild(document.createElement('section'));
    const owner=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm();
    const enter=(row,selection)=>{
        if (!body.isConnected || owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm()) return;
        const section=document.createElement('div');
        work.replaceChildren(section);
        void openBloomscapesScopedWork(section,panel,key,row,selection);
    };
    mountBloomscapesWorkBrowser(browser,enter,{locationDrill:true,studioScopes:true,onPathChange:()=>work.replaceChildren()});
    mountInventoryExcelFilters('studio');
    syncGlobalHeaderChrome({reason:'studio-work-search',force:true});
    if (!bloomscapesWorkBrowserRows().length) {
        await selectBloomscapesFarm(farm);
        if (body.isConnected && owner===getSupabaseReadIdentityScope() && farm===getBloomscapesFarm()) refreshBloomscapesWorkBrowser(browser);
    }
}

async function openBloomscapesScopedWork(body,panel,key,source,selection) {
    try {
        const owner=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm();
        await ensureBloomscapesFieldQueue();
        if (!body.isConnected || owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm()) return;
        const phase=BLOOMSCAPES_STUDIO_PHASES.find(([id])=>id===key);
        if (!bloomscapesCanChooseWork(phase[2])) {
            body.textContent='You do not have permission to create this work.';
            return;
        }
        const work=bloomscapesFieldQueueState.rows.filter(row=>row.work_view===phase[2] && row.farm_code===farm);
        panel.querySelector('[data-module-summary]').textContent=work.length+' Lines · '+work.reduce((sum,row)=>sum+Number(row.quantity || 0),0).toLocaleString()+' Cans';
        body.innerHTML=renderBloomscapesWorkCreator('bloomscapes-field-jobs');
        await mountBloomscapesWorkCreator(body,{phase:key,quick:true,source,selection});
    } catch (error) { if (body.isConnected) body.textContent=error.message; }
}

function mountBloomscapesProductionShell(doc) {
    const root=doc.getElementById('view-production');
    if (root && !root.firstElementChild) root.innerHTML=bloomscapesProductionHub;
}

const bloomscapesProductionHub=`<div class="freeze-panel">
    <div class="flex items-center justify-between gap-3 mb-3">
        <div>
            <div class="text-xs font-bold text-[#007a4d] uppercase tracking-[0.16em]">Production</div>
            <div class="text-xl font-black text-slate-900">Production</div>
        </div>
        <div class="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#007a4d]">Hub</div>
    </div>
</div>
<div id="production-hub-grid" class="grid gap-3 md:grid-cols-2">
    <button type="button" id="production-open-grower" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('grower')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-plant text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Grower</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Scouting notes</div>
    </button>
    <button type="button" id="production-open-take-back" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('take-back')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-arrow-u-up-left text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Take Back</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Open take backs</div>
    </button>
    <button type="button" id="production-open-84rd" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return open84RdInventoryView()">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-map-trifold text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">84 R.D</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Production inventory</div>
    </button>
    <button type="button" id="production-open-disease-pest" class="rounded-2xl border border-red-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('disease-pest')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700"><i class="ph-bold ph-bug text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Disease &amp; Pest</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Scouting and notes</div>
    </button>
    <button type="button" id="production-open-tasks" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('tasks')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-clipboard-text text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Task</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Production task rows</div>
    </button>
    <button type="button" id="production-open-request" class="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('request')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><i class="ph-bold ph-list-checks text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Que</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Que folders</div>
    </button>
    <button type="button" id="production-open-propagation" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return openProductionWorkflow('propagation')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-tree-structure text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Propagation</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Cuttings and starts</div>
    </button>
    <button type="button" id="production-open-planting" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return openProductionWorkflow('planting')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-potted-plant text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Planting</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Planting workflow</div>
    </button>
    <button type="button" id="production-open-weather-hold" class="rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('weather-hold')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><i class="ph-bold ph-cloud-sun text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Weather &amp; Hold Risk</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">GDD and chill hours</div>
    </button>
</div>
<div id="production-workflow-panel" class="hidden mt-4"></div>
<div id="production-empty-state" class="hidden rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm font-bold text-slate-400">No production modules are available for this login.</div>`;
if (typeof document!=='undefined') mountBloomscapesProductionShell(document);

function studioFailure(panel,error) {
    if (panel.isConnected) panel.textContent=error.message;
}
