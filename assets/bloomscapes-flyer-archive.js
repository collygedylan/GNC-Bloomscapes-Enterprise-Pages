const bloomscapesFlyerBucket='bloomscapes-flyer-archive';
const bloomscapesFlyerMimeTypes={preview:'image/png',pdf:'application/pdf'};

async function bloomscapesFlyerSession() {
    const farm=getBloomscapesFarm();
    const identity=getSupabaseReadIdentityScope();
    const {client,owner}=await requireBloomscapesSession();
    const context={farm,identity,client,owner};
    await assertBloomscapesFlyerSession(context);
    return context;
}

async function assertBloomscapesFlyerSession(context) {
    await requireBloomscapesOwner(context.owner);
    if (context.farm!==getBloomscapesFarm() || context.identity!==getSupabaseReadIdentityScope()) {
        throw new Error('The Flyer archive account or farm changed.');
    }
}

async function bloomscapesFlyerRpc(context,name,input) {
    const result=await context.client.rpc(name,{p_farm:context.farm,...input});
    await assertBloomscapesFlyerSession(context);
    const data=bloomscapesData(result);
    if (data?.farm_code!==context.farm) throw new Error('The Flyer archive receipt did not match this farm.');
    return data;
}

async function bloomscapesFlyerDigest(blob,kind,maxBytes) {
    if (!(blob instanceof Blob) || blob.type!==bloomscapesFlyerMimeTypes[kind] || !blob.size || blob.size>maxBytes) {
        throw new Error(kind==='pdf' ? 'The Flyer PDF is missing or exceeds 30 MiB.' : 'The Flyer preview is missing or exceeds 10 MiB.');
    }
    const result=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    return [...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function bloomscapesFlyerUpload(context,path,blob,digest) {
    if (!path) throw new Error('The Flyer upload did not receive a file path.');
    const {error}=await context.client.storage.from(bloomscapesFlyerBucket).upload(path,blob,{
        contentType:blob.type,upsert:false,cacheControl:'0',metadata:{sha256:digest}
    });
    await assertBloomscapesFlyerSession(context);
    if (!error) return;
    if (Number(error.statusCode || error.status)===409 || /already exists|duplicate/i.test(error.message || '')) return;
    throw new Error(error.message || 'The Flyer artwork could not be uploaded.');
}

async function archiveBloomscapesMarketingFlyer({
    title,canvas,previewBlob,pdfBlob,purpose,requestId=crypto.randomUUID(),sourceArchiveId,sourceFolderId
}) {
    const context=await bloomscapesFlyerSession();
    const [previewDigest,pdfDigest]=await Promise.all([
        bloomscapesFlyerDigest(previewBlob,'preview',10485760),
        pdfBlob ? bloomscapesFlyerDigest(pdfBlob,'pdf',31457280) : Promise.resolve(null)
    ]);
    if (['pdf','email'].includes(purpose) && !pdfDigest) throw new Error('Render the PDF before archiving this export.');
    await assertBloomscapesFlyerSession(context);
    const intent=await bloomscapesFlyerRpc(context,'gnc_begin_marketing_flyer_archive',{
        p_request:requestId,p_title:title || canvas?.title,p_canvas:canvas,p_purpose:purpose,
        p_preview_sha256:previewDigest,p_preview_bytes:previewBlob.size,p_pdf_sha256:pdfDigest,
        p_pdf_bytes:pdfBlob?.size ?? null,p_source_archive_id:sourceArchiveId || null,p_source_folder_id:sourceFolderId || null
    });
    if (!intent.id || !intent.preview_path || Boolean(intent.pdf_path)!==Boolean(pdfBlob)) {
        throw new Error('The Flyer export did not receive its immutable upload plan.');
    }
    if (!intent.archived_at) {
        await Promise.all([
            bloomscapesFlyerUpload(context,intent.preview_path,previewBlob,previewDigest),
            ...(pdfBlob ? [bloomscapesFlyerUpload(context,intent.pdf_path,pdfBlob,pdfDigest)] : [])
        ]);
    }
    const saved=await bloomscapesFlyerRpc(context,'gnc_finish_marketing_flyer_archive',{p_id:intent.id});
    if (saved.id!==intent.id || saved.preview_path!==intent.preview_path || saved.pdf_path!==intent.pdf_path || !saved.archived_at) {
        throw new Error('The Flyer archive is missing a matching artwork receipt.');
    }
    return saved;
}

async function queueBloomscapesMarketingFlyerEmail(id) {
    const context=await bloomscapesFlyerSession();
    const saved=await bloomscapesFlyerRpc(context,'gnc_queue_marketing_flyer_mail',{p_id:id});
    if (!saved.ok || saved.id!==id || !saved.email_event_id) throw new Error('No matching Flyer email queue receipt returned.');
    return saved;
}

async function readBloomscapesFlyerArchive({query='',cursor,limit=24}={}) {
    const context=await bloomscapesFlyerSession();
    const saved=await bloomscapesFlyerRpc(context,'gnc_read_marketing_flyer_archive',{
        p_query:query.trim(),p_limit:limit,p_before_at:cursor?.created_at ?? null,p_before_id:cursor?.id ?? null
    });
    if (!saved.ok || !Array.isArray(saved.rows)) throw new Error('The Flyer History response was incomplete.');
    return saved;
}

async function readBloomscapesFlyerDesign(id) {
    const context=await bloomscapesFlyerSession();
    const saved=await bloomscapesFlyerRpc(context,'gnc_read_marketing_flyer_design',{p_id:id});
    if (saved.id!==id || !Array.isArray(saved.canvas_json?.pages)) throw new Error('No matching editable Flyer design returned.');
    return saved;
}

async function createBloomscapesFlyerArtifactUrls(paths) {
    const context=await bloomscapesFlyerSession();
    const exact=[...new Set(paths.filter(Boolean))];
    if (!exact.length) return {};
    const result=await context.client.storage.from(bloomscapesFlyerBucket).createSignedUrls(exact,600);
    await assertBloomscapesFlyerSession(context);
    if (result.error) throw new Error(result.error.message || 'Flyer previews are unavailable.');
    return Object.fromEntries((result.data || []).filter(row=>row.signedUrl).map(row=>[row.path,row.signedUrl]));
}

async function createBloomscapesFlyerArtifactUrl(path) {
    const urls=await createBloomscapesFlyerArtifactUrls([path]);
    if (!urls[path]) throw new Error('The archived Flyer file is unavailable.');
    return urls[path];
}
