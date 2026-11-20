
function placeBloomscapesFlyerElement(node,shape) {
    Object.assign(node.style,{left:shape.x+'px',top:shape.y+'px',width:shape.w+'px',height:shape.h+'px'});
}

function makeBloomscapesFlyerGuide(axis) {
    const node=document.createElement('div');
    node.className='flyer-guide flyer-guide-'+axis;
    node.hidden=true;
    return node;
}

function styleBloomscapesFlyerText(node,element) {
    const rect=bloomscapesFlyerTextRect(element);
    Object.assign(node.style,{left:rect.x+'px',top:rect.y+'px',width:rect.w+'px',height:rect.h+'px',
        fontFamily:BLOOMSCAPES_FLYER_FONTS[element.font],fontSize:element.fontSize+'px',fontWeight:element.bold?'700':'400',textAlign:element.align});
    return rect;
}

function makeBloomscapesFlyerArtElement(element,editable) {
    const node=document.createElement('div');
    node.className='flyer-object';
    node.dataset.flyerObject=element.id;
    node.style.background=element.fill;
    node.style.color=element.ink;
    node.setAttribute('aria-label',element.text || 'Flyer object');
    if (editable) node.tabIndex=0;
    placeBloomscapesFlyerElement(node,element);
    const text=document.createElement('div');
    text.className='flyer-object-text';
    text.textContent=bloomscapesFlyerElementText(element);
    const rect=styleBloomscapesFlyerText(text,element);
    if (element.type==='plant') {
        const image=document.createElement(element.image?'img':'div');
        image.className='flyer-object-image';image.style.height=rect.imageHeight+'px';
        if (element.image) {image.alt='';image.src=element.image;image.referrerPolicy='no-referrer';image.draggable=false;}
        node.append(image);
    }
    node.append(text);
    if (editable) {
        const handle=node.appendChild(document.createElement('span'));
        handle.className='flyer-object-handle';handle.dataset.flyerResize='';
        handle.setAttribute('aria-hidden','true');
    }
    return node;
}

function setBloomscapesFlyerGuide(guide,value,property) {
    guide.hidden=value===null;
    if (value!==null) guide.style[property]=value+'px';
}

function beginBloomscapesFlyerPointer(event,frame,element,node) {
    if (event.button!==0) return;
    event.preventDefault();event.stopPropagation();
    const {sheet,size,controller,guides,page}=frame;
    const ratio=sheet.getBoundingClientRect().width/size.width;
    const resizing=!!event.target.closest('[data-flyer-resize]');
    const pointer={id:event.pointerId,x:event.clientX,y:event.clientY,changed:false};
    const neighbors=page.elements.filter(other=>other.id!==element.id);
    let shape=element;
    controller.select(element.id);
    node.focus({preventScroll:true});
    node.setPointerCapture(event.pointerId);
    const move=next=>{
        if (pointer.id!==next.pointerId) return;
        const dx=(next.clientX-pointer.x)/ratio,dy=(next.clientY-pointer.y)/ratio;
        if (!pointer.changed && Math.abs(dx)+Math.abs(dy)<3) return;
        pointer.changed=true;
        shape=resizing ? snapBloomscapesFlyerResize({...element,w:element.w+dx,h:element.h+dy},size,neighbors)
            : snapBloomscapesFlyerElement({...element,x:element.x+dx,y:element.y+dy},size,neighbors);
        const draft={...element,...shape};
        placeBloomscapesFlyerElement(node,draft);
        const rect=styleBloomscapesFlyerText(node.querySelector('.flyer-object-text'),draft);
        const image=node.querySelector('.flyer-object-image');
        if (image) image.style.height=rect.imageHeight+'px';
        setBloomscapesFlyerGuide(guides.x,shape.guideX,'left');
        setBloomscapesFlyerGuide(guides.y,shape.guideY,'top');
    };
    const end=next=>{
        if (pointer.id!==next.pointerId) return;
        node.removeEventListener('pointermove',move);
        node.removeEventListener('pointerup',end);
        node.removeEventListener('pointercancel',end);
        guides.x.hidden=guides.y.hidden=true;
        if (pointer.changed) controller.finishPointer(element.id,next.type==='pointerup'?shape:element);
    };
    node.addEventListener('pointermove',move);
    node.addEventListener('pointerup',end);
    node.addEventListener('pointercancel',end);
}

function markBloomscapesFlyerSelection(host,id) {
    for (const node of host.querySelectorAll('[data-flyer-object]')) {
        node.classList.toggle('flyer-object-selected',node.dataset.flyerObject===id);
    }
}

function paintBloomscapesFlyerArtboard(host,canvas,pageIndex,zoom,controller) {
    const size=BLOOMSCAPES_FLYER_SIZES[canvas.format],page=canvas.pages[pageIndex];
    const wrapper=document.createElement('div');
    wrapper.className='flyer-sheet-viewport';
    const sheet=wrapper.appendChild(document.createElement('div'));
    sheet.className='flyer-sheet';
    sheet.dataset.flyerPage=page.id;
    sheet.setAttribute('aria-label','Flyer page '+(pageIndex+1));
    Object.assign(sheet.style,{width:size.width+'px',height:size.height+'px',background:page.background});
    const scale=Math.max(.05,Math.min(1,(host.clientWidth-26)/size.width))*zoom;
    Object.assign(wrapper.style,{width:size.width*scale+'px',height:size.height*scale+'px'});
    sheet.style.transform='scale('+scale+')';
    const guides={x:makeBloomscapesFlyerGuide('x'),y:makeBloomscapesFlyerGuide('y')};
    const frame={sheet,size,controller,guides,page};
    for (const element of page.elements) {
        const node=makeBloomscapesFlyerArtElement(element,!controller.readOnly);
        if (!controller.readOnly) {
            node.addEventListener('pointerdown',event=>beginBloomscapesFlyerPointer(event,frame,element,node));
            node.addEventListener('focus',()=>controller.select(element.id));
        }
        sheet.append(node);
    }
    sheet.append(guides.x,guides.y);
    host.replaceChildren(wrapper);
    if (controller.readOnly) return;
    sheet.addEventListener('pointerdown',event=>{ if (event.target===sheet) controller.select(null); });
    sheet.addEventListener('dragover',event=>event.preventDefault());
    sheet.addEventListener('drop',event=>{
        event.preventDefault();
        const rect=sheet.getBoundingClientRect(),ratio=rect.width/size.width;
        controller.drop((event.clientX-rect.left)/ratio,(event.clientY-rect.top)/ratio);
    });
}
