async function uploadPhotoViaAppApi(prefix = 'default', blob = null, fileName = 'photo.jpg', contentType = 'image/jpeg', options = {}) {
    if (!blob) throw new Error('Missing photo file.');
    const hasDirectFallback = hasDirectSupabaseWriteFallbackConfigured();
    assertPhotoMutationSurface(prefix,options.sourceView);
    const useNativeUpload = (nativeAuthSessionActive && SECURE_DRIVE_EVIDENCE_PREFIXES.has(prefix)) || !APP_API_DB_WRITE_PROXY_ENABLED || (hasDirectFallback && isAppApiWriteProxyTemporarilyUnavailable());
    const nativeEvidenceUpload = (nativeAuthSessionActive && options.nativeMaster) || (useNativeUpload && SECURE_DRIVE_EVIDENCE_PREFIXES.has(prefix));
    const optimized = options.preparedPhoto || await optimizePhotoBlobForUpload(blob, fileName, {mainOnly:false});
    if (options.signal?.aborted || (options.isCurrent && !options.isCurrent())) throw Object.assign(new Error('Photo session changed.'), { code: 'REQUEST_ABORTED' });
    blob = optimized.blob || blob;
    contentType = optimized.contentType || contentType;
    const safeFileName = String(optimized.fileName || fileName || 'photo.jpg').trim() || 'photo.jpg';
    const formData = new FormData();
    formData.append('prefix', String(prefix || 'default').trim() || 'default');
    formData.append('uploadContract', 'plant-photo-v2');
    formData.append('fileName', safeFileName);
    formData.append('file', blob, safeFileName);
    if (optimized.thumbnail144Blob) formData.append('thumbnail144', optimized.thumbnail144Blob, safeFileName);
    if (optimized.thumbnail320Blob) formData.append('thumbnail320', optimized.thumbnail320Blob, safeFileName);
    formData.append('displayWidth', String(optimized.width || 0));
    formData.append('displayHeight', String(optimized.height || 0));
    formData.append('thumbnail144Width', String(optimized.thumbnail144Width || 0));
    formData.append('thumbnail144Height', String(optimized.thumbnail144Height || 0));
    formData.append('thumbnail320Width', String(optimized.thumbnail320Width || 0));
    formData.append('thumbnail320Height', String(optimized.thumbnail320Height || 0));
    if (options && options.formFields && typeof options.formFields === 'object') {
        Object.entries(options.formFields).forEach(([key, value]) => {
            const safeKey = String(key || '').trim();
            if (safeKey && value !== null && typeof value !== 'undefined') formData.append(safeKey, String(value));
        });
    }
    const payload = await sendPreparedRowPhotoUpload(formData, nativeEvidenceUpload, options);
    if (!payload || payload.ok !== true || !payload.publicUrl) {
        throw new Error(String(payload && (payload.error || payload.message) || 'Secure photo upload failed.'));
    }
    return payload;
}
