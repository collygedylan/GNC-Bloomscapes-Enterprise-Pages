const BLOOMSCAPES_IMAGE_MODEL = 'Xenova/clip-vit-base-patch32';
let bloomscapesImageEncoder;

async function loadBloomscapesImageEncoder() {
    if (!bloomscapesImageEncoder) {
        const runtime = new URL('./assets/vendor/ml/transformers.min.js?v='+APP_SHELL_VERSION,document.baseURI).href;
        bloomscapesImageEncoder = import(runtime)
            .then(async module => {
                module.env.allowLocalModels = true;
                module.env.allowRemoteModels = false;
                module.env.localModelPath = new URL('./assets/vendor/ml/models/',document.baseURI).href;
                module.env.backends.onnx.wasm.wasmPaths = new URL('./assets/vendor/ml/',document.baseURI).href;
                module.env.backends.onnx.wasm.numThreads = 1;
                return module.pipeline('image-feature-extraction',BLOOMSCAPES_IMAGE_MODEL,{dtype:'q8',device:'wasm'});
            }).catch(error => { bloomscapesImageEncoder = null; throw error; });
    }
    return bloomscapesImageEncoder;
}

function bloomscapesCosine(left,right) {
    if (left.length !== right.length || !left.length) throw new Error('Image features could not be compared.');
    let product = 0, leftNorm = 0, rightNorm = 0;
    for (let index = 0; index<left.length; index++) {
        product += left[index]*right[index];
        leftNorm += left[index]**2;
        rightNorm += right[index]**2;
    }
    if (!leftNorm || !rightNorm) throw new Error('Image features are empty.');
    return Math.max(-1,Math.min(1,product/Math.sqrt(leftNorm*rightNorm)));
}

async function bloomscapesLabReferences(client,farm) {
    const result = await client.rpc('gnc_lab_reference_assets',{p_farm:farm});
    const rows = bloomscapesData(result);
    const links = await client.storage.from('disease_training_assets').createSignedUrls(rows.map(row => row.path),600);
    if (links.error) throw new Error('Lab reference photos are unavailable.');
    const byPath = new Map(links.data.map(row => [row.path,row.signedUrl]));
    return rows.map(row => ({...row,url:byPath.get(row.path)}));
}

async function uploadBloomscapesLabObject(client,bucket,path,file) {
    const result = await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
    if (result.error) throw new Error('Lab file upload failed.');
}

async function scanBloomscapesLabPhoto(input,progress) {
    if (!(input.file instanceof File) || !['image/jpeg','image/png','image/webp'].includes(input.file.type)
        || input.file.size>10*1024*1024) throw new Error('Choose a JPEG, PNG or WebP photo under 10 MB.');
    const {client,owner} = await requireBloomscapesSession();
    progress('Loading the image model on this device…');
    const encoder = await loadBloomscapesImageEncoder();
    const references = await bloomscapesLabReferences(client,input.farm);
    const local = URL.createObjectURL(input.file);
    const matches = [];
    try {
        const query = await encoder(local);
        for (const reference of references) {
            await requireBloomscapesOwner(owner);
            progress('Matching reference '+(matches.length+1)+' of '+references.length+'…');
            if (!reference.url) throw new Error('A reference photo link could not be verified.');
            const vector = await encoder(reference.url);
            matches.push({...reference,similarity:bloomscapesCosine(query.data,vector.data)});
        }
    } finally { URL.revokeObjectURL(local); }
    await requireBloomscapesOwner(owner);
    const best = matches.sort((a,b) => b.similarity-a.similarity).slice(0,5);
    const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[input.file.type];
    const path = 'samples/'+input.sample+'/'+crypto.randomUUID()+'.'+extension;
    await uploadBloomscapesLabObject(client,'disease_training_assets',path,input.file);
    const result = await client.rpc('gnc_record_lab_scan',{p_sample:input.sample,p_path:path,p_model:BLOOMSCAPES_IMAGE_MODEL,
        p_matches:best.map(row => ({source_key:row.source_key,similarity:row.similarity}))});
    bloomscapesData(result);
    await requireBloomscapesOwner(owner);
    return {sample:input.sample,matches:best};
}

async function uploadBloomscapesLabReport(input) {
    if (!(input.file instanceof File) || input.file.type !== 'application/pdf' || input.file.size>20*1024*1024) {
        throw new Error('Choose a lab PDF under 20 MB.');
    }
    const bytes = await input.file.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('The selected file is not a PDF.');
    const {client,owner} = await requireBloomscapesSession();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
        .map(byte => byte.toString(16).padStart(2,'0')).join('');
    const path = 'returned/'+input.sample+'/'+crypto.randomUUID()+'.pdf';
    await uploadBloomscapesLabObject(client,'diagnostic_lab_reports',path,input.file);
    await requireBloomscapesOwner(owner);
    const result = await client.rpc('gnc_attach_lab_report',{p_sample:input.sample,p_path:path,p_sha256:digest,p_pathogen:input.pathogen});
    return bloomscapesData(result);
}

async function searchBloomscapesLabArchive(query,offset = 0) {
    const {client,owner} = await requireBloomscapesSession();
    const rows = bloomscapesData(await client.rpc('gnc_search_lab_archive',{p_query:query,p_offset:offset}));
    for (const bucket of ['diagnostic_lab_reports','disease_training_assets']) {
        const entries = rows.filter(row=>row.bucket===bucket && row.path);
        if (!entries.length) continue;
        const signed = await client.storage.from(bucket).createSignedUrls(entries.map(row=>row.path),600);
        if (signed.error) throw new Error('Archive links could not be opened.');
        const links = new Map(signed.data.map(row=>[row.path,row.signedUrl]));
        entries.forEach(row=>{row.url=links.get(row.path);});
    }
    await requireBloomscapesOwner(owner);
    return rows;
}
