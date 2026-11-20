
let bloomTimeCardsState;

function bloomTimeHtml(value) {
    return escapeHtml(String(value ?? ''));
}

function bloomTimeDate(days=0) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'})
        .formatToParts(Date.now()+days*86400000);
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}

function bloomTimeCurrentScope() {
    return {farm:getBloomscapesFarm(),identity:getSupabaseReadIdentityScope()};
}

function isBloomTimeCurrent(state) {
    const scope=bloomTimeCurrentScope();
    return state===bloomTimeCardsState && state.host.isConnected
        && scope.farm===state.farm && scope.identity===state.identity;
}

function bloomTimeContextKey(context) {
    return context.borrowed_assignment_id || context.department;
}

function bloomTimeContext(state) {
    return state.board?.contexts.find(context=>bloomTimeContextKey(context)===state.context)
        || state.board?.contexts[0];
}

function bloomTimeCodeLabel(code) {
    return [code.code,code.description,code.department].filter(Boolean).join(' · ');
}

function bloomTimeMatches(state) {
    const terms=state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const department=bloomTimeContext(state)?.department;
    const score=code=>Number(code.department===department)*2+Number(code.pinned);
    return (state.board?.codes || []).filter(code=>terms.every(term=>bloomTimeCodeLabel(code).toLowerCase().includes(term)))
        .sort((a,b)=>score(b)-score(a));
}

function bloomTimeCodeOptions(codes,selected) {
    return '<option value="">Select a job code</option>'+codes.map(code=>
        '<option value="'+bloomTimeHtml(code.id)+'"'+(String(code.id)===String(selected) ? ' selected' : '')+'>'
        +bloomTimeHtml(bloomTimeCodeLabel(code))+'</option>').join('');
}

function bloomTimePicker(state) {
    const codes=bloomTimeMatches(state);
    const active=state.board?.rows.find(row=>row.username===state.board.username && row.allowed.includes('clock_out'));
    const select=state.host.querySelector('[data-timecard-job]');
    if (select) select.innerHTML=bloomTimeCodeOptions(codes,state.jobCodeId);
    const quick=state.host.querySelector('[data-timecard-quick]');
    if (quick && active && bloomTimeContext(state)) {
        quick.innerHTML=codes.slice(0,8).filter(code=>String(code.id)!==String(active.job_code_id)).map(code=>
            '<button type="button" data-timecard-switch="'+bloomTimeHtml(code.id)+'">'+bloomTimeHtml(bloomTimeCodeLabel(code))+'</button>').join('');
    }
}

function bloomTimeClock(value) {
    return value ? new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'short',timeStyle:'short'})
        .format(new Date(value)) : '';
}

function bloomTimeEntry(state,active) {
    const context=bloomTimeContext(state);
    const options=state.board.contexts.map(row=>{
        const key=bloomTimeContextKey(row);
        const department=row.department==='156' ? 'Inventory' : 'QC';
        const label=row.supervisor ? department+' · Borrowed help · '+row.supervisor.replaceAll('_',' ') : department;
        return '<option value="'+bloomTimeHtml(key)+'"'+(key===bloomTimeContextKey(context) ? ' selected' : '')+'>'
            +bloomTimeHtml(label)+'</option>';
    });
    const clock=active ? '<div class="timecard-clock-line"><span>Clocked in · '+bloomTimeHtml(active.code)+' · '
        +bloomTimeHtml(bloomTimeClock(active.clock_in))+'</span><button type="button" data-timecard-action="clock_out" data-card-id="'
        +bloomTimeHtml(active.id)+'">Clock Out</button></div>' : '';
    const today=bloomTimeHtml(state.board.today);
    if (!context) return clock;
    return '<section class="timecard-panel">'+clock+'<form data-timecard-entry><div class="timecard-controls">'
        +'<label>Department<select data-timecard-context>'+options.join('')+'</select></label>'
        +'<label>Search job codes<input type="search" data-timecard-search value="'+bloomTimeHtml(state.search)+'"></label>'
        +'<label>Job code<select data-timecard-job required></select></label></div>'
        +(active ? '<div class="timecard-quick" data-timecard-quick></div><button type="submit" name="time-action" value="switch_code">Switch Job</button>'
            : '<button type="submit" name="time-action" value="clock_in">Clock In</button>')
        +'</form><form class="timecard-controls" data-timecard-hours><label>Work date<input type="date" name="work_date" required max="'
        +today+'" value="'+bloomTimeHtml(state.logDay || state.board.today)+'"></label>'
        +'<label>Hours<input type="number" name="hours" min="0" max="24" step="0.0001" inputmode="decimal" required value="'
        +bloomTimeHtml(state.logHours)+'"></label>'
        +'<label>Notes<input name="notes" maxlength="500" value="'+bloomTimeHtml(state.logNotes)+'"></label>'
        +'<button type="submit">Log Hours</button></form></section>';
}

