
const bloomscapesFlyerDesignerMarkup='<div class="flyer-control-bar"><input maxlength="120" data-flyer-title aria-label="Flyer title">'
    +'<select data-flyer-format aria-label="Page size"></select><label>Zoom <input type="range" data-flyer-zoom aria-label="Zoom" min="50" max="200" value="100" step="10"></label>'
    +'<button type="button" data-flyer-action="undo">Undo</button><button type="button" data-flyer-action="redo">Redo</button>'
    +'<button type="button" data-flyer-action="save">Save</button><button type="button" data-flyer-action="pdf">Print PDF</button>'
    +'<button type="button" data-flyer-action="png">PNG</button><button type="button" data-flyer-action="email">Email</button></div><p role="status" aria-live="polite"></p>'
    +'<div class="flyer-grid"><aside class="flyer-rail" aria-label="Flyer assets"></aside><section class="flyer-stage" aria-label="Flyer artboard">'
    +'<div class="flyer-pages"><button type="button" data-flyer-action="previous-page">Previous page</button><span data-flyer-page-count></span>'
    +'<button type="button" data-flyer-action="next-page">Next page</button><button type="button" data-flyer-action="new-page">Add page</button>'
    +'<button type="button" data-flyer-action="remove-page">Remove page</button></div><div class="flyer-sheet-well"></div></section>'
    +'<aside class="flyer-style" aria-label="Styling inspector"></aside></div>';

function mountBloomscapesFlyerDesigner(host,canvas=null,options={}) {
    const root=document.createElement('section');
    root.className='flyer-designer'+(options.readOnly?' flyer-designer-viewer':'');
    root.dataset.flyerDesigner='';
    root.innerHTML=bloomscapesFlyerDesignerMarkup;
    const timeline=createBloomscapesFlyerTimeline(canvas || {});
    const state={root,timeline,options,page:0,zoom:1,selection:null,railPlants:new Map(),
        farm:getBloomscapesFarm(),owner:getSupabaseReadIdentityScope(),busy:false,retry:null};
    host.replaceChildren(root);
    configureBloomscapesFlyerDesigner(state);
    const observer=new ResizeObserver(entries=>{
        if (!root.isConnected) return observer.disconnect();
        const width=entries[0].contentRect.width;
        if (state.measuredWidth===width) return;
        state.measuredWidth=width;
        paintBloomscapesFlyerDesignerBoard(state);
    });
    observer.observe(root.querySelector('.flyer-sheet-well'));
    return {get canvas(){return timeline.canvas;},dispose(){observer.disconnect();root.remove();}};
}

function configureBloomscapesFlyerDesigner(state) {
    const {root,options}=state;
    root.querySelector('[data-flyer-format]').append(...Object.entries(BLOOMSCAPES_FLYER_SIZES).map(([key,size])=>new Option(size.label,key)));
    for (const node of root.querySelectorAll('.flyer-rail,.flyer-style,[data-flyer-action=save],[data-flyer-action=pdf],[data-flyer-action=png],[data-flyer-action=email],[data-flyer-action=undo],[data-flyer-action=redo],[data-flyer-action=new-page],[data-flyer-action=remove-page]')) {
        node.hidden=options.readOnly===true;
    }
    root.querySelector('[data-flyer-title]').readOnly=options.readOnly===true;
    root.querySelector('[data-flyer-format]').disabled=options.readOnly===true;
    if (!options.readOnly) {
        setupBloomscapesFlyerRail(state);
        setBloomscapesFlyerFolderChoices(state,[...bloomscapesFlyerFolderChoices(),options.folderName].filter(Boolean));
    }
    root.addEventListener('click',event=>dispatchBloomscapesFlyerClick(state,event));
    root.addEventListener('change',event=>changeBloomscapesFlyerDesign(state,event.target));
    root.addEventListener('input',event=>{
        if (!event.target.matches('[data-flyer-zoom]')) return;
        state.zoom=Number(event.target.value)/100;
        paintBloomscapesFlyerDesignerBoard(state);
    });
    root.addEventListener('keydown',event=>keyBloomscapesFlyerDesigner(state,event));
    paintBloomscapesFlyerDesigner(state);
}

