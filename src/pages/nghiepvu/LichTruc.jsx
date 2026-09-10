import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { getSortNames } from '../../utils/stringUtils';
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
  const { user } = useAuth();
  const canExport = user?.is_admin || user?.is_superuser || user?.is_hoc_vu || user?.is_ke_toan;
  const [view, setView] = useState('week'); // 'week' | 'month'
  const [baseDate, setBaseDate] = useState(new Date());
  const [filterGvId, setFilterGvId] = useState('');
  const [detailDate, setDetailDate] = useState(null);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [specialDate, setSpecialDate] = useState(todayStr);
  const [printingSpecial, setPrintingSpecial] = useState(false);

  const [gvList, setGvList] = useState([]);
  const [phongList, setPhongList] = useState([]);
  const [pcData, setPcData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showT6, setShowT6] = useState(false); // Lưu cấu hình hiện Thứ 6

  const weekStart = useMemo(() => getWeekStart(baseDate), [baseDate]);
  const weekEnd   = useMemo(() => addDays(weekStart, 6), [weekStart]);
  
  // Chỉ hiện các ngày làm việc (T2-T5), T6 chỉ hiện nếu showT6=true
  const weekDays  = useMemo(() => {
    return Array.from({length:7}, (_,i) => addDays(weekStart,i))
      .filter(d => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return false; // Ẩn CN, T7
        if (dow === 5) return showT6; // T6 ẩn mặc định
        return true; // Hiện T2,3,4,5
      });
  }, [weekStart, showT6]);

  // Fetch data theo view và date (bao gồm cả GV & Phòng trong kết quả tuần)
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line
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
          if (resData.data?.ok) {
            setPcData(resData.data.records || []);
            if (resData.data.gv_list?.length) setGvList(resData.data.gv_list);
            if (resData.data.phong_list?.length) setPhongList(resData.data.phong_list);
          }
          if (resConfig.data?.ok) setShowT6(resConfig.data.config.show_t6);
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

  // ── Print PDF (Lịch trực 2 tuần) ──
  const printPDF = async () => {
    const ws1 = getWeekStart(baseDate);
    const ws2 = addDays(ws1, 7);
    const we1 = addDays(ws1, 4);
    const we2 = addDays(ws2, 4);

    let allRec = [...pcData];
    let namHoc = '2026-2027';
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

        // Gom theo GV: 1 GV chỉ xuất hiện 1 dòng duy nhất trong 1 ngày
        const gvMap = {};
        const keyOrder = [];
        [...recs1, ...recs2].forEach(p => {
          const key = p.ma_gv_id;
          if (!gvMap[key]) {
            gvMap[key] = {
              gv_id: p.ma_gv_id,
              records: [],
              w1Phongs: new Set(),
              w2Phongs: new Set(),
              allPhongs: new Set()
            };
            keyOrder.push(key);
          }
          gvMap[key].records.push(p);
        });
        recs1.forEach(p => {
          const key = p.ma_gv_id;
          if (gvMap[key]) {
            gvMap[key].w1Phongs.add(p.ma_phong_id);
            gvMap[key].allPhongs.add(p.ma_phong_id);
          }
        });
        recs2.forEach(p => {
          const key = p.ma_gv_id;
          if (gvMap[key]) {
            gvMap[key].w2Phongs.add(p.ma_phong_id);
            gvMap[key].allPhongs.add(p.ma_phong_id);
          }
        });

        const dayRows = [];
        keyOrder.forEach(key => {
          const info = gvMap[key];
          const g = gvList.find(x => x.id === info.gv_id);
          if (!g) return;
          const recNvs = info.records.map(r => r.nhiem_vu).filter(v => v !== undefined && v !== null);
          let isGiamSat;
          if (recNvs.length > 0 && recNvs.every(v => v === 1)) {
            isGiamSat = true;
          } else if (recNvs.length > 0 && recNvs.every(v => v === 0)) {
            isGiamSat = false;
          } else {
            isGiamSat = (g.nhiem_vu === 1);
          }
          const ghichu = loai === 1 ? '' : (isGiamSat ? 'Giám sát' : 'Điểm danh, kiểm tra, đối chiếu ds');
          dayRows.push({
            thu: THU_LABELS[dow], thu_idx: di,
            phong: [...info.allPhongs].sort().join(', '),
            gv_id: info.gv_id, ho_ten: g.ho_ten, nhiem_vu: isGiamSat ? 1 : 0, ghichu,
            hasW1: info.w1Phongs.size > 0,
            hasW2: info.w2Phongs.size > 0
          });
        });

        // Sắp xếp danh sách giáo viên trong ngày theo Alphabet tên GV
        dayRows.sort((a, b) => {
          const nameA = getSortNames(a.ho_ten);
          const nameB = getSortNames(b.ho_ten);
          let cmp = nameA.first.localeCompare(nameB.first, 'vi');
          if (cmp !== 0) return cmp;
          cmp = nameA.last.localeCompare(nameB.last, 'vi');
          if (cmp !== 0) return cmp;
          return nameA.middle.localeCompare(nameB.middle, 'vi');
        });

        rows.push(...dayRows);
      }
      return rows;
    }

    function buildSchedulePages(title, subNote, rows, week1Label, week2Label, notesHtml) {
      function renderThead() {
        return `<thead>
          <tr class="th-wrap">
            <th class="th-stt" rowspan="2">STT</th>
            <th class="th-thu" rowspan="2">THỨ</th>
            <th class="th-ten" rowspan="2">HỌ TÊN</th>
            <th class="th-phong" rowspan="2">PHÒNG</th>
            <th class="th-ky-parent" colspan="2">KÝ TRỰC</th>
            <th class="th-ghi" rowspan="2">GHI CHÚ</th>
          </tr>
          <tr class="th-wrap">
            <th class="th-ky-sub">${week1Label}</th>
            <th class="th-ky-sub">${week2Label}</th>
          </tr>
        </thead>`;
      }

      function renderTableBody(allRows) {
        if (!allRows.length) {
          return `<tbody><tr><td colspan="7" style="text-align:center;color:#999;font-style:italic;padding:8px;">Chưa có phân công</td></tr></tbody>`;
        }
        let html = '<tbody>';
        let i = 0;
        while (i < allRows.length) {
          const thuIdx = allRows[i].thu_idx;
          let j = i;
          while (j < allRows.length && allRows[j].thu_idx === thuIdx) j++;
          let stt = 1;
          const mid = i + Math.floor((j - i) / 2);
          for (let k = i; k < j; k++) {
            const r = allRows[k];
            const isFirstInDay = (k === i);
            const isLastInDay = (k === j - 1);
            const rowClass = isFirstInDay ? ' class="row-first-day"' : '';

            let thuClass = 'td-thu';
            if (isFirstInDay && isLastInDay) thuClass += ' thu-single';
            else if (isFirstInDay) thuClass += ' thu-first';
            else if (isLastInDay) thuClass += ' thu-last';
            else thuClass += ' thu-mid';

            const thuText = (k === mid) ? r.thu : '';
            const thuCell = `<td class="${thuClass}">${thuText}</td>`;
            const w1Cell = r.hasW1 ? `<td class="td-ky td-w1"></td>` : `<td class="td-ky td-w1-empty"></td>`;
            const w2Cell = r.hasW2 ? `<td class="td-ky td-w2"></td>` : `<td class="td-ky td-w2-empty"></td>`;
            html += `<tr${rowClass}>
              <td class="td-stt">${stt}</td>
              ${thuCell}
              <td class="td-ten">${r.ho_ten}</td>
              <td class="td-phong">${r.phong}</td>
              ${w1Cell}
              ${w2Cell}
              <td class="td-ghi">${r.ghichu}</td>
            </tr>`;
            stt++;
          }
          i = j;
        }
        html += '</tbody>';
        return html;
      }

      return `<div class="doc-section">
        <div class="hdr">
          <div class="hdr-left">
            <b>SỞ GIÁO DỤC VÀ ĐÀO TẠO</b><br>
            <b>TRUNG TÂM GD KT TH VÀ HN</b><br>
            <span class="underline">LÊ THỊ HỒNG GẤM</span>
          </div>
          <div class="hdr-right">
            <div class="cong-hoa">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div class="doc-lap">Độc lập – Tự do – Hạnh phúc</div>
          </div>
        </div>
        <div class="title-wrap">
          <div class="main-title">${title}</div>
          <div class="sub-title">Tuần từ <b>${fdFull(ws1)}</b> đến <b>${fdFull(we2)}</b></div>
          ${subNote ? `<div class="sub-note">(${subNote})</div>` : ''}
        </div>
        <table>
          ${renderThead()}
          ${renderTableBody(rows)}
        </table>
        <div class="footer-wrap">
          <div class="notes-wrap">${notesHtml}</div>
          <div class="sig-wrap">
            <div class="sig-box">
              <div class="sig-date-space" style="height: 19px;"></div>
              <div class="sig-title">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
              <div style="font-style:italic; font-size:10pt;">(Ký và ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">${user?.fullname?.trim() || user?.username || ''}</div>
            </div>
            <div class="sig-box">
              <div class="sig-date">TP Hồ Chí Minh, ngày ${ws1.getDate()} tháng ${ws1.getMonth()+1} năm ${ws1.getFullYear()}</div>
              <div class="sig-title">GIÁM ĐỐC</div>
              <div style="font-style:italic; font-size:10pt;">(Ký và ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">${phuTrach || 'Vũ Quốc Phong'}</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    const css = `
      @page {
        size: A4 portrait;
        margin-top: 1cm;
        margin-right: 1cm;
        margin-bottom: 1cm;
        margin-left: 1.5cm;
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; background: #fff; margin: 0; padding: 0; }
      .doc-section { page-break-after: always; break-after: page; margin: 0; padding: 0; }
      .doc-section:last-child { page-break-after: auto; break-after: auto; }
      
      .hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; line-height: 1.3; }
      .hdr-left { font-size: 8.5pt; line-height: 1.3; text-align: center; min-width: 170px; }
      .hdr-left b { font-size: 8.5pt; font-weight: bold; letter-spacing: .2px; }
      .underline { text-decoration: underline; font-weight: bold; }
      .hdr-right { font-size: 8.5pt; text-align: center; min-width: 190px; line-height: 1.3; }
      .hdr-right .cong-hoa { font-weight: bold; text-transform: uppercase; font-size: 8.5pt; letter-spacing: .2px; }
      .hdr-right .doc-lap { font-size: 8.5pt; font-style: italic; text-decoration: underline; }
      
      .title-wrap { text-align: center; margin: 4px 0 6px; }
      .main-title { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; line-height: 1.3; }
      .sub-title { font-size: 12pt; margin-top: 2px; line-height: 1.25; }
      .sub-note { font-size: 8.5pt; font-style: italic; margin-top: 2px; color: #333; }
      
      table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        font-size: 9.5pt;
        margin-top: 2px;
        margin-bottom: 20px;
      }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      thead tr { page-break-inside: avoid; break-inside: avoid; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      th, td { border: 1px solid #000; padding: 3px 3px; vertical-align: middle; text-align: center; }
      
      tr.row-first-day td { border-top: 2px solid #000; }
      
      .th-wrap th { background: #f0f0f0; font-weight: bold; font-size: 9pt; padding: 3px 2px; }
      .th-stt  { width: 30px; }
      .th-thu  { width: 44px; text-align: center !important; vertical-align: middle !important; }
      .th-ten  { width: 200px; text-align: left; padding-left: 6px; }
      .th-phong{ width: 90px; text-align: center; }
      .th-ky-parent { font-size: 9pt; font-weight: bold; }
      .th-ky-sub { width: 85px; min-width: 80px; font-size: 8pt; font-weight: normal; }
      .th-ghi  { width: 148px; text-align: left; padding-left: 4px; font-size: 8.5pt; }
      
      .td-stt  { color: #222; font-size: 9pt; padding: 3px 3px; }
      .td-thu  {
        font-weight: bold;
        font-size: 10pt;
        background: #fafafa;
        text-align: center !important;
        vertical-align: middle !important;
        padding: 3px 3px;
        border-top: hidden;
        border-bottom: hidden;
      }
      .td-thu.thu-first { border-top: 2px solid #000; }
      .td-thu.thu-last { border-bottom: 2px solid #000; }
      .td-thu.thu-single { border-top: 2px solid #000; border-bottom: 2px solid #000; }
      .td-ten  { text-align: left; padding: 3px 6px; white-space: nowrap; font-size: 13pt; width: 200px; line-height: 1.1; }
      .td-phong{ font-weight: 600; font-size: 11pt; width: 90px; text-align: center; padding: 3px 3px; }
      .td-ky   { height: 18px; width: 85px; padding: 3px 3px; }
      .td-w1   { background: #fff; }
      .td-w2   { background: #fff; }
      .td-w1-empty { background: #fafafa; }
      .td-w2-empty { background: #fafafa; }
      .td-ghi  { text-align: left; padding: 3px 3px; font-size: 7.5pt; line-height: 1.15; width: 148px; }
      
      .footer-wrap { margin-top: 20px; page-break-inside: avoid; break-inside: avoid; }
      .sig-wrap { margin-top: 16px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid; break-inside: avoid; }
      .sig-box { text-align: center; width: 42%; min-width: 210px; display: inline-block; }
      .sig-date { font-size: 12pt; font-style: italic; margin-bottom: 2px; }
      .sig-title { font-weight: bold; font-size: 12pt; text-transform: uppercase; }
      .sig-space { height: 48px; }
      .sig-name { font-size: 12pt; font-weight: bold; font-style: italic; }
      
      .notes-wrap { font-size: 11pt; line-height: 1.3; }
      .notes-wrap p { margin-bottom: 2px; }
      .notes-wrap .luu-y { font-weight: bold; }
      
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }
      }
    `;

    const rowsAn = buildRows(0);
    const rowsNgu = buildRows(1);
    const w1Label = `${fd(ws1)}-${fd(we1)}`;
    const w2Label = `${fd(ws2)}-${fd(we2)}`;

    const notesAn = '';

    const notesNgu = '';

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
      <title>Bảng Phân Công Trực Bán Trú</title>
      <style>${css}</style></head><body>
      ${buildSchedulePages(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ ĂN NH ${namHoc}`,
          '',
          rowsAn,
          w1Label, w2Label,
          notesAn
      )}
      ${buildSchedulePages(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ NGỦ NH ${namHoc}`,
          '',
          rowsNgu,
          w1Label, w2Label,
          notesNgu
      )}
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 2000);
      }, 400);
    };
  };

  // ── Print Special Day PDF ──
  const printSpecialDayPDF = async () => {
    setPrintingSpecial(true);
    let namHoc = '2026-2027';
    let phuTrach = 'Người phụ trách';
    const sDateObj = new Date(specialDate);
    const ws = getWeekStart(sDateObj);
    let dsAll = [];
    let dGv = gvList;


    try {
      const [rWeek, rConf, rSpecial] = await Promise.all([
        api.get(`/api/lichtruc/week-public/?tuan=${dateStr(ws)}`),
        api.get('/api/cauhinh/'),
        api.get(`/api/cauhinh-ngay/?ngay=${dateStr(sDateObj)}`)
      ]);
      if (!rSpecial.data?.cauhinh_ngay) {
        const fdErr = `${p2(sDateObj.getDate())}/${p2(sDateObj.getMonth() + 1)}/${sDateObj.getFullYear()}`;
        alert(`Ngày ${fdErr} chưa được thiết lập Cấu hình ngày đặc biệt!\nVui lòng vào "Lịch trực Admin" > "Cấu hình ngày đặc biệt" để tạo cấu hình trước.`);
        setPrintingSpecial(false);
        return;
      }
      if (rWeek.data?.ok) {
        dsAll = rWeek.data.records || [];
        dGv = rWeek.data.gv_list || dGv;

      }
      if (rConf.data?.he_thong) {
        namHoc = rConf.data.he_thong.nam_hoc || namHoc;
        phuTrach = rConf.data.he_thong.nguoi_phu_trach || phuTrach;
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu in ngày đặc biệt:', e);
      alert('Có lỗi xảy ra khi lấy dữ liệu in!');
      setPrintingSpecial(false);
      return;
    }

    const fd = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const targetDateStr = dateStr(sDateObj);
    const dow = sDateObj.getDay();
    const thuStr = dow === 0 ? 'Chủ Nhật' : ['CN', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'][dow];

    function buildRows(loai) {
      const rows = [];
      const recs = dsAll.filter(p => p.ngay === targetDateStr && p.loai_truc === loai);

      // Gom theo GV: 1 GV chỉ xuất hiện 1 dòng duy nhất trong ngày
      const gvMap = {};
      const keyOrder = [];
      recs.forEach(p => {
        const key = p.ma_gv_id;
        if (!gvMap[key]) {
          gvMap[key] = { gv_id: p.ma_gv_id, records: [], phongs: new Set() };
          keyOrder.push(key);
        }
        gvMap[key].records.push(p);
        gvMap[key].phongs.add(p.ma_phong_id);
      });

      keyOrder.forEach(key => {
        const info = gvMap[key];
        const g = dGv.find(x => x.id === info.gv_id);
        if (!g) return;
        const recNvs = info.records.map(r => r.nhiem_vu).filter(v => v !== undefined && v !== null);
        let isGiamSat;
        if (recNvs.length > 0 && recNvs.every(v => v === 1)) {
          isGiamSat = true;
        } else if (recNvs.length > 0 && recNvs.every(v => v === 0)) {
          isGiamSat = false;
        } else {
          isGiamSat = (g.nhiem_vu === 1);
        }
        const ghichu = loai === 1 ? '' : (isGiamSat ? 'Giám sát' : 'Điểm danh, kiểm tra, đối chiếu ds');
        rows.push({ thu: thuStr, phong: [...info.phongs].sort().join(', '), gv_id: info.gv_id, ho_ten: g.ho_ten, nhiem_vu: isGiamSat ? 1 : 0, ghichu });
      });

      // Sắp xếp danh sách giáo viên theo Alphabet tên GV
      rows.sort((a, b) => {
        const nameA = getSortNames(a.ho_ten);
        const nameB = getSortNames(b.ho_ten);
        let cmp = nameA.first.localeCompare(nameB.first, 'vi');
        if (cmp !== 0) return cmp;
        cmp = nameA.last.localeCompare(nameB.last, 'vi');
        if (cmp !== 0) return cmp;
        return nameA.middle.localeCompare(nameB.middle, 'vi');
      });

      return rows;
    }

    function buildTableBody(rows) {
      if (!rows.length) return `<tbody><tr><td colspan="6" style="text-align:center;color:#999;font-style:italic;padding:8px;">Chưa có phân công</td></tr></tbody>`;
      let html = '<tbody class="day-group">';
      let stt = 1;
      let i = 0;
      while (i < rows.length) {
        let j = i;
        const mid = i + Math.floor((j - i) / 2);
        for (let k = i; k < j; k++) {
          const r = rows[k];
          const isFirstInDay = (k === i);
          const isLastInDay = (k === j - 1);
          const rowClass = isFirstInDay ? ' class="row-first-day"' : '';

          let thuClass = 'td-thu';
          if (isFirstInDay && isLastInDay) thuClass += ' thu-single';
          else if (isFirstInDay) thuClass += ' thu-first';
          else if (isLastInDay) thuClass += ' thu-last';
          else thuClass += ' thu-mid';

          const thuText = (k === mid) ? r.thu : '';
          const thuCell = `<td class="${thuClass}">${thuText}</td>`;
          html += `<tr${rowClass}>
            <td class="td-stt">${stt}</td>
            ${thuCell}
            <td class="td-ten">${r.ho_ten}</td>
            <td class="td-phong">${r.phong}</td>
            <td class="td-ky td-w1-empty"></td>
            <td class="td-ghi">${r.ghichu}</td>
          </tr>`;
          stt++;
        }
        i = j;
      }
      html += '</tbody>';
      return html;
    }

    const css = `
      @page {
        size: A4 portrait;
        margin-top: 1cm;
        margin-right: 1cm;
        margin-bottom: 1cm;
        margin-left: 1.5cm;
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; background: #fff; margin: 0; padding: 0; }
      .doc-section { page-break-after: always; break-after: page; margin: 0; padding: 0; }
      .doc-section:last-child { page-break-after: auto; break-after: auto; }
      
      .hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; line-height: 1.3; }
      .hdr-left { font-size: 8.5pt; line-height: 1.3; text-align: center; min-width: 170px; }
      .hdr-left b { font-size: 8.5pt; font-weight: bold; letter-spacing: .2px; }
      .underline { text-decoration: underline; font-weight: bold; }
      .hdr-right { font-size: 8.5pt; text-align: center; min-width: 190px; line-height: 1.3; }
      .hdr-right .cong-hoa { font-weight: bold; text-transform: uppercase; font-size: 8.5pt; letter-spacing: .2px; }
      .hdr-right .doc-lap { font-size: 8.5pt; font-style: italic; text-decoration: underline; }
      
      .title-wrap { text-align: center; margin: 4px 0 6px; }
      .main-title { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; line-height: 1.3; }
      .sub-title { font-size: 12pt; margin-top: 2px; line-height: 1.25; }
      .sub-note { font-size: 8.5pt; font-style: italic; margin-top: 2px; color: #333; }
      
      table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        font-size: 9.5pt;
        margin-top: 2px;
        margin-bottom: 20px;
      }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      thead tr { page-break-inside: avoid; break-inside: avoid; }
      tbody.day-group { page-break-inside: auto; break-inside: auto; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      th, td { border: 1px solid #000; padding: 3px 3px; vertical-align: middle; text-align: center; }
      
      tr.row-first-day td { border-top: 2px solid #000; }
      
      .th-wrap th { background: #f0f0f0; font-weight: bold; font-size: 9pt; padding: 3px 2px; }
      .th-stt  { width: 30px; }
      .th-thu  { width: 44px; text-align: center !important; vertical-align: middle !important; }
      .th-ten  { width: 205px; text-align: left; padding-left: 6px; }
      .th-phong{ width: 95px; text-align: center; }
      .th-ky   { width: 90px; font-size: 9pt; }
      .th-ghi  { width: 200px; text-align: left; padding-left: 5px; font-size: 8.5pt; }
      
      .td-stt  { color: #222; font-size: 9pt; padding: 3px 3px; }
      .td-thu  {
        font-weight: bold;
        font-size: 10pt;
        background: #fafafa;
        text-align: center !important;
        vertical-align: middle !important;
        padding: 3px 3px;
        border-top: hidden;
        border-bottom: hidden;
      }
      .td-thu.thu-first { border-top: 2px solid #000; }
      .td-thu.thu-last { border-bottom: 2px solid #000; }
      .td-thu.thu-single { border-top: 2px solid #000; border-bottom: 2px solid #000; }
      .td-ten  { text-align: left; padding: 3px 6px; white-space: nowrap; font-size: 13pt; width: 205px; line-height: 1.1; }
      .td-phong{ font-weight: 600; font-size: 11pt; width: 95px; text-align: center; padding: 3px 3px; }
      .td-ky   { height: 18px; width: 90px; padding: 3px 3px; }
      .td-w1-empty { background: #fafafa; }
      .td-ghi  { text-align: left; padding: 3px 3px; font-size: 7.5pt; line-height: 1.15; width: 200px; }
      
      .footer-wrap { margin-top: 20px; page-break-inside: avoid; break-inside: avoid; }
      .sig-wrap { margin-top: 16px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid; break-inside: avoid; }
      .sig-box { text-align: center; width: 42%; min-width: 210px; display: inline-block; }
      .sig-date { font-size: 12pt; font-style: italic; margin-bottom: 2px; }
      .sig-title { font-weight: bold; font-size: 12pt; text-transform: uppercase; }
      .sig-space { height: 48px; }
      .sig-name { font-size: 12pt; font-weight: bold; font-style: italic; }
      
      .notes-wrap { font-size: 11pt; line-height: 1.3; }
      .notes-wrap p { margin-bottom: 2px; }
      .notes-wrap .luu-y { font-weight: bold; }
      
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }
      }
    `;

    function buildPage(title, subNote, tableBody, notesHtml) {
      return `<div class="doc-section">
        <div class="hdr">
          <div class="hdr-left">
            <b>SỞ GIÁO DỤC VÀ ĐÀO TẠO</b><br>
            <b>TRUNG TÂM GD KT TH VÀ HN</b><br>
            <span class="underline">LÊ THỊ HỒNG GẤM</span>
          </div>
          <div class="hdr-right">
            <div class="cong-hoa">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div class="doc-lap">Độc lập – Tự do – Hạnh phúc</div>
          </div>
        </div>
        <div class="title-wrap">
          <div class="main-title">${title}</div>
          <div class="sub-title">Ngày: <b>${fd(sDateObj)}</b></div>
          ${subNote ? `<div class="sub-note">(${subNote})</div>` : ''}
        </div>
        <table>
          <thead>
            <tr class="th-wrap">
              <th class="th-stt">STT</th>
              <th class="th-thu">THỨ</th>
              <th class="th-ten">HỌ TÊN</th>
              <th class="th-phong">PHÒNG</th>
              <th class="th-ky">KÝ TRỰC</th>
              <th class="th-ghi">GHI CHÚ</th>
            </tr>
          </thead>
          ${tableBody}
        </table>
        <div class="footer-wrap">
          <div class="notes-wrap">
            ${notesHtml}
          </div>
          <div class="sig-wrap">
            <div class="sig-box">
              <div class="sig-date-space" style="height: 19px;"></div>
              <div class="sig-title">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
              <div style="font-style:italic; font-size:10pt;">(Ký và ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">${user?.fullname?.trim() || user?.username || ''}</div>
            </div>
            <div class="sig-box">
              <div class="sig-date">TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth()+1} năm ${new Date().getFullYear()}</div>
              <div class="sig-title">GIÁM ĐỐC</div>
              <div style="font-style:italic; font-size:10pt;">(Ký và ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">${phuTrach || 'Vũ Quốc Phong'}</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    const rowsAn = buildRows(0);
    const rowsNgu = buildRows(1);

    const notesAn = '';

    const notesNgu = '';

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
      <title>Bảng Phân Công Trực Bán Trú Đặc Biệt</title>
      <style>${css}</style></head><body>
      ${buildPage(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ ĂN NH ${namHoc}`,
          'NGÀY ĐẶC BIỆT',
          buildTableBody(rowsAn),
          notesAn
      )}
      ${buildPage(
          `BẢNG PHÂN CÔNG TRỰC BÁN TRÚ NGỦ NH ${namHoc}`,
          'NGÀY ĐẶC BIỆT',
          buildTableBody(rowsNgu),
          notesNgu
      )}
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 2000);
        setPrintingSpecial(false);
        setShowSpecialModal(false);
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
        {canExport && (
          <div className="page-header-actions">
            <button className="btn btn-primary btn-sm" onClick={printPDF} style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
              <i className="fas fa-print"></i> In lịch 2 tuần (GV ký)
            </button>
            <button className="btn btn-sm" style={{background:'linear-gradient(135deg,#f59e0b,#fbbf24)',color:'#fff',border:'none',fontWeight:600}} onClick={() => setShowSpecialModal(true)}>
              <i className="fas fa-star"></i> In ngày đặc biệt
            </button>
          </div>
        )}
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
          <span style={{ fontWeight: 600, color: '#475569' }}>Giám sát</span>
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
                          const nv = pc.nhiem_vu !== undefined && pc.nhiem_vu !== null ? pc.nhiem_vu : (gv?.nhiem_vu ?? 0);
                          const isDD = nv === 0;
                          const isHT = nv === 1;
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
    
      {showSpecialModal && (
        <div className="modal-overlay open">
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-print" style={{color:'#f59e0b'}}></i> In Lịch trực (Ngày Đặc biệt)</div>
              <button className="modal-close" onClick={() => setShowSpecialModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Chọn ngày in:</label>
                <input type="date" className="form-control" value={specialDate} onChange={e => setSpecialDate(e.target.value)} />
              </div>
              <p style={{fontSize:'.85rem',color:'#64748b', marginTop: 10}}>Hệ thống sẽ tạo trang in bao gồm danh sách giáo viên trực của riêng ngày này.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSpecialModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={printSpecialDayPDF} disabled={printingSpecial} style={{background:'#f59e0b',borderColor:'#f59e0b',color:'#fff'}}>
                {printingSpecial ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-print"></i>}
                {printingSpecial ? ' Đang tạo...' : ' Tạo trang in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
