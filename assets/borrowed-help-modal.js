const borrowedHelpDestinations = Object.freeze({
    docks:'Traffic / Docks / Order Pulling',inventory:'Inventory','can-filling':'Can Filling',
    'bunch-notes':'Bunch Notes / Overwinter',consolidate:'Consolidate Inventory',shearing:'Shearing',qc:'QC'
});

const borrowedHelpTimeZone = 'America/Chicago';

function borrowedHelpChicagoTime(value) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:borrowedHelpTimeZone,
        year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
    const local = Object.fromEntries(parts.map(({type,value})=>[type,value]));
    return local.year+'-'+local.month+'-'+local.day+'T'+local.hour+':'+local.minute;
}

function borrowedHelpInstant(value) {
    if (!value) throw Error('Enter both start and end times.');
    const wall = Date.parse(value+'Z');
    for (const hours of [5,6]) {
        const candidate = new Date(wall+hours*3600000);
        if (borrowedHelpChicagoTime(candidate) === value) return candidate;
    }
    throw Error('That time does not exist in Central Time.');
}

function borrowedHelpDuration(form, now = new Date()) {
    if (form.duration === 'custom') {
        const start = borrowedHelpInstant(form.start);
        const end = borrowedHelpInstant(form.end);
        if (end <= start || end <= now) throw Error('Choose an end after the start and in the future.');
        return {start_at:start.toISOString(),end_at:end.toISOString()};
    }
    const today = borrowedHelpChicagoTime(now).slice(0,10);
    let end = new Date(now.getTime()+Number(form.duration)*3600000);
    if (form.duration === 'day') end = new Date(borrowedHelpInstant(today+'T23:59').getTime()+60000);
    return {start_at:now.toISOString(),end_at:end.toISOString()};
}

function borrowedHelpRequestFields(people) {
    return `<label>Needing Area & Task <select name="destination" required>
      ${Object.entries(borrowedHelpDestinations).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
      <label>Dock #, Trip # or Block <input name="location" maxlength="120"></label>
      <label>Target Managers / Supervisors <select name="recipients" multiple size="4" required>${borrowedHelpPeople(people)}</select></label>
      <label><input name="broadcast" type="checkbox"> Broadcast to all farm managers and supervisors</label>
      <label>Crew Count <input name="crew_count" type="number" min="1" max="25" value="1" required></label>
      <label>Duration <select name="duration"><option value="2">2 hours</option><option value="4">4 hours</option>
      <option value="day">Full Day Today</option><option value="custom">Multi-Day Custom</option></select></label>
      <fieldset data-loan-custom hidden disabled><legend>Central Time</legend><label>Start <input name="start" type="datetime-local" required></label>
      <label>End <input name="end" type="datetime-local" required></label></fieldset>
      <label>Instructions <textarea name="instructions" maxlength="1000"></textarea></label>`;
}

function borrowedHelpPeople(people) {
    return people.map(person=>`<option value="${Number(person.id)}">${pullHtml(person.name)}</option>`).join('');
}

function openBorrowedHelpRequest(people, submit) {
    const leads = people.filter(person=>['manager','supervisor','admin','super-admin'].includes(person.role));
    const id = crypto.randomUUID();
    const dialog = showBorrowedHelpForm('Request Borrowed Help',borrowedHelpRequestFields(leads),'Send request',form=>{
        const data = new FormData(form);
        const details = Object.fromEntries(data);
        return submit('request',id,{...borrowedHelpDuration(details),destination:details.destination,
            location:details.location,instructions:details.instructions,crew_count:Number(details.crew_count),
            recipients:data.getAll('recipients').map(Number),broadcast:data.has('broadcast')});
    });
    const form = dialog.querySelector('form');
    form.elements.broadcast.onchange = () => { form.elements.recipients.disabled = form.elements.broadcast.checked; };
    form.elements.duration.onchange = () => {
        const custom = form.querySelector('[data-loan-custom]');
        custom.hidden = custom.disabled = form.elements.duration.value !== 'custom';
    };
}