function ownsBloomscapesFlyerDesigner(state) {
    return state.root.isConnected && getBloomscapesFarm()===state.farm && getSupabaseReadIdentityScope()===state.owner;
}

function bloomscapesFlyerDesignerStatus(state,message) {
    if (ownsBloomscapesFlyerDesigner(state)) state.root.querySelector('[role=status]').textContent=message;
}

function paintBloomscapesFlyerDesignerBoard(state) {
    paintBloomscapesFlyerArtboard(state.root.querySelector('.flyer-sheet-well'),state.timeline.canvas,state.page,state.zoom,{
        readOnly:state.options.readOnly,
        select:id=>selectBloomscapesFlyerObject(state,id),
        finishPointer:(id,shape)=>patchBloomscapesFlyerObject(state,id,shape),
        drop:(x,y)=>{if (state.dragSource) addBloomscapesFlyerObject(state,'plant',state.dragSource,{x,y});}
    });
    markBloomscapesFlyerSelection(state.root,state.selection);
}

function paintBloomscapesFlyerDesigner(state) {
    const {root,timeline}=state,canvas=timeline.canvas;
    state.page=Math.min(state.page,canvas.pages.length-1);
    root.querySelector('[data-flyer-title]').value=canvas.title;
    root.querySelector('[data-flyer-format]').value=canvas.format;
    root.querySelector('[data-flyer-page-count]').textContent='Page '+(state.page+1)+' of '+canvas.pages.length;
    for (const [action,disabled] of Object.entries({undo:!timeline.canUndo,redo:!timeline.canRedo,
        'previous-page':state.page===0,'next-page':state.page===canvas.pages.length-1,
        'new-page':canvas.pages.length>=BLOOMSCAPES_FLYER_PAGE_LIMIT,'remove-page':canvas.pages.length<2,
        save:state.busy,pdf:state.busy,png:state.busy,email:state.busy})) {
        root.querySelector('[data-flyer-action="'+action+'"]').disabled=disabled;
    }
    paintBloomscapesFlyerDesignerBoard(state);
    if (!state.options.readOnly) paintBloomscapesFlyerInspector(state);
}

function selectBloomscapesFlyerObject(state,id) {
    if (state.selection===id) return;
    state.selection=id;
    markBloomscapesFlyerSelection(state.root,id);
    paintBloomscapesFlyerInspector(state);
}

function updateBloomscapesFlyerDesign(state,next) {
    if (!ownsBloomscapesFlyerDesigner(state) || state.options.readOnly) return;
    if (state.timeline.commit(next)) state.options.onChange?.(state.timeline.canvas);
    paintBloomscapesFlyerDesigner(state);
}

function editBloomscapesFlyerPage(state,edit) {
    const canvas=state.timeline.canvas;
    updateBloomscapesFlyerDesign(state,{...canvas,pages:canvas.pages.map((page,index)=>index===state.page?edit(page):page)});
}

function patchBloomscapesFlyerObject(state,id,patch) {
    editBloomscapesFlyerPage(state,page=>({...page,elements:page.elements.map(element=>element.id===id?{...element,...patch}:element)}));
}

function addBloomscapesFlyerObject(state,type,value,position={}) {
    if (state.timeline.canvas.pages[state.page].elements.length>=BLOOMSCAPES_FLYER_ELEMENT_LIMIT) {
        return bloomscapesFlyerDesignerStatus(state,'Add a page before placing another object.');
    }
    const at={x:Math.max(0,position.x ?? 56),y:Math.max(0,position.y ?? 112)};
    const plant=type==='plant'?state.railPlants.get(value):null;
    if (type==='plant' && !plant) return;
    const element=makeBloomscapesFlyerElement(type,{...at,...bloomscapesFlyerObjectStyle(type,value,plant)});
    state.selection=element.id;
    editBloomscapesFlyerPage(state,page=>({...page,elements:[...page.elements,element]}));
}

