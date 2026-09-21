import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Chart, ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler } from 'chart.js';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { formatLopList, getSortNames, sortStudentsForRoom, splitStudentsByTeachers } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './BaoCao.css';

Chart.register(ArcElement, BarElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);

// ── Helpers ──────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const DOWS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DOW_NAMES_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const formatDateDMY = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
};

const getDefaultSuatAnRange = (month, year) => {
    const pM = String(month).padStart(2, '0');
    const firstDate = new Date(year, month - 1, 1);
    const dow = firstDate.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7

    // Chu kỳ suất ăn theo tuần trường học: nếu ngày 1 rơi vào T3-T5, lùi về Thứ Hai của tuần đó (cuối tháng trước, vd: 30/9 cho tháng 10)
    let startDate = new Date(year, month - 1, 1);
    if (dow >= 2 && dow <= 5) {
        startDate.setDate(startDate.getDate() - (dow - 1));
    } else if (dow === 0) {
        startDate.setDate(startDate.getDate() + 1);
    } else if (dow === 6) {
        startDate.setDate(startDate.getDate() + 2);
    }

    const startY = startDate.getFullYear();
    const startM = String(startDate.getMonth() + 1).padStart(2, '0');
    const startD = String(startDate.getDate()).padStart(2, '0');
    const startStr = `${startY}-${startM}-${startD}`;

    const lastDayNum = new Date(year, month, 0).getDate();
    const endStr = `${year}-${pM}-${String(lastDayNum).padStart(2, '0')}`;

    return { startStr, endStr };
};

// ── Cấu hình các Đợt thanh toán bán trú (Chu kỳ 4 tuần = 1 lần thanh toán, năm học đến tháng 6/2027) ──
const DOT_THANH_TOAN_CONFIG = [
    { dot: 1, label: 'Đợt 1 (Tuần 1 - 4): 07/09/2026 → 02/10/2026', start: '2026-09-07', end: '2026-10-02', weeks: 'Tuần 1 - 4' },
    { dot: 2, label: 'Đợt 2 (Tuần 5 - 8): 05/10/2026 → 30/10/2026', start: '2026-10-05', end: '2026-10-30', weeks: 'Tuần 5 - 8' },
    { dot: 3, label: 'Đợt 3 (Tuần 9 - 12): 02/11/2026 → 27/11/2026', start: '2026-11-02', end: '2026-11-27', weeks: 'Tuần 9 - 12' },
    { dot: 4, label: 'Đợt 4 (Tuần 13 - 16): 30/11/2026 → 25/12/2026', start: '2026-11-30', end: '2026-12-25', weeks: 'Tuần 13 - 16' },
    { dot: 5, label: 'Đợt 5 (Tuần 17 - 20): 28/12/2026 → 22/01/2027', start: '2026-12-28', end: '2027-01-22', weeks: 'Tuần 17 - 20' },
    { dot: 6, label: 'Đợt 6 (Tuần 21 - 24): 25/01/2027 → 19/02/2027', start: '2027-01-25', end: '2027-02-19', weeks: 'Tuần 21 - 24' },
    { dot: 7, label: 'Đợt 7 (Tuần 25 - 28): 22/02/2027 → 19/03/2027', start: '2027-02-22', end: '2027-03-19', weeks: 'Tuần 25 - 28' },
    { dot: 8, label: 'Đợt 8 (Tuần 29 - 32): 22/03/2027 → 16/04/2027', start: '2027-03-22', end: '2027-04-16', weeks: 'Tuần 29 - 32' },
    { dot: 9, label: 'Đợt 9 (Tuần 33 - 36): 19/04/2027 → 14/05/2027', start: '2027-04-19', end: '2027-05-14', weeks: 'Tuần 33 - 36' },
    { dot: 10, label: 'Đợt 10 (Tuần 37 - 40): 17/05/2027 → 11/06/2027', start: '2027-05-17', end: '2027-06-11', weeks: 'Tuần 37 - 40' },
    { dot: 11, label: 'Đợt 11 (Tuần 41 - 43): 14/06/2027 → 30/06/2027', start: '2027-06-14', end: '2027-06-30', weeks: 'Tuần 41 - 43' },
];

export default function BaoCao() {
    const { user } = useAuth();
    const canExportHS = user?.is_admin || user?.is_superuser || user?.is_ke_toan || user?.is_hoc_vu;
    const canExportGV = user?.is_admin || user?.is_superuser || user?.is_ke_toan;
    const [activeTab, setActiveTab] = useState('panel-hs');
    const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // Tab Học Sinh
    const [monthHS, setMonthHS] = useState(today.slice(0, 7));
    const [lopFilter, setLopFilter] = useState('');
    const [hsData, setHsData] = useState([]);
    const [loadingHS, setLoadingHS] = useState(true);
    const [hsPage, setHsPage] = useState(0);
    const HS_PER_PAGE = 50;

    // Tab Giáo viên
    const [tuNgayGV, setTuNgayGV] = useState(today.slice(0, 8) + '01');
    const [denNgayGV, setDenNgayGV] = useState(today);
    const [gvData, setGvData] = useState([]);
    const [giaAn, setGiaAn] = useState(0);
    const [giaNgu, setGiaNgu] = useState(0);
    const [quanLyName, setQuanLyName] = useState('');
    const [keToanName, setKeToanName] = useState('');
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

    // Xuất / In danh sách HS vắng, phép theo ngày
    const [showHsVangModal, setShowHsVangModal] = useState(false);
    const [hsVangDate, setHsVangDate] = useState(today);
    const [hsVangLoai, setHsVangLoai] = useState('all'); // 'all' | 'an' | 'ngu'
    const [hsVangLop, setHsVangLop] = useState('');
    const [hsVangPhong, setHsVangPhong] = useState('');
    const [hsVangStatus, setHsVangStatus] = useState('all'); // 'all' | 'vang' | 'phep'
    const [hsVangData, setHsVangData] = useState(null);
    const [loadingHsVang, setLoadingHsVang] = useState(false);

    // Báo cáo tổng hợp theo lớp
    const [showTongHopLopModal, setShowTongHopLopModal] = useState(false);
    const [thLopCheDo, setThLopCheDo] = useState('dot'); // 'dot' (Chu kỳ 4 tuần) | 'thang' (Theo tháng)
    const [thLopDotSelected, setThLopDotSelected] = useState('1'); // Mặc định Đợt 1
    const [thLopMonth, setThLopMonth] = useState(today.slice(0, 7));
    const [thLopTuNgay, setThLopTuNgay] = useState('2026-09-07');
    const [thLopDenNgay, setThLopDenNgay] = useState('2026-10-02');
    const [thLopData, setThLopData] = useState(null);
    const [loadingThLop, setLoadingThLop] = useState(false);
    const [thLopSelected, setThLopSelected] = useState('');
    const [thLopDonGiaAn, setThLopDonGiaAn] = useState(35000);

    // Báo cáo Suất ăn hàng tháng cho bên cung cấp
    const [showSuatAnModal, setShowSuatAnModal] = useState(false);
    const [suatAnMonth, setSuatAnMonth] = useState(new Date().getMonth() + 1);
    const [suatAnYear, setSuatAnYear] = useState(new Date().getFullYear());
    const [suatAnTuNgay, setSuatAnTuNgay] = useState('');
    const [suatAnDenNgay, setSuatAnDenNgay] = useState('');
    const [suatAnLoading, setSuatAnLoading] = useState(false);
    const [suatAnData, setSuatAnData] = useState(null);
    const [suatAnRows, setSuatAnRows] = useState([]);
    const [suatAnNguoiLap, setSuatAnNguoiLap] = useState('Mai Quỳnh Châu');
    const [suatAnDaiDienCT, setSuatAnDaiDienCT] = useState('Lê Thị Ngọc Bích');
    const [suatAnGiamDoc, setSuatAnGiamDoc] = useState('Vũ Quốc Phong');
    const [suatAnDiaDanh, setSuatAnDiaDanh] = useState('Thành phố Hồ Chí Minh');
    const [suatAnNgayKy, setSuatAnNgayKy] = useState('');
    const [suatAnSoGD, setSuatAnSoGD] = useState('SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH');
    const [suatAnTenTruong, setSuatAnTenTruong] = useState('TRƯỜNG THPT LÊ THỊ HỒNG GẤM');
    const [suatAnBoPhan, setSuatAnBoPhan] = useState('BỘ PHẬN BÁN TRÚ');

    // Lấy dữ liệu Báo cáo HS
    useEffect(() => {
        const [y, m] = monthHS.split('-');
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

    // Handlers ràng buộc khoảng ngày
    const handleTuNgayGVChange = (val) => {
        setTuNgayGV(val);
        if (val && denNgayGV && val > denNgayGV) {
            setDenNgayGV(val);
        }
    };

    const handleDenNgayGVChange = (val) => {
        setDenNgayGV(val);
        if (val && tuNgayGV && val < tuNgayGV) {
            setTuNgayGV(val);
        }
    };

    // Lấy dữ liệu Báo cáo GV
    useEffect(() => {
        if (!tuNgayGV || !denNgayGV || tuNgayGV > denNgayGV) return;
        setLoadingGV(true);
        const ctrl = new AbortController();
        api.get(`/api/baocao/luong-gv/?tu_ngay=${tuNgayGV}&den_ngay=${denNgayGV}`, { signal: ctrl.signal })
            .then(res => {
                if (res.data?.ok) {
                    const sortedGv = (res.data.data || []).sort((a, b) => {
                        const nameA = getSortNames(a.ho_ten);
                        const nameB = getSortNames(b.ho_ten);
                        let cmp = nameA.first.localeCompare(nameB.first, 'vi');
                        if (cmp !== 0) return cmp;
                        cmp = nameA.last.localeCompare(nameB.last, 'vi');
                        if (cmp !== 0) return cmp;
                        return nameA.middle.localeCompare(nameB.middle, 'vi');
                    });
                    setGvData(sortedGv);
                    setGiaAn(res.data.don_gia_an || 0);
                    setGiaNgu(res.data.don_gia_ngu || 0);
                    setQuanLyName(res.data.quan_ly_name || '');
                    setKeToanName(res.data.ke_toan_name || '');
                }
            })
            .catch(err => { if (err?.name !== 'CanceledError') console.error(err); })
            .finally(() => setLoadingGV(false));
        return () => ctrl.abort();
    }, [tuNgayGV, denNgayGV]);

    // ── Tính toán số liệu Học Sinh ──
    const totalHS = hsData.length;
    // (Ví dụ) Nếu so_ngay_co_mat_an == 0 và so_ngay_vang_an == 0 => có thể chưa ăn
    // Giả sử vang = HS có ít nhất 1 buổi vắng, phep = ít nhất 1 buổi phép
    const comAn = hsData.filter(h => h.so_ngay_co_mat_an > 0 || h.so_ngay_co_mat_ngu > 0).length;
    const vang = hsData.filter(h => h.so_ngay_vang_an > 0 || h.so_ngay_vang_ngu > 0).length;
    const phep = hsData.filter(h => h.so_ngay_phep_an > 0 || h.so_ngay_phep_ngu > 0).length;


    // Khối stats (đơn giản hóa)
    const khoiStats = useMemo(() => {
        const map = {};
        hsData.forEach(h => {
            const k = String(h.lop).substring(0, 2);
            if (!map[k]) map[k] = { k, t: 0, va: 0, vn: 0, p: 0 };
            map[k].t++;
            map[k].va += h.so_ngay_vang_an;
            map[k].vn += h.so_ngay_vang_ngu;
            map[k].p += (h.so_ngay_phep_an + h.so_ngay_phep_ngu);
        });
        return Object.values(map).sort((a, b) => a.k.localeCompare(b.k));
    }, [hsData]);

    // Lớp list (cho filter)
    const lopList = useMemo(() => [...new Set(hsData.map(h => h.lop))].sort(), [hsData]);

    // ── Tính toán số liệu Giáo Viên ──
    const totCaAn = gvData.reduce((a, g) => a + g.so_ca_an, 0);
    const totCaNgu = gvData.reduce((a, g) => a + g.so_ca_ngu, 0);
    const totTien = gvData.reduce((a, g) => a + g.tong_tien, 0);

    // ── Tính các tuần trong tháng (cho chọn tuần xuất) ──
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
    const weekLabelsAn = useMemo(() => {
        return computeWeekMondayStrs(exportAnMonth, exportAnYear).map((monStr, i) => {
            const mon = new Date(monStr + 'T00:00:00');
            const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
            return `Tuần ${i + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)} – ${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
        });

    }, [exportAnMonth, exportAnYear]);
    // Reset chọn tuần khi tháng/năm thay đổi
    useEffect(() => {
        setExportAnWeeksActive(weekLabelsAn.map((_, i) => i));
    }, [weekLabelsAn]);

    const weekLabelsNgu = useMemo(() => {
        return computeWeekMondayStrs(exportNguMonth, exportNguYear).map((monStr, i) => {
            const mon = new Date(monStr + 'T00:00:00');
            const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
            return `Tuần ${i + 1}: ${p2(mon.getDate())}/${p2(mon.getMonth() + 1)} – ${p2(fri.getDate())}/${p2(fri.getMonth() + 1)}`;
        });

    }, [exportNguMonth, exportNguYear]);
    // Reset chọn tuần khi tháng/năm thay đổi
    useEffect(() => {
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
        setExportAnWeeksActive(computeWeekMondayStrs(new Date().getMonth() + 1, new Date().getFullYear()).map((_, i) => i));
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
        setExportNguWeeksActive(computeWeekMondayStrs(new Date().getMonth() + 1, new Date().getFullYear()).map((_, i) => i));
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
                const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
                const wIdx = allWeekMons.indexOf(monStr);
                return wIdx >= 0 && exportAnWeeksActive.includes(wIdx);
            });
            if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú nào trong các tuần đã chọn!');
            const numDays = ngay_ban_tru.length;
            const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
            const luuY = 'Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.';

            const weekGroups = [];
            let curWeek = null;
            ngay_ban_tru.forEach((ngay, di) => {
                const d = new Date(ngay + 'T00:00:00');
                const mon = new Date(d); const dow = mon.getDay() || 7; mon.setDate(mon.getDate() - dow + 1);
                const monStr = mon.toISOString().split('T')[0];
                if (!curWeek || curWeek.monStr !== monStr) { curWeek = { monStr, days: [] }; weekGroups.push(curWeek); }
                curWeek.days.push({ ngay, d, di });
            });

            const weekTH1 = weekGroups.map((wg, wi) => {
                const fd = wg.days[0].d; const ld = wg.days[wg.days.length - 1].d;
                return `<th colspan="${wg.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">Tuần ${wi + 1}: ${p2(fd.getDate())}/${p2(fd.getMonth() + 1)}–${p2(ld.getDate())}/${p2(ld.getMonth() + 1)}</th>`;
            }).join('');
            const weekTH2 = weekGroups.map(wg => wg.days.map(({ d }, di2) =>
                `<th class="col-day-an"${di2 === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>\n${d.getDate()}/${p2(d.getMonth() + 1)}<br><small>${DOWS[d.getDay()]}</small></th>`
            ).join('')).join('');

            const htmlPages = exportAnRooms.map(ma_phong => {
                const roomStudents = sortStudentsForRoom([...(dataByPhong[ma_phong] || [])], ma_phong);
                const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
                const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
                const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
                const dataRows = roomStudents.map((s, i) => {
                    const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                    const dayCells = weekGroups.map(wg => wg.days.map(({ ngay }, di2) => {
                        const isOutOfRange = (s.ngay_vao && ngay < s.ngay_vao) || (s.ngay_rut && ngay > s.ngay_rut);
                        if (isOutOfRange) {
                            return `<td class="col-day-an cell-inactive"${di2 === 0 ? ' style="border-left:1.5px solid #555;"' : ''}><span class="mk-slash">/</span></td>`;
                        }
                        const val = s.diemdanh[ngay];
                        // Chỉ hiển thị ký hiệu khi có bản ghi rõ ràng; null = chưa điểm danh → bỏ trống
                        const sym = val === 0 ? '<span class="mk-c">✓</span>' : val === 1 ? '<span class="mk-v">✗</span>' : val === 2 ? '<span class="mk-p">P</span>' : '';
                        return `<td class="col-day-an"${di2 === 0 ? ' style="border-left:1.5px solid #555;"' : ''}>${sym}</td>`;
                    }).join('')).join('');

                    const activeDays = ngay_ban_tru.filter(ng => (!s.ngay_vao || ng >= s.ngay_vao) && (!s.ngay_rut || ng <= s.ngay_rut));
                    const filteredVang = activeDays.filter(ng => s.diemdanh[ng] === 1).length;
                    const filteredPhep = activeDays.filter(ng => s.diemdanh[ng] === 2).length;
                    const filteredCoMat = activeDays.filter(ng => s.diemdanh[ng] === 0).length; // Chỉ đếm khi đã ghi nhận rõ là có mặt

                    const noteParts = [];
                    if (s.ngay_vao && s.ngay_vao >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_vao <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, vm, vd] = s.ngay_vao.split('-');
                        noteParts.push(`Vào ${vd}/${vm}`);
                    }
                    if (s.ngay_rut && s.ngay_rut >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_rut <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    } else if (s.ngay_rut) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    }
                    const noteStr = noteParts.join(', ');

                    return `<tr>
            <td class="col-stt-an">${i + 1}</td><td class="col-msbt-an">${s.id}</td>
            <td class="col-ten-an">${s.ho_ten}</td><td class="col-gt-an">${gt}</td>
            <td class="col-lop-an">${s.lop}</td><td class="col-phong-an">${ma_phong}</td>
            ${dayCells}
            <td class="col-sum-an">${activeDays.length}</td>
            <td class="col-sum-an">${filteredVang}</td>
            <td class="col-sum-an">${filteredPhep}</td>
            <td class="col-sum-an">${filteredCoMat}</td>
            <td class="col-ghichu-an" style="font-size:7.5pt;text-align:center;">${noteStr}</td></tr>`;
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
<div style="margin-top: 8px; margin-bottom: 10px; font-size: 8.5pt; line-height: 1.4; text-align: left;">
  <div>* Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
  <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong> | Lớp 11: <strong>${total11} hs</strong> | Lớp 12: <strong>${total12} hs</strong></div>
  <div style="margin-top: 2px; color: #333; font-style: italic;">* Ký hiệu: <strong>(✓)</strong> Có mặt &nbsp;|&nbsp; <strong>(✗)</strong> Vắng &nbsp;|&nbsp; <strong>(P)</strong> Có phép &nbsp;|&nbsp; <strong>(/)</strong> Chưa vào / Đã rút bán trú</div>
</div>
<div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px; page-break-inside: avoid;">
  <div style="width: 42%; text-align: center;">
    <div style="height: 16px;"></div>
    <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 42px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9.5pt;">${user?.fullname?.trim() || user?.username || ''}</div>
  </div>
  <div style="width: 45%; text-align: center;">
    <div style="font-style: italic; font-size: 8.5pt; height: 16px; line-height: 16px;">${todayStr}</div>
    <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">GIÁM ĐỐC</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 42px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9.5pt;">${nguoi_phu_trach || 'Vũ Quốc Phong'}</div>
  </div>
</div>
</div>`;
            }).join('');
            if (htmlPages.trim() === '') return alert('Không có dữ liệu để xuất!');
            const css = `* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.mk-c { color:#16a34a; font-weight:bold; } .mk-v { color:#dc2626; font-weight:bold; } .mk-p { color:#d97706; font-weight:bold; }
.cell-inactive { background-color:#f1f5f9!important; background:#f1f5f9 linear-gradient(to top right, transparent calc(50% - 0.75px), #94a3b8 calc(50% - 0.75px), #94a3b8 calc(50% + 0.75px), transparent calc(50% + 0.75px))!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; text-align:center; }
.mk-slash { font-size:8.5pt; font-weight:bold; color:#64748b; }
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
.col-ghichu-an{width:12mm}
.ft-wrap-an{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid}
.ft-left-an{flex:1} .ft-right-an{flex:1;text-align:center} .sig-space-an{height:38px}
@page{size:A4 landscape;margin:0.8cm 0.8cm 1.2cm 1cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt-an th{background:#ececec!important}.col-sum-an{background:#f0fff0!important}.cell-inactive{background:#f1f5f9 linear-gradient(to top right, transparent calc(50% - 0.75px), #94a3b8 calc(50% - 0.75px), #94a3b8 calc(50% + 0.75px), transparent calc(50% + 0.75px))!important}.mk-slash{color:#64748b!important}}`;
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
                const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
                const wIdx = allWeekMons2.indexOf(monStr);
                return wIdx >= 0 && exportAnWeeksActive.includes(wIdx);
            });
            if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú trong các tuần đã chọn!');
            const numDays = ngay_ban_tru.length;
            const wb = XLSX.utils.book_new();
            exportAnRooms.forEach(ma_phong => {
                const roomStudents = sortStudentsForRoom([...(dataByPhong[ma_phong] || [])], ma_phong);
                const h1 = ['STT', 'STT\nDS BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'Phòng\nĂn'];
                const h2 = ['', '', '', '', '', ''];
                ngay_ban_tru.forEach(ngay => {
                    const d = new Date(ngay + 'T00:00:00');
                    h1.push(`${d.getDate()}/${d.getMonth() + 1}`);
                    h2.push(DOWS[d.getDay()]);
                });
                h1.push('TS\nBuổi ăn', 'SB\nVắng', 'Vắng\ncó P', 'Buổi ăn\nthực tế', 'Ghi chú');
                h2.push('', '', '', '', '');
                const aoa = [
                    [`ĐIỂM DANH ĂN TRƯA – THÁNG ${so_thang}/${so_nam} – PHÒNG ${ma_phong}`, ...Array(5 + numDays + 5).fill('')],
                    Array(6 + numDays + 5).fill(''), h1, h2,
                ];
                roomStudents.forEach((s, i) => {
                    const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                    const activeDays = ngay_ban_tru.filter(ng => (!s.ngay_vao || ng >= s.ngay_vao) && (!s.ngay_rut || ng <= s.ngay_rut));
                    const dayCells = ngay_ban_tru.map(ngay => {
                        const isOutOfRange = (s.ngay_vao && ngay < s.ngay_vao) || (s.ngay_rut && ngay > s.ngay_rut);
                        if (isOutOfRange) return '/';
                        const v = s.diemdanh[ngay]; return v === 0 ? '✓' : v === 1 ? '✗' : v === 2 ? 'P' : '';
                    });
                    const filteredVang2 = activeDays.filter(ng => s.diemdanh[ng] === 1).length;
                    const filteredPhep2 = activeDays.filter(ng => s.diemdanh[ng] === 2).length;
                    const filteredCoMat2 = activeDays.filter(ng => s.diemdanh[ng] === 0).length;

                    const noteParts = [];
                    if (s.ngay_vao && s.ngay_vao >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_vao <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, vm, vd] = s.ngay_vao.split('-');
                        noteParts.push(`Vào ${vd}/${vm}`);
                    }
                    if (s.ngay_rut && s.ngay_rut >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_rut <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    } else if (s.ngay_rut) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    }
                    const noteStr = noteParts.join(', ');

                    aoa.push([i + 1, s.id, s.ho_ten, gt, s.lop, ma_phong, ...dayCells, activeDays.length, filteredVang2, filteredPhep2, filteredCoMat2, noteStr]);
                });
                aoa.push([]);
                aoa.push(['* Ký hiệu: (✓) Có mặt, (✗) Vắng, (P) Có phép, (/) Chưa vào / Đã rút bán trú']);
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                const cols = [{ wch: 5 }, { wch: 8 }, { wch: 28 }, { wch: 5 }, { wch: 8 }, { wch: 7 }];
                for (let i = 0; i < numDays; i++) cols.push({ wch: 5 });
                cols.push({ wch: 7 }, { wch: 7 }, { wch: 9 }, { wch: 12 }, { wch: 14 });
                ws['!cols'] = cols;
                XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0, 31));
            });
            XLSX.writeFile(wb, `BaoCao_DiemDanhAn_Thang${so_thang}_${so_nam}.xlsx`);
            setShowExportAnModal(false);
        } catch (err) { alert('Lỗi: ' + err.message); }
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
                const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
                const wIdx = allWeekMons.indexOf(monStr);
                return wIdx >= 0 && exportNguWeeksActive.includes(wIdx);
            });
            if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú nào trong các tuần đã chọn!');
            const numDays = ngay_ban_tru.length;
            const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
            const luuY = 'Lưu ý: HS di chuyển đến đúng vị trí/phòng ngủ đã phân công; giữ trật tự giờ ngủ và chấp hành điều động của thầy cô.';

            const weekGroups = [];
            let curWeek = null;
            ngay_ban_tru.forEach((ngay, di) => {
                const d = new Date(ngay + 'T00:00:00');
                const mon = new Date(d); const dow = mon.getDay() || 7; mon.setDate(mon.getDate() - dow + 1);
                const monStr = mon.toISOString().split('T')[0];
                if (!curWeek || curWeek.monStr !== monStr) { curWeek = { monStr, days: [] }; weekGroups.push(curWeek); }
                curWeek.days.push({ ngay, d, di });
            });

            const weekTH1 = weekGroups.map((wg, wi) => {
                const fd = wg.days[0].d; const ld = wg.days[wg.days.length - 1].d;
                return `<th colspan="${wg.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">Tuần ${wi + 1}: ${p2(fd.getDate())}/${p2(fd.getMonth() + 1)}–${p2(ld.getDate())}/${p2(ld.getMonth() + 1)}</th>`;
            }).join('');
            const weekTH2 = weekGroups.map(wg => wg.days.map(({ d }, di2) =>
                `<th class="col-day-an"${di2 === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>\n${d.getDate()}/${p2(d.getMonth() + 1)}<br><small>${DOWS[d.getDay()]}</small></th>`
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
                    const dayCells = weekGroups.map(wg => wg.days.map(({ ngay }, di2) => {
                        const isOutOfRange = (s.ngay_vao && ngay < s.ngay_vao) || (s.ngay_rut && ngay > s.ngay_rut);
                        if (isOutOfRange) {
                            return `<td class="col-day-an cell-inactive"${di2 === 0 ? ' style="border-left:1.5px solid #555;"' : ''}><span class="mk-slash">/</span></td>`;
                        }
                        let sym = '';
                        const val = s.diemdanh[ngay];
                        if (val === 2) {
                            sym = '<span class="mk-p">P</span>';
                        } else if (markedDaySet.has(ngay)) {
                            sym = val === 1 ? '<span class="mk-v">✗</span>' : val === 0 ? '<span class="mk-c">✓</span>' : '';
                        }
                        return `<td class="col-day-an"${di2 === 0 ? ' style="border-left:1.5px solid #555;"' : ''}>${sym}</td>`;
                    }).join('')).join('');

                    const activeDays = ngay_ban_tru.filter(ng => (!s.ngay_vao || ng >= s.ngay_vao) && (!s.ngay_rut || ng <= s.ngay_rut));
                    const filteredVang = activeDays.filter(ng => s.diemdanh[ng] === 1).length;
                    const filteredPhep = activeDays.filter(ng => s.diemdanh[ng] === 2).length;
                    const filteredCoMat = activeDays.filter(ng => s.diemdanh[ng] === 0).length;

                    const noteParts = [];
                    if (s.ngay_vao && s.ngay_vao >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_vao <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, vm, vd] = s.ngay_vao.split('-');
                        noteParts.push(`Vào ${vd}/${vm}`);
                    }
                    if (s.ngay_rut && s.ngay_rut >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_rut <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    } else if (s.ngay_rut) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    }
                    const noteStr = noteParts.join(', ');

                    return `<tr>
            <td class="col-stt-an">${i + 1}</td><td class="col-msbt-an">${s.id}</td>
            <td class="col-ten-an">${s.ho_ten}</td><td class="col-gt-an">${gt}</td>
            <td class="col-lop-an">${s.lop}</td><td class="col-phong-an">${ma_phong}</td>
            ${dayCells}
            <td class="col-sum-an">${activeDays.length}</td>
            <td class="col-sum-an">${filteredVang}</td>
            <td class="col-sum-an">${filteredPhep}</td>
            <td class="col-sum-an">${filteredCoMat}</td>
            <td class="col-ghichu-an" style="font-size:7.5pt;text-align:center;">${noteStr}</td></tr>`;
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
<div style="margin-top: 8px; margin-bottom: 10px; font-size: 8.5pt; line-height: 1.4; text-align: left;">
  <div>* Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
  <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong> | Lớp 11: <strong>${total11} hs</strong> | Lớp 12: <strong>${total12} hs</strong></div>
  <div style="margin-top: 2px; color: #333; font-style: italic;">* Ký hiệu: <strong>(✓)</strong> Có mặt &nbsp;|&nbsp; <strong>(✗)</strong> Vắng &nbsp;|&nbsp; <strong>(P)</strong> Có phép &nbsp;|&nbsp; <strong>(/)</strong> Chưa vào / Đã rút bán trú</div>
