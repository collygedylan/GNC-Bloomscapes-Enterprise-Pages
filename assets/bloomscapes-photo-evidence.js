function getLocPhotoEvidenceContext(item = null, sourceView = '') {
    const view = String(sourceView || '').trim().toLowerCase();
    const table = String(firstNonEmptyValue(item && item.SOURCE_TABLE, item && item.source_table, '')).toLowerCase();
    if (view === 'flyer') return 'flyer';
    if (view === 'request') return 'request';
    if (view === 'docks' || view === 'dock') return 'dock';
    if (/^ph_flyer_folder_/.test(table)) return 'flyer';
    if (/^ph_(active_request|request_history)$/.test(table)) return 'request';
    return 'shared';
}

function getLocPhotoOwnedValue(item = null, keys = []) {
    // An explicit cleared canonical field must not fall back to a stale alias.
    for (const key of keys) {
        if (item && Object.prototype.hasOwnProperty.call(item, key)) return item[key];
    }
    return '';
}

function parseLocPhotoEvidenceTimestamp(value = '') {
    const text = String(value == null ? '' : value).trim();
    if (!/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(text)) return null;
    const calendar = text.slice(0, 10).split('-').map(Number);
    const check = new Date(Date.UTC(calendar[0], calendar[1] - 1, calendar[2]));
    if (check.getUTCFullYear() !== calendar[0] || check.getUTCMonth() !== calendar[1] - 1 || check.getUTCDate() !== calendar[2]) return null;
    const at = Date.parse(text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
    return Number.isFinite(at) ? at : null;
}

function getLocPhotoCaptureEvidence(value = '') {
    let text = String(value == null ? '' : value).trim();
    try { text = decodeURIComponent(text); } catch { return { provided: true, at: null }; }
    if (/^20\d{2}-\d{2}-\d{2}T/.test(text)) {
        const exact = parseLocPhotoEvidenceTimestamp(text);
        if (exact != null) return { provided: true, at: exact };
        if (!/\.(?:jpe?g|png|webp|gif|heic|heif|avif)$/i.test(text)) return { provided: true, at: null };
    }
    const epoch = text.match(/(?:^|\D)((?:1[6-9]|2[0-4])\d{11})(?=\D|$)/);
    if (epoch) return { provided: true, at: Number(epoch[1]) };
    const iso = text.match(/(?:^|\D)(20\d{2})[-_\/](\d{1,2})[-_\/](\d{1,2})(?=\D|$)/);
    const us = iso ? null : text.match(/(?:^|\D)(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2}|\d{2})(?=\D|$)/);
    const parts = iso ? [+iso[1], +iso[2], +iso[3]] : us ? [+us[3] < 100 ? 2000 + +us[3] : +us[3], +us[1], +us[2]] : null;
    if (!parts) return { provided: false, at: null };
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    return { provided: true, dateOnly: true, at: date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] ? +date : null };
}

