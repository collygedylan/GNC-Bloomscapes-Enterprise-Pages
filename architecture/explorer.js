function appendSchemaNode(parent, element, value) {
    const node = document.createElement(element);
    node.textContent = value;
    parent.append(node);
    return node;
}

function renderSchemaRelation(host, relation) {
    const details = appendSchemaNode(host, 'details', '');
    const kind = relation.relkind === 'r' ? 'Table' : 'View';
    appendSchemaNode(details, 'summary', kind + ' · ' + relation.relname);
    const triggers = Array.isArray(relation.triggers) ? relation.triggers.join(', ') : String(relation.triggers || '').replace(/^\{|\}$/g,'');
    if (triggers) appendSchemaNode(details, 'p', 'Triggers ' + triggers);
    const table = appendSchemaNode(details, 'table', '');
    const header = appendSchemaNode(table, 'tr', '');
    appendSchemaNode(header, 'th', 'Column');
    appendSchemaNode(header, 'th', 'Postgres type');
    for (const [name, type] of relation.columns) {
        const row = appendSchemaNode(table, 'tr', '');
        appendSchemaNode(row, 'td', name);
        appendSchemaNode(row, 'td', type);
    }
}

function mountSchemaExplorer(catalog) {
    const filter = document.getElementById('relation-filter');
    const status = document.getElementById('schema-status');
    const host = document.getElementById('schema-relations');
    const entries = catalog.map(relation => ({
        relation, searchable: (relation.relname + ' ' + relation.columns.flat().join(' ')).toLowerCase()
    }));
    const render = () => {
        const query = filter.value.trim().toLowerCase();
        const matches = entries.filter(entry => entry.searchable.includes(query));
        host.replaceChildren();
        for (const entry of matches) renderSchemaRelation(host, entry.relation);
        status.textContent = matches.length + ' of ' + entries.length + ' relations';
    };
    filter.addEventListener('input', render);
    render();
}

mountSchemaExplorer(globalThis.bloomscapesSchemaCatalog);
