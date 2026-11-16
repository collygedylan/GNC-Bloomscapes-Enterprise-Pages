function bloomscapesPlanningCardMarkup(row) {
    const plans=bloomscapesPlanningRows(row),metrics=[];
    if (!plans.length) metrics.push(['Planning reference','No exact imported match · review required']);
    for (const plan of plans.filter(plan=>['Y_AUDIT','CAN_FILL','BUNCH'].includes(plan.kind))) {
        if (plan.kind==='Y_AUDIT') metrics.push(...bloomscapesPlanningShiftFacts(plan));
        if (plan.kind==='CAN_FILL') metrics.push(['Can Filling',bloomscapesPlanningCanLabel(plan)]);
        if (plan.kind==='BUNCH' && plan.disposition) metrics.push(['Bunch recommendation',plan.disposition]);
    }
    const water=plans.find(plan=>plan.water_rating_label);
    if (water) metrics.push(['Water demand',water.water_rating_label+' · '+water.hydro_zone]);
    for (const plan of plans.filter(plan=>plan.review_required)) metrics.push(['Source requires review',plan.review_reason]);
    const shield=bloomscapesPlanningShield(row);
    if (plans.length || shield.reserved) metrics.push(['Planting reservation',shield.label]);
    if (!metrics.length) return '<section data-planning-card>No exact master planning reference recorded for this row.</section>';
    return '<section data-planning-card><h4>Master Planning Intelligence</h4><dl>'+metrics.map(([key,value])=>
        '<div><dt>'+escapeHtml(key)+'</dt><dd>'+escapeHtml(String(value ?? 'Not recorded'))+'</dd></div>').join('')+'</dl></section>';
}

function bloomscapesPlanningShiftFacts(plan) {
    return [['Disposition',bloomscapesPlanningShiftStatus(plan)],['2027 Shift Needed',plan.prod_sched_2027_shift_needed],
        ['Already at Dest Block',plan.already_at_dest_block_qty],['Still to Haul Shift Qty',plan.still_to_haul_shift_qty],
        ['Trapped Units on Row',plan.trapped_units_on_row],['Recommended Action',plan.recommended_erp_action],
        ['Haul to destination',plan.haul_to_dest_instruction]];
}

function bloomscapesPlanningCanLabel(plan) {
    return 'Target '+plan.locationcode+' · CSV-Target Plant Date '+(plan.csv_target_plant_date || 'Not recorded')
        +' · Can Fill Window (T-14d to T-5d) '+(plan.can_fill_start || 'Not recorded')+' → '+(plan.can_fill_due || 'Not recorded')
        +' · '+plan.required_cans+' cans / '+plan.required_beds+' beds · Media '+(plan.media_code || 'Not recorded')
        +' + Fertilizer '+(plan.fertilizer_recipe || 'Not recorded');
}

function hydrateBloomscapesPlanningCards(host,rows) {
    const owner=getSupabaseReadIdentityScope(),farm=getBloomscapesFarm(),view=getCurrentVisibleViewId();
    const revision=host.dataset.planningRevision;
    const current=()=>host.isConnected && host.dataset.planningRevision===revision && view===getCurrentVisibleViewId()
        && owner===getSupabaseReadIdentityScope() && farm===getBloomscapesFarm();
    void ensureBloomscapesPlanningRows(rows,current).then(result=>{
        if (!result.some(Boolean) || !host.isConnected || owner!==getSupabaseReadIdentityScope() || farm!==getBloomscapesFarm()) return;
        for (const card of host.children) {
            const id=card.querySelector('[data-work-source-row]')?.dataset.workSourceRow;
            const row=rows.find(row=>String(row.UNIQUE_ID || row.unique_id)===id);
            const panel=card.querySelector('[data-planning-card]');
            if (row && panel) panel.outerHTML=bloomscapesPlanningCardMarkup(row);
        }
    });
}

