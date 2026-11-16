const BLOOMSCAPES_LEGACY_CHAT=`                    <div class="freeze-panel">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div id="chat-crumb" class="text-xs font-bold text-[#007a4d] uppercase tracking-[0.16em]">Messages</div>
                                <div id="chat-title" class="text-xl font-black text-slate-900">Chat</div>
                            </div>
                            <button type="button" class="rounded-xl border border-green-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#007a4d] shadow-sm active:scale-95" onclick="openNewChatComposer()"><i class="ph-bold ph-plus text-base align-middle"></i><span class="align-middle ml-1">New</span></button>
                        </div>
                    </div>
                    <div id="chat-content"></div>
                `;
function openBloomscapesMessages() {
    bloomscapesCommState.mode='text';
    switchView('chat');
    renderBloomscapesComm();
    return false;
}

function renderBloomscapesMessagesView(view) {
    if (view!=='chat') return false;
    if (!nativeAuthSessionActive) {mountBloomscapesLegacyChat();return false;}
    const root=document.getElementById('view-chat');
    if (!root.querySelector('[data-comm-hub]')) root.innerHTML=renderBloomscapesCommHub();
    mountBloomscapesCommHub(root);
    renderBloomscapesComm();
    void connectBloomscapesMessages().catch(reportBloomscapesMessagesFailure);
    return true;
}

function updateFooterChatBadge() {
    const badge = document.getElementById('footer-chat-badge');
    if (!badge) return;
    const unread = nativeAuthSessionActive ? bloomscapesMessagesState.unread + bloomscapesRadioInbox.count : getTotalChatUnreadCount() + getDepartmentCalendarUnreadCount();
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread <= 0);
}

function mountBloomscapesLegacyChat() {
    const root=document.getElementById('view-chat');
    if (root && !root.querySelector('#chat-content')) root.innerHTML=BLOOMSCAPES_LEGACY_CHAT;
}