function bloomTimeEditForm(state,row) {
    if (state.editId!==row.id || !row.allowed.includes('edit')) return '';
    return '<form class="timecard-controls" data-timecard-edit="'+bloomTimeHtml(row.id)+'"><label>Hours<input name="hours" type="number"'
        +' min="0" max="24" step="0.0001" required value="'+bloomTimeHtml(row.hours)+'"></label>'
        +'<label>Job code<select name="job_code_id" required>'+bloomTimeCodeOptions(state.board.codes,row.job_code_id)+'</select></label>'
        +'<label>Notes<input name="notes" maxlength="500" value="'+bloomTimeHtml(row.notes)+'"></label>'
        +'<button type="submit">Save Edit</button><button type="button" data-timecard-cancel>Cancel</button></form>';
}

function bloomTimeRow(state,row) {
    const names=[row.name,row.department==='156' ? 'Inventory' : 'QC',row.work_date].map(bloomTimeHtml).join(' · ');
    const duration=row.hours==null ? 'Clocked in' : String(row.hours)+' h';
    const approval=row.approved_at ? 'Approved · '+(row.approved_by || '') : 'Pending approval';
    const commands=[['edit','Edit'],['approve','Approve']].filter(([action])=>row.allowed.includes(action)).map(([action,title])=>
        '<button type="button" data-timecard-action="'+action+'" data-card-id="'+bloomTimeHtml(row.id)+'">'+title+'</button>');
    return '<article class="timecard-panel timecard-entry"><div><h3>'+names+'</h3><p>'
        +bloomTimeHtml([row.code,row.description].filter(Boolean).join(' · '))+'</p><p>'
        +bloomTimeHtml([duration,approval,bloomTimeClock(row.clock_in),bloomTimeClock(row.clock_out)].filter(Boolean).join(' · '))
        +'</p>'+(row.notes ? '<p>'+bloomTimeHtml(row.notes)+'</p>' : '')+'</div><div class="timecard-actions">'
        +commands.join('')+'</div>'+bloomTimeEditForm(state,row)+'</article>';
}

function bloomTimeRender(state) {
    const board=state.board;
    const active=board?.rows.find(row=>row.username===board.username && row.allowed.includes('clock_out'));
    state.host.innerHTML='<p class="timecard-status" role="status">'+bloomTimeHtml(state.notice)+'</p>'
        +(board ? bloomTimeEntry(state,active)
            +'<form class="timecard-panel timecard-controls" data-timecard-range><label>From<input type="date" name="from" required value="'
            +bloomTimeHtml(state.from)+'"></label><label>Through<input type="date" name="to" required value="'
            +bloomTimeHtml(state.to)+'"></label><button type="submit">Show Cards</button>'
            +(board.can_export ? '<button type="button" data-timecard-export>Export CSV</button>' : '')+'</form>'
            +'<div class="timecard-list">'+(board.rows.length ? board.rows.map(row=>bloomTimeRow(state,row)).join('') : '<p>No time cards for these dates.</p>')
            +'</div>'+(board.has_more ? '<button type="button" data-timecard-more>Load More</button>' : '') : '');
    if (board) bloomTimePicker(state);
    bloomTimeBusy(state,state.busy);
}

function bloomTimeBusy(state,busy) {
    state.host.setAttribute('aria-busy',String(busy));
    state.host.querySelectorAll('button').forEach(button=>{button.disabled=busy;});
}

function bloomTimeMessage(state,notice) {
    state.notice=notice;
    const status=state.host.querySelector('.timecard-status');
    if (status) status.textContent=notice;
}

async function bloomTimeLoad(state,append=false) {
    const next=append ? state.offset+100 : 0;
    const generation=++state.generation;
    const response=await readBloomTimeCardBoard(state.farm,state.identity,{p_from:state.from,p_to:state.to,p_offset:next});
    if (!isBloomTimeCurrent(state) || generation!==state.generation) return;
    const rows=append ? [...state.board.rows,...response.rows] : response.rows;
    state.offset=next;
    state.board={...response,rows};
    if (!state.context) state.context=bloomTimeContextKey(state.board.contexts[0] || {});
    bloomTimeRender(state);
}

function bloomTimeCardInput(state,jobId=state.jobCodeId) {
    const context=bloomTimeContext(state);
    if (!context || !jobId) throw new Error('Select your department and a job code.');
    return {job_code_id:jobId,department:context.department,borrowed_assignment_id:context.borrowed_assignment_id};
}

async function bloomTimeSave(state,action,input) {
    if (state.busy) return;
    const fingerprint=JSON.stringify([action,input]);
    const request=state.retry?.fingerprint===fingerprint ? state.retry.id : crypto.randomUUID();
    state.retry={fingerprint,id:request};
    await bloomTimeRun(state,async()=>{
        await sendBloomTimeCardCommand(state.farm,state.identity,action,{...input,request_id:request});
        if (!isBloomTimeCurrent(state)) return;
        state.retry=null;
        state.editId=null;
        if (action==='log_hours') Object.assign(state,{logHours:'',logNotes:''});
        bloomTimeMessage(state,'Time card saved.');
        await bloomTimeLoad(state);
    });
}

