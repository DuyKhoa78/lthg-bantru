import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { cachedFetch } from '../../utils/cache';
import { useAlert } from '../../hooks/useAlert.jsx';
import { removeAccents, formatLopList } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './DiemDanh.css';

const STATUS_MAP = { 0: 'comat', 1: 'vang', 2: 'phep' };
const INV_STATUS_MAP = { 'comat': 0, 'vang': 1, 'phep': 2 };
const STATUS = {
    comat: { label: 'Có mặt', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
    vang: { label: 'Vắng', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
    phep: { label: 'Có phép', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
};

// ── Helpers export ────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const addDL = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getWeekDays = (baseDate, inclT5) => {
    const d = new Date(baseDate + 'T00:00:00');
    const mon = addDL(d, d.getDay() === 0 ? -6 : 1 - d.getDay());
    return [0, 1, 2, 3, 4].map(i => addDL(mon, i)).filter(x => x.getDay() !== 4 || inclT5);
};
const DOWS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
// Chuyển YYYY-MM-DD → DD/MM/YYYY
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };


export default function DiemDanhAn() {
    // Lấy ngày hôm nay theo giờ máy (máy đặt đúng múi giờ Việt Nam)
    const todayVN = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const { showAlert, AlertUI } = useAlert();
    const [date, setDate] = useState(todayVN);
    const [phongList, setPhongList] = useState([]);
    const [hsList, setHsList] = useState([]);
    const [diemDanhDb, setDiemDanhDb] = useState({});
    const [selectedPhong, setSelectedPhong] = useState(null);
    const [overrides, setOverrides] = useState({});
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasSchedule, setHasSchedule] = useState(null); // null = đang tải
    const [cauhinhNgay, setCauhinhNgay] = useState(null); // cấu hình ngày đặc biệt
    const [extraHsList, setExtraHsList] = useState([]); // HS thêm tay (hs_them_vao) với phòng override

    const [showActions, setShowActions] = useState(false);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.dd-export-btn-group')) {
                setShowActions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Derived: phòng tạm cho buổi ăn (từ cấu hình ngày đặc biệt)
    const phongTamAn = cauhinhNgay?.phong_tam_an || null;

    // Monthly Export States
    const [showMonthExportModal, setShowMonthExportModal] = useState(false);
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
    const [exportYear, setExportYear] = useState(new Date().getFullYear());
    const [exportWeeksActive, setExportWeeksActive] = useState([0, 1, 2, 3]); // which of the 4 weeks to include
    const [exportWeeksT5, setExportWeeksT5] = useState([]);
    const [exportRooms, setExportRooms] = useState([]);

    const [nguoiPhuTrach, setNguoiPhuTrach] = useState('Người phụ trách');
    const [namHocCauHinh, setNamHocCauHinh] = useState('2025-2026');

    // Load phòng & học sinh (cache sessionStorage 30 phút)
    useEffect(() => {
        Promise.all([
            cachedFetch('cache_phong_an', () => api.get('/api/phong/an').then(r => r.data?.phong || [])),
            cachedFetch('cache_hocsinh_an', () => api.get('/api/hocsinh/an').then(r => r.data?.hocsinh || [])),
            cachedFetch('cache_cauhinh', () => api.get('/api/cauhinh/').then(r => r.data?.he_thong || null), 60 * 60 * 1000),
        ]).then(([{ data: phong }, { data: hs }, { data: cauhinh }]) => {
            if (phong) setPhongList(phong);
            if (hs) setHsList(hs);
            if (cauhinh) {
                setNguoiPhuTrach(cauhinh.nguoi_phu_trach || 'Người phụ trách');
                setNamHocCauHinh(cauhinh.nam_hoc || '2025-2026');
            }
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
                    setHasSchedule(res.data.has_schedule === true);
                    // Lấy cấu hình ngày đặc biệt từ response (có hs_them_vao)
                    const cfg = res.data.cauhinh_ngay || null;
                    setCauhinhNgay(cfg);
                    // Tạo danh sách HS thêm tay với phòng override
                    if (cfg?.hs_them_vao && cfg.hs_them_vao.length > 0) {
                        setExtraHsList(cfg.hs_them_vao); // [{id, phong_an, phong_ngu, ho_ten, lop, ...}]
                    } else {
                        setExtraHsList([]);
                    }
                }
            }).catch(console.error).finally(() => setLoading(false));
    }, []);

    // Helper: kiểm tra HS có được phép tham gia ngày đặc biệt không
    const isHsAllowed = useCallback((hs) => {
        if (!cauhinhNgay) return true;
        const lopList = cauhinhNgay.lop_ap_dung;
        const hsLoaiTru = cauhinhNgay.hs_loai_tru;
        const hsThemVao = cauhinhNgay.hs_them_vao;
        if (hsThemVao && hsThemVao.some(x => x.id === hs.id)) return true;
        if (lopList && lopList.length > 0 && !lopList.includes(hs.lop)) return false;
        if (hsLoaiTru && hsLoaiTru.length > 0 && hsLoaiTru.includes(hs.id)) return false;
        return true;
    }, [cauhinhNgay]);

    const getStudentsForRoom = useCallback((ma_phong) => {
        const overridedElsewhere = new Set(
            extraHsList.filter(x => x.phong_an && x.phong_an !== ma_phong).map(x => x.id)
        );
        const base = hsList.filter(hs => {
            if (!isHsAllowed(hs)) return false;
            if (overridedElsewhere.has(hs.id)) return false;
            
            const groupPhong = cauhinhNgay?.lop_phong_an?.[hs.lop];
            if (groupPhong) return groupPhong === ma_phong;
            if (phongTamAn) return phongTamAn === ma_phong;
            return hs.phong_an === ma_phong;
        });

        const extraFiltered = extraHsList.filter(x => {
            const baseHs = hsList.find(h => h.id === x.id);
            if (!baseHs) return false;
            const effectivePhong = x.phong_an || cauhinhNgay?.lop_phong_an?.[baseHs.lop] || phongTamAn || baseHs.phong_an;
            return effectivePhong === ma_phong;
        }).filter(x => !base.find(s => s.id === x.id))
            .map(x => {
                const baseHs = hsList.find(h => h.id === x.id);
                return { ...(baseHs || {}), ...x, phong_an: ma_phong };
            });
        return [...base, ...extraFiltered];
    }, [hsList, extraHsList, phongTamAn, cauhinhNgay, isHsAllowed]);

    const visiblePhongList = useMemo(() => {
        if (!cauhinhNgay) return phongList;
        const overrideCodes = extraHsList.filter(x => x.phong_an).map(x => x.phong_an);
        const groupCodes = cauhinhNgay.lop_phong_an ? Object.values(cauhinhNgay.lop_phong_an) : [];
        const allCodes = [...new Set([phongTamAn, ...overrideCodes, ...groupCodes])].filter(Boolean);
        
        if (allCodes.length > 0) {
            const result = allCodes.map(code => phongList.find(p => p.ma_phong === code)).filter(Boolean);
            if (result.length > 0) return result;
        }
        const filtered = phongList.filter(p => getStudentsForRoom(p.ma_phong).length > 0);
        return filtered.length > 0 ? filtered : phongList;
    }, [phongList, phongTamAn, cauhinhNgay, extraHsList, getStudentsForRoom]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDiemDanh(date);
        setOverrides({});
        setSaved(false);
    }, [date, fetchDiemDanh]);

    useEffect(() => {
        if (visiblePhongList.length > 0) {
            const isCurrentValid = selectedPhong && visiblePhongList.some(p => p.ma_phong === selectedPhong.ma_phong);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (!isCurrentValid) setSelectedPhong(visiblePhongList[0]);
        } else {
            setSelectedPhong(null);
        }
    }, [visiblePhongList, selectedPhong]);

    const students = useMemo(() => {
        if (!selectedPhong) return [];
        return getStudentsForRoom(selectedPhong.ma_phong).map(s => ({
            ...s,
            trang_thai: overrides[s.id] ?? (diemDanhDb[s.id] !== undefined ? STATUS_MAP[diemDanhDb[s.id]] : 'comat'),
        }));
    }, [selectedPhong, diemDanhDb, overrides, getStudentsForRoom]);

    const roomStats = useMemo(() => {
        let markedCount = 0;
        const markedRooms = new Set();
        visiblePhongList.forEach(p => {
            const hsTrongPhong = getStudentsForRoom(p.ma_phong);
            if (hsTrongPhong.length === 0) return;
            if (hsTrongPhong.every(hs => diemDanhDb[hs.id] != null)) {
                markedCount++;
                markedRooms.add(p.ma_phong);
            }
        });
        return { markedCount, unmarkedCount: visiblePhongList.length - markedCount, markedRooms };
    }, [visiblePhongList, diemDanhDb, getStudentsForRoom]);

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

    // ── In danh sách ĂN 1 ngày đặc biệt – theo phòng & chia tờ theo GV ────────
    const exportOneDayPDF = async () => {
        // Lấy toàn bộ HS được phép trong ngày này
        const allowed = hsList.filter(hs => isHsAllowed(hs));
        const extraIds = new Set(allowed.map(h => h.id));
        const extra = extraHsList.filter(x => !extraIds.has(x.id));
        const dsList = [...allowed, ...extra].sort((a, b) => a.id - b.id);

        if (dsList.length === 0) return showAlert('Không có học sinh nào trong ngày này!', 'warning');

        // Fetch điểm danh của ngày hiện tại
        let ddMap = {};
        try {
            const r = await api.get(`/api/diemdanh/range/?tu=${date}&den=${date}`);
            if (r.data?.ok) ddMap = r.data.map;
        } catch { /* bỏ qua */ }

        const getSymHTML = (hsId) => {
            const val = ddMap[hsId]?.[date]?.an;
            if (val === 0) return '<span class="mk-c">✓</span>';
            if (val === 1) return '<span class="mk-v">✗</span>';
            if (val === 2) return '<span class="mk-p">P</span>';
            return '';
        };

        // Tính effectivePhong cho mỗi HS
        const getEffectivePhong = (s) => {
            const extraEntry = extraHsList.find(x => x.id === s.id);
            const groupPhong = cauhinhNgay?.lop_phong_an?.[s.lop];
            return extraEntry?.phong_an || groupPhong || phongTamAn || s.phong_an || '';
        };

        // Nhóm HS theo effectivePhong
        const byPhong = {};
        dsList.forEach(s => {
            const ph = getEffectivePhong(s);
            if (!byPhong[ph]) byPhong[ph] = [];
            byPhong[ph].push(s);
        });

        // Thuật toán chia danh sách HS theo số GV điểm danh
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

        const today = new Date();
        const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

        const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; }
