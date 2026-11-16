function isPhotoMutationSurface(prefix, sourceView = '') {
    const source = String(sourceView || activeDetailSourceView || lastView || '').trim().toLowerCase();
    if (prefix === 'req-') return source === 'request';
    return ['ssn-','lsn-','na-','global-'].includes(prefix) && source === 'drive';
}

function assertPhotoMutationSurface(prefix, sourceView = '') {
    if (!isPhotoMutationSurface(prefix, sourceView)) throw new Error('Open Drive Mode or Que to update photos.');
}

function rowPhotoCaptureDate(at = new Date()) {
    return [at.getMonth()+1,at.getDate(),String(at.getFullYear()).slice(-2)]
        .map(value=>String(value).padStart(2,'0')).join('/');
}
