
const bloomscapesFlyerPresets={
    garden:{title:'Garden collection',background:'#fffdf5',ink:'#173b27',accent:'#d8f38f',font:'serif'},
    field:{title:'Field availability',background:'#f2f6ef',ink:'#143c35',accent:'#d2e7dc',font:'sans'},
    spring:{title:'Spring highlights',background:'#fff6f2',ink:'#512e35',accent:'#f6d1c7',font:'serif'}
};

function bloomscapesFlyerTemplateChoices() {
    return Object.entries(bloomscapesFlyerPresets).map(([id,preset])=>[id,preset.title]);
}

function bloomscapesFlyerHeader(title,size,preset) {
    return makeBloomscapesFlyerElement('text',{x:44,y:34,w:size.width-88,h:84,text:title,
        fill:preset.accent,ink:preset.ink,font:preset.font,fontSize:43,bold:true});
}

function applyBloomscapesFlyerTemplate(canvas,key) {
    const preset=bloomscapesFlyerPresets[key];
    if (!preset) return canvas;
    const size=BLOOMSCAPES_FLYER_SIZES[canvas.format];
    const page={...createBloomscapesFlyerPage(),background:preset.background,elements:[bloomscapesFlyerHeader(preset.title,size,preset)]};
    const blank=canvas.pages.length===1 && !canvas.pages[0].elements.length;
    if (!blank && canvas.pages.length>=BLOOMSCAPES_FLYER_PAGE_LIMIT) throw Error('Remove a page before adding a template.');
    return {...canvas,title:canvas.title==='Untitled flyer'?preset.title:canvas.title,pages:blank?[page]:[...canvas.pages,page]};
}

function bloomscapesFlyerLivePlant(source) {
    if (bloomscapesRowFarm(source)!==getBloomscapesFarm()) return null;
    const row=resolveCanonicalInventoryRow(source) || source;
    const sourceId=canonicalInventoryRowUid(row);
    if (!sourceId || !(Number(row.LOC_PHOTO_MATCH ?? row.loc_photo_match)>0)) return null;
    const image=String(row.PHOTO_LINK || row.photo_link || row.PHOTO_URL || row.photo_url || '').split(',')
        .map(value=>bloomscapesFlyerImage(value.trim())).find(Boolean) || '';
    return {sourceId,text:row.COMMONNAME || row.commonname || row.ITEMCODE || row.itemcode,
        itemcode:row.ITEMCODE || row.itemcode,detail:row.CONTSIZE || row.contsize,image,location:row.LOCATIONCODE || row.locationcode};
}

function bloomscapesFlyerFolderPlant(item) {
    const live=findCurrentFlyerFolderSourceRow(item);
    const plant=live && bloomscapesFlyerLivePlant(live);
    const sourceId=getFlyerFolderSourceMasterId(item) || canonicalInventoryRowUid(live || item);
    const image=String(getFlyerVisiblePhotoLinkCsv(item) || '').split(',').map(value=>bloomscapesFlyerImage(value.trim())).find(Boolean);
    return {...(plant || {sourceId,text:item.COMMONNAME || item.commonname || item.ITEMCODE || item.itemcode,
        itemcode:item.ITEMCODE || item.itemcode,detail:item.CONTSIZE || item.contsize}),image:image || plant?.image || ''};
}

function bloomscapesFlyerFolderChoices() {
    if (!canAccessView('tasks')) return [];
    return [...new Set(getAllFlyerTaskItems().filter(row=>bloomscapesRowFarm(row)===getBloomscapesFarm() && !isFlyerFolderArchived(row))
        .map(getFlyerFolderName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function bloomscapesFlyerFolderPlants(folder,provided) {
    const farm=getBloomscapesFarm();
    const source=provided || (canAccessView('tasks') ? getAllFlyerTaskItems().filter(row=>doesItemMatchFlyerFolder(row,folder,'active')):[]);
    return source.filter(row=>bloomscapesRowFarm(row)===farm).map(bloomscapesFlyerFolderPlant);
}

function bloomscapesFlyerLivePlants(search='') {
    return bloomscapesWorkBrowserRows(search).map(bloomscapesFlyerLivePlant).filter(Boolean);
}

function refreshBloomscapesFlyerDesign(canvas) {
    const live=new Map(bloomscapesFlyerLivePlants().map(plant=>[plant.sourceId,plant]));
    return normalizeBloomscapesFlyerDesign({...canvas,pages:canvas.pages.map(page=>({...page,elements:page.elements.map(element=>{
        if (element.type!=='plant' || !element.sourceId) return element;
        const row=live.get(element.sourceId);
        return row ? {...element,...row,unavailable:false}:{...element,unavailable:true};
    })}))});
}

function bloomscapesFlyerArrangePage(plants,index,grid,title,preset) {
    const {size,columns,rows}=grid;
    const width=Math.floor((size.width-88-(columns-1)*18)/columns);
    const height=Math.floor((size.height-170-(rows-1)*18)/rows);
    const elements=plants.map((plant,position)=>makeBloomscapesFlyerElement('plant',{...plant,ink:preset.ink,bold:true,
        x:44+(position%columns)*(width+18),y:132+Math.floor(position/columns)*(height+18),w:width,h:height}));
    return {...createBloomscapesFlyerPage(),background:preset.background,
        elements:[bloomscapesFlyerHeader(index?title+' | '+(index+1):title,size,preset),...elements]};
}

function autoLayoutBloomscapesFlyerFolder(canvas,folder,plants) {
    if (!plants.length) throw Error('This folder has no visible rows to lay out.');
    const size=BLOOMSCAPES_FLYER_SIZES[canvas.format],columns=canvas.format==='landscape'?3:2;
    const baseRows=canvas.format==='landscape'?2:3;
    const rows=Math.max(baseRows,Math.ceil(plants.length/(columns*BLOOMSCAPES_FLYER_PAGE_LIMIT)));
    const capacity=columns*Math.min(rows,6);
    const count=Math.ceil(plants.length/capacity);
    if (count>BLOOMSCAPES_FLYER_PAGE_LIMIT) throw Error('This folder needs '+count+' pages. Split the folder to stay within the 24-page archive limit.');
    const title=folder || canvas.title;
    const pages=Array.from({length:count},(_,index)=>
        bloomscapesFlyerArrangePage(plants.slice(index*capacity,(index+1)*capacity),index,{size,columns,rows:Math.min(rows,6)},title,bloomscapesFlyerPresets.garden));
    return normalizeBloomscapesFlyerDesign({...canvas,title,folder,pages});
}
