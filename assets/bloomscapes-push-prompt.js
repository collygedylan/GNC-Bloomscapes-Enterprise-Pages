function showMobilePushEnablePrompt() {
    if (document.body.classList.contains('bloomscapes-farm-choosing')) return false;
    if (!isPushSupported() || !currentUser || Notification.permission !== 'default' || document.hidden) return false;
    if (document.getElementById('mobile-push-enable-prompt')) return true;
    const prompt = document.createElement('div');
    prompt.id = 'mobile-push-enable-prompt';
    prompt.className = 'fixed left-3 right-3 z-[12000] rounded-2xl border border-green-200 bg-white p-4 shadow-2xl';
    prompt.style.bottom = 'calc(var(--footer-nav-reserve) + env(safe-area-inset-bottom) + .85rem)';
    prompt.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-50 text-[#007a4d]"><i class="ph-bold ph-bell-ringing text-xl"></i></div>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-black text-slate-900">Turn on push notifications</div>
                <div class="mt-1 text-xs font-bold leading-snug text-slate-500">This device needs permission before chat, request, and flyer alerts can show.</div>
                <div class="mt-3 flex gap-2">
                    <button id="mobile-push-enable-button" type="button" class="flex-1 rounded-xl bg-[#007a4d] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white active:scale-[.99]" onclick="enablePushNotificationsFromPrompt()">Enable</button>
                    <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95" onclick="dismissMobilePushEnablePrompt()" aria-label="Dismiss"><i class="ph-bold ph-x text-lg"></i></button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(prompt);
    return true;
}
