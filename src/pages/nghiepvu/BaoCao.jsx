import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chart, ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { formatLopList } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './BaoCao.css';

Chart.register(ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

// ── Helpers ──────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const DOWS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function BaoCao() {
  const [activeTab, setActiveTab] = useState('panel-hs');
  const today = new Date().toISOString().slice(0,10);
  
  // Tab Học Sinh
  const [monthHS, setMonthHS] = useState(today.slice(0,7));
  const [lopFilter, setLopFilter] = useState('');
  const [hsData, setHsData] = useState([]);
  const [loadingHS, setLoadingHS] = useState(true);
  const [hsPage, setHsPage] = useState(0);
  const HS_PER_PAGE = 50;

  // Tab Giáo viên
  const [monthGV, setMonthGV] = useState(today.slice(0,7));
  const [gvData, setGvData] = useState([]);
  const [giaAn, setGiaAn] = useState(0);
  const [giaNgu, setGiaNgu] = useState(0);
  const [loadingGV, setLoadingGV] = useState(true);

  // Xuất báo cáo điểm danh ăn chính thức
  const [showExportAnModal, setShowExportAnModal] = useState(false);
  const [exportAnMonth, setExportAnMonth] = useState(new Date().getMonth() + 1);
  const [exportAnYear, setExportAnYear] = useState(new Date().getFullYear());
  const [exportAnRooms, setExportAnRooms] = useState([]);
  const [exportAnPhongList, setExportAnPhongList] = useState([]);
  const [exportingAn, setExportingAn] = useState(false);
  const [exportAnWeeksActive, setExportAnWeeksActive] = useState([]); // chỉ số tuần được chọn

  // Xuất báo cáo điểm danh ngủ chính thức
  const [showExportNguModal, setShowExportNguModal] = useState(false);
  const [exportNguMonth, setExportNguMonth] = useState(new Date().getMonth() + 1);
  const [exportNguYear, setExportNguYear] = useState(new Date().getFullYear());
  const [exportNguRooms, setExportNguRooms] = useState([]);
  const [exportNguPhongList, setExportNguPhongList] = useState([]);
  const [exportingNgu, setExportingNgu] = useState(false);
  const [exportNguWeeksActive, setExportNguWeeksActive] = useState([]); // chỉ số tuần được chọn

  // Xuất báo cáo ngày đặc biệt
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [specialLoai, setSpecialLoai] = useState('an'); // 'an' | 'ngu'
  const [specialDate, setSpecialDate] = useState(today);
  const [exportingSpecial, setExportingSpecial] = useState(false);

  // Báo cáo tổng hợp theo lớp
  const [showTongHopLopModal, setShowTongHopLopModal] = useState(false);
  const [thLopMonth, setThLopMonth] = useState(today.slice(0,7));
  const [thLopData, setThLopData] = useState(null);
  const [loadingThLop, setLoadingThLop] = useState(false);
  const [thLopSelected, setThLopSelected] = useState('');

  // Lấy dữ liệu Báo cáo HS
  useEffect(() => {
    const [y, m] = monthHS.split('-');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingHS(true);
    const ctrl = new AbortController();
    api.get(`/api/baocao/diemdanh/?thang=${m}&nam=${y}&lop=${lopFilter}`, { signal: ctrl.signal })
      .then(res => {
        if (res.data?.ok) { setHsData(res.data.data || []); setHsPage(0); }
      })
      .catch(err => { if (err?.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoadingHS(false));
    return () => ctrl.abort();
  }, [monthHS, lopFilter]);

  // Lấy dữ liệu Báo cáo GV
  useEffect(() => {
    const [y, m] = monthGV.split('-');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingGV(true);
    const ctrl = new AbortController();
    api.get(`/api/baocao/luong-gv/?thang=${m}&nam=${y}`, { signal: ctrl.signal })
      .then(res => {
        if (res.data?.ok) {
          setGvData(res.data.data || []);
          setGiaAn(res.data.don_gia_an || 0);
          setGiaNgu(res.data.don_gia_ngu || 0);
        }
      })
      .catch(err => { if (err?.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoadingGV(false));
    return () => ctrl.abort();
  }, [monthGV]);

  // ── Tính toán số liệu Học Sinh ──
  const totalHS = hsData.length;
  // (Ví dụ) Nếu so_ngay_co_mat_an == 0 và so_ngay_vang_an == 0 => có thể chưa ăn
  // Giả sử vang = HS có ít nhất 1 buổi vắng, phep = ít nhất 1 buổi phép
  const comAn   = hsData.filter(h => h.so_ngay_co_mat_an > 0 || h.so_ngay_co_mat_ngu > 0).length;
  const vang    = hsData.filter(h => h.so_ngay_vang_an > 0 || h.so_ngay_vang_ngu > 0).length;
  const phep    = hsData.filter(h => h.so_ngay_phep_an > 0 || h.so_ngay_phep_ngu > 0).length;

  const donutData = { 
    labels:['Có mặt (ít nhất 1)','Vắng (ít nhất 1)','Phép (ít nhất 1)'], 
    datasets:[{ data:[comAn,vang,phep], backgroundColor:['#00b894','#e17055','#fdcb6e'], borderWidth:0 }] 
  };
  
  // Khối stats (đơn giản hóa)
  const khoiStats = useMemo(() => {
    const map = {};
    hsData.forEach(h => {
      const k = String(h.lop).substring(0, 2);
      if (!map[k]) map[k] = { k, t:0, va:0, vn:0, p:0 };
      map[k].t++;
      map[k].va += h.so_ngay_vang_an;
      map[k].vn += h.so_ngay_vang_ngu;
      map[k].p += (h.so_ngay_phep_an + h.so_ngay_phep_ngu);
    });
    return Object.values(map).sort((a,b) => a.k.localeCompare(b.k));
  }, [hsData]);

  // Lớp list (cho filter)
  const lopList = useMemo(() => [...new Set(hsData.map(h => h.lop))].sort(), [hsData]);

  // ── Tính toán số liệu Giáo Viên ──
  const totCaAn  = gvData.reduce((a,g) => a + g.so_ca_an, 0);
  const totCaNgu = gvData.reduce((a,g) => a + g.so_ca_ngu, 0);
  const totTien  = gvData.reduce((a,g) => a + g.tong_tien, 0);

  const gvDonut = { labels:['Tổng Ca ăn','Tổng Ca ngủ'], datasets:[{ data:[totCaAn,totCaNgu], backgroundColor:['#fdcb6e','#a29bfe'], borderWidth:0 }] };
  const gvBar   = { 
    labels: gvData.map(g => g.ho_ten.split(' ').pop()), 
    datasets:[
      { label:'Ca ăn', data:gvData.map(g=>g.so_ca_an), backgroundColor:'rgba(253,203,110,.8)', borderRadius:4 },
      { label:'Ca ngủ', data:gvData.map(g=>g.so_ca_ngu), backgroundColor:'rgba(162,155,254,.8)', borderRadius:4 }
    ] 
  };

  // ── Tính các tuần trong tháng (cho chọn tuần xuất) ──
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
  const weekLabelsAn = useMemo(() => {
    return computeWeekMondayStrs(exportAnMonth, exportAnYear).map((monStr, i) => {
      const mon = new Date(monStr + 'T00:00:00');
      const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
      return `Tuần ${i+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)} – ${p2(fri.getDate())}/${p2(fri.getMonth()+1)}`;
    });
  
  }, [exportAnMonth, exportAnYear]);
  // Reset chọn tuần khi tháng/năm thay đổi
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportAnWeeksActive(weekLabelsAn.map((_, i) => i));
  }, [weekLabelsAn]);

  const weekLabelsNgu = useMemo(() => {
    return computeWeekMondayStrs(exportNguMonth, exportNguYear).map((monStr, i) => {
      const mon = new Date(monStr + 'T00:00:00');
      const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
      return `Tuần ${i+1}: ${p2(mon.getDate())}/${p2(mon.getMonth()+1)} – ${p2(fri.getDate())}/${p2(fri.getMonth()+1)}`;
    });

  }, [exportNguMonth, exportNguYear]);
  // Reset chọn tuần khi tháng/năm thay đổi
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportNguWeeksActive(weekLabelsNgu.map((_, i) => i));
  }, [weekLabelsNgu]);

  // ── Mở modal: fetch danh sách phòng ──
  const openExportAnModal = async () => {
    const d = new Date();
    setExportAnMonth(d.getMonth() + 1);
    setExportAnYear(d.getFullYear());
    setExportAnRooms([]);
    try {
      const res = await api.get('/api/phong/an');
      if (res.data?.ok) { setExportAnPhongList(res.data.phong); setExportAnRooms(res.data.phong.map(p => p.ma_phong)); }
    } catch { /* ignore */ }
    // Chọn tất cả tuần mặc định
    setExportAnWeeksActive(computeWeekMondayStrs(new Date().getMonth()+1, new Date().getFullYear()).map((_,i)=>i));
    setShowExportAnModal(true);
  };

  // ── Mở modal (Ngủ): fetch danh sách phòng ──
  const openExportNguModal = async () => {
    const d = new Date();
    setExportNguMonth(d.getMonth() + 1);
    setExportNguYear(d.getFullYear());
    setExportNguRooms([]);
    try {
      const res = await api.get('/api/phong/ngu');
      if (res.data?.ok) { setExportNguPhongList(res.data.phong); setExportNguRooms(res.data.phong.map(p => p.ma_phong)); }
    } catch { /* ignore */ }
    // Chọn tất cả tuần mặc định
    setExportNguWeeksActive(computeWeekMondayStrs(new Date().getMonth()+1, new Date().getFullYear()).map((_,i)=>i));
    setShowExportNguModal(true);
  };

  // ── Hàm xuất PDF báo cáo điểm danh ăn chính thức ──
  const exportBaoCaoAnPDF = async () => {
    if (exportAnRooms.length === 0) return alert('Vui lòng chọn ít nhất 1 phòng!');
    setExportingAn(true);
    try {
      const res = await api.get(`/api/baocao/export-an/?thang=${exportAnMonth}&nam=${exportAnYear}`);
      if (!res.data?.ok) return alert('Lỗi tải dữ liệu: ' + (res.data?.error || ''));
      const { ngay_ban_tru: allNgay, data: dataByPhong, nam_hoc, nguoi_phu_trach, so_thang, so_nam } = res.data;

      // Lọc ngày theo tuần được chọn
      const allWeekMons = computeWeekMondayStrs(exportAnMonth, exportAnYear);
      const ngay_ban_tru = allNgay.filter(ngay => {
        const d = new Date(ngay + 'T00:00:00');
        const dow = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
        const wIdx = allWeekMons.indexOf(monStr);
        return wIdx >= 0 && exportAnWeeksActive.includes(wIdx);
      });
      if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú nào trong các tuần đã chọn!');
      const numDays = ngay_ban_tru.length;
      const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth()+1} năm ${new Date().getFullYear()}`;
      const luuY = 'Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.';

      const weekGroups = [];
      let curWeek = null;
      ngay_ban_tru.forEach((ngay, di) => {
        const d = new Date(ngay + 'T00:00:00');
        const mon = new Date(d); const dow = mon.getDay()||7; mon.setDate(mon.getDate()-dow+1);
        const monStr = mon.toISOString().split('T')[0];
        if (!curWeek || curWeek.monStr !== monStr) { curWeek = { monStr, days: [] }; weekGroups.push(curWeek); }
        curWeek.days.push({ ngay, d, di });
      });

      const weekTH1 = weekGroups.map((wg, wi) => {
        const fd = wg.days[0].d; const ld = wg.days[wg.days.length-1].d;
        return `<th colspan="${wg.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">Tuần ${wi+1}: ${p2(fd.getDate())}/${p2(fd.getMonth()+1)}–${p2(ld.getDate())}/${p2(ld.getMonth()+1)}</th>`;
      }).join('');
      const weekTH2 = weekGroups.map(wg => wg.days.map(({d}, di2) =>
        `<th class="col-day-an"${di2===0?' style="border-left:1.5px solid #333;"':''}>\n${d.getDate()}/${p2(d.getMonth()+1)}<br><small>${DOWS[d.getDay()]}</small></th>`
      ).join('')).join('');

      const htmlPages = exportAnRooms.map(ma_phong => {
        const roomStudents = [...(dataByPhong[ma_phong] || [])].sort((a, b) => a.id - b.id);
        const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
        const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
        const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
        const dataRows = roomStudents.map((s, i) => {
          const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
          const dayCells = weekGroups.map(wg => wg.days.map(({ngay}, di2) => {
            const val = s.diemdanh[ngay];
            // Chỉ hiển thị ký hiệu khi có bản ghi rõ ràng; null = chưa điểm danh → bỏ trống
            const sym = val===0?'<span class="mk-c">✓</span>':val===1?'<span class="mk-v">✗</span>':val===2?'<span class="mk-p">P</span>':'';
            return `<td class="col-day-an"${di2===0?' style="border-left:1.5px solid #555;"':''}>${sym}</td>`;
          }).join('')).join('');
          const filteredVang = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 1).length;
          const filteredPhep = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 2).length;
          const filteredCoMat = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 0).length; // Chỉ đếm khi đã ghi nhận rõ là có mặt
          return `<tr>
            <td class="col-stt-an">${i+1}</td><td class="col-msbt-an">${s.id}</td>
            <td class="col-ten-an">${s.ho_ten}</td><td class="col-gt-an">${gt}</td>
            <td class="col-lop-an">${s.lop}</td><td class="col-phong-an">${ma_phong}</td>
            ${dayCells}
            <td class="col-sum-an">${numDays}</td>
            <td class="col-sum-an">${filteredVang}</td>
            <td class="col-sum-an">${filteredPhep}</td>
            <td class="col-sum-an">${filteredCoMat}</td>
            <td class="col-ghichu-an"></td></tr>`;
        }).join('');
        return `<div class="room-block">
<table class="hdr-inner-an"><tr>
  <td class="hdr-school-an" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-title-an"><h1>ĐIỂM DANH ĂN TRƯA</h1></td></tr><tr>
  <td class="hdr-title-an"><h2>NĂM HỌC ${nam_hoc}</h2>
    <div class="nh-an">Thời gian: 11g00–11g45 &nbsp;|&nbsp; Tháng ${so_thang}/${so_nam} &nbsp;|&nbsp; Phòng ăn: ${ma_phong} &nbsp;|&nbsp; Tổng: ${numDays} buổi ăn</div>
  </td></tr></table>
<div class="ly-row-an-div">${luuY}</div>
<table class="dt-an"><thead>
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
  </tr><tr>${weekTH2}</tr>
</thead><tbody>${dataRows}</tbody></table>
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
    <div style="font-weight:bold;font-style:italic;">${nguoi_phu_trach}</div>
  </div>
</div></div>`;
      }).join('');
      if (htmlPages.trim() === '') return alert('Không có dữ liệu để xuất!');
      const css = `* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.mk-c { color:#16a34a; font-weight:bold; } .mk-v { color:#dc2626; font-weight:bold; } .mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; } .room-block:first-of-type { page-break-before: auto; }
.ly-row-an-div { padding:2px 4px; font-size:8pt; line-height:1.4; margin-bottom:4px; }
.dt-an { width:100%; border-collapse:collapse; }
.hdr-inner-an { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner-an td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school-an { width:20%; text-align:center; font-size:8.5pt; line-height:1.6; }
.hdr-title-an { text-align:center; }
.hdr-title-an h1 { font-size:13pt; font-weight:bold; text-transform:uppercase; }
.hdr-title-an h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title-an .nh-an { font-size:9pt; margin-top:2px; }
.dt-an th { border:0.8px solid #333; padding:2px; text-align:center; background:#ececec; font-weight:bold; font-size:8pt; line-height:1.2; color:#000; }
.dt-an td { border:0.8px solid #555; padding:2px; vertical-align:middle; color:#000; font-size:8pt; }
.col-stt-an{width:4mm;text-align:center} .col-msbt-an{width:8mm;text-align:center;font-weight:bold}
.col-ten-an{width:40mm} .col-gt-an{width:7mm;text-align:center}
.col-lop-an{width:10mm;text-align:center} .col-phong-an{width:9mm;text-align:center}
.col-day-an{width:6mm;text-align:center;height:20px}
.col-sum-an{width:13mm;text-align:center;font-weight:bold;background:#f0fff0}
.col-ghichu-an{width:11mm}
.ft-wrap-an{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid}
.ft-left-an{flex:1} .ft-right-an{flex:1;text-align:center} .sig-space-an{height:38px}
@page{size:A4 landscape;margin:0.8cm 0.8cm 1.2cm 1cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt-an th{background:#ececec!important}.col-sum-an{background:#f0fff0!important}}`;
      const w = window.open('', '_blank');
      if (!w) return alert('Trình duyệt chặn popup!');
      w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Báo cáo điểm danh ăn tháng ${so_thang}/${so_nam}</title><style>${css}</style></head><body>${htmlPages}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
      w.document.close();
      setShowExportAnModal(false);
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setExportingAn(false); }
  };

  // ── Hàm xuất Excel báo cáo điểm danh ăn chính thức ──
  const exportBaoCaoAnExcel = async () => {
    if (exportAnRooms.length === 0) return alert('Vui lòng chọn ít nhất 1 phòng!');
    setExportingAn(true);
    try {
      const res = await api.get(`/api/baocao/export-an/?thang=${exportAnMonth}&nam=${exportAnYear}`);
      if (!res.data?.ok) return alert('Lỗi tải dữ liệu');
      const { ngay_ban_tru: allNgay, data: dataByPhong, so_thang, so_nam } = res.data;
      // Lọc ngày theo tuần được chọn
      const allWeekMons2 = computeWeekMondayStrs(exportAnMonth, exportAnYear);
      const ngay_ban_tru = allNgay.filter(ngay => {
        const d = new Date(ngay + 'T00:00:00');
        const dow = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
        const wIdx = allWeekMons2.indexOf(monStr);
        return wIdx >= 0 && exportAnWeeksActive.includes(wIdx);
      });
      if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú trong các tuần đã chọn!');
      const numDays = ngay_ban_tru.length;
      const wb = XLSX.utils.book_new();
      exportAnRooms.forEach(ma_phong => {
        const roomStudents = [...(dataByPhong[ma_phong] || [])].sort((a, b) => a.id - b.id);
        const h1 = ['STT','STT\nDS BT','HỌ VÀ TÊN','GT','LỚP','Phòng\nĂn'];
        const h2 = ['','','','','',''];
        ngay_ban_tru.forEach(ngay => {
          const d = new Date(ngay+'T00:00:00');
          h1.push(`${d.getDate()}/${d.getMonth()+1}`);
          h2.push(DOWS[d.getDay()]);
        });
        h1.push('TS\nBuổi ăn','SB\nVắng','Vắng\ncó P','Buổi ăn\nthực tế');
        h2.push('','','','');
        const aoa = [
          [`ĐIỂM DANH ĂN TRƯA – THÁNG ${so_thang}/${so_nam} – PHÒNG ${ma_phong}`,...Array(5+numDays+4).fill('')],
          Array(6+numDays+4).fill(''), h1, h2,
        ];
        roomStudents.forEach((s, i) => {
          const gt = s.gioi_tinh===0?'Nam':'Nữ';
          const dayCells = ngay_ban_tru.map(ngay => {
            const v = s.diemdanh[ngay]; return v===0?'✓':v===1?'✗':v===2?'P':'';
          });
          const filteredVang2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 1).length;
          const filteredPhep2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 2).length;
          const filteredCoMat2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 0).length; // Chỉ đếm khi đã ghi nhận rõ là có mặt
          aoa.push([i+1,s.id,s.ho_ten,gt,s.lop,ma_phong,...dayCells,numDays,filteredVang2,filteredPhep2,filteredCoMat2]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const cols = [{wch:5},{wch:8},{wch:28},{wch:5},{wch:8},{wch:7}];
        for(let i=0;i<numDays;i++) cols.push({wch:5});
        cols.push({wch:7},{wch:7},{wch:9},{wch:12});
        ws['!cols'] = cols;
        XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0,31));
      });
      XLSX.writeFile(wb, `BaoCao_DiemDanhAn_Thang${so_thang}_${so_nam}.xlsx`);
      setShowExportAnModal(false);
    } catch(err) { alert('Lỗi: '+err.message); }
    finally { setExportingAn(false); }
  };

  // ── Hàm xuất PDF báo cáo điểm danh ngủ chính thức ──
  const exportBaoCaoNguPDF = async () => {
    if (exportNguRooms.length === 0) return alert('Vui lòng chọn ít nhất 1 phòng!');
    setExportingNgu(true);
    try {
      const res = await api.get(`/api/baocao/export-ngu/?thang=${exportNguMonth}&nam=${exportNguYear}`);
      if (!res.data?.ok) return alert('Lỗi tải dữ liệu: ' + (res.data?.error || ''));
      const { ngay_ban_tru: allNgay, data: dataByPhong, nam_hoc, nguoi_phu_trach, so_thang, so_nam } = res.data;

      // Lọc ngày theo tuần được chọn
      const allWeekMons = computeWeekMondayStrs(exportNguMonth, exportNguYear);
      const ngay_ban_tru = allNgay.filter(ngay => {
        const d = new Date(ngay + 'T00:00:00');
        const dow = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
        const wIdx = allWeekMons.indexOf(monStr);
        return wIdx >= 0 && exportNguWeeksActive.includes(wIdx);
      });
      if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú nào trong các tuần đã chọn!');
      const numDays = ngay_ban_tru.length;
      const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth()+1} năm ${new Date().getFullYear()}`;
      const luuY = 'Lưu ý: HS di chuyển đến đúng vị trí/phòng ngủ đã phân công; giữ trật tự giờ ngủ và chấp hành điều động của thầy cô.';

      const weekGroups = [];
      let curWeek = null;
      ngay_ban_tru.forEach((ngay, di) => {
        const d = new Date(ngay + 'T00:00:00');
        const mon = new Date(d); const dow = mon.getDay()||7; mon.setDate(mon.getDate()-dow+1);
        const monStr = mon.toISOString().split('T')[0];
        if (!curWeek || curWeek.monStr !== monStr) { curWeek = { monStr, days: [] }; weekGroups.push(curWeek); }
        curWeek.days.push({ ngay, d, di });
      });

      const weekTH1 = weekGroups.map((wg, wi) => {
        const fd = wg.days[0].d; const ld = wg.days[wg.days.length-1].d;
        return `<th colspan="${wg.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">Tuần ${wi+1}: ${p2(fd.getDate())}/${p2(fd.getMonth()+1)}–${p2(ld.getDate())}/${p2(ld.getMonth()+1)}</th>`;
      }).join('');
      const weekTH2 = weekGroups.map(wg => wg.days.map(({ d }, di2) =>
        `<th class="col-day-an"${di2===0?' style="border-left:1.5px solid #333;"':''}>\n${d.getDate()}/${p2(d.getMonth()+1)}<br><small>${DOWS[d.getDay()]}</small></th>`
      ).join('')).join('');

      const htmlPages = exportNguRooms.map(ma_phong => {
        const roomStudents = [...(dataByPhong[ma_phong] || [])].sort((a, b) => a.id - b.id);
        const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
        const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
        const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;

        // Phòng "đã điểm danh" ngày đó khi TẤT CẢ HS trong phòng có record (null != null = false)
        const markedDaySet = new Set(
          ngay_ban_tru.filter(ngay =>
            roomStudents.length > 0 && roomStudents.every(s => s.diemdanh[ngay] != null)
          )
        );

        const dataRows = roomStudents.map((s, i) => {
          const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
          const dayCells = weekGroups.map(wg => wg.days.map(({ngay}, di2) => {
            let sym = '';
            if (markedDaySet.has(ngay)) {
              const val = s.diemdanh[ngay];
              sym = val===1?'<span class="mk-v">✗</span>':val===2?'<span class="mk-p">P</span>':val===0?'<span class="mk-c">✓</span>':'';
            }
            return `<td class="col-day-an"${di2===0?' style="border-left:1.5px solid #555;"':''}>${sym}</td>`;
          }).join('')).join('');
          const filteredVang = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 1).length;
          const filteredPhep = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 2).length;
          const filteredCoMat = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 0).length; // Chỉ đếm khi đã ghi nhận rõ là có mặt
          return `<tr>
            <td class="col-stt-an">${i+1}</td><td class="col-msbt-an">${s.id}</td>
            <td class="col-ten-an">${s.ho_ten}</td><td class="col-gt-an">${gt}</td>
            <td class="col-lop-an">${s.lop}</td><td class="col-phong-an">${ma_phong}</td>
            ${dayCells}
            <td class="col-sum-an">${numDays}</td>
            <td class="col-sum-an">${filteredVang}</td>
            <td class="col-sum-an">${filteredPhep}</td>
            <td class="col-sum-an">${filteredCoMat}</td>
            <td class="col-ghichu-an"></td></tr>`;
        }).join('');
        return `<div class="room-block">
<table class="hdr-inner-an"><tr>
  <td class="hdr-school-an" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-title-an"><h1>ĐIỂM DANH NGỦ TRƯA</h1></td></tr><tr>
  <td class="hdr-title-an"><h2>NĂM HỌC ${nam_hoc}</h2>
    <div class="nh-an">Thời gian: 11g45–13g15 &nbsp;|&nbsp; Tháng ${so_thang}/${so_nam} &nbsp;|&nbsp; Phòng ngủ: ${ma_phong} &nbsp;|&nbsp; Tổng: ${numDays} buổi ngủ</div>
  </td></tr></table>
<div class="ly-row-an-div">${luuY}</div>
<table class="dt-an"><thead>
  <tr>
    <th rowspan="2" class="col-stt-an">ST<br>T</th>
    <th rowspan="2" class="col-msbt-an" style="color:#c00;">Mã<br>số<br>BT</th>
    <th rowspan="2" class="col-ten-an">HỌC SINH</th>
    <th rowspan="2" class="col-gt-an">GT</th>
    <th rowspan="2" class="col-lop-an">LỚP</th>
    <th rowspan="2" class="col-phong-an">P.<br>NGỦ</th>
    ${weekTH1}
    <th rowspan="2" class="col-sum-an">TS<br>Buổi<br>ngủ</th>
    <th rowspan="2" class="col-sum-an">SB<br>Vắng</th>
    <th rowspan="2" class="col-sum-an">Vắng<br>có P</th>
    <th rowspan="2" class="col-sum-an">Buổi ngủ<br>thực tế</th>
    <th rowspan="2" class="col-ghichu-an">GHI<br>CHÚ</th>
  </tr>
  <tr>${weekTH2}</tr>
</thead><tbody>${dataRows}</tbody></table>
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
    <div style="font-weight:bold;font-style:italic;">${nguoi_phu_trach}</div>
  </div>
</div></div>`;
      }).join('');
      if (htmlPages.trim() === '') return alert('Không có dữ liệu để xuất!');
      const css = `* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.mk-c { color:#16a34a; font-weight:bold; } .mk-v { color:#dc2626; font-weight:bold; } .mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; } .room-block:first-of-type { page-break-before: auto; }
.ly-row-an-div { padding:2px 4px; font-size:8pt; line-height:1.4; margin-bottom:4px; }
.dt-an { width:100%; border-collapse:collapse; }
.hdr-inner-an { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner-an td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school-an { width:20%; text-align:center; font-size:8.5pt; line-height:1.6; }
.hdr-title-an { text-align:center; }
.hdr-title-an h1 { font-size:13pt; font-weight:bold; text-transform:uppercase; }
.hdr-title-an h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title-an .nh-an { font-size:9pt; margin-top:2px; }
.dt-an th { border:0.8px solid #333; padding:2px; text-align:center; background:#ececec; font-weight:bold; font-size:8pt; line-height:1.2; color:#000; }
.dt-an td { border:0.8px solid #555; padding:2px; vertical-align:middle; color:#000; font-size:8pt; }
.col-stt-an{width:4mm;text-align:center} .col-msbt-an{width:8mm;text-align:center;font-weight:bold}
.col-ten-an{width:40mm} .col-gt-an{width:7mm;text-align:center}
.col-lop-an{width:10mm;text-align:center} .col-phong-an{width:9mm;text-align:center}
.col-day-an{width:6mm;text-align:center;height:20px}
.col-sum-an{width:13mm;text-align:center;font-weight:bold;background:#f8f4ff}
.col-ghichu-an{width:11mm}
.ft-wrap-an{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid}
.ft-left-an{flex:1} .ft-right-an{flex:1;text-align:center} .sig-space-an{height:38px}
@page{size:A4 landscape;margin:0.8cm 0.8cm 1.2cm 1cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt-an th{background:#ececec!important}.col-sum-an{background:#f8f4ff!important}}`;
      const win = window.open('', '_blank');
      if (!win) return alert('Trình duyệt chặn popup!');
      win.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Báo cáo điểm danh Ngủ tháng ${so_thang}/${so_nam}</title><style>${css}</style></head><body>${htmlPages}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
      win.document.close();
      setShowExportNguModal(false);
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setExportingNgu(false); }
  };

  // ── Hàm xuất Excel báo cáo điểm danh ngủ chính thức ──
  const exportBaoCaoNguExcel = async () => {
    if (exportNguRooms.length === 0) return alert('Vui lòng chọn ít nhất 1 phòng!');
    setExportingNgu(true);
    try {
      const res = await api.get(`/api/baocao/export-ngu/?thang=${exportNguMonth}&nam=${exportNguYear}`);
      if (!res.data?.ok) return alert('Lỗi tải dữ liệu');
      const { ngay_ban_tru: allNgay, data: dataByPhong, so_thang, so_nam } = res.data;
      // Lọc ngày theo tuần được chọn
      const allWeekMons2 = computeWeekMondayStrs(exportNguMonth, exportNguYear);
      const ngay_ban_tru = allNgay.filter(ngay => {
        const d = new Date(ngay + 'T00:00:00');
        const dow = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth()+1) + '-' + p2(mon.getDate());
        const wIdx = allWeekMons2.indexOf(monStr);
        return wIdx >= 0 && exportNguWeeksActive.includes(wIdx);
      });
      if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú trong các tuần đã chọn!');
      const numDays = ngay_ban_tru.length;
      const wb = XLSX.utils.book_new();
      exportNguRooms.forEach(ma_phong => {
        const roomStudents = [...(dataByPhong[ma_phong] || [])].sort((a, b) => a.id - b.id);
        const h1 = ['STT','STT\nDS BT','HỌ VÀ TÊN','GT','LỚP','Phòng\nNgủ'];
        const h2 = ['','','','','',''];
        ngay_ban_tru.forEach(ngay => {
          const d = new Date(ngay+'T00:00:00');
          h1.push(`${d.getDate()}/${d.getMonth()+1}`);
          h2.push(DOWS[d.getDay()]);
        });
        h1.push('TS\nBuổi ngủ','SB\nVắng','Vắng\ncó P','Buổi ngủ\nthực tế');
        h2.push('','','','');
        const aoa = [
          [`ĐIỂM DANH NGỦ TRƯA – THÁNG ${so_thang}/${so_nam} – PHÒNG ${ma_phong}`,...Array(5+numDays+4).fill('')],
          Array(6+numDays+4).fill(''), h1, h2,
        ];
        roomStudents.forEach((s, i) => {
          const gt = s.gioi_tinh===0?'Nam':'Nữ';
          const dayCells = ngay_ban_tru.map(ngay => {
            const v = s.diemdanh[ngay]; return v===0?'✓':v===1?'✗':v===2?'P':'';
          });
          const filteredVang2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 1).length;
          const filteredPhep2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 2).length;
          const filteredCoMat2 = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 0).length; // Chỉ đếm khi đã ghi nhận rõ là có mặt
          aoa.push([i+1,s.id,s.ho_ten,gt,s.lop,ma_phong,...dayCells,numDays,filteredVang2,filteredPhep2,filteredCoMat2]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const cols = [{wch:5},{wch:8},{wch:28},{wch:5},{wch:8},{wch:7}];
        for(let i=0;i<numDays;i++) cols.push({wch:5});
        cols.push({wch:7},{wch:7},{wch:9},{wch:12});
        ws['!cols'] = cols;
        XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0,31));
      });
      XLSX.writeFile(wb, `BaoCao_DiemDanhNgu_Thang${so_thang}_${so_nam}.xlsx`);
      setShowExportNguModal(false);
    } catch(err) { alert('Lỗi: '+err.message); }
    finally { setExportingNgu(false); }
  };

  // ── Hàm xuất PDF ngày đặc biệt (cho cả Ăn và Ngủ) ──
  const exportSpecialDayPDF = async () => {
    setExportingSpecial(true);
    try {
      const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
      
      const [hsCfgRes, ngayCfgRes, ddRes, hsRes, phongRes] = await Promise.all([
        api.get('/api/cauhinh/'),
        api.get(`/api/diemdanh/?ngay=${specialDate}&loai=${specialLoai}`),
        api.get(`/api/diemdanh/range/?tu=${specialDate}&den=${specialDate}`),
        api.get(`/api/hocsinh/${specialLoai}`),
        api.get(`/api/phong/${specialLoai}`)
      ]);
      
      const cauHinhHT = hsCfgRes.data?.he_thong || {};
      const nguoiPhuTrach = cauHinhHT.nguoi_phu_trach || 'Người phụ trách';
      const namHoc = cauHinhHT.nam_hoc || '2025-2026';
      const allHs = hsRes.data?.hocsinh || [];
      const phongList = phongRes.data?.phong || [];
      const cfg = ngayCfgRes.data?.cauhinh_ngay || null;
      const ddMap = ddRes.data?.map || {};
      
      const phongTam = specialLoai === 'an' ? cfg?.phong_tam_an : cfg?.phong_tam_ngu;
      const loaiLabel = specialLoai === 'an' ? 'ĂN TRƯA' : 'NGỦ TRƯA';
      const loaiField = specialLoai === 'an' ? 'an' : 'ngu';
      const groupPhongMap = specialLoai === 'an' ? cfg?.lop_phong_an : cfg?.lop_phong_ngu;
      const extraHsList = cfg?.hs_them_vao || [];
      const phongCol = specialLoai === 'an' ? 'phong_an' : 'phong_ngu';
      
      const isAllowed = (hs) => {
        if (!cfg) return true;
        const lopList = cfg.lop_ap_dung;
        const loaiTru = cfg.hs_loai_tru;
        if (extraHsList.some(x => x.id === hs.id)) return true;
        if (lopList && lopList.length > 0 && !lopList.includes(hs.lop)) return false;
        if (loaiTru && loaiTru.length > 0 && loaiTru.includes(hs.id)) return false;
        return true;
      };

      const getStudentsForRoom = (ma_phong) => {
        const phongObj = phongList.find(p => p.ma_phong === ma_phong);
        const phongGt = phongObj ? phongObj.gioi_tinh : null;
        
        const isGenderCompatible = (hs) => {
            if (specialLoai === 'an') return true; 
            if (phongGt === null || phongGt === undefined) return true;
            if (hs.gioi_tinh === null || hs.gioi_tinh === undefined) return true;
            return hs.gioi_tinh === phongGt;
        };

        const overridedElsewhere = new Set(
            extraHsList.filter(x => x[phongCol] && x[phongCol] !== ma_phong).map(x => x.id)
        );

        const base = allHs.filter(hs => {
            if (!isAllowed(hs)) return false;
            if (!isGenderCompatible(hs)) return false;
            if (overridedElsewhere.has(hs.id)) return false;
            const groupPhong = groupPhongMap?.[hs.lop];
            if (groupPhong) return groupPhong === ma_phong;
            if (phongTam) return phongTam === ma_phong;
            return hs[phongCol] === ma_phong;
        });

        const extraFiltered = extraHsList.filter(x => {
            const baseHs = allHs.find(h => h.id === x.id);
            if (!baseHs) return false;
            if (!isGenderCompatible(baseHs)) return false;
            const effectivePhong = x[phongCol] || groupPhongMap?.[baseHs.lop] || phongTam || baseHs[phongCol];
            return effectivePhong === ma_phong;
        }).filter(x => !base.find(s => s.id === x.id))
          .map(x => {
              const baseHs = allHs.find(h => h.id === x.id);
              return { ...(baseHs || {}), ...x, [phongCol]: ma_phong };
          });

        return [...base, ...extraFiltered];
      };

      const overrideCodes = extraHsList.filter(x => x[phongCol]).map(x => x[phongCol]);
      const groupCodes = groupPhongMap ? Object.values(groupPhongMap) : [];
      const allCodes = [...new Set([phongTam, ...overrideCodes, ...groupCodes])].filter(Boolean);
      
      let visiblePhongList = [];
      if (cfg && allCodes.length > 0) {
          visiblePhongList = allCodes.map(code => phongList.find(p => p.ma_phong === code)).filter(Boolean);
      } else {
          visiblePhongList = phongList.filter(p => getStudentsForRoom(p.ma_phong).length > 0);
          if (visiblePhongList.length === 0) visiblePhongList = phongList;
      }

      const byPhong = {};
      visiblePhongList.forEach(p => {
          const stu = getStudentsForRoom(p.ma_phong);
          if (stu && stu.length > 0) {
              byPhong[p.ma_phong] = stu;
          }
      });

      if (Object.keys(byPhong).length === 0) { alert('Không có học sinh nào trong ngày này!'); return; }

      const splitByTeachers = (students, numTeachers) => {
          if (numTeachers <= 1) return [students];
          const byClass = {};
          students.forEach(s => { const k = s.lop || ''; if (!byClass[k]) byClass[k] = []; byClass[k].push(s); });
          const classes = Object.keys(byClass).sort();
          const groups = Array.from({ length: numTeachers }, () => []);
          const sizes = Array(numTeachers).fill(0);
          classes.forEach(cls => {
              const minIdx = sizes.indexOf(Math.min(...sizes));
              byClass[cls].forEach(s => groups[minIdx].push(s));
              sizes[minIdx] += byClass[cls].length;
          });
          const MAX_DIFF = 10;
          let changed = true;
          while (changed) {
              changed = false;
              for (let i = 0; i < groups.length; i++) {
                  for (let j = 0; j < groups.length; j++) {
                      if (i === j) continue;
                      const diff = groups[i].length - groups[j].length;
                      if (diff > MAX_DIFF) {
                          const clsInI = [...new Set(groups[i].map(s => s.lop || ''))].sort((a, b) =>
                              groups[i].filter(s => (s.lop || '') === a).length - groups[i].filter(s => (s.lop || '') === b).length
                          );
                          let moved = false;
                          for (const cls of clsInI) {
                              const clsStu = groups[i].filter(s => (s.lop || '') === cls);
                              const newDiff = (groups[i].length - clsStu.length) - (groups[j].length + clsStu.length);
                              if (Math.abs(newDiff) < Math.abs(diff)) {
                                  clsStu.forEach(s => groups[j].push(s));
                                  groups[i] = groups[i].filter(s => (s.lop || '') !== cls);
                                  sizes[i] -= clsStu.length; sizes[j] += clsStu.length;
                                  changed = true; moved = true; break;
                              }
                          }
                          if (moved) break;
                      }
                  }
                  if (changed) break;
              }
          }
          return groups.filter(g => g.length > 0);
      };

      const getSymHTML = (hsId) => {
        const val = ddMap[hsId]?.[specialDate]?.[loaiField];
        if (val === 0) return '<span class="mk-c">✓</span>';
        if (val === 1) return '<span class="mk-v">✗</span>';
        if (val === 2) return '<span class="mk-p">P</span>';
        return '';
      };
      
      const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth()+1} năm ${new Date().getFullYear()}`;
      
      const phongCodes = Object.keys(byPhong).sort();
      const htmlPages = phongCodes.flatMap(ma_phong => {
          const roomStudents = byPhong[ma_phong].sort((a, b) => a.id - b.id);
          const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
          const numTeachers = phongInfo?.sl_diem_danh || 1;
          const roomTotal = roomStudents.length;
          const roomComat = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 0).length;
          const roomVang  = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 1).length;
          const roomPhep  = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 2).length;
          const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
          const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
          const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
          const roomClasses = [...new Set(roomStudents.map(s => s.lop).filter(Boolean))].sort();
          const roomLopList = roomClasses.length > 0 ? roomClasses.join(', ') : 'Không rõ';

          const chunks = splitByTeachers(roomStudents, numTeachers);
          const totalPages = chunks.length;
          let off = 0;
          const offsets = chunks.map(chunk => { const o = off; off += chunk.length; return o; });

          return chunks.map((chunk, pageIdx) => {
              chunk.sort((a, b) => a.id - b.id);
              const pageLabel = totalPages > 1 ? ` (Tờ ${pageIdx + 1}/${totalPages})` : '';
              const globalOffset = offsets[pageIdx];

              const dataRows = chunk.map((s, i) => {
                  const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                  return `<tr>
  <td class="col-stt">${globalOffset + i + 1}</td>
  <td class="col-msbt">${s.id}</td>
  <td style="text-align:left;padding-left:6px;">${s.ho_ten}</td>
  <td class="col-gt">${gt}</td>
  <td class="col-lop">${s.lop}</td>
  <td class="col-phong">${ma_phong}</td>
  <td class="col-dd">${getSymHTML(s.id)}</td>
  <td class="col-ghichu"></td>
</tr>`;
              }).join('');

              return `<div class="room-block">
<table class="hdr-inner"><tr>
  <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-title"><h1>ĐIỂM DANH ${loaiLabel}</h1></td>
</tr><tr><td class="hdr-title">
  <h2>NĂM HỌC ${namHoc} &nbsp;|&nbsp; ĐẶC BIỆT${pageLabel}</h2>
  <div style="font-size:10pt;margin-top:2px;">Ngày: <strong>${fmtDate(specialDate)}</strong> &nbsp;|&nbsp; Lớp: <strong>${roomLopList}</strong> &nbsp;|&nbsp; P.${specialLoai === 'an' ? 'Ăn' : 'Ngủ'}: <strong>${ma_phong}</strong></div>
</td></tr></table>
<div class="stat-box">Phòng ${ma_phong}: <strong>${roomTotal} HS</strong> &nbsp;|&nbsp; Có mặt: <strong style="color:#16a34a">${roomComat}</strong> &nbsp;|&nbsp; Vắng: <strong style="color:#dc2626">${roomVang}</strong> &nbsp;|&nbsp; Phép: <strong style="color:#d97706">${roomPhep}</strong></div>
<table class="dt" style="margin-top:6px;"><thead><tr>
  <th class="col-stt">STT</th><th class="col-msbt" style="color:#c00;">Mã<br>số BT</th>
  <th style="width:35%;">HỌC SINH</th><th class="col-gt">GT</th><th class="col-lop">Lớp</th>
  <th class="col-phong">P.${specialLoai === 'an' ? 'ĂN' : 'NGỦ'}</th>
  <th class="col-dd">Đ.DANH</th><th class="col-ghichu">Ghi chú</th>
</tr></thead><tbody>${dataRows}</tbody></table>
<div class="ft-wrap">
  <div class="ft-left">
    <div>Phòng ${ma_phong}: <strong>${roomTotal} HS</strong>${totalPages > 1 ? ` &nbsp;|&nbsp; Tờ này: <strong>${chunk.length} HS</strong>` : ''}</div>
    <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: <strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: <strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right">
    <div><em>${todayStr}</em></div>
    <div class="sig-title">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space"></div>
    <div class="sig-name">${nguoiPhuTrach}</div>
  </div>
</div>
</div>`;
          });
      }).join('');

      const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; }
.mk-c { color:#16a34a; font-weight:bold; } .mk-v { color:#dc2626; font-weight:bold; } .mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; } .room-block:first-of-type { page-break-before: auto; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:4px; }
.hdr-inner td { border:none; padding:2px 4px; vertical-align:middle; }
.hdr-school { width:28%; text-align:center; font-size:10pt; line-height:1.4; }
.hdr-title { text-align:center; }
.hdr-title h1 { font-size:14pt; font-weight:bold; text-transform:uppercase; }
.hdr-title h2 { font-size:11pt; font-weight:bold; margin-top:2px; }
.stat-box { margin-top:4px; padding:4px 10px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:4px; font-size:9.5pt; display:inline-flex; gap:16px; }
.dt { width:100%; border-collapse:collapse; }
.dt th { border:0.8px solid #333; padding:4px 2px; text-align:center; background:#ececec; font-weight:bold; font-size:9pt; }
.dt td { border:0.8px solid #555; padding:4px 2px; vertical-align:middle; font-size:11pt; }
.col-stt{width:6mm;text-align:center} .col-msbt{width:10mm;text-align:center;font-weight:bold}
.col-gt{width:7mm;text-align:center} .col-lop{width:12mm;text-align:center}
.col-phong{width:11mm;text-align:center} .col-dd{width:10mm;text-align:center} .col-ghichu{width:14mm}
.ft-wrap{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid;}
.ft-left{flex:1;line-height:1.7} .ft-right{flex:1;text-align:center}
.sig-title{font-weight:bold;margin-top:4px} .sig-space{height:44px} .sig-name{font-weight:bold;font-style:italic}
@page{size:A4 portrait;margin:1cm 0.8cm 1.2cm 0.8cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt th{background:#ececec!important}}`;

      const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}</style></head><body>
${htmlPages}
<script>window.onload=function(){setTimeout(window.print,400);}</script>
</body></html>`;
      const w = window.open('', '_blank');
      if (!w) { alert('Trình duyệt chặn popup!'); return; }
      w.document.write(html); w.document.close();
      setShowSpecialModal(false);
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setExportingSpecial(false); }
  };

  // ── Hàm xuất Excel Tổng hợp theo Lớp ──────────────────────────────
  const openTongHopLopModal = async () => {
    setShowTongHopLopModal(true);
    setThLopData(null);
    setThLopSelected('');
    await fetchThLop(thLopMonth);
  };

  const fetchThLop = async (monthStr) => {
    const [y, m] = monthStr.split('-');
    setLoadingThLop(true);
    try {
      const res = await api.get(`/api/baocao/tong-hop-lop/?thang=${m}&nam=${y}`);
      if (res.data?.ok) setThLopData(res.data);
    } catch { /* ignore */ }
    finally { setLoadingThLop(false); }
  };

  const exportThLopExcel = () => {
    if (!thLopData) return;
    const { data, so_thang, so_nam, tong_buoi_an, tong_buoi_ngu, gia_an, gia_ngu } = thLopData;
    const filteredData = thLopSelected ? data.filter(h => h.lop === thLopSelected) : data;
    if (filteredData.length === 0) { alert('Không có dữ liệu!'); return; }
    
    const lopMap = {};
    filteredData.forEach(h => { if (!lopMap[h.lop]) lopMap[h.lop] = []; lopMap[h.lop].push(h); });
    const wb = XLSX.utils.book_new();
    // Sheet tổng hợp toàn trường
    const headerAll = ['STT','Mã số BT','Họ và tên','Lớp','GT',
      'TS Buổi ăn','Ăn thực tế','Vắng ăn','Phép ăn',
      'TS Buổi ngủ','Ngủ thực tế','Vắng ngủ','Phép ngủ',
      'Tiền ăn (đ)','Tiền ngủ (đ)','TỔNG TIỀN (đ)'
    ];
    const aoaAll = [
      [`BẢNG TỔNG HỢP CHUYÊN CẦN VÀ THU TIỀN BÁN TRÚ – THÁNG ${so_thang}/${so_nam}`],
      [`Tổng buổi ăn: ${tong_buoi_an} | Tổng buổi ngủ: ${tong_buoi_ngu} | Đơn giá ăn: ${gia_an.toLocaleString('vi-VN')}đ | Đơn giá ngủ: ${gia_ngu.toLocaleString('vi-VN')}đ`],
      [],
      headerAll,
      ...data.map((h, i) => [
        i+1, h.id, h.ho_ten, h.lop, h.gioi_tinh===0?'Nam':'Nữ',
        h.tong_buoi_an, h.buoi_an_thuc_te, h.vang_an, h.phep_an,
        h.tong_buoi_ngu, h.buoi_ngu_thuc_te, h.vang_ngu, h.phep_ngu,
        h.tien_an, h.tien_ngu, h.tong_tien
      ])
    ];
    const wsAll = XLSX.utils.aoa_to_sheet(aoaAll);
    wsAll['!cols'] = [{wch:5},{wch:8},{wch:28},{wch:8},{wch:5},{wch:8},{wch:10},{wch:8},{wch:8},{wch:8},{wch:10},{wch:8},{wch:8},{wch:14},{wch:14},{wch:16}];
    if (!thLopSelected) XLSX.utils.book_append_sheet(wb, wsAll, 'Toan_truong');
    // Sheet từng lớp
    Object.entries(lopMap).sort(([a],[b])=>a.localeCompare(b)).forEach(([lop, hsArr]) => {
      const maxBuoiAnLop = Math.max(...hsArr.map(h => h.tong_buoi_an));
      const maxBuoiNguLop = Math.max(...hsArr.map(h => h.tong_buoi_ngu));
      const aoa = [
        [`BẢNG THU TIỀN BÁN TRÚ – LỚP ${lop} – THÁNG ${so_thang}/${so_nam}`],
        [`Tổng buổi ăn: ${maxBuoiAnLop} | Tổng buổi ngủ: ${maxBuoiNguLop} | Đơn giá ăn: ${gia_an.toLocaleString('vi-VN')}đ | Đơn giá ngủ: ${gia_ngu.toLocaleString('vi-VN')}đ`],
        [],
        headerAll,
        ...hsArr.map((h, i) => [
          i+1, h.id, h.ho_ten, h.lop, h.gioi_tinh===0?'Nam':'Nữ',
          h.tong_buoi_an, h.buoi_an_thuc_te, h.vang_an, h.phep_an,
          h.tong_buoi_ngu, h.buoi_ngu_thuc_te, h.vang_ngu, h.phep_ngu,
          h.tien_an, h.tien_ngu, h.tong_tien
        ]),
        ['','','','','TỔNG',
          hsArr.reduce((a,h)=>a+h.tong_buoi_an,0),'','','',
          hsArr.reduce((a,h)=>a+h.tong_buoi_ngu,0),'','','',
          hsArr.reduce((a,h)=>a+h.tien_an,0),
          hsArr.reduce((a,h)=>a+h.tien_ngu,0),
          hsArr.reduce((a,h)=>a+h.tong_tien,0)
        ]
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:5},{wch:8},{wch:28},{wch:8},{wch:5},{wch:8},{wch:10},{wch:8},{wch:8},{wch:8},{wch:10},{wch:8},{wch:8},{wch:14},{wch:14},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws, `Lop_${lop}`.substring(0,31));
    });
    XLSX.writeFile(wb, `TongHop_BanTru_Thang${so_thang}_${so_nam}.xlsx`);
  };

  const exportThLopPDF = () => {
    if (!thLopData) return;
    const { data, so_thang, so_nam, tong_buoi_an, tong_buoi_ngu, gia_an, gia_ngu, nam_hoc, nguoi_phu_trach } = thLopData;
    const filteredData = thLopSelected ? data.filter(h => h.lop === thLopSelected) : data;
    if (filteredData.length === 0) { alert('Không có dữ liệu!'); return; }
    
    const fmtM = n => n.toLocaleString('vi-VN');
    const lopMap = {};
    filteredData.forEach(h => { if (!lopMap[h.lop]) lopMap[h.lop] = []; lopMap[h.lop].push(h); });
    const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth()+1} năm ${new Date().getFullYear()}`;
    const htmlPages = Object.entries(lopMap).sort(([a],[b])=>a.localeCompare(b)).map(([lop, hsArr]) => {
      const tongTienLop = hsArr.reduce((a,h)=>a+h.tong_tien,0);
      const maxBuoiAnLop = Math.max(...hsArr.map(h => h.tong_buoi_an));
      const maxBuoiNguLop = Math.max(...hsArr.map(h => h.tong_buoi_ngu));
      const rows = hsArr.map((h,i) => `<tr>
        <td class="c">${i+1}</td>
        <td class="c b">${h.id}</td>
        <td class="l">${h.ho_ten}</td>
        <td class="c">${h.gioi_tinh===0?'Nam':'Nữ'}</td>
        <td class="c">${h.tong_buoi_an}</td><td class="c hl">${h.buoi_an_thuc_te}</td><td class="c r">${h.vang_an}</td><td class="c r">${h.phep_an}</td>
        <td class="c">${h.tong_buoi_ngu}</td><td class="c hl">${h.buoi_ngu_thuc_te}</td><td class="c r">${h.vang_ngu}</td><td class="c r">${h.phep_ngu}</td>
        <td class="r">${fmtM(h.tien_an)}</td><td class="r">${fmtM(h.tien_ngu)}</td>
        <td class="r b total">${fmtM(h.tong_tien)}</td>
        <td class="ghichu"></td>
      </tr>`).join('');
      return `<div class="page">
<table class="hdr"><tr>
  <td class="hdr-l" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-c"><h1>BẢNG THU TIỀN BÁN TRÚ</h1></td>
</tr><tr><td class="hdr-c">
  <h2>NĂM HỌC ${nam_hoc} | THÁNG ${so_thang}/${so_nam} | LỚP ${lop}</h2>
  <div class="sub">Tổng: ${maxBuoiAnLop} buổi ăn | ${maxBuoiNguLop} buổi ngủ | Đơn giá ăn: ${fmtM(gia_an)}đ | Đơn giá ngủ: ${fmtM(gia_ngu)}đ</div>
</td></tr></table>
<table class="dt">
<thead><tr>
  <th rowspan="2" class="c" style="width:5mm">STT</th>
  <th rowspan="2" class="c" style="width:9mm;color:#c00">Mã<br>số BT</th>
  <th rowspan="2" style="width:38mm">HỌC SINH</th>
  <th rowspan="2" class="c" style="width:7mm">GT</th>
  <th colspan="4" class="c an-col">ĂN TRƯA</th>
  <th colspan="4" class="c ngu-col">NGỦ TRƯA</th>
  <th colspan="2" class="c tien-col">TIỀN (đ)</th>
  <th rowspan="2" class="c total-col">TỔNG TIỀN (đ)</th>
  <th rowspan="2" class="c" style="width:14mm">Ghi chú</th>
</tr><tr>
  <th class="c an-col" style="width:10mm">TS<br>buổi</th><th class="c hl" style="width:10mm">Thực<br>tế</th><th class="c" style="width:8mm">Vắng</th><th class="c" style="width:8mm">Phép</th>
  <th class="c ngu-col" style="width:10mm">TS<br>buổi</th><th class="c hl" style="width:10mm">Thực<br>tế</th><th class="c" style="width:8mm">Vắng</th><th class="c" style="width:8mm">Phép</th>
  <th class="c tien-col" style="width:16mm">Tiền ăn</th><th class="c tien-col" style="width:16mm">Tiền ngủ</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="4" class="b r">TỔNG CỘNG</td>
  <td class="c">${hsArr.reduce((a,h)=>a+h.tong_buoi_an,0)}</td><td class="c hl b">${hsArr.reduce((a,h)=>a+h.buoi_an_thuc_te,0)}</td><td class="c">${hsArr.reduce((a,h)=>a+h.vang_an,0)}</td><td class="c">${hsArr.reduce((a,h)=>a+h.phep_an,0)}</td>
  <td class="c">${hsArr.reduce((a,h)=>a+h.tong_buoi_ngu,0)}</td><td class="c hl b">${hsArr.reduce((a,h)=>a+h.buoi_ngu_thuc_te,0)}</td><td class="c">${hsArr.reduce((a,h)=>a+h.vang_ngu,0)}</td><td class="c">${hsArr.reduce((a,h)=>a+h.phep_ngu,0)}</td>
  <td class="r b">${fmtM(hsArr.reduce((a,h)=>a+h.tien_an,0))}</td><td class="r b">${fmtM(hsArr.reduce((a,h)=>a+h.tien_ngu,0))}</td>
  <td class="r b total">${fmtM(tongTienLop)}</td><td></td>
</tr></tfoot>
</table>
<div class="ft">
  <div class="ft-l"><div>Lớp ${lop}: <strong>${hsArr.length} học sinh</strong></div><div>Tổng thu: <strong>${fmtM(tongTienLop)} đồng</strong></div></div>
  <div class="ft-r"><div>${todayStr}</div><div class="sig-t">PHỤ TRÁCH BÁN TRÚ</div><div class="sig-s"></div><div class="sig-n">${nguoi_phu_trach}</div></div>
</div></div>`;
    }).join('');
    const css = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',serif;font-size:9pt;color:#000}
.page{page-break-before:always}.page:first-of-type{page-break-before:auto}
.hdr{width:100%;border-collapse:collapse;margin-bottom:4px}
.hdr td{border:none;padding:2px 6px;vertical-align:middle}
.hdr-l{width:22%;text-align:center;font-size:9pt;line-height:1.5}
.hdr-c{text-align:center}
.hdr-c h1{font-size:13pt;font-weight:bold;text-transform:uppercase}
.hdr-c h2{font-size:10pt;font-weight:bold;margin-top:2px}
.hdr-c .sub{font-size:8.5pt;margin-top:2px}
.dt{width:100%;border-collapse:collapse;margin-top:4px}
.dt th{border:.8px solid #333;padding:2px;text-align:center;background:#ececec;font-size:8pt;font-weight:bold;line-height:1.2}
.dt td{border:.8px solid #555;padding:2px;vertical-align:middle;font-size:8.5pt}
.c{text-align:center}.l{text-align:left;padding-left:4px}.r{text-align:right;padding-right:4px}.b{font-weight:bold}
.hl{background:#f0fff0;font-weight:bold}
.an-col{background:#fff8f0}.ngu-col{background:#f8f0ff}.tien-col{background:#f0f8ff}
.total-col{width:18mm;background:#fffde7;font-weight:bold}
.ghichu{width:14mm}
.total{color:#16a34a;font-weight:bold}
.r.b.total{color:#dc2626}
.ft{width:100%;margin-top:10px;display:flex;justify-content:space-between;font-size:9pt;page-break-inside:avoid}
.ft-l{flex:1;line-height:1.8}.ft-r{flex:1;text-align:center}
.sig-t{font-weight:bold;margin-top:4px}.sig-s{height:40px}.sig-n{font-weight:bold;font-style:italic}
@page{size:A4 landscape;margin:.8cm .8cm 1.2cm 1cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt th{background:#ececec!important}.hl{background:#f0fff0!important}.total-col{background:#fffde7!important}}`;
    const w = window.open('', '_blank');
    if (!w) { alert('Trình duyệt chặn popup!'); return; }
    w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Tổng hợp bán trú tháng ${so_thang}/${so_nam}</title><style>${css}</style></head><body>${htmlPages}<script>window.onload=function(){setTimeout(window.print,400);}<\/script></body></html>`);
    w.document.close();
  };

  // ── EXPORT ──
  const exportHsExcel = () => {
    const rows = [
      ['DANH SÁCH TỔNG HỢP ĐIỂM DANH HỌC SINH'],
      ['Tháng: ' + monthHS], [], 
      ['STT','Họ tên','Lớp','Ngày có mặt(Ăn)','Vắng(Ăn)','Phép(Ăn)','Ngày có mặt(Ngủ)','Vắng(Ngủ)','Phép(Ngủ)'], 
      ...hsData.map((h,i)=>[i+1, h.ho_ten, h.lop, h.so_ngay_co_mat_an, h.so_ngay_vang_an, h.so_ngay_phep_an, h.so_ngay_co_mat_ngu, h.so_ngay_vang_ngu, h.so_ngay_phep_ngu])
    ];
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'HS'); 
    XLSX.writeFile(wb, `baocao-hs-${monthHS}.xlsx`);
  };

  const exportGvExcel = () => {
    const rows = [
      ['BẢNG THỐNG KÊ LƯƠNG GIÁO VIÊN TRỰC BÁN TRÚ'],
      [`Tháng: ${monthGV}  |  Đơn giá ăn: ${giaAn.toLocaleString('vi-VN')}đ  |  Ngủ: ${giaNgu.toLocaleString('vi-VN')}đ`], [], 
      ['STT','Họ tên GV','Số ca ăn','Số ca ngủ','Tổng số ca','Tổng thành tiền (VNĐ)'], 
      ...gvData.map((g,i)=>[i+1, g.ho_ten, g.so_ca_an, g.so_ca_ngu, g.so_ca_an + g.so_ca_ngu, g.tong_tien.toLocaleString('vi-VN')])
    ];
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'GV'); 
    XLSX.writeFile(wb, `baocao-gv-${monthGV}.xlsx`);
  };

  const printPage = () => window.print();

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Thống kê &amp; Báo cáo</span>
          </div>
          <h2><i className="fas fa-chart-bar" style={{color:'var(--primary)',marginRight:8}}></i>Thống kê &amp; Báo cáo</h2>
          <p>Báo cáo chuyên cần học sinh và thống kê lương ca trực giáo viên theo thời gian thực tế.</p>
        </div>
        <div className="page-header-actions">
          {activeTab === 'panel-gv' && (
            <button className="btn btn-success btn-sm" onClick={exportGvExcel}><i className="fas fa-file-excel"></i> Xuất Excel Lương GV</button>
          )}
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="bc-main-tabs">
        <button className={`bc-main-tab${activeTab==='panel-hs'?' active':''}`} onClick={()=>setActiveTab('panel-hs')}>
          <i className="fas fa-users"></i> Thống kê Học sinh
        </button>
        <button className={`bc-main-tab${activeTab==='panel-gv'?' active':''}`} onClick={()=>setActiveTab('panel-gv')}>
          <i className="fas fa-chalkboard-teacher"></i> Thống kê Lương Giáo viên
        </button>
      </div>

      {/* PANEL HỌC SINH */}
      {activeTab === 'panel-hs' && (
        <div className="bc-main-panel active">
          {/* Filter bar */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14,flexWrap:'wrap'}}>
            <label style={{fontWeight:600}}><i className="fas fa-calendar-alt"></i> Chọn Tháng:</label>
            <input type="month" value={monthHS} onChange={e=>setMonthHS(e.target.value)} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #e2e8f0',fontFamily:'inherit'}} />
            <button className="btn btn-outline btn-sm" onClick={()=>setMonthHS(today.slice(0,7))}>Tháng này</button>
            <div style={{marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap:'wrap'}}>
              <button className="btn btn-primary btn-sm" style={{background:'#10b981', borderColor:'#10b981', fontWeight:600}} onClick={openTongHopLopModal}>
                <i className="fas fa-table"></i> Tổng hợp theo Lớp
              </button>
              <div className="bc-dropdown">
                <button className="btn btn-primary btn-sm" style={{background:'#0ea5e9', borderColor:'#0ea5e9', fontWeight:600}}>
                  <i className="fas fa-utensils"></i> Báo cáo Điểm danh Ăn <i className="fas fa-chevron-down" style={{marginLeft:4}}></i>
                </button>
                <div className="bc-dropdown-content">
                  <button onClick={openExportAnModal}><i className="fas fa-file-pdf" style={{color:'#0ea5e9'}}></i> In DS chính thức</button>
                  <button onClick={() => { setSpecialLoai('an'); setSpecialDate(today); setShowSpecialModal(true); }}><i className="fas fa-print" style={{color:'#f59e0b'}}></i> In ngày đặc biệt</button>
                </div>
              </div>
              <div className="bc-dropdown">
                <button className="btn btn-primary btn-sm" style={{background:'#6366f1', borderColor:'#6366f1', fontWeight:600}}>
                  <i className="fas fa-bed"></i> Báo cáo Điểm danh Ngủ <i className="fas fa-chevron-down" style={{marginLeft:4}}></i>
                </button>
                <div className="bc-dropdown-content">
                  <button onClick={openExportNguModal}><i className="fas fa-file-pdf" style={{color:'#6366f1'}}></i> In DS chính thức</button>
                  <button onClick={() => { setSpecialLoai('ngu'); setSpecialDate(today); setShowSpecialModal(true); }}><i className="fas fa-print" style={{color:'#6c5ce7'}}></i> In ngày đặc biệt</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bc-filter-row">
            <div className="bc-filter-item">
              <label><i className="fas fa-chalkboard"></i> Lớp:</label>
              <select value={lopFilter} onChange={e => setLopFilter(e.target.value)}>
                <option value="">Tất cả</option>
                {lopList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {lopList.length > 0 && !lopFilter && (
              <div style={{
                display: 'inline-flex', alignItems: 'flex-start', gap: 6,
                background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 8,
                padding: '5px 12px', fontSize: '0.82rem', color: '#0369a1', fontWeight: 600,
                flexWrap: 'wrap', maxWidth: '100%'
              }}>
                <i className="fas fa-school" style={{ marginTop: 2, color: '#0284c7' }}></i>
                <span>
                  <span style={{ opacity: 0.75, fontWeight: 500 }}>Đang hiện </span>
                  <strong>{lopList.length} lớp</strong>
                  <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.78rem', color: '#0369a1' }}>
                    ({formatLopList(lopList)})
                  </span>
                </span>
              </div>
            )}
            {lopFilter && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 8,
                padding: '5px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600
              }}>
                <i className="fas fa-filter"></i>
                Đang lọc lớp: <strong style={{ marginLeft: 4 }}>{lopFilter}</strong>
                <button onClick={() => setLopFilter('')} style={{
                  marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer',
                  color: '#b45309', fontSize: '0.75rem', padding: '0 2px', lineHeight: 1
                }} title="Bỏ lọc">
                  <i className="fas fa-times-circle"></i>
                </button>
              </div>
            )}
            {loadingHS && <span style={{color:'var(--primary)'}}><i className="fas fa-spinner fa-spin"></i> Đang tải...</span>}
          </div>

          {/* Stat cards */}
          <div className="bc-metrics-grid">
            <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-users"></i></div><div className="stat-card-info"><p>Tổng HS</p><h3>{totalHS}</h3><small></small></div></div>
            <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>HS có đi</p><h3>{comAn}</h3></div></div>
            <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>HS có vắng</p><h3>{vang}</h3></div></div>
            <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>HS có phép</p><h3>{phep}</h3></div></div>
          </div>

          {/* Charts */}
          <div className="bc-charts-row">
            <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-pie"></i> Tỉ lệ vắng/có mặt trong tháng</div><div className="bc-chart-canvas" style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}>{totalHS > 0 ? <Doughnut data={donutData} options={{plugins:{legend:{position:'bottom'}},cutout:'65%'}} /> : <span style={{opacity:0.5}}>Chưa có dữ liệu</span>}</div></div>
            
            {/* Khối cards */}
            <div style={{flex:1, display:'flex', flexDirection:'column', gap:12}}>
              {khoiStats.map(({k,t,va,vn,p})=>{
                return (
                  <div key={k} className="bc-khoi-card" style={{margin:0}}>
                    <div className={`bc-khoi-header k${k}`}><i className="fas fa-school"></i> KHỐI {k}</div>
                    <div className="bc-khoi-body" style={{padding:'8px 12px'}}>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng HS</span><span className="bc-khoi-stat-value">{t}</span></div>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng lượt vắng (Ăn/Ngủ)</span><span className="bc-khoi-stat-value">{va} / {vn}</span></div>
                      <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Lượt phép</span><span className="bc-khoi-stat-value">{p}</span></div>
                    </div>
                  </div>
                );
              })}
              {khoiStats.length === 0 && <div className="bc-empty"><i className="fas fa-inbox"></i> Chưa có dữ liệu điểm danh tháng này</div>}
            </div>
          </div>

          {/* Bảng chi tiết HS */}
          <div className="bc-detail-section" style={{marginTop:18}}>
            <div className="bc-detail-header">
              <h3><i className="fas fa-list-alt"></i> Tổng hợp chuyên cần từng học sinh (Tháng {monthHS})</h3>
              <div className="bc-export-btns">
                <button className="btn btn-success btn-sm" onClick={exportHsExcel}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table" id="bc-detail-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>#</th><th rowSpan={2}>Họ tên</th><th rowSpan={2}>Lớp</th>
                    <th colSpan={3} style={{textAlign:'center', background:'#fdf8f6'}}>Ca Ăn</th>
                    <th colSpan={3} style={{textAlign:'center', background:'#f8f9fa'}}>Ca Ngủ</th>
                  </tr>
                  <tr>
                    <th style={{background:'#fdf8f6'}}>Có mặt</th><th style={{background:'#fdf8f6'}}>Vắng</th><th style={{background:'#fdf8f6'}}>Phép</th>
                    <th style={{background:'#f8f9fa'}}>Có mặt</th><th style={{background:'#f8f9fa'}}>Vắng</th><th style={{background:'#f8f9fa'}}>Phép</th>
                  </tr>
                </thead>
                <tbody>
                  {hsData.slice(hsPage * HS_PER_PAGE, (hsPage + 1) * HS_PER_PAGE).map((h, i) => (
                    <tr key={h.id}>
                      <td>{hsPage * HS_PER_PAGE + i + 1}</td><td><b>{h.ho_ten}</b></td><td>{h.lop}</td>
                      <td>{h.so_ngay_co_mat_an}</td>
                      <td><span className={h.so_ngay_vang_an>0?'badge badge-danger':''}>{h.so_ngay_vang_an || '0'}</span></td>
                      <td>{h.so_ngay_phep_an}</td>
                      <td>{h.so_ngay_co_mat_ngu}</td>
                      <td><span className={h.so_ngay_vang_ngu>0?'badge badge-warning':''}>{h.so_ngay_vang_ngu || '0'}</span></td>
                      <td>{h.so_ngay_phep_ngu}</td>
                    </tr>
                  ))}
                  {hsData.length === 0 && <tr><td colSpan={9} style={{textAlign:'center', padding:16, color:'#94a3b8'}}>Không có dữ liệu cho tháng {monthHS}</td></tr>}
                </tbody>
              </table>
            </div>
            {/* Phân trang */}
            {hsData.length > HS_PER_PAGE && (() => {
              const totalPages = Math.ceil(hsData.length / HS_PER_PAGE);
              // Build range: 1, ..., cur-1, cur, cur+1, ..., last
              const buildRange = (cur, total) => {
                const pages = [];
                const add = (n) => { if (n >= 0 && n < total && !pages.includes(n)) pages.push(n); };
                add(0); add(1);
                add(cur - 1); add(cur); add(cur + 1);
                add(total - 2); add(total - 1);
                pages.sort((a, b) => a - b);
                // Insert '...' between gaps
                const result = [];
                pages.forEach((p, i) => {
                  if (i > 0 && p - pages[i - 1] > 1) result.push('...');
                  result.push(p);
                });
                return result;
              };
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '8px 4px', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    Hiển thị <strong>{hsPage * HS_PER_PAGE + 1}</strong>–<strong>{Math.min((hsPage + 1) * HS_PER_PAGE, hsData.length)}</strong> / <strong>{hsData.length}</strong> HS
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setHsPage(p => Math.max(0, p - 1))} disabled={hsPage === 0}>
                      <i className="fas fa-chevron-left"></i> Trước
                    </button>
                    {buildRange(hsPage, totalPages).map((item, idx) =>
                      item === '...'
                        ? <span key={`dot-${idx}`} style={{ padding: '0 4px', color: '#94a3b8', userSelect: 'none' }}>…</span>
                        : <button key={item} className={`btn btn-sm ${item === hsPage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHsPage(item)} style={{ minWidth: 36 }}>{item + 1}</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setHsPage(p => Math.min(totalPages - 1, p + 1))} disabled={hsPage >= totalPages - 1}>
                      Tiếp <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* PANEL GIÁO VIÊN */}
      {activeTab === 'panel-gv' && (
        <div className="bc-main-panel active">
          <div className="bc-filter-row" style={{marginBottom:18}}>
            <div className="bc-filter-item"><label><i className="fas fa-calendar-alt"></i> Tháng:</label><input type="month" value={monthGV} onChange={e=>setMonthGV(e.target.value)} /></div>
            {loadingGV && <span style={{color:'var(--primary)'}}><i className="fas fa-spinner fa-spin"></i> Đang tính lương...</span>}
            <div style={{marginLeft:'auto',display:'flex',gap:8}}>
              <button className="btn btn-success btn-sm" onClick={exportGvExcel}><i className="fas fa-file-excel"></i> Xuất Excel</button>
              <button className="btn btn-ghost btn-sm" onClick={printPage}><i className="fas fa-print"></i> In</button>
            </div>
          </div>

          {/* Stat cards GV */}
          <div className="gv-stat-grid">
            <div className="gv-unit-card"><div className="gv-unit-icon purple"><i className="fas fa-chalkboard-teacher"></i></div><div className="gv-unit-info"><p>Tổng GV tham gia</p><h3>{gvData.length}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon blue"><i className="fas fa-calendar-check"></i></div><div className="gv-unit-info"><p>Tổng ca trực (tháng)</p><h3>{totCaAn+totCaNgu}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon green"><i className="fas fa-utensils"></i></div><div className="gv-unit-info"><p>Ca ăn / Ca ngủ</p><h3>{totCaAn} / {totCaNgu}</h3></div></div>
            <div className="gv-unit-card"><div className="gv-unit-icon orange"><i className="fas fa-money-bill-wave"></i></div><div className="gv-unit-info"><p>Tổng tiền trực</p><h3>{totTien.toLocaleString('vi-VN')} đ</h3></div></div>
          </div>

          {/* Charts GV */}
          {gvData.length > 0 && (
            <div className="bc-charts-row" style={{marginBottom:18}}>
              <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-pie"></i> Tỷ trọng ca trực</div><div className="bc-chart-canvas" style={{height:220,display:'flex',alignItems:'center',justifyContent:'center'}}><Doughnut data={gvDonut} options={{plugins:{legend:{position:'bottom'}},cutout:'65%'}} /></div></div>
              <div className="bc-chart-card"><div className="bc-chart-title"><i className="fas fa-chart-bar"></i> Số ca trực theo GV</div><div className="bc-chart-canvas"><Bar data={gvBar} options={{responsive:true,scales:{x:{stacked:false},y:{beginAtZero:true}},plugins:{legend:{position:'top'}}}} /></div></div>
            </div>
          )}

          {/* Bảng chi tiết GV */}
          <div className="bc-detail-section">
            <div className="bc-detail-header">
              <h3><i className="fas fa-table"></i> Bảng tính tiền trực theo giáo viên (Tháng {monthGV})</h3>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f8fafc',borderRadius:8,padding:'7px 14px'}}>
                  <i className="fas fa-tag" style={{color:'#64748b',fontSize:'.8rem'}}></i>
                  <span style={{fontSize:'.8rem',color:'#64748b'}}>Đơn giá cấu hình:</span>
                  <span className="ca-an-badge" style={{fontSize:'.8rem'}}>🍽️ {giaAn.toLocaleString('vi-VN')}đ/ca</span>
                  <span className="ca-ngu-badge" style={{fontSize:'.8rem'}}>🛏️ {giaNgu.toLocaleString('vi-VN')}đ/ca</span>
                </div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table" id="gv-detail-table">
                <thead><tr><th style={{width:44}}>STT</th><th>Họ tên GV</th><th style={{textAlign:'center'}}>Số ca ăn 🍽️</th><th style={{textAlign:'center'}}>Số ca ngủ 🛏️</th><th style={{textAlign:'right',minWidth:200}}>Thành tiền (VNĐ)</th></tr></thead>
                <tbody>
                  {gvData.map((g,i)=>(
                    <tr key={g.id}>
                      <td style={{textAlign:'center',color:'#64748b',fontWeight:600}}>{i+1}</td>
                      <td><strong>{g.ho_ten}</strong></td>
                      <td style={{textAlign:'center'}}><span className="ca-an-badge">{g.so_ca_an} ca</span></td>
                      <td style={{textAlign:'center'}}><span className="ca-ngu-badge">{g.so_ca_ngu} ca</span></td>
                      <td style={{textAlign:'right'}}>
                        <div style={{fontWeight:800,color:'#00b894',fontSize:'1rem'}}>{g.tong_tien.toLocaleString('vi-VN')}đ</div>
                        <div style={{fontSize:'.74rem',color:'#b7791f'}}>{(g.so_ca_an*giaAn).toLocaleString('vi-VN')}đ ăn</div>
                        <div style={{fontSize:'.74rem',color:'#6c5ce7'}}>{(g.so_ca_ngu*giaNgu).toLocaleString('vi-VN')}đ ngủ</div>
                      </td>
                    </tr>
                  ))}
                  {gvData.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:16, color:'#94a3b8'}}>Không có lịch trực nào đã được xác nhận trong tháng {monthGV}</td></tr>}
                </tbody>
                {gvData.length > 0 && (
                  <tfoot>
                    <tr style={{background:'linear-gradient(90deg,rgba(0,156,255,.06),rgba(108,92,231,.04))'}}>
                      <td colSpan={2} style={{fontWeight:800,fontSize:'.9rem'}}><i className="fas fa-sigma" style={{color:'var(--primary)',marginRight:4}}></i>TỔNG CỘNG</td>
                      <td style={{textAlign:'center'}}><span className="ca-an-badge" style={{fontWeight:800}}>{totCaAn} ca</span></td>
                      <td style={{textAlign:'center'}}><span className="ca-ngu-badge" style={{fontWeight:800}}>{totCaNgu} ca</span></td>
                      <td style={{textAlign:'right',fontWeight:800,color:'#00b894',fontSize:'1.05rem'}}>{totTien.toLocaleString('vi-VN')}đ</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL XUẤT BÁO CÁO ĐIỂM DANH ĂN ── */}
      {showExportAnModal && (
        <div className="export-modal-overlay">
          <div className="export-modal">
            <div className="export-modal-header">
              <div className="icon"><i className="fas fa-file-pdf"></i></div>
              <div>
                <h3>Xuất báo cáo điểm danh Ăn theo tháng</h3>
                <p>Dữ liệu thực tế từ DB — số buổi bán trú tự động chính xác</p>
              </div>
            </div>
            <div className="export-modal-body">
              <div className="export-modal-group">
                <div className="export-modal-section-title">THÁNG IN</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <select className="export-modal-select" value={exportAnMonth} onChange={e=>setExportAnMonth(Number(e.target.value))}>
                    {[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                  </select>
                  <span style={{color:'#64748b',fontWeight:600}}>/</span>
                  <select className="export-modal-select" value={exportAnYear} onChange={e=>setExportAnYear(Number(e.target.value))}>
                    {[...Array(5)].map((_,i)=>{const y=new Date().getFullYear()-2+i;return <option key={y} value={y}>{y}</option>;})}
                  </select>
                </div>
                <p style={{fontSize:'0.75rem',color:'#64748b',marginTop:8}}>
                  <i className="fas fa-info-circle" style={{color:'#6366f1'}}></i> Số buổi bán trú tự động lấy từ lịch phân công thực tế — ngày nghỉ được loại tự động.
                </p>
              </div>
              <div className="export-modal-group">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div className="export-modal-section-title" style={{margin:0}}>
                    <i className="fas fa-calendar-week" style={{color:'#6366f1'}}></i> CHỌN TUẦN IN
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:4,border:'1px solid #6366f1',background:'#eef2ff',color:'#4f46e5',cursor:'pointer',fontWeight:600}}
                      onClick={()=>setExportAnWeeksActive(weekLabelsAn.map((_,i)=>i))}>Chọn tất cả</button>
                    <button style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:4,border:'1px solid #e2e8f0',background:'#f8fafc',color:'#64748b',cursor:'pointer'}}
                      onClick={()=>setExportAnWeeksActive([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px'}}>
                  {weekLabelsAn.map((lbl, wIndex) => {
                    const active = exportAnWeeksActive.includes(wIndex);
                    return (
                      <label key={wIndex} style={{
                        display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                        borderRadius:7,cursor:'pointer',userSelect:'none',
                        background:active?'#eef2ff':'#f8fafc',
                        border:`1.5px solid ${active?'#6366f1':'#e2e8f0'}`,
                        fontWeight:active?600:400,color:active?'#4f46e5':'#64748b',
                      }}>
                        <input type="checkbox" checked={active} style={{accentColor:'#6366f1'}}
                          onChange={e=>{
                            if(e.target.checked) setExportAnWeeksActive(prev=>[...prev,wIndex]);
                            else setExportAnWeeksActive(prev=>prev.filter(w=>w!==wIndex));
                          }}/>
                        <span style={{fontSize:'0.82rem'}}>
                          <span style={{fontWeight:700}}>{lbl.split(':')[0]}</span>
                          <span style={{fontWeight:400,fontSize:'0.75rem',marginLeft:4,color:active?'#6366f1':'#94a3b8'}}>{lbl.split(': ')[1]}</span>
                        </span>
                        {!active && <span style={{marginLeft:'auto',fontSize:'0.68rem',background:'#fee2e2',color:'#dc2626',padding:'1px 5px',borderRadius:3,fontWeight:600}}>Nghỉ</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="export-modal-group">
                <div className="export-room-header">
                  <div className="export-modal-section-title" style={{margin:0}}>CHỌN PHÒNG</div>
                  <div className="export-room-actions">
                    <button onClick={()=>setExportAnRooms(exportAnPhongList.map(p=>p.ma_phong))}>Chọn tất cả</button>
                    <div className="divider"></div>
                    <button className="deselect" onClick={()=>setExportAnRooms([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div className="export-room-grid">
                  {exportAnPhongList.map(p=>(
                    <div key={p.ma_phong}
                      className={`export-room-pill ${exportAnRooms.includes(p.ma_phong)?'selected':''}`}
                      onClick={()=>setExportAnRooms(prev=>prev.includes(p.ma_phong)?prev.filter(r=>r!==p.ma_phong):[...prev,p.ma_phong])}>
                      {p.ma_phong}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowExportAnModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={exportBaoCaoAnExcel} disabled={exportingAn} style={{background:'#10b981',borderColor:'#10b981'}}>
                {exportingAn ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>} Xuất Excel
              </button>
              <button className="btn btn-primary" onClick={exportBaoCaoAnPDF} disabled={exportingAn} style={{background:'#ef4444',borderColor:'#ef4444'}}>
                {exportingAn ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>} Xuất PDF
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL XUẤT BÁO CÁO ĐIỂM DANH NGỦ ── */}
      {showExportNguModal && (
        <div className="export-modal-overlay">
          <div className="export-modal">
            <div className="export-modal-header" style={{background:'linear-gradient(90deg, #6366f1, #8b5cf6)'}}>
              <div className="icon"><i className="fas fa-bed"></i></div>
              <div>
                <h3>Xuất báo cáo điểm danh Ngủ theo tháng</h3>
                <p>Dữ liệu thực tế từ DB — số buổi bán trú tự động chính xác</p>
              </div>
            </div>
            <div className="export-modal-body">
              <div className="export-modal-group">
                <div className="export-modal-section-title">THÁNG IN</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <select className="export-modal-select" value={exportNguMonth} onChange={e=>setExportNguMonth(Number(e.target.value))}>
                    {[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>Tháng {i+1}</option>)}
                  </select>
                  <span style={{color:'#64748b',fontWeight:600}}>/</span>
                  <select className="export-modal-select" value={exportNguYear} onChange={e=>setExportNguYear(Number(e.target.value))}>
                    {[...Array(5)].map((_,i)=>{const y=new Date().getFullYear()-2+i;return <option key={y} value={y}>{y}</option>;})}
                  </select>
                </div>
                <p style={{fontSize:'0.75rem',color:'#64748b',marginTop:8}}>
                  <i className="fas fa-info-circle" style={{color:'#8b5cf6'}}></i> Số buổi bán trú tự động lấy từ lịch phân công thực tế — ngày nghỉ được loại tự động.
                </p>
              </div>
              <div className="export-modal-group">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div className="export-modal-section-title" style={{margin:0}}>
                    <i className="fas fa-calendar-week" style={{color:'#8b5cf6'}}></i> CHỌN TUẦN IN
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:4,border:'1px solid #8b5cf6',background:'#f5f3ff',color:'#7c3aed',cursor:'pointer',fontWeight:600}}
                      onClick={()=>setExportNguWeeksActive(weekLabelsNgu.map((_,i)=>i))}>Chọn tất cả</button>
                    <button style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:4,border:'1px solid #e2e8f0',background:'#f8fafc',color:'#64748b',cursor:'pointer'}}
                      onClick={()=>setExportNguWeeksActive([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px'}}>
                  {weekLabelsNgu.map((lbl, wIndex) => {
                    const active = exportNguWeeksActive.includes(wIndex);
                    return (
                      <label key={wIndex} style={{
                        display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                        borderRadius:7,cursor:'pointer',userSelect:'none',
                        background:active?'#f5f3ff':'#f8fafc',
                        border:`1.5px solid ${active?'#8b5cf6':'#e2e8f0'}`,
                        fontWeight:active?600:400,color:active?'#7c3aed':'#64748b',
                      }}>
                        <input type="checkbox" checked={active} style={{accentColor:'#8b5cf6'}}
                          onChange={e=>{
                            if(e.target.checked) setExportNguWeeksActive(prev=>[...prev,wIndex]);
                            else setExportNguWeeksActive(prev=>prev.filter(w=>w!==wIndex));
                          }}/>
                        <span style={{fontSize:'0.82rem'}}>
                          <span style={{fontWeight:700}}>{lbl.split(':')[0]}</span>
                          <span style={{fontWeight:400,fontSize:'0.75rem',marginLeft:4,color:active?'#8b5cf6':'#94a3b8'}}>{lbl.split(': ')[1]}</span>
                        </span>
                        {!active && <span style={{marginLeft:'auto',fontSize:'0.68rem',background:'#fee2e2',color:'#dc2626',padding:'1px 5px',borderRadius:3,fontWeight:600}}>Nghỉ</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="export-modal-group">
                <div className="export-room-header">
                  <div className="export-modal-section-title" style={{margin:0}}>CHỌN PHÒNG NGỦ</div>
                  <div className="export-room-actions">
                    <button onClick={()=>setExportNguRooms(exportNguPhongList.map(p=>p.ma_phong))}>Chọn tất cả</button>
                    <div className="divider"></div>
                    <button className="deselect" onClick={()=>setExportNguRooms([])}>Bỏ chọn</button>
                  </div>
                </div>
                <div className="export-room-grid">
                  {exportNguPhongList.map(p=>(
                    <div key={p.ma_phong}
                      className={`export-room-pill ${exportNguRooms.includes(p.ma_phong)?'selected':''}`}
                      onClick={()=>setExportNguRooms(prev=>prev.includes(p.ma_phong)?prev.filter(r=>r!==p.ma_phong):[...prev,p.ma_phong])}>
                      {p.ma_phong}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowExportNguModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={exportBaoCaoNguExcel} disabled={exportingNgu} style={{background:'#10b981',borderColor:'#10b981'}}>
                {exportingNgu ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>} Xuất Excel
              </button>
              <button className="btn btn-primary" onClick={exportBaoCaoNguPDF} disabled={exportingNgu} style={{background:'#ef4444',borderColor:'#ef4444'}}>
                {exportingNgu ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>} Xuất PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL TỔNG HỢP THEO LỚP ── */}
      {showTongHopLopModal && (
        <div className="export-modal-overlay">
          <div className="export-modal" style={{maxWidth:560}}>
            <div className="export-modal-header" style={{background:'linear-gradient(90deg,#10b981,#059669)'}}>
              <div className="icon"><i className="fas fa-table"></i></div>
              <div>
                <h3>Tổng hợp chuyên cần &amp; thu tiền theo Lớp</h3>
                <p>Xuất bảng tổng hợp ăn/ngủ thực tế, vắng, phép từng HS theo lớp</p>
              </div>
            </div>
            <div className="export-modal-body">
              <div className="export-modal-group" style={{display:'flex',gap:16}}>
                <div style={{flex:1}}>
                  <div className="export-modal-section-title"><i className="fas fa-calendar-alt" style={{color:'#10b981'}}></i> CHỌN THÁNG</div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <input type="month" value={thLopMonth}
                      onChange={e => { setThLopMonth(e.target.value); fetchThLop(e.target.value); }}
                      style={{width:'100%',padding:'7px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontFamily:'inherit',fontSize:'1rem'}} />
                    {loadingThLop && <span style={{color:'#10b981'}}><i className="fas fa-spinner fa-spin"></i> Đang tải...</span>}
                  </div>
                </div>
                <div style={{flex:1}}>
                  <div className="export-modal-section-title"><i className="fas fa-chalkboard" style={{color:'#10b981'}}></i> CHỌN LỚP</div>
                  <select value={thLopSelected} onChange={e => setThLopSelected(e.target.value)} disabled={!thLopData || loadingThLop}
                    style={{width:'100%',padding:'7px 12px',borderRadius:8,border:'1.5px solid #e2e8f0',fontFamily:'inherit',fontSize:'1rem',background:!thLopData?'#f8fafc':'#fff'}}>
                    <option value="">-- Tất cả các lớp --</option>
                    {thLopData && [...new Set(thLopData.data.map(h=>h.lop))].sort().map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              {thLopData && (
                <div className="export-modal-group" style={{background:'#f0fdf4',borderRadius:10,padding:'10px 14px'}}>
                  <div style={{display:'flex',flexWrap:'wrap',gap:16}}>
                    <div><span style={{color:'#64748b',fontSize:'.8rem'}}>Buổi ăn:</span> <strong style={{color:'#0ea5e9'}}>{thLopData.tong_buoi_an}</strong></div>
                    <div><span style={{color:'#64748b',fontSize:'.8rem'}}>Buổi ngủ:</span> <strong style={{color:'#6366f1'}}>{thLopData.tong_buoi_ngu}</strong></div>
                    <div><span style={{color:'#64748b',fontSize:'.8rem'}}>Đơn giá ăn:</span> <strong style={{color:'#f59e0b'}}>{(thLopData.gia_an||0).toLocaleString('vi-VN')}đ</strong></div>
                    <div><span style={{color:'#64748b',fontSize:'.8rem'}}>Đơn giá ngủ:</span> <strong style={{color:'#8b5cf6'}}>{(thLopData.gia_ngu||0).toLocaleString('vi-VN')}đ</strong></div>
                    <div><span style={{color:'#64748b',fontSize:'.8rem'}}>Tổng HS:</span> <strong>{thLopData.data?.length || 0}</strong></div>
                  </div>
                  <div style={{marginTop:8,fontSize:'.8rem',color:'#059669'}}>
                    <i className="fas fa-check-circle"></i> Dữ liệu sẵn sàng — xuất {thLopSelected ? `Lớp ${thLopSelected}` : `${[...new Set((thLopData.data||[]).map(h=>h.lop))].length} lớp`}
                  </div>
                </div>
              )}
              <div style={{fontSize:'0.78rem',color:'#64748b',marginTop:4}}>
                <i className="fas fa-info-circle" style={{color:'#10b981'}}></i> Mỗi lớp sẽ xuất ra 1 sheet Excel / 1 trang PDF riêng. Đơn giá lấy từ cấu hình hệ thống.
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowTongHopLopModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={exportThLopExcel} disabled={!thLopData || loadingThLop} style={{background:'#10b981',borderColor:'#10b981'}}>
                <i className="fas fa-file-excel"></i> Xuất Excel
              </button>
              <button className="btn btn-primary" onClick={() => { exportThLopPDF(); }} disabled={!thLopData || loadingThLop} style={{background:'#ef4444',borderColor:'#ef4444'}}>
                <i className="fas fa-file-pdf"></i> Xuất PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHỌN NGÀY ĐẶC BIỆT */}
      {showSpecialModal && (
        <div className="export-modal-overlay">
          <div className="export-modal" style={{maxWidth: 420}}>
            <div className="export-modal-header">
              <div className="icon" style={{background: specialLoai === 'an'
                ? 'linear-gradient(135deg,#f59e0b,#fbbf24)'
                : 'linear-gradient(135deg,#6c5ce7,#a29bfe)'}}>
                <i className={specialLoai === 'an' ? 'fas fa-utensils' : 'fas fa-bed'}></i>
              </div>
              <div>
                <h3>In ngày đặc biệt – Điểm danh {specialLoai === 'an' ? 'Ăn' : 'Ngủ'}</h3>
                <p>Chọn ngày để xuất danh sách học sinh ngày đặc biệt</p>
              </div>
            </div>
            <div className="export-modal-body">
              <div className="export-modal-group">
                <div className="export-modal-section-title">
                  <i className="fas fa-calendar-day" style={{color: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7'}}></i> CHỌN NGÀY
                </div>
                <input
                  type="date"
                  value={specialDate}
                  onChange={e => setSpecialDate(e.target.value)}
                  style={{width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontFamily:'inherit', fontSize:'1rem'}}
                />
                <div style={{marginTop:8, fontSize:'0.82rem', color:'#64748b'}}>
                  <i className="fas fa-info-circle"></i> Hệ thống sẽ tự động lấy cấu hình ngày đặc biệt (lớp áp dụng, phòng tạm) và điểm danh thực tế của ngày này.
                </div>
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowSpecialModal(false)}>Hủy</button>
              <button
                className="btn btn-primary"
                onClick={exportSpecialDayPDF}
                disabled={exportingSpecial || !specialDate}
                style={{background: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7', borderColor: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7'}}
              >
                {exportingSpecial ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-print"></i>}
                {exportingSpecial ? ' Đang xuất...' : ' Xuất PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
