function isBloomscapesMeasuredWork(job) {
    return ['Bunch Count','Spread Count','Grade & Haul','Haul / Consolidate','Shift Grading','Haul','Consolidate'].includes(job.action_type)
        || job.action_type==='Spread Block (Spring)' && Boolean(job.target_location);
}

function renderBloomscapesWorkAnswers(form,job) {
    if (!isBloomscapesMeasuredWork(job)) return;
    form.elements.actualQuantity.closest('label').hidden=true;
    form.elements.actualQuantity.required=false;
    const rows=document.createElement('div');rows.dataset.measuredWorkAnswers='true';
    for (const row of job.source_rows) rows.appendChild(renderBloomscapesMeasuredRow(job,row));
    form.prepend(rows);
}

function renderBloomscapesMeasuredRow(job,row) {
    const fieldset=document.createElement('fieldset');fieldset.dataset.answerRow=row.id;
    const legend=fieldset.appendChild(document.createElement('legend'));
    legend.textContent=`${row.itemcode} @ ${row.locationcode} · ${row.lotcode} · Previous ${row.stock} · Planned ${row.quantity}`;
    const count=['Bunch Count','Spread Count'].includes(job.action_type);
    const grading=['Grade & Haul','Shift Grading'].includes(job.action_type);
    if (count) appendBloomscapesAnswerInput(fieldset,'countedQuantity','Physical Counted Qty (Counted On Hand)',row.stock);
    else {
        appendBloomscapesAnswerInput(fieldset,grading ? 'gradedQuantity' : 'hauledQuantity',
            grading ? 'Graded Qty' : 'Qty Hauled',grading?bloomscapesPlannedGradedQuantity(job,row):row.quantity);
        if (grading) appendBloomscapesAnswerInput(fieldset,'shortQuantity',job.action_type==='Shift Grading'?'Short Qty / CF# Balance':'Short / Scrap Qty',grading?Number(row.quantity)-bloomscapesPlannedGradedQuantity(job,row):0);
        const label=fieldset.appendChild(document.createElement('label'));label.textContent='Confirm To Location';
        const select=label.appendChild(document.createElement('select'));select.dataset.answerField='toLocation';select.required=true;
        select.appendChild(new Option('Choose exact destination',''));
        const locations=bloomscapesWorkBrowserRows().filter(candidate=>(candidate.ITEMCODE || candidate.itemcode)===row.itemcode
            && (candidate.LOTCODE || candidate.lotcode)===row.lotcode && (candidate.LOCATIONCODE || candidate.locationcode)!==row.locationcode);
        [...new Set(locations.map(candidate=>candidate.LOCATIONCODE || candidate.locationcode))].sort()
            .forEach(location=>select.appendChild(new Option(location,location)));
        if (['Shift Grading','Haul','Consolidate'].includes(job.action_type)) {
            select.replaceChildren(new Option(job.target_location,job.target_location));
        }
        select.value=job.target_location || '';
        const confirm=fieldset.appendChild(document.createElement('label'));confirm.textContent=`Confirm From Location: ${row.locationcode} `;
        const check=confirm.appendChild(document.createElement('input'));check.type='checkbox';check.required=true;check.dataset.answerField='confirmFrom';
    }
    return fieldset;
}

function appendBloomscapesAnswerInput(host,key,title,value) {
    const label=host.appendChild(document.createElement('label'));label.textContent=title;
    const input=label.appendChild(document.createElement('input'));
    input.type='number';input.min='0';input.step='1';input.required=true;input.value=value;input.dataset.answerField=key;
}

function readBloomscapesWorkAnswers(form,job) {
    const answers={actualQuantity:form.elements.actualQuantity.value,notes:form.elements.notes.value,
        acknowledge:form.elements.acknowledge.checked,
        ...(form.elements.canFillQuantity ? {canFillQuantity:form.elements.canFillQuantity.value} : {})};
    if (!isBloomscapesMeasuredWork(job)) return answers;
    answers.rows={};
    for (const fieldset of form.querySelectorAll('[data-answer-row]')) {
        const row={};
        for (const input of fieldset.querySelectorAll('[data-answer-field]')) row[input.dataset.answerField]=input.type==='checkbox' ? input.checked : input.value;
        answers.rows[fieldset.dataset.answerRow]=row;
    }
    return answers;
}

function bloomscapesBlockLifecycleStage(alpha,number) {
    const row=bloomscapesFieldQueueState.lifecycle?.find(row=>row.blockalpha===alpha && Number(row.blocknumber)===Number(number));
    return row?.stage || 'OPEN_FIELD';
}

function bloomscapesPlannedGradedQuantity(job,row) {
    if (job.action_type!=='Shift Grading' || job.command?.plannedGradedQuantity==null) return Number(row.quantity);
    const planned=Number(job.command.plannedGradedQuantity),total=Number(job.quantity);
    const index=job.source_rows.findIndex(member=>member.id===row.id);
    const before=job.source_rows.slice(0,index).reduce((sum,member)=>sum+Number(member.quantity),0);
    return Math.floor(planned*(before+Number(row.quantity))/total)-Math.floor(planned*before/total);
}