function bloomscapesFlyerObjectStyle(type,text,plant) {
    if (type==='plant') return {...plant,w:250,h:265,bold:true};
    if (type==='badge') return {w:235,h:54,text,align:'center',fontSize:25,bold:true};
    const headingSizes={Heading:46,Subheading:32};
    return {w:300,h:82,text,bold:text==='Heading',fontSize:headingSizes[text] || 20};
}

function editBloomscapesFlyerStack(state,action) {
    const page=state.timeline.canvas.pages[state.page],current=page.elements.find(element=>element.id===state.selection);
    if (!current) return;
    const others=page.elements.filter(element=>element!==current);
    if (action==='duplicate') {
        if (page.elements.length>=BLOOMSCAPES_FLYER_ELEMENT_LIMIT) return;
        const copy=makeBloomscapesFlyerElement(current.type,{...current,x:current.x+16,y:current.y+16});
        state.selection=copy.id;
        return editBloomscapesFlyerPage(state,row=>({...row,elements:[...row.elements,copy]}));
    }
    const elements=action==='delete'?others:action==='front'?[...others,current]:[current,...others];
    if (action==='delete') state.selection=null;
    editBloomscapesFlyerPage(state,row=>({...row,elements}));
}

function changeBloomscapesFlyerDesign(state,target) {
    if (!ownsBloomscapesFlyerDesigner(state) || state.options.readOnly) return;
    const canvas=state.timeline.canvas;
    if (target.matches('[data-flyer-title]')) return updateBloomscapesFlyerDesign(state,{...canvas,title:target.value.trim()});
    if (target.matches('[data-flyer-format]')) return updateBloomscapesFlyerDesign(state,resizeBloomscapesFlyerDesign(canvas,target.value));
    const key=target.dataset.flyerProperty;
    if (!key) return;
    if (key==='background') return editBloomscapesFlyerPage(state,page=>({...page,background:target.value}));
    const value=target.type==='checkbox'?target.checked:target.type==='number'?Number(target.value):target.value;
    patchBloomscapesFlyerObject(state,state.selection,{[key]:value});
}

function changeBloomscapesFlyerPage(state,action) {
    const canvas=state.timeline.canvas;
    if (action==='previous-page' || action==='next-page') {
        state.page=Math.max(0,Math.min(canvas.pages.length-1,state.page+(action==='previous-page'?-1:1)));
        state.selection=null;
        return paintBloomscapesFlyerDesigner(state);
    }
    if (state.options.readOnly) return;
    if (action==='new-page' && canvas.pages.length<BLOOMSCAPES_FLYER_PAGE_LIMIT) {
        state.page=canvas.pages.length;
        state.selection=null;
        return updateBloomscapesFlyerDesign(state,{...canvas,pages:[...canvas.pages,createBloomscapesFlyerPage()]});
    }
    if (action==='remove-page' && canvas.pages.length>1) {
        state.selection=null;
        updateBloomscapesFlyerDesign(state,{...canvas,pages:canvas.pages.filter((_,index)=>state.page!==index)});
    }
}

function dispatchBloomscapesFlyerClick(state,event) {
    const button=event.target.closest('[data-flyer-action]');
    if (!button || !ownsBloomscapesFlyerDesigner(state)) return;
    const {flyerAction:action,flyerValue:value}=button.dataset;
    if (action.endsWith('-page')) return changeBloomscapesFlyerPage(state,action);
    if (state.options.readOnly) return;
    try {executeBloomscapesFlyerAction(state,action,value);}
    catch (error) {bloomscapesFlyerDesignerStatus(state,error.message);}
}