async function bloomTimeRun(state,command) {
    if (state.busy) return;
    state.busy=true;
    bloomTimeBusy(state,true);
    try {await command();}
    catch(error) {if (isBloomTimeCurrent(state)) bloomTimeMessage(state,error.message || 'Time Cards could not be loaded.');}
    finally {
        state.busy=false;
        if (isBloomTimeCurrent(state)) bloomTimeBusy(state,false);
    }
}

function bloomTimeCsvCell(value) {
    let text=String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
}

async function bloomTimeExport(state) {
    const rows=await readBloomTimeCardExport(state.farm,state.identity,{p_from:state.from,p_to:state.to});
    if (!isBloomTimeCurrent(state)) return;
    const columns=['farm_code','work_date','username','name','department','code','description','clock_in','clock_out','hours','notes','approved_at','approved_by'];
    const csv=[columns.join(','),...rows.map(row=>columns.map(column=>bloomTimeCsvCell(row[column])).join(','))].join('\r\n');
    const href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=href;
    link.download='time-cards-'+state.farm+'-'+state.from+'-'+state.to+'.csv';
    link.click();
    requestAnimationFrame(()=>URL.revokeObjectURL(href));
}

function bloomTimeInputs(state,event) {
    const input=event.target;
    if (input.matches('[data-timecard-search]')) {
        state.search=input.value;
        bloomTimePicker(state);
    }
    if (input.matches('[data-timecard-context]')) {
        state.context=input.value;
        bloomTimePicker(state);
    }
    if (input.matches('[data-timecard-job]')) state.jobCodeId=input.value;
    if (input.closest('[data-timecard-hours]')) {
        const field={work_date:'logDay',hours:'logHours',notes:'logNotes'}[input.name];
        if (field) state[field]=input.value;
    }
}

function bloomTimeSubmit(state,event) {
    event.preventDefault();
    const form=event.target;
    const values=Object.fromEntries(new FormData(form));
    const active=state.board?.rows.find(row=>row.username===state.board.username && row.allowed.includes('clock_out'));
    try {
        if (form.matches('[data-timecard-range]')) {
            Object.assign(state,{from:values.from,to:values.to});
            return bloomTimeRun(state,()=>bloomTimeLoad(state));
        }
        if (form.matches('[data-timecard-hours]')) return bloomTimeSave(state,'log_hours',{...bloomTimeCardInput(state),...values});
        if (form.matches('[data-timecard-entry]')) {
            const action=active ? 'switch_code' : 'clock_in';
            return bloomTimeSave(state,action,{...bloomTimeCardInput(state),...(active && {id:active.id})});
        }
        const row=state.board.rows.find(entry=>entry.id===form.dataset.timecardEdit);
        if (row) return bloomTimeSave(state,'edit',{id:row.id,revision:row.revision,...values});
    } catch(error) {bloomTimeMessage(state,error.message);}
}

function bloomTimeClick(state,event) {
    const button=event.target.closest('button');
    if (!button || state.busy) return;
    const action=button.dataset.timecardAction;
    const row=state.board?.rows.find(card=>card.id===button.dataset.cardId);
    if (button.hasAttribute('data-timecard-export')) return bloomTimeRun(state,()=>bloomTimeExport(state));
    if (button.hasAttribute('data-timecard-more')) return bloomTimeRun(state,()=>bloomTimeLoad(state,true));
    if (button.hasAttribute('data-timecard-cancel') || (action==='edit' && row)) {
        state.editId=action==='edit' ? row.id : null;
        return bloomTimeRender(state);
    }
    if (action && row) return bloomTimeSave(state,action,{id:row.id,revision:row.revision});
    const code=button.dataset.timecardSwitch;
    const active=state.board?.rows.find(card=>card.username===state.board.username && card.allowed.includes('clock_out'));
    if (code && active) return bloomTimeSave(state,'switch_code',{...bloomTimeCardInput(state,code),id:active.id});
}

function renderBloomscapesTimeCards() {
    const root=document.getElementById('view-time-cards');
    if (!root) return;
    let host=root.querySelector('[data-timecards-workspace]');
    if (!host) {
        host=document.createElement('section');
        host.dataset.timecardsWorkspace='';
        root.appendChild(host);
    }
    const scope=bloomTimeCurrentScope();
    if (bloomTimeCardsState?.host!==host || bloomTimeCardsState.farm!==scope.farm || bloomTimeCardsState.identity!==scope.identity) {
        bloomTimeCardsState={...scope,host,from:bloomTimeDate(-13),to:bloomTimeDate(),search:'',generation:0,busy:false,notice:'Loading Time Cards…'};
    }
    const state=bloomTimeCardsState;
    host.oninput=event=>bloomTimeInputs(state,event);
    host.onchange=event=>bloomTimeInputs(state,event);
    host.onclick=event=>bloomTimeClick(state,event);
    host.onsubmit=event=>bloomTimeSubmit(state,event);
    bloomTimeRender(state);
    return bloomTimeRun(state,async()=>{
        await bloomTimeLoad(state);
        if (isBloomTimeCurrent(state)) bloomTimeMessage(state,'');
    });
}
