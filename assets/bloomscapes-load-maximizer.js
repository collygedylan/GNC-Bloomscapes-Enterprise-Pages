let bloomscapesLoadState;
let bloomscapesLoadFitBound = false;
const bloomscapesLoadUnits=new Intl.NumberFormat('en-US',{maximumFractionDigits:4});
const BLOOMSCAPES_LOAD_BATCH_SIZE = 6;

function bloomscapesLoadText(value) {
    return escapeHtml(String(value ?? ''));
}

function bloomscapesLoadMeasure(value,unit) {
    return value==null || !Number.isFinite(Number(value)) ? 'Unknown' : bloomscapesLoadUnits.format(Number(value))+' '+unit;
}

function bloomscapesLoadMetric(label,value,unit) {
    return '<span>'+label+' <strong>'+bloomscapesLoadMeasure(value,unit)+'</strong></span>';
}

function bloomscapesLoadWeightNote(summary) {
    if (!summary.unknown_weight_lines) return '';
    const count=summary.unknown_weight_lines;
    return '<small>Known subtotal '+bloomscapesLoadMeasure(summary.known_subtotal_lbs,'lbs')+' · '+count
        +(count===1 ? ' line needs' : ' lines need')+' weight or quantity.</small>';
}

function bloomscapesReserveItem(item) {
    return '<li><strong>'+bloomscapesLoadText(item.commonname || item.itemcode)+' '+bloomscapesLoadText(item.contsize)
        +'</strong> · '+bloomscapesLoadUnits.format(item.recommended_qty)+' units · '
        +bloomscapesLoadMeasure(item.recommended_lbs,'lbs')+'<small>'+bloomscapesLoadText(item.customer)
        +' → '+bloomscapesLoadText(item.consignee)+'</small></li>';
}

function bloomscapesReserveFit(summary) {
    const fit=summary.fit;
    if (!fit?.items?.length) {
        return fit && !fit.matching_candidates ? '<small>No matching SOC Reserves for '+bloomscapesLoadText(summary.cohort)+'.</small>' : '';
    }
    const extra=fit.total_lines-fit.items.length;
    return '<details data-bloom-load-reserve-fit><summary>SOC Reserves · +'+bloomscapesLoadMeasure(fit.total_lbs,'lbs')
        +' · '+bloomscapesLoadText(summary.cohort)+'</summary><small>Weight fit. Verify cube before loading.</small><div data-bloom-load-reserve-items></div>'
        +(extra>0 ? '<small>'+extra+' more matching lines in this weight fit.</small>' : '')+'</details>';
}

function handleBloomscapesLoadFitToggle(event) {
    const details = event.target;
    if (!details.matches?.('[data-bloom-load-reserve-fit]')) return;
    const list = details.querySelector('[data-bloom-load-reserve-items]');
    if (!details.open) return list.replaceChildren();
    const summary = details.closest('[data-bloom-load]');
    const state = bloomscapesLoadState;
    if (!state || state.context.key!==summary.dataset.bloomLoadOwner || state.context.key!==currentBloomscapesLoadContext().key) return;
    const fit = state.entries.get(summary.dataset.bloomLoad)?.summary?.fit;
    if (fit?.items?.length) renderBloomscapesListWindow(list,fit.items,item=>bloomscapesListNode(bloomscapesReserveItem(item)));
}

function bloomscapesLoadSummary(summary) {
    if (!summary || summary.status!=='ready') return '<small>Current load unavailable</small>';
    const cube=summary.current_cube_cuft==null ? 'Cube unmeasured'
        : 'Known load cube '+bloomscapesLoadMeasure(summary.current_cube_cuft,'cu ft');
    const capacity=summary.cube_capacity_cuft==null ? ' · capacity unverified' : '';
    return '<div class="bloom-load-metrics">'+bloomscapesLoadMetric('Current Load Weight',summary.current_load_lbs,'lbs')
        +bloomscapesLoadMetric('Max Legal Payload',summary.max_payload_lbs,'lbs')
        +bloomscapesLoadMetric('Remaining Legal Weight',summary.remaining_lbs,'lbs')+'</div>'
        +bloomscapesLoadWeightNote(summary)+'<small>'+cube+capacity+'</small>'+bloomscapesReserveFit(summary);
}

function paintBloomscapesLoadBatch(state,replies) {
    for (const item of document.querySelectorAll('[data-bloom-load]')) {
        const summary=replies.get(item.dataset.bloomLoad);
        if (!summary || item.dataset.bloomLoadOwner!==state.context.key) continue;
        const wasOpen=item.querySelector('details')?.open;
        item.innerHTML=bloomscapesLoadSummary(summary);
        const details=item.querySelector('details');
        if (details) {
            details.open=Boolean(wasOpen);
            details.onclick=event=>event.stopPropagation();
        }
    }
}

