function filterBloomscapesVault(rows,input) {
    const words=String(input.search || '').toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(row=>{
        const text=[row.username,row.work_type,row.itemcode,row.locationcode,row.lotcode,row.created_at].join(' ').toLowerCase();
        return words.every(word=>text.includes(word))
            && (!input.user || row.username===input.user)
            && (!input.type || row.work_type===input.type)
            && (!input.block || String(row.locationcode || '').toLowerCase().startsWith(input.block.toLowerCase()))
            && (!input.from || String(row.created_at).slice(0,10)>=input.from)
            && (!input.to || String(row.created_at).slice(0,10)<=input.to);
    });
}

function bindBloomscapesVaultFilter(host,rows,render) {
    const form=host.querySelector('form');
    const apply=()=>{
        const started=performance.now();
        const matches=filterBloomscapesVault(rows,Object.fromEntries(new FormData(form)));
        const elapsed=performance.now()-started;
        render(matches.slice(0,100));
        const status=host.querySelector('[role="status"]');
        status.dataset.searchMs=String(elapsed);
        status.textContent=matches.length+' matches · '+elapsed.toFixed(2)+' ms search'
            +(matches.length>100?' · first 100 shown; narrow the filters':'');
    };
    form.oninput=apply;
    form.onsubmit=event=>{event.preventDefault();apply();};
    apply();
}

function renderBloomscapesVaultPdf(item,row) {
    const button=document.createElement('button');
    button.type='button';
    button.textContent='Open / Print PDF';
    button.addEventListener('click',async()=>{
        if(button.disabled) return;
        button.disabled=true;
        const tab=window.open('about:blank','_blank');
        if(tab) tab.opener=null;
        try {
            const result=await submitBloomscapesCommand('pdf-link',{id:row.pdf_id});
            if(tab) tab.location.href=result.signedUrl;
            else {
                const link=document.createElement('a');
                link.href=result.signedUrl;link.target='_blank';link.rel='noopener noreferrer';
                link.textContent='Open PDF';item.appendChild(link);
            }
        } catch(error) {
            tab?.close();
            button.textContent=error.message;
        } finally {button.disabled=false;}
    });
    item.appendChild(button);
}
