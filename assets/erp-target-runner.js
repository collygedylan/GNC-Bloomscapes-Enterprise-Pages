
function confirmErpTargetReceipt(target, response) {
    const receipt = response?.results?.length===1 ? response.results[0] : response;
    if ((receipt?.targetKey || receipt?.target_key)!==target.key) throw new Error('ERP target receipt mismatch.');
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
        active = runErpTargetSequence(targets,port).finally(()=>{ active=null; });
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
            const stage=state.stages[index];
            stage.status='running';
            publish();
            stage.receipt=await executeErpTargetStage(targets[index],port.commandId(),port,status=>{
                stage.status=status;
                publish();
            });
            stage.status=stage.receipt.status;
            state.percent=Math.floor((index+1)*100/targets.length);
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
