/** @param {string} [search] Inventory search terms. @param {object} [filters] Exact identity fields. @returns {object[]} Visible source rows. */
function bloomscapesWorkBrowserRows(search='',filters={}) {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const source = bloomscapesWorkBrowserDataset();
    const rows = typeof rowsInBloomscapesPersonalScope === 'function'
        ? rowsInBloomscapesPersonalScope(source.rows) : source.rows;
    if (!terms.length && !Object.values(filters).some(Boolean)) return rows;
    return rows.filter(row=>{
        const values = bloomscapesWorkBrowserIdentity(row);
        return Object.entries(filters).every(([key,value])=>!value || values[key]===value)
            && terms.every(term=>Object.values(values).join(' ').toLowerCase().includes(term));
    });
}

/** @param {object} row Inventory source row. @returns {object} Fields for filtering and grouping. */
function bloomscapesWorkBrowserIdentity(row) {
    return {common:row.COMMONNAME || row.commonname || '',size:row.CONTSIZE || row.contsize || '',
        season:row.SEASON || row.season || '',location:row.LOCATIONCODE || row.locationcode || '',
        item:row.ITEMCODE || row.itemcode || '',lot:row.LOTCODE || row.lotcode || '',
        year:String(row.SALEYEAR || row.saleyear || ''),hold:String(row.HOLDSTOPCODE || row.holdstopcode || 'None')};
}

/** @param {object} row Physical inventory row. @param {Function} onSelect Choice handler. @param {object} [options] Browse-only mode. @returns {HTMLElement} Source card. */
function bloomscapesWorkSourceCard(row,onSelect,options={}) {
    const card=document.createElement('article');
    if (options.browseOnly) {
        card.innerHTML=generateCard(row,'drive','status-green',{originView:getCurrentVisibleViewId()});
        return card;
    }
    card.innerHTML=bloomscapesWorkIdentityMarkup(row,{summary:true});
    const button=card.appendChild(document.createElement('button'));
    button.type='button';button.dataset.workSourceRow=String(row.UNIQUE_ID || row.unique_id);
    button.textContent='Select this physical row';
    button.addEventListener('click',()=>onSelect(row));
    card.addEventListener('click',event=>{
        if (!event.target.closest('button,a,input,select,textarea,form,[data-work-row-editor]')) onSelect(row);
    });
    appendBloomscapesStudioRowActions(card,row,onSelect);
    return card;
}

/** @param {HTMLElement} card Source card. @param {object} row Physical inventory row. @param {Function} onSelect Studio action handler. @returns {void} */
function appendBloomscapesStudioRowActions(card,row,onSelect) {
    const controls=card.appendChild(document.createElement('div'));controls.dataset.workRowActions='true';
    for (const [action,title] of [['Bunch & Tie','🌿 Bunch'],['Shift Grading','📏 Grade (Shift Grading)'],
        ['Consolidate','🔗 Consolidate'],['Haul','🚜 Haul'],['Bunch Count','🔢 Count / Poly / Spread']]) {
        const button=controls.appendChild(document.createElement('button'));button.type='button';button.dataset.workRowAction=action;
        button.textContent=title;button.addEventListener('click',()=>onSelect(row,'SINGLE_ROW',action));
    }
}

/** @param {object} source Current physical row. @returns {object[]} Same-item destinations eligible for the sales year. */
function bloomscapesConsolidationCandidates(source) {
    const setting=typeof getCurrentAppSeasonSettings==='function'?getCurrentAppSeasonSettings().salesYear:null;
    const year=bloomscapesStudioSaleYear(setting);
    const sourceYear=bloomscapesStudioSaleYear(source.SALEYEAR ?? source.saleyear);
    if (year===null || sourceYear===null || sourceYear>year) return [];
    const item=source.ITEMCODE || source.itemcode,location=source.LOCATIONCODE || source.locationcode;
    return bloomscapesWorkBrowserRows().map(row=>resolveCanonicalInventoryRow(row)).filter(row=>{
        const candidateYear=bloomscapesStudioSaleYear(row.SALEYEAR ?? row.saleyear);
        return (row.ITEMCODE || row.itemcode)===item && (row.LOCATIONCODE || row.locationcode)!==location
            && candidateYear!==null && candidateYear<=year;
    }).sort((a,b)=>String(a.LOCATIONCODE || a.locationcode).localeCompare(String(b.LOCATIONCODE || b.locationcode),undefined,{numeric:true}));
}

function bloomscapesStudioSaleYear(value) {
    const text=String(value ?? '').trim();
    if (!/^(?:20)?[0-9]{2}$/.test(text)) return null;
    return Number(text.length===2?'20'+text:text);
}

