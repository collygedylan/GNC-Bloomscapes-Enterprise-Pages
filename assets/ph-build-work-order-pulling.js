const PH_WORK_RPC = 'gnc_ph_pull_work_v1';
const PH_WORK_CONTROL_RPC = 'gnc_ph_pull_control_v1';
const PH_WORK_DOCK_OPTIONS = [
    ['','All'],['Live Driver','🚨 URGENT · LIVE DRIVER'],['Drop Trailer','Drop Trailer'],['Hold Trailer','Hold Trailer']
];

function canBuildPhOrderPullWork() {
    return nativeAuthSessionActive && nativeAuthProfile?.username === currentUser
        && phPullSupervisorAllowed(nativeAuthProfile,getBloomscapesFarm(),borrowedHelpPreview());
}

function phWorkDraft(team) {
    return {id:team?.team_id || '',unit:team?.unit_number || '',
        primary:team?.puller_primary || '',helper:team?.puller_helper || ''};
}

function phWorkVisibleRows(state) {
    return state.snapshot.rows.filter(row => (!state.priority || phPullDockLabel(row.dock_status) === state.priority)
        && matchesBloomscapesModuleSearch(state.search.value,
        [row.common_name,row.container_size,row.itemcode,row.locationcode,row.lotcode,row.dock,row.stopnumber]))
        .sort((a,b) => Number(phPullDockLabel(b.dock_status) === 'Live Driver')-Number(phPullDockLabel(a.dock_status) === 'Live Driver'));
}

function phWorkScopeIsCurrent(state) {
    return state.root.isConnected && canBuildPhOrderPullWork()
        && getSupabaseReadIdentityScope() === state.owner;
}

function changePhWorkInput(state,control) {
    if (!phWorkScopeIsCurrent(state)) return;
    if (control.matches('[data-ph-view]')) {
        state.root.querySelector('[data-ph-pool]').hidden = control.value === 'teams';
        paintPhWorkLoadPanel(state);
    }
    if (control.dataset.phTag) {
        if (!phPullToggleTag(state.snapshot.rows,state.selected,control.dataset.phTag)) {
            control.checked = false;
            state.status.textContent = 'The batch cannot exceed 650 WingDingUnits.';
        } else state.status.textContent = '';
    }
    if (control.dataset.phField) {
        state.draft[control.dataset.phField] = control.value;
        if (control.dataset.phField === 'primary') {
            if (state.draft.helper === control.value) state.draft.helper = '';
            paintPhWorkTeams(state);
            state.root.querySelector('[data-ph-field="primary"]').focus();
        }
    }
    paintPhWorkSelection(state);
}

function phWorkTeamCommand(state,action,target) {
    const id = action === 'release' ? target.dataset.teamId : state.draft.id;
    const existing = state.snapshot.teams.find(team => team.team_id === id);
    const base = existing ? {p_team:id,p_expected:existing.updated_at} : {};
    if (action === 'release') return ['release_ph_puller_buggy_team_v1',base];
    if (!state.draft.unit || !state.draft.primary) throw new Error('Select a unit and primary puller.');
    const rpc = existing ? 'update_or_swap_ph_puller_buggy_team_v1' : 'assign_ph_puller_buggy_team_v1';
    return [rpc,{...base,p_unit:state.draft.unit,p_primary:state.draft.primary,p_helper:state.draft.helper || null}];
}

function phWorkDispatchCommand(state) {
    const id = state.root.querySelector('[data-ph-dispatch-team]').value;
    const team = state.snapshot.teams.find(row => row.team_id === id);
    if (!team || !state.selected.size) throw new Error('Select an active team and at least one pull tag.');
    return [PH_WORK_RPC,{p_team:id,p_expected:team.updated_at,p_tags:[...state.selected]}];
}

function planPhWorkCommand(state,action,target) {
    if (action === 'refresh') return [PH_WORK_RPC];
    if (action === 'dispatch') return phWorkDispatchCommand(state);
    if (action === 'save' || action === 'release') return phWorkTeamCommand(state,action,target);
    const control = planPhWorkLoadControl(state.snapshot,action,target);
    return control && [PH_WORK_CONTROL_RPC,control];
}

