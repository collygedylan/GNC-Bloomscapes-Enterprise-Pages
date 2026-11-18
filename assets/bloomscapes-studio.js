const bloomscapesStudioModules = [
    ['bunch','Bunch Notes'],['cans','Can Filling'],['grading','Shift Grading'],['haul','Hauling'],
    ['shear','Shear List'],['spring','Spring Spreading'],['winter','Over Wintering'],
    ['drape','Drape Varieties'],['pit','Short Pit'],['replenishment','Intercompany & CPB']
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
    panel.innerHTML='<button type="button" data-module-back>All modules</button><h3>'+title+'</h3><div data-module-body></div>';
    const body=panel.querySelector('[data-module-body]');
    panel.querySelector('[data-module-back]').addEventListener('click',()=>{panel.replaceChildren();menu.hidden=false;});
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
        body.innerHTML=renderBloomscapesWorkCreator('bloomscapes-field-jobs',key);
        await mountBloomscapesWorkCreator(body,{phase:key});
    } catch (error) { if (body.isConnected) body.textContent=error.message; }
}