function getLocPhotoEvidenceState(item = null, sourceView = '', now = Date.now()) {
    const context = getLocPhotoEvidenceContext(item, sourceView);
    const fields = {
        shared: [['PHOTO_LINK','photo_link','SAVED_PHOTO_LINK','saved_photo_link','PHOTOLINK','PHOTO LINK'], ['PHOTO_NAME','photo_name','SAVED_PHOTO_NAME','saved_photo_name','PHOTONAME','PHOTO NAME']],
        request: [['REQ_PHOTO_LINK','req_photo_link','REQUEST_PHOTO_LINK','request_photo_link','REQUESTPHOTO_LINK'], ['REQ_PHOTO_NAME','req_photo_name','REQUEST_PHOTO_NAME','request_photo_name','REQUESTPHOTONAME']],
        flyer: [['FLYER_PHOTO_LINK','flyer_photo_link','FLYERPHOTO_LINK'], ['FLYER_PHOTO_NAME','flyer_photo_name','FLYERPHOTONAME']],
        dock: [['DOCK_PHOTO_LINK','dock_photo_link','DOCKPHOTO_LINK'], ['DOCK_PHOTO_NAME','dock_photo_name','DOCKPHOTO_NAME']]
    }[context];
    const links = String(getLocPhotoOwnedValue(item, fields[0]) || '').split(',').map(value => value.trim());
    const names = String(getLocPhotoOwnedValue(item, fields[1]) || '').split(',').map(value => value.trim());
    const ownPrefix = context === 'request' ? 'REQ_' : context === 'flyer' ? 'FLYER_' : context === 'dock' ? 'DOCK_' : '';
    const dateKeys = context === 'shared'
        ? ['AV_RULE_PHOTO_UPDATED_AT','PHOTO_DATE','PHOTO_UPLOADED_AT','ROW_PHOTO_UPLOADED_AT','DATE_COMPLETED']
        : [ownPrefix + 'PHOTO_UPDATED_AT', ownPrefix + 'PHOTO_DATE', ownPrefix + 'PHOTO_UPLOADED_AT'];
    // Legacy completion dates belong to the owner only on its native row.
    const table = String(firstNonEmptyValue(item && item.SOURCE_TABLE, item && item.source_table, '')).toLowerCase();
    if ((context === 'request' && /^ph_(active_request|request_history)$/.test(table))
        || (context === 'flyer' && /^ph_flyer_folder_/.test(table))) dateKeys.push('DATE_COMPLETED');
    if (context === 'flyer') dateKeys.push('FLYER_COMPLETED');
    // A later completion cannot refresh an older photo-specific timestamp.
    // An invalid nonempty photo timestamp remains undated instead of falling through.
    const fallbackValue = firstNonEmptyValue(...dateKeys.flatMap(key => [item && item[key], item && item[key.toLowerCase()]]));
    const fallback = parseLocPhotoEvidenceTimestamp(fallbackValue);
    const states = [], currentDates = [];
    links.forEach((link, index) => {
        if (!link) return;
        const evidence = classifyBloomscapesPhoto(link, names[index], context, fallback, now);
        states.push(evidence.state);
        if (evidence.state === 'current') currentDates.push(evidence.at);
    });
    const state = currentDates.length ? 'current' : ['future','undated','stale','invalid'].find(value => states.includes(value)) || 'missing';
    return { context, state, qualified: currentDates.length > 0, photoCount: states.length, currentPhotoCount: currentDates.length,
        latestPhotoAt: currentDates.length ? Math.max(...currentDates) : null,
        expiresAt: currentDates.length ? Math.max(...currentDates) + 10 * 86400000 + 1 : null };
}

function classifyBloomscapesPhoto(link, name, context, fallback, now) {
    const relative = link.startsWith(SUPABASE_URL + '/') ? link.slice(SUPABASE_URL.length) : '';
    const object = relative.match(/^\/storage\/v1\/object\/public\/(request_photos|flyer_photos|season_sales_notes_photos|location_sales_notes_photos|dock_photos)\/[^?#]+$/);
    const sharedProxy = context === 'shared' && /^\/functions\/v1\/app-api\?photo_blob=[a-f0-9]{64}$/.test(relative);
    const canReadBucket = object && (object[1] !== 'dock_photos' || context === 'dock');
    const badPath = /[\u0000-\u001f\u007f\\]/.test(link) || /(?:^|\/|%2f)(?:\.|%2e){1,2}(?:\/|%2f|$)/i.test(link);
    if ((!sharedProxy && !canReadBucket) || badPath) return {state:'invalid', at:null};
    const captures = [sharedProxy ? null : getLocPhotoCaptureEvidence(link), getLocPhotoCaptureEvidence(name)].filter(value => value?.provided);
    const at = bloomscapesPhotoCaptureDate(captures, fallback, now);
    const state = at == null || !Number.isFinite(now) ? 'undated' : at > now ? 'future'
        : now - at > 10 * 86400000 ? 'stale' : 'current';
    return {state, at};
}

function bloomscapesPhotoCaptureDate(captures, fallback, now) {
    if (!captures.length) return fallback;
    if (captures.some(value => value.at == null)) return null;
    const day = Math.floor(now / 86400000);
    return Math.max(...captures.map(value => value.dateOnly && value.at > now && Math.floor(value.at / 86400000) === day
        ? day * 86400000 : value.at));
}
