const consolidationGridTables = [
    {id:'item-cpb',label:'Item CPB',description:'Cans per bed and item requirements.',section:'editable',nursery:true},
    {id:'location-beds',label:'Location Beds',description:'Block capacity and 2027 planting reservations.',section:'editable',nursery:true}
];

const consolidationGridFields = {
    'item-cpb':[
        ['itemcode','Item Code','key'],['commonname','Common Name','add'],['contsize','Container Size','add'],
        ['cpb','Cans per Bed','positive'],['cpb_source','CPB Source','read'],['perm_shade_req','Permanent Shade Required','yn'],
        ['water_attention','Water Attention','text']
    ],
    'location-beds':[
        ['locationcode','Location Code','location'],['blockalpha','Block','read'],['total_beds','Total Beds','number'],
        ['reserved_2027_beds','Reserved 2027 Beds','number'],['permanent_shade','Permanent Shade','yn'],
        ['house_orientation','House Orientation','text'],['fresh_water','Fresh Water','nullable'],['active','Active','boolean']
    ]
};

function managerTableItemsWithConsolidation(items) {
    return canViewFieldWorkConsolidation() ? [...items,...consolidationGridTables] : items;
}

function consolidationWorkspaceContent(content,key) {
    if (!Object.hasOwn(consolidationGridFields,key)) return content;
    return canViewFieldWorkConsolidation()
        ? `<bloomscapes-consolidation-grid id="manager-table-management-root" data-lookup="${key}"></bloomscapes-consolidation-grid>`
        : '';
}

function managerTableArchiveRoute(key) {
    return {__proto__:null,'historical-requests':'archive-requests','historical-drive-mode':'archive-drive',
        'historical-soc-open-orders':'archive-orders','historical-soc-reserves':'archive-reserves'}[key];
}

function consolidationGridControl([field,label,type],value,adding) {
    if (!adding && ['key','location','add','read'].includes(type)) return esc(String(value ?? ''));
    const attrs = `name="${field}" aria-label="${label}"`;
    if (type === 'boolean') return `<input type="checkbox" ${attrs} ${value !== false ? 'checked' : ''}>`;
    if (type === 'yn') return consolidationGridSelect(attrs,value ?? 'N',[['N','N'],['Y','Y']]);
    if (type === 'nullable') return consolidationGridSelect(attrs,String(value ?? ''),[['','Unknown'],['true','Yes'],['false','No']]);
    if (type === 'number' || type === 'positive') {
        const min = type === 'positive' ? '0.01' : '0';
        const initial = String(value ?? (type === 'positive' ? '' : 0));
        return `<input type="number" ${attrs} step="0.01" min="${min}" max="99999999.99" required value="${esc(initial)}">`;
    }
    const rules = type === 'location' ? 'required pattern="[A-Za-z]+[.][0-9]{2}[.][0-9]{3}" placeholder="A.09.000"'
        : type === 'key' ? 'required' : '';
    return `<input type="text" ${attrs} ${rules} maxlength="120" value="${esc(value ?? '')}">`;
}

function consolidationGridSelect(attrs,value,options) {
    return `<select ${attrs}>${options.map(([key,label]) => `<option value="${key}"${key === value ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderConsolidationToolbar(key,editable) {
    const items = key === 'item-cpb';
    const filters = items ? `<label>Container Size <input name="size" maxlength="30"></label>
        <label>CPB Source ${consolidationGridSelect('name="source"','',[
            ['','All'],['SCHEDULE','Schedule'],['CONTSIZE_DEFAULT','Container Size Default'],['MANUAL','Manual']
        ])}</label>` : '';
    return `<form data-consolidation-filters><label>
        <input aria-label="Search lookup records" type="search" name="query" data-consolidation-query maxlength="120" placeholder="${items ? 'Item code or common name' : 'Location or block'}"></label>
        ${filters}<button type="submit">Search</button>
        ${editable ? `<button type="button" data-consolidation-add>${items ? '+ Add Item CPB' : '+ Add Location'}</button>` : ''}
        </form>`;
}

function renderConsolidationGrid(key,editable) {
    const fields = consolidationGridFields[key];
    const headings = fields.map(([,label]) => `<th scope="col">${label}</th>`).join('');
    const actions = editable ? '<th scope="col">Actions</th>' : '';
    return `<section class="consolidation-grid" data-consolidation-grid="${key}">
        ${renderConsolidationToolbar(key,editable)}
        <div class="consolidation-grid-scroll" tabindex="0" aria-label="Lookup rows"><table>
        <thead><tr>${headings}${actions}</tr></thead><tbody></tbody></table></div>
        <footer><p role="status"></p></footer>
        <dialog aria-label="Add lookup row"></dialog></section>`;
}

function renderConsolidationGridRow(key,row,index,editable) {
    const cells = consolidationGridFields[key].map(field => {
        const value = row[field[0]];
        const content = editable ? consolidationGridControl(field,value,false) : esc(String(value ?? ''));
        return `<td>${content}</td>`;
    }).join('');
    const action = editable ? '<td><button type="button" data-consolidation-save>Save</button></td>' : '';
    return `<tr data-consolidation-row="${index}">${cells}${action}</tr>`;
}

function renderConsolidationAddForm(key) {
    const label = consolidationGridTables.find(table => table.id === key).label;
    const fields = consolidationGridFields[key].filter(([, ,type]) => type !== 'read');
    return `<form data-consolidation-insert><h3>Add ${label}</h3>
        ${fields.map(field => `<label>${field[1]} ${consolidationGridControl(field,null,true)}</label>`).join('')}
        <p role="status"></p><button type="button" data-consolidation-cancel>Cancel</button>
        <button type="submit">Save</button></form>`;
}
