function renderBloomscapesFieldWorkCard(job,status) {
    const card = document.createElement('article');
    card.dataset.workId = job.id;
    card.className = 'bloomscapes-field-work-card';
    const source=findItemByUniqueId(job.source_id) || job.source_snapshot;
    if (source && bloomscapesFarmRowIsVisible(source)) {
        const identity=card.appendChild(document.createElement('div'));
        identity.innerHTML=bloomscapesWorkIdentityMarkup(source,{assignedTo:job.assigned_to_username || 'Unassigned'});
    }
    const command=job.workflow_command || job.command || {};
    if (command.jobCode) {
        const label=card.appendChild(document.createElement('label'));
        label.textContent='Job Code / Project Description';
        const select=label.appendChild(document.createElement('select'));
        select.add(new Option(command.jobDescription || command.jobCode,command.jobCode));
        select.disabled=true;
    }
    const heading = card.appendChild(document.createElement('h3'));
    heading.textContent = `${job.work_view==='SHEARING' ? (job.status==='OPEN' ? '#? Needs Shear · ' : '#✓ Sheared · ') : ''}${job.action_type} · ${job.itemcode} · ${job.farm_code}`;
    appendBloomscapesJobFacts(card,job);
    const detail = card.appendChild(document.createElement('p'));
    detail.textContent = [job.scope,`${job.source_rows.length} rows`,`Qty ${job.quantity}`,job.assigned_to,
        job.due_on || 'No due date',job.instructions].join(' · ');
    if (!job.assigned_to_username) {
        appendBloomscapesPickupButton(card,job,status);
        return card;
    }
    const form = card.appendChild(document.createElement('form'));
    form.innerHTML = '<label>Actual Qty <input name="actualQuantity" type="number" min="1" step="1" required></label>'
        + '<label>Completion Notes <input name="notes" maxlength="1000"></label>'
        + '<label><input name="acknowledge" type="checkbox"> Confirm crew and outbound warnings reviewed</label>'
        + '<button type="submit">MARK DONE · Complete Work</button>';
    form.elements.actualQuantity.value = job.quantity;
    form.querySelector('label').firstChild.textContent = job.work_view==='HAULING' ? 'Qty Hauled ' : job.work_view==='Y_GRADING' ? 'GRADED # ' : 'Actual Qty ';
    if (job.work_view==='Y_GRADING') form.insertAdjacentHTML('afterbegin','<label>CF# <input name="canFillQuantity" type="number" min="0" step="1" value="0"></label>');
    renderBloomscapesWorkAnswers(form,job);
    configureBloomscapesCompletionForm(form,job);
    form.addEventListener('submit',event=>{
        event.preventDefault();
        void completeBloomscapesFieldWorkCard(job,form,status);
    });
    return card;
}

async function completeBloomscapesFieldWorkCard(job,form,status) {
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    const owner = getSupabaseReadIdentityScope();
    const answers = job.completion_answers || readBloomscapesWorkAnswers(form,job);
    try {
        const receipt = await completeBloomscapesFieldWork(job,answers);
        if (owner!==getSupabaseReadIdentityScope()) return;
        status.textContent = 'Work saved · PDF '+receipt.pdf.archiveStatus;
        await ensureBloomscapesFieldQueue(true);
        await renderBloomscapesFieldQueue(document.getElementById('request-content'),document.getElementById('request-crumb'));
    } catch (error) {
        if (status.isConnected) status.textContent = error.message;
        const saved = bloomscapesFieldQueueState.rows.find(row=>row.id===job.id && row.status==='DONE');
        if (saved && owner===getSupabaseReadIdentityScope()) await renderBloomscapesFieldQueue(
            document.getElementById('request-content'),document.getElementById('request-crumb'),error.message);
    }
    finally { button.disabled = false; }
}

function configureBloomscapesCompletionForm(form,job) {
    const done = job.status==='DONE';
    for (const input of form.querySelectorAll('input')) {
        if (done && Object.hasOwn(job.completion_answers || {},input.name)) {
            if (input.type==='checkbox') input.checked = job.completion_answers[input.name]===true;
            else input.value = job.completion_answers[input.name];
        }
        input.disabled = done;
    }
    const editable = job.assigned_to_username===String(currentUser) && bloomscapesFieldQueueState.canCreate?.[job.work_view]===true;
    form.querySelector('button').textContent = done ? 'Work complete · Retry PDF archive' : 'MARK DONE · Complete Work';
    form.querySelector('button').hidden = !editable;
    if (job.blocked) {
        form.querySelector('button').disabled=true;
        form.querySelector('button').textContent='Waiting for previous workflow step';
    }
    if (done && isBloomscapesMeasuredWork(job)) restoreBloomscapesMeasuredAnswers(form,job);
    if (!editable) form.querySelectorAll('input,select').forEach(input=>{input.disabled=true;});
}

