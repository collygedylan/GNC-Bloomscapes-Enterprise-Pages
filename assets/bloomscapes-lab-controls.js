function mountBloomscapesLabControls(host,tab) {
    if (tab !== 'bloomscapes-lab') return;
    const section = document.createElement('section');
    section.innerHTML = '<h3>Photo matching &amp; Lab Review</h3><p>Image similarity suggests archive references for review. A lab report confirms the result.</p>'
        + '<form data-lab-scan><label>Sample ID <input name="sample" pattern="GNC-LAB-[0-9]{2}-[0-9]{4}" required></label>'
        + '<label>Farm <select name="farm"><option>10-PH</option><option>60-HL</option></select></label>'
        + '<label>Field photo <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label><button>Scan photo</button></form>'
        + '<form data-lab-report><label>Sample ID <input name="sample" pattern="GNC-LAB-[0-9]{2}-[0-9]{4}" required></label>'
        + '<label>Returned lab PDF <input name="file" type="file" accept="application/pdf" required></label>'
        + '<label>Lab-confirmed result <input name="pathogen" maxlength="300" required></label><button>File returned report</button></form>'
        + '<p role="status"></p><div data-lab-matches></div>';
    host.appendChild(section);
    bindBloomscapesLabForm(section,section.querySelector('[data-lab-scan]'),'scan');
    bindBloomscapesLabForm(section,section.querySelector('[data-lab-report]'),'report');
    mountBloomscapesLabArchive(section);
}

function mountBloomscapesLabArchive(section) {
    const archive = document.createElement('section');
    archive.innerHTML = '<h3>Lab report archive</h3><form><label>Genus, report or result <input name="query" maxlength="200"></label>'
        + '<button>Search archive</button></form><p role="status"></p><ul></ul><div data-lab-archive-edge></div>';
    section.appendChild(archive);
    const state = {archive,offset:0,generation:0};
    archive.querySelector('form').addEventListener('submit',event => {
        event.preventDefault();
        state.offset = 0;
        void readLabArchiveChunk(state);
    });
    void readLabArchiveChunk(state);
}

async function readLabArchiveChunk(state) {
    const {archive,offset} = state;
    const generation = ++state.generation;
    state.observer?.disconnect();
    const status = archive.querySelector('[role="status"]');
    status.textContent = 'Searching…';
    try {
        const rows = await searchBloomscapesLabArchive(archive.querySelector('input').value,offset);
        if (!archive.isConnected || generation !== state.generation) return;
        renderBloomscapesLabArchive(archive,rows,offset);
        const total = Number(rows[0]?.total_count || 0);
        if (rows.length && offset+rows.length < total) observeLabArchiveChunk(state,offset+rows.length);
    } catch (error) {
        if (generation === state.generation) status.textContent = error.message;
    }
}

function observeLabArchiveChunk(state,next) {
    if (typeof IntersectionObserver !== 'function') return;
    const edge = state.archive.querySelector('[data-lab-archive-edge]');
    state.observer = observeBloomscapesPageEdge(edge,() => {
        state.offset = next;
        void readLabArchiveChunk(state);
    });
}

function labArchiveListEntry(row) {
    const item = document.createElement('li');
    const entry = document.createElement(row.url ? 'a' : 'span');
    entry.textContent = [row.genus_name,row.report_title || row.source_key,row.lab_confirmed_pathogen].filter(Boolean).join(' · ');
    if (row.url) { entry.href = row.url; entry.target = '_blank'; entry.rel = 'noopener noreferrer'; }
    item.append(entry);
    return item;
}

function renderBloomscapesLabArchive(archive,rows,offset) {
    const list = archive.querySelector('ul');
    if (offset === 0) list.replaceChildren();
    list.append(...rows.map(labArchiveListEntry));
    const total = Number(rows[0]?.total_count || 0);
    archive.querySelector('[role="status"]').textContent = total+' indexed files · '+list.children.length+' shown';
}

function bindBloomscapesLabForm(section,form,kind) {
    form.addEventListener('submit',async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        if (button.disabled) return;
        button.disabled = true;
        const status = section.querySelector('[role="status"]');
        const progress = message => { if (status.isConnected) status.textContent = message; };
        try {
            const input = Object.fromEntries(new FormData(form));
            if (kind === 'scan') renderBloomscapesLabMatches(section,await scanBloomscapesLabPhoto(input,progress));
            else {
                const receipt = await uploadBloomscapesLabReport(input);
                progress(receipt.sample_id+' · Report stored · Drive filing '+receipt.archive_status+' · '+receipt.archive_path);
            }
        } catch (error) { progress(error.message); }
        finally { button.disabled = false; }
    });
}

function renderBloomscapesLabMatches(section,result) {
    if (!section.isConnected) return;
    section.querySelector('[role="status"]').textContent = result.sample+' · Scan saved for lab review';
    const host = section.querySelector('[data-lab-matches]');
    host.replaceChildren();
    for (const match of result.matches) {
        const entry = document.createElement('p');
        entry.textContent = [match.genus_name,match.report_title,'Similarity '+match.similarity.toFixed(3),
            match.lab_confirmed_pathogen || 'No confirmed result on this reference'].filter(Boolean).join(' · ');
        host.appendChild(entry);
    }
}
