function savedAvNotePreferenceKey(item) {
    if (!currentUser || !item) return '';
    return 'bloomscapes:av-note-suggestions:'+JSON.stringify([getSupabaseReadIdentityScope(),
        getBloomscapesFarm(),normalizeAvNoteItemcode(item.ITEMCODE || item.itemcode)]);
}

function readRemovedAvNoteSuggestions(key) {
    if (!key) return [];
    try {
        const saved=JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(saved) ? saved.filter(value=>typeof value==='string').slice(-500) : [];
    } catch (error) {
        globalThis.reportHandledRuntimeIssue?.('saved_av_note_preferences',error);
        return [];
    }
}

function removeSavedAvNoteSuggestion(item,note) {
    const key=savedAvNotePreferenceKey(item);
    if (!key || !note) return false;
    const removed=[...new Set([...readRemovedAvNoteSuggestions(key),note])].slice(-500);
    try {
        localStorage.setItem(key,JSON.stringify(removed));
        return true;
    } catch (error) {
        globalThis.reportHandledRuntimeIssue?.('saved_av_note_preferences',error);
        return false;
    }
}
