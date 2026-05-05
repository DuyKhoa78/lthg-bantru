/* ============================================================
   BAOCAO.JS – Thống kê & báo cáo điểm danh
   Load dữ liệu thực từ CSDL qua /api/baocao/full/
   ============================================================ */
'use strict';
const VN_TZ = 'Asia/Ho_Chi_Minh';

/* ── Data từ API ── */
let BC_STUDENTS = [];
let BC_RECORDS = [];
let _dataLoaded = false;

/* ── State ── */
let scope      = 'ngay';
let currentDate = _localToday();
let chartDonut, chartBar, chartLine;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
    _initDateControls();
    _initTimeTabs();
    _initExport();

    // Load dữ liệu thực từ CSDL
    await _loadDataFromDB();

    _initFilterLop();
    _refresh();
});

/* ── Load data từ API ── */
async function _loadDataFromDB() {
    try {
        const res = await fetch('/api/baocao/full/');
        if (!res.ok) throw new Error('API error: ' + res.status);
        const data = await res.json();

        BC_STUDENTS = data.students || [];
        BC_RECORDS  = data.records  || [];

        // Populate filter dropdowns
        _populateFilters(data);
        _dataLoaded = true;
        console.log(`[Báo cáo] Loaded ${BC_STUDENTS.length} HS, ${BC_RECORDS.length} records`);
    } catch (err) {
        console.error('[Báo cáo] Lỗi load dữ liệu:', err);
        BC_STUDENTS = [];
        BC_RECORDS  = [];
    }
}

/* ── Populate filter dropdowns from DB data ── */
function _populateFilters(data) {
    // Phòng ăn
    const phongAnSel = document.getElementById('f-phong-an');
    if (phongAnSel && data.phong_an_list) {
        phongAnSel.innerHTML = '<option value="">Tất cả</option>' +
            data.phong_an_list.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // Phòng ngủ
    const phongNguSel = document.getElementById('f-phong-ngu');
    if (phongNguSel && data.phong_ngu_list) {
        phongNguSel.innerHTML = '<option value="">Tất cả</option>' +
            data.phong_ngu_list.map(p => `<option value="${p}">${p}</option>`).join('');
    }
}

/* ── Date Controls ── */
function _initDateControls() {
    const dateInput  = document.getElementById('bc-date');
    const monthInput = document.getElementById('bc-month');
    if (dateInput)  { dateInput.value = currentDate;
        dateInput.addEventListener('change', e => { currentDate = e.target.value; _refresh(); }); }
    if (monthInput) { monthInput.value = currentDate.slice(0,7);
        monthInput.addEventListener('change', e => { currentDate = e.target.value + '-01'; _refresh(); }); }

    document.getElementById('bc-today')?.addEventListener('click', () => {
        currentDate = _localToday();
        if (scope === 'thang') document.getElementById('bc-month').value = currentDate.slice(0,7);
        else document.getElementById('bc-date').value = currentDate;
        _refresh();
    });

    document.getElementById('bc-prev')?.addEventListener('click', () => { _shiftDate(-1); });
    document.getElementById('bc-next')?.addEventListener('click', () => { _shiftDate(1); });
    document.getElementById('bc-apply')?.addEventListener('click', () => _refresh());
}
function _shiftDate(dir) {
    const dt = new Date(currentDate + 'T12:00:00');
    if (scope === 'thang') dt.setMonth(dt.getMonth() + dir);
    else if (scope === 'tuan') dt.setDate(dt.getDate() + dir * 7);
    else dt.setDate(dt.getDate() + dir);
    currentDate = _localDateStr(dt);
    document.getElementById('bc-date').value  = currentDate;
    document.getElementById('bc-month').value = currentDate.slice(0,7);
    _refresh();
}

/* ── Time Tabs ── */
function _initTimeTabs() {
    document.querySelectorAll('.bc-time-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.bc-time-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            scope = tab.dataset.scope;
            const dateEl  = document.getElementById('bc-date');
            const monthEl = document.getElementById('bc-month');
            const weekLbl = document.getElementById('bc-week-label');
            if (scope === 'thang') {
                dateEl.style.display = 'none'; monthEl.style.display = 'block'; weekLbl.style.display = 'none';
            } else if (scope === 'tuan') {
                dateEl.style.display = 'none'; monthEl.style.display = 'none'; weekLbl.style.display = 'block';
            } else {
                dateEl.style.display = 'block'; monthEl.style.display = 'none'; weekLbl.style.display = 'none';
            }
            _refresh();
        });
    });
}

