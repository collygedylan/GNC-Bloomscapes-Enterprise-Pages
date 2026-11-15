function captureAppUpdateWorkSnapshot() {
    const fieldWork=document.querySelector('[data-create-field-work]');
    if(fieldWork && ['sourceId','quantity','percent','instructions'].some(name=>fieldWork.elements[name]?.value)) {
        throw Error('field-work-draft-unsaved');
    }
    if (typeof hasBloomscapesTransferDraft==='function' && hasBloomscapesTransferDraft()) throw Error('transfer-order-draft-unsaved');
    const owner=getAppUpdateWorkOwner();
    if(!owner.verified && !owner.guest)throw Error('session-not-ready');
    if(owner.guest)return {owner,view:'login',roots:[],selection:[]};
    const view=getCurrentVisibleViewId(),visible=id=>isAppUpdateElementVisible(document.getElementById(id));
    const rootIds=[...new Set(['view-'+view,...['request-rep-modal','bloom-picker-modal','argos-inventory-transaction-modal'].filter(visible)])];
    const search = getAppUpdateHeaderSearchRoot(view);
    if (search && document.getElementById('global-header-search-slot')?.contains(search)) rootIds.push(search.id);
    const selection=[...new Set([...selectedItems,...driveQuickRequestItems])].map(domId=>{
        const row=findItemByDomId(domId);if(!row)throw Error('selection-not-ready');
        return {domId,uid:String(row.UNIQUE_ID || row.unique_id || ''),row,source:selectedItemSources.get(domId) || '',selected:selectedItems.has(domId),quick:driveQuickRequestItems.has(domId)};
    });
    let request=null;if(visible('request-rep-modal')){captureRequestQtyStepRenderedInputs();request={form:captureRequestSubmissionForm(),batchId:activeRequestSubmissionBatchId,
        steps:['step-1-rep','step-1.5-folder','step-2-cust','step-3-qty'].filter(visible)};}
    let bloom=null;if(visible('bloom-picker-modal'))bloom=collectBloomPickerOrderDraftState();
    const reclass=visible('argos-inventory-transaction-modal') && argosInventoryTransactionState ? {
        uid:argosInventoryTransactionState.uid,sourceView:argosInventoryTransactionState.sourceView,item:argosInventoryTransactionState.item,
        rows:(argosInventoryTransactionState.inquiryModel?.locationRows || []).map(row=>row.sourceRow).filter(Boolean),
        proposals:argosReclassMultiActionState,evalWorkId:activeEvalWorkDetailId,
        detailOrigin:typeof evalWorkActiveOriginUid==='undefined'?'':evalWorkActiveOriginUid,
        temporaryOverlays:typeof evalWorkTemporaryRowOverlays==='undefined'?null:evalWorkTemporaryRowOverlays,
        evidenceByOrigin:typeof evalWorkEvidenceByOrigin==='undefined'?null:evalWorkEvidenceByOrigin,
        activePhotos:typeof evalWorkActivePhotos==='undefined'?null:evalWorkActivePhotos,
        expanded:[...document.querySelectorAll('[data-reclass-row-card]')].filter(card=>card.querySelector('[data-reclass-row-hydrated="true"]')).map(card=>card.getAttribute('data-reclass-row-card'))}:null;
    return {owner,view,scroll:getMainAreaScrollTop(),windowScroll:{x:window.scrollX || 0,y:window.scrollY || 0},filters:captureAppFilterState(),history:viewHistoryStack.slice(-40),reports:captureAppUpdateReportState(),
        detail:view==='detail' && activeItem?{row:activeItem,uid:String(activeItem.UNIQUE_ID || activeItem.unique_id || ''),source:activeDetailSourceView || lastView,
            tab:activeDetailTab,lastView,returnState:detailReturnState,prefix:getDetailTabPrefix(activeDetailTab)}:null,
        selection,request,bloom,reclass,cartOpen:cartPanelOpen,
        drafts:{ncr:typeof ncrDraftState==='undefined'?null:ncrDraftState,hl:typeof hlOrderSelections==='undefined'?null:hlOrderSelections},
        roots:rootIds.map(id=>({id,controls:captureAppUpdateControls(document.getElementById(id)),scrolls:[...document.getElementById(id)?.querySelectorAll('[id]') || []].filter(node=>node.scrollTop || node.scrollLeft).map(node=>({id:node.id,top:node.scrollTop,left:node.scrollLeft}))}))};
}
