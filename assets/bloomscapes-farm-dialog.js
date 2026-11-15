let bloomscapesFarmDialog = null;

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
        : `Switch active farm from ${previous} to ${next}?`;
    const select = appendBloomscapesFarmDialogChoices(dialog,next,initial);
    const state = {dialog,owner};
    state.promise = new Promise(resolve=>bindBloomscapesFarmDialog(state,select,resolve,initial));
    bloomscapesFarmDialog = state;
    document.body.appendChild(dialog);
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

function bindBloomscapesFarmDialog(state,select,resolve,initial) {
    const finish = value=>{
        if (bloomscapesFarmDialog!==state) return;
        bloomscapesFarmDialog = null;
        state.dialog.close();
        state.dialog.remove();
        resolve(state.owner===String(currentUser) ? value : false);
    };
    const confirm = state.dialog.appendChild(document.createElement('button'));
    confirm.type = 'button';
    confirm.textContent = initial ? 'Use this farm' : 'Confirm switch';
    confirm.addEventListener('click',()=>finish(select ? select.value : true));
    if (!initial) {
        const cancel = state.dialog.appendChild(document.createElement('button'));
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click',()=>finish(false));
    }
    state.dialog.addEventListener('cancel',event=>{
        event.preventDefault();
        if (!initial) finish(false);
    });
}

async function syncBloomscapesFarmSelector() {
    const select = document.getElementById('bloomscapes-farm-selector');
    if (!select || select.disabled) return;
    const allowed = getBloomscapesAllowedFarms();
    const signature = allowed.join(',');
    if (select.dataset.farms!==signature) {
        select.replaceChildren(...allowed.map(farm=>new Option(farm,farm)));
        select.dataset.farms = signature;
    }
    select.value = getBloomscapesFarm();
    select.parentElement.hidden = allowed.length===1;
    const initial = bloomscapesFarmNeedsConfirmation();
    if (bloomscapesFarmDialog || !initial && !(allowed.length===1 && bloomscapesFarmNeedsHydration())) return;
    select.disabled = true;
    const chosen = initial ? await confirmBloomscapesFarmSwitch(getBloomscapesFarm(),getBloomscapesFarm(),true) : allowed[0];
    if (!chosen) return;
    try {
        await selectBloomscapesFarm(chosen);
        confirmBloomscapesFarmSession(chosen);
        select.value = chosen;
        refreshBloomscapesFarmPanel();
    } catch (error) { showToast('Farm selection',error.message,true); }
    finally { select.disabled = false; }
}
