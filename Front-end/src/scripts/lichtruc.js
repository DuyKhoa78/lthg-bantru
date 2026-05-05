/* ============================================================
   LICHTRUC.JS – Calendar lịch trực GV
   ============================================================ */
'use strict';

/* ── Mock Data ── */
let MOCK_GV = [];
let MOCK_SCHEDULES = [];

/* ── State ── */
let currentYear, currentMonth;
let filterCa = '', filterGv = '';
let detailModal;
let selectedShift = null;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    const today  = new Date();
    currentYear  = today.getFullYear();
    currentMonth = today.getMonth(); // 0-indexed

    detailModal = new Modal('shiftDetailModal');

    _populateGvFilter();
    _renderCalendar();
    _bindControls();
});

/* ── Populate GV filter ── */
function _populateGvFilter() {
    const sel = document.getElementById('filter-gv');
    if (!sel) return;
    MOCK_GV.forEach(gv => {
        const opt = document.createElement('option');
        opt.value = gv.id;
        opt.textContent = gv.ho_ten;
        sel.appendChild(opt);
    });
}

/* ── Render Calendar ── */
function _renderCalendar() {
    const label = document.getElementById('lt-month-label');
    if (label) {
        const d = new Date(currentYear, currentMonth, 1);
        label.textContent = d.toLocaleDateString('vi-VN', { month:'long', year:'numeric' });
    }

    const grid = document.getElementById('lt-grid');
    if (!grid) return;

    // First weekday of month (0=Sun…6=Sat), convert to Mon-start
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const startOffset = (firstDay === 0) ? 6 : firstDay - 1;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrev  = new Date(currentYear, currentMonth, 0).getDate();

    const today = new Date();
    const cells = [];

    // Prev month filler
    for (let i = startOffset - 1; i >= 0; i--) {
        cells.push({ day: daysInPrev - i, month: currentMonth - 1, other: true });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ day: d, month: currentMonth, other: false });
    }
    // Next month filler
    const remainder = 42 - cells.length;
    for (let d = 1; d <= remainder; d++) {
        cells.push({ day: d, month: currentMonth + 1, other: true });
    }

    grid.innerHTML = cells.map(cell => {
        const y = cell.other && cell.month < 0  ? currentYear - 1
                : cell.other && cell.month > 11 ? currentYear + 1
                : currentYear;
        const m = ((cell.month % 12) + 12) % 12;
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;

        const isToday   = !cell.other && cell.day === today.getDate()
                       && currentMonth === today.getMonth() && currentYear === today.getFullYear();
        const isWeekend = (cells.indexOf(cell) % 7) >= 5;

        // Filter shifts for this date
        let dayShifts = MOCK_SCHEDULES.filter(s => s.ngay === dateStr);
        if (filterCa === 'an')  dayShifts = dayShifts.filter(s => s.loai_truc === 0);
        if (filterCa === 'ngu') dayShifts = dayShifts.filter(s => s.loai_truc === 1);
        if (filterGv) dayShifts = dayShifts.filter(s => s.ma_gv === parseInt(filterGv) || s.ma_gv_truc_thay === parseInt(filterGv));

        const MAX_SHOW = 3;
        const visible  = dayShifts.slice(0, MAX_SHOW);
        const moreCount= dayShifts.length - MAX_SHOW;

        const shiftHtml = visible.map(s => {
            const gv   = MOCK_GV.find(g => g.id === s.ma_gv);
            const thay = s.ma_gv_truc_thay ? MOCK_GV.find(g => g.id === s.ma_gv_truc_thay) : null;
            return `
            <div class="lt-shift ca-${s.loai_truc === 0 ? 'an' : 'ngu'}"
                 data-shift="${s.id}" title="${gv?.ho_ten}">
                <div class="lt-shift-room">${s.ma_phong} &middot; ${s.loai_truc === 0 ? 'Ăn' : 'Ngủ'}</div>
                <div class="lt-shift-gv"><i class="fas fa-user-tie"></i> ${gv?.ho_ten || '?'}</div>
                ${thay ? `<div class="lt-shift-thay"><i class="fas fa-exchange-alt"></i> ${thay.ho_ten}</div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="lt-day ${cell.other ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}"
             data-date="${dateStr}">
            <div class="lt-day-num">${cell.day}</div>
            <div class="lt-shifts">
                ${shiftHtml}
                ${moreCount > 0 ? `<div class="lt-more">+${moreCount} ca khác</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Bind shift click → modal
    grid.querySelectorAll('.lt-shift').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const shift = MOCK_SCHEDULES.find(s => s.id === parseInt(el.dataset.shift));
            if (shift) _showShiftDetail(shift);
        });
    });
}

/* ── Shift Detail Modal ── */
function _showShiftDetail(shift) {
    selectedShift = shift;
    const gv   = MOCK_GV.find(g => g.id === shift.ma_gv);
    const thay = shift.ma_gv_truc_thay ? MOCK_GV.find(g => g.id === shift.ma_gv_truc_thay) : null;

    const rows = [
        { icon: 'fas fa-calendar', label: 'Ngày trực', value: Utils.formatDate(shift.ngay) },
        { icon: 'fas fa-door-open', label: 'Phòng', value: shift.ma_phong },
        { icon: shift.loai_truc === 0 ? 'fas fa-utensils' : 'fas fa-bed', label: 'Loại ca',
          value: shift.loai_truc === 0
            ? '<span class="badge badge-ca-an">Ca ăn</span>'
            : '<span class="badge badge-ca-ngu">Ca ngủ</span>' },
        { icon: 'fas fa-chalkboard-teacher', label: 'Giáo viên', value: gv?.ho_ten || '?' },
        { icon: 'fas fa-exchange-alt', label: 'GV trực thay', value: thay ? `<span style="color:var(--warning);font-weight:600;">${thay.ho_ten}</span>` : '—' },
        { icon: 'fas fa-check-circle', label: 'Xác nhận', value: shift.xac_nhan_truc
            ? '<span class="badge badge-success">Đã xác nhận</span>'
            : '<span class="badge badge-danger">Chưa xác nhận</span>' },
    ];

    const body = document.getElementById('shiftDetailBody');
    if (body) {
        body.innerHTML = rows.map(r => `
        <div class="shift-detail-row">
            <div class="shift-detail-icon"><i class="${r.icon}"></i></div>
            <div>
                <div class="shift-detail-label">${r.label}</div>
                <div class="shift-detail-value">${r.value}</div>
            </div>
        </div>`).join('');
    }

    detailModal.open();
}

/* ── Controls ── */
function _bindControls() {
    document.getElementById('btn-prev')?.addEventListener('click', () => {
        currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        _renderCalendar();
    });
    document.getElementById('btn-next')?.addEventListener('click', () => {
        currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        _renderCalendar();
    });
    document.getElementById('btn-today')?.addEventListener('click', () => {
        const t = new Date(); currentYear = t.getFullYear(); currentMonth = t.getMonth();
        _renderCalendar();
    });
    document.getElementById('filter-ca')?.addEventListener('change', (e) => { filterCa = e.target.value; _renderCalendar(); });
    document.getElementById('filter-gv')?.addEventListener('change', (e) => { filterGv = e.target.value; _renderCalendar(); });

    document.getElementById('btn-del-shift')?.addEventListener('click', async () => {
        if (!selectedShift) return;
        const ok = await Confirm.ask('Xóa ca trực?', `Xóa ca trực ngày ${Utils.formatDate(selectedShift.ngay)} phòng ${selectedShift.ma_phong}?`);
        if (ok) {
            const idx = MOCK_SCHEDULES.findIndex(s => s.id === selectedShift.id);
            if (idx !== -1) MOCK_SCHEDULES.splice(idx, 1);
            detailModal.close();
            _renderCalendar();
            Toast.success('Đã xóa ca trực');
        }
    });
}