/* ── Filter Lớp ── */
function _initFilterLop() {
    const lopSel  = document.getElementById('f-lop');
    const khoiSel = document.getElementById('f-khoi');
    const classes = [...new Set(BC_STUDENTS.map(s => s.lop))].sort();

    function buildLop(khoi = '') {
        lopSel.innerHTML = '<option value="">Tất cả</option>';
        classes.filter(c => !khoi || c.startsWith(khoi)).forEach(c => {
            const o = document.createElement('option'); o.value = c; o.textContent = c;
            lopSel.appendChild(o);
        });
    }
    buildLop();

    // Auto-refresh khi bất kỳ bộ lọc thay đổi
    khoiSel?.addEventListener('change', e => { buildLop(e.target.value); _refresh(); });
    lopSel?.addEventListener('change', () => _refresh());
    document.getElementById('f-phong-an')?.addEventListener('change',  () => _refresh());
    document.getElementById('f-phong-ngu')?.addEventListener('change', () => _refresh());
}

/* ── Core Refresh ── */
function _refresh() {
    if (!_dataLoaded && BC_STUDENTS.length === 0) return; // chưa load xong

    const dates   = _getDatesInScope();
    const khoi     = document.getElementById('f-khoi')?.value      || '';
    const lop      = document.getElementById('f-lop')?.value       || '';
    const phongAn  = document.getElementById('f-phong-an')?.value  || '';
    const phongNgu = document.getElementById('f-phong-ngu')?.value || '';

    let students = BC_STUDENTS.filter(s =>
        (!khoi    || s.khoi      === khoi)    &&
        (!lop     || s.lop       === lop)     &&
        (!phongAn  || s.phong_an  === phongAn) &&
        (!phongNgu || s.phong_ngu === phongNgu)
    );

    const recs    = BC_RECORDS.filter(r => dates.includes(r.ngay));
    const total   = students.length;
    const days    = dates.length;

    // Per-student aggregates
    const studentStats = students.map(s => {
        const sRecs = recs.filter(r => r.ma_hs === s.id);
        return {
            ...s,
            vang_an:  sRecs.filter(r => r.diem_danh_an  === 1).length,
            vang_ngu: sRecs.filter(r => r.diem_danh_ngu === 1).length,
            phep:     sRecs.filter(r => r.diem_danh_an  === 2 || r.diem_danh_ngu === 2).length,
            sessions: days * 2,
        };
    });

    // Summary metrics
    const totalVangAn  = studentStats.reduce((a,s) => a + s.vang_an, 0);
    const totalVangNgu = studentStats.reduce((a,s) => a + s.vang_ngu, 0);
    const totalPhep    = studentStats.reduce((a,s) => a + s.phep, 0);
    const totalComat   = total * days - totalVangAn;

    const pct = v => total && days ? Math.round((1 - v/(total*days)) * 100) : 100;

    _set('m-total',       total);
    _set('m-total-sub',   `${days} ngày`);
    _set('m-comat-an',    totalComat);
    _set('m-comat-an-pct', pct(totalVangAn) + '% chuyên cần');
    _set('m-vang',        totalVangAn + totalVangNgu);
    _set('m-vang-pct',    `${total && days ? Math.round((totalVangAn+totalVangNgu)/(total*days*2)*100) : 0}% tổng buổi`);
    _set('m-phep',        totalPhep);
    _set('m-phep-pct',    '');

    // Khối breakdowns
    ['10','11','12'].forEach(k => {
        const ks = studentStats.filter(s => s.khoi === k);
        const kt = ks.length;
        _set(`k${k}-total`, kt);
        if (!kt) {
            _set(`k${k}-vang-an`, 0);
            _set(`k${k}-vang-ngu`, 0);
            _set(`k${k}-phep`, 0);
            _set(`k${k}-pct`, '0%');
            const bar = document.getElementById(`k${k}-bar`);
            if (bar) bar.style.width = '0%';
            return;
        }
        const kVangAn  = ks.reduce((a,s) => a+s.vang_an, 0);
        const kVangNgu = ks.reduce((a,s) => a+s.vang_ngu, 0);
        const kPhep    = ks.reduce((a,s) => a+s.phep, 0);
        const kPct     = kt && days ? Math.max(0, Math.round((1 - kVangAn/(kt*days))*100)) : 100;
        _set(`k${k}-total`, kt);
        _set(`k${k}-vang-an`, kVangAn);
        _set(`k${k}-vang-ngu`, kVangNgu);
        _set(`k${k}-phep`, kPhep);
        _set(`k${k}-pct`, kPct + '%');
        const bar = document.getElementById(`k${k}-bar`);
        if (bar) bar.style.width = kPct + '%';
    });

    _renderCharts(studentStats, dates);
    _renderRankTable(studentStats);
    _renderDetailTable(studentStats);
}

