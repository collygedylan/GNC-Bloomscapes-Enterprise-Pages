/* global getMainAreaScrollTop, setMainAreaScrollTop */
(function(root) {
 'use strict';
  const normalize = value => String(value ?? '').trim().toUpperCase().replace(/\.+$/, '');
  // Only a numeric third segment is a bay. Other codes retain their full identity.
  const base = value => normalize(value).replace(/^([A-Z0-9]+\.\d+)\.\d+$/, '$1');
  function compareLocationCodeNatural(leftValue, rightValue, compareText = null) {
   const parse = value => {
    const clean = normalize(value);
    const match = clean.match(/^([A-Z]+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!match) return { raw:clean, block:clean, parts:[] };
    return { raw:clean, block:match[1] || '', parts:[match[2],match[3],match[4]].filter(part=>part!==undefined).map(Number) };
   };
   const left=parse(leftValue), right=parse(rightValue);
   const text=typeof compareText==='function'?compareText:(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
   const blockCompare=text(left.block,right.block); if(blockCompare)return blockCompare;
   const length=Math.max(left.parts.length,right.parts.length);
   for(let index=0;index<length;index++){
    const leftPart=Number.isFinite(left.parts[index])?left.parts[index]:-1;
    const rightPart=Number.isFinite(right.parts[index])?right.parts[index]:-1;
    if(leftPart!==rightPart)return leftPart-rightPart;
   }
   return text(left.raw,right.raw);
  }
  function group(values, preserveOrder = false) {
   const groups = new Map();
   const codes = [...new Set(values.map(normalize).filter(Boolean))];
   if (!preserveOrder) codes.sort(compareLocationCodeNatural);
   codes.forEach(code=>{
   const key=base(code); if(!groups.has(key))groups.set(key,[]);groups.get(key).push(code);
  });
  return groups;
 }
  root.compareLocationCodeNatural=compareLocationCodeNatural;
  root.LocationCode={normalize,base,compare:compareLocationCodeNatural,group,...createLocationCardNavigation(root,normalize,base,group)};
})(globalThis);

function createLocationCardNavigation(root,normalize,base,group) {
 const views=new Map();
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const arg=value=>escape(JSON.stringify(value));
 function prepareView(key,entries,code,render,mount,preserveOrder) {
  const prior=views.get(key), groups=group(entries.map(code),preserveOrder);
  const view={key,entries,code,render,mount,groups,preserveOrder,selected:prior?.selected||'',scroll:prior?.scroll||0};
  if(!groups.has(view.selected))view.selected='';
  views.set(key,view);
  return view;
 }
 function renderLocationWindowRow(view,row) {
  if('entry' in row)return view.render(row.entry);
  const {name,codes}=row;
  return `<button type="button" class="location-base-card" onclick="LocationCode.open(${arg(view.key)},${arg(name)})" aria-label="Open location ${escape(name)}"><span><small>Location Code</small><strong>${escape(name)}</strong><span>${codes.length} full locations / bays</span></span><i class="ph-bold ph-caret-right" aria-hidden="true"></i></button>`;
 }
 function locationSection(view,html='') {
  return `<section data-location-navigation="${escape(view.key)}" data-location-bays="${view.selected?'true':'false'}">${html}</section>`;
 }
 function cards(key,entries,code,render,preserveOrder) {
  const view=prepareView(key,entries,code,render,null,preserveOrder);
  return locationSection(view,locationWindowRows(view,normalize,base).map(row=>renderLocationWindowRow(view,row)).join(''));
 }
 function windowCards(key,entries,code,render,mount,preserveOrder) {
  const view=prepareView(key,entries,code,render,mount,preserveOrder);
  mountLocationWindow(view);
 }
 function mountLocationWindow(view) {
  view.mount(locationWindowRows(view,normalize,base),row=>renderLocationWindowRow(view,row),locationSection(view),view.selected);
 }
 function element(key) {return [...document.querySelectorAll('[data-location-navigation]')].find(el=>el.dataset.locationNavigation===key&&!el.closest('.hidden'));}
 function paint(key) {
  const v=views.get(key),el=element(key);
  if(!v||!el)return;
  if(v.mount)mountLocationWindow(v);
  else el.outerHTML=cards(key,v.entries,v.code,v.render,v.preserveOrder);
 }
 function open(key,value) {const v=views.get(key);if(!v)return;v.scroll=typeof getMainAreaScrollTop==='function'?getMainAreaScrollTop():(root.scrollY||0);v.selected=value;paint(key);typeof setMainAreaScrollTop==='function'?setMainAreaScrollTop(0):root.scrollTo?.(0,0);}
 function back() {
  const el=[...document.querySelectorAll('[data-location-bays="true"]')].find(el=>!el.closest('.hidden')&&el.getClientRects().length);
  if(!el)return false;const key=el.dataset.locationNavigation,v=views.get(key);if(!v)return false;
  v.selected='';paint(key);typeof setMainAreaScrollTop==='function'?setMainAreaScrollTop(v.scroll):root.scrollTo?.(0,v.scroll);return true;
 }
 return {cards,windowCards,open,back,reset:()=>views.clear()};
}

function locationWindowRows(view,normalize,base) {
  if(view.selected)return view.entries.filter(entry=>base(view.code(entry))===view.selected)
    .sort((left,right)=>globalThis.LocationCode.compare(view.code(left),view.code(right))).map(entry=>({entry}));
  const byCode=new Map();
  for(const entry of view.entries){
   const id=normalize(view.code(entry));
   if(!byCode.has(id))byCode.set(id,[]);
   byCode.get(id).push({entry});
  }
  return [...view.groups].flatMap(([name,codes])=>codes.length===1&&codes[0]===name?byCode.get(name):[{name,codes}]);
 }
