const ERP_TEST_BUILD_ROOT = '14e9rccxkU8Co4Q4CibyMgCRm3RVqLeid';
const ERP_SELECTION_STORAGE_KEY = 'bloomscapes_erp_sync_selected_targets_v1';
const ERP_FARM_CODES = {PH:'10-PH', HL:'60-HL', TX:'20-TX', NC:'40-NC'};

function erpTarget(key, farm, group, folderPath, suffix, defaultChecked, dropLabel) {
    const label = folderPath.split('/').at(-1);
    const core = ['assigned_items','master_database'].includes(suffix);
    const processed = key==='PH_DRIVE_AROUND' ? 'Drive Around' : key==='PH_SOC_OPEN' ? 'Open Orders' : dropLabel;
    return Object.freeze({key, label, shortLabel:dropLabel, group, farm:ERP_FARM_CODES[farm], folderPath,
        pendingFolder:'Pending '+dropLabel, processedFolder:'Processed '+processed,
        tableName:'gnc_'+(core ? '00_core' : ERP_FARM_CODES[farm].replace('-','_').toLowerCase())+'_'+suffix,
        defaultChecked});
}

function buildErpSyncTargets() {
    const targets = Object.keys(ERP_FARM_CODES).map(farm=>erpTarget(farm+'_DRIVE_AROUND',farm,
        'DRIVE_AROUND','Drive Around/'+farm+' Drive Around','drive_around',true,farm+' Drive Around'));
    for (const [group,path,suffix,label] of [['SOC_RESERVES','SOC Reserves','soc_reserves','Reserves'],
        ['SOC_OPEN','SOC Open Orders','soc_open_orders','Open Orders']]) {
        targets.push(...['PH','TX','NC'].map(farm=>erpTarget(farm+'_'+group,farm,group,
            path+'/'+farm+' '+label,suffix,true,farm+' '+label)));
    }
    targets.push(...['HL','NC','TX'].map(farm=>erpTarget('PH_'+farm+'_PO','PH','PO_REPORTS',
        'P.O Reports/10 Pur Order Intercompany-'+farm,farm.toLowerCase()+'_po',true,farm+' PO')));
    targets.push(erpTarget('PH_TRANS_KEYED','PH','ON_DEMAND','Transactions Key/PH Transactions Key','trans_keyed',false,'PH Transactions Key'));
    targets.push(erpTarget('PH_PRE_POST_PO','PH','ON_DEMAND','P.O Reports/10 Purchase Order Pre-Post','pre_post_po',false,'Pre-Post PO'));
    for (const label of ['Shipped & Cycle','PTR Out of Balance','Production Schedule','Assigned Items',
        'Master Database','Over Wintering','Drape Varieties','Spring Spreading','Short Pit']) {
        const suffix = label.toLowerCase().replace(' & ','_').replaceAll(' ','_');
        targets.push(erpTarget('AUX_'+suffix.toUpperCase(),'PH','ON_DEMAND',label,suffix,false,label));
    }
    return Object.freeze(targets);
}

const ERP_SYNC_TARGETS = buildErpSyncTargets();
const DEFAULT_CORE_SYNC_KEYS = Object.freeze(ERP_SYNC_TARGETS.filter(target=>target.defaultChecked).map(target=>target.key));

function selectErpSyncTargets(keys = DEFAULT_CORE_SYNC_KEYS) {
    if (!Array.isArray(keys) || keys.some(key=>!ERP_SYNC_TARGETS.some(target=>target.key===key))) {
        throw new Error('Unknown ERP target selection.');
    }
    return ERP_SYNC_TARGETS.filter(target=>keys.includes(target.key));
}

function getErpSyncTarget(key) {
    return selectErpSyncTargets([key])[0];
}

function getErpSyncTargetsForFarm(farm) {
    if (!Object.values(ERP_FARM_CODES).includes(farm)) throw new Error('Unknown ERP farm.');
    return ERP_SYNC_TARGETS.filter(target=>target.farm===farm || target.farm==='ALL');
}

function readSelectedErpSyncKeys(storage) {
    const stored = storage.getItem(ERP_SELECTION_STORAGE_KEY);
    const keys = stored===null ? DEFAULT_CORE_SYNC_KEYS : JSON.parse(stored);
    const migrated = Array.isArray(keys) ? keys.map(key=>key==='AUX_DROP_VARIETIES' ? 'AUX_DRAPE_VARIETIES' : key) : keys;
    return selectErpSyncTargets(migrated).map(target=>target.key);
}

function writeSelectedErpSyncKeys(storage, keys) {
    const selected = selectErpSyncTargets(keys).map(target=>target.key);
    storage.setItem(ERP_SELECTION_STORAGE_KEY,JSON.stringify(selected));
    return selected;
}
