const REQUEST_GALLERY_STYLES = `
#request-photo-gallery-modal{box-sizing:border-box;position:fixed;inset:0;margin:0;width:100%;max-width:none;height:100dvh;max-height:none;padding:12px;border:0;color:#eef9f2;background:linear-gradient(#103220,#081c12);display:grid;grid-template-rows:auto minmax(120px,1fr) auto auto;gap:10px;font:16px system-ui}
#request-photo-gallery-modal::backdrop{background:#081c12}
#request-photo-gallery-modal header{display:flex;align-items:center;gap:10px;min-width:0}
#request-photo-gallery-modal h2{font-size:18px;margin:0;flex:1;overflow-wrap:anywhere}
#request-photo-gallery-modal button,#request-photo-gallery-modal select{min-height:44px;border:1px solid #57936c;border-radius:9px;background:#16452c;color:#fff;font:inherit;padding:6px 12px}
#request-photo-gallery-modal [data-gallery-stage]{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:6px;min-height:0}
#request-photo-gallery-modal [data-gallery-photo]{width:100%;height:100%;min-height:0;object-fit:contain;touch-action:pan-y;user-select:none}
#request-photo-gallery-modal [data-gallery-thumbs]{display:flex;gap:8px;overflow:auto;min-height:60px;padding:2px}
#request-photo-gallery-modal [data-gallery-thumbs] button{flex:0 0 64px;padding:2px;min-width:64px}
#request-photo-gallery-modal [aria-current=true]{outline:2px solid #b9efcf;outline-offset:1px}
#request-photo-gallery-modal [data-gallery-thumbs] img{width:56px;height:44px;object-fit:cover}
#request-photo-gallery-modal [data-gallery-details]{max-height:28dvh;overflow:auto}
#request-photo-gallery-modal dl{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin:8px 0}
#request-photo-gallery-modal dt{color:#b7d8c4}#request-photo-gallery-modal dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
#request-photo-gallery-modal select{width:100%;min-width:0}#request-photo-gallery-modal button:disabled{opacity:.45}
`;

function requestGalleryElement(tag, attributes = {}, text = '') {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.textContent = text;
    return node;
}

function requestGalleryButton(label, action, signal) {
    const button = requestGalleryElement('button', {type:'button', 'aria-label':label}, label);
    button.addEventListener('click', action, {signal});
    return button;
}

function requestGalleryMetadata(row) {
    const list = requestGalleryElement('dl');
    const fields = [['Size',row.size], ['Location',row.location], ['Spec',row.spec],
        ['Loc Match %',row.match], ['AV Note',row.avNote]];
    for (const [label, value] of fields) {
        list.append(requestGalleryElement('dt', {}, label), requestGalleryElement('dd', {}, value || '—'));
    }
    return list;
}

function renderRequestGalleryThumbnails(host, row, index) {
    const nodes = row.photos.map((url, photoIndex) => {
        const button = requestGalleryElement('button', {type:'button', 'data-photo-index':photoIndex,
            'aria-label':'Photo ' + (photoIndex + 1), 'aria-current':String(photoIndex === index)});
        const image = requestGalleryElement('img', {alt:'', loading:'lazy', decoding:'async'});
        image.src = url;
        button.append(image);
        return button;
    });
    host.replaceChildren(...nodes);
}

function bindRequestGalleryGestures(image, commands, signal) {
    let start = null;
    image.addEventListener('pointerdown', event => {
        if (event.isPrimary === false || event.button !== 0) return;
        start = {x:event.clientX, y:event.clientY, id:event.pointerId};
        image.setPointerCapture?.(event.pointerId);
    }, {signal});
    image.addEventListener('pointerup', event => {
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        start = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) commands.step(dx < 0 ? 1 : -1);
    }, {signal});
    for (const type of ['pointercancel','lostpointercapture']) image.addEventListener(type, () => { start = null; }, {signal});
}