</div>
<div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px; page-break-inside: avoid;">
  <div style="width: 42%; text-align: center;">
    <div style="height: 16px;"></div>
    <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 42px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9.5pt;">${user?.fullname?.trim() || user?.username || ''}</div>
  </div>
  <div style="width: 45%; text-align: center;">
    <div style="font-style: italic; font-size: 8.5pt; height: 16px; line-height: 16px;">${todayStr}</div>
    <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">GIÁM ĐỐC</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 42px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9.5pt;">${nguoi_phu_trach || 'Vũ Quốc Phong'}</div>
  </div>
</div>
</div>`;
            }).join('');
            if (htmlPages.trim() === '') return alert('Không có dữ liệu để xuất!');
            const css = `* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.mk-c { color:#16a34a; font-weight:bold; } .mk-v { color:#dc2626; font-weight:bold; } .mk-p { color:#d97706; font-weight:bold; }
.cell-inactive { background-color:#f1f5f9!important; background:#f1f5f9 linear-gradient(to top right, transparent calc(50% - 0.75px), #94a3b8 calc(50% - 0.75px), #94a3b8 calc(50% + 0.75px), transparent calc(50% + 0.75px))!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; text-align:center; }
.mk-slash { font-size:8.5pt; font-weight:bold; color:#64748b; }
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
.col-ghichu-an{width:12mm}
.ft-wrap-an{width:100%;margin-top:10px;font-size:9pt;display:flex;justify-content:space-between;page-break-inside:avoid}
.ft-left-an{flex:1} .ft-right-an{flex:1;text-align:center} .sig-space-an{height:38px}
@page{size:A4 landscape;margin:0.8cm 0.8cm 1.2cm 1cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt-an th{background:#ececec!important}.col-sum-an{background:#f8f4ff!important}.cell-inactive{background:#f1f5f9 linear-gradient(to top right, transparent calc(50% - 0.75px), #94a3b8 calc(50% - 0.75px), #94a3b8 calc(50% + 0.75px), transparent calc(50% + 0.75px))!important}.mk-slash{color:#64748b!important}}`;
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
                const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
                const wIdx = allWeekMons2.indexOf(monStr);
                return wIdx >= 0 && exportNguWeeksActive.includes(wIdx);
            });
            if (ngay_ban_tru.length === 0) return alert('Không có ngày bán trú trong các tuần đã chọn!');
            const numDays = ngay_ban_tru.length;
            const wb = XLSX.utils.book_new();
            exportNguRooms.forEach(ma_phong => {
                const roomStudents = [...(dataByPhong[ma_phong] || [])].sort((a, b) => a.id - b.id);
                const h1 = ['STT', 'STT\nDS BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'Phòng\nNgủ'];
                const h2 = ['', '', '', '', '', ''];
                ngay_ban_tru.forEach(ngay => {
                    const d = new Date(ngay + 'T00:00:00');
                    h1.push(`${d.getDate()}/${d.getMonth() + 1}`);
                    h2.push(DOWS[d.getDay()]);
                });
                h1.push('TS\nBuổi ngủ', 'SB\nVắng', 'Vắng\ncó P', 'Buổi ngủ\nthực tế', 'Ghi chú');
                h2.push('', '', '', '', '');
                const aoa = [
                    [`ĐIỂM DANH NGỦ TRƯA – THÁNG ${so_thang}/${so_nam} – PHÒNG ${ma_phong}`, ...Array(5 + numDays + 5).fill('')],
                    Array(6 + numDays + 5).fill(''), h1, h2,
                ];
                roomStudents.forEach((s, i) => {
                    const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                    const activeDays = ngay_ban_tru.filter(ng => (!s.ngay_vao || ng >= s.ngay_vao) && (!s.ngay_rut || ng <= s.ngay_rut));
                    const dayCells = ngay_ban_tru.map(ngay => {
                        const isOutOfRange = (s.ngay_vao && ngay < s.ngay_vao) || (s.ngay_rut && ngay > s.ngay_rut);
                        if (isOutOfRange) return '/';
                        const v = s.diemdanh[ngay]; return v === 0 ? '✓' : v === 1 ? '✗' : v === 2 ? 'P' : '';
                    });
                    const filteredVang2 = activeDays.filter(ng => s.diemdanh[ng] === 1).length;
                    const filteredPhep2 = activeDays.filter(ng => s.diemdanh[ng] === 2).length;
                    const filteredCoMat2 = activeDays.filter(ng => s.diemdanh[ng] === 0).length;

                    const noteParts = [];
                    if (s.ngay_vao && s.ngay_vao >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_vao <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, vm, vd] = s.ngay_vao.split('-');
                        noteParts.push(`Vào ${vd}/${vm}`);
                    }
                    if (s.ngay_rut && s.ngay_rut >= `${so_nam}-${p2(so_thang)}-01` && s.ngay_rut <= `${so_nam}-${p2(so_thang)}-31`) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    } else if (s.ngay_rut) {
                        const [, rm, rd] = s.ngay_rut.split('-');
                        noteParts.push(`Rút ${rd}/${rm}`);
                    }
                    const noteStr = noteParts.join(', ');

                    aoa.push([i + 1, s.id, s.ho_ten, gt, s.lop, ma_phong, ...dayCells, activeDays.length, filteredVang2, filteredPhep2, filteredCoMat2, noteStr]);
                });
                aoa.push([]);
                aoa.push(['* Ký hiệu: (✓) Có mặt, (✗) Vắng, (P) Có phép, (/) Chưa vào / Đã rút bán trú']);
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                const cols = [{ wch: 5 }, { wch: 8 }, { wch: 28 }, { wch: 5 }, { wch: 8 }, { wch: 7 }];
                for (let i = 0; i < numDays; i++) cols.push({ wch: 5 });
                cols.push({ wch: 7 }, { wch: 7 }, { wch: 9 }, { wch: 12 }, { wch: 14 });
                ws['!cols'] = cols;
                XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}`.substring(0, 31));
            });
            XLSX.writeFile(wb, `BaoCao_DiemDanhNgu_Thang${so_thang}_${so_nam}.xlsx`);
            setShowExportNguModal(false);
        } catch (err) { alert('Lỗi: ' + err.message); }
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
            const namHoc = cauHinhHT.nam_hoc || '2026-2027';
            const allHs = hsRes.data?.hocsinh || [];
            const phongList = phongRes.data?.phong || [];
            const cfg = ngayCfgRes.data?.cauhinh_ngay || null;
            if (!cfg) {
                alert(`Ngày ${fmtDate(specialDate)} chưa được thiết lập Cấu hình ngày đặc biệt!\nVui lòng vào "Lịch trực Admin" > "Cấu hình ngày đặc biệt" để tạo cấu hình trước khi in.`);
                setExportingSpecial(false);
                return;
            }
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

            const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;

            const phongCodes = Object.keys(byPhong).sort();
            const htmlPages = phongCodes.flatMap(ma_phong => {
                const isAn = specialLoai === 'an';
                const roomStudents = isAn ? sortStudentsForRoom(byPhong[ma_phong], ma_phong) : byPhong[ma_phong].sort((a, b) => a.id - b.id);
                const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
                const numTeachers = phongInfo?.sl_diem_danh || 1;
                const roomTotal = roomStudents.length;
                const roomComat = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 0).length;
                const roomVang = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 1).length;
                const roomPhep = roomStudents.filter(s => ddMap[s.id]?.[specialDate]?.[loaiField] === 2).length;
                const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
                const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
                const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;
                const roomClasses = [...new Set(roomStudents.map(s => s.lop).filter(Boolean))].sort();
                const roomLopList = roomClasses.length > 0 ? roomClasses.join(', ') : 'Không rõ';

                const chunks = isAn ? splitStudentsByTeachers(roomStudents, numTeachers, ma_phong) : splitByTeachers(roomStudents, numTeachers);
                const totalPages = chunks.length;
                let off = 0;
                const offsets = chunks.map(chunk => { const o = off; off += chunk.length; return o; });

                return chunks.map((chunk, pageIdx) => {
                    if (isAn) {
                        chunk = sortStudentsForRoom(chunk, ma_phong);
                    } else {
                        chunk.sort((a, b) => a.id - b.id);
                    }
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
<div style="margin-top: 8px; margin-bottom: 10px; font-size: 9.5pt; line-height: 1.45; text-align: left;">
  <div>* Phòng ${ma_phong}: <strong>${roomTotal} HS</strong>${totalPages > 1 ? ` &nbsp;|&nbsp; Tờ này: <strong>${chunk.length} HS</strong>` : ''}</div>
  <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong> | Lớp 11: <strong>${total11} hs</strong> | Lớp 12: <strong>${total12} hs</strong></div>
</div>
<div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px; page-break-inside: avoid;">
  <div style="width: 42%; text-align: center;">
    <div style="height: 19px;"></div>
    <div style="font-weight: bold; font-size: 10.5pt; text-transform: uppercase;">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
    <div style="font-style: italic; font-size: 9pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 50px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 10.5pt;">${user?.fullname?.trim() || user?.username || ''}</div>
  </div>
  <div style="width: 45%; text-align: center;">
    <div style="font-style: italic; font-size: 9.5pt; height: 19px; line-height: 19px;">${todayStr}</div>
    <div style="font-weight: bold; font-size: 10.5pt; text-transform: uppercase;">GIÁM ĐỐC</div>
    <div style="font-style: italic; font-size: 9pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 50px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 10.5pt;">${nguoiPhuTrach || 'Vũ Quốc Phong'}</div>
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

    // ── Hàm xuất Excel & PDF Bảng Thống kê Bán trú theo Lớp (Template 13 cột) ──
    const sortStudentsByABC = (list) => {
        return [...list].sort((a, b) => {
            const nameA = getSortNames(a.ho_ten);
            const nameB = getSortNames(b.ho_ten);
            let cmp = (nameA.first || '').localeCompare(nameB.first || '', 'vi');
            if (cmp !== 0) return cmp;
            cmp = (nameA.last || '').localeCompare(nameB.last || '', 'vi');
            if (cmp !== 0) return cmp;
            return (nameA.middle || '').localeCompare(nameB.middle || '', 'vi');
        });
    };

    const calcHsThanhTien = (h, donGia) => {
        // Công thức thanh toán bán trú: (Tổng số buổi - Phép) × Tiền ăn
        const soBuoi = Math.max(0, (h.tong_buoi_an || 0) - (h.phep_an || 0));
        return soBuoi * (donGia || 0);
    };

    const openTongHopLopModal = async () => {
        setShowTongHopLopModal(true);
        setThLopData(null);
        setThLopSelected('');
        if (thLopCheDo === 'dot') {
            const dotObj = DOT_THANH_TOAN_CONFIG.find(d => String(d.dot) === String(thLopDotSelected)) || DOT_THANH_TOAN_CONFIG[0];
            setThLopTuNgay(dotObj.start);
            setThLopDenNgay(dotObj.end);
            await fetchThLop(undefined, undefined, dotObj.start, dotObj.end, dotObj.dot);
        } else {
            const [y, m] = thLopMonth.split('-');
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            const start = `${y}-${m}-01`;
            const end = `${y}-${m}-${p2(lastDay)}`;
            setThLopTuNgay(start);
            setThLopDenNgay(end);
            await fetchThLop(thLopMonth, undefined, start, end, null);
        }
    };

    const fetchThLop = async (monthStr, customGia, customStart, customEnd, customDot) => {
        const activeMonthStr = monthStr || thLopMonth;
        const [y, m] = activeMonthStr.split('-');
        setLoadingThLop(true);
        try {
            const donGiaParam = customGia !== undefined ? customGia : thLopDonGiaAn;
            const startParam = customStart !== undefined ? customStart : thLopTuNgay;
            const endParam = customEnd !== undefined ? customEnd : thLopDenNgay;
            const dotParam = customDot !== undefined ? customDot : (thLopCheDo === 'dot' ? thLopDotSelected : null);
            let url = `/api/baocao/tong-hop-lop/?thang=${m}&nam=${y}&don_gia_an=${donGiaParam}`;
            if (startParam) url += `&tu_ngay=${startParam}`;
            if (endParam) url += `&den_ngay=${endParam}`;
            if (dotParam) url += `&dot=${dotParam}`;
            const res = await api.get(url);
            if (res.data?.ok) {
                setThLopData(res.data);
                if (res.data.gia_an && res.data.gia_an > 0) {
                    setThLopDonGiaAn(res.data.gia_an);
                }
                if (res.data.tu_ngay && !customStart && !thLopTuNgay) setThLopTuNgay(res.data.tu_ngay);
                if (res.data.den_ngay && !customEnd && !thLopDenNgay) setThLopDenNgay(res.data.den_ngay);
            }
        } catch { /* ignore */ }
        finally { setLoadingThLop(false); }
    };

    const handleThLopDotChange = (dotVal) => {
        setThLopDotSelected(dotVal);
        const dotObj = DOT_THANH_TOAN_CONFIG.find(d => String(d.dot) === String(dotVal));
        if (dotObj) {
            setThLopTuNgay(dotObj.start);
            setThLopDenNgay(dotObj.end);
            fetchThLop(undefined, undefined, dotObj.start, dotObj.end, dotObj.dot);
        }
    };

    const handleThLopCheDoChange = (mode) => {
        setThLopCheDo(mode);
        if (mode === 'dot') {
            const dotObj = DOT_THANH_TOAN_CONFIG.find(d => String(d.dot) === String(thLopDotSelected)) || DOT_THANH_TOAN_CONFIG[0];
            setThLopTuNgay(dotObj.start);
            setThLopDenNgay(dotObj.end);
            fetchThLop(undefined, undefined, dotObj.start, dotObj.end, dotObj.dot);
        } else {
            const [y, m] = thLopMonth.split('-');
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            const start = `${y}-${m}-01`;
            const end = `${y}-${m}-${p2(lastDay)}`;
            setThLopTuNgay(start);
            setThLopDenNgay(end);
            fetchThLop(thLopMonth, undefined, start, end, null);
        }
    };

    const handleAdd4Weeks = () => {
        if (!thLopTuNgay) return;
        const d = new Date(thLopTuNgay + 'T00:00:00');
        const endD = new Date(d);
        endD.setDate(d.getDate() + 25); // 4 tuần: T2 + 25 ngày = T6 tuần 4
        const endStr = endD.getFullYear() + '-' + p2(endD.getMonth() + 1) + '-' + p2(endD.getDate());
        setThLopDenNgay(endStr);
        fetchThLop(thLopMonth, undefined, thLopTuNgay, endStr);
    };

    const handleThLopMonthChange = (newMonth) => {
        setThLopMonth(newMonth);
        const [y, m] = newMonth.split('-');
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
        const start = `${y}-${m}-01`;
        const end = `${y}-${m}-${p2(lastDay)}`;
        setThLopTuNgay(start);
        setThLopDenNgay(end);
        fetchThLop(newMonth, undefined, start, end);
    };

    const handleApplyThLopPreset = (type) => {
        const [y, m] = thLopMonth.split('-');
        let start, end;
        if (type === 'week') {
            const def = getDefaultSuatAnRange(parseInt(m), parseInt(y));
            start = def.startStr;
            end = def.endStr;
        } else {
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            start = `${y}-${m}-01`;
            end = `${y}-${m}-${p2(lastDay)}`;
        }
        setThLopTuNgay(start);
        setThLopDenNgay(end);
        fetchThLop(thLopMonth, undefined, start, end);
    };

    const exportThLopExcel = () => {
        if (!thLopData) return;
        const { data, so_thang, so_nam } = thLopData;
        const filteredData = thLopSelected ? data.filter(h => h.lop === thLopSelected) : data;
        if (!filteredData || filteredData.length === 0) { alert('Không có dữ liệu!'); return; }

        const currentDonGiaAn = thLopDonGiaAn || 0;
        const activeDot = thLopCheDo === 'dot' ? (thLopDotSelected || thLopData?.dot || '1') : null;
        const baseTitle = activeDot
            ? `BẢNG THỐNG KÊ BÁN TRÚ ĐỢT ${activeDot} (CHU KỲ 4 TUẦN)`
            : `BẢNG THỐNG KÊ BÁN TRÚ THÁNG ${so_thang}/${so_nam}`;
        const rangeText = (thLopTuNgay && thLopDenNgay)
            ? ` (Từ ngày ${formatDateDMY(thLopTuNgay)} đến ngày ${formatDateDMY(thLopDenNgay)})`
            : '';
        const headerAnText = currentDonGiaAn > 0
            ? `ĂN BÁN TRÚ (${currentDonGiaAn.toLocaleString('vi-VN')} Đ/NGÀY)`
            : 'ĂN BÁN TRÚ (GIÁ TIỀN/NGÀY )';

        const buildWorksheet = (hsList, titleText) => {
            const sortedHs = sortStudentsByABC(hsList);
            const dataRows = sortedHs.map((h, i) => [
                i + 1,
                h.lop || '',
                h.id || '',
                h.ho_ten || '',
                h.tong_buoi_ngu || 0,
                h.buoi_ngu_thuc_te || 0,
                h.vang_ngu || 0,
                h.phep_ngu || 0,
                h.tong_buoi_an || 0,
                h.buoi_an_thuc_te || 0,
                h.vang_an || 0,
                h.phep_an || 0,
                calcHsThanhTien(h, currentDonGiaAn)
            ]);

            const sumTongBuoiNgu = sortedHs.reduce((s, h) => s + (h.tong_buoi_ngu || 0), 0);
            const sumNguThucTe = sortedHs.reduce((s, h) => s + (h.buoi_ngu_thuc_te || 0), 0);
            const sumVangNgu = sortedHs.reduce((s, h) => s + (h.vang_ngu || 0), 0);
            const sumPhepNgu = sortedHs.reduce((s, h) => s + (h.phep_ngu || 0), 0);
            const sumTongBuoiAn = sortedHs.reduce((s, h) => s + (h.tong_buoi_an || 0), 0);
            const sumAnThucTe = sortedHs.reduce((s, h) => s + (h.buoi_an_thuc_te || 0), 0);
            const sumVangAn = sortedHs.reduce((s, h) => s + (h.vang_an || 0), 0);
            const sumPhepAn = sortedHs.reduce((s, h) => s + (h.phep_an || 0), 0);
            const sumThanhTien = sortedHs.reduce((s, h) => s + calcHsThanhTien(h, currentDonGiaAn), 0);

            const totalRow = [
                'TỔNG CỘNG', '', '', '',
                sumTongBuoiNgu, sumNguThucTe, sumVangNgu, sumPhepNgu,
                sumTongBuoiAn, sumAnThucTe, sumVangAn, sumPhepAn,
                sumThanhTien
            ];

            const aoa = [
                ['SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH', '', '', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', '', '', '', ''],
                ['TRƯỜNG THPT LÊ THỊ HỒNG GẤM', '', '', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc', '', '', '', ''],
                ['BỘ PHẬN BÁN TRÚ', '', '', '', '', '', '', '', '', '', '', '', ''],
                [],
                [titleText + rangeText],
                ['STT', 'LỚP', 'MÃ BT', 'HỌ TÊN ABC', 'NGỦ BÁN TRÚ', '', '', '', headerAnText, '', '', '', ''],
                ['', '', '', '', 'TỔNG SỐ BUỔI', 'SỐ NGÀY THỰC TẾ', 'VẮNG', 'PHÉP', 'TỔNG SỐ BUỔI', 'SỐ NGÀY THỰC TẾ', 'VẮNG', 'PHÉP', 'THÀNH TIỀN'],
                ...dataRows,
                totalRow
            ];

            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const totalRowIdx = 7 + sortedHs.length;
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },  // SỞ GD
                { s: { r: 0, c: 8 }, e: { r: 0, c: 12 } }, // CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },  // TRƯỜNG THPT LÊ THỊ HỒNG GẤM
                { s: { r: 1, c: 8 }, e: { r: 1, c: 12 } }, // Độc lập - Tự do - Hạnh phúc
                { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },  // BỘ PHẬN BÁN TRÚ
                { s: { r: 4, c: 0 }, e: { r: 4, c: 12 } }, // Tiêu đề bảng
                { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },  // STT
                { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },  // LỚP
                { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },  // MÃ BT
                { s: { r: 5, c: 3 }, e: { r: 6, c: 3 } },  // HỌ TÊN ABC
                { s: { r: 5, c: 4 }, e: { r: 5, c: 7 } },  // NGỦ BÁN TRÚ (4 cột)
                { s: { r: 5, c: 8 }, e: { r: 5, c: 12 } }, // ĂN BÁN TRÚ (5 cột)
                { s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 3 } } // TỔNG CỘNG (4 cột đầu)
            ];

            ws['!cols'] = [
                { wch: 6 },   // STT
                { wch: 8 },   // LỚP
                { wch: 10 },  // MÃ BT
                { wch: 28 },  // HỌ TÊN ABC
                { wch: 15 },  // TỔNG SỐ BUỔI ngủ
                { wch: 18 },  // SỐ NGÀY THỰC TẾ ngủ
                { wch: 8 },   // VẮNG ngủ
                { wch: 8 },   // PHÉP ngủ
                { wch: 15 },  // TỔNG SỐ BUỔI ăn
                { wch: 18 },  // SỐ NGÀY THỰC TẾ ăn
                { wch: 8 },   // VẮNG ăn
                { wch: 8 },   // PHÉP ăn
                { wch: 16 }   // THÀNH TIỀN
            ];
            return ws;
        };

        const wb = XLSX.utils.book_new();
        const lopMap = {};
        filteredData.forEach(h => {
            if (!lopMap[h.lop]) lopMap[h.lop] = [];
            lopMap[h.lop].push(h);
        });

        if (!thLopSelected) {
            // Sheet Toàn trường (sắp xếp theo Lớp rồi theo ABC)
            const sortedAll = [...filteredData].sort((a, b) => {
                const cmpLop = (a.lop || '').localeCompare(b.lop || '', 'vi', { numeric: true });
                if (cmpLop !== 0) return cmpLop;
                const nameA = getSortNames(a.ho_ten);
                const nameB = getSortNames(b.ho_ten);
                let cmp = (nameA.first || '').localeCompare(nameB.first || '', 'vi');
                if (cmp !== 0) return cmp;
                cmp = (nameA.last || '').localeCompare(nameB.last || '', 'vi');
                if (cmp !== 0) return cmp;
                return (nameA.middle || '').localeCompare(nameB.middle || '', 'vi');
            });
            const wsAll = buildWorksheet(sortedAll, baseTitle);
            XLSX.utils.book_append_sheet(wb, wsAll, 'Toan_truong');
        }

        // Từng lớp
        Object.entries(lopMap).sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true })).forEach(([lop, hsArr]) => {
            const wsLop = buildWorksheet(hsArr, `${baseTitle} - LỚP ${lop}`);
            XLSX.utils.book_append_sheet(wb, wsLop, `Lop_${lop}`.substring(0, 31));
        });

        const fileName = activeDot
            ? `ThongKe_BanTru_Dot${activeDot}${thLopSelected ? `_Lop_${thLopSelected}` : ''}.xlsx`
            : (thLopSelected
                ? `ThongKe_BanTru_Thang${so_thang}_${so_nam}_Lop_${thLopSelected}.xlsx`
                : `ThongKe_BanTru_Thang${so_thang}_${so_nam}.xlsx`);
        XLSX.writeFile(wb, fileName);
    };

    const exportThLopPDF = () => {
        if (!thLopData) return;
        const { data, so_thang, so_nam, nam_hoc, nguoi_phu_trach } = thLopData;
        const filteredData = thLopSelected ? data.filter(h => h.lop === thLopSelected) : data;
        if (!filteredData || filteredData.length === 0) { alert('Không có dữ liệu!'); return; }

        const fmtM = n => (n || 0).toLocaleString('vi-VN');
        const currentDonGiaAn = thLopDonGiaAn || 0;
        const activeDot = thLopCheDo === 'dot' ? (thLopDotSelected || thLopData?.dot || '1') : null;
        const baseTitle = activeDot
            ? `BẢNG THỐNG KÊ BÁN TRÚ ĐỢT ${activeDot} (CHU KỲ 4 TUẦN)`
            : `BẢNG THỐNG KÊ BÁN TRÚ THÁNG ${so_thang}/${so_nam}`;
        const rangeText = (thLopTuNgay && thLopDenNgay)
            ? ` (Từ ngày ${formatDateDMY(thLopTuNgay)} đến ngày ${formatDateDMY(thLopDenNgay)})`
            : '';

        const lopMap = {};
        filteredData.forEach(h => {
            if (!lopMap[h.lop]) lopMap[h.lop] = [];
            lopMap[h.lop].push(h);
        });

        const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;

        const htmlPages = Object.entries(lopMap).sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true })).map(([lop, hsArr]) => {
            const sortedHs = sortStudentsByABC(hsArr);
            const sumTongBuoiNgu = sortedHs.reduce((s, h) => s + (h.tong_buoi_ngu || 0), 0);
            const sumNguThucTe = sortedHs.reduce((s, h) => s + (h.buoi_ngu_thuc_te || 0), 0);
            const sumVangNgu = sortedHs.reduce((s, h) => s + (h.vang_ngu || 0), 0);
            const sumPhepNgu = sortedHs.reduce((s, h) => s + (h.phep_ngu || 0), 0);
            const sumTongBuoiAn = sortedHs.reduce((s, h) => s + (h.tong_buoi_an || 0), 0);
            const sumAnThucTe = sortedHs.reduce((s, h) => s + (h.buoi_an_thuc_te || 0), 0);
            const sumVangAn = sortedHs.reduce((s, h) => s + (h.vang_an || 0), 0);
            const sumPhepAn = sortedHs.reduce((s, h) => s + (h.phep_an || 0), 0);
            const sumThanhTien = sortedHs.reduce((s, h) => s + calcHsThanhTien(h, currentDonGiaAn), 0);

            const rows = sortedHs.map((h, i) => {
                const tt = calcHsThanhTien(h, currentDonGiaAn);
                return `<tr>
        <td class="c">${i + 1}</td>
        <td class="c">${h.lop || ''}</td>
        <td class="c b">${h.id || ''}</td>
        <td class="l">${h.ho_ten || ''}</td>
        <td class="c">${h.tong_buoi_ngu || 0}</td>
        <td class="c hl">${h.buoi_ngu_thuc_te || 0}</td>
        <td class="c">${h.vang_ngu || 0}</td>
        <td class="c">${h.phep_ngu || 0}</td>
        <td class="c">${h.tong_buoi_an || 0}</td>
        <td class="c hl">${h.buoi_an_thuc_te || 0}</td>
        <td class="c">${h.vang_an || 0}</td>
        <td class="c">${h.phep_an || 0}</td>
        <td class="r b total-cell">${fmtM(tt)}</td>
      </tr>`;
            }).join('');

            return `<div class="page">
<table class="hdr" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: top; border: none; padding: 0;">
      <div style="font-size: 8.5pt; text-transform: uppercase;">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
      <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase;">TRƯỜNG THPT LÊ THỊ HỒNG GẤM</div>
      <div style="font-size: 8pt; font-weight: bold; margin-top: 1px;">BỘ PHẬN BÁN TRÚ</div>
      <div style="border-top: 1px solid #000; width: 80px; margin: 3px auto 0;"></div>
    </td>
    <td style="width: 55%; text-align: center; vertical-align: top; border: none; padding: 0;">
      <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div style="font-size: 9.5pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</div>
      <div style="border-top: 1px solid #000; width: 120px; margin: 3px auto 0;"></div>
    </td>
  </tr>
</table>
<div class="main-title" style="text-align: center; margin: 6px 0 8px 0;">
  <h1 style="font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0;">${baseTitle}</h1>
  <h2 style="font-size: 9.5pt; font-weight: bold; margin-top: 3px;">
    LỚP: ${lop} &nbsp;|&nbsp; NĂM HỌC: ${nam_hoc || '2026-2027'}
    ${rangeText ? `<span style="font-weight:normal; font-size:8.5pt; margin-left:8px; color:#475569;">${rangeText}</span>` : ''}
  </h2>
</div>
<table class="dt">
<thead>
  <tr>
    <th rowspan="2" class="c" style="width:30px">STT</th>
    <th rowspan="2" class="c" style="width:45px">LỚP</th>
    <th rowspan="2" class="c" style="width:60px">MÃ BT</th>
    <th rowspan="2" class="l" style="width:180px">HỌ TÊN ABC</th>
    <th colspan="4" class="c ngu-hdr">NGỦ BÁN TRÚ</th>
    <th colspan="5" class="c an-hdr">ĂN BÁN TRÚ <span class="price-tag">(${currentDonGiaAn > 0 ? (fmtM(currentDonGiaAn) + ' Đ/NGÀY') : 'GIÁ TIỀN/NGÀY '})</span></th>
  </tr>
  <tr>
    <th class="c" style="width:65px">TỔNG SỐ BUỔI</th>
    <th class="c" style="width:70px">SỐ NGÀY THỰC TẾ</th>
    <th class="c" style="width:40px">VẮNG</th>
    <th class="c" style="width:40px">PHÉP</th>
    <th class="c" style="width:65px">TỔNG SỐ BUỔI</th>
    <th class="c" style="width:70px">SỐ NGÀY THỰC TẾ</th>
    <th class="c" style="width:40px">VẮNG</th>
    <th class="c" style="width:40px">PHÉP</th>
    <th class="c" style="width:85px">THÀNH TIỀN</th>
  </tr>
</thead>
<tbody>${rows}</tbody>
<tfoot>
  <tr>
    <td colspan="4" class="c b">TỔNG CỘNG</td>
    <td class="c b">${sumTongBuoiNgu}</td>
    <td class="c b hl">${sumNguThucTe}</td>
    <td class="c b">${sumVangNgu}</td>
    <td class="c b">${sumPhepNgu}</td>
    <td class="c b">${sumTongBuoiAn}</td>
    <td class="c b hl">${sumAnThucTe}</td>
    <td class="c b">${sumVangAn}</td>
    <td class="c b">${sumPhepAn}</td>
    <td class="r b total-cell">${fmtM(sumThanhTien)}</td>
  </tr>
</tfoot>
</table>
<div style="margin-top: 8px; margin-bottom: 10px; font-size: 8.5pt; line-height: 1.45; text-align: left;">
  * Lớp ${lop}: <strong>${hsArr.length} học sinh</strong> | Tổng thành tiền: <strong>${fmtM(sumThanhTien)} đồng</strong>
</div>
<div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px; page-break-inside: avoid;">
  <div style="width: 42%; text-align: center;">
    <div style="height: 18px;"></div>
    <div style="font-weight: bold; font-size: 9pt; text-transform: uppercase;">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 45px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9pt;">${user?.fullname?.trim() || user?.username || ''}</div>
  </div>
  <div style="width: 45%; text-align: center;">
    <div style="font-style: italic; font-size: 8.5pt; height: 18px; line-height: 18px;">${todayStr}</div>
    <div style="font-weight: bold; font-size: 9pt; text-transform: uppercase;">GIÁM ĐỐC</div>
    <div style="font-style: italic; font-size: 8pt; margin-top: 2px;">(Ký và ghi rõ họ tên)</div>
    <div style="height: 45px;"></div>
    <div style="font-weight: bold; font-style: italic; font-size: 9pt;">${nguoi_phu_trach || 'Vũ Quốc Phong'}</div>
  </div>
</div>
</div>`;
        }).join('');

        const css = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',Times,serif;font-size:8.5pt;color:#000;background:#fff}
.page{page-break-before:always;padding:8mm 10mm}.page:first-of-type{page-break-before:auto}
.hdr td{border:none!important;padding:0}
.main-title{text-align:center;margin-bottom:8px}
.main-title h1{font-size:13pt;font-weight:bold;text-transform:uppercase}
.main-title h2{font-size:10pt;font-weight:bold;margin-top:3px}
.dt{width:100%;border-collapse:collapse;margin-top:4px;border:1.2px solid #000}
.dt th,.dt td{border:1px solid #000;padding:3px 2px;vertical-align:middle;font-size:8pt;line-height:1.2}
.dt th{text-align:center;background:#f2f2f2;font-size:7.5pt;font-weight:bold}
.c{text-align:center}.l{text-align:left;padding-left:4px}.r{text-align:right;padding-right:4px}.b{font-weight:bold}
.hl{font-weight:bold;color:#059669}
.ngu-hdr{background:#eef2ff!important}.an-hdr{background:#fefce8!important}
.price-tag{color:#dc2626!important;font-weight:bold}
.total-cell{color:#dc2626;font-weight:bold}
@page{size:A4 landscape;margin:.6cm .8cm .8cm .8cm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt th{background:#ececec!important}.price-tag,.total-cell{color:#dc2626!important}.hl{color:#059669!important}}`;

        const w = window.open('', '_blank');
        if (!w) { alert('Trình duyệt chặn popup!'); return; }
        w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng thống kê bán trú tháng ${so_thang}/${so_nam}</title><style>${css}</style></head><body>${htmlPages}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
        w.document.close();
    };

    // ── Hàm xuất PDF bảng tính tiền trực GV ──
    const [exportingGvPdf, setExportingGvPdf] = useState(false);
    const exportGvPDF = () => {
        if (gvData.length === 0) return alert('Không có dữ liệu để xuất!');
        setExportingGvPdf(true);
        try {
            const dateStr = `Từ ngày ${tuNgayGV.split('-').reverse().join('/')} đến ngày ${denNgayGV.split('-').reverse().join('/')}`;
            const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;

            let tbody = '';
            gvData.forEach((g, i) => {
                let note = '';
                if (g.is_ngoai) note += ' (Ngoài DS)';
                if (g.so_ca_truc_thay > 0) note += ` (+${g.so_ca_truc_thay} ca trực thay)`;
                if (g.so_ca_bi_thay > 0) note += ` (-${g.so_ca_bi_thay} ca được trực thay)`;
                tbody += `<tr>
          <td class="tc">${i + 1}</td>
          <td class="tl">${g.ho_ten}${note ? ` <span style="font-size:8pt;font-style:italic;color:#c2410c;">${note}</span>` : ''}</td>
          <td class="tc">${g.so_ca_an || 0}</td>
          <td class="tr">${giaAn.toLocaleString('vi-VN')}</td>
          <td class="tc">${g.so_ca_ngu || 0}</td>
          <td class="tr">${giaNgu.toLocaleString('vi-VN')}</td>
          <td class="tr" style="font-weight:bold;">${g.tong_tien.toLocaleString('vi-VN')} đ</td>
          <td class="tc"></td>
        </tr>`;
            });
            tbody += `<tr style="background:#f0fdf4; font-weight:bold;">
        <td colspan="2" class="tc">TỔNG CỘNG</td>
        <td class="tc">${totCaAn}</td>
        <td class="tc">-</td>
        <td class="tc">${totCaNgu}</td>
        <td class="tc">-</td>
        <td class="tr" style="font-size:10pt; color:#166534;">${totTien.toLocaleString('vi-VN')} đ</td>
        <td class="tc"></td>
      </tr>`;

            const htmlPage = `
      <div class="hdr-inner-an">
        <table style="width:100%; border:none;">
          <tr>
            <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:0;">
              <div style="font-size:9.5pt;">SỞ GIÁO DỤC VÀ ĐÀO TẠO<br>THÀNH PHỐ HỒ CHÍ MINH</div>
              <div style="font-size:9.5pt; font-weight:bold;">TRUNG TÂM GIÁO DỤC KỸ THUẬT<br>TỔNG HỢP VÀ HƯỚNG NGHIỆP<br><span style="text-decoration:underline;">LÊ THỊ HỒNG GẤM</span></div>
            </td>
            <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:0;">
              <div style="font-size:9.5pt; font-weight:bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div style="font-size:9.5pt; font-weight:bold; text-decoration:underline;">Độc lập - Tự do - Hạnh phúc</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center; margin: 10px 0 12px;">
        <h1 style="font-size:15pt; font-weight:bold;">BẢNG TÍNH TIỀN TRỰC BÁN TRÚ</h1>
        <div style="font-size:10.5pt; margin-top:3px; font-style:italic;">${dateStr}</div>
      </div>

      <table class="dt-an">
        <thead>
          <tr>
            <th rowspan="2" style="width:36px;">STT</th>
            <th rowspan="2" style="text-align:left; padding-left:8px;">Họ và tên Giáo viên</th>
            <th colspan="2">Trực ca ăn</th>
            <th colspan="2">Trực ca ngủ</th>
            <th rowspan="2" style="width:125px;">Thành tiền (VNĐ)</th>
            <th rowspan="2" style="width:85px;">Ký nhận</th>
          </tr>
          <tr>
            <th style="width:48px;">Số ca</th>
            <th style="width:78px;">Đơn giá</th>
            <th style="width:48px;">Số ca</th>
            <th style="width:78px;">Đơn giá</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
      <div style="font-size:9.5pt; font-style:italic; margin-top:4px; text-align: left;">
        * Đơn giá: Ca ăn ${giaAn.toLocaleString('vi-VN')}đ/ca &nbsp;|&nbsp; Ca ngủ ${giaNgu.toLocaleString('vi-VN')}đ/ca
      </div>
      <div class="ft-wrap-an">
        <div class="ft-left-an">
          <div style="height: 18px;"></div>
          <div style="font-weight:bold; margin-top:2px; font-size:10.5pt; text-transform:uppercase;">KẾ TOÁN</div>
          <div style="font-style:italic; font-size:9.5pt;">(Ký, ghi rõ họ tên)</div>
          <div class="sig-space-an" style="height: 48px;"></div>
          <div style="font-weight:bold; font-style:italic; font-size:11pt;">${keToanName || user?.fullname?.trim() || user?.username || ''}</div>
        </div>
        <div class="ft-right-an">
          <div style="font-style:italic; height: 18px; line-height: 18px; font-size:10pt;">${todayStr}</div>
          <div style="font-weight:bold; margin-top:2px; font-size:10.5pt; text-transform:uppercase;">GIÁM ĐỐC</div>
          <div style="font-style:italic; font-size:9.5pt;">(Ký, ghi rõ họ tên)</div>
          <div class="sig-space-an" style="height: 48px;"></div>
          <div style="font-weight:bold; font-style:italic; font-size:11pt;">${quanLyName || 'Vũ Quốc Phong'}</div>
        </div>
      </div>`;

            const css = `* { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Times New Roman',Times,serif; font-size:10pt; color:#000; background:#fff; padding: 10px 15px; }
      .tc { text-align:center; } .tr { text-align:right; } .tl { text-align:left; padding-left:8px; }
      .dt-an { width:100%; border-collapse:collapse; margin-bottom: 8px; border: 1px solid #000; }
      .dt-an th, .dt-an td { border:1px solid #000; padding: 4px 5px; vertical-align:middle; font-size:9.5pt; line-height:1.2; }
      .dt-an th { text-align:center; background:#ececec; font-weight:bold; }
      .ft-wrap-an { width:100%; margin-top:10px; font-size:10pt; display:flex; justify-content:space-between; page-break-inside:avoid; break-inside:avoid; }
      .ft-left-an { flex:1; text-align:center; } .ft-right-an { flex:1; text-align:center; } .sig-space-an { height:48px; }
      @page { size:A4 portrait; margin: 1.2cm 1.2cm 1.2cm 1.8cm; }
      @media print {
        body { padding:0!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        * { color:#000!important; }
        .dt-an th { background:#ececec!important; }
        tr { page-break-inside:avoid; break-inside:avoid; }
        .ft-wrap-an { page-break-inside:avoid; break-inside:avoid; }
      }`;

            const w = window.open('', '_blank');
            if (!w) return alert('Trình duyệt chặn popup!');
            w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng tính tiền trực (Từ ${tuNgayGV} đến ${denNgayGV})</title><style>${css}</style></head><body>${htmlPage}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
            w.document.close();
        } catch (err) {
            alert('Lỗi: ' + err.message);
        } finally {
            setExportingGvPdf(false);
        }
    };

    // ── Hàm xuất Excel Công GV ──
    const exportGvCongExcel = () => {
        if (gvData.length === 0) return alert('Không có dữ liệu để xuất!');
        const [y, m] = tuNgayGV.split('-');
        const year = parseInt(y, 10);
        const month = parseInt(m, 10);
        const activeDates = new Set();
        gvData.forEach(g => {
            (g.ngay_an || []).forEach(d => activeDates.add(d));
            (g.ngay_ngu || []).forEach(d => activeDates.add(d));
        });
        const workDays = Array.from(activeDates).sort().map(dateStr => {
            const d = new Date(dateStr);
            const dow = d.getDay();
            return {
                dateStr,
                dayNum: d.getDate(),
                dowStr: (dow === 1) ? '2' : (dow === 2) ? '3' : (dow === 3) ? '4' : (dow === 4) ? '5' : (dow === 5) ? '6' : (dow === 6) ? '7' : 'CN'
            };
        });

        const listAn = gvData.filter(g => (g.so_ca_an || 0) > 0);
        const listNgu = gvData.filter(g => (g.so_ca_ngu || 0) > 0);

        const daysAn = workDays.filter(wd => gvData.some(g => (g.ngay_an || []).includes(wd.dateStr)));
        const activeDaysAn = daysAn.length > 0 ? daysAn : workDays;

        const daysNgu = workDays.filter(wd => gvData.some(g => (g.ngay_ngu || []).includes(wd.dateStr)));
        const activeDaysNgu = daysNgu.length > 0 ? daysNgu : workDays;

        const headerRowAn = ['STT', 'Giáo viên', ...activeDaysAn.map(d => {
            const parts = d.dateStr.split('-');
            return `T${d.dowStr} (${parts[2]}/${parts[1]})`;
        }), 'Tổng'];
        const dataRowsAn = (listAn.length > 0 ? listAn : gvData).map((g, i) => {
            const row = [i + 1, g.ho_ten + (g.is_ngoai ? ' (Ngoài DS)' : '')];
            activeDaysAn.forEach(wd => {
                row.push((g.ngay_an || []).includes(wd.dateStr) ? 1 : '');
            });
            row.push(g.so_ca_an);
            return row;
        });
        const totalRowAn = ['', 'TỔNG CỘNG', ...activeDaysAn.map(wd => (listAn.length > 0 ? listAn : gvData).filter(g => (g.ngay_an || []).includes(wd.dateStr)).length || ''), totCaAn];
        dataRowsAn.push(totalRowAn);

        const headerRowNgu = ['STT', 'Giáo viên', ...activeDaysNgu.map(d => {
            const parts = d.dateStr.split('-');
            return `T${d.dowStr} (${parts[2]}/${parts[1]})`;
        }), 'Tổng'];
        const dataRowsNgu = (listNgu.length > 0 ? listNgu : gvData).map((g, i) => {
            const row = [i + 1, g.ho_ten + (g.is_ngoai ? ' (Ngoài DS)' : '')];
            activeDaysNgu.forEach(wd => {
                row.push((g.ngay_ngu || []).includes(wd.dateStr) ? 1 : '');
            });
            row.push(g.so_ca_ngu);
            return row;
        });
        const totalRowNgu = ['', 'TỔNG CỘNG', ...activeDaysNgu.map(wd => (listNgu.length > 0 ? listNgu : gvData).filter(g => (g.ngay_ngu || []).includes(wd.dateStr)).length || ''), totCaNgu];
        dataRowsNgu.push(totalRowNgu);

        const wb = XLSX.utils.book_new();
        const namHoc = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
        const wsAn = XLSX.utils.aoa_to_sheet([
            [`BẢNG TÍNH CÔNG BÁN TRÚ ĂN NĂM HỌC ${namHoc}`],
            [`(Từ ngày ${tuNgayGV.split('-').reverse().join('/')} - ${denNgayGV.split('-').reverse().join('/')})`],
            [],
            headerRowAn,
            ...dataRowsAn
        ]);
        // Merge cell headers
        wsAn['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headerRowAn.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: headerRowAn.length - 1 } }];
        XLSX.utils.book_append_sheet(wb, wsAn, 'Công Ăn');

        const wsNgu = XLSX.utils.aoa_to_sheet([
            [`BẢNG TÍNH CÔNG BÁN TRÚ NGỦ NĂM HỌC ${namHoc}`],
            [`(Từ ngày ${tuNgayGV.split('-').reverse().join('/')} - ${denNgayGV.split('-').reverse().join('/')})`],
            [],
            headerRowNgu,
            ...dataRowsNgu
        ]);
        wsNgu['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headerRowNgu.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: headerRowNgu.length - 1 } }];
        XLSX.utils.book_append_sheet(wb, wsNgu, 'Công Ngủ');

        XLSX.writeFile(wb, `bang-cong-gv-${tuNgayGV}-to-${denNgayGV}.xlsx`);
    };

    // ── Hàm xuất PDF Công GV (Tách riêng 2 bảng Ăn và Ngủ) ──
    const [exportingGvCongPdf, setExportingGvCongPdf] = useState(false);
    const exportGvCongPDF = () => {
        if (gvData.length === 0) return alert('Không có dữ liệu để xuất!');
        setExportingGvCongPdf(true);
        try {
            const [y, m] = tuNgayGV.split('-');
            const year = parseInt(y, 10);
            const month = parseInt(m, 10);
            const activeDates = new Set();
            gvData.forEach(g => {
                (g.ngay_an || []).forEach(d => activeDates.add(d));
                (g.ngay_ngu || []).forEach(d => activeDates.add(d));
            });
            const workDays = Array.from(activeDates).sort().map(dateStr => {
                const d = new Date(dateStr);
                const dow = d.getDay();
                return {
                    dateStr,
                    dayNum: d.getDate(),
                    dowStr: (dow === 1) ? '2' : (dow === 2) ? '3' : (dow === 3) ? '4' : (dow === 4) ? '5' : (dow === 5) ? '6' : (dow === 6) ? '7' : 'CN'
                };
            });

            const namHoc = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
            const firstDay = workDays[0]?.dateStr.split('-').reverse().join('/') || '';
            const lastDay = workDays[workDays.length - 1]?.dateStr.split('-').reverse().join('/') || '';
            const subtitle = `(Từ ngày ${firstDay} - ${lastDay})`;

            const css = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',Times,serif;font-size:10.5pt;color:#000;padding:15px;}
.page{page-break-after:always; break-after:page;}
.page:last-child{page-break-after:auto; break-after:auto;}
h1{font-size:15pt;font-weight:bold;text-align:center;text-transform:uppercase;margin-bottom:4px;color:#000;}
.sub{font-size:10.5pt;text-align:center;font-style:italic;margin-bottom:12px;color:#333;}
.dt{width:100%;border-collapse:collapse;margin-bottom:15px;border:1px solid #000;font-size:9.5pt;}
.dt th,.dt td{border:1px solid #000;padding:4px 3px;text-align:center;vertical-align:middle;color:#000;}
.dt th{font-weight:bold;background:#ececec;}
.dt .name{text-align:left;padding-left:8px;white-space:nowrap;}
.dt th.name-hdr{text-align:left;padding-left:8px;}
.c{text-align:center}
.hdr-inner-an { margin-bottom: 12px; }
.ft-wrap-an { width:100%; margin-top:15px; font-size:10.5pt; display:flex; justify-content:space-between; page-break-inside:avoid; break-inside:avoid; }
.ft-left-an { flex:1; text-align:center; } .ft-right-an { flex:1; text-align:center; } .sig-space-an { height:55px; }
@page{size:A4 landscape;margin:8mm 10mm;}
@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{color:#000!important}.dt th{background:#ececec!important}}`;

            const listAn = gvData.filter(g => (g.so_ca_an || 0) > 0);
            const daysAn = workDays.filter(wd => gvData.some(g => (g.ngay_an || []).includes(wd.dateStr)));
            const activeDaysAn = daysAn.length > 0 ? daysAn : workDays;

            let thAn = `<tr><th class="c" style="width:36px;">STT</th><th class="name-hdr">Giáo viên</th>`;
            activeDaysAn.forEach(wd => {
                const parts = wd.dateStr.split('-');
                thAn += `<th class="c" style="min-width:30px; padding:3px 1px; line-height:1.2;">
                    <div>T${wd.dowStr}</div>
                    <div style="font-size:7.5pt; font-weight:normal; margin-top:2px;">${parts[2]}/${parts[1]}</div>
                </th>`;
            });
            thAn += `<th class="c" style="width:55px; font-weight:bold; color:#059669;">Tổng</th></tr>`;

            let tbodyAn = '';
            const renderListAn = listAn.length > 0 ? listAn : gvData;
            renderListAn.forEach((g, idx) => {
                let tr = `<tr><td class="c">${idx + 1}</td><td class="name">${g.ho_ten}${g.is_ngoai ? ' <span style="font-size:8.5pt;font-style:italic;color:#92400e;">(Ngoài DS)</span>' : ''}</td>`;
                activeDaysAn.forEach(wd => {
                    const hasAn = (g.ngay_an || []).includes(wd.dateStr);
                    tr += `<td class="c">${hasAn ? '✓' : ''}</td>`;
                });
                tr += `<td class="c" style="font-weight:bold; color:#059669;">${g.so_ca_an}</td></tr>`;
                tbodyAn += tr;
            });
            if (renderListAn.length === 0) {
                tbodyAn = `<tr><td colspan="${activeDaysAn.length + 2}" class="c" style="padding:14px; font-style:italic; color:#64748b;">Không có dữ liệu công trực ăn</td></tr>`;
            } else {
                tbodyAn += `<tr style="font-weight:bold; background:#f9fafb;">
                    <td class="c" colspan="2">TỔNG CỘNG</td>
                    ${activeDaysAn.map(wd => {
                        const cnt = renderListAn.filter(g => (g.ngay_an || []).includes(wd.dateStr)).length;
                        return `<td class="c">${cnt || ''}</td>`;
                    }).join('')}
                    <td class="c" style="font-weight:bold; color:#059669; font-size:11pt;">${totCaAn}</td>
                </tr>`;
            }

            const listNgu = gvData.filter(g => (g.so_ca_ngu || 0) > 0);
            const daysNgu = workDays.filter(wd => gvData.some(g => (g.ngay_ngu || []).includes(wd.dateStr)));
            const activeDaysNgu = daysNgu.length > 0 ? daysNgu : workDays;

            let thNgu = `<tr><th class="c" style="width:36px;">STT</th><th class="name-hdr">Giáo viên</th>`;
            activeDaysNgu.forEach(wd => {
                const parts = wd.dateStr.split('-');
                thNgu += `<th class="c" style="min-width:30px; padding:3px 1px; line-height:1.2;">
                    <div>T${wd.dowStr}</div>
                    <div style="font-size:7.5pt; font-weight:normal; margin-top:2px;">${parts[2]}/${parts[1]}</div>
                </th>`;
            });
            thNgu += `<th class="c" style="width:55px; font-weight:bold; color:#4f46e5;">Tổng</th></tr>`;

            let tbodyNgu = '';
            const renderListNgu = listNgu.length > 0 ? listNgu : gvData;
            renderListNgu.forEach((g, idx) => {
                let tr = `<tr><td class="c">${idx + 1}</td><td class="name">${g.ho_ten}${g.is_ngoai ? ' <span style="font-size:8.5pt;font-style:italic;color:#92400e;">(Ngoài DS)</span>' : ''}</td>`;
                activeDaysNgu.forEach(wd => {
                    const hasNgu = (g.ngay_ngu || []).includes(wd.dateStr);
                    tr += `<td class="c">${hasNgu ? '✓' : ''}</td>`;
                });
                tr += `<td class="c" style="font-weight:bold; color:#4f46e5;">${g.so_ca_ngu}</td></tr>`;
                tbodyNgu += tr;
            });
            if (renderListNgu.length === 0) {
                tbodyNgu = `<tr><td colspan="${activeDaysNgu.length + 2}" class="c" style="padding:14px; font-style:italic; color:#64748b;">Không có dữ liệu công trực ngủ</td></tr>`;
            } else {
                tbodyNgu += `<tr style="font-weight:bold; background:#f9fafb;">
                    <td class="c" colspan="2">TỔNG CỘNG</td>
                    ${activeDaysNgu.map(wd => {
                        const cnt = renderListNgu.filter(g => (g.ngay_ngu || []).includes(wd.dateStr)).length;
                        return `<td class="c">${cnt || ''}</td>`;
                    }).join('')}
                    <td class="c" style="font-weight:bold; color:#4f46e5; font-size:11pt;">${totCaNgu}</td>
                </tr>`;
            }

            const todayStr = `TP Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
            const managerName = quanLyName || (user?.fullname?.trim() ? user.fullname : (user?.username || ''));

            const renderPage = (title, theadHtml, tbodyHtml) => `
            <div class="page">
                <div class="hdr-inner-an">
                    <table style="width:100%; border:none;">
                    <tr>
                        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:0;">
                        <div style="font-size:10pt;">SỞ GIÁO DỤC VÀ ĐÀO TẠO<br>THÀNH PHỐ HỒ CHÍ MINH</div>
                        <div style="font-size:10pt; font-weight:bold;">TRUNG TÂM GIÁO DỤC KỸ THUẬT<br>TỔNG HỢP VÀ HƯỚNG NGHIỆP<br><span style="text-decoration:underline;">LÊ THỊ HỒNG GẤM</span></div>
                        </td>
                        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:0;">
                        <div style="font-size:10pt; font-weight:bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                        <div style="font-size:10pt; font-weight:bold; text-decoration:underline;">Độc lập - Tự do - Hạnh phúc</div>
                        </td>
                    </tr>
                    </table>
                </div>
                <h1>${title}</h1>
                <div class="sub">${subtitle}</div>
                <table class="dt">
                    <thead>
                        ${theadHtml}
                    </thead>
                    <tbody>
                        ${tbodyHtml}
                    </tbody>
                </table>
                <div class="ft-wrap-an">
                    <div class="ft-left-an">
                        <div style="height: 20px;"></div>
                        <div style="font-weight:bold; margin-top:2px;">${(user?.role === 'ke_toan' || user?.is_ke_toan) ? 'KẾ TOÁN' : 'NGƯỜI LẬP BẢNG'}</div>
                        <div style="font-style:italic; font-size:10pt;">(Ký, ghi rõ họ tên)</div>
                        <div class="sig-space-an" style="height: 55px;"></div>
                        <div style="font-weight:bold; font-style:italic; font-size:11pt;">${user?.fullname?.trim() || user?.username || ''}</div>
                    </div>
                    <div class="ft-right-an">
                        <div style="font-style:italic; height: 20px; line-height: 20px;">${todayStr}</div>
                        <div style="font-weight:bold; margin-top:2px;">GIÁM ĐỐC</div>
                        <div style="font-style:italic; font-size:10pt;">(Ký, ghi rõ họ tên)</div>
                        <div class="sig-space-an" style="height: 55px;"></div>
                        <div style="font-weight:bold; font-style:italic; font-size:11pt;">${managerName || 'Vũ Quốc Phong'}</div>
                    </div>
                </div>
            </div>`;

            const pageAn = renderPage(`BẢNG TÍNH CÔNG BÁN TRÚ ĂN NĂM HỌC ${namHoc}`, thAn, tbodyAn);
            const pageNgu = renderPage(`BẢNG TÍNH CÔNG BÁN TRÚ NGỦ NĂM HỌC ${namHoc}`, thNgu, tbodyNgu);
            const htmlPages = `${pageAn}\n${pageNgu}`;

            const w = window.open('', '_blank');
            if (!w) return alert('Trình duyệt chặn popup!');
            w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng tính công bán trú (Từ ${tuNgayGV} đến ${denNgayGV})</title><style>${css}</style></head><body>${htmlPages}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
            w.document.close();
        } catch (err) {
            alert('Lỗi: ' + err.message);
        } finally {
            setExportingGvCongPdf(false);
        }
    };

    // ── EXPORT ──
    const exportHsExcel = () => {
        const rows = [
            ['DANH SÁCH TỔNG HỢP ĐIỂM DANH HỌC SINH'],
            ['Tháng: ' + monthHS], [],
            ['STT', 'Họ tên', 'Lớp', 'Ngày có mặt(Ăn)', 'Vắng(Ăn)', 'Phép(Ăn)', 'Ngày có mặt(Ngủ)', 'Vắng(Ngủ)', 'Phép(Ngủ)'],
            ...hsData.map((h, i) => [i + 1, h.ho_ten, h.lop, h.so_ngay_co_mat_an, h.so_ngay_vang_an, h.so_ngay_phep_an, h.so_ngay_co_mat_ngu, h.so_ngay_vang_ngu, h.so_ngay_phep_ngu])
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'HS');
        XLSX.writeFile(wb, `baocao-hs-${monthHS}.xlsx`);
    };

    const exportGvExcel = () => {
        const rows = [
            ['BẢNG THỐNG KÊ LƯƠNG GIÁO VIÊN TRỰC BÁN TRÚ'],
            [`Từ ngày ${tuNgayGV.split('-').reverse().join('/')} đến ${denNgayGV.split('-').reverse().join('/')}  |  Đơn giá ăn: ${giaAn.toLocaleString('vi-VN')}đ  |  Ngủ: ${giaNgu.toLocaleString('vi-VN')}đ`], [],
            ['STT', 'Họ tên GV / Nhân sự trực', 'Số ca ăn', 'Đơn giá ăn', 'Số ca ngủ', 'Đơn giá ngủ', 'Tổng số ca', 'Trong đó trực thay', 'Tổng thành tiền (VNĐ)', 'Ký nhận', 'Ghi chú'],
            ...gvData.map((g, i) => {
                let ghiChu = '';
                if (g.is_ngoai) ghiChu += 'Nhân sự ngoài DS. ';
                if (g.so_ca_truc_thay > 0) ghiChu += `Gồm ${g.so_ca_truc_thay} ca trực thay. `;
                if (g.so_ca_bi_thay > 0) ghiChu += `Có ${g.so_ca_bi_thay} ca người khác trực thay. `;
                return [
                    i + 1,
                    g.ho_ten + (g.is_ngoai ? ' (Ngoài DS)' : ''),
                    g.so_ca_an,
                    giaAn,
                    g.so_ca_ngu,
                    giaNgu,
                    g.so_ca_an + g.so_ca_ngu,
                    g.so_ca_truc_thay || 0,
                    g.tong_tien,
                    '', // Ký nhận
                    ghiChu.trim()
                ];
            }),
            [],
            ['', 'TỔNG CỘNG', totCaAn, '', totCaNgu, '', totCaAn + totCaNgu, '', totTien, '', '']
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'GV');
        XLSX.writeFile(wb, `baocao-gv-${tuNgayGV}-to-${denNgayGV}.xlsx`);
    };

    // ── Hàm nạp dữ liệu HS vắng theo ngày ──
    const fetchHsVangData = async (dateStr, loaiVal, lopVal) => {
        setLoadingHsVang(true);
        try {
            const d = dateStr || hsVangDate;
            const l = loaiVal !== undefined ? loaiVal : hsVangLoai;
            let url = `/api/baocao/hs-vang-ngay/?ngay=${d}&loai=${l}`;
            const targetLop = lopVal !== undefined ? lopVal : hsVangLop;
            if (targetLop) url += `&lop=${encodeURIComponent(targetLop)}`;
            const res = await api.get(url);
            if (res.data?.ok) {
                setHsVangData(res.data);
            } else {
                alert('Lỗi tải dữ liệu HS vắng: ' + (res.data?.error || ''));
            }
        } catch (err) {
            console.error('Lỗi fetchHsVangData:', err);
            alert('Lỗi tải dữ liệu: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoadingHsVang(false);
        }
    };

    const openHsVangModal = (loaiInit = 'all') => {
        setHsVangLoai(loaiInit);
        setHsVangStatus('all');
        setHsVangPhong('');
        setShowHsVangModal(true);
        fetchHsVangData(hsVangDate, loaiInit, hsVangLop);
    };

    const dsHsVangAn = useMemo(() => {
        if (!hsVangData?.danh_sach) return [];
        return hsVangData.danh_sach.filter(hs => {
            const isVang = hs.diem_danh_an === 1;
            const isPhep = hs.diem_danh_an === 2;
            if (!isVang && !isPhep) return false;
            if (hsVangPhong && hs.ma_phong_an_id !== hsVangPhong) return false;
            if (hsVangStatus === 'vang' && !isVang) return false;
            if (hsVangStatus === 'phep' && !isPhep) return false;
            return true;
        });
    }, [hsVangData, hsVangPhong, hsVangStatus]);

    const dsHsVangNgu = useMemo(() => {
        if (!hsVangData?.danh_sach) return [];
        return hsVangData.danh_sach.filter(hs => {
            const isVang = hs.diem_danh_ngu === 1;
            const isPhep = hs.diem_danh_ngu === 2;
            if (!isVang && !isPhep) return false;
            if (hsVangPhong && hs.ma_phong_ngu_id !== hsVangPhong) return false;
            if (hsVangStatus === 'vang' && !isVang) return false;
            if (hsVangStatus === 'phep' && !isPhep) return false;
            return true;
        });
    }, [hsVangData, hsVangPhong, hsVangStatus]);

    const hsVangStats = useMemo(() => {
        const vangAn = dsHsVangAn.filter(s => s.diem_danh_an === 1).length;
        const phepAn = dsHsVangAn.filter(s => s.diem_danh_an === 2).length;
        const vangNgu = dsHsVangNgu.filter(s => s.diem_danh_ngu === 1).length;
        const phepNgu = dsHsVangNgu.filter(s => s.diem_danh_ngu === 2).length;

        const allIds = new Set();
        if (hsVangLoai === 'all' || hsVangLoai === 'an') {
            dsHsVangAn.forEach(s => allIds.add(s.id));
        }
        if (hsVangLoai === 'all' || hsVangLoai === 'ngu') {
            dsHsVangNgu.forEach(s => allIds.add(s.id));
        }

        return {
            totalUnique: allIds.size,
            totalAn: dsHsVangAn.length,
            vangAn,
            phepAn,
            totalNgu: dsHsVangNgu.length,
            vangNgu,
            phepNgu
        };
    }, [dsHsVangAn, dsHsVangNgu, hsVangLoai]);

    const phongVangList = useMemo(() => {
        if (!hsVangData?.danh_sach) return [];
        const set = new Set();
        hsVangData.danh_sach.forEach(s => {
            if (s.ma_phong_an_id) set.add(s.ma_phong_an_id);
            if (s.ma_phong_ngu_id) set.add(s.ma_phong_ngu_id);
        });
        return Array.from(set).sort();
    }, [hsVangData]);

    const printHsVangPDF = () => {
        const hasAn = hsVangLoai === 'all' || hsVangLoai === 'an';
        const hasNgu = hsVangLoai === 'all' || hsVangLoai === 'ngu';
        const totalToPrint = (hasAn ? dsHsVangAn.length : 0) + (hasNgu ? dsHsVangNgu.length : 0);

        if (totalToPrint === 0) {
            return alert('Không có học sinh vắng / phép nào để in!');
        }
        const dObj = new Date(hsVangDate + 'T00:00:00');
        const dowStr = DOW_NAMES_VN[dObj.getDay()] || 'Thứ Hai';
        const dayLabel = `${dowStr}, ngày ${p2(dObj.getDate())}/${p2(dObj.getMonth() + 1)}/${dObj.getFullYear()}`;
        const buoiLabel = hsVangLoai === 'an' ? 'CA ĂN TRƯA' : (hsVangLoai === 'ngu' ? 'CA NGỦ TRƯA' : 'CẢ NGÀY (ĂN & NGỦ)');
        const lopLabel = hsVangLop ? ` - LỚP ${hsVangLop}` : '';
        const phongLabel = hsVangPhong ? ` - PHÒNG ${hsVangPhong}` : '';

        // 1. Tạo bảng Ca Ăn trưa riêng
        let tableAnHTML = '';
        if (hasAn) {
            const rowsAn = dsHsVangAn.map((s, idx) => {
                const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                const statusStr = s.diem_danh_an === 1 
                    ? '<span style="color:#dc2626;font-weight:bold;">Vắng ăn</span>' 
                    : '<span style="color:#d97706;font-weight:bold;">Phép ăn</span>';
                return `<tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="text-align:center; font-weight:bold; color:#b91c1c;">${s.id}</td>
                    <td style="text-align:left; font-weight:600; padding-left:6px;">${s.ho_ten}</td>
                    <td style="text-align:center;">${gt}</td>
                    <td style="text-align:center; font-weight:bold;">${s.lop}</td>
                    <td style="text-align:center;">${s.ma_phong_an_id || '-'}</td>
                    <td style="text-align:center;">${statusStr}</td>
                    <td style="text-align:left; font-size:9pt; font-style:italic; padding-left:4px;">${s.ghi_chu || ''}</td>
                </tr>`;
            }).join('');

            tableAnHTML = `
                ${hsVangLoai === 'all' ? `<div style="font-size:10.5pt; font-weight:bold; text-transform:uppercase; margin-top:12px; margin-bottom:5px; color:#b91c1c;">I. DANH SÁCH CA ĂN TRƯA (${dsHsVangAn.length} HỌC SINH)</div>` : ''}
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%;">STT</th>
                            <th style="width:11%;">Mã BT</th>
                            <th style="width:30%;">Họ và tên</th>
                            <th style="width:7%;">GT</th>
                            <th style="width:9%;">Lớp</th>
                            <th style="width:11%;">Phòng ăn</th>
                            <th style="width:13%;">Trạng thái</th>
                            <th style="width:14%;">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dsHsVangAn.length > 0 ? rowsAn : '<tr><td colspan="8" style="text-align:center; padding:12px; color:#666;">Không có học sinh vắng / phép ca ăn</td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:bold; background:#f4f4f4;">
                            <td colspan="6" style="text-align:right; padding-right:10px;">TỔNG CỘNG CA ĂN:</td>
                            <td style="text-align:center;">${dsHsVangAn.length} HS</td>
                            <td style="font-size:8.5pt; text-align:center;">Vắng: ${hsVangStats.vangAn} | Phép: ${hsVangStats.phepAn}</td>
                        </tr>
                    </tfoot>
                </table>
            `;
        }

        // 2. Tạo bảng Ca Ngủ trưa riêng
        let tableNguHTML = '';
        if (hasNgu) {
            const rowsNgu = dsHsVangNgu.map((s, idx) => {
                const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                const statusStr = s.diem_danh_ngu === 1 
                    ? '<span style="color:#dc2626;font-weight:bold;">Vắng ngủ</span>' 
                    : '<span style="color:#d97706;font-weight:bold;">Phép ngủ</span>';
                return `<tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="text-align:center; font-weight:bold; color:#b91c1c;">${s.id}</td>
                    <td style="text-align:left; font-weight:600; padding-left:6px;">${s.ho_ten}</td>
                    <td style="text-align:center;">${gt}</td>
                    <td style="text-align:center; font-weight:bold;">${s.lop}</td>
                    <td style="text-align:center;">${s.ma_phong_ngu_id || '-'}</td>
                    <td style="text-align:center;">${statusStr}</td>
                    <td style="text-align:left; font-size:9pt; font-style:italic; padding-left:4px;">${s.ghi_chu || ''}</td>
                </tr>`;
            }).join('');

            tableNguHTML = `
                ${hsVangLoai === 'all' ? `<div style="font-size:10.5pt; font-weight:bold; text-transform:uppercase; margin-top:16px; margin-bottom:5px; color:#1e40af; page-break-before:auto;">II. DANH SÁCH CA NGỦ TRƯA (${dsHsVangNgu.length} HỌC SINH)</div>` : ''}
                <table class="print-table">
                    <thead>
                        <tr>
                            <th style="width:5%;">STT</th>
                            <th style="width:11%;">Mã BT</th>
                            <th style="width:30%;">Họ và tên</th>
                            <th style="width:7%;">GT</th>
                            <th style="width:9%;">Lớp</th>
                            <th style="width:11%;">Phòng ngủ</th>
                            <th style="width:13%;">Trạng thái</th>
                            <th style="width:14%;">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dsHsVangNgu.length > 0 ? rowsNgu : '<tr><td colspan="8" style="text-align:center; padding:12px; color:#666;">Không có học sinh vắng / phép ca ngủ</td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:bold; background:#f4f4f4;">
                            <td colspan="6" style="text-align:right; padding-right:10px;">TỔNG CỘNG CA NGỦ:</td>
                            <td style="text-align:center;">${dsHsVangNgu.length} HS</td>
                            <td style="font-size:8.5pt; text-align:center;">Vắng: ${hsVangStats.vangNgu} | Phép: ${hsVangStats.phepNgu}</td>
                        </tr>
                    </tfoot>
                </table>
            `;
        }

        // 3. Khối tổng hợp tóm tắt (ĐƯA XUỐNG DƯỚI CÙNG THEO YÊU CẦU)
        let summaryBoxHTML;
        if (hsVangLoai === 'all') {
            summaryBoxHTML = `
                <div style="margin-top:14px; margin-bottom:18px; padding:7px 12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:9.5pt; display:flex; justify-content:space-between; align-items:center; page-break-inside:avoid;">
                    <div>Tổng số học sinh vắng / phép: <strong>${hsVangStats.totalUnique} HS</strong></div>
                    <div style="font-size:9pt;">
                        Vắng ăn: <strong style="color:#dc2626;">${hsVangStats.vangAn}</strong> &nbsp;|&nbsp; 
                        Phép ăn: <strong style="color:#d97706;">${hsVangStats.phepAn}</strong> &nbsp;|&nbsp; 
                        Vắng ngủ: <strong style="color:#dc2626;">${hsVangStats.vangNgu}</strong> &nbsp;|&nbsp; 
                        Phép ngủ: <strong style="color:#d97706;">${hsVangStats.phepNgu}</strong>
                    </div>
                </div>
            `;
        } else if (hsVangLoai === 'an') {
            summaryBoxHTML = `
                <div style="margin-top:14px; margin-bottom:18px; padding:7px 12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:9.5pt; display:flex; justify-content:space-between; align-items:center; page-break-inside:avoid;">
                    <div>Tổng số học sinh vắng / phép Ca Ăn: <strong>${dsHsVangAn.length} HS</strong></div>
                    <div style="font-size:9pt;">
                        Vắng ăn: <strong style="color:#dc2626;">${hsVangStats.vangAn}</strong> &nbsp;|&nbsp; 
                        Phép ăn: <strong style="color:#d97706;">${hsVangStats.phepAn}</strong>
                    </div>
                </div>
            `;
        } else {
            summaryBoxHTML = `
                <div style="margin-top:14px; margin-bottom:18px; padding:7px 12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; font-size:9.5pt; display:flex; justify-content:space-between; align-items:center; page-break-inside:avoid;">
                    <div>Tổng số học sinh vắng / phép Ca Ngủ: <strong>${dsHsVangNgu.length} HS</strong></div>
                    <div style="font-size:9pt;">
                        Vắng ngủ: <strong style="color:#dc2626;">${hsVangStats.vangNgu}</strong> &nbsp;|&nbsp; 
                        Phép ngủ: <strong style="color:#d97706;">${hsVangStats.phepNgu}</strong>
                    </div>
                </div>
            `;
        }

        const css = `
            * { box-sizing: border-box; font-family: 'Times New Roman', Times, serif; }
            body { margin: 0; padding: 0; color: #000; background: #fff; line-height: 1.3; }
            table.print-table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 12px; font-size: 10pt; }
            table.print-table th, table.print-table td { border: 1px solid #333; padding: 5px 6px; }
            table.print-table th { background: #ececec !important; font-weight: bold; text-align: center; }
            table.print-table tfoot td { background: #f4f4f4 !important; font-weight: bold; }
            @page { size: A4 portrait; margin: 1cm 0.8cm 1.2cm 0.8cm; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        `;

        const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>DS_HS_Vang_${hsVangDate}</title><style>${css}</style></head><body>
            <table style="width:100%; border:none; margin-bottom:8px;">
                <tr>
                    <td style="width:45%; text-align:center; vertical-align:top; border:none; padding:0;">
                        <div style="font-size:9.5pt; text-transform:uppercase;">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP.HCM</div>
                        <div style="font-size:10pt; font-weight:bold; text-transform:uppercase;">PHÂN HIỆU THPT LÊ THI HỒNG GẤM</div>
                        <div style="border-top:1px solid #333; width:60px; margin:4px auto 0;"></div>
                    </td>
                    <td style="width:55%; text-align:center; vertical-align:top; border:none; padding:0;">
                        <div style="font-size:9.5pt; font-weight:bold; text-transform:uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                        <div style="font-size:9.5pt; font-weight:bold;">Độc lập - Tự do - Hạnh phúc</div>
                        <div style="border-top:1px solid #333; width:100px; margin:4px auto 0;"></div>
                    </td>
                </tr>
            </table>

            <div style="text-align:center; margin-top:10px; margin-bottom:12px;">
                <h1 style="font-size:13.5pt; font-weight:bold; text-transform:uppercase; margin:0;">DANH SÁCH HỌC SINH VẮNG / NGHỈ PHÉP BÁN TRÚ</h1>
                <div style="font-size:10.5pt; font-weight:bold; margin-top:4px;">${dayLabel} &nbsp;|&nbsp; ${buoiLabel}${lopLabel}${phongLabel}</div>
                <div style="font-size:9pt; margin-top:2px; font-style:italic;">Năm học: ${hsVangData?.nam_hoc || '2026-2027'}</div>
            </div>

            ${tableAnHTML}
            ${tableNguHTML}

            ${summaryBoxHTML}

            <div style="width:100%; display:flex; justify-content:space-between; margin-top:20px; page-break-inside:avoid;">
                <div style="width:40%; text-align:center;">
                    <div style="font-size:9.5pt; font-weight:bold; text-transform:uppercase;">NGƯỜI LẬP BẢNG</div>
                    <div style="font-size:8.5pt; font-style:italic; margin-top:2px;">(Ký và ghi rõ họ tên)</div>
                    <div style="height:55px;"></div>
                    <div style="font-size:10pt; font-weight:bold;">${user?.fullname || user?.username || ''}</div>
                </div>
                <div style="width:50%; text-align:center;">
                    <div style="font-size:9pt; font-style:italic;">TP. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
                    <div style="font-size:9.5pt; font-weight:bold; text-transform:uppercase; margin-top:2px;">PHỤ TRÁCH BÁN TRÚ</div>
                    <div style="font-size:8.5pt; font-style:italic; margin-top:2px;">(Ký và ghi rõ họ tên)</div>
                    <div style="height:55px;"></div>
                    <div style="font-size:10pt; font-weight:bold;">${hsVangData?.nguoi_phu_trach || 'Vũ Quốc Phong'}</div>
                </div>
            </div>
            <script>window.onload=function(){setTimeout(window.print,400);};</script>
        </body></html>`;

        const w = window.open('', '_blank');
        if (!w) return alert('Trình duyệt chặn popup! Vui lòng cho phép mở popup để in.');
        w.document.write(html);
        w.document.close();
    };

    const exportHsVangExcel = () => {
        const hasAn = hsVangLoai === 'all' || hsVangLoai === 'an';
        const hasNgu = hsVangLoai === 'all' || hsVangLoai === 'ngu';
        const totalToExport = (hasAn ? dsHsVangAn.length : 0) + (hasNgu ? dsHsVangNgu.length : 0);

        if (totalToExport === 0) {
            return alert('Không có dữ liệu học sinh vắng / phép để xuất Excel!');
        }
        const wb = XLSX.utils.book_new();

        if (hasAn) {
            const wsDataAn = [
                ['PHÂN HIỆU THPT LÊ THỊ HỒNG GẤM - BÁN TRÚ'],
                [`DANH SÁCH HỌC SINH VẮNG / NGHỈ PHÉP - CA ĂN TRƯA (NGÀY ${hsVangDate})`],
                [`Lớp: ${hsVangLop || 'Tất cả'} | Phòng: ${hsVangPhong || 'Tất cả'} | Trạng thái: ${hsVangStatus === 'vang' ? 'Chỉ vắng' : (hsVangStatus === 'phep' ? 'Chỉ phép' : 'Tất cả')}`],
                [],
                ['STT', 'Mã BT', 'Họ và tên', 'Giới tính', 'Lớp', 'Phòng ăn', 'Trạng thái', 'Ghi chú']
            ];
            dsHsVangAn.forEach((s, idx) => {
                wsDataAn.push([
                    idx + 1,
                    s.id,
                    s.ho_ten,
                    s.gioi_tinh === 0 ? 'Nam' : 'Nữ',
                    s.lop,
                    s.ma_phong_an_id || '',
                    s.diem_danh_an === 1 ? 'Vắng ăn' : (s.diem_danh_an === 2 ? 'Phép ăn' : ''),
                    s.ghi_chu || ''
                ]);
            });
            wsDataAn.push([]);
            wsDataAn.push([
                'TỔNG CỘNG CA ĂN:', '', '', '', '',
                `${dsHsVangAn.length} HS`,
                `Vắng: ${hsVangStats.vangAn} | Phép: ${hsVangStats.phepAn}`,
                ''
            ]);
            const wsAn = XLSX.utils.aoa_to_sheet(wsDataAn);
            XLSX.utils.book_append_sheet(wb, wsAn, 'Vang_An_Trua');
        }

        if (hasNgu) {
            const wsDataNgu = [
                ['PHÂN HIỆU THPT LÊ THỊ HỒNG GẤM - BÁN TRÚ'],
                [`DANH SÁCH HỌC SINH VẮNG / NGHỈ PHÉP - CA NGỦ TRƯA (NGÀY ${hsVangDate})`],
                [`Lớp: ${hsVangLop || 'Tất cả'} | Phòng: ${hsVangPhong || 'Tất cả'} | Trạng thái: ${hsVangStatus === 'vang' ? 'Chỉ vắng' : (hsVangStatus === 'phep' ? 'Chỉ phép' : 'Tất cả')}`],
                [],
                ['STT', 'Mã BT', 'Họ và tên', 'Giới tính', 'Lớp', 'Phòng ngủ', 'Trạng thái', 'Ghi chú']
            ];
            dsHsVangNgu.forEach((s, idx) => {
                wsDataNgu.push([
                    idx + 1,
                    s.id,
                    s.ho_ten,
                    s.gioi_tinh === 0 ? 'Nam' : 'Nữ',
                    s.lop,
                    s.ma_phong_ngu_id || '',
                    s.diem_danh_ngu === 1 ? 'Vắng ngủ' : (s.diem_danh_ngu === 2 ? 'Phép ngủ' : ''),
                    s.ghi_chu || ''
                ]);
            });
            wsDataNgu.push([]);
            wsDataNgu.push([
                'TỔNG CỘNG CA NGỦ:', '', '', '', '',
                `${dsHsVangNgu.length} HS`,
                `Vắng: ${hsVangStats.vangNgu} | Phép: ${hsVangStats.phepNgu}`,
                ''
            ]);
            const wsNgu = XLSX.utils.aoa_to_sheet(wsDataNgu);
            XLSX.utils.book_append_sheet(wb, wsNgu, 'Vang_Ngu_Trua');
        }

        XLSX.writeFile(wb, `DS_HS_Vang_${hsVangLoai}_${hsVangDate}.xlsx`);
    };

    // ── Xử lý Báo cáo Suất ăn hàng tháng cho bên cung cấp ──
    const fetchSuatAnData = async (m, y, tu, den) => {
        const targetMonth = m !== undefined ? m : suatAnMonth;
        const targetYear = y !== undefined ? y : suatAnYear;
        const targetTu = tu !== undefined ? tu : suatAnTuNgay;
        const targetDen = den !== undefined ? den : suatAnDenNgay;

        setSuatAnLoading(true);
        try {
            let url = `/api/baocao/suat-an-thang/?thang=${targetMonth}&nam=${targetYear}`;
            if (targetTu) url += `&tu_ngay=${targetTu}`;
            if (targetDen) url += `&den_ngay=${targetDen}`;
            const res = await api.get(url);
            if (res.data?.ok) {
                const d = res.data;
                setSuatAnData(d);
                setSuatAnRows((d.days || []).map(r => ({
                    ...r,
                    sl_suat_an: r.sl_suat_an,
                    hs_phep: r.hs_phep,
                    ghi_chu: r.ghi_chu || ''
                })));
                if (d.tu_ngay) setSuatAnTuNgay(d.tu_ngay);
                if (d.den_ngay) setSuatAnDenNgay(d.den_ngay);
                if (d.nguoi_lap_bang) setSuatAnNguoiLap(d.nguoi_lap_bang);
                if (d.dai_dien_cong_ty) setSuatAnDaiDienCT(d.dai_dien_cong_ty);
                if (d.giam_doc) setSuatAnGiamDoc(d.giam_doc);
                if (d.dia_danh) setSuatAnDiaDanh(d.dia_danh);
                if (d.so_gd) setSuatAnSoGD(d.so_gd);
                if (d.ten_truong) {
                    const fullTen = (d.ten_truong.includes('TRƯỜNG') || d.ten_truong.includes('TRUNG TÂM'))
                        ? d.ten_truong
                        : `TRƯỜNG THPT ${d.ten_truong}`;
                    setSuatAnTenTruong(fullTen);
                }
                if (d.bo_phan) setSuatAnBoPhan(d.bo_phan);
            } else {
                alert('Lỗi tải dữ liệu: ' + (res.data?.error || ''));
            }
        } catch (err) {
            console.error('Error fetching suat-an:', err);
            alert('Lỗi khi tải dữ liệu suất ăn: ' + err.message);
        } finally {
            setSuatAnLoading(false);
        }
    };

    const openSuatAnModal = async (m, y) => {
        const targetMonth = m !== undefined ? m : suatAnMonth;
        const targetYear = y !== undefined ? y : suatAnYear;
        const def = getDefaultSuatAnRange(targetMonth, targetYear);
        setSuatAnMonth(targetMonth);
        setSuatAnYear(targetYear);
        setSuatAnTuNgay(def.startStr);
        setSuatAnDenNgay(def.endStr);
        setShowSuatAnModal(true);
        await fetchSuatAnData(targetMonth, targetYear, def.startStr, def.endStr);
    };

    const handleSuatAnMonthChange = (m, y) => {
        const def = getDefaultSuatAnRange(m, y);
        setSuatAnMonth(m);
        setSuatAnYear(y);
        setSuatAnTuNgay(def.startStr);
        setSuatAnDenNgay(def.endStr);
        fetchSuatAnData(m, y, def.startStr, def.endStr);
    };

    const handleApplyRangePreset = (type) => {
        if (type === 'week') {
            const def = getDefaultSuatAnRange(suatAnMonth, suatAnYear);
            setSuatAnTuNgay(def.startStr);
            setSuatAnDenNgay(def.endStr);
            fetchSuatAnData(suatAnMonth, suatAnYear, def.startStr, def.endStr);
        } else if (type === 'month') {
            const pM = p2(suatAnMonth);
            const lastDayNum = new Date(suatAnYear, suatAnMonth, 0).getDate();
            const startStr = `${suatAnYear}-${pM}-01`;
            const endStr = `${suatAnYear}-${pM}-${p2(lastDayNum)}`;
            setSuatAnTuNgay(startStr);
            setSuatAnDenNgay(endStr);
            fetchSuatAnData(suatAnMonth, suatAnYear, startStr, endStr);
        }
    };

    const handleSuatAnRowChange = (index, field, value) => {
        if (field !== 'ghi_chu') return; // Số suất ăn và HS phép lấy từ CSDL điểm danh, không cho sửa
        setSuatAnRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const exportSuatAnPDF = () => {
        if (!suatAnRows || suatAnRows.length === 0) return alert('Không có dữ liệu để in!');
        const pM = p2(suatAnMonth);
        const title = `TỔNG HỢP SỐ LƯỢNG SUẤT ĂN HÀNG NGÀY THÁNG ${pM}/${suatAnYear}`;
        const subTitle = (suatAnTuNgay && suatAnDenNgay)
            ? `(Từ ngày ${formatDateDMY(suatAnTuNgay)} đến ngày ${formatDateDMY(suatAnDenNgay)})`
            : '';

        let sumSuatAn = 0;
        let sumPhep = 0;

        const tbodyHtml = suatAnRows.map(r => {
            const sa = Number(r.sl_suat_an) || 0;
            const hp = Number(r.hs_phep) || 0;
            sumSuatAn += sa;
            sumPhep += hp;
            return `
            <tr>
              <td class="tc">${r.stt}</td>
              <td class="tc">${r.ngay_format || r.ngay}</td>
              <td class="tc" style="font-weight:600;">${sa > 0 ? sa.toLocaleString('vi-VN') : ''}</td>
              <td class="tc">${hp > 0 ? hp.toLocaleString('vi-VN') : (hp === 0 ? '0' : '')}</td>
              <td>${r.ghi_chu || ''}</td>
            </tr>`;
        }).join('');

        const todayStr = suatAnNgayKy || `${suatAnDiaDanh || 'Thành phố Hồ Chí Minh'}, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;

        const htmlPage = `
        <div class="page">
          <table style="width:100%; border:none; margin-bottom:12px;">
            <tr>
              <td style="width:48%; text-align:center; vertical-align:top; border:none; padding:0;">
                <div style="font-size:9.5pt; text-transform:uppercase; letter-spacing:0.2px;">${suatAnSoGD || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH'}</div>
                <div style="font-size:10.5pt; font-weight:bold; text-transform:uppercase; margin-top:2px;">${suatAnTenTruong || 'TRƯỜNG THPT LÊ THI HỒNG GẤM'}</div>
                <div style="font-size:10pt; font-weight:bold; text-transform:uppercase; margin-top:2px;">${suatAnBoPhan || 'BỘ PHẬN BÁN TRÚ'}</div>
                <div style="border-top:1px solid #000; width:75px; margin:4px auto 0;"></div>
              </td>
              <td style="width:52%; text-align:center; vertical-align:top; border:none; padding:0;">
                <div style="font-size:10pt; font-weight:bold; text-transform:uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                <div style="font-size:10.5pt; font-weight:bold; margin-top:2px;">Độc lập - Tự do - Hạnh phúc</div>
                <div style="border-top:1px solid #000; width:125px; margin:4px auto 0;"></div>
              </td>
            </tr>
          </table>

          <div style="text-align:center; margin: 20px 0 14px 0;">
            <h1 style="font-size:15pt; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; margin:0;">
              ${title}
            </h1>
            ${subTitle ? `<div style="font-size:10.5pt; font-style:italic; margin-top:4px;">${subTitle}</div>` : ''}
          </div>

          <table class="dt-suat-an">
            <thead>
              <tr>
                <th style="width: 50px;">STT</th>
                <th style="width: 130px;">NGÀY THÁNG</th>
                <th style="width: 140px;">SL SUẤT ĂN</th>
                <th style="width: 180px;">HỌC SINH VẮNG (PHÉP)</th>
                <th>GHI CHÚ</th>
              </tr>
            </thead>
            <tbody>
              ${tbodyHtml}
              <tr style="font-weight:bold; background:#fafafa;">
                <td colspan="2" style="text-align:center; font-weight:bold; text-transform:uppercase;">TỔNG CỘNG</td>
                <td class="tc" style="font-weight:bold; font-size:11pt;">${sumSuatAn.toLocaleString('vi-VN')}</td>
                <td class="tc" style="font-weight:bold; font-size:11pt;">${sumPhep.toLocaleString('vi-VN')}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 25px; page-break-inside: avoid;">
            <div style="text-align: right; font-style: italic; font-size: 10.5pt; margin-bottom: 8px; padding-right: 15px;">
              ${todayStr}
            </div>
            <table style="width: 100%; border: none; text-align: center;">
              <tr>
                <td style="width: 33.33%; vertical-align: top; border: none; padding: 0;">
                  <div style="font-weight: bold; font-size: 10.5pt;">Người lập bảng</div>
                  <div style="font-size: 9.5pt; font-style: italic; color: #444;">(Ký, ghi rõ họ tên)</div>
                  <div style="height: 75px;"></div>
                  <div style="font-weight: bold; font-size: 11pt;">${suatAnNguoiLap || 'Mai Quỳnh Châu'}</div>
                </td>
                <td style="width: 33.33%; vertical-align: top; border: none; padding: 0;">
                  <div style="font-weight: bold; font-size: 10.5pt; text-transform: uppercase;">ĐẠI DIỆN CÔNG TY</div>
                  <div style="font-size: 9.5pt; font-style: italic; color: #444;">(Ký, đóng dấu, ghi rõ họ tên)</div>
                  <div style="height: 75px;"></div>
                  <div style="font-weight: bold; font-size: 11pt;">${suatAnDaiDienCT || 'Lê Thị Ngọc Bích'}</div>
                </td>
                <td style="width: 33.33%; vertical-align: top; border: none; padding: 0;">
                  <div style="font-weight: bold; font-size: 10.5pt; text-transform: uppercase;">GIÁM ĐỐC</div>
                  <div style="font-size: 9.5pt; font-style: italic; color: #444;">(Ký, đóng dấu, ghi rõ họ tên)</div>
                  <div style="height: 75px;"></div>
                  <div style="font-weight: bold; font-size: 11pt;">${suatAnGiamDoc || 'Vũ Quốc Phong'}</div>
                </td>
              </tr>
            </table>
          </div>
        </div>`;

        const css = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; background:#fff; padding: 20px; }
        .tc { text-align:center; } .tr { text-align:right; }
        .dt-suat-an { width:100%; border-collapse:collapse; margin-top: 10px; margin-bottom: 15px; border: 1px solid #000; }
        .dt-suat-an th, .dt-suat-an td { border: 1px solid #000; padding: 8px 6px; vertical-align: middle; }
        .dt-suat-an th { text-align: center; background: #ececec; font-weight: bold; text-transform: uppercase; font-size: 10pt; }
        @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
        @media print {
          body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .dt-suat-an th { background: #ececec !important; }
        }`;

        const w = window.open('', '_blank');
        if (!w) return alert('Trình duyệt chặn popup! Vui lòng cho phép mở popup để in.');
        w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${title}</title><style>${css}</style></head><body>${htmlPage}<script>window.onload=function(){setTimeout(window.print,400);}</script></body></html>`);
        w.document.close();
    };

    const exportSuatAnExcel = () => {
        if (!suatAnRows || suatAnRows.length === 0) return alert('Không có dữ liệu để xuất!');
        const pM = p2(suatAnMonth);
        const title = `TỔNG HỢP SỐ LƯỢNG SUẤT ĂN HÀNG NGÀY THÁNG ${pM}/${suatAnYear}`;
        const subTitle = (suatAnTuNgay && suatAnDenNgay)
            ? `(Từ ngày ${formatDateDMY(suatAnTuNgay)} đến ngày ${formatDateDMY(suatAnDenNgay)})`
            : '';

        const aoa = [
            [suatAnSoGD || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
            [suatAnTenTruong || 'TRƯỜNG THPT LÊ THI HỒNG GẤM', '', '', 'Độc lập - Tự do - Hạnh phúc'],
            [suatAnBoPhan || 'BỘ PHẬN BÁN TRÚ', '', '', ''],
            ['', '', '', ''],
            [title, '', '', '', ''],
        ];

        if (subTitle) {
            aoa.push([subTitle, '', '', '', '']);
        }
        aoa.push(['', '', '', '', '']);
        aoa.push(['STT', 'NGÀY THÁNG', 'SL SUẤT ĂN', 'HỌC SINH VẮNG (PHÉP)', 'GHI CHÚ']);

        let sumSuatAn = 0;
        let sumPhep = 0;

        suatAnRows.forEach(r => {
            const sa = Number(r.sl_suat_an) || 0;
            const hp = Number(r.hs_phep) || 0;
            sumSuatAn += sa;
            sumPhep += hp;
            aoa.push([
                r.stt,
                r.ngay_format || r.ngay,
                sa,
                hp,
                r.ghi_chu || ''
            ]);
        });

        // Summary row
        aoa.push(['', 'TỔNG CỘNG', sumSuatAn, sumPhep, '']);
        aoa.push(['', '', '', '', '']);

        const dateLine = suatAnNgayKy || `${suatAnDiaDanh || 'Thành phố Hồ Chí Minh'}, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
        aoa.push(['', '', '', dateLine, '']);
        aoa.push(['Người lập bảng', '', 'ĐẠI DIỆN CÔNG TY', '', 'GIÁM ĐỐC']);
        aoa.push(['(Ký, ghi rõ họ tên)', '', '(Ký, đóng dấu, ghi rõ họ tên)', '', '(Ký, đóng dấu, ghi rõ họ tên)']);
        aoa.push(['', '', '', '', '']);
        aoa.push(['', '', '', '', '']);
        aoa.push(['', '', '', '', '']);
        aoa.push([suatAnNguoiLap || 'Mai Quỳnh Châu', '', suatAnDaiDienCT || 'Lê Thị Ngọc Bích', '', suatAnGiamDoc || 'Vũ Quốc Phong']);

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Merge tiêu đề & Quốc hiệu
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
            { s: { r: 1, c: 3 }, e: { r: 1, c: 4 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
            { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } }, // Tiêu đề
        ];
        if (subTitle) {
            ws['!merges'].push({ s: { r: 5, c: 0 }, e: { r: 5, c: 4 } });
        }

        ws['!cols'] = [
            { wch: 8 },
            { wch: 18 },
            { wch: 16 },
            { wch: 25 },
            { wch: 25 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Suat_An_T${pM}_${suatAnYear}`);
        XLSX.writeFile(wb, `Bao_Cao_Suat_An_Thang_${pM}_${suatAnYear}.xlsx`);
    };

    if (user?.role === 'giao_vien' || user?.is_giao_vien) {
        return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
                <i className="fas fa-lock" style={{ fontSize: '3rem', color: '#ef4444', marginBottom: 16, display: 'block' }}></i>
                <h2 style={{ color: '#1a202c', marginBottom: 8 }}>Không có quyền truy cập</h2>
                <p style={{ color: '#64748b' }}>Giáo viên trực không có quyền xem thống kê & báo cáo.</p>
                <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Về Dashboard</Link>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <div className="page-header-left">
                    <div className="breadcrumb">
                        <Link to="/">Dashboard</Link>
                        <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
                        <span>Thống kê &amp; Báo cáo</span>
                    </div>
                    <h2><i className="fas fa-chart-bar" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Thống kê &amp; Báo cáo</h2>
                    <p>Báo cáo chuyên cần học sinh và thống kê lương ca trực giáo viên theo thời gian thực tế.</p>
                </div>
                {canExportGV && (
                    <div className="page-header-actions">
                        {activeTab === 'panel-gv' && (
                            <button className="btn btn-success btn-sm" onClick={exportGvExcel}><i className="fas fa-file-excel"></i> Xuất Excel Lương GV</button>
                        )}
                    </div>
                )}
            </div>

            {/* MAIN TABS */}
            <div className="bc-main-tabs">
                <button className={`bc-main-tab${activeTab === 'panel-hs' ? ' active' : ''}`} onClick={() => setActiveTab('panel-hs')}>
                    <i className="fas fa-users"></i> Thống kê Học sinh
                </button>
                {canExportGV && (
                <button className={`bc-main-tab${activeTab === 'panel-gv' ? ' active' : ''}`} onClick={() => setActiveTab('panel-gv')}>
                    <i className="fas fa-chalkboard-teacher"></i> Thống kê Lương Giáo viên
                </button>
                )}
            </div>

            {/* PANEL HỌC SINH */}
            {activeTab === 'panel-hs' && (
                <div className="bc-main-panel active">
                    {/* Filter bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                        <label style={{ fontWeight: 600 }}><i className="fas fa-calendar-alt"></i> Chọn Tháng:</label>
                        <input type="month" value={monthHS} onChange={e => setMonthHS(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit' }} />
                        <button className="btn btn-outline btn-sm" onClick={() => setMonthHS(today.slice(0, 7))}>Tháng này</button>
                        {canExportHS && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button className="btn btn-primary btn-sm" style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 600 }} onClick={() => openSuatAnModal()}>
                                <i className="fas fa-utensils"></i> Báo cáo Suất ăn NCC
                            </button>
                            <button className="btn btn-primary btn-sm" style={{ background: '#e11d48', borderColor: '#e11d48', fontWeight: 600 }} onClick={() => openHsVangModal('all')}>
                                <i className="fas fa-user-times"></i> In HS vắng / phép theo ngày
                            </button>
                            <button className="btn btn-primary btn-sm" style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 600 }} onClick={openTongHopLopModal}>
                                <i className="fas fa-table"></i> Tổng hợp theo Lớp
                            </button>
                            <div className="bc-dropdown">
                                <button className="btn btn-primary btn-sm" style={{ background: '#0ea5e9', borderColor: '#0ea5e9', fontWeight: 600 }}>
                                    <i className="fas fa-utensils"></i> Báo cáo Điểm danh Ăn <i className="fas fa-chevron-down" style={{ marginLeft: 4 }}></i>
                                </button>
                                <div className="bc-dropdown-content">
                                    <button onClick={() => openSuatAnModal()}><i className="fas fa-truck-loading" style={{ color: '#ea580c' }}></i> Báo cáo suất ăn NCC (tháng)</button>
                                    <button onClick={openExportAnModal}><i className="fas fa-file-pdf" style={{ color: '#0ea5e9' }}></i> In DS chính thức</button>
                                    <button onClick={() => { setSpecialLoai('an'); setSpecialDate(today); setShowSpecialModal(true); }}><i className="fas fa-print" style={{ color: '#f59e0b' }}></i> In ngày đặc biệt</button>
                                    <button onClick={() => openHsVangModal('an')}><i className="fas fa-user-times" style={{ color: '#e11d48' }}></i> In HS vắng ăn theo ngày</button>
                                </div>
                            </div>
                            <div className="bc-dropdown">
                                <button className="btn btn-primary btn-sm" style={{ background: '#6366f1', borderColor: '#6366f1', fontWeight: 600 }}>
                                    <i className="fas fa-bed"></i> Báo cáo Điểm danh Ngủ <i className="fas fa-chevron-down" style={{ marginLeft: 4 }}></i>
                                </button>
                                <div className="bc-dropdown-content">
                                    <button onClick={openExportNguModal}><i className="fas fa-file-pdf" style={{ color: '#6366f1' }}></i> In DS chính thức</button>
                                    <button onClick={() => { setSpecialLoai('ngu'); setSpecialDate(today); setShowSpecialModal(true); }}><i className="fas fa-print" style={{ color: '#6c5ce7' }}></i> In ngày đặc biệt</button>
                                    <button onClick={() => openHsVangModal('ngu')}><i className="fas fa-user-times" style={{ color: '#e11d48' }}></i> In HS vắng ngủ theo ngày</button>
                                </div>
                            </div>
                        </div>
                        )}
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
                        {loadingHS && <span style={{ color: 'var(--primary)' }}><i className="fas fa-spinner fa-spin"></i> Đang tải...</span>}
                    </div>

                    {/* Stat cards */}
                    <div className="bc-metrics-grid">
                        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-users"></i></div><div className="stat-card-info"><p>Tổng HS</p><h3>{totalHS}</h3><small></small></div></div>
                        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>HS có đi</p><h3>{comAn}</h3></div></div>
                        <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>HS có vắng</p><h3>{vang}</h3></div></div>
                        <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>HS có phép</p><h3>{phep}</h3></div></div>
                    </div>

                    {/* Khối cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                        {khoiStats.map(({ k, t, va, vn, p }) => {
                            return (
                                <div key={k} className="bc-khoi-card" style={{ margin: 0 }}>
                                    <div className={`bc-khoi-header k${k}`}><i className="fas fa-school"></i> KHỐI {k}</div>
                                    <div className="bc-khoi-body" style={{ padding: '8px 12px' }}>
                                        <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng HS</span><span className="bc-khoi-stat-value">{t}</span></div>
                                        <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Tổng lượt vắng (Ăn/Ngủ)</span><span className="bc-khoi-stat-value">{va} / {vn}</span></div>
                                        <div className="bc-khoi-stat"><span className="bc-khoi-stat-label">Lượt phép</span><span className="bc-khoi-stat-value">{p}</span></div>
                                    </div>
                                </div>
                            );
                        })}
                        {khoiStats.length === 0 && <div className="bc-empty"><i className="fas fa-inbox"></i> Chưa có dữ liệu điểm danh tháng này</div>}
                    </div>

                    {/* Bảng chi tiết HS */}
                    <div className="bc-detail-section" style={{ marginTop: 18 }}>
                        <div className="bc-detail-header">
                            <h3><i className="fas fa-list-alt"></i> Tổng hợp chuyên cần từng học sinh (Tháng {monthHS.split('-')[1]}/{monthHS.split('-')[0]})</h3>
                            {canExportHS && (
                                <div className="bc-export-btns">
                                    <button className="btn btn-success btn-sm" onClick={exportHsExcel}><i className="fas fa-file-excel"></i> Xuất Excel</button>
                                </div>
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" id="bc-detail-table">
                                <thead>
                                    <tr>
                                        <th rowSpan={2}>#</th><th rowSpan={2}>Họ tên</th><th rowSpan={2}>Lớp</th>
                                        <th colSpan={3} style={{ textAlign: 'center', background: '#fdf8f6' }}>Ca Ăn</th>
                                        <th colSpan={3} style={{ textAlign: 'center', background: '#f8f9fa' }}>Ca Ngủ</th>
                                    </tr>
                                    <tr>
                                        <th style={{ background: '#fdf8f6' }}>Có mặt</th><th style={{ background: '#fdf8f6' }}>Vắng</th><th style={{ background: '#fdf8f6' }}>Phép</th>
                                        <th style={{ background: '#f8f9fa' }}>Có mặt</th><th style={{ background: '#f8f9fa' }}>Vắng</th><th style={{ background: '#f8f9fa' }}>Phép</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hsData.slice(hsPage * HS_PER_PAGE, (hsPage + 1) * HS_PER_PAGE).map((h, i) => (
                                        <tr key={h.id}>
                                            <td>{hsPage * HS_PER_PAGE + i + 1}</td><td><b>{h.ho_ten}</b></td><td>{h.lop}</td>
                                            <td>{h.so_ngay_co_mat_an}</td>
                                            <td><span className={h.so_ngay_vang_an > 0 ? 'badge badge-danger' : ''}>{h.so_ngay_vang_an || '0'}</span></td>
                                            <td>{h.so_ngay_phep_an}</td>
                                            <td>{h.so_ngay_co_mat_ngu}</td>
                                            <td><span className={h.so_ngay_vang_ngu > 0 ? 'badge badge-warning' : ''}>{h.so_ngay_vang_ngu || '0'}</span></td>
                                            <td>{h.so_ngay_phep_ngu}</td>
                                        </tr>
                                    ))}
                                    {hsData.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>Không có dữ liệu cho tháng {monthHS}</td></tr>}
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
                                <div className="bc-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '8px 4px', flexWrap: 'wrap', gap: 8 }}>
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
            {canExportGV && activeTab === 'panel-gv' && (
                <div className="bc-main-panel active">
                    <div className="bc-filter-row" style={{ marginBottom: 18 }}>
                        <div className="bc-filter-item" style={{display:'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
                            <div>
                                <label><i className="fas fa-calendar-alt"></i> Từ ngày:</label>{' '}
                                <input 
                                    type="date" 
                                    value={tuNgayGV} 
                                    max={denNgayGV || undefined}
                                    onChange={e => handleTuNgayGVChange(e.target.value)} 
                                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0' }} 
                                />
                            </div>
                            <div>
                                <label><i className="fas fa-calendar-alt"></i> Đến ngày:</label>{' '}
                                <input 
                                    type="date" 
                                    value={denNgayGV} 
                                    min={tuNgayGV || undefined}
                                    onChange={e => handleDenNgayGVChange(e.target.value)} 
                                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0' }} 
                                />
                            </div>
                        </div>
                        {loadingGV && <span style={{ color: 'var(--primary)' }}><i className="fas fa-spinner fa-spin"></i> Đang tính lương...</span>}
                        {canExportGV && (
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn btn-sm" onClick={exportGvCongExcel} style={{ color: '#059669', border: '1.5px solid #34d399', backgroundColor: '#ecfdf5', fontWeight: 600, boxShadow: '0 2px 4px rgba(52,211,153,0.1)' }}><i className="fas fa-file-excel" style={{ marginRight: 4 }}></i> Bảng Công (Excel)</button>
                                <button className="btn btn-sm" onClick={exportGvCongPDF} disabled={exportingGvCongPdf} style={{ color: '#dc2626', border: '1.5px solid #f87171', backgroundColor: '#fef2f2', fontWeight: 600, boxShadow: '0 2px 4px rgba(248,113,113,0.1)' }}>
                                    {exportingGvCongPdf ? <i className="fas fa-spinner fa-spin" style={{ marginRight: 4 }}></i> : <i className="fas fa-file-pdf" style={{ marginRight: 4 }}></i>} Bảng Công (PDF)
                                </button>
                                <div style={{ width: 1, background: '#cbd5e1', margin: '0 4px' }}></div>
                                <button className="btn btn-success btn-sm" onClick={exportGvExcel}><i className="fas fa-file-excel"></i> Bảng Lương (Excel)</button>
                                <button className="btn btn-primary btn-sm" onClick={exportGvPDF} disabled={exportingGvPdf} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                                    {exportingGvPdf ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>} Bảng Lương (PDF)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stat cards GV */}
                    <div className="gv-stat-grid">
                        <div className="gv-unit-card"><div className="gv-unit-icon purple"><i className="fas fa-chalkboard-teacher"></i></div><div className="gv-unit-info"><p>Tổng GV tham gia</p><h3>{gvData.length}</h3></div></div>
                        <div className="gv-unit-card"><div className="gv-unit-icon blue"><i className="fas fa-calendar-check"></i></div><div className="gv-unit-info"><p>Tổng ca trực (kỳ)</p><h3>{totCaAn + totCaNgu}</h3></div></div>
                        <div className="gv-unit-card"><div className="gv-unit-icon green"><i className="fas fa-utensils"></i></div><div className="gv-unit-info"><p>Ca ăn / Ca ngủ</p><h3>{totCaAn} / {totCaNgu}</h3></div></div>
                        <div className="gv-unit-card"><div className="gv-unit-icon orange"><i className="fas fa-money-bill-wave"></i></div><div className="gv-unit-info"><p>Tổng tiền trực</p><h3>{totTien.toLocaleString('vi-VN')} đ</h3></div></div>
                    </div>


                    {/* Bảng chi tiết GV */}
                    <div className="bc-detail-section">
                        <div className="bc-detail-header">
                            <h3><i className="fas fa-table"></i> Bảng tính tiền trực theo giáo viên (Từ {tuNgayGV.split('-').reverse().join('/')} đến {denNgayGV.split('-').reverse().join('/')})</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: '7px 14px' }}>
                                    <i className="fas fa-tag" style={{ color: '#64748b', fontSize: '.8rem' }}></i>
                                    <span className="ca-an-badge" style={{ fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <i className="fas fa-utensils"></i> {giaAn.toLocaleString('vi-VN')}đ/ca
                                    </span>
                                    <span className="ca-ngu-badge" style={{ fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <i className="fas fa-bed"></i> {giaNgu.toLocaleString('vi-VN')}đ/ca
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" id="gv-detail-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 44 }}>STT</th>
                                        <th>Họ tên GV / Nhân sự trực</th>
                                        <th style={{ textAlign: 'center' }}><i className="fas fa-utensils" style={{ marginRight: 4 }}></i> Số ca ăn</th>
                                        <th style={{ textAlign: 'center' }}><i className="fas fa-bed" style={{ marginRight: 4 }}></i> Số ca ngủ</th>
                                        <th style={{ textAlign: 'right', minWidth: 200 }}>Thành tiền (VNĐ)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gvData.map((g, i) => (
                                        <tr key={g.id}>
                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                                            <td>
                                                <strong>{g.ho_ten}</strong>
                                                {g.is_ngoai && (
                                                    <span
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            background: '#fef3c7',
                                                            color: '#92400e',
                                                            border: '1px solid #fde68a',
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            marginLeft: 8,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        <i className="fas fa-user-tag"></i>
                                                        Ngoài DS
                                                    </span>
                                                )}
                                                {g.so_ca_truc_thay > 0 && (
                                                    <span
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            background: '#fff7ed',
                                                            color: '#c2410c',
                                                            border: '1px solid #ffedd5',
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            marginLeft: 6,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontWeight: 600,
                                                        }}
                                                        title={g.chi_tiet_truc_thay?.map(c => `${c.ngay} (${c.loai_truc === 0 ? 'Ăn' : 'Ngủ'} - ${c.phong}): trực thay ${c.thay_cho}`).join('\n')}
                                                    >
                                                        <i className="fas fa-exchange-alt"></i>
                                                        +{g.so_ca_truc_thay} ca trực thay
                                                    </span>
                                                )}
                                                {g.so_ca_bi_thay > 0 && (
                                                    <span
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            background: '#f1f5f9',
                                                            color: '#475569',
                                                            border: '1px solid #e2e8f0',
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            marginLeft: 6,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontWeight: 500,
                                                        }}
                                                        title={g.chi_tiet_bi_thay?.map(c => `${c.ngay} (${c.loai_truc === 0 ? 'Ăn' : 'Ngủ'} - ${c.phong}): ${c.nguoi_thay} trực thay`).join('\n')}
                                                    >
                                                        <i className="fas fa-user-clock"></i>
                                                        -{g.so_ca_bi_thay} ca được trực thay
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}><span className="ca-an-badge">{g.so_ca_an} ca</span></td>
                                            <td style={{ textAlign: 'center' }}><span className="ca-ngu-badge">{g.so_ca_ngu} ca</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 800, color: '#00b894', fontSize: '1rem' }}>{g.tong_tien.toLocaleString('vi-VN')}đ</div>
                                                <div style={{ fontSize: '.74rem', color: '#b7791f' }}>{(g.so_ca_an * giaAn).toLocaleString('vi-VN')}đ ăn</div>
                                                <div style={{ fontSize: '.74rem', color: '#6c5ce7' }}>{(g.so_ca_ngu * giaNgu).toLocaleString('vi-VN')}đ ngủ</div>
                                            </td>
                                        </tr>
                                    ))}
                                    {gvData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>Không có lịch trực nào đã được xác nhận từ {tuNgayGV.split('-').reverse().join('/')} đến {denNgayGV.split('-').reverse().join('/')}</td></tr>}
                                </tbody>
                                {gvData.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: 'linear-gradient(90deg,rgba(0,156,255,.06),rgba(108,92,231,.04))' }}>
                                            <td colSpan={2} style={{ fontWeight: 800, fontSize: '.9rem' }}><i className="fas fa-sigma" style={{ color: 'var(--primary)', marginRight: 4 }}></i>TỔNG CỘNG</td>
                                            <td style={{ textAlign: 'center' }}><span className="ca-an-badge" style={{ fontWeight: 800 }}>{totCaAn} ca</span></td>
                                            <td style={{ textAlign: 'center' }}><span className="ca-ngu-badge" style={{ fontWeight: 800 }}>{totCaNgu} ca</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#00b894', fontSize: '1.05rem' }}>{totTien.toLocaleString('vi-VN')}đ</td>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <select className="export-modal-select" value={exportAnMonth} onChange={e => setExportAnMonth(Number(e.target.value))}>
                                        {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                                    </select>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>/</span>
                                    <select className="export-modal-select" value={exportAnYear} onChange={e => setExportAnYear(Number(e.target.value))}>
                                        {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option>; })}
                                    </select>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 8 }}>
                                    <i className="fas fa-info-circle" style={{ color: '#6366f1' }}></i> Số buổi bán trú tự động lấy từ lịch phân công thực tế — ngày nghỉ được loại tự động.
                                </p>
                            </div>
                            <div className="export-modal-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>
                                        <i className="fas fa-calendar-week" style={{ color: '#6366f1' }}></i> CHỌN TUẦN IN
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #6366f1', background: '#eef2ff', color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => setExportAnWeeksActive(weekLabelsAn.map((_, i) => i))}>Chọn tất cả</button>
                                        <button style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}
                                            onClick={() => setExportAnWeeksActive([])}>Bỏ chọn</button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                                    {weekLabelsAn.map((lbl, wIndex) => {
                                        const active = exportAnWeeksActive.includes(wIndex);
                                        return (
                                            <label key={wIndex} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                borderRadius: 7, cursor: 'pointer', userSelect: 'none',
                                                background: active ? '#eef2ff' : '#f8fafc',
                                                border: `1.5px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                                                fontWeight: active ? 600 : 400, color: active ? '#4f46e5' : '#64748b',
                                            }}>
                                                <input type="checkbox" checked={active} style={{ accentColor: '#6366f1' }}
                                                    onChange={e => {
                                                        if (e.target.checked) setExportAnWeeksActive(prev => [...prev, wIndex]);
                                                        else setExportAnWeeksActive(prev => prev.filter(w => w !== wIndex));
                                                    }} />
                                                <span style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{lbl.split(':')[0]}</span>
                                                    <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 4, color: active ? '#6366f1' : '#94a3b8' }}>{lbl.split(': ')[1]}</span>
                                                </span>
                                                {!active && <span style={{ marginLeft: 'auto', fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>Nghỉ</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="export-modal-group">
                                <div className="export-room-header">
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>CHỌN PHÒNG</div>
                                    <div className="export-room-actions">
                                        <button onClick={() => setExportAnRooms(exportAnPhongList.map(p => p.ma_phong))}>Chọn tất cả</button>
                                        <div className="divider"></div>
                                        <button className="deselect" onClick={() => setExportAnRooms([])}>Bỏ chọn</button>
                                    </div>
                                </div>
                                <div className="export-room-grid">
                                    {exportAnPhongList.map(p => (
                                        <div key={p.ma_phong}
                                            className={`export-room-pill ${exportAnRooms.includes(p.ma_phong) ? 'selected' : ''}`}
                                            onClick={() => setExportAnRooms(prev => prev.includes(p.ma_phong) ? prev.filter(r => r !== p.ma_phong) : [...prev, p.ma_phong])}>
                                            {p.ma_phong}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowExportAnModal(false)}>Hủy</button>
                            <button className="btn btn-success" onClick={exportBaoCaoAnExcel} disabled={exportingAn} style={{ background: '#10b981', borderColor: '#10b981' }}>
                                {exportingAn ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>} Xuất Excel
                            </button>
                            <button className="btn btn-primary" onClick={exportBaoCaoAnPDF} disabled={exportingAn} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
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
                        <div className="export-modal-header" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}>
                            <div className="icon"><i className="fas fa-bed"></i></div>
                            <div>
                                <h3>Xuất báo cáo điểm danh Ngủ theo tháng</h3>
                                <p>Dữ liệu thực tế từ DB — số buổi bán trú tự động chính xác</p>
                            </div>
                        </div>
                        <div className="export-modal-body">
                            <div className="export-modal-group">
                                <div className="export-modal-section-title">THÁNG IN</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <select className="export-modal-select" value={exportNguMonth} onChange={e => setExportNguMonth(Number(e.target.value))}>
                                        {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                                    </select>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>/</span>
                                    <select className="export-modal-select" value={exportNguYear} onChange={e => setExportNguYear(Number(e.target.value))}>
                                        {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option>; })}
                                    </select>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 8 }}>
                                    <i className="fas fa-info-circle" style={{ color: '#8b5cf6' }}></i> Số buổi bán trú tự động lấy từ lịch phân công thực tế — ngày nghỉ được loại tự động.
                                </p>
                            </div>
                            <div className="export-modal-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>
                                        <i className="fas fa-calendar-week" style={{ color: '#8b5cf6' }}></i> CHỌN TUẦN IN
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #8b5cf6', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => setExportNguWeeksActive(weekLabelsNgu.map((_, i) => i))}>Chọn tất cả</button>
                                        <button style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}
                                            onClick={() => setExportNguWeeksActive([])}>Bỏ chọn</button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                                    {weekLabelsNgu.map((lbl, wIndex) => {
                                        const active = exportNguWeeksActive.includes(wIndex);
                                        return (
                                            <label key={wIndex} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                borderRadius: 7, cursor: 'pointer', userSelect: 'none',
                                                background: active ? '#f5f3ff' : '#f8fafc',
                                                border: `1.5px solid ${active ? '#8b5cf6' : '#e2e8f0'}`,
                                                fontWeight: active ? 600 : 400, color: active ? '#7c3aed' : '#64748b',
                                            }}>
                                                <input type="checkbox" checked={active} style={{ accentColor: '#8b5cf6' }}
                                                    onChange={e => {
                                                        if (e.target.checked) setExportNguWeeksActive(prev => [...prev, wIndex]);
                                                        else setExportNguWeeksActive(prev => prev.filter(w => w !== wIndex));
                                                    }} />
                                                <span style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{lbl.split(':')[0]}</span>
                                                    <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 4, color: active ? '#8b5cf6' : '#94a3b8' }}>{lbl.split(': ')[1]}</span>
                                                </span>
                                                {!active && <span style={{ marginLeft: 'auto', fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>Nghỉ</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="export-modal-group">
                                <div className="export-room-header">
                                    <div className="export-modal-section-title" style={{ margin: 0 }}>CHỌN PHÒNG NGỦ</div>
                                    <div className="export-room-actions">
                                        <button onClick={() => setExportNguRooms(exportNguPhongList.map(p => p.ma_phong))}>Chọn tất cả</button>
                                        <div className="divider"></div>
                                        <button className="deselect" onClick={() => setExportNguRooms([])}>Bỏ chọn</button>
                                    </div>
                                </div>
                                <div className="export-room-grid">
                                    {exportNguPhongList.map(p => (
                                        <div key={p.ma_phong}
                                            className={`export-room-pill ${exportNguRooms.includes(p.ma_phong) ? 'selected' : ''}`}
                                            onClick={() => setExportNguRooms(prev => prev.includes(p.ma_phong) ? prev.filter(r => r !== p.ma_phong) : [...prev, p.ma_phong])}>
                                            {p.ma_phong}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowExportNguModal(false)}>Hủy</button>
                            <button className="btn btn-success" onClick={exportBaoCaoNguExcel} disabled={exportingNgu} style={{ background: '#10b981', borderColor: '#10b981' }}>
                                {exportingNgu ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>} Xuất Excel
                            </button>
                            <button className="btn btn-primary" onClick={exportBaoCaoNguPDF} disabled={exportingNgu} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                                {exportingNgu ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-pdf"></i>} Xuất PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL TỔNG HỢP THEO LỚP ── */}
            {showTongHopLopModal && (
                <div className="export-modal-overlay">
                    <div className="export-modal" style={{ maxWidth: 560 }}>
                        <div className="export-modal-header" style={{ background: 'linear-gradient(90deg,#10b981,#059669)' }}>
                            <div className="icon"><i className="fas fa-table"></i></div>
                            <div>
                                <h3>Tổng hợp chuyên cần &amp; thu tiền theo Lớp</h3>
                                <p>Xuất bảng tổng hợp ăn/ngủ thực tế, vắng, phép từng HS theo lớp</p>
                            </div>
                        </div>
                        <div className="export-modal-body">
                            {/* BỘ CHUYỂN ĐỔI CHẾ ĐỘ: CHU KỲ 4 TUẦN (1 LẦN THANH TOÁN) vs THEO THÁNG */}
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, marginBottom: 16 }}>
                                <button
                                    type="button"
                                    onClick={() => handleThLopCheDoChange('dot')}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        fontSize: '0.88rem',
                                        fontWeight: thLopCheDo === 'dot' ? 700 : 500,
                                        background: thLopCheDo === 'dot' ? '#10b981' : 'transparent',
                                        color: thLopCheDo === 'dot' ? '#fff' : '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        boxShadow: thLopCheDo === 'dot' ? '0 2px 4px rgba(16,185,129,0.25)' : 'none'
                                    }}
                                >
                                    <i className="fas fa-sync-alt"></i> Chu kỳ 4 tuần (Thanh toán 1 lần)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleThLopCheDoChange('thang')}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        fontSize: '0.88rem',
                                        fontWeight: thLopCheDo === 'thang' ? 700 : 500,
                                        background: thLopCheDo === 'thang' ? '#10b981' : 'transparent',
                                        color: thLopCheDo === 'thang' ? '#fff' : '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        boxShadow: thLopCheDo === 'thang' ? '0 2px 4px rgba(16,185,129,0.25)' : 'none'
                                    }}
                                >
                                    <i className="fas fa-calendar-alt"></i> Theo Tháng dương lịch
                                </button>
                            </div>

                            {/* CHỌN ĐỢT HOẶC CHỌN THÁNG */}
                            <div className="export-modal-group" style={{ display: 'flex', gap: 16 }}>
                                {thLopCheDo === 'dot' ? (
                                    <div style={{ flex: 1 }}>
                                        <div className="export-modal-section-title">
                                            <i className="fas fa-clock" style={{ color: '#10b981' }}></i> CHỌN ĐỢT THANH TOÁN (4 TUẦN)
                                        </div>
                                        <select
                                            value={thLopDotSelected}
                                            onChange={e => handleThLopDotChange(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: 8,
                                                border: '2px solid #10b981',
                                                fontFamily: 'inherit',
                                                fontSize: '0.92rem',
                                                fontWeight: 600,
                                                background: '#fff',
                                                color: '#065f46'
                                            }}
                                        >
                                            {DOT_THANH_TOAN_CONFIG.map(d => (
                                                <option key={d.dot} value={d.dot}>
                                                    {d.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div style={{ flex: 1 }}>
                                        <div className="export-modal-section-title">
                                            <i className="fas fa-calendar-alt" style={{ color: '#10b981' }}></i> CHỌN THÁNG DƯƠNG LỊCH
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <input
                                                type="month"
                                                value={thLopMonth}
                                                onChange={e => handleThLopMonthChange(e.target.value)}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '1rem' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div style={{ flex: 1 }}>
                                    <div className="export-modal-section-title">
                                        <i className="fas fa-chalkboard" style={{ color: '#10b981' }}></i> CHỌN LỚP
                                    </div>
                                    <select
                                        value={thLopSelected}
                                        onChange={e => setThLopSelected(e.target.value)}
                                        disabled={!thLopData || loadingThLop}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.95rem', background: !thLopData ? '#f8fafc' : '#fff' }}
                                    >
                                        <option value="">-- Tất cả các lớp --</option>
                                        {thLopData && [...new Set(thLopData.data.map(h => h.lop))].sort().map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* THÔNG TIN CHU KỲ 4 TUẦN */}
                            {thLopCheDo === 'dot' && (
                                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: '0.82rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fas fa-check-circle" style={{ fontSize: '1rem', color: '#059669', flexShrink: 0 }}></i>
                                    <span>
                                        <strong>Đợt {thLopDotSelected}:</strong> Chu kỳ thanh toán 4 tuần từ <strong>{formatDateDMY(thLopTuNgay)}</strong> đến <strong>{formatDateDMY(thLopDenNgay)}</strong> (thanh toán 1 lần theo chu kỳ 4 tuần).
                                    </span>
                                </div>
                            )}

                            {/* KHOẢNG NGÀY THỰC TẾ */}
                            <div className="export-modal-group" style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div className="export-modal-section-title" style={{ margin: 0, fontSize: '0.8rem' }}>
                                        <i className="fas fa-calendar-week" style={{ color: '#0ea5e9' }}></i> KHOẢNG NGÀY TÍNH TOÁN CỤ THỂ
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            type="button"
                                            onClick={handleAdd4Weeks}
                                            title="Tự động tính đến ngày thứ Sáu sau đúng 4 tuần"
                                            style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 5, border: '1px solid #0ea5e9', background: '#f0f9ff', color: '#0284c7', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            <i className="fas fa-plus"></i> Tròn 4 tuần (20 ngày)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyThLopPreset('month')}
                                            style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 500 }}
                                        >
                                            Tròn tháng
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 2 }}>Từ ngày:</label>
                                        <input
                                            type="date"
                                            value={thLopTuNgay}
                                            onChange={e => {
                                                setThLopTuNgay(e.target.value);
                                                fetchThLop(thLopMonth, undefined, e.target.value, thLopDenNgay);
                                            }}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <span style={{ color: '#94a3b8', marginTop: 16 }}>→</span>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 2 }}>Đến ngày:</label>
                                        <input
                                            type="date"
                                            value={thLopDenNgay}
                                            onChange={e => {
                                                setThLopDenNgay(e.target.value);
                                                fetchThLop(thLopMonth, undefined, thLopTuNgay, e.target.value);
                                            }}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* THÔNG TIN TIỀN ĂN (LẤY TỪ THIẾT LẬP) & CÔNG THỨC THANH TOÁN */}
                            <div className="export-modal-group" style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <i className="fas fa-utensils" style={{ color: '#10b981' }}></i> Tiền ăn Học sinh (Từ Thiết lập)
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#047857' }}>
                                                {(thLopDonGiaAn || 35000).toLocaleString('vi-VN')}
                                            </span>
                                            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>VNĐ/ngày</span>
                                            <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                                                <i className="fas fa-check"></i> Cố định từ Thiết lập
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                                            <i className="fas fa-calculator" style={{ color: '#0284c7' }}></i> Công thức thanh toán:
                                        </div>
                                        <div style={{ marginTop: 4 }}>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '4px 10px', borderRadius: 6, border: '1px solid #bae6fd', display: 'inline-block' }}>
                                                Thành tiền = (Tổng số buổi − Phép) × Tiền ăn
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {thLopData && (
                                <div className="export-modal-group" style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginTop: 12 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                                        <div><span style={{ color: '#64748b', fontSize: '.8rem' }}>Buổi ăn:</span> <strong style={{ color: '#0ea5e9' }}>{thLopData.tong_buoi_an}</strong></div>
                                        <div><span style={{ color: '#64748b', fontSize: '.8rem' }}>Buổi ngủ:</span> <strong style={{ color: '#6366f1' }}>{thLopData.tong_buoi_ngu}</strong></div>
                                        <div><span style={{ color: '#64748b', fontSize: '.8rem' }}>Đơn giá ăn:</span> <strong style={{ color: '#f59e0b' }}>{(thLopDonGiaAn || 0).toLocaleString('vi-VN')}đ</strong></div>
                                        <div><span style={{ color: '#64748b', fontSize: '.8rem' }}>Tổng HS:</span> <strong>{thLopData.data?.length || 0}</strong></div>
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: '.8rem', color: '#059669' }}>
                                        <i className="fas fa-check-circle"></i> Dữ liệu sẵn sàng — chuẩn bị xuất {thLopSelected ? `Lớp ${thLopSelected}` : `${[...new Set((thLopData.data || []).map(h => h.lop))].length} lớp`} (Mẫu 13 cột chuẩn)
                                    </div>
                                </div>
                            )}
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 8 }}>
                                <i className="fas fa-info-circle" style={{ color: '#10b981' }}></i> Mẫu xuất theo chuẩn thống kê 13 cột (STT, Lớp, Mã BT, Họ tên ABC, Ngủ bán trú 4 cột, Ăn bán trú 5 cột kèm Thành tiền).
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowTongHopLopModal(false)}>Hủy</button>
                            <button className="btn btn-success" onClick={exportThLopExcel} disabled={!thLopData || loadingThLop} style={{ background: '#10b981', borderColor: '#10b981' }}>
                                <i className="fas fa-file-excel"></i> Xuất Excel
                            </button>
                            <button className="btn btn-primary" onClick={() => { exportThLopPDF(); }} disabled={!thLopData || loadingThLop} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                                <i className="fas fa-file-pdf"></i> Xuất PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CHỌN NGÀY ĐẶC BIỆT */}
            {showSpecialModal && (
                <div className="export-modal-overlay">
                    <div className="export-modal" style={{ maxWidth: 420 }}>
                        <div className="export-modal-header">
                            <div className="icon" style={{
                                background: specialLoai === 'an'
                                    ? 'linear-gradient(135deg,#f59e0b,#fbbf24)'
                                    : 'linear-gradient(135deg,#6c5ce7,#a29bfe)'
                            }}>
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
                                    <i className="fas fa-calendar-day" style={{ color: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7' }}></i> CHỌN NGÀY
                                </div>
                                <input
                                    type="date"
                                    value={specialDate}
                                    onChange={e => setSpecialDate(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '1rem' }}
                                />
                                <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#64748b' }}>
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
                                style={{ background: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7', borderColor: specialLoai === 'an' ? '#f59e0b' : '#6c5ce7' }}
                            >
                                {exportingSpecial ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-print"></i>}
                                {exportingSpecial ? ' Đang xuất...' : ' Xuất PDF'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL IN DANH SÁCH HS VẮNG / PHÉP THEO NGÀY ── */}
            {showHsVangModal && (
                <div className="export-modal-overlay">
                    <div className="export-modal" style={{ maxWidth: 880, width: '95%' }}>
                        <div className="export-modal-header" style={{ background: 'linear-gradient(90deg, #e11d48, #f43f5e)' }}>
                            <div className="icon"><i className="fas fa-user-times"></i></div>
                            <div>
                                <h3>In danh sách Học sinh vắng &amp; phép theo ngày</h3>
                                <p>Tra cứu và in danh sách học sinh vắng ăn, vắng ngủ chi tiết từng ngày</p>
                            </div>
                        </div>
                        <div className="export-modal-body">
                            {/* Bộ lọc */}
                            <div className="export-modal-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                                <div>
                                    <div className="export-modal-section-title"><i className="fas fa-calendar-day" style={{ color: '#e11d48' }}></i> CHỌN NGÀY</div>
                                    <input
                                        type="date"
                                        value={hsVangDate}
                                        onChange={e => {
                                            setHsVangDate(e.target.value);
                                            fetchHsVangData(e.target.value, hsVangLoai, hsVangLop);
                                        }}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <div className="export-modal-section-title"><i className="fas fa-clock" style={{ color: '#e11d48' }}></i> BUỔI / CA</div>
                                    <select
                                        value={hsVangLoai}
                                        onChange={e => {
                                            setHsVangLoai(e.target.value);
                                            fetchHsVangData(hsVangDate, e.target.value, hsVangLop);
                                        }}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                                    >
                                        <option value="all">Tất cả (Ăn &amp; Ngủ)</option>
                                        <option value="an">Ca Ăn trưa</option>
                                        <option value="ngu">Ca Ngủ trưa</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="export-modal-section-title"><i className="fas fa-chalkboard" style={{ color: '#e11d48' }}></i> LỌC LỚP</div>
                                    <select
                                        value={hsVangLop}
                                        onChange={e => {
                                            setHsVangLop(e.target.value);
                                            fetchHsVangData(hsVangDate, hsVangLoai, e.target.value);
                                        }}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                                    >
                                        <option value="">-- Tất cả các lớp --</option>
                                        {lopList.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="export-modal-section-title"><i className="fas fa-door-open" style={{ color: '#e11d48' }}></i> LỌC PHÒNG</div>
                                    <select
                                        value={hsVangPhong}
                                        onChange={e => setHsVangPhong(e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                                    >
                                        <option value="">-- Tất cả các phòng --</option>
                                        {phongVangList.map(p => <option key={p} value={p}>Phòng {p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="export-modal-section-title"><i className="fas fa-filter" style={{ color: '#e11d48' }}></i> TRẠNG THÁI</div>
                                    <select
                                        value={hsVangStatus}
                                        onChange={e => setHsVangStatus(e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                                    >
                                        <option value="all">Tất cả (Vắng &amp; Phép)</option>
                                        <option value="vang">Chỉ vắng không phép</option>
                                        <option value="phep">Chỉ nghỉ có phép</option>
                                    </select>
                                </div>
                            </div>

                            {/* Vùng bảng xem trước (Tách Ăn và Ngủ riêng) */}
                            <div className="export-modal-group" style={{ margin: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>DANH SÁCH CHI TIẾT THEO CA</span>
                                    {loadingHsVang && <span style={{ color: '#e11d48', fontSize: '0.8rem', fontWeight: 500 }}><i className="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...</span>}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {/* 1. BẢNG CA ĂN TRƯA */}
                                    {(hsVangLoai === 'all' || hsVangLoai === 'an') && (
                                        <div style={{ border: '1px solid #fecdd3', borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
                                            <div style={{ background: '#fff1f2', padding: '7px 12px', fontWeight: 'bold', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fecdd3' }}>
                                                <span><i className="fas fa-utensils"></i> {hsVangLoai === 'all' ? 'I. ' : ''}CA ĂN TRƯA ({dsHsVangAn.length} học sinh)</span>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>Vắng: <strong>{hsVangStats.vangAn}</strong> | Phép: <strong>{hsVangStats.phepAn}</strong></span>
                                            </div>
                                            <div style={{ maxHeight: hsVangLoai === 'all' ? 220 : 380, overflowY: 'auto', overflowX: 'auto' }}>
                                                <table className="data-table" style={{ width: '100%', fontSize: '0.82rem', margin: 0 }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc' }}>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ width: 40, textAlign: 'center', padding: '8px 6px' }}>STT</th>
                                                            <th style={{ width: 60, textAlign: 'center', padding: '8px 6px' }}>Mã BT</th>
                                                            <th style={{ padding: '8px 10px' }}>Họ và tên</th>
                                                            <th style={{ width: 45, textAlign: 'center', padding: '8px 6px' }}>GT</th>
                                                            <th style={{ width: 60, textAlign: 'center', padding: '8px 6px' }}>Lớp</th>
                                                            <th style={{ width: 70, textAlign: 'center', padding: '8px 6px' }}>Phòng ăn</th>
                                                            <th style={{ width: 95, textAlign: 'center', padding: '8px 6px' }}>Trạng thái</th>
                                                            <th style={{ padding: '8px 10px' }}>Ghi chú</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dsHsVangAn.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={8} style={{ textAlign: 'center', padding: '16px 10px', color: '#64748b' }}>
                                                                    <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: 6 }}></i>
                                                                    Không có học sinh vắng hoặc nghỉ phép ca ăn.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            dsHsVangAn.map((s, idx) => (
                                                                <tr key={'an-' + s.id}>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{idx + 1}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#b91c1c', padding: '6px 4px' }}>{s.id}</td>
                                                                    <td style={{ fontWeight: 600, padding: '6px 8px' }}>{s.ho_ten}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{s.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 600, padding: '6px 4px' }}>{s.lop}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{s.ma_phong_an_id || '-'}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                                                        {s.diem_danh_an === 1 && <span className="status-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>Vắng ăn</span>}
                                                                        {s.diem_danh_an === 2 && <span className="status-badge" style={{ background: '#fef3c7', color: '#d97706' }}>Phép ăn</span>}
                                                                    </td>
                                                                    <td style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 8px' }}>{s.ghi_chu || '-'}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                    {dsHsVangAn.length > 0 && (
                                                        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, background: '#f1f5f9' }}>
                                                            <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                                                <td colSpan={6} style={{ textAlign: 'right', padding: '7px 10px' }}>TỔNG CỘNG CA ĂN:</td>
                                                                <td style={{ textAlign: 'center', color: '#b91c1c', padding: '7px 4px' }}>{dsHsVangAn.length} HS</td>
                                                                <td style={{ fontSize: '0.78rem', color: '#64748b', padding: '7px 8px' }}>Vắng: {hsVangStats.vangAn} | Phép: {hsVangStats.phepAn}</td>
                                                            </tr>
                                                        </tfoot>
                                                    )}
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. BẢNG CA NGỦ TRƯA */}
                                    {(hsVangLoai === 'all' || hsVangLoai === 'ngu') && (
                                        <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
                                            <div style={{ background: '#eff6ff', padding: '7px 12px', fontWeight: 'bold', color: '#1e40af', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #bfdbfe' }}>
                                                <span><i className="fas fa-bed"></i> {hsVangLoai === 'all' ? 'II. ' : ''}CA NGỦ TRƯA ({dsHsVangNgu.length} học sinh)</span>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>Vắng: <strong>{hsVangStats.vangNgu}</strong> | Phép: <strong>{hsVangStats.phepNgu}</strong></span>
                                            </div>
                                            <div style={{ maxHeight: hsVangLoai === 'all' ? 220 : 380, overflowY: 'auto', overflowX: 'auto' }}>
                                                <table className="data-table" style={{ width: '100%', fontSize: '0.82rem', margin: 0 }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc' }}>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ width: 40, textAlign: 'center', padding: '8px 6px' }}>STT</th>
                                                            <th style={{ width: 60, textAlign: 'center', padding: '8px 6px' }}>Mã BT</th>
                                                            <th style={{ padding: '8px 10px' }}>Họ và tên</th>
                                                            <th style={{ width: 45, textAlign: 'center', padding: '8px 6px' }}>GT</th>
                                                            <th style={{ width: 60, textAlign: 'center', padding: '8px 6px' }}>Lớp</th>
                                                            <th style={{ width: 70, textAlign: 'center', padding: '8px 6px' }}>Phòng ngủ</th>
                                                            <th style={{ width: 95, textAlign: 'center', padding: '8px 6px' }}>Trạng thái</th>
                                                            <th style={{ padding: '8px 10px' }}>Ghi chú</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dsHsVangNgu.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={8} style={{ textAlign: 'center', padding: '16px 10px', color: '#64748b' }}>
                                                                    <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: 6 }}></i>
                                                                    Không có học sinh vắng hoặc nghỉ phép ca ngủ.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            dsHsVangNgu.map((s, idx) => (
                                                                <tr key={'ngu-' + s.id}>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{idx + 1}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#b91c1c', padding: '6px 4px' }}>{s.id}</td>
                                                                    <td style={{ fontWeight: 600, padding: '6px 8px' }}>{s.ho_ten}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{s.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 600, padding: '6px 4px' }}>{s.lop}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>{s.ma_phong_ngu_id || '-'}</td>
                                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                                                        {s.diem_danh_ngu === 1 && <span className="status-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>Vắng ngủ</span>}
                                                                        {s.diem_danh_ngu === 2 && <span className="status-badge" style={{ background: '#fef3c7', color: '#d97706' }}>Phép ngủ</span>}
                                                                    </td>
                                                                    <td style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 8px' }}>{s.ghi_chu || '-'}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                    {dsHsVangNgu.length > 0 && (
                                                        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, background: '#f1f5f9' }}>
                                                            <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                                                <td colSpan={6} style={{ textAlign: 'right', padding: '7px 10px' }}>TỔNG CỘNG CA NGỦ:</td>
                                                                <td style={{ textAlign: 'center', color: '#1e40af', padding: '7px 4px' }}>{dsHsVangNgu.length} HS</td>
                                                                <td style={{ fontSize: '0.78rem', color: '#64748b', padding: '7px 8px' }}>Vắng: {hsVangStats.vangNgu} | Phép: {hsVangStats.phepNgu}</td>
                                                            </tr>
                                                        </tfoot>
                                                    )}
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Khối thống kê tóm tắt (ĐƯA XUỐNG DƯỚI CÙNG THEO YÊU CẦU) */}
                            <div className="export-modal-group" style={{ background: '#fff1f2', borderRadius: 10, padding: '9px 14px', border: '1px solid #fecdd3', marginTop: 12, marginBottom: 0 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: '0.88rem' }}>
                                    <div><span style={{ color: '#64748b' }}>Tổng số HS vắng / phép:</span> <strong style={{ color: '#e11d48', fontSize: '1.08rem', marginLeft: 4 }}>{hsVangStats.totalUnique}</strong> HS</div>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <div><span style={{ color: '#64748b' }}>Vắng ăn:</span> <strong style={{ color: '#dc2626', marginLeft: 3 }}>{hsVangStats.vangAn}</strong></div>
                                    <div><span style={{ color: '#64748b' }}>Phép ăn:</span> <strong style={{ color: '#d97706', marginLeft: 3 }}>{hsVangStats.phepAn}</strong></div>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <div><span style={{ color: '#64748b' }}>Vắng ngủ:</span> <strong style={{ color: '#dc2626', marginLeft: 3 }}>{hsVangStats.vangNgu}</strong></div>
                                    <div><span style={{ color: '#64748b' }}>Phép ngủ:</span> <strong style={{ color: '#d97706', marginLeft: 3 }}>{hsVangStats.phepNgu}</strong></div>
                                </div>
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowHsVangModal(false)}>Đóng</button>
                            <button
                                className="btn btn-success"
                                onClick={exportHsVangExcel}
                                disabled={((hsVangLoai === 'all' || hsVangLoai === 'an' ? dsHsVangAn.length : 0) + (hsVangLoai === 'all' || hsVangLoai === 'ngu' ? dsHsVangNgu.length : 0)) === 0}
                                style={{ background: '#10b981', borderColor: '#10b981' }}
                            >
                                <i className="fas fa-file-excel"></i> Xuất Excel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={printHsVangPDF}
                                disabled={((hsVangLoai === 'all' || hsVangLoai === 'an' ? dsHsVangAn.length : 0) + (hsVangLoai === 'all' || hsVangLoai === 'ngu' ? dsHsVangNgu.length : 0)) === 0}
                                style={{ background: '#e11d48', borderColor: '#e11d48' }}
                            >
                                <i className="fas fa-print"></i> In danh sách (A4)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL BÁO CÁO SUẤT ĂN BÊN CUNG CẤP ── */}
            {showSuatAnModal && (
                <div className="export-modal-overlay">
                    <div className="export-modal" style={{ maxWidth: 880, width: '95vw' }}>
                        <div className="export-modal-header" style={{ background: 'linear-gradient(90deg,#ea580c,#c2410c)' }}>
                            <div className="icon"><i className="fas fa-utensils"></i></div>
                            <div>
                                <h3>Tổng hợp Số lượng Suất ăn Bên Cung Cấp</h3>
                                <p>Báo cáo đối soát suất ăn hàng ngày theo tháng (Mẫu chuẩn có Quốc hiệu - Tiêu ngữ)</p>
                            </div>
                        </div>
                        <div className="export-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                            {/* Hàng chọn tháng & khoảng ngày đối soát */}
                            <div style={{ background: '#fff7ed', padding: '12px 14px', borderRadius: 8, border: '1px solid #fed7aa', marginBottom: 14 }}>
                                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ fontWeight: 700, fontSize: '0.88rem', color: '#9a3412', whiteSpace: 'nowrap' }}>
                                            <i className="fas fa-calendar-alt"></i> Tháng Báo Cáo:
                                        </label>
                                        <select
                                            className="export-modal-select"
                                            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #fdba74', fontWeight: 600 }}
                                            value={suatAnMonth}
                                            onChange={e => handleSuatAnMonthChange(Number(e.target.value), suatAnYear)}
                                        >
                                            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                                        </select>
                                        <span style={{ color: '#9a3412', fontWeight: 700 }}>/</span>
                                        <select
                                            className="export-modal-select"
                                            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #fdba74', fontWeight: 600 }}
                                            value={suatAnYear}
                                            onChange={e => handleSuatAnMonthChange(suatAnMonth, Number(e.target.value))}
                                        >
                                            {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option>; })}
                                        </select>
                                    </div>

                                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: '0.82rem', color: '#15803d', background: '#dcfce7', padding: '4px 10px', borderRadius: 20, fontWeight: 600, border: '1px solid #bbf7d0' }}>
                                            <i className="fas fa-lock" style={{ marginRight: 5 }}></i> Số liệu tự động lấy từ CSDL điểm danh (Cố định)
                                        </span>
                                    </div>
                                </div>

                                {/* Hàng chọn khoảng ngày đối soát thực tế */}
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed #fdba74' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>Từ ngày:</label>
                                        <input
                                            type="date"
                                            value={suatAnTuNgay}
                                            onChange={e => {
                                                setSuatAnTuNgay(e.target.value);
                                                fetchSuatAnData(suatAnMonth, suatAnYear, e.target.value, suatAnDenNgay);
                                            }}
                                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>Đến ngày:</label>
                                        <input
                                            type="date"
                                            value={suatAnDenNgay}
                                            onChange={e => {
                                                setSuatAnDenNgay(e.target.value);
                                                fetchSuatAnData(suatAnMonth, suatAnYear, suatAnTuNgay, e.target.value);
                                            }}
                                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => fetchSuatAnData(suatAnMonth, suatAnYear, suatAnTuNgay, suatAnDenNgay)}
                                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                        title="Tải lại số liệu điểm danh theo khoảng ngày"
                                    >
                                        <i className="fas fa-sync-alt" style={{ marginRight: 4 }}></i> Lấy số liệu
                                    </button>

                                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyRangePreset('week')}
                                            style={{ padding: '3px 8px', fontSize: '0.76rem', background: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            title="Tính theo tuần bán trú (nếu ngày 1 rơi vào giữa tuần, sẽ tính từ Thứ Hai ở tháng trước, ví dụ 30/9)"
                                        >
                                            <i className="fas fa-calendar-week" style={{ marginRight: 4 }}></i> Chu kỳ tuần (gồm ngày tháng cũ)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyRangePreset('month')}
                                            style={{ padding: '3px 8px', fontSize: '0.76rem', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            title="Tính đúng từ ngày 01 đến ngày cuối tháng"
                                        >
                                            <i className="fas fa-calendar-day" style={{ marginRight: 4 }}></i> Ngày 01 - cuối tháng
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginTop: 6, fontSize: '0.76rem', color: '#78350f', fontStyle: 'italic' }}>
                                    <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
                                    Khoảng thời gian: từ <strong>{formatDateDMY(suatAnTuNgay)}</strong> đến <strong>{formatDateDMY(suatAnDenNgay)}</strong>. 
                                    {suatAnTuNgay && !suatAnTuNgay.endsWith('-01') ? ' (Bao gồm các ngày bắt đầu từ tháng cũ theo chu kỳ)' : ''}
                                </div>
                            </div>

                            {/* Thống kê tóm tắt nhanh */}
                            {suatAnData && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Số ngày bán trú</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0ea5e9' }}>{suatAnRows.length} ngày</div>
                                    </div>
                                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#c2410c' }}>Tổng suất ăn tháng</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>
                                            {suatAnRows.reduce((s, r) => s + (Number(r.sl_suat_an) || 0), 0).toLocaleString('vi-VN')}
                                        </div>
                                    </div>
                                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Tổng lượt vắng (phép)</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
                                            {suatAnRows.reduce((s, r) => s + (Number(r.hs_phep) || 0), 0).toLocaleString('vi-VN')}
                                        </div>
                                    </div>
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#166534' }}>TB suất ăn / ngày</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                                            {suatAnRows.length > 0 ? Math.round(suatAnRows.reduce((s, r) => s + (Number(r.sl_suat_an) || 0), 0) / suatAnRows.length).toLocaleString('vi-VN') : 0}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Bảng xem trước & chỉnh sửa trực tiếp */}
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                        <i className="fas fa-table" style={{ color: '#ea580c', marginRight: 6 }}></i>
                                        BẢNG TỔNG HỢP SỐ LIỆU TỪ CSDL ĐIỂM DANH:
                                    </span>
                                    {suatAnLoading && <span style={{ fontSize: '0.82rem', color: '#ea580c' }}><i className="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...</span>}
                                </div>

                                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'center', fontWeight: 700, position: 'sticky', top: 0, zIndex: 2 }}>
                                                <th style={{ padding: '8px 4px', width: 50, borderRight: '1px solid #cbd5e1' }}>STT</th>
                                                <th style={{ padding: '8px 6px', width: 120, borderRight: '1px solid #cbd5e1' }}>NGÀY THÁNG</th>
                                                <th style={{ padding: '8px 6px', width: 130, borderRight: '1px solid #cbd5e1', color: '#ea580c' }}>SL SUẤT ĂN</th>
                                                <th style={{ padding: '8px 6px', width: 160, borderRight: '1px solid #cbd5e1', color: '#d97706' }}>HỌC SINH VẮNG (PHÉP)</th>
                                                <th style={{ padding: '8px 8px' }}>GHI CHÚ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {suatAnRows.map((row, idx) => (
                                                <tr key={row.stt || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                    <td style={{ textAlign: 'center', padding: '8px 4px', borderRight: '1px solid #e2e8f0', fontWeight: 600, color: '#64748b' }}>
                                                        {row.stt}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px 6px', borderRight: '1px solid #e2e8f0', fontWeight: 600 }}>
                                                        {row.ngay_format || row.ngay}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px 6px', borderRight: '1px solid #e2e8f0', fontWeight: 700, color: '#ea580c', fontSize: '0.95rem' }}>
                                                        {Number(row.sl_suat_an) > 0 ? Number(row.sl_suat_an).toLocaleString('vi-VN') : (row.sl_suat_an === 0 ? '0' : '')}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px 6px', borderRight: '1px solid #e2e8f0', fontWeight: 600, color: '#d97706', fontSize: '0.95rem' }}>
                                                        {Number(row.hs_phep) > 0 ? Number(row.hs_phep).toLocaleString('vi-VN') : (row.hs_phep === 0 ? '0' : '0')}
                                                    </td>
                                                    <td style={{ padding: '4px 6px' }}>
                                                        <input
                                                            type="text"
                                                            value={row.ghi_chu || ''}
                                                            placeholder="Ghi chú..."
                                                            onChange={e => handleSuatAnRowChange(idx, 'ghi_chu', e.target.value)}
                                                            style={{ width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff' }}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                            {suatAnRows.length === 0 && !suatAnLoading && (
                                                <tr>
                                                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                                                        Không có ngày bán trú nào trong khoảng thời gian ({formatDateDMY(suatAnTuNgay)} - {formatDateDMY(suatAnDenNgay)})
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {suatAnRows.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                                                    <td colSpan={2} style={{ textAlign: 'center', padding: '8px', borderRight: '1px solid #cbd5e1', textTransform: 'uppercase' }}>
                                                        TỔNG CỘNG
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px', borderRight: '1px solid #cbd5e1', color: '#ea580c', fontSize: '1rem' }}>
                                                        {suatAnRows.reduce((s, r) => s + (Number(r.sl_suat_an) || 0), 0).toLocaleString('vi-VN')}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px', borderRight: '1px solid #cbd5e1', color: '#d97706', fontSize: '1rem' }}>
                                                        {suatAnRows.reduce((s, r) => s + (Number(r.hs_phep) || 0), 0).toLocaleString('vi-VN')}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>

                            {/* Thông tin đơn vị & tiêu đề */}
                            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0', marginBottom: 10 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                                    <i className="fas fa-university" style={{ marginRight: 6 }}></i>
                                    THÔNG TIN ĐƠN VỊ BAN HÀNH (Góc trái trên cùng báo cáo):
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: 10 }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Cơ quan cấp trên:</label>
                                        <input
                                            type="text"
                                            value={suatAnSoGD}
                                            onChange={e => setSuatAnSoGD(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginTop: 3 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Tên trường / Đơn vị:</label>
                                        <input
                                            type="text"
                                            value={suatAnTenTruong}
                                            onChange={e => setSuatAnTenTruong(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700, marginTop: 3 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Bộ phận:</label>
                                        <input
                                            type="text"
                                            value={suatAnBoPhan}
                                            onChange={e => setSuatAnBoPhan(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginTop: 3 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Thông tin chữ ký 3 bên */}
                            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                                    <i className="fas fa-signature" style={{ marginRight: 6 }}></i>
                                    THÔNG TIN CHỮ KÝ 3 BÊN (In trên báo cáo):
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Người lập bảng:</label>
                                        <input
                                            type="text"
                                            value={suatAnNguoiLap}
                                            onChange={e => setSuatAnNguoiLap(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginTop: 3 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Đại diện công ty:</label>
                                        <input
                                            type="text"
                                            value={suatAnDaiDienCT}
                                            onChange={e => setSuatAnDaiDienCT(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginTop: 3 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Giám đốc:</label>
                                        <input
                                            type="text"
                                            value={suatAnGiamDoc}
                                            onChange={e => setSuatAnGiamDoc(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginTop: 3 }}
                                        />
                                    </div>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Địa danh / Ngày ký (dòng trên chức danh Giám đốc):</label>
                                    <input
                                        type="text"
                                        placeholder="Mặc định: Thành phố Hồ Chí Minh, ngày ... tháng ... năm ..."
                                        value={suatAnNgayKy}
                                        onChange={e => setSuatAnNgayKy(e.target.value)}
                                        style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.85rem', marginTop: 3 }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="export-modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowSuatAnModal(false)}>Đóng</button>
                            <button
                                className="btn btn-success"
                                onClick={exportSuatAnExcel}
                                disabled={suatAnRows.length === 0 || suatAnLoading}
                                style={{ background: '#10b981', borderColor: '#10b981' }}
                            >
                                <i className="fas fa-file-excel"></i> Xuất Excel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={exportSuatAnPDF}
                                disabled={suatAnRows.length === 0 || suatAnLoading}
                                style={{ background: '#ea580c', borderColor: '#ea580c' }}
                            >
                                <i className="fas fa-print"></i> In / Xuất PDF (A4)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
