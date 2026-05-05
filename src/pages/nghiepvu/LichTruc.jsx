import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import '../../styles/admin.css';
import './LichTruc.css';

const DOW_VI = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
const MONTH_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const p2 = n => String(n).padStart(2,'0');
const dateStr = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const getWeekStart = d => { const r=new Date(d); const dow=r.getDay(); r.setDate(r.getDate()+(dow===0?-6:1-dow)); return r; };
const todayStr = dateStr(new Date());

// ── GV Pill Component ──────────────────────────────────
function GvPill({ pc, gvList }) {
  const g1 = gvList.find(g => g.id === pc.ma_gv_id) || pc.giao_vien;
  const g2 = pc.ma_gv_truc_thay_id ? (gvList.find(g => g.id === pc.ma_gv_truc_thay_id) || pc.giao_vien_truc_thay) : null;
  if (!g1) return null;
  const initials = n => n.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className={`lt-gv-pill${g2 ? ' thay' : ''}`} title={`${g1.ho_ten}${g2 ? ` → thay bởi ${g2.ho_ten}` : ''}`}>
      <span className="lt-gv-av">{initials(g1.ho_ten)}</span>
      <span>{g1.ho_ten.split(' ').pop()}{g2 && <small style={{color:'#f39c12',fontSize:'.68rem'}}> (thay: {g2.ho_ten.split(' ').pop()})</small>}</span>
      {pc.xac_nhan_truc
        ? <span className="lt-gv-xn ok"><i className="fas fa-check-circle"></i></span>
        : <span className="lt-gv-xn wait"><i className="fas fa-clock"></i></span>}
    </span>
  );
}