function bindRequestGalleryCommands(view, commands, signal) {
    view.dialog.addEventListener('cancel', event => { event.preventDefault(); commands.close(); }, {signal});
    view.dialog.addEventListener('keydown', event => {
        if (event.target.tagName === 'SELECT') return;
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        commands.step(event.key === 'ArrowRight' ? 1 : -1);
    }, {signal});
    view.thumbs.addEventListener('click', event => {
        const button = event.target.closest('[data-photo-index]');
        if (button) commands.photo(Number(button.dataset.photoIndex));
    }, {signal});
    view.select.addEventListener('change', () => commands.row(view.select.value), {signal});
    view.image.addEventListener('error', () => { view.status.textContent = 'Photo unavailable. Choose another photo.'; }, {signal});
    bindRequestGalleryGestures(view.image, commands, signal);
}

function createRequestGalleryLayout(commands, signal) {
    const dialog = requestGalleryElement('dialog', {id:'request-photo-gallery-modal', 'aria-label':'Request photo gallery', 'data-fast-press-ignore':''});
    const style = requestGalleryElement('style', {}, REQUEST_GALLERY_STYLES);
    const header = requestGalleryElement('header');
    const title = requestGalleryElement('h2', {}, 'Request photos');
    header.append(title, requestGalleryButton('Close', commands.close, signal));
    const stage = requestGalleryElement('section', {'data-gallery-stage':''});
    const image = requestGalleryElement('img', {'data-gallery-photo':'', alt:'Request photo', decoding:'async'});
    const previous = requestGalleryButton('‹', () => commands.step(-1), signal);
    const next = requestGalleryButton('›', () => commands.step(1), signal);
    previous.setAttribute('aria-label', 'Previous photo');
    next.setAttribute('aria-label', 'Next photo');
    stage.append(previous, image, next);
    const thumbs = requestGalleryElement('nav', {'data-gallery-thumbs':'', 'aria-label':'Photos'});
    const details = requestGalleryElement('section', {'data-gallery-details':''});
    const select = requestGalleryElement('select', {'aria-label':'Request item'});
    const status = requestGalleryElement('p', {role:'status'}, 'Loading Request photos…');
    const metadata = requestGalleryElement('div');
    details.append(status, select, metadata);
    dialog.append(style, header, stage, thumbs, details);
    return {dialog,title,image,previous,next,thumbs,select,status,metadata};
}

function createRequestPhotoGalleryModal(commands) {
    const trigger = document.activeElement;
    const abort = new AbortController();
    const view = createRequestGalleryLayout(commands, abort.signal);
    bindRequestGalleryCommands(view, commands, abort.signal);
    document.body.append(view.dialog);
    view.dialog.showModal();
    return {
        render: state => renderRequestPhotoGallery(view, state),
        fail: message => {
            view.image.removeAttribute('src');
            view.image.hidden = true;
            view.previous.disabled = view.next.disabled = true;
            view.select.hidden = true;
            view.status.textContent = message;
        },
        close: () => {
            abort.abort();
            view.dialog.close();
            view.dialog.remove();
            if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({preventScroll:true});
        }
    };
}

function renderRequestPhotoGallery(view, state) {
    const {gallery, rowIndex, photoIndex} = state;
    const row = gallery.rows[rowIndex];
    view.title.textContent = row.commonName || 'Request item';
    view.status.textContent = row.photos.length ? (photoIndex + 1) + ' of ' + row.photos.length : 'No published photos';
    view.image.hidden = !row.photos.length;
    view.image.alt = (row.commonName || 'Request item') + ', photo ' + (photoIndex + 1) + ' of ' + row.photos.length;
    if (!row.photos.length) view.image.removeAttribute('src');
    else if (view.image.getAttribute('src') !== row.photos[photoIndex]) view.image.src = row.photos[photoIndex];
    view.previous.disabled = photoIndex <= 0;
    view.next.disabled = photoIndex >= row.photos.length - 1;
    if (view.gallery !== gallery) {
        view.gallery = gallery;
        view.select.replaceChildren(...gallery.rows.map(item => requestGalleryElement('option', {value:item.id}, item.commonName || item.id)));
    }
    view.select.value = row.id;
    view.select.hidden = gallery.rows.length === 1;
    if (view.rowId !== row.id) {
        view.rowId = row.id;
        view.metadata.replaceChildren(requestGalleryMetadata(row));
        renderRequestGalleryThumbnails(view.thumbs, row, photoIndex);
    }
    for (const button of view.thumbs.querySelectorAll('[data-photo-index]')) {
        button.setAttribute('aria-current', String(Number(button.dataset.photoIndex) === photoIndex));
    }
}