function executeBloomscapesFlyerAction(state,action,value) {
    if (action==='assets' || action==='more-assets') {
        state.assetPage=action==='more-assets'?Number(value):0;
        return paintBloomscapesFlyerRail(state,action==='assets'?value:'plants');
    }
    if (action==='template') {
        const next=applyBloomscapesFlyerTemplate(state.timeline.canvas,value);
        state.page=next.pages.length-1;state.selection=null;
        return updateBloomscapesFlyerDesign(state,next);
    }
    if (['plant','text','badge'].includes(action)) return addBloomscapesFlyerObject(state,action,value);
    if (['front','back','duplicate','delete'].includes(action)) return editBloomscapesFlyerStack(state,action);
    if (['undo','redo'].includes(action)) {
        state.timeline[action]();
        state.selection=null;
        state.options.onChange?.(state.timeline.canvas);
        return paintBloomscapesFlyerDesigner(state);
    }
    if (action==='auto-layout') {
        const folder=state.root.querySelector('[data-flyer-folder]').value;
        if (!folder) throw Error('Choose an active Flyer Folder first.');
        const provided=folder===state.options.folderName ? state.options.folderRows : null;
        const next=autoLayoutBloomscapesFlyerFolder(state.timeline.canvas,folder,bloomscapesFlyerFolderPlants(folder,provided));
        state.page=0;state.selection=null;
        return updateBloomscapesFlyerDesign(state,next);
    }
    if (['save','pdf','png','email'].includes(action)) void sendBloomscapesFlyerExport(state,action);
}

function keyBloomscapesFlyerDesigner(state,event) {
    if (state.options.readOnly || !ownsBloomscapesFlyerDesigner(state) || event.target.closest('input,textarea,select')) return;
    if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        return executeBloomscapesFlyerAction(state,event.shiftKey || event.key.toLowerCase()==='y'?'redo':'undo');
    }
    if (state.selection && ['Backspace','Delete'].includes(event.key)) {
        event.preventDefault();
        editBloomscapesFlyerStack(state,'delete');
    }
}

async function sendBloomscapesFlyerExport(state,purpose) {
    if (state.busy || !ownsBloomscapesFlyerDesigner(state)) return;
    const canvas=state.timeline.canvas;
    const signature=purpose+'|'+JSON.stringify(canvas);
    const job=state.retry?.signature===signature?state.retry:{signature,requestId:crypto.randomUUID()};
    state.retry=job;state.busy=true;
    paintBloomscapesFlyerDesigner(state);
    bloomscapesFlyerDesignerStatus(state,'Rendering and archiving flyer…');
    try {
        job.artwork ||= await renderBloomscapesFlyerExport(canvas,purpose);
        if (!ownsBloomscapesFlyerDesigner(state)) return;
        job.receipt ||= await archiveBloomscapesMarketingFlyer({title:canvas.title,canvas,purpose,requestId:job.requestId,
            previewBlob:job.artwork.previewBlob,pdfBlob:job.artwork.pdfBlob,
            sourceArchiveId:state.options.sourceArchiveId,sourceFolderId:state.options.sourceFolderId});
        if (!ownsBloomscapesFlyerDesigner(state)) return;
        if (purpose==='email') {
            await queueBloomscapesMarketingFlyerEmail(job.receipt.id);
        } else if (purpose==='pdf' || purpose==='png') {
            await downloadBloomscapesFlyerExport(canvas,job.artwork,purpose);
        }
        state.retry=null;
        state.options.onArchived?.(job.receipt);
        bloomscapesFlyerDesignerStatus(state,purpose==='email'?'Archived and queued for email.':'Flyer archived.');
    } catch(error) {
        bloomscapesFlyerDesignerStatus(state,error.message);
    } finally {
        state.busy=false;
        if (ownsBloomscapesFlyerDesigner(state)) paintBloomscapesFlyerDesigner(state);
    }
}
