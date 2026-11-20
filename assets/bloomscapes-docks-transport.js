const bloomscapesDockBoardLists = ['tags','drops','trips','suspend','people','borrows','traffic'];

async function readBloomscapesDockBoard(farm, identity) {
    const {client, owner} = await requireBloomscapesSession();
    assertBloomscapesDockScope(farm, identity);
    const result = await client.rpc('gnc_pull_board', {p_farm:farm});
    await requireBloomscapesOwner(owner);
    assertBloomscapesDockScope(farm, identity);
    const board = bloomscapesData(result);
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
