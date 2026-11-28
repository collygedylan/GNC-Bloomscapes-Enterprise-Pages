/**
 * @param {string} fileName
 * @param {string} modifiedTime
 * @returns {string} Sortable file timestamp from its name or Drive metadata.
 */
function dashboardFilenameTimestamp(fileName = '', modifiedTime = '') {
  const match = String(fileName || '').match(/(\d{6})(20\d{6})(\d{6})/);
  if (match) return match[2] + match[1];
  const legacy = String(fileName || '').match(/(?:19|20)\d{12}/g);
  if (legacy?.length) return legacy[legacy.length - 1];
  const fallback = Date.parse(modifiedTime);
  return Number.isFinite(fallback) ? new Date(fallback).toISOString().replace(/\D/g, '').slice(0,14) : '';
}

const ERP_DROP_FOLDERS_ROOT = '18JVGiQDQwBNHDHxbliH92Noa1DZGS10r';
const ERP_PENDING_FOLDER_IDS = Object.freeze({
    "PH_DRIVE_AROUND": "1hpTjQsfWGSmDv_VWQssjbTOOxSXjMREc",
    "HL_DRIVE_AROUND": "1GgHAy9VK22uLogHNO8Pl6DreelkcKsjX",
    "TX_DRIVE_AROUND": "1-Dw9ma1xBrYODrlkwvQDFEQr9jRpZkNE",
    "NC_DRIVE_AROUND": "1yEI2Il3v7vhqi6r50K8J3EMZa51eIE3m",
    "PH_SOC_RESERVES": "1u8fpBackNXtCNeYgO2Zp42iOVPwqhChv",
    "TX_SOC_RESERVES": "18733tW_xDL9wQQhPraeolZPn1AmMCInp",
    "NC_SOC_RESERVES": "1dEk3xC7cP4feO6UDPHBdYpWwF3yr0Lvg",
    "PH_SOC_OPEN": "1JDK2URVkeiSA9VTpgky-wMqbqoTj3RIq",
    "TX_SOC_OPEN": "1WQNbmRIbfj7sUglMFhgBfzu5cBR6okya",
    "NC_SOC_OPEN": "1N5JRxuX6PdpmF_Mw9_Qsx2WmVv3jCMNY",
    "PH_HL_PO": "1mWk3YQLwyWB-Tr4EPmtdrM3unPQkedtK",
    "PH_NC_PO": "1s0wSrV8LjdbXda6sJDab9P5j6f79nXhJ",
    "PH_TX_PO": "1oR4eU3jC9wjSphkMuX38gYQAcfl--5kM",
    "PH_CAV": "1-CuAa3SmYTb_J_ppdmLH09sgOl0me8ff",
    "PH_TRANS_KEYED": "1dm2DpnNVG7qtE9aBe4LRc13ctL0qV_94",
    "PH_PRE_POST_PO": "1OuIVsrHNGgDjHBBEn-Taz0L7li3dXHi_",
    "AUX_SHIPPED_CYCLE": "18jkkqZTcuJcmoDp90pn_OmA8cvuhsPrf",
    "AUX_PTR_OUT_OF_BALANCE": "1hnZlXCnDiAf6EzYmdwKoO2RVpjVGuqE1",
    "AUX_PRODUCTION_SCHEDULE": "1qK-rO1yzqj5QPwsk_ppTBZMC_d31ivUF",
    "AUX_ASSIGNED_ITEMS": "192o27aXYpYTR5Zkk8mvJakeocS63MkQx",
    "AUX_MASTER_DATABASE": "1BOfTKegAHRJnRHr0OUm5M_bphH4ZmC1r",
    "AUX_OVER_WINTERING": "1oEwOgzAPddXDiLEjJb-TAuqw9w_532S1",
    "AUX_DRAPE_VARIETIES": "1uM-WjfNWTJjUf-DM4E-c45DqTf57HS8C",
    "AUX_SPRING_SPREADING": "1-16la9Nbfaluq-cui_w1g9Tf8lkwBhkg",
    "AUX_SHORT_PIT": "1dElg_vrC3xA6Rdi8gOsJ7l80o0aVcgUM"
});

const ERP_TEST_BUILD_ROOT = '14e9rccxkU8Co4Q4CibyMgCRm3RVqLeid';
const ERP_SELECTION_STORAGE_KEY = 'bloomscapes_erp_sync_selected_targets_v1';
const ERP_FARM_CODES = {PH:'10-PH', HL:'60-HL', TX:'20-TX', NC:'40-NC'};

function erpTarget(key, farm, group, folderPath, suffix, defaultChecked, dropLabel) {
    const label = folderPath.split('/').at(-1);
    const core = ['assigned_items','master_database'].includes(suffix);
    const processed = key==='PH_DRIVE_AROUND' ? 'Drive Around' : key==='PH_SOC_OPEN' ? 'Open Orders' : dropLabel;
    return Object.freeze({key, label, shortLabel:dropLabel, group, farm:ERP_FARM_CODES[farm], archiveFolderPath:folderPath,
        folderPath:'Drop Folders / Pending '+dropLabel, dropRootId:ERP_DROP_FOLDERS_ROOT,
        pendingFolderId:ERP_PENDING_FOLDER_IDS[key],
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
const ERP_CLOUD_SYNC_TARGETS = Object.freeze([
    ...ERP_SYNC_TARGETS,
    erpTarget('PH_CAV','PH','CAV','CAV','cav_snapshot',false,'CAV')
]);
const DEFAULT_CORE_SYNC_KEYS = Object.freeze(ERP_SYNC_TARGETS.filter(target=>target.defaultChecked).map(target=>target.key));

function selectErpSyncTargets(keys = DEFAULT_CORE_SYNC_KEYS) {
    if (!Array.isArray(keys) || keys.some(key=>!ERP_CLOUD_SYNC_TARGETS.some(target=>target.key===key))) {
        throw new Error('Unknown ERP target selection.');
    }
    return ERP_CLOUD_SYNC_TARGETS.filter(target=>keys.includes(target.key));
}

function getErpSyncTarget(key) {
    return selectErpSyncTargets([key])[0];
}

function getErpSyncTargetsForFarm(farm) {
    if (!Object.values(ERP_FARM_CODES).includes(farm)) throw new Error('Unknown ERP farm.');
    return ERP_CLOUD_SYNC_TARGETS.filter(target=>target.farm===farm || target.farm==='ALL');
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
