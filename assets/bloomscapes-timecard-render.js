function bloomTimeClock(value) {
    return value ? new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'short',timeStyle:'short'})
        .format(new Date(value)) : '';
}

function bloomTimeOption(value,label,current) {
    return '<option value="'+bloomTimeHtml(value)+'"'+(String(value)===String(current) ? ' selected' : '')+'>'
        +bloomTimeHtml(label)+'</option>';
}

function bloomTimeEntryContexts(state,context) {
    const contexts=bloomTimeContexts(state);
    if (contexts.length<2) return '';
    const options=contexts.map(row=>{
        const department=bloomTimeDepartments[row.department];
        const label=row.supervisor ? department+' · Borrowed help · '+row.supervisor.replaceAll('_',' ') : department;
        return bloomTimeOption(bloomTimeContextKey(row),label,bloomTimeContextKey(context));
    });
    return '<label>Assignment<select data-timecard-context>'+options.join('')+'</select></label>';
}

function bloomTimeEntryClock(state,active) {
    if (!active) return '';
    const switchButtons=bloomTimeContext(state) ? bloomTimeMatches(state).slice(0,8)
        .filter(code=>String(code.id)!==String(active.job_code_id)).map(code=>
            '<button type="button" data-timecard-switch="'+bloomTimeHtml(code.id)+'">'
            +bloomTimeHtml(bloomTimeCodeLabel(code))+'</button>').join('') : '';
    return '<div class="timecard-clock-line"><span>'+bloomTimeHtml(active.pending ||
        ('Clocked In · '+active.code+' · '+bloomTimeClock(active.clock_in)))+'</span>'
        +'<button type="button" data-timecard-action="clock_out" data-card-id="'+bloomTimeHtml(active.id)
        +'">⏹ Clock Out · Live</button></div><div class="timecard-quick">'+switchButtons+'</div>';
}

function bloomTimeHoursForm(state) {
    return '<form class="timecard-controls" data-timecard-hours><label>Work date<input type="date" name="work_date" required max="'
        +bloomTimeHtml(state.board.today)+'" value="'+bloomTimeHtml(state.logDay || state.board.today)+'"></label>'
        +'<label>Hours<input type="number" name="hours" min="0" max="24" step="0.0001" inputmode="decimal" required value="'
        +bloomTimeHtml(state.logHours)+'"></label><label>Notes<input name="notes" maxlength="500" value="'
        +bloomTimeHtml(state.logNotes)+'"></label><button type="submit">Log Hours</button></form>';
}

function bloomTimeEntry(state) {
    const active=bloomTimeSelfClock(state);
    const clock=bloomTimeEntryClock(state,active);
    const context=bloomTimeContext(state);
    if (!context) return clock;
    const value=active?.pending ? active.job_code_id : state.jobCodeId;
    const code=state.board.codes.find(row=>String(row.id)===String(value));
    const job=renderBloomscapesChoiceField('entry_job','Job code','time-job',value,code && bloomTimeCodeLabel(code),
        {attributes:'data-timecard-job'});
    return '<section class="timecard-panel">'+clock+'<form data-timecard-entry><div class="timecard-controls">'
        +bloomTimeEntryContexts(state,context)+job+'</div><button type="submit">'
        +(active ? 'Switch Job' : 'Clock In')+'</button></form>'+bloomTimeHoursForm(state)+'</section>';
}

function bloomTimeEditForm(state,row) {
    if (state.editId!==row.id || !row.allowed.includes('edit')) return '';
    return '<form class="timecard-controls" data-timecard-edit="'+bloomTimeHtml(row.id)+'"><label>Hours<input name="hours" type="number"'
        +' min="0" max="24" step="0.0001" required value="'+bloomTimeHtml(row.hours)+'"></label>'
        +renderBloomscapesChoiceField('job_code_id','Job code','time-job',row.job_code_id,bloomTimeCodeLabel(row),{required:true})
        +'<label>Notes<input name="notes" maxlength="500" value="'+bloomTimeHtml(row.notes)+'"></label>'
        +'<button type="submit">Save Edit</button><button type="button" data-timecard-cancel>Cancel</button></form>';
}

function bloomTimeRow(state,row) {
    const names=[row.name,bloomTimeDepartments[row.department],row.work_date].map(bloomTimeHtml).join(' · ');
    const duration=row.pending || (row.hours==null ? 'Clocked In' : String(row.hours)+' h');
    const approval=row.pending ? '' : row.approved_at ? 'Approved · '+(row.approved_by || '') : 'Pending approval';
    const commands=[['edit','Edit'],['approve','Approve']].filter(([action])=>row.allowed.includes(action)).map(([action,title])=>
        '<button type="button" data-timecard-action="'+action+'" data-card-id="'+bloomTimeHtml(row.id)+'">'+title+'</button>');
    return '<article class="timecard-panel timecard-entry" data-timecard-row="'+bloomTimeHtml(row.id)+'"><div><h3>'+names+'</h3><p>'
        +bloomTimeHtml([row.code,row.description].filter(Boolean).join(' · '))+'</p><p>'
        +bloomTimeHtml([duration,approval,bloomTimeClock(row.clock_in),bloomTimeClock(row.clock_out)].filter(Boolean).join(' · '))
        +'</p>'+(row.notes ? '<p>'+bloomTimeHtml(row.notes)+'</p>' : '')+'</div><div class="timecard-actions">'
        +commands.join('')+'</div>'+bloomTimeEditForm(state,row)+'</article>';
}

