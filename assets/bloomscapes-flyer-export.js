
function loadBloomscapesFlyerImage(url) {
    return new Promise(resolve=>{
        const image=new Image();
        image.crossOrigin='anonymous';
        image.referrerPolicy='no-referrer';
        const timer=setTimeout(()=>finish(null),5000);
        const finish=result=>{
            clearTimeout(timer);
            image.onload=image.onerror=null;
            resolve(result);
        };
        image.onload=()=>finish(image);
        image.onerror=()=>finish(null);
        image.src=url;
    });
}

function drawBloomscapesFlyerImage(ctx,image,width,height) {
    ctx.fillStyle='#e4eddf';
    ctx.fillRect(0,0,width,height);
    if (!image || height<=0) return;
    const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.save();
    ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
    ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
    ctx.restore();
}

function wrapBloomscapesFlyerText(ctx,text,width) {
    return text.split('\n').flatMap(paragraph=>{
        const lines=[];
        let line='';
        for (const word of paragraph.split(/\s+/)) {
            const next=line?line+' '+word:word;
            if (line && ctx.measureText(next).width>width) {
                lines.push(line);
                line=word;
            } else line=next;
        }
        return [...lines,line];
    });
}

function paintBloomscapesFlyerExportElement(ctx,element,image) {
    ctx.save();
    ctx.translate(element.x,element.y);
    ctx.beginPath();ctx.rect(0,0,element.w,element.h);ctx.clip();
    ctx.fillStyle=element.fill;ctx.fillRect(0,0,element.w,element.h);
    const rect=bloomscapesFlyerTextRect(element);
    if (element.type==='plant') drawBloomscapesFlyerImage(ctx,image,element.w,rect.imageHeight);
    ctx.fillStyle=element.ink;
    ctx.font=(element.bold?'700 ':'400 ')+element.fontSize+'px '+BLOOMSCAPES_FLYER_FONTS[element.font];
    ctx.textBaseline='top';ctx.textAlign=element.align;
    const height=Math.ceil(element.fontSize*1.2);
    const x=rect.x+rect.w*({left:0,center:.5,right:1}[element.align]);
    const lines=wrapBloomscapesFlyerText(ctx,bloomscapesFlyerElementText(element),rect.w);
    lines.slice(0,Math.ceil(rect.h/height)).forEach((line,index)=>ctx.fillText(line,x,rect.y+index*height,rect.w));
    ctx.restore();
}

async function paintBloomscapesFlyerExportPage(page,size,images) {
    const canvas=document.createElement('canvas');
    canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=page.background;ctx.fillRect(0,0,size.width,size.height);
    const assets=await Promise.all(page.elements.map(element=>{
        if (!element.image) return null;
        if (!images.has(element.image)) images.set(element.image,loadBloomscapesFlyerImage(element.image));
        return images.get(element.image);
    }));
    page.elements.forEach((element,index)=>paintBloomscapesFlyerExportElement(ctx,element,assets[index]));
    return canvas;
}

function encodeBloomscapesFlyerImage(canvas,mime,quality) {
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
        if (blob) resolve(blob);
        else reject(Error('This browser could not render the flyer artwork.'));
    },mime,quality));
}

async function renderBloomscapesFlyerExport(design,purpose) {
    const size=BLOOMSCAPES_FLYER_SIZES[design.format];
    const images=new Map(),pages=[],jpegs=[];
    let previewBlob=null;
    for (const page of design.pages) {
        const surface=await paintBloomscapesFlyerExportPage(page,size,images);
        if (purpose==='png' || !previewBlob) {
            const png=await encodeBloomscapesFlyerImage(surface,'image/png');
            previewBlob ||= png;
            if (purpose==='png') pages.push(png);
        }
        jpegs.push(await encodeBloomscapesFlyerImage(surface,'image/jpeg',.86));
    }
    return {previewBlob,pdfBlob:buildBloomscapesFlyerPdf(jpegs,size),pages};
}

function bloomscapesFlyerPdfObject(writer,id,head,payload=null) {
    writer.offsets[id]=writer.length;
    const text=new TextEncoder().encode(id+' 0 obj\n'+head+'\n');
    writer.add(text);
    if (payload) writer.add(payload);
    writer.add(new TextEncoder().encode(payload?'\nendstream\nendobj\n':'endobj\n'));
}