function phWorkPriorityToolbar(root) {
    const toolbar = document.createElement('div');
    toolbar.className = 'flex flex-wrap gap-2';
    toolbar.setAttribute('role','group');
    toolbar.setAttribute('aria-label','Dock status');
    for (const [value,label] of PH_WORK_DOCK_OPTIONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.phPriority = value;
        button.className = 'rounded-full border border-emerald-600 px-3 py-1 text-sm font-semibold';
        if (value === 'Live Driver') button.classList.add('bg-red-800','text-white');
        button.textContent = label;
        button.setAttribute('aria-pressed',String(!value));
        toolbar.append(button);
    }
    root.querySelector('[data-ph-pool]').prepend(toolbar);
    return toolbar;
}

function selectPhWorkPriority(state,value) {
    state.priority = value;
    for (const button of state.priorityToolbar.querySelectorAll('[data-ph-priority]')) {
        button.setAttribute('aria-pressed',String(button.dataset.phPriority === value));
    }
    paintPhWorkRows(state,phWorkVisibleRows(state));
}

function refreshPhWorkAfterDockCommit(state) {
    if (!phWorkScopeIsCurrent(state) || document.hidden) return;
    if (state.pending) {
        state.refreshAfterCommand = true;
        return;
    }
    void applyPhWorkCommand(state,'refresh',PH_WORK_RPC);
}

async function applyPhWorkCommand(state,action,rpc,input) {
    try {
        state.pending = requestPhPullWork(rpc,input);
        state.status.textContent = 'Updating Park Hill work…';
        paintPhWorkState(state,phWorkVisibleRows(state));
        const receipt = await state.pending;
        if (!phWorkScopeIsCurrent(state)) return;
        if (rpc === PH_WORK_RPC || rpc === PH_WORK_CONTROL_RPC) {
            phAcceptWorkSnapshot(state,receipt);
            void refreshPhQrTelemetry(state);
        }
        else await applyPhWorkTeamChange(state,receipt.team);
        state.selected = new Set(state.snapshot.rows.map(row => row.pull_tag_id).filter(id => state.selected.has(id)));
        if (action === 'dispatch') state.selected.clear();
        state.status.textContent = action === 'dispatch' ? 'Batch assigned.' : '';
    } catch (error) {
        if (phWorkScopeIsCurrent(state)) state.status.textContent = error.message || 'Park Hill work could not be updated.';
    } finally {
        state.pending = null;
        if (phWorkScopeIsCurrent(state)) {
            paintPhWorkLoadPanel(state);
            paintPhWorkState(state,phWorkVisibleRows(state));
        }
        if (state.refreshAfterCommand) {
            state.refreshAfterCommand = false;
            refreshPhWorkAfterDockCommit(state);
        }
    }
}

function phApplySavedWorkTeam(snapshot,team) {
    const others = snapshot.teams.filter(row => row.team_id !== team.team_id);
    const prior = snapshot.teams.find(row => row.team_id === team.team_id);
    snapshot.teams = team.active ? [...others,{...prior,...team}] : others;
    return prior;
}

async function applyPhWorkTeamChange(state,team) {
    const prior = phApplySavedWorkTeam(state.snapshot,team);
    state.draft = phWorkDraft();
    paintPhWorkState(state,phWorkVisibleRows(state));
    if (team.active && !prior?.batch_open) state.root.querySelector('[data-ph-dispatch-team]').value = team.team_id;
    if (!team.active || prior?.batch_open && Array.isArray(state.snapshot.assigned_loads)) {
        const receipt = await requestPhPullWork(PH_WORK_RPC);
        if (phWorkScopeIsCurrent(state)) phAcceptWorkSnapshot(state,receipt);
    }
}

