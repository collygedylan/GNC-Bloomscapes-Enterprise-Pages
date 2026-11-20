
function addBloomscapesFlyerControl(parent,text,action,value) {
    const button=document.createElement('button');
    button.type='button';
    button.textContent=text;
    button.dataset.flyerAction=action;
    if (value!=null) button.dataset.flyerValue=value;
    return parent.appendChild(button);
}

function setupBloomscapesFlyerRail(state) {
    const rail=state.root.querySelector('.flyer-rail');
    rail.innerHTML='<h3>Assets</h3><div class="flyer-rail-tabs" aria-label="Flyer asset tabs"></div>'
        +'<label data-flyer-plant-search hidden>Find plants <input type="search" data-flyer-search placeholder="Name, item or location"></label>'
        +'<div class="flyer-asset-list"></div><label>Flyer folder <select data-flyer-folder aria-label="Flyer folder"></select></label>'
        +'<button type="button" data-flyer-action="auto-layout">⚡ Auto-Layout Entire Flyer Folder</button>';
    const tabs=rail.querySelector('.flyer-rail-tabs');
    for (const [key,label] of [['templates','Templates'],['plants','Live Evaluated Plants'],['badges','Badges & Stickers'],['type','Typography']]) {
        addBloomscapesFlyerControl(tabs,label,'assets',key);
    }
    paintBloomscapesFlyerRail(state,'templates');
    const search=rail.querySelector('[data-flyer-search]');
    search.addEventListener('input',()=>paintBloomscapesFlyerRail(state,'plants'));
}

function setBloomscapesFlyerFolderChoices(state,choices) {
    const field=state.root.querySelector('[data-flyer-folder]');
    const chosen=field.value || state.timeline.canvas.folder || state.options.folderName;
    const names=[...new Set([...choices,chosen].filter(Boolean))];
    field.replaceChildren(new Option('Choose folder',''),...names.map(name=>new Option(name,name)));
    field.value=chosen;
}

function bloomscapesFlyerPlantButtons(state,host,search) {
    const terms=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const plants=(state.livePlants ||= bloomscapesFlyerLivePlants()).filter(row=>{
        const label=[row.text,row.itemcode,row.detail,row.location].join(' ').toLowerCase();
        return terms.every(term=>label.includes(term));
    });
    const count=40;
    const visible=plants.slice(0,state.assetLimit || count);
    state.railPlants=new Map(visible.map(row=>[row.sourceId,row]));
    for (const row of visible) {
        const button=addBloomscapesFlyerControl(host,row.text+' · '+row.itemcode+(row.detail?' · '+row.detail:''),'plant',row.sourceId);
        if (row.image) {
            const image=document.createElement('img');
            image.src=row.image;image.loading='lazy';image.alt='';image.referrerPolicy='no-referrer';
            button.prepend(image);
        }
        button.draggable=true;
        button.addEventListener('dragstart',event=>{
            state.dragSource=row.sourceId;
            event.dataTransfer.setData('text/plain',row.sourceId);
            event.dataTransfer.effectAllowed='copy';
        });
        button.addEventListener('dragend',()=>{state.dragSource=null;});
    }
    if (!visible.length) host.textContent='No eligible evaluated plants match this search.';
    if (plants.length>visible.length) addBloomscapesFlyerControl(host,'Show more plants','more-assets',visible.length+count);
}

function paintBloomscapesFlyerRail(state,key) {
    const rail=state.root.querySelector('.flyer-rail');
    const host=rail.querySelector('.flyer-asset-list');
    host.replaceChildren();
    for (const button of rail.querySelectorAll('[data-flyer-action=assets]')) button.setAttribute('aria-pressed',String(button.dataset.flyerValue===key));
    rail.querySelector('[data-flyer-plant-search]').hidden=key!=='plants';
    if (key==='plants') return bloomscapesFlyerPlantButtons(state,host,rail.querySelector('[data-flyer-search]').value);
    const choices=key==='templates' ? bloomscapesFlyerTemplateChoices()
        :key==='badges'?[['New arrival','New arrival'],['In season','In season'],['Staff pick','Staff pick'],['Limited quantities','Limited quantities']]
        :[['Heading','Heading'],['Subheading','Subheading'],['Body text','Body text']];
    for (const [value,label] of choices) addBloomscapesFlyerControl(host,label,key==='templates'?'template':key==='badges'?'badge':'text',value);
}

function paintBloomscapesFlyerInspector(state) {
    const host=state.root.querySelector('.flyer-style');
    const page=state.timeline.canvas.pages[state.page];
    const element=page.elements.find(item=>item.id===state.selection);
    host.innerHTML='<h3>Styling inspector</h3><label>Page background <input type="color" data-flyer-property="background"></label>';
    host.querySelector('[data-flyer-property]').value=page.background;
    if (!element) {
        host.appendChild(document.createElement('p')).textContent='Select an object to style or move it.';
        return;
    }
    host.insertAdjacentHTML('beforeend','<div class="flyer-style-fields">'
        +'<label class="flyer-wide">Text<textarea maxlength="300" data-flyer-property="text"></textarea></label>'
        +'<label>Fill<input type="color" data-flyer-property="fill"></label><label>Text color<input type="color" data-flyer-property="ink"></label>'
        +'<label>Font<select data-flyer-property="font"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>'
        +'<label>Font size<input type="number" min="9" max="140" data-flyer-property="fontSize"></label>'
        +'<label>Alignment<select data-flyer-property="align"><option>left</option><option>center</option><option>right</option></select></label>'
        +'<label>Bold<input type="checkbox" data-flyer-property="bold"></label>'
        +'<label>X<input type="number" min="0" data-flyer-property="x"></label><label>Y<input type="number" min="0" data-flyer-property="y"></label>'
        +'<label>Width<input type="number" min="32" data-flyer-property="w"></label><label>Height<input type="number" min="26" data-flyer-property="h"></label>'
        +'</div><div class="flyer-inspector-actions"></div>');
    for (const input of host.querySelectorAll('[data-flyer-property]:not([data-flyer-property=background])')) {
        const value=element[input.dataset.flyerProperty];
        if (input.type==='checkbox') input.checked=value;
        else input.value=value;
    }
    const actions=host.querySelector('.flyer-inspector-actions');
    for (const [key,text] of [['front','Bring to front'],['back','Send to back'],['duplicate','Duplicate'],['delete','Remove']]) {
        addBloomscapesFlyerControl(actions,text,key);
    }
}