function _getDatesInScope() {
    const d = new Date(currentDate + 'T12:00:00');
    if (scope === 'ngay') return [currentDate];
    if (scope === 'tuan') {
        const day = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
        const out = [];
        for (let i = 0; i < 7; i++) {
            const dd = new Date(mon); dd.setDate(mon.getDate() + i);
            out.push(_localDateStr(dd));
        }
        const weekLbl = document.getElementById('bc-week-label');
        if (weekLbl) weekLbl.textContent = `${Utils.formatDate(out[0])} – ${Utils.formatDate(out[6])}`;
        return out;
    }
    // tháng
    const y = d.getFullYear(), m = d.getMonth();
    const days = new Date(y, m+1, 0).getDate();
    return Array.from({length: days}, (_, i) => {
        const dd = new Date(y, m, i+1);
        return _localDateStr(dd);
    });
}

/* ── Charts ── */
function _renderCharts(stats, dates) {
    const totalComat = stats.reduce((a,s) => a + (dates.length - s.vang_an), 0);
    const totalVang  = stats.reduce((a,s) => a + s.vang_an, 0);
    const totalPhep  = stats.reduce((a,s) => a + s.phep, 0);

    // Donut
    const donutCtx = document.getElementById('chart-donut');
    if (donutCtx) {
        chartDonut?.destroy();
        chartDonut = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Có mặt', 'Vắng', 'Phép'],
                datasets: [{ data: [totalComat, totalVang, totalPhep],
                    backgroundColor: ['#00b894','#e17055','#fdcb6e'],
                    borderWidth: 0, hoverOffset: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } } } }
        });
    }

    // Bar: 7 ngày gần nhất
    const barCtx = document.getElementById('chart-bar');
    if (barCtx) {
        const last7 = [...dates].reverse().slice(0, 7).reverse();
        const barData = last7.map(dt =>
            stats.reduce((a, s) => a + (BC_RECORDS.find(r => r.ma_hs === s.id && r.ngay === dt)?.diem_danh_an === 1 ? 1 : 0), 0)
        );
        chartBar?.destroy();
        chartBar = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: last7.map(d => Utils.formatDate(d)),
                datasets: [{
                    label: 'Vắng ăn', data: barData,
                    backgroundColor: 'rgba(225,112,85,0.75)', borderRadius: 6,
                }, {
                    label: 'Có phép',
                    data: last7.map(dt => stats.reduce((a,s) => a + (BC_RECORDS.find(r => r.ma_hs===s.id && r.ngay===dt)?.diem_danh_an===2?1:0), 0)),
                    backgroundColor: 'rgba(253,203,110,0.75)', borderRadius: 6,
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

    // Line: trend theo ngày trong tháng
    const lineCtx = document.getElementById('chart-line');
    if (lineCtx) {
        const monthDates = _getDatesInScope().filter(d => new Date(d).getDay() !== 0);
        const lineData   = monthDates.map(dt =>
            stats.reduce((a,s) => a + (BC_RECORDS.find(r=>r.ma_hs===s.id&&r.ngay===dt)?.diem_danh_an===1?1:0), 0));
        chartLine?.destroy();
        chartLine = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: monthDates.map(d => Utils.formatDate(d)),
                datasets: [{ label: 'Vắng ăn', data: lineData, borderColor:'#e17055',
                    backgroundColor:'rgba(225,112,85,0.10)', fill:true, tension:0.4, pointRadius:3 }]
            },
            options: { responsive: true, plugins:{ legend:{ position:'top' } },
                scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
        });
    }
}

