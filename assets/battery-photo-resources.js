function releaseSavedDetailPreviewUrls() {
    const urls = new Set();
    for (const entries of pendingPhotoPreviews.values()) {
        for (const entry of entries) replaceSavedDetailPreview(entry, urls);
    }
    for (const url of urls) URL.revokeObjectURL(url);
}

function replaceSavedDetailPreview(entry, urls) {
    const saved = entry.publicUrl || entry.storageUrl;
    if (entry.status !== 'Uploaded' || !/^https:\/\//.test(saved || '')) return;
    const local = entry.localPreviewUrl || entry.url;
    if (!local?.startsWith('blob:')) return;
    entry.url = saved;
    entry.localPreviewUrl = '';
    urls.add(local);
}
