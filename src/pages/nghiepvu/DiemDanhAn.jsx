import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { useAlert } from '../../hooks/useAlert.jsx';
import { removeAccents } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './DiemDanh.css';

const STATUS_MAP = { 0: 'comat', 1: 'vang', 2: 'phep' };
const INV_STATUS_MAP = { 'comat': 0, 'vang': 1, 'phep': 2 };
const STATUS = {
  comat: { label: 'Có mặt', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  vang:  { label: 'Vắng',   bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
  phep:  { label: 'Có phép',bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
};

// ── Helpers export ────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const addDL = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getWeekDays = (baseDate, inclT5) => {
  const d = new Date(baseDate + 'T00:00:00');
  const mon = addDL(d, d.getDay() === 0 ? -6 : 1 - d.getDay());
  return [0,1,2,3,4].map(i => addDL(mon, i)).filter(x => x.getDay() !== 4 || inclT5);
};
const DOWS = ['CN','T2','T3','T4','T5','T6','T7'];


export default function DiemDanhAn() {
  const today = new Date().toISOString().slice(0, 10);
  const { showAlert, AlertUI } = useAlert();
  const [date, setDate]               = useState(today);
  const [phongList, setPhongList]     = useState([]);
  const [hsList, setHsList]           = useState([]);
  const [diemDanhDb, setDiemDanhDb]   = useState({});
  const [selectedPhong, setSelectedPhong] = useState(null);
  const [overrides, setOverrides]     = useState({});
  const [saved, setSaved]             = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [searchTerm, setSearchTerm]   = useState('');
  
  // Monthly Export States
  const [showMonthExportModal, setShowMonthExportModal] = useState(false);
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportWeeksActive, setExportWeeksActive] = useState([0, 1, 2, 3]); // which of the 4 weeks to include
  const [exportWeeksT5, setExportWeeksT5] = useState([]);
  const [exportRooms, setExportRooms] = useState([]);

  const [nguoiPhuTrach, setNguoiPhuTrach] = useState('Người phụ trách');

  useEffect(() => {
    Promise.all([api.get('/api/phong/an'), api.get('/api/hocsinh/an'), api.get('/api/cauhinh/').catch(() => ({ data: { ok: false } }))])
      .then(([pRes, hRes, cRes]) => {
        if (pRes.data?.ok) setPhongList(pRes.data.phong);
        if (hRes.data?.ok) setHsList(hRes.data.hocsinh);
        if (cRes.data?.ok && cRes.data.he_thong) setNguoiPhuTrach(cRes.data.he_thong.nguoi_phu_trach || 'Người phụ trách');
      }).catch(console.error);
  }, []);

  const fetchDiemDanh = useCallback((d) => {
    setLoading(true);
    api.get(`/api/diemdanh/?ngay=${d}&loai=an`)
      .then(res => {
        if (res.data?.ok) {
          const map = {};
          res.data.records.forEach(r => { if (r.diem_danh_an !== null) map[r.ma_hs_id] = r.diem_danh_an; });
          setDiemDanhDb(map);
        }
      }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDiemDanh(date);
    setOverrides({});
    setSaved(false);
  }, [date, fetchDiemDanh]);

  const students = useMemo(() => {
    if (!selectedPhong) return [];
    return hsList.filter(hs => hs.phong_an === selectedPhong.ma_phong).map(s => ({
      ...s,
      trang_thai: overrides[s.id] ?? (diemDanhDb[s.id] !== undefined ? STATUS_MAP[diemDanhDb[s.id]] : 'comat')
    }));
  }, [selectedPhong, hsList, diemDanhDb, overrides]);

  const roomStats = useMemo(() => {
    let markedCount = 0;
    const markedRooms = new Set();
    phongList.forEach(p => {
      const hsTrongPhong = hsList.filter(hs => hs.phong_an === p.ma_phong);
      if (hsTrongPhong.length === 0) return;
      if (hsTrongPhong.some(hs => diemDanhDb[hs.id] !== undefined)) {
        markedCount++;
        markedRooms.add(p.ma_phong);
      }
    });
    return { markedCount, unmarkedCount: phongList.length - markedCount, markedRooms };
  }, [phongList, hsList, diemDanhDb]);

  const changeStatus = (id, st) => { setOverrides(p => ({ ...p, [id]: st })); setSaved(false); };
  const setAll = (st) => { const o = {}; students.forEach(s => { o[s.id] = st; }); setOverrides(o); setSaved(false); };

  const handleSave = async () => {
    if (!selectedPhong || students.length === 0) return;
    setSaving(true);
    try {
      const records = students.map(s => ({ ma_hs: s.id, ngay: date, status: INV_STATUS_MAP[s.trang_thai] }));
      await api.post('/api/diemdanh/save/', { loai: 'an', records });
      setSaved(true);
      fetchDiemDanh(date);
      setOverrides({});
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lỗi khi lưu điểm danh');
    } finally { setSaving(false); }
  };

  const counts = students.reduce((acc, s) => { acc[s.trang_thai] = (acc[s.trang_thai] || 0) + 1; return acc; }, {});

  // ── Helper: tính tất cả các tuần có ngày làm việc trong tháng (5 tuần nếu cần) ───────
  const computeWeekMondayStrs = (month, year) => {
    let firstMon = new Date(year, month - 1, 1);
    const day = firstMon.getDay() || 7;
    firstMon.setDate(firstMon.getDate() - day + 1); // T2 đầu tiên trước/đúng ngày 1

    const lastDay = new Date(year, month, 0); // ngày cuối cùng của tháng
    const result = [];
    let cur = new Date(firstMon);
    while (cur <= lastDay) {
      result.push(cur.getFullYear() + '-' + p2(cur.getMonth() + 1) + '-' + p2(cur.getDate()));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return result;
  };

  // Label hiển thị cho mỗi tuần: "Tuần N: dd/MM – dd/MM"
  const weekLabelsForModal = useMemo(() => {
    return computeWeekMondayStrs(exportMonth, exportYear).map((monStr, i) => {
      const mon = new Date(monStr + 'T00:00:00');
      const fri = addDL(mon, 4);
      return `Tuần ${i + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)} – ${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportMonth, exportYear]);

  // Reset tất cả tuần active khi tháng/năm thay đổi
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportWeeksActive(weekLabelsForModal.map((_, i) => i));
    setExportWeeksT5([]);
  }, [weekLabelsForModal]);

  // Auto-detect tháng + tuần hiện tại khi mở modal
  useEffect(() => {
    if (!showMonthExportModal) return;
    const d = new Date(date + 'T00:00:00');
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportMonth(m);
    setExportYear(y);
    // Tính tuần chứa ngày hiện tại và chỉ active tuần đó (user có thể toggle thêm)
    const allMons = computeWeekMondayStrs(m, y);
    const dow = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
    const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
    const idx = allMons.indexOf(monStr);
    setExportWeeksActive(idx >= 0 ? [idx] : [0]);
    setExportWeeksT5([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonthExportModal, date]);

  // ── XUẤT EXCEL THEO THÁNG ──────────────────────────────────────────
  const exportMonthlyExcel = () => {
    if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng để xuất Excel!', 'warning');
    if (exportWeeksActive.length === 0) return showAlert('Vui lòng chọn ít nhất 1 tuần để xuất!', 'warning');

    const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
    const activeWeekIndices = allWeekMons.map((_, i) => i).filter(i => exportWeeksActive.includes(i));

    let allDays = [];
    activeWeekIndices.forEach(wIndex => {
      const inclT5 = exportWeeksT5.includes(wIndex);
      const wd = getWeekDays(allWeekMons[wIndex], inclT5);
      allDays = allDays.concat(wd);
    });
    
    const numDays = allDays.length;
    const NC = 6 + numDays + 4;

    const startDateStr = `${p2(allDays[0].getDate())}/${allDays[0].getMonth()+1}`;
    const endDateStr = `${p2(allDays[allDays.length-1].getDate())}/${allDays[allDays.length-1].getMonth()+1}/${exportYear}`;

    
    // Collect the T5 dates for the string
    const t5Dates = allDays.filter(d => d.getDay() === 4).map(d => `${d.getDate()}/${d.getMonth()+1}`);
    const t5Str = t5Dates.length > 0 ? `có học bù ${t5Dates.length} ngày thứ 5 (${t5Dates.join(' và ')})` : 'không học bù thứ 5';

    const wb = XLSX.utils.book_new();

    exportRooms.forEach(ma_phong => {
      const roomStudents = hsList.filter(s => s.phong_an === ma_phong);
      let aoa = [];
      let merges = [];

      aoa.push(['Phân hiệu THPT', '', 'ĐIỂM DANH ĂN TRƯA', ...Array(NC-3).fill('')]);
      aoa.push(['Lê Thị Hồng Gấm', '', `NĂM HỌC ${exportYear}-${exportYear+1}`, ...Array(NC-3).fill('')]);
      
      const r2 = ['Thời gian bắt đầu ăn 11g00 đến 11g35', '', 'Thời gian nghỉ trưa: 11g45 13g00', '', `THÁNG ${exportMonth}/${exportYear} (${startDateStr} - ${endDateStr})`, '', '', t5Str, '', '', `${numDays} buổi ăn`, ...Array(NC-11).fill('')];
      aoa.push(r2);
      
      aoa.push(['Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.', ...Array(NC-1).fill('')]);
      aoa.push(Array(NC).fill('')); // Empty note row

      const h1 = ['STT', 'STT\nDS BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'Phòng\nĂn'];
      const h2 = ['', '', '', '', '', ''];
      
      allDays.forEach(d => {
        h1.push(d.getDate() === allDays[0].getDate() ? `${d.getDate()}/${d.getMonth()+1}` : `${d.getDate()}`);
        h2.push(d.getDay() === 0 ? 'CN' : (d.getDay() + 1).toString());
      });
      
      h1.push('TS\nbuổi\năn', 'SB\nVắng\năn có', 'Số buổi\năn thực\ntế', 'Ghi\nchú');
      h2.push('', '', '', '');

      aoa.push(h1);
      aoa.push(h2);

      merges.push({s:{r:0,c:0},e:{r:0,c:1}}, {s:{r:0,c:2},e:{r:0,c:5}});
      merges.push({s:{r:1,c:0},e:{r:1,c:1}}, {s:{r:1,c:2},e:{r:1,c:5}});
      merges.push({s:{r:3,c:0},e:{r:3,c:NC-1}});

      // Headers merges
      for (let c = 0; c < 6; c++) merges.push({s:{r:5,c:c},e:{r:6,c:c}});
      for (let c = NC-4; c < NC; c++) merges.push({s:{r:5,c:c},e:{r:6,c:c}});

      roomStudents.forEach((s, i) => {
        const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
        aoa.push([i+1, i+1, s.ho_ten, gt, s.lop, ma_phong, ...Array(numDays).fill(''), numDays, numDays, numDays, '']);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      
      const cols = [{wch:5}, {wch:5}, {wch:26}, {wch:5}, {wch:7}, {wch:7}];
      for (let i=0; i<numDays; i++) cols.push({wch:4});
      cols.push({wch:6}, {wch:6}, {wch:8}, {wch:12});
      ws['!cols'] = cols;
      ws['!merges'] = merges;

      XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0,31));
    });

    XLSX.writeFile(wb, `DiemDanhAn_Thang${exportMonth}_${exportYear}.xlsx`);
    setShowMonthExportModal(false);
  };

  // ── XUẤT PDF THEO THÁNG ──────────────────────────────────────────
  const exportMonthlyPDF = () => {
    if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng để xuất PDF!', 'warning');
    
    if (exportWeeksActive.length === 0) return showAlert('Vui lòng chọn ít nhất 1 tuần để xuất!', 'warning');

    const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
    const activeWeekIndices = allWeekMons.map((_, i) => i).filter(i => exportWeeksActive.includes(i));

    const weeksData = activeWeekIndices.map(wIndex => {
      const inclT5 = exportWeeksT5.includes(wIndex);
      const wd = getWeekDays(allWeekMons[wIndex], inclT5);
      const mon = wd[0];
      const fri = wd[wd.length - 1];
      const label = `Tuần ${wIndex + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)}–${p2(fri.getDate())}/${p2(fri.getMonth()+1)}`;
      return { days: wd, label };
    });

    const totalDays = weeksData.reduce((s, w) => s + w.days.length, 0);
    const numCols   = 6 + totalDays + 5;

    const today    = new Date();
    const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`;
    const luuY     = `Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.`;

    const weekTH1 = weeksData.map(w =>
      `<th colspan="${w.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">${w.label}</th>`
    ).join('');

    const weekTH2 = weeksData.map(w =>
      w.days.map((d, di) =>
        `<th class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>${d.getDate()}/${p2(d.getMonth()+1)}<br><small>${DOWS[d.getDay()]}</small></th>`
      ).join('')
    ).join('');

    const htmlPages = exportRooms.map(ma_phong => {
      const roomStudents = hsList.filter(s => s.phong_an === ma_phong);
      const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
      const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
      const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;

      const dataRows = roomStudents.map((s, i) => {
        const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
        const dayCells = weeksData.map((_w) =>
          _w.days.map((d, di) =>
            `<td class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #555;"' : ''}></td>`
          ).join('')
        ).join('');
        return `<tr>
          <td class="col-stt-an">${i+1}</td>
          <td class="col-msbt-an">${s.id}</td>
          <td class="col-ten-an">${s.ho_ten}</td>
          <td class="col-gt-an">${gt}</td>
          <td class="col-lop-an">${s.lop}</td>
          <td class="col-phong-an">${s.phong_an || ma_phong}</td>
          ${dayCells}
          <td class="col-sum-an">${totalDays}</td>
          <td class="col-sum-an"></td>
          <td class="col-sum-an"></td>
          <td class="col-sum-an"></td>
          <td class="col-ghichu-an"></td>
        </tr>`;
      }).join('');

      return `<div class="room-block">
<table class="dt-an">
  <thead>
    <tr class="hdr-row-an"><td colspan="${numCols}">
      <table class="hdr-inner-an"><tr>
        <td class="hdr-school-an" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
        <td class="hdr-title-an"><h1>ĐIỂM DANH ĂN TRƯA</h1></td>
      </tr><tr>
        <td class="hdr-title-an">
          <h2>NĂM HỌC ${exportYear} – ${exportYear + 1}</h2>
          <div class="nh-an">Thời gian: 11g00–11g45 &nbsp;|&nbsp; Tháng ${exportMonth}/${exportYear} &nbsp;|&nbsp; Phòng ăn: ${ma_phong}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr class="ly-row-an"><td colspan="${numCols}">${luuY}</td></tr>
    <tr>
      <th rowspan="2" class="col-stt-an">ST<br>T</th>
      <th rowspan="2" class="col-msbt-an" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" class="col-ten-an">HỌC SINH</th>
      <th rowspan="2" class="col-gt-an">GT</th>
      <th rowspan="2" class="col-lop-an">LỚP</th>
      <th rowspan="2" class="col-phong-an">P.<br>ĂN</th>
      ${weekTH1}
      <th rowspan="2" class="col-sum-an">TS<br>Buổi ăn</th>
      <th rowspan="2" class="col-sum-an">SB<br>Vắng ăn</th>
      <th rowspan="2" class="col-sum-an">SB Vắng<br>ăn có P</th>
      <th rowspan="2" class="col-sum-an">Buổi ăn<br>thực tế</th>
      <th rowspan="2" class="col-ghichu-an">Ghi<br>chú</th>
    </tr>
    <tr>${weekTH2}</tr>
  </thead>
  <tbody>${dataRows}</tbody>
</table>
<div class="ft-wrap-an">
  <div class="ft-left-an">
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: <strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: <strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right-an">
    <div><em>${todayStr}</em></div>
    <div style="font-weight:bold;margin-top:2px;">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space-an"></div>
    <div style="font-weight:bold;font-style:italic;">${nguoiPhuTrach}</div>
  </div>
</div>
</div>`;
    }).join('');

    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.dt-an { width:100%; border-collapse:collapse; }
.dt-an thead tr.hdr-row-an td { border:none; padding:0; }
.dt-an thead tr.ly-row-an td  { border:none; padding:2px 4px; font-size:8pt; line-height:1.4; }
.hdr-inner-an { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner-an td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school-an { width:20%; text-align:center; font-size:8.5pt; line-height:1.6; }
.hdr-title-an  { text-align:center; }
.hdr-title-an h1 { font-size:13pt; font-weight:bold; text-transform:uppercase; }
.hdr-title-an h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title-an .nh-an { font-size:9pt; margin-top:2px; }
.dt-an th { border:0.8px solid #333; padding:2px 2px; text-align:center;
            background:#ececec; font-weight:bold; vertical-align:middle;
            font-size:8pt; line-height:1.2; color:#000; word-break:keep-all; }
.dt-an td { border:0.8px solid #555; padding:2px 2px; vertical-align:middle; color:#000; font-size:8pt; }
.col-stt-an    { width:4mm;  text-align:center; }
.col-msbt-an   { width:8mm;  text-align:center; font-weight:bold; }
.col-ten-an    { width:40mm; }
.col-gt-an     { width:7mm;  text-align:center; }
.col-lop-an    { width:10mm; text-align:center; }
.col-phong-an  { width:9mm;  text-align:center; }
.col-day-an    { width:6mm;  text-align:center; height:20px; white-space:nowrap; }
.col-sum-an    { width:13mm; text-align:center; font-weight:bold; background:#f0fff0; }
.col-ghichu-an { width:11mm; }
.ft-wrap-an { width:100%; margin-top:8px; font-size:8.5pt; display:flex; justify-content:space-between; page-break-inside:avoid; break-inside:avoid; }
.ft-left-an  { flex:1; }
.ft-right-an { flex:1; text-align:center; }
.sig-space-an { height:38px; }
.dt-an thead { display: table-row-group; }
@page { size: A4 landscape; margin: 0.8cm 0.8cm 1.2cm 1cm; }
@media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    * { color:#000 !important; }
    .dt-an th { background:#ececec !important; }
    .col-sum-an { background:#f0fff0 !important; }
    .dt-an thead { display: table-row-group !important; }
}`;

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}</style></head><body>
${htmlPages}
<script>window.onload=function(){setTimeout(window.print,400);}</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showAlert('Trình duyệt chặn popup! Vui lòng cho phép mở popup (cửa sổ bật lên).', 'warning');
      return;
    }
    w.document.write(html);
    w.document.close();
    setShowMonthExportModal(false);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Điểm danh ăn</span>
          </div>
          <h2><i className="fas fa-utensils" style={{color:'var(--primary)',marginRight:8}}></i>Điểm danh Ăn</h2>
          <p>Ghi nhận sĩ số học sinh ăn theo phòng &amp; ngày. Danh sách HS do Admin phân bổ.</p>
        </div>
        <div className="page-header-actions">
          <div className="dd-export-wrapper" style={{display: 'flex', alignItems: 'center'}}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowMonthExportModal(true)}>
              <i className="fas fa-file-pdf" style={{color:'#e53e3e'}}></i> Xuất DS (Tháng)
            </button>
            </div>
          <button className="btn btn-outline btn-sm"><i className="fas fa-table"></i> Chế độ nhập tuần</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll('vang')}><i className="fas fa-times"></i> Tất cả Vắng</button>
          <button className="btn btn-success btn-sm" onClick={() => setAll('comat')}><i className="fas fa-check-double"></i> Tất cả Có mặt</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!selectedPhong || saving}>
            {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${saved ? 'fa-check' : 'fa-save'}`}></i>}
            {saved ? ' Đã lưu!' : saving ? ' Đang lưu...' : ' Lưu điểm danh'}
          </button>
        </div>
      </div>

      <div className="stat-cards-row" style={{marginBottom:18}}>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>Có mặt</p><h3>{counts.comat||0}</h3></div></div>
        <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>Vắng</p><h3>{counts.vang||0}</h3></div></div>
        <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>Có phép</p><h3>{counts.phep||0}</h3></div></div>
      </div>

      <div className="dd-layout">
        <aside className="dd-room-panel">
          <div className="dd-room-panel-header"><i className="fas fa-utensils"></i> Phòng ăn</div>
          <div className="dd-date-picker">
            <label><i className="fas fa-calendar-day" style={{color:'var(--primary)',marginRight:4}}></i> Chọn ngày điểm danh</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="dd-room-stats">
            <span>Đã điểm: <span className="marked">{roomStats.markedCount}</span></span>
            <span>Chưa điểm: <span className="unmarked">{roomStats.unmarkedCount}</span></span>
          </div>
          <ul className="dd-room-list">
            {phongList.map(p => {
              const count = hsList.filter(hs => hs.phong_an === p.ma_phong).length;
              const isMarked = roomStats.markedRooms.has(p.ma_phong);
              return (
                <li key={p.ma_phong} className={`dd-room-item${selectedPhong?.ma_phong === p.ma_phong ? ' active' : ''}`} onClick={() => { setSelectedPhong(p); setOverrides({}); setSaved(false); }}>
                  <div className={`dd-room-status-icon ${isMarked ? 'marked' : 'unmarked'}`} title={isMarked ? 'Đã điểm danh' : 'Chưa điểm danh'}>
                    <i className={isMarked ? 'fas fa-check' : 'fas fa-exclamation'}></i>
                  </div>
                  <div className="dd-room-item-name"><i className="fas fa-door-open"></i>{p.ma_phong}</div>
                  <span className="dd-room-count">{count} HS</span>
                </li>
              );
            })}
            {phongList.length === 0 && <li style={{padding:12,color:'#94a3b8',textAlign:'center'}}>Không có phòng</li>}
          </ul>
        </aside>

        <div className="dd-main-panel">
          <div className="dd-main-header">
            <div className="dd-main-header-info">
              <h3>{selectedPhong ? `Phòng ${selectedPhong.ma_phong}` : 'Chọn phòng để xem'}</h3>
              <p>{selectedPhong ? `Ngày: ${new Date(date).toLocaleDateString('vi-VN')} — ${students.length} học sinh` : 'Nhấn vào phòng bên trái để bắt đầu điểm danh'}</p>
            </div>
            {selectedPhong && (
              <div className="dd-search-box">
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Tìm tên học sinh..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            )}
          </div>

          <div id="dd-student-area">
            {!selectedPhong ? (
              <div className="dd-empty"><i className="fas fa-hand-pointer"></i><h3>Chọn một phòng ăn</h3><p>Danh sách học sinh sẽ hiển thị tại đây</p></div>
            ) : loading ? (
              <div className="dd-empty" style={{color:'var(--primary)'}}><i className="fas fa-spinner fa-spin"></i><h3>Đang tải dữ liệu điểm danh...</h3></div>
            ) : students.length === 0 ? (
              <div className="dd-empty"><i className="fas fa-users-slash"></i><h3>Chưa có học sinh</h3><p>Phòng này chưa được xếp học sinh nào</p></div>
            ) : (
              <div className="dd-student-grid">
                {students.filter(s => {
                  if (!searchTerm) return true;
                  return removeAccents(s.ho_ten.toLowerCase()).includes(removeAccents(searchTerm.toLowerCase()));
                }).map(s => (
                  <div key={s.id} className={`dd-student-card status-${s.trang_thai}`}
                    style={{background: STATUS[s.trang_thai].bg, borderColor: STATUS[s.trang_thai].border}}>
                    <div className="dd-student-info">
                      <span className="dd-student-name">{s.ho_ten}</span>
                      <span className="dd-student-class">{s.lop}</span>
                    </div>
                    <div className="dd-status-btns">
                      {Object.entries(STATUS).map(([key, val]) => (
                        <button key={key}
                          className={`dd-status-btn${s.trang_thai === key ? ' active' : ''}`}
                          style={s.trang_thai === key ? {background:val.dot,color:'#fff',border:`1.5px solid ${val.dot}`} : {}}
                          onClick={() => changeStatus(s.id, key)} title={val.label}>
                          {key === 'comat' ? <i className="fas fa-check"></i> : key === 'vang' ? <i className="fas fa-times"></i> : <i className="fas fa-file-alt"></i>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedPhong && !loading && students.length > 0 && (
            <>
              <div className="dd-summary">
                <span className="dd-summary-item"><span className="dd-summary-dot dot-comat"></span> Có mặt: <strong>{counts.comat||0}</strong></span>
                <span className="dd-summary-item"><span className="dd-summary-dot dot-vang"></span> Vắng: <strong>{counts.vang||0}</strong></span>
                <span className="dd-summary-item"><span className="dd-summary-dot dot-phep"></span> Phép: <strong>{counts.phep||0}</strong></span>
              </div>
              <div className="dd-footer">
                <div className="dd-footer-note"><i className="fas fa-info-circle"></i> Trạng thái mặc định: <strong>Có mặt</strong>. Nhấn nút để thay đổi.</div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${saved ? 'fa-check' : 'fa-save'}`}></i>}
                  {saved ? ' Đã lưu!' : saving ? ' Đang lưu...' : ' Lưu điểm danh'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showMonthExportModal && (
        <div className="export-modal-overlay">
          <div className="export-modal">
            <div className="export-modal-header">
              <div className="icon"><i className="fas fa-file-pdf"></i></div>
              <div>
                <h3>Xuất PDF – Điểm danh Ăn theo tháng</h3>
                <p>Chọn tuần cần in (bỏ qua tuần nghỉ)</p>
              </div>
            </div>
            <div className="export-modal-body">
              <div className="export-modal-row">
                <div className="export-modal-group">
                  <div className="export-modal-section-title">THÁNG IN</div>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <select className="export-modal-select" value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}>
                      {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                    </select>
                    <span style={{color:'#64748b', fontWeight:600}}>/</span>
                    <select className="export-modal-select" value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                      {[...Array(5)].map((_, i) => {
                        const y = new Date().getFullYear() - 2 + i;
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── CHỌN TUẦN IN ─────────────────────────────── */}
              <div className="export-modal-group">
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                  <div className="export-modal-section-title" style={{margin:0}}>
                    <i className="fas fa-calendar-week" style={{color:'#6366f1'}}></i> CHỌN TUẦN IN
                  </div>
                  <div style={{display:'flex', gap:6}}>
                    <button
                      style={{fontSize:'0.72rem', padding:'2px 8px', borderRadius:4, border:'1px solid #6366f1', background:'#eef2ff', color:'#4f46e5', cursor:'pointer', fontWeight:600}}
                      onClick={() => setExportWeeksActive(weekLabelsForModal.map((_, i) => i))}>Chọn tất cả</button>
                    <button
                      style={{fontSize:'0.72rem', padding:'2px 8px', borderRadius:4, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#64748b', cursor:'pointer'}}
                      onClick={() => setExportWeeksActive([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px'}}>
                  {weekLabelsForModal.map((_, wIndex) => {
                    const active = exportWeeksActive.includes(wIndex);
                    return (
                      <label key={wIndex}
                        style={{
                          display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                          borderRadius:7, cursor:'pointer', userSelect:'none', transition:'all .15s',
                          background: active ? '#eef2ff' : '#f8fafc',
                          border: `1.5px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                          fontWeight: active ? 600 : 400,
                          color: active ? '#4f46e5' : '#64748b',
                        }}>
                        <input
                          type="checkbox"
                          checked={active}
                          style={{accentColor:'#6366f1'}}
                          onChange={e => {
                            if (e.target.checked) setExportWeeksActive(prev => [...prev, wIndex]);
                            else {
                              setExportWeeksActive(prev => prev.filter(w => w !== wIndex));
                              // Bỏ T5 của tuần bị bỏ chọn
                              setExportWeeksT5(prev => prev.filter(w => w !== wIndex));
                            }
                          }}
                        />
                        <span style={{fontSize:'0.82rem'}}>
                          <span style={{fontWeight:700}}>{weekLabelsForModal[wIndex]?.split(':')[0]}</span>
                          <span style={{fontWeight:400, fontSize:'0.75rem', marginLeft:4, color: active ? '#6366f1' : '#94a3b8'}}>
                            {weekLabelsForModal[wIndex]?.split(': ')[1]}
                          </span>
                        </span>
                        {!active && (
                          <span style={{marginLeft:'auto', fontSize:'0.68rem', background:'#fee2e2', color:'#dc2626', padding:'1px 5px', borderRadius:3, fontWeight:600}}>Nghỉ</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ── DẠY BÙ THỨ NĂM ──────────────────────────── */}
              <div className="export-modal-group">
                <div className="export-modal-section-title">
                  <i className="fas fa-calendar-plus" style={{color:'#10b981'}}></i> DẠY BÙ THỨ NĂM (T5)
                </div>
                <div className="export-t5-box">
                  <div className="export-t5-grid">
                    {weekLabelsForModal.map((_, i) => i).filter(i => exportWeeksActive.includes(i)).map(wIndex => (
                      <label key={wIndex} className="export-t5-label">
                        <input type="checkbox" checked={exportWeeksT5.includes(wIndex)}
                          onChange={e => {
                            if (e.target.checked) setExportWeeksT5(prev => [...prev, wIndex]);
                            else setExportWeeksT5(prev => prev.filter(w => w !== wIndex));
                          }} />
                        {weekLabelsForModal[wIndex]?.split(':')[0] || `Tuần ${wIndex + 1}`}
                      </label>
                    ))}
                  </div>
                  <div style={{fontSize:'0.75rem', color:'#64748b', marginTop:10}}>
                    Tích vào tuần nào có lịch dạy bù Thứ Năm
                  </div>
                </div>
              </div>

              <div className="export-modal-group">
                <div className="export-room-header">
                  <div className="export-modal-section-title" style={{margin:0}}>CHỌN PHÒNG</div>
                  <div className="export-room-actions">
                    <button onClick={() => setExportRooms(phongList.map(p => p.ma_phong))}>Chọn tất cả</button>
                    <div className="divider"></div>
                    <button className="deselect" onClick={() => setExportRooms([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div className="export-room-grid">
                  {phongList.map(p => (
                    <div key={p.ma_phong}
                      className={`export-room-pill ${exportRooms.includes(p.ma_phong) ? 'selected' : ''}`}
                      onClick={() => setExportRooms(prev => prev.includes(p.ma_phong) ? prev.filter(r => r !== p.ma_phong) : [...prev, p.ma_phong])}
                    >
                      {p.ma_phong}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowMonthExportModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={exportMonthlyExcel} style={{background:'#10b981', borderColor:'#10b981'}}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              <button className="btn btn-primary" onClick={exportMonthlyPDF} style={{background:'#ef4444', borderColor:'#ef4444'}}><i className="fas fa-file-pdf"></i> Xuất PDF</button>
            </div>
          </div>
        </div>
      )}
      {AlertUI}
    </>
  );
}
