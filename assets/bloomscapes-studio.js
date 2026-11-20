const bloomscapesStudioModules = [
    ['bunch','Bunch Notes'],['cans','Can Filling'],['grading','Shift Grading'],['haul','Hauling'],
    ['shear','Shear List'],['spring','Spring Spreading'],['winter','Over Wintering'],
    ['drape','Drape Varieties'],['pit','Short Pit'],['disease-pest','Pest & Disease'],['replenishment','Intercompany & CPB']
];

function renderBloomscapesWorkStudio() {
    return '<section data-bloomscapes-studio><h2>Build Work Studio</h2><nav data-studio-modules>'
        +bloomscapesStudioModules.map(([key,label])=>'<button type="button" data-open-module="'+key+'">'+label+'</button>').join('')
        +'</nav><div data-studio-module></div></section>';
}

function mountBloomscapesWorkStudio(host) {
    const menu=host.querySelector('[data-studio-modules]');
    const panel=host.querySelector('[data-studio-module]');
    menu.addEventListener('click',event=>{
        const key=event.target.closest('[data-open-module]')?.dataset.openModule;
        if (key) void openBloomscapesStudioModule(menu,panel,key);
    });
}

async function openBloomscapesStudioModule(menu,panel,key) {
    menu.hidden=true;
    const title=bloomscapesStudioModules.find(([id])=>id===key)[1];
    panel.innerHTML='<header class="studio-breadcrumb"><button type="button" data-module-back>← All Modules</button><h3>'+title+'</h3><span data-module-summary></span></header><div data-module-body></div>';
    const body=panel.querySelector('[data-module-body]');
    panel.querySelector('[data-module-back]').addEventListener('click',()=>{panel.replaceChildren();menu.hidden=false;syncGlobalHeaderChrome({reason:'studio-modules',force:true});});
    if (key==='disease-pest') return mountBloomscapesLabDiagnostics(body);
    if (key==='replenishment') {
        body.innerHTML=renderBloomscapesTransferBuilder();
        return mountBloomscapesTransferBuilder(body);
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
        await mountBloomscapesWorkCreator(body,{phase:key});
    } catch (error) { if (body.isConnected) body.textContent=error.message; }
}