function openBorrowedHelpApproval(row, people, submit) {
    const fields = `<label>Assign ${Number(row.crew_count)} active workers
      <select name="workers" multiple size="6" required>${borrowedHelpPeople(people.filter(person=>person.worker))}</select></label>`;
    showBorrowedHelpForm('Approve & Assign Crew',fields,'Approve',form=>{
        const workers = new FormData(form).getAll('workers').map(Number);
        if (workers.length !== row.crew_count) throw Error('Select exactly '+row.crew_count+' workers.');
        return submit('approve',row.id,workers);
    });
}

function showBorrowedHelpForm(title,fields,label,submit) {
    const dialog = document.createElement('dialog');
    dialog.className = 'bloomscapes-work-dialog';
    dialog.setAttribute('aria-label',title);
    dialog.innerHTML = `<h2>${title}</h2><form><div class="grid gap-3">${fields}</div>
      <p role="status"></p><button class="${pullWorkspacePill}" type="submit">${label}</button>
      <button class="${pullWorkspacePill}" type="button" data-loan-close>Cancel</button></form>`;
    const form = dialog.querySelector('form');
    form.querySelector('[data-loan-close]').onclick = () => dialog.close();
    form.onsubmit = event => {
        event.preventDefault();
        void commitBorrowedHelpForm(dialog,form,submit);
    };
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
}

async function commitBorrowedHelpForm(dialog,form,submit) {
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
        if (await submit(form)) dialog.close();
    } catch (error) {
        form.querySelector('[role=status]').textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

const borrowedFieldLabels = {'inventory':'Inventory Count','qc':'QC Inspection'};
function createBorrowedFieldCard(row) {
    const card = document.createElement('article');
    card.className = 'space-y-2 rounded-xl border border-emerald-700/60 p-3';
    card.dataset.borrowedFieldCard = row.id;
    const identity = [row.itemcode,row.locationcode,row.lotcode].filter(Boolean).join(' · ');
    card.innerHTML = `<h3 class="font-bold">${pullHtml(row.commonname || row.itemcode)} · ${pullHtml(borrowedFieldLabels[row.route])}</h3>
        <p class="text-sm">${pullHtml(identity)}</p><p class="text-xs">${pullHtml(row.username)} · ${pullHtml(row.farm_code)}</p>
        ${borrowedFieldCardActions(row)}`;
    return card;
}

function borrowedFieldCardActions(row) {
    const allowed = row.allowed || [];
    const result = row.route === 'inventory'
        ? '<label>Counted quantity <input name="quantity" type="number" min="0" step="1" required></label>'
        : '<label>Inspection result <select name="result"><option value="pass">Pass</option><option value="needs_review">Needs review</option></select></label>';
    const complete = allowed.includes('complete') ? `<form data-borrowed-field-action="complete" class="flex flex-wrap items-center gap-2">
        ${result}<label>Notes <input name="notes" maxlength="500"></label>
        <button class="${pullWorkspacePill}" type="submit">Mark assigned task done</button></form>` : '';
    const release = allowed.includes('release') ? `<form data-borrowed-field-action="release"><button class="${pullWorkspacePill}" type="submit">Release help</button></form>` : '';
    return complete + release;
}


function renderBorrowedHelpClock(clock) {
    const remaining = Math.max(0,Date.parse(clock.dateTime)-Date.now());
    if (!remaining || typeof clock.animate !== 'function') {
        clock.textContent = remaining ? Math.ceil(remaining/60000)+'m remaining' : 'Expired';
        return;
    }
    const seconds = String(Math.ceil(remaining/1000));
    const countdown = clock.animate([{'--gnc-loan-seconds':seconds},{'--gnc-loan-seconds':'0'}],
        {duration:remaining,fill:'forwards'});
    countdown.onfinish = () => {
        if (clock.isConnected && !clock.closest('[data-loan-rows][data-section=history]')) {
            clock.closest('[data-borrowed-help-card]')?.remove();
        }
    };
}
