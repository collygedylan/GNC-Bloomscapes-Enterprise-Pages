const code39Characters='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
const code39Values=[20957,29783,23639,30485,20951,29813,23669,20855,29789,23645,29975,23831,
  30533,22295,30149,24005,21623,29981,23837,22301,30023,23879,30545,22343,30161,24017,21959,30065,
  23921,22385,29015,18263,29141,17879,29045,18293,17783,29021,18269,17477,17489,17681,20753,35770];

export function workBarcodeCommands(code,x,y,width) {
  if(!/^GNC-LAB-[0-9]{2}-[0-9]{4}$/.test(code)) throw Error('Invalid lab barcode accession');
  const encoding=character=>code39Values[code39Characters.indexOf(character)].toString(2);
  const bits=encoding('*')+Array.from(code,character=>encoding(character)+'0').join('')+encoding('*');
  const unit=(width-40)/bits.length;
  const commands=['0 0 0 rg'];
  let cursor=0;
  for(const run of bits.match(/1+|0+/g)) {
    if(run[0]==='1') commands.push(`${(x+20+cursor*unit).toFixed(3)} ${y.toFixed(2)} ${(run.length*unit).toFixed(3)} 44 re f`);
    cursor+=run.length;
  }
  return commands;
}

export function buildWorkInquiryBlocks(report,wrapText,width) {
  const blocks=[];
  const text=(value,size=10,bold=false)=>({lines:wrapText(String(value),width,size,bold?'Helvetica-Bold':'Helvetica'),
    size,font:bold?'Helvetica-Bold':'Helvetica',indent:0,before:0,after:8,keep:true});
  blocks.push({...text(report.work_type,18,true),title:true});
  if(report.barcode) {
    blocks.push({barcode:report.barcode,before:4,after:4,keep:true});
    blocks.push(text(report.barcode,14,true));
  }
  blocks.push(text('Document receipt: '+report.note_number,9));
  for(const card of report.cards || []) {
    blocks.push(text([card.commonname,card.contsize,card.itemcode].filter(Boolean).join(' · '),13,true));
  }
  blocks.push(text(report.instructions));
  if(report.barcode) blocks.push(text('Lab result: ____________________    Reviewed by: ____________________',10));
  return blocks;
}
