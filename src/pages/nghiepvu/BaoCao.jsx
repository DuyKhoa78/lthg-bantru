import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chart, ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import api from '../../services/api';
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
            // null/undefined = chưa lưu → mặc định Có mặt (✓)
            const sym = val===1?'<span class="mk-v">✗</span>':val===2?'<span class="mk-p">P</span>':'<span class="mk-c">✓</span>';
            return `<td class="col-day-an"${di2===0?' style="border-left:1.5px solid #555;"':''}>${sym}</td>`;
          }).join('')).join('');
          const filteredVang = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 1).length;
          const filteredPhep = ngay_ban_tru.filter(ng => s.diemdanh[ng] === 2).length;
          const filteredCoMat = numDays - filteredPhep; // Thực tế = Tổng buổi - Phép (tính cả vắng)
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
          const filteredCoMat2 = numDays - filteredPhep2; // Thực tế = Tổng buổi - Phép (tính cả vắng)
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
          const filteredCoMat = numDays - filteredPhep; // Thực tế = Tổng buổi - Phép (tính cả vắng)
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
          const filteredCoMat2 = numDays - filteredPhep2; // Thực tế = Tổng buổi - Phép (tính cả vắng)
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
            <div style={{marginLeft: 'auto', display: 'flex', gap: '8px'}}>
              <button className="btn btn-primary btn-sm" onClick={openExportAnModal}>
                <i className="fas fa-file-pdf"></i> In DS Điểm danh Ăn
              </button>
              <button className="btn btn-primary btn-sm" onClick={openExportNguModal} style={{background:'#6366f1', borderColor:'#6366f1'}}>
                <i className="fas fa-bed"></i> In DS Điểm danh Ngủ
              </button>
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
    </>
  );
}
