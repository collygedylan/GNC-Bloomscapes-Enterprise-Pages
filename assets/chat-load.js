async function fetchChatData(force = false) {
    if (nativeAuthSessionActive) {await connectBloomscapesMessages();return true;}
    if (typeof shouldUseProductionLiveSyncSideLoad === 'function' && shouldUseProductionLiveSyncSideLoad()) return ensureProductionLiveSyncSideData('chat', force);
    if (!currentUser) return false;
    if (!force && chatDataLoaded) return true;
    if (chatLoadPromise && !force) return chatLoadPromise;
    chatLoadPromise = fetchLegacyChatData();
    try {
        return await chatLoadPromise;
    } finally {
        chatLoadPromise = null;
    }
}

async function fetchLegacyChatData() {
    const schemaReady = await ensureChatSchemaReady();
    if (!schemaReady) return false;
    const currentUsername = getCurrentChatUsername();
    if (!currentUsername) return false;
    const [participantRows, userRows] = await Promise.all([
        chatApiGet(CHAT_PARTICIPANTS_TABLE, `select=*&username=eq.${encodeURIComponent(currentUsername)}&is_archived=eq.false&order=joined_at.desc`, 'Chat participants'),
        chatApiGet('ph_app_users', 'select=username,role&order=username.asc&limit=500', 'Chat users').catch(() => [])
    ]);
    const currentParticipants = (Array.isArray(participantRows) ? participantRows : []).map(normalizeChatParticipant).filter(Boolean);
    const conversationIds = [...new Set(currentParticipants.map((participant) => participant.conversationId).filter(Boolean))];
    chatUsers = (Array.isArray(userRows) ? userRows : []).map(normalizeChatUser).filter(Boolean);
    const currentUserEntry = { username: currentUsername, displayName: getCurrentChatDisplayName(), role: currentRole || '' };
    if (!chatUsers.some((user) => user.username === currentUsername)) chatUsers.push(currentUserEntry);
    if (!conversationIds.length) {
        chatConversations = [];
        chatParticipants = currentParticipants;
        chatMessages = [];
        activeChatConversationId = '';
        chatDataLoaded = true;
        updateFooterChatBadge();
        return true;
    }
    const idList = conversationIds.join(',');
    const [conversationRows, allParticipantRows, messageRows] = await Promise.all([
        chatApiGet(CHAT_CONVERSATIONS_TABLE, `select=*&id=in.(${idList})&order=updated_at.desc`, 'Chat conversations'),
        chatApiGet(CHAT_PARTICIPANTS_TABLE, `select=*&conversation_id=in.(${idList})&order=display_name.asc`, 'Chat participants'),
        chatApiGet(CHAT_MESSAGES_TABLE, `select=*&conversation_id=in.(${idList})&order=created_at.desc&limit=500`, 'Chat messages')
    ]);
    chatConversations = (Array.isArray(conversationRows) ? conversationRows : []).map(normalizeChatConversation).filter(Boolean);
    chatParticipants = (Array.isArray(allParticipantRows) ? allParticipantRows : []).map(normalizeChatParticipant).filter(Boolean);
    chatMessages = (Array.isArray(messageRows) ? messageRows : []).map(normalizeChatMessage).filter(Boolean);
    chatMessages.sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));
    if (pendingChatOpenConversationId && conversationIds.includes(pendingChatOpenConversationId)) {
        activeChatConversationId = pendingChatOpenConversationId;
        pendingChatOpenConversationId = '';
    }
    if (activeChatConversationId && !conversationIds.includes(activeChatConversationId)) activeChatConversationId = '';
    chatDataLoaded = true;
    if (activeChatConversationId) markChatConversationRead(activeChatConversationId).catch(() => {});
    updateFooterChatBadge();
    return true;
}
