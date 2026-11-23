const consolidationCans = new Intl.NumberFormat(undefined,{maximumFractionDigits:2});
const consolidationBeds = new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

function formatConsolidationBeds(value) {
    return value == null ? 'Unknown' : consolidationBeds.format(value);
}

function renderFieldWorkConsolidationLots(group,cpb) {
    return '<div class="consolidation-stock">'+group.lots.toSorted((a,b)=>LocationCode.compare(a.location,b.location))
        .map(lot=>renderFieldWorkConsolidationLot(lot,cpb)).join('')+'</div>';
}

function renderFieldWorkConsolidationLot(lot,cpb) {
    const known = Number(cpb?.cpb)>0;
    const basis = known ? cpb.cpb_source : 'CPB unavailable';
    const beds = known ? lot.quantity/Number(cpb.cpb) : null;
    return '<article><strong>'+esc(lot.location || 'Location not recorded')+'</strong>'
        +'<span>Lot '+esc(lot.lot || 'not recorded')+' · '+esc(lot.source || 'Source not recorded')+'</span>'
        +'<span>'+consolidationCans.format(lot.quantity)+' cans on hand</span>'
        +'<span>'+(known ? consolidationCans.format(cpb.cpb)+' CPB ' : '')+'<small>'+esc(basis)+'</small></span>'
        +'<span>'+formatConsolidationBeds(beds)+' beds occupied</span></article>';
}

function renderFieldWorkConsolidationAdvice(group,data,showAll) {
    const {existing,fallback,winner} = rankFieldWorkConsolidation(group,data.suggestions,data.locations);
    const featured = showAll ? fallback : [...new Set([...fallback.slice(0,6),...fallback.filter(option=>Number(option.beds.total_beds)===0)])];
    return renderConsolidationSection('Existing Item Locations',existing,winner,true)
        +renderConsolidationSection('Open Nursery Fallback Blocks',featured,winner,false)
        +(featured.length<fallback.length ? '<button type="button" data-consolidation-action="more">Show all '+fallback.length+' fallback options</button>' : '');
}

function renderConsolidationSection(title,options,winner,labelOptions) {
    const cards = options.map((option,index)=>renderConsolidationDestination(option,option===winner,labelOptions ? index+1 : 0));
    return '<section class="consolidation-destinations"><h4>'+title+'</h4>'
        +(cards.length ? cards.join('') : '<p>No measured move options returned.</p>')+'</section>';
}

function renderConsolidationDestination(option,recommended,index) {
    const {row,beds} = option;
    const titles = ['Total Block Beds','Occupied Now (All Items)','Reserved 2027 Planting Beds','Open Beds Available','Beds Needed for Move'];
    const values = [beds.total_beds,row.occupied_beds_now,beds.reserved_2027_beds,row.open_beds_available,row.beds_needed_for_move];
    const proof = titles.map((title,i)=>'<div><dt>'+title+'</dt><dd>'+formatConsolidationBeds(values[i])+'</dd></div>').join('');
    return '<article data-consolidation-destination class="consolidation-destination">'
        +(recommended ? '<p class="consolidation-fits">#1 Recommended · 100% Whole-Group Move</p>' : '')
        +(index ? '<small>Option '+index+'</small>' : '')
        +'<h5>'+esc(row.source_locationcode)+' → '+esc(row.destination_locationcode)+'</h5>'
        +'<p>Move '+consolidationCans.format(row.cans_to_move_in)+' cans · '+formatConsolidationBeds(row.cpb_used)+' CPB · '+esc(row.cpb_source)+'</p>'
        +'<dl>'+proof+'</dl>'+renderConsolidationSafeguards(option)+'</article>';
}

function renderConsolidationSafeguards({row,beds,fits}) {
    const balance = row.open_beds_available == null || row.beds_needed_for_move == null ? null : row.open_beds_available-row.beds_needed_for_move;
    const capacity = Number(beds.total_beds)===0 ? 'Bed count not configured yet — update in Table Management → Location Beds'
        : balance===null ? 'Capacity unverified'
        : balance<0 ? '✕ SHORT BY '+formatConsolidationBeds(-balance)+' BEDS'
        : '✓ FITS (+'+formatConsolidationBeds(balance)+' open beds left)';
    const compatible = 'Shade '+(row.shade_compatible ? 'compatible' : 'not verified')+' · Water '+(row.water_compatible ? 'compatible' : 'not verified');
    const sources = row.source_mix_warning?.split(' — ')[0]?.split(' + ') || [];
    if (sources.includes('SH') && sources.includes('LD')) sources.sort((a,b)=>(a==='SH' ? -1 : 0)-(b==='SH' ? -1 : 0));
    const mix = sources.length>1
        ? '<p class="consolidation-mixed"><strong>'+esc(sources.join(' + '))+'</strong> · Merges sources on one physical location while preserving separate LOTCODEs</p>' : '';
    return '<p class="'+(fits ? 'consolidation-fits' : 'consolidation-warning')+'">'+capacity+'</p>'
        +'<p><small>'+compatible+'</small></p>'+mix;
}
