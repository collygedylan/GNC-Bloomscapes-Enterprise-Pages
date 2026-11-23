function currentCanonicalAvPhotoUrls(item) {
    if (!item) return [];
    const row = resolveCanonicalInventoryRow(item) || item;
    const onHand = getCanonicalAvLotNumber(row,['PTRONHAND','PTR_ON_HAND','ON_HAND','ONHAND']);
    const match = getCanonicalAvLotNumber(row,['LOC_PHOTO_MATCH','LOC_MATCH_QTY']);
    if (!(onHand > 0 && match > 0)) return [];
    const now = Date.now();
    const expiry = Date.parse(canonicalInventoryValue(row,'PHOTO_EXPIRES_AT'));
    if (Number.isFinite(expiry) && expiry <= now) return [];
    return getAvRowPhotoUrls(row).filter(url=>{
        const stamp=getPhotoEntryDateMs(url,row);
        return Number.isFinite(stamp) && stamp <= now && !isPhotoDateMsExpired(stamp);
    });
}
