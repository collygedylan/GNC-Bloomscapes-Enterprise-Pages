/** @returns {AbortSignal|null} Current Docks view lifecycle signal. */
function currentDocksReadVisit() {
    if (typeof getCurrentVisibleViewId !== 'function' || getCurrentVisibleViewId() !== 'docks') return null;
    return window.AgMetricLifecycle.getSignal('view');
}

/**
 * @param {AbortSignal} visit
 * @param {AbortSignal} parent
 * @returns {AbortSignal} Signal joining the visit and optional parent cancellation.
 */
function docksReadSignal(visit,parent) {
    return parent && parent !== visit ? AbortSignal.any([visit,parent]) : visit;
}

/**
 * @param {Array<object>} adapters
 * @param {AbortSignal} visit
 * @returns {Array} Adapters whose stage reads honor the visit lifecycle.
 */
function bindDocksAdapterVisit(adapters,visit) {
    return adapters.map(adapter=>({...adapter,stage:(options={})=>{
        visit.throwIfAborted();
        return adapter.stage({...options,docksVisit:visit,signal:docksReadSignal(visit,options.signal)});
    }}));
}

/**
 * @param {AbortSignal} signal
 * @param {Function} read
 * @returns {Promise} Result of the read while its signal remains active.
 */
function waitForDocksRead(signal,read) {
    signal.throwIfAborted();
    let onAbort;
    const cancellation = new Promise((_resolve,reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort',onAbort,{once:true});
    });
    return Promise.race([Promise.resolve().then(()=>{ signal.throwIfAborted(); return read(); }),cancellation])
        .finally(()=>signal.removeEventListener('abort',onAbort));
}

/**
 * @param {string} key
 * @param {object} options
 * @param {unknown} cooldownKey
 * @param {unknown} terminalKey
 * @param {object} denial
 * @returns {Error|null} Active terminal denial after explicit retry or expiry handling.
 */
function applicableSupabaseReadDenial(key,options,cooldownKey,terminalKey,denial) {
    if (options.explicitRetry === true && key.startsWith('aura_inventory_v2:')) {
        supabaseReadTerminalDenials.delete(terminalKey);
        supabaseReadFailureCooldowns.delete(cooldownKey);
        return null;
    }
    if (denial?.until > Date.now()) return denial.error;
    if (denial) supabaseReadTerminalDenials.delete(terminalKey);
    return null;
}

/**
 * @param {string} key
 * @param {object} previous
 * @param {string} identity
 * @returns {void} Cancels and removes a superseded read generation.
 */
function retireSupersededRead(key,previous,identity) {
    if (previous.retainOnGenerationChange && previous.identityScope === identity) return;
    previous.controller.abort();
    supabaseReadLatestByKey.delete(key);
}

const bloomscapesDockBoardLists = ['tags','drops','trips','suspend','people','borrows','traffic'];

async function readBloomscapesDockBoard(farm, identity) {
    const {owner} = await requireBloomscapesSession();
    assertBloomscapesDockScope(farm, identity);
    const board = await supabaseRpc('gnc_pull_board',{p_farm:farm},{timeoutMs:12000});
    await requireBloomscapesOwner(owner);
    assertBloomscapesDockScope(farm, identity);
    if (board?.farm_code !== farm || !bloomscapesDockBoardLists.every(key => Array.isArray(board[key]))) {
        throw new Error('The Dock board did not match the selected farm.');
    }
    return board;
}

async function sendBloomscapesDockCommand(farm, identity, action, input) {
    const {client, owner} = await requireBloomscapesSession();
    assertBloomscapesDockScope(farm, identity);
    const result = await client.rpc('gnc_pull_command', {p_farm:farm,p_action:action,p_input:input});
    await requireBloomscapesOwner(owner);
    assertBloomscapesDockScope(farm, identity);
    const receipt = bloomscapesData(result);
    if (receipt?.ok !== true || receipt.farm_code !== farm || receipt.action !== action
        || !bloomscapesDockReceiptMatches(action,input,receipt)) {
        throw new Error('The Dock command did not return a matching receipt.');
    }
    if (action === 'set_truck') publishPhPullDockStatus(farm,identity,{
        kind:'truck',dock:receipt.dock,trip:receipt.trip,truck:input.truck,effective:receipt.order_pull_status,revision:receipt.order_pull_revision
    });
    return receipt;
}

function bloomscapesDockReceiptMatches(action, input, receipt) {
    if (action === 'borrow' && !receipt.id) return false;
    if (action !== 'borrow' && input.id && receipt.id !== input.id) return false;
    return ['dock','trip','drop'].every(key => input[key] == null || String(input[key]) === String(receipt[key]));
}

function assertBloomscapesDockScope(farm, identity) {
    if (farm !== getBloomscapesFarm() || identity !== getSupabaseReadIdentityScope()) {
        throw new Error('The Dock board changed account or farm.');
    }
}

function dockBrowseRowsFromBoard(board) {
    return (board?.tags || []).map(tag=>normalizeSocDockRowAliases({
        UNIQUE_ID:tag.id, FARM_CODE:board.farm_code, farm_code:board.farm_code,
        DOCK:tag.dock, DOCK_NUM:tag.dock, TRIPNUMBER:tag.trip, STOPNUMBER:tag.drop,
        ITEMCODE:tag.itemcode, LOCATIONCODE:tag.locationcode, LOTCODE:tag.lotcode, COMMONNAME:tag.commonname,
        CONTSIZE:tag.contsize, QUANTITYORDERED:tag.quantity, WINGDINGUNITS:tag.wingdingunits,
        PLANSTART:tag.plan_start, CONSIGNEENAME:tag.consignee, CUSTOMERNAME:tag.customer,
        SALESREPNAME:tag.rep, SALESREPID:tag.rep_id, CONSIGNEESTATE:tag.state
    }));
}
