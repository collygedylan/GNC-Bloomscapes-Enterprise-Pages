'use strict';

const snapshotCacheLibrary = new URL('bounded-snapshot-cache.js',self.location.href);
snapshotCacheLibrary.search = self.location.search;
importScripts(snapshotCacheLibrary.href);

const FARM_SNAPSHOT_DATABASE = 'GNC_DDC_DB_V2';
const FARM_SNAPSHOT_STORE = 'inventory_cache';
let farmSnapshotDatabase;

function openFarmSnapshotDatabase() {
    farmSnapshotDatabase ??= new Promise((resolve,reject) => {
        const request = indexedDB.open(FARM_SNAPSHOT_DATABASE);
        request.onupgradeneeded = () => request.transaction.abort();
        request.onblocked = () => reject(new Error('Snapshot database is blocked.'));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                database.close();
                farmSnapshotDatabase = null;
            };
            resolve(database);
        };
    }).catch(error => {
        farmSnapshotDatabase = null;
        throw error;
    });
    return farmSnapshotDatabase;
}

async function runFarmSnapshotOperation({id,operation,key,value}) {
    if (!Number.isSafeInteger(id) || typeof key !== 'string' || !key.startsWith('bloomscapes-farm-v3154:')) return;
    const database = await openFarmSnapshotDatabase().catch(() => null);
    if (!database) {
        self.postMessage({id,result:"unavailable"});
        return;
    }
    try {
        const cache = self.AgMetricBoundedSnapshotCache;
        const result = operation === 'write'
            ? await cache.write(database,FARM_SNAPSHOT_STORE,key,value)
            : await cache.read(database,FARM_SNAPSHOT_STORE,key);
        self.postMessage({id,result});
    } catch {
        self.postMessage({id,result:undefined});
    }
}

self.onmessage = ({data}) => { void runFarmSnapshotOperation(data); };
self.postMessage({ready:true});
