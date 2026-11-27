const BLOOMSCAPES_FLYER_SIZES=Object.freeze({
    letter:{label:'8.5 × 11 in',width:816,height:1056},
    landscape:{label:'11 × 8.5 in',width:1056,height:816},
    social:{label:'Social square',width:1080,height:1080}
});
const BLOOMSCAPES_FLYER_PAGE_LIMIT=24;
const BLOOMSCAPES_FLYER_ELEMENT_LIMIT=96;
const BLOOMSCAPES_FLYER_FONTS=Object.freeze({sans:'Arial, sans-serif',serif:'Georgia, serif',mono:'Courier New, monospace'});
const flyerColor=(value,fallback)=>/^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
const flyerText=(value,cap=300)=>String(value ?? '').slice(0,cap);
const flyerNumber=(value,fallback)=>Number.isFinite(Number(value)) ? Number(value) : fallback;
const flyerRange=(value,min,max)=>Math.max(min,Math.min(max,value));

/**
 * @param {unknown} value
 * @returns {string} Allowed flyer photo URL or an empty string.
 */
function bloomscapesFlyerImage(value) {
    const source=String(value || '');
    return /^https:\/\/ozuligoikpyzgnmeccrw\.supabase\.co\/storage\/v1\/object\/public\/bloomscapes-evaluation-photos\/[A-Za-z0-9_./-]+$/.test(source)
        && !source.split('/').some(segment=>segment==='.' || segment==='..') ? source : '';
}

/** @returns {object} Empty flyer page with a new identity. */
function createBloomscapesFlyerPage() {
    return {id:crypto.randomUUID(),background:'#fffdf5',elements:[]};
}

/**
 * @param {string} type
 * @param {object} [props]
 * @returns {object} Flyer element with a new identity and the requested properties.
 */
function makeBloomscapesFlyerElement(type,props={}) {
    return {...props,id:crypto.randomUUID(),type};
}

function bloomscapesFlyerBounds(element,size) {
    const w=flyerRange(Math.round(flyerNumber(element.w,216)),32,size.width);
    const h=flyerRange(Math.round(flyerNumber(element.h,120)),26,size.height);
    return {w,h,x:flyerRange(Math.round(flyerNumber(element.x,48)),0,size.width-w),
        y:flyerRange(Math.round(flyerNumber(element.y,48)),0,size.height-h)};
}

function bloomscapesFlyerPlantFields(element) {
    return {image:bloomscapesFlyerImage(element.image),sourceId:flyerText(element.sourceId,240),
        itemcode:flyerText(element.itemcode,60),detail:flyerText(element.detail,140),
        unavailable:element.unavailable===true};
}

function normalizeBloomscapesFlyerElement(element,size) {
    const type=['text','badge','plant'].includes(element?.type) ? element.type : 'text';
    return {id:flyerText(element?.id,80) || crypto.randomUUID(),type,...bloomscapesFlyerBounds(element || {},size),
        text:flyerText(element?.text),fill:flyerColor(element?.fill,type==='badge'?'#d8f38f':'#ffffff'),
        ink:flyerColor(element?.ink,'#173b27'), font:Object.hasOwn(BLOOMSCAPES_FLYER_FONTS,element?.font)?element.font:'sans',
        fontSize:flyerRange(flyerNumber(element?.fontSize,type==='plant'?24:36),9,140),
        bold:element?.bold===true,align:['left','center','right'].includes(element?.align)?element.align:'left',
        ...(type==='plant'?bloomscapesFlyerPlantFields(element):{})};
}

function normalizeBloomscapesFlyerPage(page,size) {
    return {id:flyerText(page?.id,80) || crypto.randomUUID(),background:flyerColor(page?.background,'#fffdf5'),
        elements:(Array.isArray(page?.elements)?page.elements:[]).slice(0,BLOOMSCAPES_FLYER_ELEMENT_LIMIT)
            .map(element=>normalizeBloomscapesFlyerElement(element,size))};
}

/**
 * @param {object} [canvas]
 * @returns {object} Bounded flyer document with normalized pages and elements.
 */
function normalizeBloomscapesFlyerDesign(canvas={}) {
    const format=Object.hasOwn(BLOOMSCAPES_FLYER_SIZES,canvas?.format) ? canvas.format:'letter';
    const pages=Array.isArray(canvas?.pages) && canvas.pages.length ? canvas.pages:[createBloomscapesFlyerPage()];
    return {version:1,title:flyerText(canvas?.title || 'Untitled flyer',120),folder:flyerText(canvas?.folder,120),
        format,pages:pages.slice(0,BLOOMSCAPES_FLYER_PAGE_LIMIT).map(page=>normalizeBloomscapesFlyerPage(page,BLOOMSCAPES_FLYER_SIZES[format]))};
}