/** @param {object} row Destination row. @returns {string} Physical location, lot, quantities and capacity label. */
function bloomscapesConsolidationDestinationLabel(row) {
    const value=key=>String(row[key] ?? row[key.toLowerCase()] ?? 'Not recorded');
    const beds=row.OPENBEDS ?? row.open_beds ?? 'Not recorded';
    const space=row.CANSPACE ?? row.can_space ?? 'Not recorded';
    return 'LOCATIONCODE '+value('LOCATIONCODE')+' · LOTCODE '+value('LOTCODE')+' · PTRAVAILABLE '+value('PTRAVAILABLE')
        +' · PTRREVIEW '+value('PTRREVIEW')+' · PTRONHAND '+value('PTRONHAND')+' · Open Beds / Can Space '+beds+' beds / '+space+' cans';
}

function bloomscapesWorkBrowserDataset() {
    const owner = getSupabaseReadIdentityScope();
    const farm = getBloomscapesFarm();
    const epoch = typeof resolvedViewStateEpoch === 'number' ? resolvedViewStateEpoch : 0;
    const prior = bloomscapesWorkBrowserDataset.cached;
    if (prior?.source===fullInventory && prior.owner===owner && prior.farm===farm && prior.epoch===epoch) return prior;
    const rows = (fullInventory || []).filter(bloomscapesFarmRowIsVisible);
    return bloomscapesWorkBrowserDataset.cached = {source:fullInventory,owner,farm,epoch,rows,options:new Map()};
}

/** @param {string} key Inventory identity field. @returns {string[]} Distinct visible values. */
function bloomscapesWorkBrowserFilterOptions(key) {
    const dataset=bloomscapesWorkBrowserDataset();
    if (!dataset.options.has(key)) {
        const values=new Set();
        for (const row of dataset.rows) {
            const value=bloomscapesWorkBrowserIdentity(row)[key];
            if (value) values.add(value);
        }
        dataset.options.set(key,[...values].sort());
    }
    return dataset.options.get(key);
}

/** @param {string} [value] Block alpha key. @returns {string} Display label including the missing-block fallback. */
function getDriveBlockAlphaLabel(value = '') {
    return String(value || '') === DRIVE_NO_BLOCK_ALPHA ? 'No Block Alpha' : String(value || '').trim();
}

/** @param {string} [value] Block number key. @returns {string} Display label including the missing-block fallback. */
function getDriveBlockNumberLabel(value = '') {
    return String(value || '') === DRIVE_NO_BLOCK_NUMBER ? 'No Block Number' : String(value || '').trim();
}