/* ── Rank Table ── */
function _renderRankTable(stats) {
    const tbody = document.getElementById('bc-rank-tbody');
    if (!tbody) return;
    const byLop = {};
    stats.forEach(s => {
        if (!byLop[s.lop]) byLop[s.lop] = { lop: s.lop, total:0, vang_an:0, vang_ngu:0, phep:0 };
        byLop[s.lop].total++;
        byLop[s.lop].vang_an  += s.vang_an;
        byLop[s.lop].vang_ngu += s.vang_ngu;
        byLop[s.lop].phep     += s.phep;
    });
    const rows = Object.values(byLop).sort((a,b) => (b.vang_an - a.vang_an));
    tbody.innerHTML = rows.map((r, i) => {
        const pct = Math.round((1 - r.vang_an / Math.max(r.total, 1)) * 100);
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        return `<tr>
            <td><strong>${medal}</strong></td>
            <td><span class="badge badge-primary">${r.lop}</span></td>
            <td>${r.total}</td>
            <td><span class="badge badge-vang">${r.vang_an}</span></td>
            <td><span class="badge badge-vang">${r.vang_ngu}</span></td>
            <td><span class="badge badge-phep">${r.phep}</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="progress" style="flex:1;"><div class="progress-bar ${pct>=80?'green':pct>=60?'yellow':'red'}" style="width:${pct}%"></div></div>
                    <span style="font-weight:700;font-size:0.82rem;">${pct}%</span>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ── Detail Table ── */
function _renderDetailTable(stats) {
    const tbody = document.getElementById('bc-detail-tbody');
    if (!tbody) return;

    // ─ Dòng tóm tắt bộ lọc hiện tại ─
    const khoi     = document.getElementById('f-khoi')?.value      || '';
    const lop      = document.getElementById('f-lop')?.value       || '';
    const phongAn  = document.getElementById('f-phong-an')?.value  || '';
    const phongNgu = document.getElementById('f-phong-ngu')?.value || '';

    // Xây dựng nhãn period
    let periodLabel = '';
    if (scope === 'ngay') {
        periodLabel = `Ngày: <strong>${Utils.formatDate(currentDate)}</strong>`;
    } else if (scope === 'tuan') {
        const wl = document.getElementById('bc-week-label')?.textContent || '';
        periodLabel = `Tuần: <strong>${wl}</strong>`;
    } else {
        periodLabel = `Tháng: <strong>${currentDate.slice(0,7)}</strong>`;
    }

    // Tag bộ lọc chủ động
    const tags = [periodLabel];
    if (khoi)    tags.push(`Khối <span class="badge badge-primary">${khoi}</span>`);
    if (lop)     tags.push(`Lớp <span class="badge badge-primary">${lop}</span>`);
    if (phongAn) tags.push(`Phòng ăn <span class="badge badge-info">${phongAn}</span>`);
    if (phongNgu) tags.push(`Phòng ngủ <span class="badge badge-info">${phongNgu}</span>`);
    tags.push(`<span style="color:var(--text-muted)">&mdash; <strong>${stats.length}</strong> học sinh</span>`);

    // Cập nhật thanh tóm tắt ngày trên bảng
    let summaryEl = document.getElementById('bc-detail-summary');
    if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'bc-detail-summary';
        summaryEl.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 14px;background:var(--bg-light);border-radius:8px;font-size:.82rem;margin-bottom:10px;';
        const wrap = document.getElementById('bc-detail-table-wrap');
        wrap?.parentNode.insertBefore(summaryEl, wrap);
    }
    summaryEl.innerHTML = `<i class="fas fa-filter" style="color:var(--primary-color);"></i> ${tags.join('<span style="color:var(--gray-200);margin:0 2px;">|</span>')}`;

    // Render rows
    tbody.innerHTML = stats.map((s, i) => `<tr>
        <td style="text-align:center;color:var(--text-muted);font-weight:600;">${i+1}</td>
        <td style="font-weight:600">${s.ho_ten}</td>
        <td><span class="badge badge-primary">${s.lop}</span></td>
        <td style="text-align:center;">${s.phong_an}</td>
        <td style="text-align:center;">${s.phong_ngu}</td>
        <td style="text-align:center;">${s.vang_an  > 0 ? `<span class="badge badge-vang">${s.vang_an}</span>`  : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:center;">${s.vang_ngu > 0 ? `<span class="badge badge-vang">${s.vang_ngu}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:center;">${s.phep     > 0 ? `<span class="badge badge-phep">${s.phep}</span>`    : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`).join('');
}

/* ── Export ── */
function _initExport() {
    [['btn-export-excel','btn-export-excel2']].flat().forEach(id => {
        document.getElementById(id)?.addEventListener('click', _exportExcel);
    });
    [['btn-export-pdf','btn-export-pdf2']].flat().forEach(id => {
        document.getElementById(id)?.addEventListener('click', _exportPdf);
    });
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
}

function _exportExcel() {
    const table = document.getElementById('bc-detail-table');
    if (!table || !window.XLSX) { Toast.warning('Thư viện XLSX chưa tải.'); return; }
    const wb = XLSX.utils.table_to_book(table, { sheet: 'BaoCao' });
    XLSX.writeFile(wb, `BaoCao_DiemDanh_${Utils.today()}.xlsx`);
    Toast.success('Xuất Excel thành công!');
}

function _exportPdf() {
    if (!window.jspdf) { Toast.warning('Thư viện jsPDF chưa tải.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('BÁO CÁO ĐIỂM DANH – THPT LÊ THỊ HỒNG GẤM', 14, 15);
    doc.setFontSize(10);
    doc.text(`Ngày xuất: ${Utils.formatDate(Utils.today())}`, 14, 23);
    doc.autoTable({ html: '#bc-detail-table', startY: 28, styles: { fontSize: 8 } });
    doc.save(`BaoCao_DiemDanh_${Utils.today()}.pdf`);
    Toast.success('Xuất PDF thành công!');
}

/* ── Helpers ── */

function _localToday() {
    // Lấy ngày hiện tại theo múi giờ Việt Nam (GMT+7)
    const now = new Date();
    const vnStr = now.toLocaleDateString('en-CA', { timeZone: VN_TZ }); // 'en-CA' → YYYY-MM-DD
    return vnStr;
}
function _localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
