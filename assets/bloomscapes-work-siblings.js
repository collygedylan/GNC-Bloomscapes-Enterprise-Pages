function bloomscapesWorkSiblingRows(source) {
    const field=(row,key)=>String(row[key] ?? row[key.toLowerCase()] ?? '');
    return bloomscapesWorkBrowserRows().filter(row=>field(row,'ITEMCODE')===field(source,'ITEMCODE')
        && field(row,'LOCATIONCODE')===field(source,'LOCATIONCODE')).map(row=>resolveCanonicalInventoryRow(row));
}

function bloomscapesWorkSiblingTable(rows,checked=false) {
    const columns=['LOCATIONCODE','LOTCODE','PTRAVAILABLE','PTRREVIEW','PTRONHAND'];
    return '<div class="bloomscapes-sibling-scroll"><table data-sibling-table><thead><tr>'
        +(checked?'<th>Select</th>':'')+columns.map(key=>'<th>'+key+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(row=>'<tr data-sibling-row="'+esc(String(row.UNIQUE_ID || row.unique_id))+'">'
            +(checked?'<td><input type="checkbox" checked name="siblingRow" value="'+esc(String(row.UNIQUE_ID || row.unique_id))+'" aria-label="Select '+esc(String(row.LOTCODE || row.lotcode))+'"></td>':'')
            +columns.map(key=>'<td>'+esc(String(row[key] ?? row[key.toLowerCase()] ?? 'Not recorded'))+'</td>').join('')+'</tr>').join('')
        +'</tbody></table></div>';
}

function bloomscapesWorkSiblingMarkup(source) {
    const rows=bloomscapesWorkSiblingRows(source);
    if (rows.length<2) return '';
    return '<aside data-work-siblings><strong>🔀 '+rows.length+' Rows for '+esc(String(source.ITEMCODE || source.itemcode))
        +' @ '+esc(String(source.LOCATIONCODE || source.locationcode))+'</strong>'+bloomscapesWorkSiblingTable(rows)+'</aside>';
}

function confirmBloomscapesWorkRowScope(source,input) {
    const rows=bloomscapesWorkSiblingRows(source);
    if (rows.length<2 || ['BLOCK','LOCATION','ITEM_FARM','ITEM_LOT'].includes(input.scope)) return Promise.resolve(null);
    const item=String(source.ITEMCODE || source.itemcode),location=String(source.LOCATIONCODE || source.locationcode);
    const id=String(source.UNIQUE_ID || source.unique_id);
    const total=rows.reduce((sum,row)=>sum+Number(row.PTRONHAND ?? row.ptronhand ?? 0),0);
    const dialog=document.createElement('dialog');
    dialog.className='bloomscapes-work-scope';
    dialog.setAttribute('aria-labelledby','bloomscapes-scope-title');
    dialog.innerHTML='<h2 id="bloomscapes-scope-title">Multiple Rows Found for '+esc(item)+' ('+esc(String(source.COMMONNAME || source.commonname))
        +') at '+esc(location)+'</h2><p>Would you like to apply this '+esc(input.actionType)+' to ALL '+rows.length+' rows of '
        +esc(item)+' at '+esc(location)+', or ONLY the row you just worked on?</p>'+bloomscapesWorkSiblingTable(rows,true)
        +'<button type="button" data-sibling-choice="all">✅ Select ALL '+rows.length+' Rows for '+esc(item)+' @ '+esc(location)+' (Total On Hand: '+total+')</button>'
        +'<button type="button" data-sibling-choice="one">🎯 Just the 1 Row I Worked On ('+esc(String(source.LOTCODE || source.lotcode))+' · On Hand: '+esc(String(source.PTRONHAND ?? source.ptronhand))+')</button>'
        +'<button type="button" data-sibling-choice="checked">Queue checked rows</button><button type="button" data-sibling-choice="cancel">Cancel</button><p role="status"></p>';
    document.body.appendChild(dialog);
    return new Promise(resolve=>bindBloomscapesWorkScopeDialog(dialog,rows,id,resolve));
}

function bindBloomscapesWorkScopeDialog(dialog,rows,id,resolve) {
    dialog.addEventListener('close',()=>{dialog.remove();resolve(dialog.scopeSelection || []);},{once:true});
    dialog.addEventListener('click',event=>applyBloomscapesWorkScopeChoice(dialog,rows,id,event));
    dialog.showModal();
}

function applyBloomscapesWorkScopeChoice(dialog,rows,id,event) {
    const choice=event.target.closest('[data-sibling-choice]')?.dataset.siblingChoice;
    if (!choice) return;
    const checked=[...dialog.querySelectorAll('[name=siblingRow]:checked')].map(field=>field.value);
    const ids=choice==='one'?[id]:choice==='all'?rows.map(row=>String(row.UNIQUE_ID || row.unique_id)):checked;
    if (choice==='checked' && !ids.length) {dialog.querySelector('[role=status]').textContent='Select at least one row.';return;}
    dialog.scopeSelection=choice==='cancel'?[]:ids;
    dialog.close();
}