async function flushBloomscapesLoad(state) {
    state.scheduled=false;
    if (state!==bloomscapesLoadState || state.busy || state.context.key!==currentBloomscapesLoadContext().key) return;
    const mounted=new Set([...document.querySelectorAll('[data-bloom-load]')]
        .filter(node=>node.dataset.bloomLoadOwner===state.context.key).map(node=>node.dataset.bloomLoad));
    for (const key of state.queued.keys()) if (!mounted.has(key)) state.queued.delete(key);
    const jobs=[...state.queued.entries()].slice(0,BLOOMSCAPES_LOAD_BATCH_SIZE);
    if (!jobs.length) return;
    jobs.forEach(([key])=>state.queued.delete(key));
    state.busy=true;
    let loaded;
    try {
        loaded=await readBloomscapesLoadMaximizer(state.context,jobs.map(([,scope])=>scope));
    } catch {
        loaded=jobs.map(()=>({status:'unavailable'}));
    } finally {
        state.busy=false;
    }
    if (state!==bloomscapesLoadState || state.context.key!==currentBloomscapesLoadContext().key) return;
    const replies=new Map(jobs.map(([key],index)=>[key,loaded[index]]));
    const now=Date.now();
    for (const [key,summary] of replies) {
        state.queued.delete(key);
        state.entries.delete(key);
        state.entries.set(key,{at:now,summary});
    }
    while (state.entries.size>600) state.entries.delete(state.entries.keys().next().value);
    paintBloomscapesLoadBatch(state,replies);
    scheduleBloomscapesLoad(state);
}

function scheduleBloomscapesLoad(state) {
    if (state.scheduled || state.busy || !state.queued.size) return;
    state.scheduled=true;
    requestAnimationFrame(()=>{void flushBloomscapesLoad(state);});
}

function bloomscapesLoadRequest(scope) {
    const key=bloomscapesLoadScopeIdentity(scope);
    if (!key) return null;
    const context=currentBloomscapesLoadContext();
    if (!context.farm || !context.owner) return null;
    if (bloomscapesLoadState?.context.key!==context.key) {
        bloomscapesLoadState={context,entries:new Map(),queued:new Map(),busy:false,scheduled:false};
    }
    const state=bloomscapesLoadState;
    const prior=state.entries.get(key);
    if (!prior || Date.now()-prior.at>45000) {
        const [kind,value,trip]=JSON.parse(key);
        state.queued.set(key,kind==='order' ? {kind,id:value} : {kind,dock:value,...(trip && {trip})});
        scheduleBloomscapesLoad(state);
    }
    return {key,owner:context.key,summary:prior?.summary};
}

function renderBloomscapesLoadMaximizer(scope) {
    if (scope?.kind !== 'order' && typeof allowsBloomscapesAreaSubview === 'function'
        && !allowsBloomscapesAreaSubview('load-maximizer')) return '';
    const entry=bloomscapesLoadRequest(scope);
    if (!entry) return '';
    if (!bloomscapesLoadFitBound) {
        bloomscapesLoadFitBound = true;
        document.addEventListener('toggle',handleBloomscapesLoadFitToggle,true);
    }
    return '<aside class="bloom-load-summary" data-bloom-load="'+bloomscapesLoadText(entry.key)
        +'" data-bloom-load-owner="'+bloomscapesLoadText(entry.owner)+'">'
        +(entry.summary ? bloomscapesLoadSummary(entry.summary) : '<small>Checking load capacity…</small>')+'</aside>';
}

function openBloomscapesDockCapacity(root) {
    if (!allowsBloomscapesAreaSubview('load-maximizer')) return false;
    closeBloomscapesDockCapacity();
    const panel = document.createElement('section');
    panel.dataset.dockCapacityView = '';
    panel.className = 'freeze-panel';
    panel.innerHTML = '<h2>Load Maximizer</h2><button type="button" data-module-back>← Docks Board</button>'
        + '<label>Dock <select aria-label="Capacity dock" disabled></select></label><div role="status"></div>';
    root.prepend(panel);
    const context = currentBloomscapesLoadContext();
    const current = () => panel.isConnected && getCurrentVisibleViewId() === 'docks'
        && getBloomscapesFarm() === context.farm && getSupabaseReadIdentityScope() === context.owner
        && allowsBloomscapesAreaSubview('load-maximizer');
    panel.querySelector('[data-module-back]').onclick = () => {
        closeBloomscapesDockCapacity();
        updateGlobalBackButton();
    };
    void mountBloomscapesCapacityDocks(panel, context.farm, current);
    updateGlobalBackButton();
    return false;
}

function closeBloomscapesDockCapacity() {
    document.querySelector('#view-docks > [data-dock-capacity-view]')?.remove();
}

async function mountBloomscapesCapacityDocks(panel, farm, current) {
    const status = panel.querySelector('[role="status"]');
    status.textContent = 'Loading docks…';
    try {
        const docks = await readBloomscapesCapacityDocks(farm);
        if (current()) paintBloomscapesDockCapacity(panel, docks, current);
    } catch (error) {
        if (current()) status.textContent = error.message;
    }
}

function paintBloomscapesDockCapacity(panel, docks, current) {
    const status = panel.querySelector('[role="status"]');
    if (!docks.length) {
        status.textContent = 'No docks have open loads for this farm.';
        return;
    }
    const select = panel.querySelector('select');
    const sorted = [...docks].sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
    select.replaceChildren(...sorted.map(dock => new Option(formatDockViewDockLabel(dock),dock)));
    select.disabled = false;
    select.onchange = () => {
        if (current()) status.innerHTML = renderBloomscapesLoadMaximizer({kind:'dock',dock:select.value});
    };
    select.onchange();
}
