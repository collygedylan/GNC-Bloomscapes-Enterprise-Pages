const BLOOMSCAPES_CALENDAR_SHELL="<div class=\"freeze-panel\">\r\n                        <div class=\"flex items-center justify-between gap-3 mb-3\">\r\n                            <div>\r\n                                <div class=\"text-xs font-bold text-[#007a4d] uppercase tracking-[0.16em]\">Communication</div>\r\n                                <div id=\"department-calendar-title\" class=\"text-xl font-black text-slate-900\">Department Calendar</div>\r\n                            </div>\r\n                            <button type=\"button\" class=\"rounded-xl border border-green-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#007a4d] shadow-sm active:scale-95\" onclick=\"openDepartmentCalendarComposer('time_off')\"><i class=\"ph-bold ph-plus text-base align-middle\"></i><span class=\"align-middle ml-1\">Request</span></button>\r\n                        </div>\r\n                    </div>\r\n                    <div id=\"department-calendar-content\"></div>";

function mountBloomscapesCalendarShell(view) {
    if (view!=='department-calendar') return;
    const root=document.getElementById('view-department-calendar');
    if (root && !root.querySelector('#department-calendar-content')) root.innerHTML=BLOOMSCAPES_CALENDAR_SHELL;
}
