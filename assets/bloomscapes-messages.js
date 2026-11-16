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
    switchView('chat');
    return false;
}

function renderBloomscapesMessagesView(view) {
    if (view!=='chat') return false;
    if (!nativeAuthSessionActive) {mountBloomscapesLegacyChat();return false;}
    const root=document.getElementById('view-chat');
    if (!root.querySelector('[data-bloomscapes-messages]')) {
        root.innerHTML='<section data-bloomscapes-messages><h2>Messages</h2>'
            +'<button type="button" data-message-refresh>Refresh</button><button type="button" data-message-read>Mark shown messages read</button>'
            +'<form><label>Recipient <input name="recipient" placeholder="Farm channel or exact username"></label>'
            +'<label>Message <textarea name="body" maxlength="4000" required></textarea></label><button type="submit" disabled>Send Message</button></form>'
            +'<p role="status"></p><div data-message-list></div></section>';
        root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();void dispatchBloomscapesMessage(event.target);});
        root.querySelector('[data-message-refresh]').addEventListener('click',()=>void refreshBloomscapesMessages().catch(reportBloomscapesMessagesFailure));
        root.querySelector('[data-message-read]').addEventListener('click',()=>void markBloomscapesMessagesRead().catch(reportBloomscapesMessagesFailure));
    }
    renderBloomscapesMessageRows();
    void connectBloomscapesMessages().catch(reportBloomscapesMessagesFailure);
    return true;
}

function renderBloomscapesMessageRows() {
    const root=document.querySelector('[data-bloomscapes-messages]');
    if (!root || getCurrentVisibleViewId()!=='chat') return;
    const state=bloomscapesMessagesState;
    if (state.farm!==getBloomscapesFarm() || state.owner!==nativeAuthProfile?.id) return;
    root.querySelector('[type=submit]').disabled=state.access!=='FULL_EDIT';
    const list=root.querySelector('[data-message-list]');list.replaceChildren();
    for (const message of state.rows) {
        const card=list.appendChild(document.createElement('article'));
        card.appendChild(document.createElement('strong')).textContent=message.sender+' → '+(message.recipient || message.farm_code);
        card.appendChild(document.createElement('time')).textContent=' · '+new Date(message.created_at).toLocaleString();
        card.appendChild(document.createElement('p')).textContent=message.body;
    }
    root.querySelector('[role=status]').textContent=state.farm+' · '+state.unread+' unread · '+state.rows.length+' recent messages';
}

function updateFooterChatBadge() {
    const badge = document.getElementById('footer-chat-badge');
    if (!badge) return;
    const unread = nativeAuthSessionActive ? bloomscapesMessagesState.unread : getTotalChatUnreadCount() + getDepartmentCalendarUnreadCount();
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread <= 0);
}

function mountBloomscapesLegacyChat() {
    const root=document.getElementById('view-chat');
    if (root && !root.querySelector('#chat-content')) root.innerHTML=BLOOMSCAPES_LEGACY_CHAT;
}