.mk-c { color:#16a34a; font-weight:bold; }
.mk-v { color:#dc2626; font-weight:bold; }
.mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:4px; }
.hdr-inner td { border:none; padding:2px 4px; vertical-align:middle; }
.hdr-school { width:28%; text-align:center; font-size:10pt; line-height:1.4; }
.hdr-title { text-align:center; }
.hdr-title h1 { font-size:14pt; font-weight:bold; text-transform:uppercase; }
.hdr-title h2 { font-size:11pt; font-weight:bold; margin-top:2px; }
.dt { width:100%; border-collapse:collapse; }
.dt th { border:0.8px solid #333; padding:4px 2px; text-align:center; background:#ececec; font-weight:bold; font-size:9pt; }
.dt td { border:0.8px solid #555; padding:4px 2px; vertical-align:middle; font-size:11pt; }
.col-stt{width:6mm;text-align:center;}
.col-msbt{width:10mm;text-align:center;font-weight:bold;}
.col-gt{width:7mm;text-align:center;}
.col-lop{width:12mm;text-align:center;}
.col-phong{width:11mm;text-align:center;}
.col-dd{width:10mm;text-align:center;}
.col-ghichu{width:14mm;}
.ft-wrap{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid;}
.ft-left{flex:1;line-height:1.7;}
.ft-right{flex:1;text-align:center;}
.sig-title{font-weight:bold;margin-top:4px;}
.sig-space{height:44px;}
.sig-name{font-weight:bold;font-style:italic;}
.stat-box{margin-top:4px;margin-bottom:6px;padding:4px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;font-size:9.5pt;display:inline-flex;gap:16px;}
@page{size:A4 portrait;margin:1cm 0.8cm 1.2cm 0.8cm;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}*{color:#000!important;}.dt th{background:#ececec!important;}}`;

        // Sinh HTML cho tất cả các phòng
        const phongCodes = Object.keys(byPhong).sort();
        const htmlPages = phongCodes.flatMap(ma_phong => {
            const roomStudents = byPhong[ma_phong].sort((a, b) => a.id - b.id);
            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;
            const roomTotal = roomStudents.length;
            const roomComat = roomStudents.filter(s => ddMap[s.id]?.[date]?.an === 0).length;
            const roomVang  = roomStudents.filter(s => ddMap[s.id]?.[date]?.an === 1).length;
            const roomPhep  = roomStudents.filter(s => ddMap[s.id]?.[date]?.an === 2).length;
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
  <td class="hdr-title"><h1>ĐIỂM DANH ĂN TRƯA</h1></td>
</tr><tr><td class="hdr-title">
  <h2>NĂM HỌC ${namHocCauHinh} &nbsp;|&nbsp; ĐẶC BIỆT${pageLabel}</h2>
  <div style="font-size:10pt;margin-top:2px;">Ngày: <strong>${fmtDate(date)}</strong> &nbsp;|&nbsp; Lớp: <strong>${roomLopList}</strong> &nbsp;|&nbsp; Phòng ăn: <strong>${ma_phong}</strong></div>
</td></tr></table>
<div class="stat-box">Phòng ${ma_phong}: <strong>${roomTotal} HS</strong> &nbsp;|&nbsp; Có mặt: <strong style="color:#16a34a">${roomComat}</strong> &nbsp;|&nbsp; Vắng: <strong style="color:#dc2626">${roomVang}</strong> &nbsp;|&nbsp; Phép: <strong style="color:#d97706">${roomPhep}</strong></div>
<table class="dt"><thead>
  <tr>
    <th class="col-stt">STT</th>
    <th class="col-msbt" style="color:#c00;">Mã<br>số BT</th>
    <th style="width:35%;">HỌC SINH</th>
    <th class="col-gt">GT</th>
    <th class="col-lop">Lớp</th>
    <th class="col-phong">P.ĂN</th>
    <th class="col-dd">Đ.DANH</th>
    <th class="col-ghichu">Ghi chú</th>
  </tr>
</thead><tbody>${dataRows}</tbody></table>
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

        const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}</style></head><body>
${htmlPages}
<script>window.onload=function(){setTimeout(window.print,400);}</script>
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { showAlert('Trình duyệt chặn popup! Vui lòng cho phép mở popup.', 'warning'); return; }
        w.document.write(html);
        w.document.close();
    };

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
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
        const idx = allMons.indexOf(monStr);
        setExportWeeksActive(idx >= 0 ? [idx] : [0]);
        setExportWeeksT5([]);
    }, [showMonthExportModal, date]);

    // ── XUẤT EXCEL THEO THÁNG ──────────────────────────────────────────
    const exportMonthlyExcel = async () => {
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
        const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
        const tuStr = toISO(allDays[0]);
        const denStr = toISO(allDays[allDays.length - 1]);

        // Fetch dữ liệu điểm danh thực tế
        let ddMap = {};
        try {
            const rRes = await api.get(`/api/diemdanh/range/?tu=${tuStr}&den=${denStr}`);
            if (rRes.data?.ok) ddMap = rRes.data.map;
        } catch { /* bỏ qua lỗi */ }

        const getSym = (hsId, day) => {
            const val = ddMap[hsId]?.[toISO(day)]?.an;
            if (val === 0) return '✓';
            if (val === 1) return '✗';
            if (val === 2) return 'P';
            return '';
        };

        const startDateStr = `${p2(allDays[0].getDate())}/${allDays[0].getMonth() + 1}`;
        const endDateStr = `${p2(allDays[allDays.length - 1].getDate())}/${allDays[allDays.length - 1].getMonth() + 1}/${exportYear}`;
        const t5Dates = allDays.filter(d => d.getDay() === 4).map(d => `${d.getDate()}/${d.getMonth() + 1}`);
        const t5Str = t5Dates.length > 0 ? `có học bù ${t5Dates.length} ngày thứ 5 (${t5Dates.join(' và ')})` : 'không học bù thứ 5';

        const wb = XLSX.utils.book_new();

        exportRooms.forEach(ma_phong => {
            const roomStudents = hsList.filter(s => s.phong_an === ma_phong).sort((a, b) => a.id - b.id);
            let aoa = [];
            let merges = [];

            aoa.push(['Phân hiệu THPT', '', 'ĐIỂM DANH ĂN TRƯA', ...Array(NC - 3).fill('')]);
            aoa.push(['Lê Thị Hồng Gấm', '', `NĂM HỌC ${namHocCauHinh}`, ...Array(NC - 3).fill('')]);

            const r2 = ['Thời gian bắt đầu ăn 11g00 đến 11g35', '', 'Thời gian nghỉ trưa: 11g45 13g00', '', `THÁNG ${exportMonth}/${exportYear} (${startDateStr} - ${endDateStr})`, '', '', t5Str, '', '', `${numDays} buổi ăn`, ...Array(NC - 11).fill('')];
            aoa.push(r2);

            aoa.push(['Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.', ...Array(NC - 1).fill('')]);
            aoa.push(Array(NC).fill(''));

            const h1 = ['STT', 'STT\nDS BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'Phòng\nĂn'];
            const h2 = ['', '', '', '', '', ''];

            allDays.forEach(d => {
                h1.push(d.getDate() === allDays[0].getDate() ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.getDate()}`);
                h2.push(d.getDay() === 0 ? 'CN' : (d.getDay() + 1).toString());
            });

            h1.push('TS\nBuổi ăn', 'SB\nVắng', 'Vắng\ncó P', 'Buổi ăn\nthực tế');
            h2.push('', '', '', '');

            aoa.push(h1);
            aoa.push(h2);

            merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 0, c: 2 }, e: { r: 0, c: 5 } });
            merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }, { s: { r: 1, c: 2 }, e: { r: 1, c: 5 } });
            merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: NC - 1 } });
            for (let c = 0; c < 6; c++) merges.push({ s: { r: 5, c: c }, e: { r: 6, c: c } });
            for (let c = NC - 4; c < NC; c++) merges.push({ s: { r: 5, c: c }, e: { r: 6, c: c } });

            roomStudents.forEach((s, i) => {
                const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                const dayCells = allDays.map(d => getSym(s.id, d));
                const sbVang = dayCells.filter(v => v === '✗').length;
                const sbPhep = dayCells.filter(v => v === 'P').length;
                const thucTe = dayCells.filter(v => v === '✓').length;
                const hasAttendance = dayCells.some(v => v !== '');
                aoa.push([i + 1, i + 1, s.ho_ten, gt, s.lop, ma_phong, ...dayCells, numDays, sbVang || '', sbPhep || '', hasAttendance ? thucTe : '']);
            });

            const ws = XLSX.utils.aoa_to_sheet(aoa);

            const cols = [{ wch: 5 }, { wch: 5 }, { wch: 26 }, { wch: 5 }, { wch: 7 }, { wch: 7 }];
            for (let i = 0; i < numDays; i++) cols.push({ wch: 4 });
            cols.push({ wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 12 });
            ws['!cols'] = cols;
            ws['!merges'] = merges;

            XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0, 31));
        });

        XLSX.writeFile(wb, `DiemDanhAn_Thang${exportMonth}_${exportYear}.xlsx`);
        setShowMonthExportModal(false);
    };

    // ── XUẤT PDF THEO THÁNG ──────────────────────────────────────────
    const exportMonthlyPDF = async () => {
        if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng để xuất PDF!', 'warning');

        if (exportWeeksActive.length === 0) return showAlert('Vui lòng chọn ít nhất 1 tuần để xuất!', 'warning');

        const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
        const activeWeekIndices = allWeekMons.map((_, i) => i).filter(i => exportWeeksActive.includes(i));

        const weeksData = activeWeekIndices.map(wIndex => {
            const inclT5 = exportWeeksT5.includes(wIndex);
            const wd = getWeekDays(allWeekMons[wIndex], inclT5);
            const mon = wd[0];
            const fri = wd[wd.length - 1];
            const label = `Tuần ${wIndex + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)}–${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
            return { days: wd, label };
        });

        const totalDays = weeksData.reduce((s, w) => s + w.days.length, 0);
        const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
        const allDaysList = weeksData.flatMap(w => w.days);

        // Fetch dữ liệu điểm danh thực tế
        let ddMap = {};
        try {
            const rRes = await api.get(`/api/diemdanh/range/?tu=${toISO(allDaysList[0])}&den=${toISO(allDaysList[allDaysList.length - 1])}`);
            if (rRes.data?.ok) ddMap = rRes.data.map;
        } catch { /* bỏ qua lỗi */ }

        const getSymHTML = (hsId, day) => {
            const val = ddMap[hsId]?.[toISO(day)]?.an;
            if (val === 0) return '<span class="mk-c">✓</span>';
            if (val === 1) return '<span class="mk-v">✗</span>';
            if (val === 2) return '<span class="mk-p">P</span>';
            return '';
        };
        const getSymVal = (hsId, day) => ddMap[hsId]?.[toISO(day)]?.an;

        const today = new Date();
        const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
        const luuY = `Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.`;

        const weekTH1 = weeksData.map(w =>
            `<th colspan="${w.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">${w.label}</th>`
        ).join('');

        const weekTH2 = weeksData.map(w =>
            w.days.map((d, di) =>
                `<th class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>${d.getDate()}/${p2(d.getMonth() + 1)}<br><small>${DOWS[d.getDay()]}</small></th>`
            ).join('')
        ).join('');

        // ── Hàm chia danh sách HS theo số GV điểm danh, ưu tiên theo lớp, lệch không quá 10 HS ──
        const splitByTeachers = (students, numTeachers) => {
            if (numTeachers <= 1) return [students];
            const byClass = {};
            students.forEach(s => {
                const k = s.lop || '';
                if (!byClass[k]) byClass[k] = [];
                byClass[k].push(s);
            });
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
                            const clsInI = [...new Set(groups[i].map(s => s.lop || ''))].sort((a, b) => {
                                return groups[i].filter(s => (s.lop||'')===a).length - groups[i].filter(s => (s.lop||'')===b).length;
                            });
                            let moved = false;
                            for (const cls of clsInI) {
                                const clsStu = groups[i].filter(s => (s.lop || '') === cls);
                                const newDiff = (groups[i].length - clsStu.length) - (groups[j].length + clsStu.length);
                                if (Math.abs(newDiff) < Math.abs(diff)) {
                                    clsStu.forEach(s => groups[j].push(s));
                                    groups[i] = groups[i].filter(s => (s.lop || '') !== cls);
                                    sizes[i] -= clsStu.length;
                                    sizes[j] += clsStu.length;
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

        const htmlPages = exportRooms.flatMap(ma_phong => {
            const roomStudents = hsList.filter(s => s.phong_an === ma_phong);
            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;
            const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
            const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
            const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;

            const chunks = splitByTeachers(roomStudents, numTeachers);
            const totalPages = chunks.length;
            const offsets = [];
            let off = 0;
            chunks.forEach(chunk => {
                chunk.sort((a, b) => a.id - b.id);
                offsets.push(off);
                off += chunk.length;
            });

            return chunks.map((chunk, pageIdx) => {
                const pageLabel = totalPages > 1 ? ` (Tờ ${pageIdx + 1}/${totalPages})` : '';
                const globalOffset = offsets[pageIdx];

                const dataRows = chunk.map((s, i) => {
                    const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                    const dayCells = weeksData.map((_w) =>
                        _w.days.map((d, di) =>
                            `<td class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #555;"' : ''}>${getSymHTML(s.id, d)}</td>`
                        ).join('')
                    ).join('');
                    const allVals = weeksData.flatMap(w => w.days.map(d => getSymVal(s.id, d)));
                    const sbVang = allVals.filter(v => v === 1).length;
                    const sbPhep = allVals.filter(v => v === 2).length;
                    const thucTe = allVals.filter(v => v === 0 || v === 1).length;
                    const hasAttendance = allVals.some(v => v !== undefined && v !== null);
                    return `<tr>
          <td class="col-stt-an">${globalOffset + i + 1}</td>
          <td class="col-msbt-an">${s.id}</td>
          <td class="col-ten-an">${s.ho_ten}</td>
          <td class="col-gt-an">${gt}</td>
          <td class="col-lop-an">${s.lop}</td>
          <td class="col-phong-an">${s.phong_an || ma_phong}</td>
          ${dayCells}
          <td class="col-sum-an">${totalDays}</td>
          <td class="col-sum-an">${sbVang || ''}</td>
          <td class="col-sum-an">${sbPhep || ''}</td>
          <td class="col-sum-an">${hasAttendance ? thucTe : ''}</td>
          <td class="col-ghichu-an"></td>
        </tr>`;
                }).join('');

                return `<div class="room-block">
<table class="hdr-inner-an"><tr>
  <td class="hdr-school-an" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-title-an"><h1>ĐIỂM DANH ĂN TRƯA</h1></td>
</tr><tr>
  <td class="hdr-title-an">
    <h2>NĂM HỌC ${namHocCauHinh}${pageLabel}</h2>
    <div class="nh-an">Thời gian: 11g00–11g45 &nbsp;|&nbsp; Tháng ${exportMonth}/${exportYear} &nbsp;|&nbsp; Phòng ăn: ${ma_phong}</div>
  </td>
</tr></table>
<div class="ly-row-an-div">${luuY}</div>
<table class="dt-an">
  <thead>
    <tr>
      <th rowspan="2" class="col-stt-an">ST<br>T</th>
      <th rowspan="2" class="col-msbt-an" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" class="col-ten-an">HỌC SINH</th>
      <th rowspan="2" class="col-gt-an">GT</th>
      <th rowspan="2" class="col-lop-an">LớP</th>
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
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong>${totalPages > 1 ? ` &nbsp;|&nbsp; Tờ này: <strong>${chunk.length} HS</strong>` : ''}</div>
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
            });
        }).join('');

        const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:10pt; color:#000; background:#fff; }
.mk-c { color:#16a34a; font-weight:bold; }
.mk-v { color:#dc2626; font-weight:bold; }
.mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.ly-row-an-div { padding:2px 4px; font-size:9.5pt; line-height:1.2; margin-bottom:2px; }
.dt-an { width:100%; border-collapse:collapse; }
.hdr-inner-an { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner-an td { border:none; padding:2px 4px; vertical-align:middle; }
.hdr-school-an { width:20%; text-align:center; font-size:9.5pt; line-height:1.3; }
.hdr-title-an  { text-align:center; }
.hdr-title-an h1 { font-size:15pt; font-weight:bold; text-transform:uppercase; }
.hdr-title-an h2 { font-size:11pt; font-weight:bold; margin-top:1px; }
.hdr-title-an .nh-an { font-size:10pt; margin-top:2px; }
.dt-an th { border:0.8px solid #333; padding:2px 1px; text-align:center;
            background:#ececec; font-weight:bold; vertical-align:middle;
            font-size:8.5pt; line-height:1.1; color:#000; word-break:keep-all; }
.dt-an td { border:0.8px solid #555; padding:3px 1px; vertical-align:middle; color:#000; font-size:10pt; }
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
                    <h2><i className="fas fa-utensils" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Điểm danh Ăn</h2>
                    <p>Ghi nhận sĩ số học sinh ăn theo phòng &amp; ngày. Danh sách HS do Admin phân bổ.</p>
                    {cauhinhNgay && (() => {
                        const lopArr = cauhinhNgay.lop_ap_dung;
                        const ptAn = cauhinhNgay.phong_tam_an;
                        const hasInfo = (lopArr && lopArr.length > 0) || ptAn;
                        return hasInfo ? (
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {lopArr && lopArr.length > 0 && (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'flex-start', gap: 6,
                                        background: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 8,
                                        padding: '5px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600,
                                        maxWidth: '100%', flexWrap: 'wrap'
                                    }}>
                                        <i className="fas fa-filter" style={{ marginTop: 2 }}></i>
                                        <span>
                                            <span style={{ opacity: 0.75, fontWeight: 500 }}>Ngày đặc biệt – chỉ </span>
                                            <strong>{lopArr.length} lớp</strong>
                                            <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.78rem', color: '#b45309' }}>
                                                ({formatLopList(lopArr)})
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {ptAn && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                        background: '#e0f2fe', border: '1.5px solid #7dd3fc', borderRadius: 8,
                                        padding: '5px 12px', fontSize: '0.82rem', color: '#0369a1', fontWeight: 600 }}>
                                        <i className="fas fa-compress-arrows-alt"></i>
                                        Gộp phòng ăn: <strong>{ptAn}</strong>
                                    </div>
                                )}
                            </div>
                        ) : null;
                    })()}
                </div>
                <div className="page-header-actions">
                    <div className="dd-export-btn-group">
                        <button className="btn btn-outline btn-sm" onClick={() => setShowActions(!showActions)}>
                            <i className="fas fa-print"></i> Xuất dữ liệu <i className="fas fa-caret-down" style={{ marginLeft: 4 }}></i>
                        </button>
                        <div className={`dd-export-menu ${showActions ? 'open' : ''}`} style={{ minWidth: 200 }}>
                            {cauhinhNgay && (
                                <button className="dd-export-item" onClick={() => { exportOneDayPDF(); setShowActions(false); }}>
                                    <i className="fas fa-file-invoice" style={{ color: '#0ea5e9', width: 20, textAlign: 'center' }}></i> In ngày đặc biệt
                                </button>
                            )}
                            <button className="dd-export-item" onClick={() => { setShowMonthExportModal(true); setShowActions(false); }}>
                                <i className="fas fa-file-pdf" style={{ color: '#e53e3e', width: 20, textAlign: 'center' }}></i> Xuất DS (Tháng)
                            </button>
                        </div>
                    </div>
                    {hasSchedule && (
                        <>

                            <button className="btn btn-ghost btn-sm" onClick={() => setAll('vang')}><i className="fas fa-times"></i> Tất cả Vắng</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={!selectedPhong || saving}>
                                {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${saved ? 'fa-check' : 'fa-save'}`}></i>}
                                {saved ? ' Đã lưu!' : saving ? ' Đang lưu...' : ' Lưu điểm danh'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="stat-cards-row" style={{ marginBottom: 18 }}>
                <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>Có mặt</p><h3>{counts.comat || 0}</h3></div></div>
                <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>Vắng</p><h3>{counts.vang || 0}</h3></div></div>
                <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>Có phép</p><h3>{counts.phep || 0}</h3></div></div>
            </div>

            <div className="dd-layout">
                <aside className="dd-room-panel">
                    <div className="dd-room-panel-header"><i className="fas fa-utensils"></i> Phòng ăn</div>
                    <div className="dd-date-picker">
                        <label><i className="fas fa-calendar-day" style={{ color: 'var(--primary)', marginRight: 4 }}></i> Chọn ngày điểm danh</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    {hasSchedule && (
                        <>
                            <div className="dd-room-stats">
                                <span>Đã điểm: <span className="marked">{roomStats.markedCount}</span></span>
                                <span>Chưa điểm: <span className="unmarked">{roomStats.unmarkedCount}</span></span>
                            </div>
                            <ul className="dd-room-list">
                                {visiblePhongList.map(p => {
                                    // Số HS hiển thị: lấy chính xác theo helper
                                    const count = getStudentsForRoom(p.ma_phong).length;
                                    const isMarked = roomStats.markedRooms.has(p.ma_phong);
                                    return (
                                        <li key={p.ma_phong} className={`dd-room-item${cauhinhNgay ? ' is-special' : ''}${selectedPhong?.ma_phong === p.ma_phong ? ' active' : ''}`} onClick={() => { setSelectedPhong(p); setOverrides({}); setSaved(false); }}>
                                            <div className={`dd-room-status-icon ${isMarked ? 'marked' : 'unmarked'}`} title={isMarked ? 'Đã điểm danh' : 'Chưa điểm danh'}>
                                                <i className={isMarked ? 'fas fa-check' : 'fas fa-exclamation'}></i>
                                            </div>
                                            <div className="dd-room-item-name">
                                                <i className="fas fa-door-open"></i>
                                                {p.ma_phong}
                                                {phongTamAn && p.ma_phong === phongTamAn && (
                                                    <span style={{ marginLeft: 4, fontSize: '0.65rem', background: '#0ea5e9', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>TẠM</span>
                                                )}
                                            </div>
                                            <span className="dd-room-count">{count} HS</span>
                                        </li>
                                    );
                                })}
                                {visiblePhongList.length === 0 && <li style={{ padding: 12, color: '#94a3b8', textAlign: 'center' }}>Không có phòng</li>}
                            </ul>
                        </>
                    )}
                </aside>

                <div className="dd-main-panel">
                    {hasSchedule === null ? (
                        <div style={{ textAlign: 'center', padding: '100px 20px', background: '#fff', borderRadius: 8, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2.5rem', color: '#009CFF', marginBottom: 16 }}></i>
                            <p style={{ color: '#64748b' }}>Đang kiểm tra lịch bán trú...</p>
                        </div>
                    ) : !hasSchedule ? (
                        <div style={{ textAlign: 'center', padding: '100px 20px', background: '#fff', borderRadius: 8, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ fontSize: '4rem', color: '#cbd5e1', marginBottom: 16 }}><i className="fas fa-calendar-times"></i></div>
                            <h3 style={{ color: '#475569', fontSize: '1.4rem', marginBottom: 8 }}>Không có lịch bán trú</h3>
                            <p style={{ color: '#64748b', fontSize: '1rem' }}>Ngày <b>{fmtDate(date)}</b> không có phân công trực, học sinh nghỉ bán trú.</p>
                        </div>
                    ) : (
                        <>
                            <div className="dd-main-header">
                                <div className="dd-main-header-info">
                                    <h3>{selectedPhong ? `Phòng ${selectedPhong.ma_phong}` : 'Chọn phòng để xem'}</h3>
                                    <p>{selectedPhong ? `Ngày: ${fmtDate(date)} — ${students.length} học sinh` : 'Nhấn vào phòng bên trái để bắt đầu điểm danh'}</p>
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
                                    <div className="dd-empty" style={{ color: 'var(--primary)' }}><i className="fas fa-spinner fa-spin"></i><h3>Đang tải dữ liệu điểm danh...</h3></div>
                                ) : students.length === 0 ? (
                                    <div className="dd-empty"><i className="fas fa-users-slash"></i><h3>Chưa có học sinh</h3><p>Phòng này chưa được xếp học sinh nào</p></div>
                                ) : (
                                    <div className="dd-student-grid">
                                        {students.filter(s => {
                                            if (!searchTerm) return true;
                                            return removeAccents(s.ho_ten.toLowerCase()).includes(removeAccents(searchTerm.toLowerCase()));
                                        }).map(s => (
                                            <div key={s.id} className={`dd-student-card status-${s.trang_thai}`}
                                                style={{ background: STATUS[s.trang_thai].bg, borderColor: STATUS[s.trang_thai].border }}>
                                                <div className="dd-student-info">
                                                    <span className="dd-student-name">{s.ho_ten}</span>
                                                    <span className="dd-student-class">{s.lop}</span>
                                                </div>
                                                <div className="dd-status-btns">
                                                    {Object.entries(STATUS).map(([key, val]) => (
                                                        <button key={key}
                                                            className={`dd-status-btn${s.trang_thai === key ? ' active' : ''}`}
                                                            style={s.trang_thai === key ? { background: val.dot, color: '#fff', border: `1.5px solid ${val.dot}` } : {}}
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
                                        <span className="dd-summary-item"><span className="dd-summary-dot dot-comat"></span> Có mặt: <strong>{counts.comat || 0}</strong></span>
                                        <span className="dd-summary-item"><span className="dd-summary-dot dot-vang"></span> Vắng: <strong>{counts.vang || 0}</strong></span>
                                        <span className="dd-summary-item"><span className="dd-summary-dot dot-phep"></span> Phép: <strong>{counts.phep || 0}</strong></span>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <select className="export-modal-select" value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}>
                                            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                                        </select>
                                        <span style={{ color: '#64748b', fontWeight: 600 }}>/</span>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>
                                        <i className="fas fa-calendar-week" style={{ color: '#6366f1' }}></i> CHỌN TUẦN IN
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #6366f1', background: '#eef2ff', color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => setExportWeeksActive(weekLabelsForModal.map((_, i) => i))}>Chọn tất cả</button>
                                        <button
                                            style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}
                                            onClick={() => setExportWeeksActive([])}>Bỏ chọn</button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                                    {weekLabelsForModal.map((_, wIndex) => {
                                        const active = exportWeeksActive.includes(wIndex);
                                        return (
                                            <label key={wIndex}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                    borderRadius: 7, cursor: 'pointer', userSelect: 'none', transition: 'all .15s',
                                                    background: active ? '#eef2ff' : '#f8fafc',
                                                    border: `1.5px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                                                    fontWeight: active ? 600 : 400,
                                                    color: active ? '#4f46e5' : '#64748b',
                                                }}>
                                                <input
                                                    type="checkbox"
                                                    checked={active}
                                                    style={{ accentColor: '#6366f1' }}
                                                    onChange={e => {
                                                        if (e.target.checked) setExportWeeksActive(prev => [...prev, wIndex]);
                                                        else {
                                                            setExportWeeksActive(prev => prev.filter(w => w !== wIndex));
                                                            // Bỏ T5 của tuần bị bỏ chọn
                                                            setExportWeeksT5(prev => prev.filter(w => w !== wIndex));
                                                        }
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{weekLabelsForModal[wIndex]?.split(':')[0]}</span>
                                                    <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 4, color: active ? '#6366f1' : '#94a3b8' }}>
                                                        {weekLabelsForModal[wIndex]?.split(': ')[1]}
                                                    </span>
                                                </span>
                                                {!active && (
                                                    <span style={{ marginLeft: 'auto', fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>Nghỉ</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── DẠY BÙ THỨ NĂM ──────────────────────────── */}
                            <div className="export-modal-group">
                                <div className="export-modal-section-title">
                                    <i className="fas fa-calendar-plus" style={{ color: '#10b981' }}></i> DẠY BÙ THỨ NĂM (T5)
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
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 10 }}>
                                        Tích vào tuần nào có lịch dạy bù Thứ Năm
                                    </div>
                                </div>
                            </div>

                            {/* Ghi chú chia tờ theo GV điểm danh */}
                            <div style={{ padding: '6px 10px', borderRadius: 7, background: '#eef2ff', border: '1px solid #c7d2fe', fontSize: '0.83rem', color: '#4338ca' }}>
                                <i className="fas fa-info-circle"></i> PDF sẽ chia tờ theo <strong>số GV điểm danh</strong> của từng phòng, ưu tiên giữ nguyên lớp và không lệch quá 10 HS.
                            </div>


                            <div className="export-modal-group">
                                <div className="export-room-header">
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>CHỌN PHÒNG</div>
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
                            <button className="btn btn-success" onClick={exportMonthlyExcel} style={{ background: '#10b981', borderColor: '#10b981' }}><i className="fas fa-file-excel"></i> Xuất Excel</button>
                            <button className="btn btn-primary" onClick={exportMonthlyPDF} style={{ background: '#ef4444', borderColor: '#ef4444' }}><i className="fas fa-file-pdf"></i> Xuất PDF</button>
                        </div>
                    </div>
                </div>
            )}
            {AlertUI}
        </>
    );
}
