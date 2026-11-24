const consolidationPageSize = 40;
const consolidationLookupSources = {
    'item-cpb': {
        table:'ph_item_cpb',key:'itemcode',
        columns:'itemcode,commonname,contsize,cpb,cpb_source,perm_shade_req,water_attention,updated_at'
    },
    'location-beds': {
        table:'ph_location_beds',key:'locationcode',
        columns:'locationcode,blockalpha,total_beds,reserved_2027_beds,permanent_shade,house_orientation,active,fresh_water,updated_at'
    }
};

function consolidationLookup(key) {
    if (!canViewFieldWorkConsolidation()) throw new Error('Field Work Consolidation access is required.');
    const source = consolidationLookupSources[key];
    if (!source) throw new Error('Unknown consolidation lookup.');
    return source;
}

async function readConsolidationLookup(key, filters, page) {
    const {table,key:identity,columns} = consolidationLookup(key);
    const {client,owner} = await requireBloomscapesSession();
    const start = page * consolidationPageSize;
    let request = client.from(table).select(columns,{count:'exact'}).order(identity).range(start,start+consolidationPageSize-1);
    const query = filters.query.trim().replace(/[",()%_*\\]/g,'').slice(0,120);
    if (query) {
        const secondary = key === 'item-cpb' ? 'commonname' : 'blockalpha';
        request = request.or(identity+'.ilike.*'+query+'*,'+secondary+'.ilike.*'+query+'*');
    }
    if (filters.size) request = request.eq('contsize',filters.size.toUpperCase());
    if (filters.source) request = request.eq('cpb_source',filters.source);
    const result = await request;
    const rows = bloomscapesData(result);
    await requireBloomscapesOwner(owner);
    return {rows,total:result.count};
}

async function writeConsolidationLookup(key, values, expected) {
    const {table,key:identity} = consolidationLookup(key);
    if (borrowedHelpPreview()) throw new Error('View As is read-only.');
    const {client,owner} = await requireBloomscapesSession();
    const receipt = bloomscapesData(await client.rpc('gnc_save_consolidation_lookup', {
        p_table:table,p_insert:!expected,p_values:values,p_expected:expected || null
    }));
    await requireBloomscapesOwner(owner);
    if (receipt?.[identity] !== values[identity] || !receipt.updated_at) throw new Error('The saved row could not be verified.');
    return receipt;
}

async function runConsolidationAccessSettings(type,key,allow = null) {
    if (borrowedHelpPreview()) throw new Error('View As is read-only.');
    const {client,owner} = await requireBloomscapesSession();
    const grant = bloomscapesData(await client.rpc('gnc_consolidation_access_settings',{p_type:type,p_key:key,p_allow:allow}));
    await requireBloomscapesOwner(owner);
    if (!['Y','N'].includes(grant)) throw new Error('The access grant could not be verified.');
    return grant;
}