function renderBloomscapesWorkGroups(list,rows,status,kind) {
    const paint=pageIndex=>{
        list.replaceChildren();
        const page=bloomscapesListWindow(rows,pageIndex);
        if (kind==='CAN_FILLING') renderBloomscapesCanGroups(list,page.rows,status);
        else list.append(...page.rows.map(row=>renderBloomscapesFieldWorkCard(row,status)));
        for (const [label,start] of [['Previous',page.index-1],['Next',page.index+1]]) {
            if (start<0 || start>=page.pages) continue;
            const button=list.appendChild(document.createElement('button'));
            button.type='button';button.textContent=label;button.onclick=()=>paint(start);
        }
    };
    paint(0);
}

function renderBloomscapesCanGroups(list,rows,status) {
    const groups = new Map();
    for (const row of rows) {
        const key = [row.command?.media || 'Media not specified',row.command?.fertilizer || 'Fertilizer not specified',row.target_location || 'No target block'].join(' · ');
        if (!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(row);
    }
    for (const [recipe,jobs] of groups) {
        const section = list.appendChild(document.createElement('section'));
        section.appendChild(document.createElement('h3')).textContent = recipe+' · '+jobs.reduce((sum,job)=>sum+Number(job.quantity),0)+' cans required';
        section.append(...jobs.map(job=>renderBloomscapesFieldWorkCard(job,status)));
    }
}

function isBloomscapesFieldQueueReviewer() {
    return nativeAuthProfile?.role==='super-admin';
}

function bloomscapesFieldJobVisible(job,viewAll=false) {
    if (job.farm_code!==getBloomscapesFarm()) return false;
    if (viewAll && isBloomscapesFieldQueueReviewer()) return true;
    const actor=String(currentUser);
    const assignee=job.assigned_to_username;
    if (!actor || (assignee ? assignee!==actor : job.status!=='OPEN')) return false;
    return job.source_rows.every(member=>{
        const matched=findItemByUniqueId(member.id);
        const source=matched?.is_drive_row!==false && matched?.IS_DRIVE_ROW!==false ? matched : null;
        const fallback=member.id===job.source_id ? job.source_snapshot : null;
        const rowOwner=Object.hasOwn(member,'assignedto') ? member.assignedto : (source || fallback)?.ASSIGNEDTO ?? (source || fallback)?.assignedto;
        return !String(rowOwner || '').trim() || rowOwner===actor;
    });
}

function mountBloomscapesFieldAudit(host,list,status,kind,owner) {
    const label=document.createElement('label');
    const control=label.appendChild(document.createElement('input'));
    control.type='checkbox';
    control.dataset.fieldAudit='true';
    label.append(' Admin: View All Assigned');
    host.prepend(label);
    let revision=0;
    control.addEventListener('change',async()=>{
        const attempt=++revision;
        const all=control.checked;
        if (!all) return paintBloomscapesFieldQueue(list,status,bloomscapesFieldQueueState.rows,kind,'');
        try {
            const data=await readBloomscapesFieldWork(true);
            if (!host.isConnected || attempt!==revision || owner!==getSupabaseReadIdentityScope()) return;
            paintBloomscapesFieldQueue(list,status,data.rows,kind,'Admin: View All Assigned',true);
        } catch (error) {
            if (!host.isConnected || attempt!==revision || owner!==getSupabaseReadIdentityScope()) return;
            control.checked=false;
            paintBloomscapesFieldQueue(list,status,bloomscapesFieldQueueState.rows,kind,error.message);
        }
    });
}

function appendBloomscapesPickupButton(card,job,status) {
    if (!bloomscapesFieldJobVisible(job) || bloomscapesFieldQueueState.canCreate?.[job.work_view]!==true) return;
    const button=card.appendChild(document.createElement('button'));
    button.type='button';
    button.textContent='✋ Pick Up Work';
    button.disabled=job.blocked===true;
    button.addEventListener('click',()=>void claimBloomscapesFieldWork(job,button,status));
}

async function claimBloomscapesFieldWork(job,button,status) {
    if (button.disabled) return;
    button.disabled=true;
    const owner=getSupabaseReadIdentityScope();
    let notice='Work assigned to you';
    try {
        await pickupBloomscapesFieldWork(job);
    } catch (error) {
        notice=error.message;
        if (error.code!=='PT409') {
            if (status.isConnected && owner===getSupabaseReadIdentityScope()) status.textContent=notice;
            button.disabled=false;
            return;
        }
    }
    if (owner!==getSupabaseReadIdentityScope()) return;
    try {
        await ensureBloomscapesFieldQueue(true);
        if (status.isConnected && owner===getSupabaseReadIdentityScope()) await renderBloomscapesFieldQueue(
            document.getElementById('request-content'),document.getElementById('request-crumb'),notice);
    } catch (error) {
        if (status.isConnected && owner===getSupabaseReadIdentityScope()) status.textContent=error.message;
    }
}
