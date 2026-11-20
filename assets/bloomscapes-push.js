async function registerCurrentBloomscapesRadioDevice(options={}) {
    if (bloomscapesCommAccess('walkie')!==true) return false;
    const farm=getBloomscapesFarm();
    let permission=Notification.permission;
    if(permission==='default' && options.prompt)permission=await Notification.requestPermission();
    if(permission!=='granted')return false;
    const {client,owner}=await requireBloomscapesSession();
    const config=bloomscapesData(await client.functions.invoke('bloomscapes-communications',{body:{operation:'configuration'}}));
    if (!config.configured || !config.publicKey) throw Error('Radio push is not configured.');
    const registration=await window.withBootDeadline(navigator.serviceWorker.ready);
    if(!registration?.pushManager)return false;
    const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
    let subscription=await registration.pushManager.getSubscription();
    if (subscription && String(new Uint8Array(subscription.options.applicationServerKey))!==String(bytes)) {
        await subscription.unsubscribe();
        subscription=null;
    }
    subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    await requireBloomscapesOwner(owner);
    if (farm!==getBloomscapesFarm() || bloomscapesCommAccess('walkie')!==true) return false;
    const data=subscription.toJSON();
    const saved=await bloomscapesRadioRpc(client,'gnc_register_walkie_push',{
        p_endpoint:data.endpoint,p_p256dh:data.keys.p256dh,p_auth:data.keys.auth,
        p_farm_code:farm,p_user_agent:navigator.userAgent});
    if (saved!==true) throw Error('Radio notification registration was not confirmed.');
    return true;
}

async function subscribeCurrentDeviceForPush(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!isPushSupported() || !currentUser || !getPushPromptUserScope()) return false;
    if (window.GncBloomscapesEnvironment?.projectRef==='ozuligoikpyzgnmeccrw') return registerCurrentBloomscapesRadioDevice(opts);
    if (!PUSH_VAPID_PUBLIC_KEY) {
        console.warn('Push notifications are not configured. Add a VAPID public key first.');
        return false;
    }
    const reg = await window.withBootDeadline(navigator.serviceWorker.ready);
    if (!reg) return false;
    let permission = Notification.permission;
    if (permission === 'default' && opts.prompt) {
        permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;
    hideMobilePushEnablePrompt();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription || opts.force) {
        if (subscription && opts.force) {
            try { await subscription.unsubscribe(); } catch { globalThis.reportHandledRuntimeIssue?.("subscribeCurrentDeviceForPush", 'HANDLED_OPERATION_FAILURE'); }
        }
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: pushPublicKeyToUint8Array(PUSH_VAPID_PUBLIC_KEY)
        });
    }
    if (subscription && subscription.endpoint) currentPushSubscriptionEndpoint = String(subscription.endpoint || '').trim();
    const persisted = await persistPushSubscription(subscription);
    if (persisted && isCellularPushDevice()) markMobilePushRefreshComplete();
    return persisted;
}

function primePushPermissionFromLoginGesture(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!isPushSupported()) return Promise.resolve(false);
    if (!opts.allowBeforeUserScope && (!currentUser || !getPushPromptUserScope())) return Promise.resolve(false);
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission === 'granted');
    return Notification.requestPermission().then((permission) => permission === 'granted').catch(() => false);
}