function prefillBloomscapesPlanningWork(form,source) {
    const id=form.elements.sourceId.value,owner=getSupabaseReadIdentityScope();
    const revision=String(Number(form.dataset.planningRevision || 0)+1);form.dataset.planningRevision=revision;
    if (!form.dataset.planningBound) {
        form.dataset.planningBound='true';
        form.addEventListener('input',()=>{form.dataset.planningRevision=String(Number(form.dataset.planningRevision)+1);});
    }
    const apply=()=>{
        if (!form.isConnected || owner!==getSupabaseReadIdentityScope() || form.elements.sourceId.value!==id || form.dataset.planningRevision!==revision) return;
        applyBloomscapesPlanningPrefill(form,source);
    };
    apply();
    void ensureBloomscapesPlanningRows([source]).then(apply);
}

function applyBloomscapesPlanningPrefill(form,source) {
    const shift=bloomscapesPlanningRows(source,'Y_AUDIT').filter(plan=>!plan.review_required);
    if (['Shift Grading','Haul'].includes(form.elements.actionType.value) && shift.length===1) {
        const plan=shift[0],target=bloomscapesPlanningTarget(plan);
        selectBloomscapesPlanningTarget(form,target);
        form.elements.instructions.value=plan.haul_to_dest_instruction || plan.recommended_erp_action || '';
    }
    if (form.elements.workView.value==='CAN_FILLING') mountBloomscapesCanFillPlans(form,source);
}

function mountBloomscapesCanFillPlans(form,source) {
    const plans=bloomscapesPlanningRows(source,'CAN_FILL').filter(plan=>!plan.review_required);
    let label=form.querySelector('[data-can-fill-plans]');
    if (!label) {label=document.createElement('label');label.dataset.canFillPlans='true';form.prepend(label);}
    label.replaceChildren();label.hidden=!plans.length;
    if (!plans.length) return;
    label.appendChild(document.createTextNode('Media + Fertilizer Batch'));
    const select=label.appendChild(document.createElement('select'));
    for (const [index,plan] of plans.entries()) select.add(new Option(bloomscapesPlanningCanLabel(plan),String(index)));
    const apply=()=>{
        const plan=plans[Number(select.value)];
        form.elements.media.value=plan.media_code;form.elements.fertilizer.value=plan.fertilizer_recipe;
        form.elements.dueOn.value=plan.can_fill_due || '';form.elements.instructions.value=bloomscapesPlanningCanLabel(plan);
        form.elements.percent.value='';form.elements.quantity.value=plan.required_cans ?? '';
        if (![...form.elements.targetLocation.options].some(option=>option.value===plan.locationcode)) form.elements.targetLocation.add(new Option(plan.locationcode,plan.locationcode));
        form.elements.targetLocation.value=plan.locationcode;
    };
    select.addEventListener('change',apply);apply();
}

function decorateBloomscapesConsolidationChoice(button,row,source) {
    const shield=bloomscapesPlanningShield(row),plans=bloomscapesPlanningRows(row);
    const demand=plans.find(plan=>plan.water_rating_min!=null);
    const sourcePlan=bloomscapesPlanningRows(source).find(plan=>plan.water_rating_min!=null);
    const compatible=demand && sourcePlan?demand.water_rating_min===sourcePlan.water_rating_min
        && demand.water_rating_max===sourcePlan.water_rating_max:null;
    button.textContent+=' · CPB '+(row.cpb || plans.find(plan=>plan.cpb)?.cpb || 'Not recorded')+' · Water '+(demand?.water_rating_label || 'Not recorded')
        +' · '+(compatible===null?'Water compatibility requires review':compatible?'Matching documented water band; verify irrigation':'Water bands differ; irrigation review required')+' · '+shield.label;
    button.disabled=shield.reserved;
}

function selectBloomscapesPlanningTarget(form,target) {
    if (!target) return;
    if (![...form.elements.targetLocation.options].some(option=>option.value===target)) form.elements.targetLocation.add(new Option(target+' · Master Plan',target));
    form.elements.targetLocation.value=target;
}
