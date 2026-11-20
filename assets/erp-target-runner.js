
function confirmErpTargetReceipt(target, response) {
    const receipt = response?.results?.length===1 ? response.results[0] : response;
    if ((receipt?.targetKey || receipt?.target_key)!==target.key) throw new Error('ERP target receipt mismatch.');
    if (target.key==='CAV_PROJECTION' && receipt.status==='verified' && Number.isInteger(receipt.row_count) && receipt.row_count>=0) return receipt;
    if (receipt.status==='no_new_file' && receipt.skipped===true) return receipt;
    const retainedSource=receipt.verified===true && receipt.source_verified===true
        && receipt.live_row_count===receipt.row_count && /^[a-f0-9]{64}$/.test(receipt.sha256 || '');
    if (receipt.status==='published' && (receipt.archived===true || retainedSource) && receipt.run_id && receipt.file_id
        && receipt.file_name && Number.isInteger(receipt.row_count) && receipt.row_count>0) return receipt;
    throw new Error('ERP publication is not confirmed.');
}

async function executeErpTargetStage(target, commandId, port, publish) {
    for (let attempt=0; attempt<3; attempt+=1) {
        port.assertCurrent();
        try {
            const response = await port.execute(target,{commandId,attempt,timeoutMs:90000});
            port.assertCurrent();
            if (response?.status==='busy') throw Object.assign(new Error('Importer is still running.'),{retryable:true});
            return confirmErpTargetReceipt(target,response);
        } catch (error) {
            port.assertCurrent();
            if (attempt===2 || !error.retryable) throw error;
            publish('recovering');
            await port.delay(1500 * (attempt+1));
        }
    }
    throw new Error('ERP recovery exhausted.');
}

function createErpTargetRunner(port) {
    let active = null;
    return keys=>{
        if (active) return active;
        const targets = selectErpSyncTargets(keys);
        if (!targets.length) return Promise.reject(new Error('Select at least one ERP target.'));
        active = runErpTargetSequence(planOperationalRun(targets),port).finally(()=>{ active=null; });
        return active;
    };
}

async function runErpTargetSequence(targets, port) {
    const state = {active:true,percent:0,index:0,targets,stages:targets.map(target=>({key:target.key,status:'queued'}))};
    const publish = ()=>port.publish({...state,stages:state.stages.map(stage=>({...stage}))});
    publish();
    try {
        for (let index=0; index<targets.length; index+=1) {
            state.index=index;
            state.operation=operationalStage(targets,index);
            const stage=state.stages[index];
            stage.status='running';
            publish();
            stage.receipt=await executeErpTargetStage(targets[index],port.commandId(),port,status=>{
                stage.status=status;
                publish();
            });
            stage.status=stage.receipt.status;
            state.percent=operationalStage(targets,index+1)?.percent ?? Math.floor((index+1)*100/targets.length);
            publish();
        }
        return state.stages.map(stage=>stage.receipt);
    } catch (error) {
        state.stages[state.index].status='failed';
        state.error=error.message;
        throw error;
    } finally {
        state.active=false;
        publish();
    }
}

function planOperationalRun(targets) {
    const required=['PH_DRIVE_AROUND','PH_SOC_RESERVES','PH_SOC_OPEN','PH_HL_PO'];
    if (!required.every(key=>targets.some(target=>target.key===key))) return targets;
    const firstReserve=targets.findIndex(target=>target.group==='SOC_RESERVES');
    const cav={key:'CAV_PROJECTION',label:'CAV',shortLabel:'CAV',farm:'10-PH',group:'CAV',tableName:'ph_cav_import'};
    return [...targets.slice(0,firstReserve),cav,...targets.slice(firstReserve)];
}

function operationalStage(targets,index) {
    if (!targets.some(target=>target.key==='CAV_PROJECTION')) return null;
    const groups=[['DRIVE_AROUND','DRIVE'],['CAV','CAV'],['SOC_RESERVES','RESERVES'],['SOC_OPEN','SOC'],['PO_REPORTS','HL PO']];
    const completed=groups.filter(([group])=>targets.every((target,pos)=>target.group!==group || pos<index)).length;
    return {number:Math.min(completed+1,5),name:groups[completed]?.[1] || 'Completed',percent:completed*20};
}
