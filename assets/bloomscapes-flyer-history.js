function flyerHistoryNode(host,tag,label='') {
    const node=host.appendChild(document.createElement(tag));
    node.textContent=label;
    return node;
}

function flyerHistoryButton(host,label,action) {
    const button=flyerHistoryNode(host,'button',label);
    button.type='button';
    button.addEventListener('click',action);
    return button;
}

function mountBloomscapesFlyerHistory(host,openDesign) {
    const form=flyerHistoryNode(host,'form');
    const search=flyerHistoryNode(form,'input');
    search.type='search';search.maxLength=120;search.placeholder='Search flyer history';search.setAttribute('aria-label',search.placeholder);
    flyerHistoryNode(form,'button','Search').type='submit';
    const status=flyerHistoryNode(host,'p');
    status.setAttribute('role','status');
    const grid=flyerHistoryNode(host,'div');
    grid.className='flyer-history-grid';
    const edge=flyerHistoryNode(host,'div');
    edge.dataset.scrollPageEdge='';
    edge.hidden=true;
    const state={cursor:null,revision:0,owner:getSupabaseReadIdentityScope(),farm:getBloomscapesFarm(),
        query:'',host,grid,edge,search,status,openDesign,rows:[]};
    form.addEventListener('submit',event=>{event.preventDefault();void loadFlyerHistoryPage(state,true);});
    void loadFlyerHistoryPage(state,true);
}

function flyerHistoryPageCurrent(state,revision) {
    return state.host.contains(state.grid) && state.grid.isConnected && state.revision===revision
        && state.owner===getSupabaseReadIdentityScope() && state.farm===getBloomscapesFarm();
}

async function loadFlyerHistoryPage(state,reset) {
    const {search,grid,edge,status}=state;
    const revision=++state.revision;
    if (reset) {state.cursor=null;state.query=search.value.trim();state.rows=[];grid.replaceChildren();}
    state.observer?.disconnect();
    edge.hidden=true;
    status.textContent='Loading flyer history…';
    try {
        const result=await readBloomscapesFlyerArchive({query:state.query,cursor:state.cursor,limit:12});
        if (!flyerHistoryPageCurrent(state,revision)) return;
        const urls=await createBloomscapesFlyerArtifactUrls(result.rows.map(row=>row.preview_path)).catch(()=>({}));
        if (!flyerHistoryPageCurrent(state,revision)) return;
        state.rows.push(...result.rows.map(row=>({row,preview:urls[row.preview_path]})));
        paintFlyerHistoryPage(state,result.next_cursor);
    } catch (error) {
        if (flyerHistoryPageCurrent(state,revision)) status.textContent='Flyer history could not load. '+error.message;
    }
}

function paintFlyerHistoryPage(state,cursor) {
    renderBloomscapesScrollCards(state.grid,state.rows,({row,preview})=>showFlyerHistoryCard(row,preview,state.openDesign,state.status),{size:12,estimate:220});
    state.cursor=cursor;
    state.edge.hidden=!cursor;
    if (cursor) state.observer=observeBloomscapesPageEdge(state.edge,()=>void loadFlyerHistoryPage(state,false));
    state.status.textContent=state.rows.length ? '' : 'No published flyers match this search.';
}

function showFlyerHistoryCard(row,preview,openDesign,status) {
    const card=document.createElement('article');
    card.className='flyer-history-card';
    const image=flyerHistoryNode(card,'img');
    image.alt=row.title;image.loading='lazy';
    if (preview) image.src=preview;
    else image.hidden=true;
    flyerHistoryNode(card,'h3',row.title);
    flyerHistoryNode(card,'p',[row.folder_label,row.author,new Date(row.created_at).toLocaleDateString()].filter(Boolean).join(' · '));
    for (const [mode,label] of [['view','View Historical Flyer'],['edit','Edit Copy in Studio'],['refresh','Duplicate & Refresh Live Inventory']]) {
        flyerHistoryButton(card,label,()=>openFlyerHistoryCard({row,mode,openDesign,status,card}));
    }
    return card;
}

async function openFlyerHistoryCard({row,mode,openDesign,status,card}) {
    const owner=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm();
    const current=()=>card.isConnected && owner===getSupabaseReadIdentityScope() && farm===getBloomscapesFarm();
    try {
        if (mode==='view') {
            const url=await createBloomscapesFlyerArtifactUrl(row.pdf_path || row.preview_path);
            if (current()) openFrozenFlyerPreview(card,row,url);
            return;
        }
        const design=await readBloomscapesFlyerDesign(row.id);
        if (!current()) return;
        const copy=structuredClone(design.canvas_json);
        const canvas=mode==='refresh' ? await refreshBloomscapesFlyerDesign(copy) : copy;
        if (current()) openDesign(canvas,{readOnly:false,sourceArchiveId:row.id,folderName:row.folder_label,sourceFolderId:design.source_folder_id});
    } catch(error) {
        if (current()) status.textContent='Flyer could not open. '+error.message;
    }
}

function openFrozenFlyerPreview(card,row,url) {
    const dialog=flyerHistoryNode(card,'dialog');
    dialog.className='flyer-history-preview';
    dialog.setAttribute('aria-label',row.title);
    flyerHistoryNode(dialog,'h3',row.title);
    flyerHistoryButton(dialog,'Close',()=>dialog.close());
    const link=flyerHistoryNode(dialog,'a','Open archived file');
    link.href=url;link.target='_blank';link.rel='noopener';
    const preview=flyerHistoryNode(dialog,row.pdf_path?'iframe':'img');
    preview.title=row.title;preview.src=url;
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.showModal();
}
