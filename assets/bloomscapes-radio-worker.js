function shellNoticeData(data,targetUrl,assigned) {
    return {url:targetUrl,viewId:assigned?'managers':data.viewId || 'request',
        homeTab:assigned?'assigned-items-export':data.homeTab || '',approvalId:data.approvalId || '',
        taskView:data.taskView || '',folderName:data.folderName || '',conversationId:data.conversationId || '',
        messageId:data.messageId || '',channelId:data.channelId || '',callId:data.callId || '',
        calendarEventId:data.calendarEventId || '',type:data.type || '',radioCallId:data.radioCallId || '',farm:data.farm || ''};
}
function shellNoticeTarget(value) {
    const target=getRequestUrl(value || APP_SHELL_URL);
    return isProductionShellUrl(target) ? target.href : getAbsoluteAssetUrl(APP_SHELL_URL);
}
function shellNoticeOptions(data,assigned) {
    const requestedIcon=data.icon ? new URL(data.icon,self.registration.scope) : null;
    const icon=(requestedIcon ? getBrandingCanonicalUrl(requestedIcon) || requestedIcon
        : new URL('./assets/branding/ag-data-solutions-icon-v2026080925-192.png',self.registration.scope)).href;
    const target=getRequestUrl(data.url || APP_SHELL_URL);
    if(assigned && target)target.searchParams.set('assignedItems','unassigned');
    const options={body:data.body || 'You have a new message.',icon,badge:icon,
        data:shellNoticeData(data,shellNoticeTarget(target?.href),assigned),actions:[],
        vibrate:[200,100,200],silent:false,requireInteraction:true,timestamp:Date.now(),
        tag:assigned?'gnc-unassigned-itemcodes-summary':data.tag || 'ag-data-alert',renotify:!assigned};
    if(assigned)options.body+=String(options.body).includes('Review Managers')?'':' Review Managers → Assigned Items.';
    if(data.viewId==='suspend-tag-approval' && /^[0-9a-f-]{36}$/i.test(data.approvalId || '')) {
        options.actions=[{action:'approve',title:'Approve'},{action:'deny',title:'Deny'}];
    }
    if(data.type==='bloomscapes_radio') {
        options.actions=[{action:'play_radio',title:'▶ Play Radio Call'},{action:'open_walkie',title:'🎙️ Open Walkie'}];
        options.renotify=false;
    }
    return options;
}
function handleBloomscapesShellPush(event) {
    let data={};
    if(event.data) {
        try {data=event.data.json();}
        catch {data={title:'Ag Data Message',body:event.data.text()};}
    }
    const assigned=data.homeTab==='assigned-items-export';
    const title=data.type==='bloomscapes_radio' ? '📻 Walkie: '+String(data.sender || data.title || 'Team').replace(/^📻\s*/, '').split(' · ')[0]
        : assigned?'New Unassigned Item Code(s)':data.title || 'Ag Data Message';
    event.waitUntil(self.registration.showNotification(title,shellNoticeOptions(data,assigned)));
}
async function retainSuspendNoticeAction(event,payload) {
    if(payload.viewId!=='suspend-tag-approval' || !/^[0-9a-f-]{36}$/i.test(payload.approvalId || '')
        || !['approve','deny'].includes(event.action))return;
    const cache=await caches.open('gnc-suspend-notification-actions');
    await cache.put(new URL('./__suspend_action/'+payload.approvalId,self.registration.scope).href,
        new Response(JSON.stringify({decision:event.action,expiresAt:Date.now()+10*60*1000})));
}
function postShellNotice(client,payload,action) {
    client.postMessage({...payload,type:'GNC_OPEN_VIEW'});
    if(payload.type==='bloomscapes_radio')client.postMessage({type:'BLOOMSCAPES_RADIO_CALL',
        action,callId:payload.radioCallId,farm:payload.farm});
}
async function openShellNotice(event) {
    const payload=event.notification.data || {};
    await retainSuspendNoticeAction(event,payload);
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(candidate=>isProductionShellUrl(candidate.url) && 'focus' in candidate);
    if(client) {
        await client.focus();
        postShellNotice(client,payload,event.action || 'play_radio');
        return client;
    }
    const target=new URL(shellNoticeTarget(payload.url));
    if(payload.type==='bloomscapes_radio') {
        target.searchParams.set('radioCall',payload.radioCallId);
        target.searchParams.set('radioAction',event.action || 'play_radio');
        target.searchParams.set('radioFarm',payload.farm);
    }
    const opened=await clients.openWindow?.(target.href);
    if(opened)postShellNotice(opened,payload,event.action);
    return opened;
}
function handleBloomscapesShellNotificationClick(event) {
    event.notification.close();
    event.waitUntil(openShellNotice(event));
}
self.addEventListener('push',handleBloomscapesShellPush);
self.addEventListener('notificationclick',handleBloomscapesShellNotificationClick);
