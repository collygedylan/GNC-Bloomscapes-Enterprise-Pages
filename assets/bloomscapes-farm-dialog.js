let bloomscapesFarmDialog = null;

/** @param {string} previous @param {string} next @param {boolean} initial @returns {Promise<boolean|string>} The confirmed selection for the same session. */
function confirmBloomscapesFarmSwitch(previous,next,initial=false) {
    if (!initial && previous===next) return Promise.resolve(true);
    if (bloomscapesFarmDialog) return bloomscapesFarmDialog.promise;
    const owner = String(currentUser);
    const dialog = document.createElement('dialog');
    dialog.className = 'bloomscapes-farm-dialog';
    dialog.setAttribute('aria-label',initial ? 'Choose session farm' : 'Confirm Farm Switch');
    const title = dialog.appendChild(document.createElement('h2'));
    title.textContent = initial ? 'Choose your farm for this session' : 'Confirm Farm Switch';
    const message = dialog.appendChild(document.createElement('p'));
    message.textContent = initial ? 'Select the farm you are selling or working from.'
        : `Switch your active session farm from ${previous} to ${next}? All inventory, orders, Assigned To owners, and Que work will switch to ${next}.`;
    const select = appendBloomscapesFarmDialogChoices(dialog,next,initial);
    const state = {dialog,owner};
    state.promise = new Promise(resolve=>bindBloomscapesFarmDialog(state,select,resolve,initial,next));
    bloomscapesFarmDialog = state;
    document.body.appendChild(dialog);
    document.getElementById('mobile-push-enable-prompt')?.remove();
    document.body.classList.add('bloomscapes-farm-choosing');
    dialog.showModal();
    return state.promise;
}

function appendBloomscapesFarmDialogChoices(dialog,next,initial) {
    if (!initial) return null;
    const select = dialog.appendChild(document.createElement('select'));
    select.setAttribute('aria-label','Session farm');
    for (const farm of getBloomscapesAllowedFarms()) {
        const option = select.appendChild(document.createElement('option'));
        option.value = option.textContent = farm;
    }
    select.value = next;
    return select;
}

function bindBloomscapesFarmDialog(state,select,resolve,initial,next) {
    const finish = value=>{
        if (bloomscapesFarmDialog!==state) return;
        bloomscapesFarmDialog = null;
        state.dialog.close();
        state.dialog.remove();
        document.body.classList.remove('bloomscapes-farm-choosing');
        resolve(state.owner===String(currentUser) ? value : false);
    };
    const confirm = state.dialog.appendChild(document.createElement('button'));
    confirm.type = 'button';
    confirm.textContent = initial ? 'Use this farm' : `Confirm Switch to ${next}`;
    const choose = farm => {
        if (bloomscapesFarmDialog!==state || state.owner!==String(currentUser)
            || !getBloomscapesAllowedFarms().includes(farm)) return;
        const pending = selectBloomscapesFarm(farm);
        finish(initial ? farm : true);
        void pending.catch(error=>showToast('Farm selection',error.message,true));
    };
    bindBloomscapesFarmTouch(confirm,()=>choose(select ? select.value : next));
    appendBloomscapesFarmPills(state.dialog,choose);
    if (!initial) {
        const cancel = state.dialog.appendChild(document.createElement('button'));
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click',event=>{event.stopPropagation();finish(false);});
    }
    state.dialog.addEventListener('cancel',event=>{
        event.preventDefault();
        if (!initial) finish(false);
    });
}

function bindBloomscapesFarmTouch(button,command) {
    let activated = false;
    const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        if (activated) return;
        activated = true;
        command();
    };
    for (const type of ['click','touchend','pointerup']) button.addEventListener(type,activate);
}

function appendBloomscapesFarmPills(dialog,choose) {
    const pills = dialog.appendChild(document.createElement('div'));
    pills.className = 'bloomscapes-farm-pills';
    for (const farm of getBloomscapesAllowedFarms()) {
        const button = pills.appendChild(document.createElement('button'));
        button.type = 'button';
        button.textContent = farm;
        bindBloomscapesFarmTouch(button,()=>choose(farm));
    }
}

/** @returns {Promise<void>} Reconciles the effective farm options and initiates any required session hydration. */
async function syncBloomscapesFarmSelector() {
    const select = document.getElementById('bloomscapes-farm-selector');
    if (!select) return;
    const farms = getBloomscapesAllowedFarms();
    const allowed = typeof bloomscapesVisibleFarmChoices==='function' ? bloomscapesVisibleFarmChoices(farms) : farms;
    const signature = allowed.join(',');
    if (select.dataset.farms!==signature) {
        select.replaceChildren(...allowed.map(farm=>new Option(farm,farm)));
        select.dataset.farms = signature;
    }
    select.value = getBloomscapesFarm();
    select.parentElement.hidden = false;
    const initial = bloomscapesFarmNeedsConfirmation();
    select.disabled = allowed.length <= 1 || initial;
    if (bloomscapesFarmState.busy || bloomscapesFarmDialog || !initial && !bloomscapesFarmNeedsHydration()) return;
    if (initial) {
        const state = bloomscapesFarmState;
        const chosen = await confirmBloomscapesFarmSwitch(getBloomscapesFarm(),getBloomscapesFarm(),true);
        if (!chosen || state !== bloomscapesFarmState || currentUser !== state.owner) return;
    } else {
        const farm = getBloomscapesFarm();
        if (!confirmBloomscapesFarmSession(farm)) return;
        void selectBloomscapesFarm(farm).catch(error=>showToast('Farm selection',error.message,true));
    }
    select.disabled = allowed.length <= 1;
    select.value = getBloomscapesFarm();
    refreshBloomscapesFarmPanel();
}