function bloomTimeFilters(state) {
    const department=bloomTimeDepartment(state);
    const options=['156','154','161',''].map(code=>bloomTimeOption(code,bloomTimeDepartments[code] || 'All',department));
    const range='<form class="timecard-controls" data-timecard-range><label>From<input type="date" name="from" required value="'
        +bloomTimeHtml(state.from)+'"></label><label>Through<input type="date" name="to" required value="'
        +bloomTimeHtml(state.to)+'"></label><button type="submit">Show Cards</button>'
        +(state.board.can_export && (!state.board.can_manage_crew || department==='156' || state.board.owner_export)
            ? '<button type="button" data-timecard-export>Export CSV</button>' : '')+'</form>';
    return '<section class="timecard-panel"><div class="timecard-controls"><label>Department<select data-timecard-department>'
        +options.join('')+'</select></label>'+bloomTimeEmployeeFilter(state)+'</div>'+range+'</section>';
}

function bloomTimeRender(state) {
    const board=state.board;
    state.host.innerHTML='<input type="search" data-timecard-search aria-label="Search Time Cards" placeholder="Search Time Cards…" value="'
        +bloomTimeHtml(state.search || '')+'"><p class="timecard-status" role="status">'+bloomTimeHtml(state.notice)+'</p>'
        +(board ? bloomTimeFilters(state)+bloomTimeEntry(state)+bloomTimeCrewRoster(state)+'<div data-timecard-results></div>' : '');
    bloomTimeBusy(state,state.busy);
    const search=state.host.querySelector('[data-timecard-search]');
    search.oninput=()=>{
        state.search=search.value;
        bloomTimeRenderList(state);
    };
    if (board) bloomTimeRenderList(state);
    syncGlobalHeaderChrome({reason:'time-cards-search'});
}

function bloomTimeHasRoster(state) {
    return state.board.can_manage_crew && bloomTimeDepartment(state)==='156';
}

function bloomTimeEmployeeFilter(state) {
    if (!bloomTimeHasRoster(state)) return '';
    const options=state.board.crew.map(member=>bloomTimeOption(member.id,member.name,state.worker));
    return '<label>Employee<select data-timecard-employee>'+bloomTimeOption('','All Inventory Crew',state.worker ?? '')
        +options.join('')+'</select></label>';
}

function bloomTimeRecordedHours(hours) {
    return hours==null ? '—' : Number(hours).toLocaleString('en-US',{maximumFractionDigits:4})+' h';
}

function bloomTimeCrewCommand(member,active) {
    if (member.other_clock) return '';
    if (active) return '<button type="button" data-timecard-action="clock_out" data-card-id="'+bloomTimeHtml(active.id)
        +'">⏹ Clock Out · Live</button>';
    return '<button type="button" data-timecard-action="clock_in" data-timecard-employee-clock="'+bloomTimeHtml(member.id)
        +'">Clock In</button>';
}

function bloomTimeCrewStatus(state,member) {
    const active=bloomTimeClockFor(state,member.id,member.active);
    const live=active || member.other_clock;
    const label=state.pending?.row?.worker_user_id===member.id ? state.pending.row.pending
        : member.other_clock ? 'Clocked In · another assignment' : live ? 'Clocked In' : 'Clocked Out';
    return '<article class="timecard-panel timecard-crew-member" data-timecard-member="'+bloomTimeHtml(member.username)+'">'
        +'<h3>'+bloomTimeHtml(member.name)+'</h3><p><span aria-hidden="true">'+(live ? '🟢' : '⚪')+'</span> '
        +bloomTimeHtml(label)+'</p><p>'+bloomTimeRecordedHours(member.hours)+' · '
        +bloomTimeHtml(member.evaluations)+' evals · '+bloomTimeHtml(member.activities)+' activities</p>'
        +bloomTimeCrewCommand(member,active)+'</article>';
}

function bloomTimeCrewPeriodRow(member) {
    const days=member.days.map(day=>'<tr><td>'+bloomTimeHtml(day.work_date)+'</td><td>'+bloomTimeHtml(day.shift_count)
        +'</td><td>'+bloomTimeRecordedHours(day.hours)+'</td><td>'+bloomTimeHtml(day.evaluations)
        +'</td><td>'+bloomTimeHtml(day.activities)+'</td></tr>');
    const details=days.length ? '<details><summary>Daily records</summary><table><thead><tr><th>Day</th><th>Shifts</th>'
        +'<th>Hours</th><th>Evals</th><th>Activities</th></tr></thead><tbody>'+days.join('')+'</tbody></table></details>'
        : 'No recorded shifts or activity';
    return '<tr data-timecard-period-worker="'+bloomTimeHtml(member.username)+'"><th scope="row">'+bloomTimeHtml(member.name)
        +'</th><td>'+bloomTimeRecordedHours(member.hours)+'</td><td>'+bloomTimeHtml(member.evaluations)+'</td><td>'
        +bloomTimeHtml(member.activities)+'</td><td>'+details+'</td></tr>';
}

function bloomTimeCrewRoster(state) {
    if (!bloomTimeHasRoster(state)) return '';
    const members=state.board.crew.filter(member=>!state.worker || member.id===state.worker);
    return '<section class="timecard-panel"><h3>Inventory Crew</h3><div class="timecard-crew-strip">'
        +members.map(member=>bloomTimeCrewStatus(state,member)).join('')+'</div><h3>Pay-period summary</h3>'
        +'<div class="timecard-period-table" tabindex="0" role="region" aria-label="Pay-period summary"><table>'
        +'<thead><tr><th>Employee</th><th>Hours</th><th>Evals</th><th>Activities</th><th>Records</th></tr></thead>'
        +'<tbody>'+members.map(bloomTimeCrewPeriodRow).join('')+'</tbody></table></div></section>';
}
