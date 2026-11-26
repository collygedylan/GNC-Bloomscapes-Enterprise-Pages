const bloomTimeDepartments={'156':'Inventory','154':'Order Pulling','161':'QC'};
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

function bloomTimeDepartment(state) {
    return state.department ?? (state.board?.can_manage_crew ? '156' : state.board?.contexts[0]?.department || '');
}

function bloomTimeContextKey(context) {
    return context.borrowed_assignment_id || context.department;
}

function bloomTimeContexts(state) {
    const department=bloomTimeDepartment(state);
    return state.board?.contexts.filter(context=>!department || context.department===department) || [];
}

function bloomTimeContext(state) {
    const contexts=bloomTimeContexts(state);
    return contexts.find(context=>bloomTimeContextKey(context)===state.context) || contexts[0];
}

function bloomTimeCodeLabel(code) {
    return [code.code,code.default_label || code.description,code.department].filter(Boolean).join(' · ');
}

function bloomTimeMatches(state) {
    const department=bloomTimeContext(state)?.department;
    const score=code=>Number(code.default_for===department)*4+Number(code.department===department)*2+Number(code.pinned);
    return (state.board?.codes || []).slice().sort((a,b)=>score(b)-score(a));
}

function bloomTimeBusy(state,busy) {
    state.host.setAttribute('aria-busy',String(busy));
    state.host.querySelectorAll('button, select').forEach(control=>{control.disabled=busy;});
}

function bloomTimeMessage(state,notice) {
    state.notice=notice;
    const status=state.host.querySelector('.timecard-status');
    if (status) status.textContent=notice;
}

function bloomTimeWindow(state,offset,department) {
    return {p_from:state.from,p_to:state.to,p_offset:offset,
        p_department:department || null,p_worker:state.worker || null};
}

async function bloomTimeLoad(state,append=false) {
    const next=append ? state.offset+100 : 0;
    const generation=++state.generation;
    const response=await readBloomTimeCardBoard(state.farm,state.identity,bloomTimeWindow(state,next,state.department));
    if (!isBloomTimeCurrent(state) || generation!==state.generation) return;
    if (!response.user_id || !Array.isArray(response.crew)) throw new Error('The Time Cards crew response is incomplete.');
    const rows=append ? [...state.board.rows,...response.rows] : response.rows;
    const crew=append ? state.board.crew : response.crew;
    state.offset=next;
    state.board={...response,rows,crew};
    state.readyAt=Date.now();
    bloomTimeRender(state);
}

async function bloomTimeRun(state,command) {
    if (state.busy) return;
    state.busy=true;
    bloomTimeBusy(state,true);
    try {
        await command();
    } catch(error) {
        if (isBloomTimeCurrent(state)) bloomTimeMessage(state,error.message || 'Time Cards could not be loaded.');
    } finally {
        state.busy=false;
        if (isBloomTimeCurrent(state)) bloomTimeBusy(state,false);
    }
}

function bloomTimeChange(state,event) {
    const input=event.target;
    if (input.matches('[data-timecard-department], [data-timecard-employee]')) {
        if (input.matches('[data-timecard-department]')) {
            Object.assign(state,{department:input.value,worker:null,context:null,jobCodeId:''});
        } else {
            Object.assign(state,{department:'156',worker:Number(input.value) || null});
        }
        state.readyAt=0;
        bloomTimeRender(state);
        return bloomTimeRun(state,()=>bloomTimeLoad(state));
    }
    if (input.matches('[data-timecard-context]')) {
        Object.assign(state,{context:input.value,jobCodeId:''});
        bloomTimeRender(state);
    }
    if (input.matches('[data-timecard-job]')) state.jobCodeId=input.value;
}

function bloomTimeInputs(state,event) {
    const input=event.target;
    if (!input.closest('[data-timecard-hours]')) return;
    const field={work_date:'logDay',hours:'logHours',notes:'logNotes'}[input.name];
    if (field) state[field]=input.value;
}

