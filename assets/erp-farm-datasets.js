const ERP_PO_READ_COLUMNS = 'id,warehouse_id,record_kind,origin_farm,po_number,itemcode,contsize,ordered_qty,received_qty,remaining_po_qty,needed_on,payload';

function getErpFarmReadContracts(farm) {
    if (!['10-PH','60-HL','20-TX','40-NC'].includes(farm)) throw new Error('Unknown ERP farm.');
    return [
        ['inventory',farm === '10-PH' ? 'ph_master_inventory' : 'gnc_all_master_inventory','warehousei','unique_id'],
        ['soc','gnc_all_soc_master','warehouseid','unique_id'],
        ['reserves','gnc_all_reserves','warehouseid','unique_id'],
        ['purchaseOrders','gnc_fulfillment_work','warehouse_id','id'],
        ['assigned','ph_inventory_row_assignments','farm_code','master_unique_id'],
        ['defaults','ph_itemcode_default_owners','farm_code','itemcode_normalized']
    ];
}

function erpFarmReadQuery(table,column,order,farm,offset) {
    const allowed=getErpFarmReadContracts(farm).some(row=>row[1]===table && row[2]===column && row[3]===order);
    if (!allowed) throw new Error('Unknown farm dataset.');
    const select=table==='gnc_fulfillment_work' ? ERP_PO_READ_COLUMNS : '*';
    const query=new URLSearchParams({select,order:order+'.asc',offset:String(offset),limit:'1000'});
    if (table !== 'ph_master_inventory') query.set(column,'eq.'+(['farm_code','warehouse_id'].includes(column) ? farm : farm.slice(0,2)));
    if (table==='gnc_fulfillment_work') query.set('record_kind','eq.PO');
    return query.toString();
}