/**
 * @param {object} canvas
 * @param {string} format
 * @returns {object} Flyer normalized to the requested page size.
 */
function resizeBloomscapesFlyerDesign(canvas,format) {
    const before=BLOOMSCAPES_FLYER_SIZES[canvas.format],after=BLOOMSCAPES_FLYER_SIZES[format];
    if (!after || format===canvas.format) return canvas;
    const pages=canvas.pages.map(page=>({...page,elements:page.elements.map(element=>({...element,
        x:element.x*after.width/before.width,y:element.y*after.height/before.height,
        w:element.w*after.width/before.width,h:element.h*after.height/before.height}))}));
    return normalizeBloomscapesFlyerDesign({...canvas,format,pages});
}

/**
 * @param {object} initial
 * @returns {object} Undo and redo controls for the supplied design.
 */
function createBloomscapesFlyerTimeline(initial) {
    let current=normalizeBloomscapesFlyerDesign(initial);
    const undo=[],redo=[];
    return {
        get canvas(){return current;},get canUndo(){return undo.length>0;},get canRedo(){return redo.length>0;},
        commit(next){
            const candidate=normalizeBloomscapesFlyerDesign(next);
            if (JSON.stringify(candidate)===JSON.stringify(current)) return false;
            undo.push(current);
            if (undo.length>40) undo.shift();
            current=candidate;
            redo.length=0;
            return true;
        },
        undo(){if (undo.length) { redo.push(current);current=undo.pop(); }},
        redo(){if (redo.length) { undo.push(current);current=redo.pop(); }}
    };
}

function bloomscapesFlyerAxisGuide(value,extent,boundary,offsets,radius) {
    const targets=[0,boundary/2,boundary,...offsets];
    const edges=[0,extent/2,extent];
    const closest=targets.flatMap(target=>edges.map(edge=>({target,delta:target-value-edge})))
        .sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
    return Math.abs(closest.delta)<=radius ? {value:value+closest.delta,line:closest.target}:{value,line:null};
}

/**
 * @param {object} element
 * @param {object} size
 * @param {Array<object>} neighbors
 * @param {number} [radius]
 * @returns {object} Bounded element position with alignment guides.
 */
function snapBloomscapesFlyerElement(element,size,neighbors,radius=8) {
    const x=bloomscapesFlyerAxisGuide(element.x,element.w,size.width,neighbors.flatMap(row=>[row.x,row.x+row.w/2,row.x+row.w]),radius);
    const y=bloomscapesFlyerAxisGuide(element.y,element.h,size.height,neighbors.flatMap(row=>[row.y,row.y+row.h/2,row.y+row.h]),radius);
    return {...bloomscapesFlyerBounds({...element,x:x.value,y:y.value},size),guideX:x.line,guideY:y.line};
}

/**
 * @param {object} element
 * @param {object} size
 * @param {Array<object>} neighbors
 * @param {number} [radius]
 * @returns {object} Bounded element size with alignment guides.
 */
function snapBloomscapesFlyerResize(element,size,neighbors,radius=8) {
    const x=bloomscapesFlyerAxisGuide(element.x+element.w,0,size.width,neighbors.flatMap(row=>[row.x,row.x+row.w/2,row.x+row.w]),radius);
    const y=bloomscapesFlyerAxisGuide(element.y+element.h,0,size.height,neighbors.flatMap(row=>[row.y,row.y+row.h/2,row.y+row.h]),radius);
    return {...bloomscapesFlyerBounds({...element,w:x.value-element.x,h:y.value-element.y},size),guideX:x.line,guideY:y.line};
}

/**
 * @param {object} element
 * @returns {string} Visible text content for the element.
 */
function bloomscapesFlyerElementText(element) {
    return element.type==='plant' ? [element.text,[element.itemcode,element.detail].filter(Boolean).join(' · '),
        element.unavailable?'No longer eligible in live inventory':''].filter(Boolean).join('\n') : element.text;
}

/**
 * @param {object} element
 * @returns {object} Drawing bounds for text within the element.
 */
function bloomscapesFlyerTextRect(element) {
    const pad=element.type==='plant'?14:10;
    const top=element.type==='plant'?Math.round(element.h*.57):0;
    return {x:pad,y:top+pad,w:Math.max(0,element.w-2*pad),h:Math.max(0,element.h-top-2*pad),imageHeight:top};
}
