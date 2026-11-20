async function readBloomscapesBorrowedCards(farm,scope) {
    const board = await runBloomscapesBorrowedCardRpc(farm,scope,'gnc_borrowed_card_board',{p_farm:farm});
    if (!Array.isArray(board.people) || !Array.isArray(board.assignments) || typeof board.can_borrow !== 'boolean') {
        throw new Error('Borrowed cards returned an invalid board.');
    }
    return board;
}

async function commandBloomscapesBorrowedCard(farm,scope,action,input) {
    const receipt = await runBloomscapesBorrowedCardRpc(farm,scope,'gnc_borrowed_card_command',{
        p_farm:farm,p_action:action,p_input:input
    });
    if (receipt.action !== action || !receipt.id || !receipt.card_id || (input.id && receipt.id !== input.id)
        || (input.card_id && receipt.card_id !== input.card_id)) {
        throw new Error('The borrowed card receipt did not match this action.');
    }
    return receipt;
}

async function runBloomscapesBorrowedCardRpc(farm,scope,name,args) {
    const {client,owner} = await requireBloomscapesSession();
    if (farm !== getBloomscapesFarm() || scope !== getSupabaseReadIdentityScope()) {
        throw new Error('Borrowed work changed account or farm.');
    }
    const result = await client.rpc(name,args).abortSignal(AbortSignal.timeout(6500));
    await requireBloomscapesOwner(owner);
    const receipt = bloomscapesData(result);
    if (farm !== getBloomscapesFarm() || scope !== getSupabaseReadIdentityScope() || receipt?.ok !== true || receipt.farm_code !== farm) {
        throw new Error('The borrowed work receipt did not match the selected farm.');
    }
    return receipt;
}
