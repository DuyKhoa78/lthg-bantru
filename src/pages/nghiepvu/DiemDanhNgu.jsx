import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { cachedFetch } from '../../utils/cache';
import { useAlert } from '../../hooks/useAlert.jsx';
import { removeAccents, formatLopList } from '../../utils/stringUtils';
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
    vang: { label: 'Vắng', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
    phep: { label: 'Có phép', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
};
// Chuyển YYYY-MM-DD → DD/MM/YYYY
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };


export default function DiemDanhNgu() {
    // Lấy ngày hôm nay theo giờ máy (máy đặt đúng múi giờ Việt Nam)
    const todayVN = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const { showAlert, AlertUI } = useAlert();
    const [date, setDate] = useState(todayVN);
    const [phongList, setPhongList] = useState([]);
    const [hsList, setHsList] = useState([]);
    const [diemDanhDb, setDiemDanhDb] = useState({}); // { [hsId]: 0|1|2 }

    const [selectedPhongCode, setSelectedPhongCode] = useState(null);
    const [overrides, setOverrides] = useState({});
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasSchedule, setHasSchedule] = useState(null); // null = đang tải
    const [cauhinhNgay, setCauhinhNgay] = useState(null); // cấu hình ngày đặc biệt
    const [extraHsList, setExtraHsList] = useState([]); // HS thêm tay với phòng override

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

    // Derived: phòng tạm cho buổi ngủ
    const phongTamNgu = cauhinhNgay?.phong_tam_ngu || null;
    // Week Export States
    const [showMonthExportModal, setShowMonthExportModal] = useState(false);
    const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
    const [exportYear, setExportYear] = useState(new Date().getFullYear());
    const [exportSelectedWeek, setExportSelectedWeek] = useState(0); // single week index
    const [exportT5, setExportT5] = useState(false);               // T5 for that week
    const [exportRooms, setExportRooms] = useState([]);

    const [nguoiPhuTrach, setNguoiPhuTrach] = useState('Người phụ trách');
    const [namHocCauHinh, setNamHocCauHinh] = useState('2025-2026');


    // Load phòng & học sinh (cache sessionStorage 30 phút)
    useEffect(() => {
        Promise.all([
            cachedFetch('cache_phong_ngu', () => api.get('/api/phong/ngu').then(r => r.data?.phong || [])),
            cachedFetch('cache_hocsinh_ngu', () => api.get('/api/hocsinh/ngu').then(r => r.data?.hocsinh || [])),
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
                    setHasSchedule(res.data.has_schedule === true);
                    // Cấu hình ngày đặc biệt
                    const cfg = res.data.cauhinh_ngay || null;
                    setCauhinhNgay(cfg);
                    setExtraHsList(cfg?.hs_them_vao?.length > 0 ? cfg.hs_them_vao : []);
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
        const phongObj = phongList.find(p => p.ma_phong === ma_phong);
        const phongGt = phongObj ? phongObj.gioi_tinh : null;
        const isGenderCompatible = (hs) => {
            if (phongGt === null || phongGt === undefined) return true;
            if (hs.gioi_tinh === null || hs.gioi_tinh === undefined) return true;
            return hs.gioi_tinh === phongGt;
        };

        const overridedElsewhere = new Set(
            extraHsList.filter(x => x.phong_ngu && x.phong_ngu !== ma_phong).map(x => x.id)
        );
        const base = hsList.filter(hs => {
            if (!isHsAllowed(hs)) return false;
            if (!isGenderCompatible(hs)) return false; // STRICT GENDER CHECK
            if (overridedElsewhere.has(hs.id)) return false;
            
            const groupPhong = cauhinhNgay?.lop_phong_ngu?.[hs.lop];
            if (groupPhong) return groupPhong === ma_phong;
            if (phongTamNgu) return phongTamNgu === ma_phong;
            return hs.phong_ngu === ma_phong;
        });

        const extraFiltered = extraHsList.filter(x => {
            const baseHs = hsList.find(h => h.id === x.id);
            if (!baseHs) return false;
            if (!isGenderCompatible(baseHs)) return false; // STRICT GENDER CHECK
            const effectivePhong = x.phong_ngu || cauhinhNgay?.lop_phong_ngu?.[baseHs.lop] || phongTamNgu || baseHs.phong_ngu;
            return effectivePhong === ma_phong;
        }).filter(x => !base.find(s => s.id === x.id))
            .map(x => {
                const baseHs = hsList.find(h => h.id === x.id);
                return { ...(baseHs || {}), ...x, phong_ngu: ma_phong };
            });
        return [...base, ...extraFiltered];
    }, [hsList, extraHsList, phongTamNgu, cauhinhNgay, isHsAllowed, phongList]);

    const visiblePhongList = useMemo(() => {
        if (!cauhinhNgay) return phongList;
        const overrideCodes = extraHsList.filter(x => x.phong_ngu).map(x => x.phong_ngu);
        const groupCodes = cauhinhNgay.lop_phong_ngu ? Object.values(cauhinhNgay.lop_phong_ngu) : [];
        const allCodes = [...new Set([phongTamNgu, ...overrideCodes, ...groupCodes])].filter(Boolean);
        
        if (allCodes.length > 0) {
            const result = allCodes.map(code => phongList.find(p => p.ma_phong === code)).filter(Boolean);
            if (result.length > 0) return result;
        }
        const filtered = phongList.filter(p => getStudentsForRoom(p.ma_phong).length > 0);
        return filtered.length > 0 ? filtered : phongList;
    }, [phongList, phongTamNgu, cauhinhNgay, extraHsList, getStudentsForRoom]);

    // Derive selectedPhong từ visiblePhongList và selectedPhongCode (tránh lưu object, lưu code chuỗi thôi)
    const selectedPhong = useMemo(() => {
        if (visiblePhongList.length === 0) return null;
        return visiblePhongList.find(p => p.ma_phong === selectedPhongCode) || visiblePhongList[0];
    }, [visiblePhongList, selectedPhongCode]);

    // Logic hiển thị học sinh theo phòng đang chọn
    const students = useMemo(() => {
        if (!selectedPhong) return [];
        return getStudentsForRoom(selectedPhong.ma_phong).map(s => ({
            ...s,
            trang_thai: overrides[s.id] ?? (diemDanhDb[s.id] != null ? STATUS_MAP[diemDanhDb[s.id]] : 'comat'),
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

    // ── In danh sách NGỦ 1 ngày đặc biệt – theo phòng & chia tờ theo GV ────────
    const exportOneDayPDF = async () => {
        const allowed = hsList.filter(hs => isHsAllowed(hs));
        const extraIds = new Set(allowed.map(h => h.id));
        const extra = extraHsList.filter(x => !extraIds.has(x.id));
        const dsList = [...allowed, ...extra].sort((a, b) => a.id - b.id);
        if (dsList.length === 0) return showAlert('Không có học sinh nào trong ngày này!', 'warning');

        let ddMap = {};
        try {
            const r = await api.get(`/api/diemdanh/range/?tu=${date}&den=${date}`);
            if (r.data?.ok) ddMap = r.data.map;
        } catch { /* bỏ qua */ }

        const getSymHTML = (hsId) => {
            const val = ddMap[hsId]?.[date]?.ngu;
            if (val === 0) return '<span class="mk-c">✓</span>';
            if (val === 1) return '<span class="mk-v">✗</span>';
            if (val === 2) return '<span class="mk-p">P</span>';
            return '';
        };

        const byPhong = {};
        visiblePhongList.forEach(p => {
            const stu = getStudentsForRoom(p.ma_phong);
            if (stu && stu.length > 0) {
                byPhong[p.ma_phong] = stu;
            }
        });
        
        if (Object.keys(byPhong).length === 0) return showAlert('Không có học sinh nào trong ngày này!', 'warning');

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

        const phongCodes = Object.keys(byPhong).sort();
        const htmlPages = phongCodes.flatMap(ma_phong => {
            const roomStudents = byPhong[ma_phong].sort((a, b) => a.id - b.id);
            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;
            const roomTotal = roomStudents.length;
            const roomComat = roomStudents.filter(s => ddMap[s.id]?.[date]?.ngu === 0).length;
            const roomVang  = roomStudents.filter(s => ddMap[s.id]?.[date]?.ngu === 1).length;
            const roomPhep  = roomStudents.filter(s => ddMap[s.id]?.[date]?.ngu === 2).length;
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
  <td class="hdr-title"><h1>ĐIỂM DANH NGHỈ TRƯA</h1></td>
</tr><tr><td class="hdr-title">
  <h2>NĂM HỌC ${namHocCauHinh} &nbsp;|&nbsp; ĐẶC BIỆT${pageLabel}</h2>
  <div style="font-size:10pt;margin-top:2px;">Ngày: <strong>${fmtDate(date)}</strong> &nbsp;|&nbsp; Lớp: <strong>${roomLopList}</strong> &nbsp;|&nbsp; Phòng ngủ: <strong>${ma_phong}</strong></div>
</td></tr></table>
<div class="stat-box">Phòng ${ma_phong}: <strong>${roomTotal} HS</strong> &nbsp;|&nbsp; Có mặt: <strong style="color:#16a34a">${roomComat}</strong> &nbsp;|&nbsp; Vắng: <strong style="color:#dc2626">${roomVang}</strong> &nbsp;|&nbsp; Phép: <strong style="color:#d97706">${roomPhep}</strong></div>
<table class="dt"><thead>
  <tr>
    <th class="col-stt">STT</th>
    <th class="col-msbt" style="color:#c00;">Mã<br>số BT</th>
    <th style="width:35%;">HỌC SINH</th>
    <th class="col-gt">GT</th>
    <th class="col-lop">Lớp</th>
    <th class="col-phong">P.NGỦ</th>
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

    // ── Helpers export ─────────────────────────────────────
    const p2 = n => String(n).padStart(2, '0');
    const addDaysLocal = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const getWeekDays = (baseDate, inclT5) => {
        const d = new Date(baseDate + 'T00:00:00');
        const dow = d.getDay();
        const monday = addDaysLocal(d, dow === 0 ? -6 : 1 - dow);
        return [0, 1, 2, 3, 4].map(i => addDaysLocal(monday, i))
            .filter(day => day.getDay() !== 4 || inclT5);
    };

    const todayLabel = () => { const t = new Date(); return `TP Hồ Chí Minh, ngày ${t.getDate()} tháng ${t.getMonth() + 1} năm ${t.getFullYear()}`; };
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
            result.push(cur.getFullYear() + '-' + p2(cur.getMonth() + 1) + '-' + p2(cur.getDate()));
            cur = new Date(cur); cur.setDate(cur.getDate() + 7);
        }
        return result;
    };
    const weekLabelsForModal = useMemo(() => {
        return computeWeekMondayStrs(exportMonth, exportYear).map((monStr, i) => {
            const mon = new Date(monStr + 'T00:00:00');
            const fri = addDaysLocal(mon, 4);
            return `Tuần ${i + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)} – ${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
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
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
        const idx = allMons.indexOf(monStr);
        setExportSelectedWeek(idx >= 0 ? idx : 0);
        setExportT5(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMonthExportModal, date]);

    // ── XUẤT EXCEL THEO TUẦN (NGỦ) ───────────────────────────────────
    const exportWeekExcel = async () => {
        if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
        const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
        const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT5);
        const numDays = weekDays.length;
        const NC = 7 + numDays + 1;
        const mon = weekDays[0], fri = weekDays[weekDays.length - 1];
        const weekLabel = `Tuần ${exportSelectedWeek + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)} – ${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}/${exportYear}`;
        const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

        // Fetch dữ liệu điểm danh thực tế
        let ddMap = {};
        try {
            const rRes = await api.get(`/api/diemdanh/range/?tu=${toISO(mon)}&den=${toISO(fri)}`);
            if (rRes.data?.ok) ddMap = rRes.data.map;
        } catch { /* bỏ qua */ }

        const getSym = (hsId, day) => {
            const val = ddMap[hsId]?.[toISO(day)]?.ngu;
            if (val === 0) return '✓';
            if (val === 1) return '✗';
            if (val === 2) return 'P';
            return '';
        };

        const wb = XLSX.utils.book_new();
        exportRooms.forEach(ma_phong => {
            const roomStudents = getStudentsForRoom(ma_phong).sort((a, b) => a.id - b.id);
            const h1 = ['STT', 'Mã\nsố BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'P.\nNGỦ', 'P.\nĂN'];
            const h2 = ['', '', '', '', '', '', ''];
            weekDays.forEach(d => { h1.push(`${d.getDate()}/${d.getMonth() + 1}`); h2.push(`T${d.getDay() === 0 ? 'CN' : d.getDay() + 1}`); });
            h1.push('Ghi\nchú'); h2.push('');
            const aoa = [
                ['Phân hiệu THPT Lê Thị Hồng Gấm', '', '', 'ĐIỂM DANH NGHỈ TRƯA', ...Array(NC - 4).fill('')],
                ['', '', '', '3 KHỐI', ...Array(NC - 4).fill('')],
                ['', '', '', `NH: ${namHocCauHinh}`, ...Array(NC - 4).fill('')],
                [weekLabel, '', '', LUU_Y_NGU, ...Array(NC - 4).fill('')],
                Array(NC).fill(''), h1, h2,
            ];
            roomStudents.forEach((s, i) => {
                const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                const dayCells = weekDays.map(d => getSym(s.id, d));
                aoa.push([i + 1, s.id, s.ho_ten, gt, s.lop, s.phong_ngu || ma_phong, s.phong_an || '', ...dayCells, '']);
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 5 }, { wch: 9 }, { wch: 28 }, { wch: 5 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, ...Array(numDays).fill({ wch: 5 }), { wch: 12 }];
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }, { s: { r: 0, c: 3 }, e: { r: 0, c: NC - 1 } },
                { s: { r: 1, c: 3 }, e: { r: 1, c: NC - 1 } }, { s: { r: 2, c: 3 }, e: { r: 2, c: NC - 1 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }, { s: { r: 3, c: 3 }, e: { r: 3, c: NC - 1 } },
            ];
            XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0, 31));
        });
        XLSX.writeFile(wb, `DiemDanhNgu_Tuan${exportSelectedWeek + 1}_Thang${exportMonth}_${exportYear}.xlsx`);
        setShowMonthExportModal(false);
    };


    // ── XUẤT PDF THEO TUẦN (NGỦ) ─────────────────────────────────────
    const exportWeekPDF = async () => {
        if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
        const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
        const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT5);
        const numDays = weekDays.length;
        const mon = weekDays[0], fri = weekDays[weekDays.length - 1];
        const weekLabel = `Tuần ${exportSelectedWeek + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)}–${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
        const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

        // Fetch dữ liệu điểm danh thực tế
        let ddMap = {};
        try {
            const rRes = await api.get(`/api/diemdanh/range/?tu=${toISO(mon)}&den=${toISO(fri)}`);
            if (rRes.data?.ok) ddMap = rRes.data.map;
        } catch { /* bỏ qua */ }



        const DOWS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayTH = weekDays.map((d, di) =>
            `<th class="col-day"${di === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>${d.getDate()}/${p2(d.getMonth() + 1)}<br><small>${DOWS[d.getDay()]}</small></th>`
        ).join('');
        // ── Hàm chia danh sách HS theo số GV điểm danh, ưu tiên theo lớp, lệch không quá 10 HS ──
        const splitByTeachers = (students, numTeachers) => {
            if (numTeachers <= 1) return [students];
            // Gom theo lớp
            const byClass = {};
            students.forEach(s => {
                const k = s.lop || '';
                if (!byClass[k]) byClass[k] = [];
                byClass[k].push(s);
            });
            const classes = Object.keys(byClass).sort();
            // Phân bổ lớp vào các nhóm (bin-packing greedy)
            const groups = Array.from({ length: numTeachers }, () => []);
            const sizes = Array(numTeachers).fill(0);
            classes.forEach(cls => {
                // Cho vào nhóm ít HS nhất
                const minIdx = sizes.indexOf(Math.min(...sizes));
                byClass[cls].forEach(s => groups[minIdx].push(s));
                sizes[minIdx] += byClass[cls].length;
            });
            // Cân bằng: nếu 2 nhóm lệch > 10 thì chuyển HS lẻ (không phá vỡ lớp nếu còn thừa)
            const MAX_DIFF = 10;
            let changed = true;
            while (changed) {
                changed = false;
                for (let i = 0; i < groups.length; i++) {
                    for (let j = 0; j < groups.length; j++) {
                        if (i === j) continue;
                        const diff = groups[i].length - groups[j].length;
                        if (diff > MAX_DIFF) {
                            // Tìm lớp trong nhóm i có thể di chuyển nguyên lớp sang j
                            const clsInI = [...new Set(groups[i].map(s => s.lop || ''))].sort((a, b) => {
                                const sa = groups[i].filter(s => (s.lop || '') === a).length;
                                const sb = groups[i].filter(s => (s.lop || '') === b).length;
                                return sa - sb; // Ưu tiên lớp nhỏ nhất
                            });
                            let moved = false;
                            for (const cls of clsInI) {
                                const clsStudents = groups[i].filter(s => (s.lop || '') === cls);
                                const newDiff = (groups[i].length - clsStudents.length) - (groups[j].length + clsStudents.length);
                                if (Math.abs(newDiff) < Math.abs(diff)) {
                                    clsStudents.forEach(s => groups[j].push(s));
                                    groups[i] = groups[i].filter(s => (s.lop || '') !== cls);
                                    sizes[i] -= clsStudents.length;
                                    sizes[j] += clsStudents.length;
                                    changed = true;
                                    moved = true;
                                    break;
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
            const roomStudents = getStudentsForRoom(ma_phong);
            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;

            // Phòng "đã điểm danh" khi TẤT CẢ học sinh trong phòng đó có record (khớp với UI)
            const markedDays = new Set(
                weekDays.map(d => toISO(d)).filter(dateStr =>
                    roomStudents.length > 0 && roomStudents.every(s => ddMap[s.id]?.[dateStr]?.ngu != null)
                )
            );

            // Hàm lấy ký hiệu: nếu phòng chưa điểm danh ngày đó → trống toàn bộ
            const getSymForRoom = (hsId, day) => {
                const dateStr = toISO(day);
                if (!markedDays.has(dateStr)) return ''; // phòng chưa điểm danh ngày này → trắng
                const val = ddMap[hsId]?.[dateStr]?.ngu;
                if (val === 0) return '<span class="mk-c">✓</span>';
                if (val === 1) return '<span class="mk-v">✗</span>';
                if (val === 2) return '<span class="mk-p">P</span>';
                return '';
            };

            // Chia danh sách theo số GV điểm danh
            const chunks = splitByTeachers(roomStudents, numTeachers);
            const totalPages = chunks.length;

            // Tính offset STT toàn phòng
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
                    const dayCells = weekDays.map((d, di) =>
                        `<td class="col-day"${di === 0 ? ' style="border-left:1.5px solid #555;"' : ''}>${getSymForRoom(s.id, d)}</td>`).join('');
                    return `<tr>
          <td class="col-stt">${globalOffset + i + 1}</td><td class="col-msbt">${s.id}</td>
          <td style="text-align:left;padding-left:6px;">${s.ho_ten}</td>
          <td class="col-gt">${gt}</td><td class="col-lop">${s.lop}</td>
          <td class="col-phong">${s.phong_ngu || ma_phong}</td>
          <td class="col-phong">${s.phong_an || ''}</td>
          ${dayCells}<td class="col-ghichu"></td>
        </tr>`;
                }).join('');
                return `<div class="room-block">
<table class="hdr-inner"><tr>
  <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
  <td class="hdr-title"><h1>ĐIỂM DANH NGHỈ TRƯA</h1></td>
</tr><tr><td class="hdr-title">
  <h2>3 KHỐI – NH: ${namHocCauHinh}${pageLabel}</h2>
  <div class="nh">11g45–13g00 | ${weekLabel} | Phòng ngủ: ${ma_phong}</div>
</td></tr></table>
<div class="ly-row-div"><span style="color:#e11d48">Mở cửa: 11g35–11g45</span>&nbsp;&nbsp;<strong style="color:#e11d48">Nghỉ trưa: 11g45–13g00</strong></div>
<div class="ly-row-div">${LUU_Y_NGU}</div>
<table class="dt"><thead>
  <tr>
    <th rowspan="2" class="col-stt">ST<br>T</th>
    <th rowspan="2" class="col-msbt" style="color:#c00;">Mã<br>số<br>BT</th>
    <th rowspan="2" style="width:24%;">HỌ VÀ TÊN</th>
    <th rowspan="2" class="col-gt">GT</th>
    <th rowspan="2" class="col-lop">LớP</th>
    <th rowspan="2" class="col-phong">P.<br>NGỦ</th>
    <th rowspan="2" class="col-phong">P.<br>ĂN</th>
    <th colspan="${numDays}" style="white-space:nowrap;">${weekLabel}</th>
    <th rowspan="2" class="col-ghichu">Ghi<br>chú</th>
  </tr>
  <tr>${dayTH}</tr>
</thead><tbody>${dataRows}</tbody></table>
<div class="ft-wrap">
  <div class="ft-left">
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong>${totalPages > 1 ? ` &nbsp;|&nbsp; Tờ này: <strong>${chunk.length} HS</strong>` : ''}</div>
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
            });
        }).join('');
        const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; }
.mk-c { color:#16a34a; font-weight:bold; }
.mk-v { color:#dc2626; font-weight:bold; }
.mk-p { color:#d97706; font-weight:bold; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.ly-row-div { padding:2px 4px; font-size:9pt; line-height:1.2; margin-bottom:2px; }
.dt { width:100%; border-collapse:collapse; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner td { border:none; padding:2px 4px; vertical-align:middle; }
.hdr-school { width:28%; text-align:center; font-size:10pt; line-height:1.3; }
.hdr-title { text-align:center; }
.hdr-title h1 { font-size:14pt; font-weight:bold; text-transform:uppercase; }
.hdr-title h2 { font-size:11pt; font-weight:bold; }
.hdr-title .nh { font-size:10pt; }
.dt th { border:0.8px solid #333; padding:3px 1px; text-align:center; background:#ececec; font-weight:bold; font-size:9pt; }
.dt td { border:0.8px solid #555; padding:4px 1px; vertical-align:middle; font-size:11pt; }
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
<script>window.onload=function(){setTimeout(window.print,400);}</script>
</body></html>`;
        const w = window.open('', '_blank');
        if (!w) { showAlert('Trình duyệt chặn popup!', 'warning'); return; }
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
                    <h2><i className="fas fa-bed" style={{ color: '#6c5ce7', marginRight: 8 }}></i>Điểm danh Ngủ</h2>
                    <p>Ghi nhận sĩ số học sinh ngủ theo phòng &amp; ngày. Danh sách HS do Admin phân bổ.</p>
                    {cauhinhNgay && (() => {
                        const lopArr = cauhinhNgay.lop_ap_dung;
                        const ptNgu = cauhinhNgay.phong_tam_ngu;
                        const hasInfo = (lopArr && lopArr.length > 0) || ptNgu;
                        return hasInfo ? (
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {lopArr && lopArr.length > 0 && (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'flex-start', gap: 6,
                                        background: '#f3f0ff', border: '1.5px solid #a29bfe', borderRadius: 8,
                                        padding: '5px 12px', fontSize: '0.82rem', color: '#5b21b6', fontWeight: 600,
                                        maxWidth: '100%', flexWrap: 'wrap'
                                    }}>
                                        <i className="fas fa-filter" style={{ marginTop: 2, color: '#6c5ce7' }}></i>
                                        <span>
                                            <span style={{ opacity: 0.75, fontWeight: 500 }}>Ngày đặc biệt – chỉ </span>
                                            <strong>{lopArr.length} lớp</strong>
                                            <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.78rem', color: '#7c3aed' }}>
                                                ({formatLopList(lopArr)})
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {ptNgu && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                        background: '#e0f2fe', border: '1.5px solid #7dd3fc', borderRadius: 8,
                                        padding: '5px 12px', fontSize: '0.82rem', color: '#0369a1', fontWeight: 600 }}>
                                        <i className="fas fa-compress-arrows-alt"></i>
                                        Gộp phòng ngủ: <strong>{ptNgu}</strong>
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
                                <i className="fas fa-file-pdf" style={{ color: '#6c5ce7', width: 20, textAlign: 'center' }}></i> In DS (Tuần)
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
                    <div className="dd-room-panel-header" style={{ background: panelGrad }}>
                        <i className="fas fa-bed"></i> Phòng ngủ
                    </div>
                    <div className="dd-date-picker">
                        <label><i className="fas fa-calendar-day" style={{ color: '#6c5ce7', marginRight: 4 }}></i> Chọn ngày điểm danh</label>
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
                                    const count = getStudentsForRoom(p.ma_phong).length;
                                    const isMarked = roomStats.markedRooms.has(p.ma_phong);
                                    return (
                                        <li key={p.ma_phong}
                                            className={`dd-room-item${cauhinhNgay ? ' is-special' : ''}${selectedPhong?.ma_phong === p.ma_phong ? ' active' : ''}`}
                                            style={(selectedPhong?.ma_phong === p.ma_phong && !cauhinhNgay) ? { background: 'linear-gradient(135deg,rgba(108,92,231,.1),rgba(162,155,254,.08))', borderColor: 'rgba(108,92,231,.25)', color: '#6c5ce7' } : {}}
                                            onClick={() => { setSelectedPhongCode(p.ma_phong); setOverrides({}); setSaved(false); }}>
                                            <div className={`dd-room-status-icon ${isMarked ? 'marked' : 'unmarked'}`} title={isMarked ? 'Đã điểm danh' : 'Chưa điểm danh'}>
                                                <i className={isMarked ? 'fas fa-check' : 'fas fa-exclamation'}></i>
                                            </div>
                                            <div className="dd-room-item-name">
                                                <i className="fas fa-bed" style={{ color: '#6c5ce7' }}></i>{p.ma_phong}
                                                {phongTamNgu && p.ma_phong === phongTamNgu && (
                                                    <span style={{ marginLeft: 4, fontSize: '0.65rem', background: '#6c5ce7', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>TẠM</span>
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
                            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2.5rem', color: '#6c5ce7', marginBottom: 16 }}></i>
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
                                    <div className="dd-empty">
                                        <i className="fas fa-hand-pointer"></i>
                                        <h3>Chọn một phòng ngủ</h3>
                                        <p>Danh sách học sinh sẽ hiển thị tại đây</p>
                                    </div>
                                ) : loading ? (
                                    <div className="dd-empty" style={{ color: '#6c5ce7' }}>
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
                                                style={{ background: STATUS[s.trang_thai].bg, borderColor: STATUS[s.trang_thai].border }}>
                                                <div className="dd-student-info">
                                                    <span className="dd-student-name">{s.ho_ten}</span>
                                                    <span className="dd-student-class">{s.lop}</span>
                                                </div>
                                                <div className="dd-status-btns">
                                                    {Object.entries(STATUS).map(([key, val]) => (
                                                        <button key={key}
                                                            className={`dd-status-btn${s.trang_thai === key ? ' active' : ''}`}
                                                            style={s.trang_thai === key ? { background: val.dot, color: '#fff', border: `1.5px solid ${val.dot}`, boxShadow: `0 2px 8px ${val.dot}66` } : {}}
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
            {AlertUI}

            {showMonthExportModal && (
                <div className="export-modal-overlay">
                    <div className="export-modal">
                        <div className="export-modal-header">
                            <div className="icon" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}><i className="fas fa-bed"></i></div>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <select className="export-modal-select" value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}>
                                            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                                        </select>
                                        <span style={{ color: '#64748b', fontWeight: 600 }}>/</span>
                                        <select className="export-modal-select" value={exportYear} onChange={e => setExportYear(Number(e.target.value))}>
                                            {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option>; })}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* CHỌN TUẦN */}
                            <div className="export-modal-group">
                                <div className="export-modal-section-title">
                                    <i className="fas fa-calendar-week" style={{ color: '#6c5ce7' }}></i> CHỌN TUẦN XUẤT
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                                    {weekLabelsForModal.map((lbl, wIndex) => {
                                        const sel = exportSelectedWeek === wIndex;
                                        return (
                                            <label key={wIndex} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                borderRadius: 7, cursor: 'pointer', userSelect: 'none',
                                                background: sel ? '#f0eeff' : '#f8fafc',
                                                border: `1.5px solid ${sel ? '#6c5ce7' : '#e2e8f0'}`,
                                                fontWeight: sel ? 600 : 400, color: sel ? '#6c5ce7' : '#64748b',
                                            }}>
                                                <input type="radio" name="exportWeek" checked={sel}
                                                    style={{ accentColor: '#6c5ce7' }}
                                                    onChange={() => { setExportSelectedWeek(wIndex); setExportT5(false); }} />
                                                <span style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{lbl.split(':')[0]}</span>
                                                    <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 4, color: sel ? '#6c5ce7' : '#94a3b8' }}>{lbl.split(': ')[1]}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* DẠY BÙ T5 */}
                            <div className="export-modal-group">
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none',
                                    padding: '8px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#f8fafc'
                                }}>
                                    <input type="checkbox" checked={exportT5} style={{ accentColor: '#10b981' }}
                                        onChange={e => setExportT5(e.target.checked)} />
                                    <span style={{ fontWeight: 600, color: '#10b981' }}>
                                        <i className="fas fa-calendar-plus"></i> Tuần này có dạy bù Thứ Năm (T5)
                                    </span>
                                </label>
                            </div>

                            {/* Ghi chú chia tờ theo GV điểm danh */}
                            <div style={{ padding: '6px 10px', borderRadius: 7, background: '#f0eeff', border: '1px solid #ddd6fe', fontSize: '0.83rem', color: '#5b21b6' }}>
                                <i className="fas fa-info-circle"></i> PDF sẽ chia tờ theo <strong>số GV điểm danh</strong> của từng phòng, ưu tiên giữ nguyên lớp và không lệch quá 10 HS.
                            </div>

                            {/* CHỌN PHÒNG NGỦ */}
                            <div className="export-modal-group">
                                <div className="export-room-header">
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>CHỌN PHÒNG NGỦ</div>
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
                                            style={exportRooms.includes(p.ma_phong) ? { background: '#6c5ce7', borderColor: '#6c5ce7', color: '#fff' } : {}}
                                            onClick={() => setExportRooms(prev => prev.includes(p.ma_phong) ? prev.filter(r => r !== p.ma_phong) : [...prev, p.ma_phong])}>
                                            {p.ma_phong}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowMonthExportModal(false)}>Hủy</button>
                            <button className="btn btn-success" onClick={exportWeekExcel} style={{ background: '#10b981', borderColor: '#10b981' }}><i className="fas fa-file-excel"></i> Xuất Excel</button>
                            <button className="btn btn-primary" onClick={exportWeekPDF} style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}><i className="fas fa-file-pdf"></i> Xuất PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
