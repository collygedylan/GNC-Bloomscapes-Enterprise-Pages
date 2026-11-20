function nearestPlantHealthReference(query, references) {
    let best = null;
    for (const {key, vector} of references) {
        const similarity = bloomscapesCosine(query, vector);
        if (!best || similarity > best.similarity) best = {key, similarity};
    }
    return best;
}

async function loadPlantHealthWorkerModel(version) {
    const vendor = new URL('./vendor/ml/', self.location.href);
    const ml = await import(new URL('transformers.min.js?v=' + encodeURIComponent(version), vendor));
    ml.env.allowLocalModels = true;
    ml.env.allowRemoteModels = false;
    ml.env.localModelPath = new URL('models/', vendor).href;
    ml.env.backends.onnx.wasm.wasmPaths = vendor.href;
    ml.env.backends.onnx.wasm.numThreads = 1;
    return ml.pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', {dtype:'q8', device:'wasm'});
}

function installPlantHealthWorker() {
    const vectors = new Map();
    let model;
    self.onmessage = async ({data}) => {
        try {
            model ||= await loadPlantHealthWorkerModel(data.version);
            const query = await model(data.photo);
            const references = [];
            for (const reference of data.references) {
                const vector = vectors.get(reference.key) || (await model(reference.url)).data;
                vectors.set(reference.key, vector);
                references.push({key:reference.key, vector});
            }
            self.postMessage({match:nearestPlantHealthReference(query.data, references)});
        } catch (error) {
            self.postMessage({error:error.message || 'Photo analysis failed.'});
        }
    };
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    const workerVersion = new URL(self.location.href).searchParams.get('v');
    importScripts(new URL('./bloomscapes-lab.js?v=' + encodeURIComponent(workerVersion), self.location.href).href);
    installPlantHealthWorker();
}

