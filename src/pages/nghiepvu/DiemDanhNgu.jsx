import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { useAlert } from '../../hooks/useAlert.jsx';
import { removeAccents } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './DiemDanh.css';

const STATUS_MAP = {
  0: 'comat',
  1: 'vang',
  2: 'phep'
};
const INV_STATUS_MAP = {
  'comat': 0,
  'vang': 1,
  'phep': 2
};

const STATUS = {
  comat: { label: 'Có mặt', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  vang:  { label: 'Vắng',   bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
  phep:  { label: 'Có phép',bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
};

export default function DiemDanhNgu() {
  const today = new Date().toISOString().slice(0, 10);
  const { showAlert, AlertUI } = useAlert();
  const [date, setDate] = useState(today);
  const [phongList, setPhongList] = useState([]);
  const [hsList, setHsList] = useState([]);
  const [diemDanhDb, setDiemDanhDb] = useState({}); // { [hsId]: 0|1|2 }

  const [selectedPhong, setSelectedPhong] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Week Export States
  const [showMonthExportModal, setShowMonthExportModal] = useState(false);
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportSelectedWeek, setExportSelectedWeek] = useState(0); // single week index
  const [exportT5, setExportT5] = useState(false);               // T5 for that week
  const [exportRooms, setExportRooms] = useState([]);

  const [nguoiPhuTrach, setNguoiPhuTrach] = useState('Người phụ trách');
  const [namHocCauHinh, setNamHocCauHinh] = useState('2025-2026');


  // Load phòng & học sinh (1 lần)
  useEffect(() => {
    Promise.all([
      api.get('/api/phong/ngu'),
      api.get('/api/hocsinh/ngu'),
      api.get('/api/cauhinh/').catch(() => ({ data: { ok: false } }))
    ]).then(([pRes, hRes, cRes]) => {
      if (pRes.data?.ok) setPhongList(pRes.data.phong);
      if (hRes.data?.ok) setHsList(hRes.data.hocsinh);
      if (cRes.data?.ok && cRes.data.he_thong) {
        setNguoiPhuTrach(cRes.data.he_thong.nguoi_phu_trach || 'Người phụ trách');
        setNamHocCauHinh(cRes.data.he_thong.nam_hoc || '2025-2026');
      }
    }).catch(console.error);
  }, []);

  // Fetch lịch sử điểm danh theo ngày
  const fetchDiemDanh = useCallback((d) => {
    setLoading(true);
    api.get(`/api/diemdanh/?ngay=${d}&loai=ngu`)
      .then(res => {
        if (res.data?.ok) {
          const map = {};
          res.data.records.forEach(r => {
            // diem_danh_ngu: 0(comat), 1(vang), 2(phep)
            if (r.diem_danh_ngu !== null) map[r.ma_hs_id] = r.diem_danh_ngu;
          });
          setDiemDanhDb(map);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDiemDanh(date);
    setOverrides({});
    setSaved(false);
  }, [date, fetchDiemDanh]);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const fn = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, []);

  // Logic hiển thị học sinh theo phòng đang chọn
  const students = useMemo(() => {
    if (!selectedPhong) return [];
    const base = hsList.filter(hs => hs.phong_ngu === selectedPhong.ma_phong);
    return base.map(s => {
      const dbStatusStr = diemDanhDb[s.id] !== undefined ? STATUS_MAP[diemDanhDb[s.id]] : 'comat';
      return {
        ...s,
        trang_thai: overrides[s.id] ?? dbStatusStr
      };
    });
  }, [selectedPhong, hsList, diemDanhDb, overrides]);

  const roomStats = useMemo(() => {
    let markedCount = 0;
    const markedRooms = new Set();
    phongList.forEach(p => {
      const hsTrongPhong = hsList.filter(hs => hs.phong_ngu === p.ma_phong);
      if (hsTrongPhong.length === 0) return;
      if (hsTrongPhong.some(hs => diemDanhDb[hs.id] !== undefined)) {
        markedCount++;
        markedRooms.add(p.ma_phong);
      }
    });
    return { markedCount, unmarkedCount: phongList.length - markedCount, markedRooms };
  }, [phongList, hsList, diemDanhDb]);

  const changeStatus = (id, status) => { setOverrides(p => ({ ...p, [id]: status })); setSaved(false); };
  const setAll = (status) => {
    const o = {};
    students.forEach(s => { o[s.id] = status; });
    setOverrides(o); setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedPhong || students.length === 0) return;
    setSaving(true);
    try {
      const records = students.map(s => ({
        ma_hs: s.id,
        ngay: date,
        status: INV_STATUS_MAP[s.trang_thai],
      }));
      await api.post('/api/diemdanh/save/', { loai: 'ngu', records });
      setSaved(true);
      fetchDiemDanh(date); // reload from DB
      setOverrides({});
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lỗi khi lưu điểm danh');
    } finally {
      setSaving(false);
    }
  };

  const counts = students.reduce((acc, s) => { acc[s.trang_thai] = (acc[s.trang_thai] || 0) + 1; return acc; }, {});

  // ── Helpers export ─────────────────────────────────────
  const p2 = n => String(n).padStart(2,'0');
  const addDaysLocal = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
  const getWeekDays = (baseDate, inclT5) => {
    const d = new Date(baseDate+'T00:00:00');
    const dow = d.getDay();
    const monday = addDaysLocal(d, dow===0 ? -6 : 1-dow);
    return [0,1,2,3,4].map(i => addDaysLocal(monday,i))
      .filter(day => day.getDay()!==4 || inclT5);
  };
  const STATUS_CELL = { comat: '✓', vang: 'V', phep: 'P' };
  const todayLabel = () => { const t=new Date(); return `TP Hồ Chí Minh, ngày ${t.getDate()} tháng ${t.getMonth()+1} năm ${t.getFullYear()}`; };
  const LUU_Y_NGU = 'Lưu ý: KHÔNG được ra ngoài trong giờ nghỉ trưa; Nên đi vệ sinh trước giờ ngủ; KHÔNG ĂN-UỐNG, KHÔNG sử dụng điện thoại trong thời gian bán trú. HS vào sau 11g45 sẽ bị ghi nhận trễ.';

  // ── Helper tháng: tính tất cả các tuần (4-5 tuần) ─────────────────
  const computeWeekMondayStrs = (month, year) => {
    let firstMon = new Date(year, month - 1, 1);
    const day = firstMon.getDay() || 7;
    firstMon.setDate(firstMon.getDate() - day + 1);
    const lastDay = new Date(year, month, 0);
    const result = [];
    let cur = new Date(firstMon);
    while (cur <= lastDay) {
      result.push(cur.getFullYear() + '-' + p2(cur.getMonth()+1) + '-' + p2(cur.getDate()));
      cur = new Date(cur); cur.setDate(cur.getDate() + 7);
    }
    return result;
  };
  const weekLabelsForModal = useMemo(() => {
    return computeWeekMondayStrs(exportMonth, exportYear).map((monStr, i) => {
      const mon = new Date(monStr + 'T00:00:00');
      const fri = addDaysLocal(mon, 4);
      return `Tuần ${i+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)} – ${p2(fri.getDate())}/${p2(fri.getMonth()+1)}`;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportMonth, exportYear]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportSelectedWeek(0);
    setExportT5(false);
  }, [weekLabelsForModal]);

  // Auto-detect tuần hiện tại khi mở modal
  useEffect(() => {
    if (!showMonthExportModal) return;
    const d = new Date(date + 'T00:00:00');
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportMonth(m);
    setExportYear(y);
    const allMons = computeWeekMondayStrs(m, y);
    const dow = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
    const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
    const idx = allMons.indexOf(monStr);
    setExportSelectedWeek(idx >= 0 ? idx : 0);
    setExportT5(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonthExportModal, date]);

  // ── XUẤT EXCEL THEO TUẦN (NGỦ) ───────────────────────────────────
  const exportWeekExcel = () => {
    if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
    const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
    const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT5);
    const numDays = weekDays.length;
    const NC = 7 + numDays + 1;
    const mon = weekDays[0], fri = weekDays[weekDays.length - 1];
    const weekLabel = `Tuần ${exportSelectedWeek+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)} – ${p2(fri.getDate())}/${p2(fri.getMonth()+1)}/${exportYear}`;
    const yearStart = exportYear - (exportMonth < 8 ? 1 : 0);
    const wb = XLSX.utils.book_new();
    exportRooms.forEach(ma_phong => {
      const roomStudents = hsList.filter(s => s.phong_ngu === ma_phong);
      const h1 = ['STT','Mã\nsố BT','HỌ VÀ TÊN','GT','LỚP','P.\nNGỦ','P.\nĂN'];
      const h2 = ['','','','','','',''];
      weekDays.forEach(d => { h1.push(`${d.getDate()}/${d.getMonth()+1}`); h2.push(`T${d.getDay()===0?'CN':d.getDay()+1}`); });
      h1.push('Ghi\nchú'); h2.push('');
      const aoa = [
        ['Phân hiệu THPT Lê Thị Hồng Gấm','','','ĐIỂM DANH NGHỈ TRƯA',...Array(NC-4).fill('')],
        ['','','','3 KHỐI',...Array(NC-4).fill('')],
        ['','','',`NH: ${namHocCauHinh}`,...Array(NC-4).fill('')],
        [weekLabel,'','',LUU_Y_NGU,...Array(NC-4).fill('')],
        Array(NC).fill(''), h1, h2,
      ];
      roomStudents.forEach((s,i) => {
        aoa.push([i+1,s.id,s.ho_ten,s.gioi_tinh===0?'Nam':'Nữ',s.lop,s.phong_ngu||ma_phong,s.phong_an||'',...Array(numDays).fill(''),'']);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:5},{wch:9},{wch:28},{wch:5},{wch:7},{wch:7},{wch:7},...Array(numDays).fill({wch:5}),{wch:12}];
      ws['!merges'] = [
        {s:{r:0,c:0},e:{r:2,c:2}},{s:{r:0,c:3},e:{r:0,c:NC-1}},
        {s:{r:1,c:3},e:{r:1,c:NC-1}},{s:{r:2,c:3},e:{r:2,c:NC-1}},
        {s:{r:3,c:0},e:{r:3,c:2}},{s:{r:3,c:3},e:{r:3,c:NC-1}},
      ];
      XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0,31));
    });
    XLSX.writeFile(wb, `DiemDanhNgu_Tuan${exportSelectedWeek+1}_Thang${exportMonth}_${exportYear}.xlsx`);
    setShowMonthExportModal(false);
  };

  // ── XUẤT PDF THEO TUẦN (NGỦ) ─────────────────────────────────────
  const exportWeekPDF = () => {
    if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
    const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
    const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT5);
    const numDays = weekDays.length;
    const mon = weekDays[0], fri = weekDays[weekDays.length - 1];
    const weekLabel = `Tuần ${exportSelectedWeek+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)}–${p2(fri.getDate())}/${p2(fri.getMonth()+1)}`;
    const numCols = 7 + numDays + 1;
    const yearStart = exportYear - (exportMonth < 8 ? 1 : 0);
    const DOWS = ['CN','T2','T3','T4','T5','T6','T7'];
    const dayTH = weekDays.map((d,di) =>
      `<th class="col-day"${di===0?' style="border-left:1.5px solid #333;"':''}>${d.getDate()}/${p2(d.getMonth()+1)}<br><small>${DOWS[d.getDay()]}</small></th>`
    ).join('');
    const htmlPages = exportRooms.map(ma_phong => {
      const roomStudents = hsList.filter(s => s.phong_ngu === ma_phong);
      const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
      const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
      const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
      const dataRows = roomStudents.map((s,i) => {
        const gt = s.gioi_tinh===0?'Nam':'Nữ';
        const dayCells = weekDays.map((_d,di) =>
          `<td class="col-day"${di===0?' style="border-left:1.5px solid #555;"':''}></td>`).join('');
        return `<tr>
          <td class="col-stt">${i+1}</td><td class="col-msbt">${s.id}</td>
          <td style="text-align:left;padding-left:6px;">${s.ho_ten}</td>
          <td class="col-gt">${gt}</td><td class="col-lop">${s.lop}</td>
          <td class="col-phong">${s.phong_ngu||ma_phong}</td>
          <td class="col-phong">${s.phong_an||''}</td>
          ${dayCells}<td class="col-ghichu"></td>
        </tr>`;
      }).join('');
      return `<div class="room-block">
<table class="dt"><thead>
  <tr class="hdr-row"><td colspan="${numCols}">
    <table class="hdr-inner"><tr>
      <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
      <td class="hdr-title"><h1>ĐIỂM DANH NGHỈ TRƯA</h1></td>
    </tr><tr><td class="hdr-title">
      <h2>3 KHỐI – NH: ${namHocCauHinh}</h2>
      <div class="nh">11g45–13g00 | ${weekLabel} | Phòng ngủ: ${ma_phong}</div>
    </td></tr></table>
  </td></tr>
  <tr class="ly-row"><td colspan="${numCols}"><span style="color:#e11d48">Mở cửa: 11g35–11g45</span>&nbsp;&nbsp;<strong style="color:#e11d48">Nghỉ trưa: 11g45–13g00</strong></td></tr>
  <tr class="ly-row"><td colspan="${numCols}">${LUU_Y_NGU}</td></tr>
  <tr>
    <th rowspan="2" class="col-stt">ST<br>T</th>
    <th rowspan="2" class="col-msbt" style="color:#c00;">Mã<br>số<br>BT</th>
    <th rowspan="2" style="width:24%;">HỌ VÀ TÊN</th>
    <th rowspan="2" class="col-gt">GT</th>
    <th rowspan="2" class="col-lop">LỚP</th>
    <th rowspan="2" class="col-phong">P.<br>NGỦ</th>
    <th rowspan="2" class="col-phong">P.<br>ĂN</th>
    <th colspan="${numDays}" style="white-space:nowrap;">${weekLabel}</th>
    <th rowspan="2" class="col-ghichu">Ghi<br>chú</th>
  </tr>
  <tr>${dayTH}</tr>
</thead><tbody>${dataRows}</tbody></table>
<div class="ft-wrap">
  <div class="ft-left">
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: <strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: <strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right">
    <div><em>${todayLabel()}</em></div>
    <div class="sig-title">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space"></div>
    <div class="sig-name">${nguoiPhuTrach}</div>
  </div>
</div></div>`;
    }).join('');
    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:9pt; color:#000; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.dt { width:100%; border-collapse:collapse; }
.dt thead tr.hdr-row td,.dt thead tr.ly-row td { border:none; }
.dt thead tr.ly-row td { padding:2px 4px; font-size:8pt; line-height:1.4; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school { width:28%; text-align:center; font-size:9pt; line-height:1.5; }
.hdr-title { text-align:center; }
.hdr-title h1 { font-size:12pt; font-weight:bold; text-transform:uppercase; }
.hdr-title h2 { font-size:9pt; font-weight:bold; }
.hdr-title .nh { font-size:8pt; }
.dt th { border:0.8px solid #333; padding:2px; text-align:center; background:#ececec; font-weight:bold; font-size:8pt; }
.dt td { border:0.8px solid #555; padding:2px; vertical-align:middle; font-size:9pt; }
.col-stt{width:4mm;text-align:center}.col-msbt{width:8mm;text-align:center;font-weight:bold}
.col-gt{width:6mm;text-align:center}.col-lop{width:9mm;text-align:center}
.col-phong{width:9mm;text-align:center}.col-day{width:9mm;text-align:center;height:22px}
.col-ghichu{width:10mm}
.ft-wrap{width:100%;margin-top:8px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid}
.ft-left{flex:1;line-height:1.5}.ft-right{flex:1;text-align:center}
.sig-title{font-weight:bold;margin-top:4px}.sig-space{height:44px}.sig-name{font-weight:bold;font-style:italic}
.dt thead{display:table-row-group}
@page{size:A4 portrait;margin:0.8cm 0.7cm 1cm 0.8cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt th{background:#ececec!important}.dt thead{display:table-row-group!important}}`;
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}</style></head><body>
${htmlPages}
<script>window.onload=function(){setTimeout(window.print,400);}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showAlert('Trình duyệt chặn popup!', 'warning'); return; }
    w.document.write(html); w.document.close();
    setShowMonthExportModal(false);
  };


  // ── XUẤT PDF THEO THÁNG (NGỦ) ────────────────────────────────────
  const exportMonthlyPDF = () => {
    if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng để xuất PDF!', 'warning');
    if (exportWeeksActive.length === 0) return showAlert('Vui lòng chọn ít nhất 1 tuần để xuất!', 'warning');
    const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
    const activeIdx = allWeekMons.map((_, i) => i).filter(i => exportWeeksActive.includes(i));
    const weeksData = activeIdx.map(wi => {
      const wd = getWeekDays(allWeekMons[wi], exportWeeksT5.includes(wi));
      const mon = wd[0], fri = wd[wd.length-1];
      return { days: wd, label: `Tuần ${wi+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)}–${p2(fri.getDate())}/${p2(fri.getMonth()+1)}` };
    });
    const totalDays = weeksData.reduce((s, w) => s + w.days.length, 0);
    const numCols = 7 + totalDays + 1;
    const yearStart = exportYear - (exportMonth < 8 ? 1 : 0);
    const DOWS = ['CN','T2','T3','T4','T5','T6','T7'];
    const weekTH1 = weeksData.map(w =>
      `<th colspan="${w.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">${w.label}</th>`).join('');
    const weekTH2 = weeksData.map(w =>
      w.days.map((d,di) =>
        `<th class="col-day"${di===0?' style="border-left:1.5px solid #333;"':''}>${d.getDate()}/${p2(d.getMonth()+1)}<br><small>${DOWS[d.getDay()]}</small></th>`
      ).join('')).join('');
    const htmlPages = exportRooms.map(ma_phong => {
      const roomStudents = hsList.filter(s => s.phong_ngu === ma_phong);
      const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
      const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
      const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
      const dataRows = roomStudents.map((s,i) => {
        const gt = s.gioi_tinh===0?'Nam':'Nữ';
        const dayCells = weeksData.map(_w =>
          _w.days.map((d,di) =>
            `<td class="col-day"${di===0?' style="border-left:1.5px solid #555;"':''}></td>`).join('')).join('');
        return `<tr>
          <td class="col-stt">${i+1}</td>
          <td class="col-msbt">${s.id}</td>
          <td style="text-align:left;padding-left:6px;">${s.ho_ten}</td>
          <td class="col-gt">${gt}</td>
          <td class="col-lop">${s.lop}</td>
          <td class="col-phong">${s.phong_ngu||ma_phong}</td>
          <td class="col-phong">${s.phong_an||''}</td>
          ${dayCells}
          <td class="col-ghichu"></td>
        </tr>`;
      }).join('');
      return `<div class="room-block">
<table class="dt">
  <thead>
    <tr class="hdr-row"><td colspan="${numCols}">
      <table class="hdr-inner"><tr>
        <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
        <td class="hdr-title"><h1>ĐIỂM DANH NGHỈ TRƯA</h1></td>
      </tr><tr>
        <td class="hdr-title">
          <h2>3 KHỐI – NH: ${namHocCauHinh}</h2>
          <div class="nh">Thời gian: 11g45–13g00 &nbsp;|&nbsp; Tháng ${exportMonth}/${exportYear} &nbsp;|&nbsp; Phòng ngủ: ${ma_phong}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr class="ly-row"><td colspan="${numCols}"><span style="color:#e11d48">Mở cửa: 11g35–11g45</span>&nbsp;&nbsp;<strong style="color:#e11d48">Nghỉ trưa: 11g45–13g00</strong></td></tr>
    <tr class="ly-row"><td colspan="${numCols}">${LUU_Y_NGU}</td></tr>
    <tr>
      <th rowspan="2" class="col-stt">ST<br>T</th>
      <th rowspan="2" class="col-msbt" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" style="width:22%;">HỌ VÀ TÊN</th>
      <th rowspan="2" class="col-gt">GT</th>
      <th rowspan="2" class="col-lop">LỚP</th>
      <th rowspan="2" class="col-phong">P.<br>NGỦ</th>
      <th rowspan="2" class="col-phong">P.<br>ĂN</th>
      ${weekTH1}
      <th rowspan="2" class="col-ghichu">Ghi<br>chú</th>
    </tr>
    <tr>${weekTH2}</tr>
  </thead>
  <tbody>${dataRows}</tbody>
</table>
<div class="ft-wrap">
  <div class="ft-left">
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: <strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: <strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right">
    <div><em>${todayLabel()}</em></div>
    <div class="sig-title">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space"></div>
    <div class="sig-name">${nguoiPhuTrach}</div>
  </div>
</div>
</div>`;
    }).join('');
    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.dt { width:100%; border-collapse:collapse; }
.dt thead tr.hdr-row td { border:none; padding:0; }
.dt thead tr.ly-row td { border:none; padding:2px 4px; font-size:8pt; line-height:1.4; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school { width:28%; text-align:center; font-size:8.5pt; line-height:1.5; }
.hdr-title { text-align:center; }
.hdr-title h1 { font-size:12pt; font-weight:bold; text-transform:uppercase; }
.hdr-title h2 { font-size:9pt; font-weight:bold; margin-top:1px; }
.hdr-title .nh { font-size:8pt; margin-top:2px; }
.dt th { border:0.8px solid #333; padding:2px 2px; text-align:center; background:#ececec; font-weight:bold; vertical-align:middle; font-size:7.5pt; line-height:1.2; color:#000; }
.dt td { border:0.8px solid #555; padding:2px 2px; vertical-align:middle; color:#000; font-size:8pt; }
.col-stt   { width:4mm;  text-align:center; }
.col-msbt  { width:8mm;  text-align:center; font-weight:bold; }
.col-gt    { width:6mm;  text-align:center; }
.col-lop   { width:9mm;  text-align:center; }
.col-phong { width:9mm;  text-align:center; }
.col-day   { width:6mm;  text-align:center; height:18px; white-space:nowrap; }
.col-ghichu{ width:10mm; }
.ft-wrap { width:100%; margin-top:8px; font-size:8.5pt; display:flex; justify-content:space-between; page-break-inside:avoid; }
.ft-left { flex:1; line-height:1.5; }
.ft-right { flex:1; text-align:center; }
.sig-title { font-weight:bold; margin-top:4px; }
.sig-space { height:40px; }
.sig-name  { font-weight:bold; font-style:italic; }
.dt thead { display:table-row-group; }
@page { size: A4 portrait; margin: 0.8cm 0.7cm 1cm 0.8cm; }
@media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} *{color:#000!important;} .dt th{background:#ececec!important;} .dt thead{display:table-row-group!important;} }`;
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}</style></head><body>
${htmlPages}
<script>window.onload=function(){setTimeout(window.print,400);}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showAlert('Trình duyệt chặn popup! Vui lòng cho phép mở popup.', 'warning'); return; }
    w.document.write(html); w.document.close();
    setShowMonthExportModal(false);
  };

  const panelGrad = 'linear-gradient(135deg, #6c5ce7, #a29bfe)';

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Điểm danh ngủ</span>
          </div>
          <h2><i className="fas fa-bed" style={{color:'#6c5ce7',marginRight:8}}></i>Điểm danh Ngủ</h2>
          <p>Ghi nhận sĩ số học sinh ngủ theo phòng &amp; ngày. Danh sách HS do Admin phân bổ.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-sm" style={{background:'linear-gradient(135deg,#6c5ce7,#a29bfe)',color:'#fff',border:'none',fontWeight:600}}
            onClick={() => setShowMonthExportModal(true)}>
            <i className="fas fa-calendar-alt"></i> Xuất tháng
          </button>
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
          <div className="dd-room-panel-header" style={{background: panelGrad}}>
            <i className="fas fa-bed"></i> Phòng ngủ
          </div>
          <div className="dd-date-picker">
            <label><i className="fas fa-calendar-day" style={{color:'#6c5ce7',marginRight:4}}></i> Chọn ngày điểm danh</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="dd-room-stats">
            <span>Đã điểm: <span className="marked">{roomStats.markedCount}</span></span>
            <span>Chưa điểm: <span className="unmarked">{roomStats.unmarkedCount}</span></span>
          </div>
          <ul className="dd-room-list">
            {phongList.map(p => {
              const count = hsList.filter(hs => hs.phong_ngu === p.ma_phong).length;

              const isMarked = roomStats.markedRooms.has(p.ma_phong);
              return (
                <li key={p.ma_phong}
                  className={`dd-room-item${selectedPhong?.ma_phong === p.ma_phong ? ' active' : ''}`}
                  style={selectedPhong?.ma_phong === p.ma_phong ? {background:'linear-gradient(135deg,rgba(108,92,231,.1),rgba(162,155,254,.08))',borderColor:'rgba(108,92,231,.25)',color:'#6c5ce7'} : {}}
                  onClick={() => { setSelectedPhong(p); setOverrides({}); setSaved(false); }}>
                  <div className={`dd-room-status-icon ${isMarked ? 'marked' : 'unmarked'}`} title={isMarked ? 'Đã điểm danh' : 'Chưa điểm danh'}>
                    <i className={isMarked ? 'fas fa-check' : 'fas fa-exclamation'}></i>
                  </div>
                  <div className="dd-room-item-name">
                    <i className="fas fa-moon" style={{color:'#6c5ce7'}}></i>{p.ma_phong}
                  </div>
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
              <div className="dd-empty">
                <i className="fas fa-hand-pointer"></i>
                <h3>Chọn một phòng ngủ</h3>
                <p>Danh sách học sinh sẽ hiển thị tại đây</p>
              </div>
            ) : loading ? (
              <div className="dd-empty" style={{color:'#6c5ce7'}}>
                <i className="fas fa-spinner fa-spin"></i>
                <h3>Đang tải dữ liệu điểm danh...</h3>
              </div>
            ) : students.length === 0 ? (
              <div className="dd-empty">
                <i className="fas fa-users-slash"></i>
                <h3>Chưa có học sinh</h3>
                <p>Phòng này chưa được xếp học sinh nào</p>
              </div>
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
                          style={s.trang_thai === key ? {background: val.dot, color:'#fff', border:`1.5px solid ${val.dot}`, boxShadow:`0 2px 8px ${val.dot}66`} : {}}
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
      {AlertUI}

      {showMonthExportModal && (
        <div className="export-modal-overlay">
          <div className="export-modal">
            <div className="export-modal-header">
              <div className="icon" style={{background:'linear-gradient(135deg,#6c5ce7,#a29bfe)'}}><i className="fas fa-bed"></i></div>
              <div>
                <h3>Xuất PDF/Excel – Điểm danh Ngủ theo tuần</h3>
                <p>Chọn tháng, tuần cần xuất và các phòng ngủ</p>
              </div>
            </div>
            <div className="export-modal-body">
              {/* THÁNG IN */}
              <div className="export-modal-row">
                <div className="export-modal-group">
                  <div className="export-modal-section-title">THÁNG IN</div>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <select className="export-modal-select" value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}>
                      {[...Array(12)].map((_,i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                    </select>
                    <span style={{color:'#64748b',fontWeight:600}}>/</span>
                    <select className="export-modal-select" value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                      {[...Array(5)].map((_,i) => { const y=new Date().getFullYear()-2+i; return <option key={y} value={y}>{y}</option>; })}
                    </select>
                  </div>
                </div>
              </div>

              {/* CHỌN TUẦN */}
              <div className="export-modal-group">
                <div className="export-modal-section-title">
                  <i className="fas fa-calendar-week" style={{color:'#6c5ce7'}}></i> CHỌN TUẦN XUẤT
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px'}}>
                  {weekLabelsForModal.map((lbl, wIndex) => {
                    const sel = exportSelectedWeek === wIndex;
                    return (
                      <label key={wIndex} style={{
                        display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                        borderRadius:7, cursor:'pointer', userSelect:'none',
                        background: sel ? '#f0eeff' : '#f8fafc',
                        border: `1.5px solid ${sel ? '#6c5ce7' : '#e2e8f0'}`,
                        fontWeight: sel ? 600 : 400, color: sel ? '#6c5ce7' : '#64748b',
                      }}>
                        <input type="radio" name="exportWeek" checked={sel}
                          style={{accentColor:'#6c5ce7'}}
                          onChange={() => { setExportSelectedWeek(wIndex); setExportT5(false); }} />
                        <span style={{fontSize:'0.82rem'}}>
                          <span style={{fontWeight:700}}>{lbl.split(':')[0]}</span>
                          <span style={{fontWeight:400, fontSize:'0.75rem', marginLeft:4, color: sel?'#6c5ce7':'#94a3b8'}}>{lbl.split(': ')[1]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* DẠY BÙ T5 */}
              <div className="export-modal-group">
                <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none',
                  padding:'8px 12px', borderRadius:7, border:'1.5px solid #e2e8f0', background:'#f8fafc'}}>
                  <input type="checkbox" checked={exportT5} style={{accentColor:'#10b981'}}
                    onChange={e => setExportT5(e.target.checked)} />
                  <span style={{fontWeight:600, color:'#10b981'}}>
                    <i className="fas fa-calendar-plus"></i> Tuần này có dạy bù Thứ Năm (T5)
                  </span>
                </label>
              </div>

              {/* CHỌN PHÒNG NGỦ */}
              <div className="export-modal-group">
                <div className="export-room-header">
                  <div className="export-modal-section-title" style={{margin:0}}>CHỌN PHÒNG NGỦ</div>
                  <div className="export-room-actions">
                    <button onClick={()=>setExportRooms(phongList.map(p=>p.ma_phong))}>Chọn tất cả</button>
                    <div className="divider"></div>
                    <button className="deselect" onClick={()=>setExportRooms([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div className="export-room-grid">
                  {phongList.map(p=>(
                    <div key={p.ma_phong}
                      className={`export-room-pill ${exportRooms.includes(p.ma_phong)?'selected':''}`}
                      style={exportRooms.includes(p.ma_phong)?{background:'#6c5ce7',borderColor:'#6c5ce7',color:'#fff'}:{}}
                      onClick={()=>setExportRooms(prev=>prev.includes(p.ma_phong)?prev.filter(r=>r!==p.ma_phong):[...prev,p.ma_phong])}>
                      {p.ma_phong}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowMonthExportModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={exportWeekExcel} style={{background:'#10b981',borderColor:'#10b981'}}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              <button className="btn btn-primary" onClick={exportWeekPDF} style={{background:'#6c5ce7',borderColor:'#6c5ce7'}}><i className="fas fa-file-pdf"></i> Xuất PDF</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