// ── Ca Cell ────────────────────────────────────────────
function CaCell({ ngay, loai, pcData, gvList, phongList, filterGvId }) {
  let data = pcData.filter(p => p.ngay === ngay && p.loai_truc === loai);
  if (filterGvId) data = data.filter(p => p.ma_gv_id === parseInt(filterGvId) || p.ma_gv_truc_thay_id === parseInt(filterGvId));
  if (!data.length) return (
    <div className="lt-ca-empty"><i className="fas fa-minus-circle" style={{opacity:.3,marginRight:4}}></i>Chưa phân công</div>
  );
  const byPhong = {};
  data.forEach(pc => { if (!byPhong[pc.ma_phong_id]) byPhong[pc.ma_phong_id] = []; byPhong[pc.ma_phong_id].push(pc); });
  return (
    <div className="lt-room-list">
      {Object.entries(byPhong).map(([phong, pcs]) => {
        const p = phongList.find(x => x.ma_phong === phong) || pcs[0]?.phong;
        let cc = 'an';
        if (p && p.loai_phong === 1) cc = p.gioi_tinh === 0 ? 'ngu-nam' : 'ngu-nu';
        return (
          <div key={phong} className="lt-room-item">
            <span className={`lt-room-chip ${cc}`}>
              {phong}{p && p.gioi_tinh !== null && p.gioi_tinh !== undefined && <small style={{fontSize:'.62rem',opacity:.8}}> {p.gioi_tinh===0?'Nam':'Nữ'}</small>}
            </span>
            <div className="lt-gv-list">
              {pcs.map((pc,i) => <GvPill key={i} pc={pc} gvList={gvList} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LichTruc() {
  const [view, setView] = useState('week');
  const [baseDate, setBaseDate] = useState(new Date());
  const [filterGvId, setFilterGvId] = useState('');
  const [detailDate, setDetailDate] = useState(null);

  const [gvList, setGvList] = useState([]);
  const [phongList, setPhongList] = useState([]);
  const [pcData, setPcData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showT5, setShowT5] = useState(false); // Lưu cấu hình hiện Thứ 5

  const weekStart = useMemo(() => getWeekStart(baseDate), [baseDate]);
  const weekEnd   = useMemo(() => addDays(weekStart, 6), [weekStart]);
  
  // Chỉ hiện các ngày làm việc (T2-T6), T5 chỉ hiện nếu showT5=true
  const weekDays  = useMemo(() => {
    return Array.from({length:7}, (_,i) => addDays(weekStart,i))
      .filter(d => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return false; // Ẩn CN, T7
        if (dow === 4) return showT5; // T5 ẩn mặc định
        return true; // Hiện T2,3,4,6
      });
  }, [weekStart, showT5]);

  // Fetch danh sách GV và Phòng làm cơ sở (1 lần)
  useEffect(() => {
    api.get(`/api/lichtruc/week-public/?tuan=${dateStr(weekStart)}`)
      .then(res => {
        if (res.data?.ok) {
          setGvList(res.data.gv_list || []);
          setPhongList(res.data.phong_list || []);
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data theo view và date
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const req = view === 'week'
      ? Promise.all([
          api.get(`/api/lichtruc/week-public/?tuan=${dateStr(weekStart)}`),
          api.get(`/api/lichtruc/config-tuan/?tuan=${dateStr(weekStart)}`)
        ])
      : api.get(`/api/lichtruc/month/?thang=${baseDate.getFullYear()}-${p2(baseDate.getMonth()+1)}`);

    req
      .then(res => {
        if (cancelled) return;
        if (view === 'week') {
          const [resData, resConfig] = res;
          if (resData.data?.ok) setPcData(resData.data.records || []);
          if (resConfig.data?.ok) setShowT5(resConfig.data.config.show_t5);
        } else {
          if (res.data?.ok) setPcData(res.data.records || []);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, weekStart, baseDate]);

  const navPrev = () => {
    if (view === 'week') setBaseDate(d => addDays(d, -7));
    else setBaseDate(d => { const b=new Date(d); b.setMonth(b.getMonth()-1); return b; });
  };
  const navNext = () => {
    if (view === 'week') setBaseDate(d => addDays(d, 7));
    else setBaseDate(d => { const b=new Date(d); b.setMonth(b.getMonth()+1); return b; });
  };
  const goToday = () => setBaseDate(new Date());

  const periodLabel = view === 'week'
    ? `${p2(weekStart.getDate())}/${p2(weekStart.getMonth()+1)} – ${p2(weekEnd.getDate())}/${p2(weekEnd.getMonth()+1)}/${weekEnd.getFullYear()}`
    : `${MONTH_VI[baseDate.getMonth()]}, ${baseDate.getFullYear()}`;

  // ── Excel Export ──
  const exportExcel = () => {
    const rows = [['Ngày','Thứ','Ca Ăn – Phòng','Ca Ăn – Giáo viên','Ca Ngủ – Phòng','Ca Ngủ – Giáo viên']];
    weekDays.forEach(d => {
      const ds = dateStr(d);
      const dow = ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()];
      let pa = pcData.filter(p => p.ngay===ds && p.loai_truc===0);
      let pn = pcData.filter(p => p.ngay===ds && p.loai_truc===1);
      if (filterGvId) { pa=pa.filter(p=>p.ma_gv_id===parseInt(filterGvId)||p.ma_gv_truc_thay_id===parseInt(filterGvId)); pn=pn.filter(p=>p.ma_gv_id===parseInt(filterGvId)||p.ma_gv_truc_thay_id===parseInt(filterGvId)); }
      const fmtGv = arr => arr.map(p => {
        const g = gvList.find(x=>x.id===p.ma_gv_id) || p.giao_vien;
        return g?.ho_ten || '';
      }).join(', ');
      rows.push([`${p2(d.getDate())}/${p2(d.getMonth()+1)}`, dow, pa.map(p=>p.ma_phong_id).join(', '), fmtGv(pa), pn.map(p=>p.ma_phong_id).join(', '), fmtGv(pn)]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Lich truc');
    XLSX.writeFile(wb, `lich-truc-gv-${dateStr(weekStart)}.xlsx`);
  };

  // ── Print PDF (Lịch trực 2 tuần) ──
  const printPDF = async () => {
    const ws1 = getWeekStart(baseDate);
    const ws2 = addDays(ws1, 7);
    const we1 = addDays(ws1, 4);
    const we2 = addDays(ws2, 4);

    let allRec = [...pcData];
    let namHoc = '2025-2026';
    let phuTrach = 'Tạ Thị Diệu Lê';

    try {
      const [r2, rConf] = await Promise.all([
        api.get(`/api/lichtruc/week-public/?tuan=${dateStr(ws2)}`).catch(() => ({ data: { records: [] } })),
        api.get('/api/cauhinh/').catch(() => ({ data: {} }))
      ]);
      
      const d2 = r2.data;
      const ids = new Set(allRec.map(r => r.id));
      (d2.records || []).forEach(r => { if (!ids.has(r.id)) allRec.push(r); });

      if (rConf.data?.he_thong) {
        namHoc = rConf.data.he_thong.nam_hoc || namHoc;
        phuTrach = rConf.data.he_thong.nguoi_phu_trach || phuTrach;
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu in:', e);
    }

    const fd = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
    const fdFull = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const THU_LABELS = ['Chủ Nhật', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'];
    const week1Days = [], week2Days = [];
    for (let i = 0; i < 5; i++) {
      week1Days.push(addDays(ws1, i));
      week2Days.push(addDays(ws2, i));
    }

    function buildRows(loai) {
      const rows = [];
      for (let di = 0; di < 5; di++) {
        const d1 = week1Days[di], d2_ = week2Days[di];
        const ds1 = dateStr(d1), ds2 = dateStr(d2_);
        const dow = d1.getDay();
        const recs1 = allRec.filter(p => p.ngay === ds1 && p.loai_truc === loai);
        const recs2 = allRec.filter(p => p.ngay === ds2 && p.loai_truc === loai);
        const phongSet = [...new Set([...recs1, ...recs2].map(p => p.ma_phong_id))].sort();
        
        phongSet.forEach(phong => {
          const gvSet = [...new Set([
            ...recs1.filter(p => p.ma_phong_id === phong).map(p => p.ma_gv_id),
            ...recs2.filter(p => p.ma_phong_id === phong).map(p => p.ma_gv_id)
          ])];
          gvSet.forEach(gv_id => {
            const g = gvList.find(x => x.id === gv_id);
            if (!g) return;
            const hasW1 = recs1.some(p => p.ma_phong_id === phong && p.ma_gv_id === gv_id);
            const hasW2 = recs2.some(p => p.ma_phong_id === phong && p.ma_gv_id === gv_id);
            let ghichu = 'Điểm danh, kiểm tra, đối chiếu ds';
            if (g.nhiem_vu === 1) ghichu = 'Hỗ trợ và giám sát';
            else if (g.nhiem_vu === null || g.nhiem_vu === undefined) ghichu = 'Giám sát';
            rows.push({ thu: THU_LABELS[dow], thu_idx: di, phong, gv_id, ho_ten: g.ho_ten, nhiem_vu: g.nhiem_vu, ghichu, hasW1, hasW2 });
          });
        });
      }
      return rows;
    }

    function buildTableBody(rows) {
      if (!rows.length) return `<tr><td colspan="7" style="text-align:center;color:#999;font-style:italic;padding:10px;">Chưa có phân công</td></tr>`;
      let html = '';
      let stt;
      let i = 0;
      while (i < rows.length) {
        const thuIdx = rows[i].thu_idx;
        let j = i;
        while (j < rows.length && rows[j].thu_idx === thuIdx) j++;
        const span = j - i;
        stt = 1;
        for (let k = i; k < j; k++) {
          const r = rows[k];
          const thuCell = k === i ? `<td rowspan="${span}" class="td-thu">${r.thu}</td>` : '';
          const w1Cell = r.hasW1 ? `<td class="td-ky td-w1">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>` : `<td class="td-ky td-w1-empty"></td>`;
          const w2Cell = r.hasW2 ? `<td class="td-ky td-w2">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>` : `<td class="td-ky td-w2-empty"></td>`;
          html += `<tr>
            <td class="td-stt">${stt}</td>
            ${thuCell}
            <td class="td-phong">${r.phong}</td>
            <td class="td-ten">${r.ho_ten}</td>
            ${w1Cell}
            ${w2Cell}
            <td class="td-ghi">${r.ghichu}</td>
          </tr>`;
          stt++;
        }
        i = j;
      }
      return html;
    }

    const css = `
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; }
      .page { padding: 10mm 12mm; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      
      .hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
      .hdr-left { font-size: 9pt; line-height: 1.5; text-align: center; min-width: 180px; }
      .hdr-left b { font-size: 9pt; font-weight: bold; letter-spacing: .3px; }
      .underline { text-decoration: underline; font-weight: bold; }
      .hdr-right { font-size: 9pt; text-align: center; min-width: 200px; line-height: 1.5; }
      .hdr-right .cong-hoa { font-weight: bold; text-transform: uppercase; font-size: 9pt; letter-spacing: .3px; }
      .hdr-right .doc-lap { font-size: 9pt; font-style: italic; text-decoration: underline; }
      
      .title-wrap { text-align: center; margin: 6px 0 2px; }
      .main-title { font-size: 12.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; }
      .sub-title { font-size: 9.5pt; margin-top: 2px; }
      .sub-note { font-size: 8.5pt; font-style: italic; margin-top: 1px; color: #333; }
      .divider { border-top: 2px solid #000; margin: 5px 0; }
      
      table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4px; }
      th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; text-align: center; }
      .th-wrap th { background: #f0f0f0; font-weight: bold; font-size: 9pt; }
      .th-stt  { width: 28px; }
      .th-thu  { width: 46px; }
      .th-phong{ min-width: 80px; }
      .th-ten  { min-width: 130px; text-align: left; padding-left: 6px; }
      .th-ky   { min-width: 80px; font-size: 8.5pt; }
      .th-ghi  { min-width: 160px; text-align: left; padding-left: 5px; }
      
      .td-stt  { color: #444; font-size: 8.5pt; }
      .td-thu  { font-weight: bold; font-size: 9pt; background: #f9f9f9; }
      .td-phong{ font-weight: 600; font-size: 8.5pt; }
      .td-ten  { text-align: left; padding-left: 6px; white-space: nowrap; }
      .td-ky   { height: 28px; min-width: 80px; }
      .td-w1   { background: #fff; }
      .td-w2   { background: #fff; }
      .td-w1-empty { background: #fafafa; }
      .td-w2-empty { background: #fafafa; }
      .td-ghi  { text-align: left; padding-left: 5px; font-size: 8.5pt; }
      
      .sig-wrap { margin-top: 10px; display: flex; justify-content: flex-end; }
      .sig-box { text-align: center; min-width: 200px; display: inline-block; }
      .sig-date { font-size: 9pt; font-style: italic; margin-bottom: 3px; }
      .sig-title { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; }
      .sig-space { height: 44px; }
      .sig-name { font-size: 9pt; font-weight: bold; font-style: italic; }
      
      .notes-wrap { margin-top: 8px; font-size: 8.5pt; line-height: 1.6; }
      .notes-wrap p { margin-bottom: 3px; }
      .notes-wrap .luu-y { font-weight: bold; }
      
      @page { size: A4 portrait; margin: 8mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `;

    function buildPage(title, subNote, tableBody, week1Label, week2Label, notesHtml) {
      return `<div class="page">
        <div class="hdr">
          <div class="hdr-left">
            <b>SỞ GIÁO DỤC VÀ ĐÀO TẠO</b><br>
            <b>TRUNG TÂM GD KT TH VÀ HN</b><br>
            <span class="underline">LÊ THỊ HỒNG GẤM</span>
          </div>
          <div class="hdr-right">
            <div class="cong-hoa">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div class="doc-lap">Độc lập – Tự do – Hạnh phúc</div>
            <div style="font-size:8pt;margin-top:2px;">————————————————</div>
          </div>
        </div>
        <div class="title-wrap">
          <div class="main-title">${title}</div>
          <div class="sub-title">Tuần từ <b>${fdFull(ws1)}</b> đến <b>${fdFull(we2)}</b></div>
          ${subNote ? `<div class="sub-note">(${subNote})</div>` : ''}
        </div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr class="th-wrap">
              <th class="th-stt" rowspan="2">STT</th>
              <th class="th-thu" rowspan="2">THỨ</th>
              <th class="th-phong" rowspan="2">PHÒNG</th>
              <th class="th-ten" rowspan="2">HỌ TÊN</th>
              <th class="th-ky">KÝ TRỰC<br><span style="font-weight:normal;font-size:8pt;">${week1Label}</span></th>
              <th class="th-ky">KÝ TRỰC<br><span style="font-weight:normal;font-size:8pt;">${week2Label}</span></th>
              <th class="th-ghi" rowspan="2">GHI CHÚ</th>
            </tr>
          </thead>
          <tbody>${tableBody}</tbody>
        </table>
        <div class="notes-wrap">
          ${notesHtml}
        </div>
        <div class="sig-wrap">
          <div class="sig-box">
            <div class="sig-date">TP Hồ Chí Minh, ngày ${ws1.getDate()} tháng ${ws1.getMonth()+1} năm ${ws1.getFullYear()}</div>
            <div class="sig-title">Phụ trách bán trú</div>
            <div class="sig-space"></div>
            <div class="sig-name">${phuTrach}</div>
          </div>
        </div>
      </div>`;
    }

    const rowsAn = buildRows(0);
    const rowsNgu = buildRows(1);
    const w1Label = `${fd(ws1)}-${fd(we1)}`;
    const w2Label = `${fd(ws2)}-${fd(we2)}`;

    const notesAn = `
      <p class="luu-y" style="font-style: italic; font-weight: bold;">Lưu ý: - Thời gian trực ăn trưa: từ 11g00-11g35</p>
      <p>- GV-NV trực ăn bán trú kiểm điểm số lượng học sinh, phân chia khu vực ăn cho hs cố định và báo số lượng ăn mỗi ngày theo phòng cho C Thanh Hà vào cuối buổi ăn. GV-NV ký tên điểm danh trực và báo cáo số liệu chậm nhất 11g45 hàng ngày.</p>
    `;

    const notesNgu = `
      <p>- Anh Trần Nhật Tân trực thiết bị điện hàng ngày; Cô Mai Thị Quỳnh Châu - Nhân viên y tế - trực y tế và kiểm tra thực phẩm hàng ngày.</p>
      <p>- GV-NV trực bán trú thực hiện: nhận bảng điểm danh học sinh (c Phạm Thị Thanh Hà) và điểm danh học sinh hàng ngày, gửi lại cho C Thanh Hà chậm nhất 11g45; quản lý học sinh trong thời gian ngủ; phân phát, thu lại và cất giữ gối cho HS.</p>
      <p>- GV-NV sẽ mở khóa tủ gối vào đầu giờ bán trú và chìa khoá các phòng (A20, A21, A22, E-E3) tại P. Bảo vệ; 12g15 cô Thanh và cô Lan sẽ xuống tầng trệt làm vệ sinh cho 2 nhà vệ sinh Nam và Nữ. Thầy cô trực cùng sẽ khóa tủ gối/khoá phòng lại lúc kết thúc bán trú.</p>
      <p>- <strong>Học sinh sẽ mang theo vỏ gối để sử dụng hàng ngày nên thầy cô nhắc hs tháo vỏ gối mang về sau mỗi buổi bán trú. Kết thúc học kỳ thì thực hiện giặt chiếu.</strong></p>
    `;

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
      <title>Bảng Phân Công Trực Bán Trú</title>
      <style>${css}</style></head><body>
      ${buildPage(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ ĂN NH ${namHoc}`,
          '',
          buildTableBody(rowsAn),
          w1Label, w2Label,
          notesAn
      )}
      ${buildPage(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ NGỦ NH ${namHoc}`,
          '',
          buildTableBody(rowsNgu),
          w1Label, w2Label,
          notesNgu
      )}
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);
    };
  };

  // ── Month calendar data ──
  const calCells = useMemo(() => {
    const year = baseDate.getFullYear(), month = baseDate.getMonth();
    const dim = new Date(year, month+1, 0).getDate();
    const fd  = new Date(year, month, 1).getDay();
    const off = fd === 0 ? 6 : fd - 1;
    const dimP = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i=off-1; i>=0; i--) cells.push({d:dimP-i, other:true});
    for (let d=1; d<=dim; d++) {
      const ds = `${year}-${p2(month+1)}-${p2(d)}`;
      const dow = new Date(year,month,d).getDay();
      cells.push({d, other:false, ds, dow, isToday:ds===todayStr, isWknd:dow===0||dow===6});
    }
    while (cells.length%7 !== 0) cells.push({d:cells.length-dim-off+1, other:true});
    return cells;
  }, [baseDate]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Lịch trực GV</span>
          </div>
          <h2><i className="fas fa-calendar-alt" style={{color:'var(--primary)',marginRight:8}}></i>Lịch trực Giáo viên</h2>
          <p>Xem lịch phân công trực theo phòng, ca ăn và ca ngủ theo từng ngày.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary btn-sm" onClick={printPDF} style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
            <i className="fas fa-print"></i> In lịch 2 tuần (GV ký)
          </button>
          <button className="btn btn-success btn-sm" onClick={exportExcel}>
            <i className="fas fa-file-excel"></i> Xuất Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={printPDF}>
            <i className="fas fa-print"></i> In trang này
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="lt-toolbar">
        <div className="lt-view-tabs">
          <button className={`lt-view-tab${view==='week'?' active':''}`} onClick={() => setView('week')}>Tuần</button>
          <button className={`lt-view-tab${view==='month'?' active':''}`} onClick={() => setView('month')}>Tháng</button>
        </div>
        <div className="lt-nav-group">
          <button className="lt-nav-btn" onClick={navPrev} disabled={loading}><i className="fas fa-chevron-left"></i></button>
          <span className="lt-period-label">
            {loading ? <i className="fas fa-spinner fa-spin"></i> : periodLabel}
          </span>
          <button className="lt-nav-btn" onClick={navNext} disabled={loading}><i className="fas fa-chevron-right"></i></button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Hôm nay</button>
        </div>
        <select className="lt-filter-gv" value={filterGvId} onChange={e => setFilterGvId(e.target.value)}>
          <option value="">👤 Tất cả GV</option>
          {gvList.map(g => <option key={g.id} value={g.id}>{g.ho_ten}</option>)}
        </select>
        <div className="lt-export-btns">
          <button className="btn btn-success btn-sm" onClick={exportExcel}><i className="fas fa-file-excel"></i> Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={printPDF}><i className="fas fa-print"></i> In</button>
        </div>
      </div>

      {/* CHÚ THÍCH MÀU SẮC */}
      <div className="lt-legend" style={{ 
        display: 'flex', 
        gap: '16px', 
        fontSize: '0.75rem', 
        background: '#f8fafc', 
        padding: '8px 16px', 
        borderRadius: '20px', 
        border: '1px solid #e2e8f0',
        marginBottom: '15px',
        width: 'fit-content'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, background: '#2563eb', borderRadius: '50%' }}></span>
          <span style={{ fontWeight: 600, color: '#475569' }}>Điểm danh</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, background: '#16a34a', borderRadius: '50%' }}></span>
          <span style={{ fontWeight: 600, color: '#475569' }}>Hỗ trợ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fas fa-exchange-alt" style={{ color: '#d97706', fontSize: '0.7rem' }}></i>
          <span style={{ fontWeight: 600, color: '#475569' }}>Trực thay</span>
        </div>
      </div>

      {/* VIEW TUẦN */}
      {view === 'week' && (
        <div id="view-week" style={{ overflowX: 'auto', marginTop: 15 }}>
          <table className="lt-admin-table" style={{ width: '100%', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Phòng</th>
                {(weekDays || []).map((d, i) => (
                  <th key={i} style={dateStr(d) === todayStr ? { background: 'var(--primary)', color: '#fff' } : {}}>
                    <div>{DOW_VI[d.getDay()]}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 400 }}>{p2(d.getDate())}/{p2(d.getMonth() + 1)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(phongList || []).map(phong => (
                <tr key={phong.ma_phong}>
                  <td className="lt-admin-td-phong">
                    <div style={{ fontWeight: 600 }}>{phong.ma_phong}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{phong.loai_phong === 0 ? 'Phòng ăn' : `Phòng ngủ (${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'})`}</div>
                  </td>
                  {(weekDays || []).map((d, idx) => {
                    const ds = dateStr(d);
                    let cellData = pcData.filter(p => p.ma_phong_id === phong.ma_phong && p.ngay === ds && p.loai_truc === phong.loai_phong);
                    if (filterGvId) cellData = cellData.filter(p => p.ma_gv_id === parseInt(filterGvId) || p.ma_gv_truc_thay_id === parseInt(filterGvId));
                    return (
                      <td key={idx} className="lt-admin-td-cell">
                        {cellData.map(pc => {
                          const gv = gvList.find(g => g.id === pc.ma_gv_id) || pc.giao_vien;
                          const gvThay = pc.ma_gv_truc_thay_id ? (gvList.find(g => g.id === pc.ma_gv_truc_thay_id) || pc.giao_vien_truc_thay) : null;
                          const isDD = gv?.nhiem_vu === 0;
                          const isHT = gv?.nhiem_vu === 1;
                          const borderColor = isDD ? '#2563eb' : (isHT ? '#16a34a' : '#64748b');
                          const bgColor = isDD ? '#eff6ff' : (isHT ? '#f0fdf4' : '#f8fafc');

                          return (
                            <div
                              key={pc.id}
                              style={{
                                background: bgColor,
                                borderLeft: `3px solid ${borderColor}`,
                                padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                                lineHeight: 1.25,
                              }}
                            >
                              {gvThay ? (
                                <>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#b45309' }}>
                                    {gvThay.ho_ten}
                                  </div>
                                  <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 1 }}>
                                    thay: {gv?.ho_ten?.split(' ').pop()}
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isDD ? '#1e40af' : (isHT ? '#166534' : '#1e293b') }}>
                                  {gv?.ho_ten}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {cellData.length === 0 && !filterGvId && (
                          <div style={{ fontSize: '0.7rem', color: '#cbd5e1', textAlign: 'center', marginTop: 4 }}>-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW THÁNG */}
      {view === 'month' && (
        <div id="view-month">
          <div className="lt-cal-view">
            <div className="lt-cal-weekdays">
              {['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN'].map((d,i) => (
                <div key={i} className={`lt-cal-wd${i>=5?' wknd':''}`}>{d}</div>
              ))}
            </div>
            <div className="lt-cal-grid">
              {calCells.map((cell, i) => {
                if (cell.other) return <div key={i} className="lt-cal-day other"><span className="lt-cal-day-num">{cell.d}</span></div>;
                const pcDay = pcData.filter(p => p.ngay === cell.ds && (!filterGvId || p.ma_gv_id===parseInt(filterGvId) || p.ma_gv_truc_thay_id===parseInt(filterGvId)));
                const MAX_SHOW = 3;
                const visible = pcDay.slice(0, MAX_SHOW);
                const moreCount = pcDay.length - MAX_SHOW;

                return (
                  <div key={i} className={`lt-cal-day${cell.isToday?' today':''}${cell.isWknd?' wknd':''}`}
                    onClick={() => setDetailDate(cell.ds)} style={{cursor:'pointer'}}>
                    <span className="lt-cal-day-num">{cell.d}</span>
                    <div className="lt-shifts">
                      {visible.map(pc => {
                        const gv = gvList.find(g => g.id === pc.ma_gv_id) || pc.giao_vien;
                        const thay = pc.ma_gv_truc_thay_id ? (gvList.find(g => g.id === pc.ma_gv_truc_thay_id) || pc.giao_vien_truc_thay) : null;
                        const typeClass = pc.loai_truc === 0 ? 'ca-an' : 'ca-ngu';
                        const loaiStr = pc.loai_truc === 0 ? 'Ăn' : 'Ngủ';
                        return (
                          <div key={pc.id} className={`lt-shift ${typeClass}`} title={gv?.ho_ten}>
                            <div className="lt-shift-room">{pc.ma_phong_id} &middot; {loaiStr}</div>
                            <div className="lt-shift-gv"><i className="fas fa-user-tie"></i> {gv?.ho_ten || '?'}</div>
                            {thay && <div className="lt-shift-thay"><i className="fas fa-exchange-alt"></i> {thay.ho_ten}</div>}
                          </div>
                        );
                      })}
                      {moreCount > 0 && <div className="lt-more">+{moreCount} ca khác</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail panel khi click ngày */}
          {detailDate && (
            <div className="lt-day-detail visible">
              <div className="lt-day-detail-header">
                <h3><i className="fas fa-calendar-day"></i> {DOW_VI[new Date(detailDate+'T00:00:00').getDay()]}, {p2(new Date(detailDate+'T00:00:00').getDate())}/{p2(new Date(detailDate+'T00:00:00').getMonth()+1)}/{new Date(detailDate+'T00:00:00').getFullYear()}</h3>
                <button onClick={() => setDetailDate(null)} style={{background:'rgba(255,255,255,.2)',border:'none',color:'#fff',borderRadius:'6px',padding:'4px 10px',cursor:'pointer',fontSize:'.8rem'}}>
                  <i className="fas fa-times"></i> Đóng
                </button>
              </div>
              <div className="lt-day-detail-body">
                <div className="lt-detail-ca">
                  <div className="lt-detail-ca-title an"><i className="fas fa-utensils"></i> Ca Ăn – Phòng ăn</div>
                  <CaCell ngay={detailDate} loai={0} pcData={pcData} gvList={gvList} phongList={phongList} filterGvId={filterGvId} />
                </div>
                <div className="lt-detail-ca">
                  <div className="lt-detail-ca-title ngu"><i className="fas fa-bed"></i> Ca Ngủ – Phòng ngủ</div>
                  <CaCell ngay={detailDate} loai={1} pcData={pcData} gvList={gvList} phongList={phongList} filterGvId={filterGvId} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