/** @param {object|null} row Inventory row. @param {string[]} fields Ordered quantity fields. @returns {number|null} Recorded quantity or unknown. */
function bloomscapesGrowerQuantity(row,fields) {
    const raw = firstNonEmptyValue(...fields.map((field) => row && row[field]), null);
    if (raw === null || String(raw).trim() === '') return null;
    const parsed = Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function sumBloomscapesGrowerQuantity(values) {
    return values.some((value) => value === null)
    ? 'Unknown'
    : formatShearDecisionNumber(values.reduce((total, value) => total + value, 0));
}

/** @param {object} group Inventory rows grouped by item. @returns {string} Item summary and current drill markup. */
function renderBloomscapesGrowerInventoryGroup(group) {
    const expanded = growerScoutExpandedItem === group.key;
    const availableText = sumBloomscapesGrowerQuantity(group.rows.map((row) => bloomscapesGrowerQuantity(row, ['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable'])));
    const onHandText = sumBloomscapesGrowerQuantity(group.rows.map((row) => bloomscapesGrowerQuantity(row, ['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand'])));
    const photoRow = group.rows.find((row) => getPhotoUrlList(getRowPhotoLink(row, 'drive')).length > 0);
    const photoUrl = photoRow ? getPhotoUrlList(getRowPhotoLink(photoRow, 'drive'))[0] : '';
    const photoHtml = photoUrl
        ? buildDeferredCardPhotoImg(getDirectImageUrl(photoUrl, 'card-corner'), { className: 'grower-item-photo', alt: `${group.commonName} inventory photo` })
        : '<span class="grower-item-photo-placeholder" aria-hidden="true"><i class="ph-bold ph-image"></i></span>';
    const locations = new Map();
    group.rows.forEach((row) => {
        const name = String(firstNonEmptyValue(row.LOCATIONCODE, row.locationcode, 'No location'));
        if (!locations.has(name)) locations.set(name, []);
        locations.get(name).push(row);
    });
    const locationHtml = Array.from(locations.entries()).map(([name, locationRows]) => `<section class="grower-location-group"><div class="grower-location-total"><strong>Loc ${escapeHtml(name)}</strong><span>Avail ${escapeHtml(sumBloomscapesGrowerQuantity(locationRows.map((row) => bloomscapesGrowerQuantity(row, ['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable']))))} · OH ${escapeHtml(sumBloomscapesGrowerQuantity(locationRows.map((row) => bloomscapesGrowerQuantity(row, ['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand']))))}</span></div>${locationRows.map(renderGrowerInventoryRow).join('')}</section>`).join('');
    return `<article class="grower-inventory-item" data-grower-item-key="${escapeHtml(group.key)}"><button type="button" class="grower-item-toggle" aria-expanded="${expanded}" onclick="return toggleGrowerScoutItem('${escJsAttrValue(encodeURIComponent(group.key))}')">${photoHtml}<span><strong>${escapeHtml(group.commonName)}</strong><small>${escapeHtml(group.contSize)} · ${escapeHtml(group.itemCode)} · ${group.locations.size} locations · ${group.rows.length} rows</small></span><span class="grower-quantity-total">Avail ${escapeHtml(availableText)}<br>OH ${escapeHtml(onHandText)}</span></button>${expanded ? `<div class="grower-location-list">${locationHtml}</div>` : ''}</article>`;
}


function renderGrowerInventoryRow(row = null) {
    const uid = getShearDriveRowUid(row);
    const encoded = escJsAttrValue(encodeURIComponent(uid));
    const expanded = growerScoutExpandedRow === uid;
    const draft = growerScoutRowDrafts.get(uid) || { pestCode: '', sev: '', notes: '' };
    const location = String(firstNonEmptyValue(row.LOCATIONCODE, row.locationcode, '-'));
    const lot = String(firstNonEmptyValue(row.LOTCODE, row.lotcode, '-'));
    const available = bloomscapesGrowerQuantity(row,['PTRAVAILABLE', 'ptravailable', 'PRTAVAILABLE', 'prtavailable']);
    const hand = bloomscapesGrowerQuantity(row,['PTRONHAND', 'ptronhand', 'PTR_ON_HAND', 'ptr_on_hand']);
    const availableText = available === null ? 'Unknown' : formatShearDecisionNumber(available);
    const handText = hand === null ? 'Unknown' : formatShearDecisionNumber(hand);
    return `<section class="grower-inventory-row" data-grower-row-uid="${escapeHtml(uid)}"><button type="button" class="grower-row-toggle" aria-expanded="${expanded}" onclick="return toggleGrowerScoutRow('${encoded}')"><span>Loc ${escapeHtml(location)} · Lot ${escapeHtml(lot)}</span><strong>Avail ${escapeHtml(availableText)} · OH ${escapeHtml(handText)}</strong></button>${expanded ? `<div class="grower-row-details"><div class="grower-scout-input-grid"><label>Pest Code / ID<input data-grower-draft-field="pestCode" value="${escapeHtml(draft.pestCode)}" maxlength="80" oninput="return updateGrowerScoutDraft(this)"></label><label>Sev (0–50)<input type="number" min="0" max="50" step="1" inputmode="numeric" data-grower-draft-field="sev" value="${escapeHtml(draft.sev)}" oninput="return updateGrowerScoutDraft(this)"></label></div><label class="grower-scout-notes">Notes<textarea data-grower-draft-field="notes" rows="2" oninput="return updateGrowerScoutDraft(this)">${escapeHtml(draft.notes)}</textarea></label><button type="button" class="grower-scout-save" onclick="return saveGrowerScoutRowLog('${encoded}', this)">Save scouting log</button></div>` : ''}</section>`;
}

/** @param {object} row Inventory source row. @returns {[string,string]} The block alpha and normalized block labels. */
function bloomscapesWorkLocationParts(row) {
    const location=LocationCode.normalize(row.LOCATIONCODE || row.locationcode);
    const block=LocationCode.base(location);
    const alpha=block.includes('.') ? block.split('.')[0] : getDriveBlockAlphaLabel(getDriveBlockAlphaValue(row));
    return [alpha,block || 'No location'];
}

/** @param {object} row Inventory source row. @param {string} mode Current browse grouping. @returns {string[]} Ordered drill labels. */
function bloomscapesWorkBrowseParts(row,mode) {
    const identity=bloomscapesWorkBrowserIdentity(row);
    if (mode!=='block') return [identity.common,identity.size,identity.lot || identity.season];
    const [alpha,base]=bloomscapesWorkLocationParts(row);
    const number=base.startsWith(alpha+'.') ? base.slice(alpha.length+1) : base;
    return [alpha,number,identity.location];
}
