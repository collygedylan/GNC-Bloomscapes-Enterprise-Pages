function closeNcrRepOutreachModal(choice = 'no') {
    const modal = document.getElementById('ncr-rep-outreach-modal');
    if (modal) modal.classList.add('hidden');
    const resolver = ncrRepOutreachPromptResolver;
    ncrRepOutreachPromptResolver = null;
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('ncr-rep-outreach-modal');
    if (resolver) resolver(String(choice || 'no').trim().toLowerCase() || 'no');
}

function openNcrRepOutreachModal(item = null, type = 'new-crop', approvedQty = '') {
    const modal = mountBloomscapesStaticBody('ncr-rep-outreach-modal');
    if (!modal) return Promise.resolve('no');
    const labelText = getNcrRepOutreachModalRowLabel(item, type, approvedQty);
    const title = document.getElementById('ncr-rep-outreach-title');
    const label = document.getElementById('ncr-rep-outreach-label');
    if (title) title.textContent = `Send ${getNcrApprovalTypeLabel(type)} to reps?`;
    if (label) label.textContent = labelText;
    if (ncrRepOutreachPromptResolver) {
        const previousResolver = ncrRepOutreachPromptResolver;
        ncrRepOutreachPromptResolver = null;
        previousResolver('no');
    }
    modal.classList.remove('hidden');
    const response = new Promise((resolve) => { ncrRepOutreachPromptResolver = resolve; });
    const yesBtn = modal.querySelector('#ncr-rep-outreach-yes-btn');
    if (yesBtn) setTimeout(() => {
        if (yesBtn.isConnected && !modal.classList.contains('hidden')) yesBtn.focus();
    }, 0);
    return response;
}

function mountSalesOfficeAvNoteModal() {
    const saved = mountBloomscapesStaticBody('sales-office-av-modal');
    if (saved) return saved;
    const template = document.createElement('template');
    template.innerHTML = `
    <div id="sales-office-av-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-[10000] flex items-center justify-center p-4" onclick="if(event.target===this) closeSalesOfficeAvNoteModal()">
        <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg text-left">
            <div class="flex items-start justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
                <div>
                    <div class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#007a4d]"><i class="ph-bold ph-handbag text-sm"></i>Bloom Picker</div>
                    <h3 class="mt-3 text-lg font-black text-slate-900">Edit Sales Office AV Note</h3>
                    <div id="sales-office-av-modal-label" class="mt-1 text-[11px] font-semibold text-slate-500"></div>
                </div>
                <button type="button" class="text-gray-500 font-bold py-2 px-3" onclick="closeSalesOfficeAvNoteModal()">Close</button>
            </div>
            <input type="hidden" id="sales-office-av-uid">
            <textarea id="sales-office-av-text" class="input-field border-purple-200 focus:border-purple-500 min-h-[160px] resize-y text-left" placeholder="Enter AV note..."></textarea>
            <div class="flex gap-2 mt-2">
                <button type="button" class="w-1/3 bg-gray-100 text-gray-600 font-bold p-3 rounded-lg shadow-sm active:scale-95" onclick="closeSalesOfficeAvNoteModal()">Cancel</button>
                <button type="button" id="sales-office-av-save-btn" class="w-2/3 bg-[#007a4d] text-white font-bold p-3 rounded-lg shadow-md active:scale-95" onclick="saveSalesOfficeAvNote()">Save AV Note</button>
            </div>
        </div>
    </div>
    `;
    const modal = template.content.firstElementChild;
    document.body.append(modal);
    return modal;
}

function openSalesOfficeAvNoteModal(uniqueId) {
    const uid = String(uniqueId || '').trim();
    if (!uid) return;
    const item = salesOfficeInventory.find((row) => String((row && row.UNIQUE_ID) || '').trim() === uid) || findItemByUniqueId(uid);
    if (!item) {
        showToast('Not Found', 'That Sales Office row could not be found.', true);
        return;
    }
    const source = String(firstNonEmptyValue(item.SO_SOURCE, item.so_source, '') || '').trim().toLowerCase();
    if (source === 'season' && !isAvBlanksPhotoBypassUserAllowed()) {
        ensureSeasonSalesNoteAccessFresh(0);
        showToast('Read Only', 'You are not assigned to enter Season Sales Notes.', true);
        return;
    }
    const modal = mountSalesOfficeAvNoteModal();
    const uidField = document.getElementById('sales-office-av-uid');
    const textField = document.getElementById('sales-office-av-text');
    const label = document.getElementById('sales-office-av-modal-label');
    if (!modal || !uidField || !textField) return;
    uidField.value = uid;
    textField.value = getSalesOfficeDisplayAvNote(item, '');
    if (label) label.innerText = `${item.COMMONNAME || 'Unknown'} - ${item.CONTSIZE || '-'} - ${item.LOCATIONCODE || 'No Loc'} / ${item.LOTCODE || '-'}`;
    modal.classList.remove('hidden');
    setTimeout(() => {
        try {
            textField.focus();
            textField.setSelectionRange(textField.value.length, textField.value.length);
        } catch { globalThis.safeIgnoreProbeError?.("openSalesOfficeAvNoteModal"); }
    }, 60);
}

function closeSalesOfficeAvNoteModal() {
    const modal = document.getElementById('sales-office-av-modal');
    const uidField = document.getElementById('sales-office-av-uid');
    const textField = document.getElementById('sales-office-av-text');
    const saveBtn = document.getElementById('sales-office-av-save-btn');
    if (modal) modal.classList.add('hidden');
    if (uidField) uidField.value = '';
    if (textField) textField.value = '';
    if (saveBtn) saveBtn.innerText = 'Save AV Note';
    if (typeof detachBloomscapesStaticBody === 'function') detachBloomscapesStaticBody('sales-office-av-modal');
}