function bloomTimeDispatchSubmit(state,form,values) {
    if (form.matches('[data-timecard-range]')) {
        Object.assign(state,{from:values.from,to:values.to,readyAt:0});
        return bloomTimeRun(state,()=>bloomTimeLoad(state));
    }
    if (form.matches('[data-timecard-hours]')) {
        return bloomTimeSave(state,'log_hours',{...bloomTimeCardInput(state),...values});
    }
    if (form.matches('[data-timecard-entry]')) {
        const active=bloomTimeSelfClock(state);
        const input=bloomTimeCardInput(state);
        return active ? bloomTimeSave(state,'switch_code',{...input,id:active.id}) : bloomTimeSave(state,'clock_in',input);
    }
    const row=state.board.rows.find(entry=>entry.id===form.dataset.timecardEdit);
    if (row) return bloomTimeSave(state,'edit',{id:row.id,revision:row.revision,...values});
}

function bloomTimeSubmit(state,event) {
    event.preventDefault();
    if (state.busy) return;
    try {
        return bloomTimeDispatchSubmit(state,event.target,Object.fromEntries(new FormData(event.target)));
    } catch(error) {
        bloomTimeMessage(state,error.message);
    }
}

function bloomTimeClick(state,event) {
    const button=event.target.closest('button');
    if (!button || state.busy) return;
    const action=button.dataset.timecardAction;
    const row=bloomTimeFindRow(state,button.dataset.cardId);
    if (button.hasAttribute('data-timecard-export')) return bloomTimeRun(state,()=>bloomTimeExport(state));
    if (button.hasAttribute('data-timecard-cancel') || (action==='edit' && row)) {
        state.editId=action==='edit' ? row.id : null;
        return bloomTimeRender(state);
    }
    const employee=state.board?.crew.find(member=>String(member.id)===button.dataset.timecardEmployeeClock);
    if (employee && action==='clock_in') return bloomTimeManagerStart(state,employee);
    if (action && row) return bloomTimeSave(state,action,{id:row.id,revision:row.revision,worker_user_id:row.worker_user_id});
    const code=button.dataset.timecardSwitch;
    const active=bloomTimeSelfClock(state);
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
        bloomTimeCardsState={...scope,host,from:bloomTimeDate(-13),to:bloomTimeDate(),generation:0,busy:false,notice:'Loading Time Cards…'};
    }
    const state=bloomTimeCardsState;
    host.oninput=event=>bloomTimeInputs(state,event);
    host.onchange=event=>bloomTimeChange(state,event);
    host.onclick=event=>bloomTimeClick(state,event);
    bindBloomscapesChoiceFields(host,{'time-job':()=>bloomTimeMatches(state).map(code=>[code.id,bloomTimeCodeLabel(code)])});
    host.onsubmit=event=>bloomTimeSubmit(state,event);
    bloomTimeRender(state);
    if (state.board && Date.now()-(state.readyAt || 0)<45000) return;
    return bloomTimeRun(state,async()=>{
        await bloomTimeLoad(state);
        if (isBloomTimeCurrent(state)) bloomTimeMessage(state,'');
    });
}

function bloomTimeRenderList(state) {
    const department = bloomTimeDepartment(state);
    const source = state.pending ? bloomTimeUpsertRows(state,[state.pending.row]) : state.board.rows;
    const filtered = source.filter(row => (!department || row.department===department)
        && (!state.worker || row.worker_user_id===state.worker));
    const rows = filtered.filter(row => matchesBloomscapesModuleSearch(state.search,
        [row.username,row.name,row.code,row.description,bloomTimeDepartments[row.department],row.clock_in,row.notes]));
    const list = state.host.querySelector('[data-timecard-results]');
    if (!list) return;
    renderBloomscapesScrollCards(list,rows,row => bloomscapesListNode(bloomTimeRow(state,row)),
        {empty:bloomTimeHasRoster(state) ? 'No recorded shifts in this period.' : 'No time cards for these dates.',size:20,estimate:126});
    if (!state.board?.has_more) return;
    observeTimeCardContinuation(list,state);
}

function observeTimeCardContinuation(list,state) {
    if (typeof IntersectionObserver !== 'function') return;
    const edge = list.appendChild(document.createElement('div'));
    edge.style.minHeight = '1px';
    observeBloomscapesPageEdge(edge,() => loadMoreTimeCards(state));
}

function loadMoreTimeCards(state) {
    if (isBloomTimeCurrent(state)) void bloomTimeRun(state,() => bloomTimeLoad(state,true));
}

function bloomTimeCsvCell(value) {
    let text=String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
}

async function bloomTimeExport(state) {
    const rows=await readBloomTimeCardExport(state.farm,state.identity,bloomTimeWindow(state,0,bloomTimeDepartment(state)));
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