function dispatchPhWorkClick(state,event) {
    const priority = event.target.closest('[data-ph-priority]');
    if (priority && phWorkScopeIsCurrent(state)) return selectPhWorkPriority(state,priority.dataset.phPriority);
    const target = event.target.closest('[data-ph-action]');
    if (!target || !phWorkScopeIsCurrent(state) || state.pending) return;
    const action = target.dataset.phAction;
    if (action === 'open-swap') return openPhWorkLoadSwap(state,target);
    try {
        const command = planPhWorkCommand(state,action,target);
        if (command) return void applyPhWorkCommand(state,action,...command);
    } catch (error) {
        state.status.textContent = error.message;
        return;
    }
    if (action === 'auto-dispatch') return void autoDispatchPhWork(state);
    if (action === 'auto') {
        const load = phPackBuggyLoad(phWorkVisibleRows(state),phWorkChosenCrew(state));
        state.selected = new Set(load?.rows.map(row => row.pull_tag_id));
        state.status.textContent = state.selected.size ? '' : 'Check pick locations at this priority, or select tags manually.';
        paintPhWorkRows(state,phWorkVisibleRows(state));
        return;
    }
    const team = action === 'edit' && state.snapshot.teams.find(row => row.team_id === target.dataset.teamId);
    state.draft = phWorkDraft(team || null);
    paintPhWorkTeams(state);
    state.root.querySelector('[data-ph-field="unit"]').focus();
}

async function autoDispatchPhWork(state) {
    const plans = phPlanReadyTeams({...state.snapshot,rows:phWorkVisibleRows(state)});
    if (!plans.length) {
        state.status.textContent = 'No ready teams and routable pull tags are available together.';
        return;
    }
    const current = () => phWorkScopeIsCurrent(state);
    state.status.textContent = 'Assigning ready teams…';
    state.pending = dispatchPhReadyTeams(plans,current,receipt => phAcceptWorkSnapshot(state,receipt),() => state.dockRevision);
    paintPhWorkState(state,phWorkVisibleRows(state));
    let outcome;
    try {
        const count = await state.pending;
        outcome = count+' buggy load'+(count === 1 ? '' : 's')+' assigned.';
    } catch (error) {
        outcome = error.message;
    } finally {
        state.pending = null;
        state.selected = new Set(state.snapshot.rows.filter(row => state.selected.has(row.pull_tag_id)).map(row => row.pull_tag_id));
        if (current()) {
            paintPhWorkLoadPanel(state);
            paintPhWorkState(state,phWorkVisibleRows(state));
        }
        let refreshFailure = '';
        if (state.refreshAfterCommand) {
            state.refreshAfterCommand = false;
            if (current() && !document.hidden) {
                await applyPhWorkCommand(state,'refresh',PH_WORK_RPC);
                refreshFailure = state.status.textContent;
            }
        }
        if (current()) state.status.textContent = [outcome,refreshFailure].filter(Boolean).join(' ');
    }
}

function mountPhBuildWorkOrderPulling(host) {
    if (!canBuildPhOrderPullWork()) return;
    host.innerHTML = phWorkMarkup();
    const root = host.firstElementChild;
    mountPhWorkLoadPanel(root);
    const state = {root,owner:getSupabaseReadIdentityScope(),selected:new Set(),draft:phWorkDraft(),
        dockChanges:new Map(),dockRevision:0,snapshot:{rows:[],teams:[],units:[],pullers:[]},search:root.querySelector('[data-ph-work-search]'),
        status:root.querySelector('[data-ph-status]'),priority:'',priorityToolbar:phWorkPriorityToolbar(root)};
    mountPhSignTools(state);
    phObserveWorkDock(state,phWorkScopeIsCurrent,current => paintPhWorkRows(current,phWorkVisibleRows(current)),refreshPhWorkAfterDockCommit);
    root.addEventListener('click',event => dispatchPhWorkClick(state,event));
    root.addEventListener('change',event => changePhWorkInput(state,event.target));
    state.search.addEventListener('input',() => {
        if (phWorkScopeIsCurrent(state)) paintPhWorkRows(state,phWorkVisibleRows(state));
    });
    syncGlobalHeaderChrome({reason:'park-hill-build-work',force:true});
    void applyPhWorkCommand(state,'refresh',PH_WORK_RPC);
}
