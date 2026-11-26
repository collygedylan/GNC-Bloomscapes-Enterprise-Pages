
function bloomTimeDefaultJob(state,department) {
    return state.board.codes.find(code=>code.default_for===department);
}

function bloomTimeCardInput(state,jobId=state.jobCodeId) {
    const context=bloomTimeContext(state);
    if (!context) throw new Error('Select your department.');
    return {job_code_id:jobId || bloomTimeDefaultJob(state,context.department)?.id || null,
        department:context.department,borrowed_assignment_id:context.borrowed_assignment_id};
}

function bloomTimeManagerStart(state,employee) {
    if (employee.active || employee.other_clock || !state.board.can_manage_crew) return;
    return bloomTimeSave(state,'clock_in',{worker_user_id:employee.id,department:'156',
        job_code_id:bloomTimeDefaultJob(state,'156')?.id || null});
}

function bloomTimeFindRow(state,id) {
    if (!id) return null;
    return state.board.rows.find(row=>row.id===id)
        || [state.board.self_clock,...state.board.crew.map(member=>member.active)].find(row=>row?.id===id);
}

function bloomTimePendingRow(state,action,input,request) {
    if (action==='clock_out') {
        const row=bloomTimeFindRow(state,input.id);
        return row && {...row,allowed:[],pending:'Saving clock out…'};
    }
    if (action!=='clock_in') return null;
    const worker=input.worker_user_id || state.board.user_id;
    const member=state.board.crew.find(entry=>entry.id===worker);
    const job=state.board.codes.find(code=>String(code.id)===String(input.job_code_id));
    return {id:request,worker_user_id:worker,username:member?.username || state.board.username,
        name:member?.name || state.board.username,department:input.department,work_date:state.board.today,
        job_code_id:job?.id,code:job?.code,description:job?.default_label || job?.description,
        clock_in:new Date().toISOString(),hours:null,allowed:[],pending:'Saving clock in…'};
}

function bloomTimeClockFor(state,worker,active) {
    if (state.pending?.row?.worker_user_id!==worker) return active;
    return state.pending.action==='clock_in' ? state.pending.row : null;
}

function bloomTimeSelfClock(state) {
    return state.board && bloomTimeClockFor(state,state.board.user_id,state.board.self_clock);
}

function bloomTimeUpsertRows(state,updates) {
    const board=state.board;
    const replaced=new Map(updates.map(row=>[row.id,row]));
    const current=new Set(board.rows.map(row=>row.id));
    const rows=board.rows.map(row=>replaced.get(row.id) || row);
    const visible=row=>(row.work_date>=state.from && row.work_date<=state.to)
        || (row.worker_user_id===board.user_id && row.hours==null) || row.pending;
    return [...updates.filter(row=>!current.has(row.id) && visible(row)),...rows];
}

function bloomTimeApplyReceipt(state,receipt) {
    const board=state.board;
    const row=receipt.row;
    const updates=receipt.closed_row ? [row,receipt.closed_row] : [row];
    board.rows=bloomTimeUpsertRows(state,updates);
    if (row.worker_user_id===board.user_id) board.self_clock=row.hours==null ? row : null;
    const member=board.crew.find(entry=>entry.id===row.worker_user_id);
    if (member && row.department==='156') member.active=row.hours==null ? row : null;
}


function assertBloomTimeReceipt(state,action,input,receipt) {
    const expected=input.worker_user_id || bloomTimeFindRow(state,input.id)?.worker_user_id || state.board.user_id;
    const row=receipt.row;
    if (row?.id!==receipt.id || row.revision!==receipt.revision || row.farm_code!==state.farm
        || row.worker_user_id!==expected || receipt.worker_user_id!==expected
        || (action==='switch_code' && (!receipt.closed_id || receipt.closed_row?.id!==receipt.closed_id))) {
        throw new Error('The saved time card did not match this employee or farm.');
    }
}

async function bloomTimePersist(state,action,input,request) {
    const row=bloomTimePendingRow(state,action,input,request);
    if (row) {
        state.pending={action,row};
        bloomTimeRender(state);
    }
    try {
        const receipt=await sendBloomTimeCardCommand(state.farm,state.identity,action,{...input,request_id:request});
        if (!isBloomTimeCurrent(state)) return;
        assertBloomTimeReceipt(state,action,input,receipt);
        bloomTimeApplyReceipt(state,receipt);
        if (receipt.row.worker_user_id===state.board.user_id && input.job_code_id) {
            state.jobCodeId=String(input.job_code_id);
        }
        state.retry=null;
        state.editId=null;
        if (action==='log_hours') Object.assign(state,{logHours:'',logNotes:''});
        bloomTimeMessage(state,'Time card saved.');
    } finally {
        state.pending=null;
        if (isBloomTimeCurrent(state)) bloomTimeRender(state);
    }
    state.readyAt=0;
    try {
        await bloomTimeLoad(state);
    } catch(error) {
        if (isBloomTimeCurrent(state)) bloomTimeMessage(state,'Time card saved. '+error.message);
    }
}

async function bloomTimeSave(state,action,input) {
    if (state.busy) return;
    const fingerprint=JSON.stringify([action,input]);
    const request=state.retry?.fingerprint===fingerprint ? state.retry.id : crypto.randomUUID();
    state.retry={fingerprint,id:request};
    await bloomTimeRun(state,()=>bloomTimePersist(state,action,input,request));
}
