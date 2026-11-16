
function buildMarkDoneConfirmBodyHtml(plan = {}) {
            const photoLines = Array.isArray(plan.photoLines) ? plan.photoLines.filter((line) => String(line || '').trim()) : [];
            const inventoryLines = Array.isArray(plan.inventoryLines) ? plan.inventoryLines.filter((line) => String(line || '').trim()) : [];
            const buildList = (lines) => lines.map((line) => `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-extrabold leading-snug text-slate-800">${escapeHtml(normalizeDetailEvidenceText(line))}</div>
            `).join('');
            const sections = [
                `<section>
                    <div class="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">Photo/spec that will be sent</div>
                    <div class="space-y-2">${photoLines.length ? buildList(photoLines) : '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-extrabold text-slate-500">No photo/spec fields entered</div>'}</div>
                </section>`
            ];
            if (inventoryLines.length) {
                sections.push(`
                    <section>
                        <div class="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">Inventory edits that will be saved</div>
                        <div class="space-y-2">${buildList(inventoryLines)}</div>
                    </section>
                `);
            }
            sections.push('<div class="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">OK sends the work. Cancel leaves the row open.</div>');
            return `<div class="space-y-4">${sections.join('')}</div>`;
        }
