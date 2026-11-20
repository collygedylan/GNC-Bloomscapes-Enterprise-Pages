const bloomscapesStudioModules = [
    ['bunch','Bunch Notes'],['cans','Can Filling'],['grading','Shift Grading'],['haul','Hauling'],
    ['shear','Shear List'],['spring','Spring Spreading'],['winter','Over Wintering'],
    ['drape','Drape Varieties'],['pit','Short Pit'],['disease-pest','Pest & Disease'],['replenishment','Intercompany & CPB']
];

function renderBloomscapesWorkStudio() {
    if (!canUseBloomscapesWorkStudio()) return '';
    return '<section data-bloomscapes-studio><h2>Build Work Studio</h2><nav data-studio-modules>'
        +bloomscapesStudioModules.map(([key,label],index)=>'<button type="button" data-open-module="'+key+'"><i aria-hidden="true" class="ph '+bloomStudioIcons[index]+'"></i><span>'+label+'</span></button>').join('')
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
}

async function openBloomscapesStudioModule(menu,panel,key) {
    if (!canUseBloomscapesWorkStudio()) return;
    menu.hidden=true;
    const title=bloomscapesStudioModules.find(([id])=>id===key)[1];
    panel.innerHTML='<header class="studio-breadcrumb"><button type="button" data-module-back>← All Modules</button><h3>'+title+'</h3><span data-module-summary></span></header><div data-module-body></div>';
    const body=panel.querySelector('[data-module-body]');
    panel.querySelector('[data-module-back]').addEventListener('click',()=>{panel.replaceChildren();menu.hidden=false;syncGlobalHeaderChrome({reason:'studio-modules',force:true});});
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
    if (key==='disease-pest') return mountBloomscapesLabDiagnostics(work);
    mountBloomscapesWorkBrowser(browser,enter,{locationDrill:true,studioScopes:true,onPathChange:()=>work.replaceChildren()});
    mountInventoryExcelFilters('studio');
    if (!bloomscapesWorkBrowserRows().length) {
        await selectBloomscapesFarm(farm);
        if (body.isConnected && owner===getSupabaseReadIdentityScope() && farm===getBloomscapesFarm()) refreshBloomscapesWorkBrowser(browser);
    }
}

const bloomStudioIcons=['ph-tree','ph-plant','ph-arrows-left-right','ph-truck','ph-scissors','ph-sun','ph-snowflake','ph-leaf','ph-shovel','ph-bug','ph-warehouse'];

async function openBloomscapesScopedWork(body,panel,key,source,selection) {
    if (key==='replenishment') {
        body.innerHTML=renderBloomscapesTransferBuilder();
        return mountBloomscapesTransferBuilder(body,selection);
    }
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
        body.innerHTML=renderBloomscapesWorkCreator('bloomscapes-field-jobs',key);
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
    <button type="button" id="production-open-can-filling" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return openProductionWorkflow('can-filling')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-cylinder text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Can Filling</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Can fill runs</div>
    </button>
    <button type="button" id="production-open-order-pulling" class="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return openProductionWorkflow('order-pulling')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#007a4d]"><i class="ph-bold ph-package text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Order Pulling</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Pulling queues</div>
    </button>
    <button type="button" id="production-open-shear-list" class="rounded-2xl border border-lime-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]" onclick="return switchView('shear-list')">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-50 text-lime-700"><i class="ph-bold ph-scissors text-2xl"></i></div>
        <div class="text-lg font-black text-slate-900">Shear List</div>
        <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Rows to shear</div>
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