function bloomscapesFlyerPdfPage(writer,jpeg,index,size) {
    const id=3+index*3,w=size.width*.75,h=size.height*.75;
    bloomscapesFlyerPdfObject(writer,id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+
        '] /Resources << /XObject << /Img '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
    bloomscapesFlyerPdfObject(writer,id+1,'<< /Type /XObject /Subtype /Image /Width '+size.width+' /Height '+size.height+
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.size+' >>\nstream',jpeg);
    const draw=new TextEncoder().encode('q '+w+' 0 0 '+h+' 0 0 cm /Img Do Q');
    bloomscapesFlyerPdfObject(writer,id+2,'<< /Length '+draw.length+' >>\nstream',draw);
}

function buildBloomscapesFlyerPdf(jpegs,size) {
    const parts=[];
    const writer={offsets:[0],length:0,add(part){parts.push(part);this.length+=part.size ?? part.length;}};
    const encode=text=>new TextEncoder().encode(text);
    writer.add(encode('%PDF-1.4\n'));
    bloomscapesFlyerPdfObject(writer,1,'<< /Type /Catalog /Pages 2 0 R >>');
    const refs=jpegs.map((_,index)=>(3+index*3)+' 0 R').join(' ');
    bloomscapesFlyerPdfObject(writer,2,'<< /Type /Pages /Count '+jpegs.length+' /Kids ['+refs+'] >>');
    jpegs.forEach((jpeg,index)=>bloomscapesFlyerPdfPage(writer,jpeg,index,size));
    const position=writer.length;
    const offsets=writer.offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
    writer.add(encode('xref\n0 '+writer.offsets.length+'\n0000000000 65535 f \n'+offsets+
        'trailer\n<< /Size '+writer.offsets.length+' /Root 1 0 R >>\nstartxref\n'+position+'\n%%EOF\n'));
    return new Blob(parts,{type:'application/pdf'});
}

const bloomscapesFlyerCrcTable=Uint32Array.from({length:256},(_,index)=>{
    let value=index;
    for (let bit=0;bit<8;bit++) value=(value>>>1)^((value&1)?0xedb88320:0);
    return value>>>0;
});

function bloomscapesFlyerZipCrc(bytes) {
    let crc=0xffffffff;
    for (const byte of bytes) crc=(crc>>>8)^bloomscapesFlyerCrcTable[(crc^byte)&255];
    return (crc^0xffffffff)>>>0;
}

function bloomscapesFlyerZipRecord(length,fields,filename=new Uint8Array()) {
    const bytes=new Uint8Array(length+filename.length),view=new DataView(bytes.buffer);
    for (const [offset,size,value] of fields) {
        if (size===4) view.setUint32(offset,value,true);
        else view.setUint16(offset,value,true);
    }
    bytes.set(filename,length);
    return bytes;
}

async function bloomscapesFlyerPngZip(pages) {
    const files=[],entries=[];
    let offset=0;
    for (const [index,png] of pages.entries()) {
        const name=new TextEncoder().encode('page-'+(index+1)+'.png');
        const crc=bloomscapesFlyerZipCrc(new Uint8Array(await png.arrayBuffer()));
        const local=bloomscapesFlyerZipRecord(30,[[0,4,0x04034b50],[4,2,20],[14,4,crc],[18,4,png.size],[22,4,png.size],[26,2,name.length]],name);
        entries.push(bloomscapesFlyerZipRecord(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[16,4,crc],[20,4,png.size],
            [24,4,png.size],[28,2,name.length],[42,4,offset]],name));
        files.push(local,png);
        offset+=local.length+png.size;
    }
    const close=bloomscapesFlyerZipRecord(22,[[0,4,0x06054b50],[8,2,entries.length],[10,2,entries.length],
        [12,4,entries.reduce((sum,entry)=>sum+entry.length,0)],[16,4,offset]]);
    return new Blob([...files,...entries,close],{type:'application/zip'});
}

async function downloadBloomscapesFlyerExport(design,artwork,purpose) {
    const title=design.title.replace(/[^A-Za-z0-9 ._-]/g,'').trim() || 'Flyer';
    const single=artwork.pages.length===1;
    const blob=purpose==='pdf'?artwork.pdfBlob:single?artwork.pages[0]:await bloomscapesFlyerPngZip(artwork.pages);
    const file=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=file;
    link.download=title+(purpose==='pdf'?'.pdf':single?'.png':'-PNGs.zip');
    document.body.append(link);
    link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(file),60000);
}
