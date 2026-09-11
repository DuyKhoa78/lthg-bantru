import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { cachedFetch } from '../../utils/cache';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import { removeAccents, formatLopList } from '../../utils/stringUtils';
import BaoPhepModal from '../../components/BaoPhepModal';
import QRScannerModal from '../../components/QRScannerModal';
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
    'phep': 2,
    'chua_diem_danh': 1,
};

const STATUS = {
    comat: { label: 'Có mặt', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
    vang: { label: 'Vắng', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
    phep: { label: 'Có phép', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
    chua_diem_danh: { label: 'Chưa quét', bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8' },
};
// Chuyển YYYY-MM-DD → DD/MM/YYYY
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const shiftDate = (baseIso, days) => {
    if (!baseIso) return '';
    const d = new Date(baseIso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};


export default function DiemDanhNgu() {
    const { user } = useAuth();
    const isGiaoVien = user?.role === 'giao_vien';

    // Lấy ngày hôm nay theo giờ máy (máy đặt đúng múi giờ Việt Nam)
    const todayVN = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const { showAlert, AlertUI } = useAlert();
    const [date, setDate] = useState(todayVN);

    // Live clock cho ca trực
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Khung giờ trực ca ngủ: 11h30 (690) -> 12h00 (720)
    const shiftTiming = useMemo(() => {
        const mins = currentTime.getHours() * 60 + currentTime.getMinutes();
        const start = 690;
        const end = 720;
        let state;
        let remainingMins = 0;
        if (mins < start) {
            state = 'sap_den';
        } else if (mins <= end) {
            state = 'dang_dien_ra';
            remainingMins = end - mins;
        } else {
            state = 'da_qua_gio';
        }
        return { state, remainingMins, startLabel: '11:30', endLabel: '12:00' };
    }, [currentTime]);

    // Kiểm tra khung giờ điểm danh
    const isAllowedTime = useCallback(() => {
        if (user?.is_admin || user?.is_superuser) return true;
        const mins = currentTime.getHours() * 60 + currentTime.getMinutes();
        if (isGiaoVien) {
            return mins >= 690 && mins <= 720; // 11:30 - 12:00
        }
        return mins >= 660 && mins <= 840; // Học vụ: 11:00 - 14:00
    }, [user, isGiaoVien, currentTime]);

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

    // QR & Data Resilience States
    const [showQRModal, setShowQRModal] = useState(false);
    const [showChotConfirmModal, setShowChotConfirmModal] = useState(false);
    const [chotting, setChotting] = useState(false);
    const [draftRestoredMsg, setDraftRestoredMsg] = useState(null);
    const [lastLocalSaveTime, setLastLocalSaveTime] = useState(null);
    const [lastSyncedTime, setLastSyncedTime] = useState(null);
    const [assignedRoomCodes, setAssignedRoomCodes] = useState(null);
    const [phongStatuses, setPhongStatuses] = useState([]);

    const [showActions, setShowActions] = useState(false);
    const [showBaoPhepModal, setShowBaoPhepModal] = useState(false);

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
    const [exportT6, setExportT6] = useState(false);               // T6 for that week
    const [exportRooms, setExportRooms] = useState([]);

    const [nguoiPhuTrach, setNguoiPhuTrach] = useState('Người phụ trách');
    const [namHocCauHinh, setNamHocCauHinh] = useState('2026-2027');


    // Load phòng & học sinh
    useEffect(() => {
        Promise.all([
            api.get('/api/phong/ngu').then(r => r.data?.phong || []),
            cachedFetch('cache_hocsinh_ngu', () => api.get('/api/hocsinh/ngu').then(r => r.data?.hocsinh || [])),
            cachedFetch('cache_cauhinh', () => api.get('/api/cauhinh/').then(r => r.data?.he_thong || null), 60 * 60 * 1000),
        ]).then(([phong, { data: hs }, { data: cauhinh }]) => {
            if (phong) setPhongList(phong);
            if (hs) setHsList(hs);
            if (cauhinh) {
                setNguoiPhuTrach(cauhinh.nguoi_phu_trach || 'Người phụ trách');
                setNamHocCauHinh(cauhinh.nam_hoc || '2026-2027');
            }
        }).catch(console.error);
    }, []);

    // Abort controller ref để hủy request cũ khi có request mới (tránh race condition)
    const fetchAbortRef = useRef(null);

    // Fetch lịch sử điểm danh theo ngày
    const fetchDiemDanh = useCallback(async (d, silent = false) => {
        // Hủy request cũ nếu đang chạy
        if (fetchAbortRef.current) fetchAbortRef.current.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;

        if (!silent) setLoading(true);
        setOverrides({});
        setSaved(false);
        try {
            const res = await api.get(`/api/diemdanh/?ngay=${d}&loai=ngu`, { signal: controller.signal });
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
                if (res.data.phong_statuses) setPhongStatuses(res.data.phong_statuses);
                if (res.data.assigned_rooms !== undefined) setAssignedRoomCodes(res.data.assigned_rooms);
            }
        } catch (err) {
            if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDiemDanh(date);
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
            // Lọc theo ngày đang xem: chỉ hiển thị học sinh đang tham gia bán trú vào ngày này
            if (hs.ngay_vao && date < hs.ngay_vao) return false;
            if (hs.ngay_rut && date > hs.ngay_rut) return false;
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
        return [...base, ...extraFiltered].sort((a, b) => Number(a.id) - Number(b.id));
    }, [hsList, extraHsList, phongTamNgu, cauhinhNgay, isHsAllowed, phongList, date]);

    const visiblePhongList = useMemo(() => {
        let list = phongList;
        if (cauhinhNgay) {
            const overrideCodes = extraHsList.filter(x => x.phong_ngu).map(x => x.phong_ngu);
            const groupCodes = cauhinhNgay.lop_phong_ngu ? Object.values(cauhinhNgay.lop_phong_ngu) : [];
            const allCodes = [...new Set([phongTamNgu, ...overrideCodes, ...groupCodes])].filter(Boolean);
            
            if (allCodes.length > 0) {
                const result = allCodes.map(code => phongList.find(p => p.ma_phong === code)).filter(Boolean);
                if (result.length > 0) list = result;
            } else {
                const filtered = phongList.filter(p => getStudentsForRoom(p.ma_phong).length > 0);
                list = filtered.length > 0 ? filtered : phongList;
            }
        }
        // Đối với Giáo viên: Khóa chỉ hiển thị phòng được phân công trực
        if (isGiaoVien && Array.isArray(assignedRoomCodes)) {
            list = list.filter(p => assignedRoomCodes.includes(p.ma_phong));
        }
        return list;
    }, [phongList, phongTamNgu, cauhinhNgay, extraHsList, getStudentsForRoom, isGiaoVien, assignedRoomCodes]);

    // Derive selectedPhong từ visiblePhongList và selectedPhongCode
    const selectedPhong = useMemo(() => {
        if (visiblePhongList.length === 0) return null;
        return visiblePhongList.find(p => p.ma_phong === selectedPhongCode) || visiblePhongList[0];
    }, [visiblePhongList, selectedPhongCode]);

    // Tự động phục hồi bản nháp (LocalStorage + Server Draft) khi đổi phòng hoặc đổi ngày
    useEffect(() => {
        if (!selectedPhong) return;
        const localKey = `bantru_draft_${date}_ngu_${selectedPhong.ma_phong}`;
        let localItems = [];
        try {
            const cached = localStorage.getItem(localKey);
            if (cached) localItems = JSON.parse(cached);
        } catch (e) {
            console.warn('Local storage draft read error:', e);
        }

        api.get(`/api/diemdanh/draft/?ngay=${date}&loai_truc=1&ma_phong_id=${selectedPhong.ma_phong}`)
            .then(r => {
                const serverItems = r.data?.draft?.danh_sach_hs || [];
                const merged = {};
                serverItems.forEach(s => { merged[s.id] = s; });
                localItems.forEach(s => { merged[s.id] = s; }); // local có ưu tiên ghi đè nếu mới hơn
                const list = Object.values(merged);
                if (list.length > 0) {
                    const newOverrides = {};
                    list.forEach(s => {
                        if (s.status === 0) newOverrides[s.id] = 'comat';
                    });
                    setOverrides(prev => ({ ...prev, ...newOverrides }));
                    const validScannedCount = list.filter(x => x.status === 0).length;
                    if (validScannedCount > 0) {
                        setDraftRestoredMsg(`Đã bảo toàn dữ liệu nháp (${validScannedCount} học sinh đã quét)`);
                        setTimeout(() => setDraftRestoredMsg(null), 3500);
                    }
                }
            })
            .catch(() => {});
    }, [selectedPhong, date]);

    // Trạng thái chốt phòng hiện tại
    const currentPhongStatus = useMemo(() => {
        if (!selectedPhong) return null;
        return phongStatuses.find(ps => ps.ma_phong_id === selectedPhong.ma_phong);
    }, [phongStatuses, selectedPhong]);

    const isDaChot = currentPhongStatus?.trang_thai_chot === 'da_chot' || Boolean(currentPhongStatus?.da_diem_danh);

    // Logic hiển thị học sinh theo phòng đang chọn - Luôn sort mã bán trú tăng dần
    const students = useMemo(() => {
        if (!selectedPhong) return [];
        return getStudentsForRoom(selectedPhong.ma_phong)
            .sort((a, b) => Number(a.id) - Number(b.id))
            .map(s => {
                let st = overrides[s.id];
                if (st === undefined) {
                    if (diemDanhDb[s.id] !== undefined && diemDanhDb[s.id] !== null) {
                        st = STATUS_MAP[diemDanhDb[s.id]];
                    } else {
                        st = isDaChot ? 'comat' : 'chua_diem_danh';
                    }
                }
                return {
                    ...s,
                    trang_thai: st,
                };
            });
    }, [selectedPhong, diemDanhDb, overrides, getStudentsForRoom, isDaChot]);

    const scannedIds = useMemo(() => new Set(students.filter(s => s.trang_thai === 'comat').map(s => s.id)), [students]);

    // Xác nhận học sinh từ camera quét mã QR (Zero data loss)
    const handleConfirmStudent = (student) => {
        setOverrides(prev => {
            const next = { ...prev, [student.id]: 'comat' };

            // Lưu tức thì vào LocalStorage
            if (selectedPhong) {
                const localKey = `bantru_draft_${date}_ngu_${selectedPhong.ma_phong}`;
                const draftList = students.map(s => {
                    const st = (s.id === student.id) ? 'comat' : (next[s.id] ?? (diemDanhDb[s.id] !== undefined ? STATUS_MAP[diemDanhDb[s.id]] : 'comat'));
                    if (st === 'comat') {
                        return { id: s.id, ho_ten: s.ho_ten, lop: s.lop, status: 0, scanned_at: new Date().toISOString(), phuong_thuc: 'qr' };
                    }
                    return null;
                }).filter(Boolean);

                try {
                    localStorage.setItem(localKey, JSON.stringify(draftList));
                    setLastLocalSaveTime(new Date());
                } catch (err) {
                    console.warn('LocalStorage save error:', err);
                }

                // Đồng bộ nền lên server draft
                api.post('/api/diemdanh/draft-sync/', {
                    ngay: date,
                    loai_truc: 1,
                    ma_phong_id: selectedPhong.ma_phong,
                    danh_sach_hs: draftList
                }).then(r => {
                    if (r.data?.ok) setLastSyncedTime(new Date());
                }).catch(err => {
                    console.warn('Draft sync to server error:', err);
                });
            }

            return next;
        });
    };

    // Chốt dữ liệu phòng lên Tổng
    const handleChotPhong = async () => {
        if (!selectedPhong || students.length === 0) return;

        // Những học sinh chưa điểm danh sẽ tự động ghi nhận là VẮNG (status: 1)
        const updatedOverrides = {};
        const danhSachHs = students.map(s => {
            const isUnchecked = s.trang_thai === 'chua_diem_danh' || !s.trang_thai;
            if (isUnchecked) {
                updatedOverrides[s.id] = 'vang';
            }
            const finalSt = isUnchecked ? 1 : (INV_STATUS_MAP[s.trang_thai] ?? 1);
            return {
                id: s.id,
                ho_ten: s.ho_ten,
                lop: s.lop,
                status: finalSt,
                phuong_thuc: 'thu_cong'
            };
        });

        if (Object.keys(updatedOverrides).length > 0) {
            setOverrides(prev => ({ ...prev, ...updatedOverrides }));
        }

        setChotting(true);
        try {
            const res = await api.post('/api/diemdanh/chot-phong/', {
                ngay: date,
                loai_truc: 1,
                ma_phong_id: selectedPhong.ma_phong,
                danh_sach_hs: danhSachHs,
                ghi_chu: isDaChot ? 'Cập nhật bổ sung' : 'Chốt điểm danh phòng thành công'
            });

            if (res.data?.ok) {
                const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                showAlert(res.data.message || `Đã chốt danh sách phòng ${selectedPhong.ma_phong} lúc ${timeStr} thành công!`, 'success');
                setShowChotConfirmModal(false);
                setOverrides({});
                await fetchDiemDanh(date, true);
            }
        } catch (err) {
            showAlert(err.response?.data?.error || 'Lỗi khi chốt điểm danh lên Tổng', 'danger');
        } finally {
            setChotting(false);
        }
    };

    const otherRoomMatches = useMemo(() => {
        if (!searchTerm || !searchTerm.trim() || searchTerm.trim().length < 2) return [];
        const term = removeAccents(searchTerm.toLowerCase().trim());
        return hsList.filter(s => {
            const ph = s.phong_ngu;
            if (!ph || (selectedPhong && ph === selectedPhong.ma_phong)) return false;
            return removeAccents(s.ho_ten.toLowerCase()).includes(term) || String(s.id).includes(term);
        }).slice(0, 5);
    }, [searchTerm, hsList, selectedPhong]);

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
        if (!isAllowedTime()) {
            return showAlert('Học vụ chỉ có thể điểm danh từ lúc 11:00 đến 14:00. Ngoài khung giờ này, vui lòng liên hệ Admin!', 'warning');
        }
        setSaving(true);
        try {
            const records = students.map(s => ({
                ma_hs: s.id,
                ngay: date,
                status: INV_STATUS_MAP[s.trang_thai],
            }));
            await api.post('/api/diemdanh/save/', { loai: 'ngu', records });

            // Optimistic update: cập nhật diemDanhDb ngay lập tức để UI hiển thị ✓ mà không chờ fetch
            setDiemDanhDb(prev => {
                const next = { ...prev };
                records.forEach(r => { next[r.ma_hs] = r.status; });
                return next;
            });
            setOverrides({});
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            // Fetch lại từ DB để đồng bộ dữ liệu chính xác (silent, không block UI)
            await fetchDiemDanh(date, true); // reload from DB
        } catch (err) {
            showAlert(err.response?.data?.error || 'Lỗi khi lưu điểm danh');
        } finally {
            setSaving(false);
        }
    };

    const counts = students.reduce((acc, s) => { acc[s.trang_thai] = (acc[s.trang_thai] || 0) + 1; return acc; }, {});

    // ── Hàm chia danh sách HS theo số GV điểm danh: sort theo thứ tự mã bán trú từ trên xuống, chia đều ra khi đủ số lượng ──
    const splitByTeachers = (students, numTeachers) => {
        if (!numTeachers || numTeachers <= 1) return [students];
        const sorted = [...students].sort((a, b) => Number(a.id) - Number(b.id));
        const total = sorted.length;
        const groups = [];
        let start = 0;
        for (let i = 0; i < numTeachers; i++) {
            const count = Math.floor(total / numTeachers) + (i < (total % numTeachers) ? 1 : 0);
            if (count > 0) {
                groups.push(sorted.slice(start, start + count));
                start += count;
            }
        }
        return groups.filter(g => g.length > 0);
    };

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
<div style="margin-top: 10px; margin-bottom: 12px; font-size: 9.5pt; line-height: 1.45; text-align: left;">
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
    const getWeekDays = (baseDate, inclT6) => {
        const d = new Date(baseDate + 'T00:00:00');
        const dow = d.getDay();
        const monday = addDaysLocal(d, dow === 0 ? -6 : 1 - dow);
        return [0, 1, 2, 3, 4].map(i => addDaysLocal(monday, i))
            .filter(day => day.getDay() !== 5 || inclT6);
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
        setExportSelectedWeek(0);
        setExportT6(false);
    }, [weekLabelsForModal]);

    // Auto-detect tuần hiện tại khi mở modal
    useEffect(() => {
        if (!showMonthExportModal) return;
        const d = new Date(date + 'T00:00:00');
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        setExportMonth(m);
        setExportYear(y);
        const allMons = computeWeekMondayStrs(m, y);
        const dow = d.getDay() || 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
        const monStr = mon.getFullYear() + '-' + p2(mon.getMonth() + 1) + '-' + p2(mon.getDate());
        const idx = allMons.indexOf(monStr);
        setExportSelectedWeek(idx >= 0 ? idx : 0);
        setExportT6(false);
        if (exportRooms.length === 0 && phongList.length > 0) {
            setExportRooms(phongList.map(p => p.ma_phong));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMonthExportModal, date, phongList]);

    // ── XUẤT EXCEL THEO TUẦN (NGỦ) ───────────────────────────────────
    const exportWeekExcel = async () => {
        if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
        const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
        const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT6);
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
            const roomStudents = getStudentsForRoom(ma_phong).sort((a, b) => Number(a.id) - Number(b.id));
            const h1 = ['STT', 'Mã\nsố BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'P.\nNGỦ', 'P.\nĂN'];
            const h2 = ['', '', '', '', '', '', ''];
            weekDays.forEach(d => { h1.push(`${d.getDate()}/${d.getMonth() + 1}`); h2.push(`T${d.getDay() === 0 ? 'CN' : d.getDay() + 1}`); });
            h1.push('Ghi\nchú'); h2.push('');

            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;

            if (numTeachers > 1) {
                const chunks = splitByTeachers(roomStudents, numTeachers);
                chunks.forEach((chunk, pageIdx) => {
                    const offset = chunks.slice(0, pageIdx).reduce((acc, c) => acc + c.length, 0);
                    const aoa = [
                        ['Phân hiệu THPT Lê Thị Hồng Gấm', '', '', 'ĐIỂM DANH NGHỈ TRƯA', ...Array(NC - 4).fill('')],
                        ['', '', '', '3 KHỐI', ...Array(NC - 4).fill('')],
                        ['', '', '', `NH: ${namHocCauHinh}`, ...Array(NC - 4).fill('')],
                        [`${weekLabel} (Tờ ${pageIdx + 1}/${chunks.length})`, '', '', LUU_Y_NGU, ...Array(NC - 4).fill('')],
                        Array(NC).fill(''), h1, h2,
                    ];
                    chunk.forEach((s, i) => {
                        const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                        const dayCells = weekDays.map(d => getSym(s.id, d));
                        aoa.push([offset + i + 1, s.id, s.ho_ten, gt, s.lop, s.phong_ngu || ma_phong, s.phong_an || '', ...dayCells, '']);
                    });
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    ws['!cols'] = [{ wch: 5 }, { wch: 9 }, { wch: 28 }, { wch: 5 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, ...Array(numDays).fill({ wch: 5 }), { wch: 12 }];
                    ws['!merges'] = [
                        { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }, { s: { r: 0, c: 3 }, e: { r: 0, c: NC - 1 } },
                        { s: { r: 1, c: 3 }, e: { r: 1, c: NC - 1 } }, { s: { r: 2, c: 3 }, e: { r: 2, c: NC - 1 } },
                        { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }, { s: { r: 3, c: 3 }, e: { r: 3, c: NC - 1 } },
                    ];
                    XLSX.utils.book_append_sheet(wb, ws, `Phong_${ma_phong}_To${pageIdx + 1}`);
                });
            } else {
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
            }
        });
        XLSX.writeFile(wb, `DiemDanhNgu_Tuan${exportSelectedWeek + 1}_Thang${exportMonth}_${exportYear}.xlsx`);
        setShowMonthExportModal(false);
    };


    // ── XUẤT PDF THEO TUẦN (NGỦ) ─────────────────────────────────────
    const exportWeekPDF = async () => {
        if (exportRooms.length === 0) return showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning');
        const allWeekMons = computeWeekMondayStrs(exportMonth, exportYear);
        const weekDays = getWeekDays(allWeekMons[exportSelectedWeek], exportT6);
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
        const htmlPages = exportRooms.flatMap(ma_phong => {
            const roomStudents = getStudentsForRoom(ma_phong).sort((a, b) => Number(a.id) - Number(b.id));
            const phongInfo = phongList.find(p => p.ma_phong === ma_phong);
            const numTeachers = phongInfo?.sl_diem_danh || 1;
            const total10 = roomStudents.filter(s => s.lop?.startsWith('10')).length;
            const total11 = roomStudents.filter(s => s.lop?.startsWith('11')).length;
            const total12 = roomStudents.filter(s => s.lop?.startsWith('12')).length;

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

            // Chia danh sách theo số GV điểm danh (sort theo mã bán trú từ trên xuống, chia đều ra)
            const chunks = splitByTeachers(roomStudents, numTeachers);
            const totalPages = chunks.length;

            // Tính offset STT toàn phòng
            const offsets = [];
            let off = 0;
            chunks.forEach(chunk => {
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
<div style="margin-top: 10px; margin-bottom: 12px; font-size: 9.5pt; line-height: 1.45; text-align: left;">
  <div>* Danh sách có TC: <strong>${roomStudents.length} HS</strong>${totalPages > 1 ? ` &nbsp;|&nbsp; Tờ này: <strong>${chunk.length} HS</strong>` : ''}</div>
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
    <div style="font-style: italic; font-size: 9.5pt; height: 19px; line-height: 19px;">${todayLabel()}</div>
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
                    {!isGiaoVien && (
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setShowBaoPhepModal(true)}
                            style={{
                                color: '#d97706', borderColor: '#fde68a', background: '#fffbeb',
                                fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6
                            }}
                        >
                            <i className="fas fa-calendar-check" style={{ color: '#f59e0b' }}></i> Báo phép trước
                        </button>
                    )}
                    {!isGiaoVien && (
                        <div className="dd-export-btn-group">
                            <button className="btn btn-outline btn-sm" onClick={() => setShowActions(!showActions)}>
                                <i className="fas fa-print"></i> Xuất dữ liệu <i className="fas fa-caret-down" style={{ marginLeft: 4 }}></i>
                            </button>
                            <div className={`dd-export-menu ${showActions ? 'open' : ''}`} style={{ minWidth: 200 }}>
                                <button className="dd-export-item" onClick={() => { exportOneDayPDF(); setShowActions(false); }}>
                                    <i className="fas fa-file-invoice" style={{ color: '#0ea5e9', width: 20, textAlign: 'center' }}></i> {cauhinhNgay ? 'In ngày đặc biệt' : 'In danh sách ngày (PDF)'}
                                </button>
                                <button className="dd-export-item" onClick={() => { setShowMonthExportModal(true); setShowActions(false); }}>
                                    <i className="fas fa-file-pdf" style={{ color: '#6c5ce7', width: 20, textAlign: 'center' }}></i> In DS (Tuần)
                                </button>
                            </div>
                        </div>
                    )}
                    {hasSchedule && (
                        <>
                            {!isAllowedTime() && (
                                <span style={{ fontSize: '0.78rem', color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '5px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                                    <i className="fas fa-clock" style={{ color: '#d97706' }}></i> Khung giờ điểm danh: <strong>{isGiaoVien ? '11h30 – 12h00' : '11h00 – 14h00'}</strong>
                                </span>
                            )}
                            {!isGiaoVien && (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setAll('comat')} style={{ color: '#16a34a', fontWeight: 600 }} title="Đặt tất cả học sinh trong phòng là Có mặt">
                                        <i className="fas fa-check-double"></i> Tất cả Có mặt
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setAll('vang')} style={{ color: '#dc2626' }} title="Đặt tất cả học sinh trong phòng là Vắng">
                                        <i className="fas fa-times"></i> Tất cả Vắng
                                    </button>
                                </>
                            )}
                            {!isGiaoVien && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    {isDaChot && (
                                        <span style={{
                                            background: '#ecfdf5',
                                            color: '#065f46',
                                            border: '1.5px solid #a7f3d0',
                                            padding: '6px 14px',
                                            borderRadius: 8,
                                            fontSize: '0.84rem',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6
                                        }}>
                                            <i className="fas fa-check-circle" style={{ color: '#059669' }}></i>
                                            ĐÃ CHỐT {currentPhongStatus?.thoi_gian ? `(${new Date(currentPhongStatus.thoi_gian).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})})` : ''}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleChotPhong}
                                        disabled={!selectedPhong || chotting}
                                        style={{
                                            background: isDaChot ? '#059669' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                                            borderColor: isDaChot ? '#047857' : '#1d4ed8',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            boxShadow: isDaChot ? '0 2px 8px rgba(5, 150, 105, 0.25)' : '0 2px 8px rgba(37, 99, 235, 0.25)'
                                        }}
                                        title="Chốt danh sách phòng này lên hệ thống"
                                    >
                                        {chotting ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${isDaChot ? 'fa-check-double' : 'fa-paper-plane'}`}></i>}
                                        {chotting ? ' Đang chốt...' : isDaChot ? ' Cập nhật chốt danh sách' : ' Chốt danh sách'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {!isGiaoVien && hasSchedule && (
                <div className="stat-cards-row" style={{ marginBottom: 18 }}>
                    <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>Có mặt</p><h3>{counts.comat || 0}</h3></div></div>
                    <div className="stat-card red"><div className="stat-card-icon"><i className="fas fa-times-circle"></i></div><div className="stat-card-info"><p>Vắng</p><h3>{counts.vang || 0}</h3></div></div>
                    <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-file-alt"></i></div><div className="stat-card-info"><p>Có phép</p><h3>{counts.phep || 0}</h3></div></div>
                </div>
            )}

            <div className="dd-layout">
                <aside className="dd-room-panel">
                    <div className="dd-room-panel-header" style={{ background: panelGrad }}>
                        <i className="fas fa-bed"></i> Phòng ngủ
                    </div>
                    <div className="dd-date-picker">
                        <label><i className="fas fa-calendar-day" style={{ color: '#6c5ce7', marginRight: 4 }}></i> Chọn ngày điểm danh</label>
                        <div className="dd-date-input-wrapper" title="Bấm để chọn ngày trên lịch" onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch { /* unsupported */ } } }}>
                            <span className="dd-date-display">{fmtDate(date)}</span>
                            <i className="far fa-calendar-alt dd-date-icon"></i>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="dd-date-native-input"
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <button
                                type="button"
                                style={{
                                    flex: '0 0 32px', height: 28, borderRadius: 6,
                                    border: '1px solid #cbd5e1', background: '#fff',
                                    color: '#475569', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem'
                                }}
                                title="Ngày trước"
                                onClick={() => setDate(shiftDate(date, -1))}
                            >
                                <i className="fas fa-chevron-left"></i>
                            </button>
                            <button
                                type="button"
                                style={{
                                    flex: 1, height: 28, borderRadius: 6,
                                    border: '1px solid #cbd5e1', background: '#fff',
                                    color: '#6c5ce7', cursor: 'pointer', fontSize: '0.78rem',
                                    fontWeight: 700
                                }}
                                onClick={() => setDate(todayVN())}
                            >
                                Hôm nay
                            </button>
                            <button
                                type="button"
                                style={{
                                    flex: '0 0 32px', height: 28, borderRadius: 6,
                                    border: '1px solid #cbd5e1', background: '#fff',
                                    color: '#475569', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem'
                                }}
                                title="Ngày sau"
                                onClick={() => setDate(shiftDate(date, 1))}
                            >
                                <i className="fas fa-chevron-right"></i>
                            </button>
                        </div>
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
                        <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 8, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ fontSize: '4rem', color: '#cbd5e1', marginBottom: 16 }}><i className="fas fa-calendar-times"></i></div>
                            <h3 style={{ color: '#475569', fontSize: '1.4rem', marginBottom: 8 }}>Không có lịch bán trú</h3>
                            <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: 460 }}>Ngày <b>{fmtDate(date)}</b> không có phân công trực, học sinh nghỉ bán trú.</p>
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
                            </div>                            {/* ── THÔNG BÁO CA TRỰC & BẢO TOÀN DỮ LIỆU DÀNH CHO GIÁO VIÊN ── */}
                            {selectedPhong && isGiaoVien && (
                                <>
                                    <div className={`dd-shift-banner ${shiftTiming.state === 'dang_dien_ra' ? 'active' : 'pending'}`}>
                                        <div>
                                            <div className="dd-shift-banner-title">
                                                <span>🟢 CA TRỰC NGỦ ({shiftTiming.startLabel} – {shiftTiming.endLabel})</span>
                                            </div>
                                            <div className="dd-shift-banner-time">
                                                <span>Đồng hồ: <strong>{currentTime.toLocaleTimeString('vi-VN')}</strong> • Khung giờ ca trực: <strong>{shiftTiming.startLabel} – {shiftTiming.endLabel}</strong></span>
                                            </div>
                                        </div>

                                        <div className="dd-persistence-indicator" title={`Dữ liệu lưu an toàn trên máy ${lastLocalSaveTime ? `(Lưu lúc ${lastLocalSaveTime.toLocaleTimeString('vi-VN')})` : ''}${lastSyncedTime ? ` • Đã đồng bộ máy chủ (${lastSyncedTime.toLocaleTimeString('vi-VN')})` : ''}`}>
                                            <i className="fas fa-shield-alt" style={{ color: '#16a34a' }}></i>
                                            <span>Đã bảo toàn dữ liệu {lastLocalSaveTime ? `(Lưu lúc ${lastLocalSaveTime.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})})` : ''}</span>
                                        </div>
                                    </div>

                                    {draftRestoredMsg && (
                                        <div style={{ background: '#eff6ff', border: '1.5px solid #60a5fa', color: '#1d4ed8', padding: '10px 16px', borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                                            <i className="fas fa-history" style={{ fontSize: '1.2rem' }}></i>
                                            <span>{draftRestoredMsg}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── NÚT QUÉT QR & THAO TÁC DÀNH CHO GIÁO VIÊN ── */}
                            {selectedPhong && isGiaoVien && (
                                <div className="dd-teacher-actions-bar">
                                    <button
                                        type="button"
                                        className="dd-qr-scan-btn"
                                        style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)', boxShadow: '0 4px 14px rgba(108,92,231,0.35)' }}
                                        onClick={() => setShowQRModal(true)}
                                    >
                                        <i className="fas fa-qrcode"></i>
                                        {isDaChot ? 'Quét bổ sung HS đến muộn' : 'Quét mã QR thẻ học sinh'}
                                    </button>

                                    {!isDaChot && (
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => setAll('comat')}
                                            style={{ fontWeight: 700, padding: '7px 14px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#86efac', color: '#166534', background: '#f0fdf4' }}
                                            title="Đánh dấu tất cả học sinh trong phòng có mặt"
                                        >
                                            <i className="fas fa-check-double"></i> Tất cả có mặt
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        style={{ fontWeight: 600, padding: '7px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#a78bfa', color: '#5b21b6', background: '#f5f3ff' }}
                                        onClick={handleSave}
                                        disabled={saving}
                                        title="Lưu tạm thời dữ liệu điểm danh"
                                    >
                                        {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${saved ? 'fa-check' : 'fa-save'}`}></i>}
                                        {saved ? ' Đã lưu tạm!' : saving ? ' Đang lưu...' : ' Lưu tạm dữ liệu'}
                                    </button>

                                    {isDaChot && (
                                        <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '6px 14px', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <i className="fas fa-check-circle"></i>
                                            ĐÃ ĐƯỢC ADMIN CHỐT SỔ {currentPhongStatus?.thoi_gian ? `(${new Date(currentPhongStatus.thoi_gian).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})})` : ''}
                                        </span>
                                    )}
                                </div>
                            )}

                            {otherRoomMatches.length > 0 && (
                                <div style={{
                                    background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8,
                                    padding: '8px 14px', marginBottom: 12, fontSize: '0.88rem', color: '#5b21b6',
                                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8
                                }}>
                                    <i className="fas fa-info-circle" style={{ color: '#7c3aed', fontSize: '1rem' }}></i>
                                    <span>Tìm thấy ở phòng khác:</span>
                                    {otherRoomMatches.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            style={{
                                                background: '#fff', border: '1px solid #c4b5fd', borderRadius: 6,
                                                padding: '4px 10px', fontSize: '0.82rem', color: '#6d28d9', cursor: 'pointer',
                                                fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                            onClick={() => {
                                                const target = visiblePhongList.find(p => p.ma_phong === m.phong_ngu);
                                                if (target) setSelectedPhongCode(target.ma_phong);
                                            }}
                                        >
                                            <span style={{ fontWeight: 700 }}>{(m.ho_ten || '').normalize('NFC')}</span>
                                            <span style={{ fontWeight: 500 }}>({m.lop}) – Phòng</span>
                                            <span style={{ fontWeight: 700 }}>{m.phong_ngu}</span>
                                            <i className="fas fa-arrow-right" style={{ fontSize: '0.75rem' }}></i>
                                        </button>
                                    ))}
                                </div>
                            )}

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
                                                style={{ background: STATUS[s.trang_thai]?.bg || '#fff', borderColor: STATUS[s.trang_thai]?.border || '#e2e8f0' }}>
                                                <div className="dd-student-info">
                                                    <span className="dd-student-name">{(s.ho_ten || '').normalize('NFC')}</span>
                                                    <span className="dd-student-class"><b style={{ color: '#6c5ce7', marginRight: 4 }}>MSBT: 26{String(s.id).padStart(3, '0')}</b> • {s.lop}</span>
                                                </div>

                                                <div className="dd-status-btns">
                                                    {['comat', 'vang', 'phep'].map(key => {
                                                        const val = STATUS[key];
                                                        return (
                                                            <button key={key}
                                                                className={`dd-status-btn${s.trang_thai === key ? ' active' : ''}`}
                                                                style={s.trang_thai === key ? { background: val.dot, color: '#fff', border: `1.5px solid ${val.dot}`, boxShadow: `0 2px 8px ${val.dot}66` } : {}}
                                                                onClick={() => changeStatus(s.id, key)} title={val.label}>
                                                                {key === 'comat' ? <i className="fas fa-check"></i> : key === 'vang' ? <i className="fas fa-times"></i> : <i className="fas fa-file-alt"></i>}
                                                            </button>
                                                        );
                                                    })}
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
                                        <span className="dd-summary-item"><span className="dd-summary-dot dot-phep"></span> Có phép: <strong>{counts.phep || 0}</strong></span>
                                    </div>
                                    <div className="dd-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                                        <div className="dd-footer-note" style={{ flex: '1 1 300px' }}>
                                            {isGiaoVien ? (
                                                <span><i className="fas fa-shield-alt"></i> Dữ liệu điểm danh của Thầy/Cô được lưu tạm thời. Ban quản lý (Admin) sẽ kiểm tra và chốt danh sách chính thức.</span>
                                            ) : (
                                                <span><i className="fas fa-info-circle"></i> Bấm <strong>Chốt danh sách</strong> để hoàn tất điểm danh phòng này và tự động ghi nhận vắng cho học sinh chưa điểm danh.</span>
                                            )}
                                        </div>
                                        {!isGiaoVien && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    onClick={handleSave}
                                                    disabled={saving || chotting}
                                                    style={{ fontWeight: 600, padding: '9px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                    title="Lưu tạm thời dữ liệu điểm danh mà chưa chốt sổ"
                                                >
                                                    <i className={`fas ${saved ? 'fa-check' : 'fa-save'}`}></i>
                                                    {saved ? ' Đã lưu tạm!' : saving ? ' Đang lưu...' : ' Lưu tạm'}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    onClick={() => setShowChotConfirmModal(true)}
                                                    disabled={chotting || saving}
                                                    style={{ fontWeight: 700, padding: '9px 20px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}
                                                >
                                                    {chotting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-clipboard-check"></i>}
                                                    {isDaChot ? ' Cập nhật chốt danh sách' : ' Chốt danh sách'}
                                                </button>

                                                {isDaChot && (
                                                    <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '6px 14px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        <i className="fas fa-check-circle"></i> ĐÃ CHỐT LÊN TỔNG
                                                    </span>
                                                )}
                                            </div>
                                        )}
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
                                                    onChange={() => { setExportSelectedWeek(wIndex); setExportT6(false); }} />
                                                <span style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{lbl.split(':')[0]}</span>
                                                    <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 4, color: sel ? '#6c5ce7' : '#94a3b8' }}>{lbl.split(': ')[1]}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* DẠY BÙ T6 */}
                            <div className="export-modal-group">
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none',
                                    padding: '8px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#f8fafc'
                                }}>
                                    <input type="checkbox" checked={exportT6} style={{ accentColor: '#10b981' }}
                                        onChange={e => setExportT6(e.target.checked)} />
                                    <span style={{ fontWeight: 600, color: '#10b981' }}>
                                        <i className="fas fa-calendar-plus"></i> Tuần này có dạy bù Thứ Sáu (T6)
                                    </span>
                                </label>
                            </div>

                            {/* Ghi chú chia tờ theo GV điểm danh */}
                            <div style={{ padding: '6px 10px', borderRadius: 7, background: '#f0eeff', border: '1px solid #ddd6fe', fontSize: '0.83rem', color: '#5b21b6' }}>
                                <i className="fas fa-info-circle"></i> Sẽ chia tờ theo <strong>số GV điểm danh</strong> của từng phòng, sắp xếp theo mã bán trú từ trên xuống và chia đều số lượng.
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

            <BaoPhepModal
                open={showBaoPhepModal}
                onClose={() => setShowBaoPhepModal(false)}
                defaultDate={date}
                defaultLoai="ca_ngay"
                students={hsList}
                onSuccess={() => fetchDiemDanh(date, true)}
            />

            {/* Modal Quét mã QR */}
            <QRScannerModal
                isOpen={showQRModal}
                onClose={() => setShowQRModal(false)}
                roomStudents={students}
                allStudents={hsList}
                currentRoomName={selectedPhong ? `Phòng ${selectedPhong.ma_phong}` : ''}
                onConfirmStudent={handleConfirmStudent}
                scannedIds={scannedIds}
            />

            {/* Modal Xác nhận Chốt điểm danh lên Tổng có kiểm tra ràng buộc */}
            {showChotConfirmModal && (
                <div className="dd-modal-backdrop">
                    <div className="dd-confirm-modal">
                        <div className="dd-modal-title">
                            <i className="fas fa-clipboard-check" style={{ color: '#6c5ce7' }}></i>
                            <span>Xác nhận chốt điểm danh ca ngủ</span>
                        </div>
                        <div className="dd-modal-body">
                            <p>
                                Phòng ngủ <strong>{selectedPhong?.ma_phong}</strong> có <strong>{students.length} học sinh</strong>. Kết quả điểm danh hiện tại:
                            </p>
                            <div className="dd-modal-stats-list">
                                <div className="dd-modal-stats-item">
                                    <span>✓ Đã điểm danh Có mặt:</span>
                                    <strong style={{ color: '#16a34a' }}>{students.filter(s => s.trang_thai === 'comat').length} em</strong>
                                </div>
                                <div className="dd-modal-stats-item">
                                    <span>📄 Nghỉ có phép (Báo phép trước):</span>
                                    <strong style={{ color: '#d97706' }}>{students.filter(s => s.trang_thai === 'phep').length} em</strong>
                                </div>
                                <div className="dd-modal-stats-item">
                                    <span>✕ Đã đánh dấu Vắng:</span>
                                    <strong style={{ color: '#dc2626' }}>{students.filter(s => s.trang_thai === 'vang').length} em</strong>
                                </div>
                                <div className="dd-modal-stats-item" style={{ paddingTop: 6, borderTop: '1px dashed #cbd5e1' }}>
                                    <span>⏳ CHƯA ĐIỂM DANH:</span>
                                    <strong style={{ color: (students.filter(s => s.trang_thai === 'chua_diem_danh' || !s.trang_thai).length > 0) ? '#dc2626' : '#16a34a' }}>
                                        {students.filter(s => s.trang_thai === 'chua_diem_danh' || !s.trang_thai).length} em
                                    </strong>
                                </div>
                            </div>

                            {students.filter(s => s.trang_thai === 'chua_diem_danh' || !s.trang_thai).length > 0 ? (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#991b1b', fontSize: '0.88rem' }}>
                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }}></i>
                                    <strong>CẢNH BÁO RÀNG BUỘC:</strong> Có <strong>{students.filter(s => s.trang_thai === 'chua_diem_danh' || !s.trang_thai).length} học sinh chưa điểm danh</strong>. Khi xác nhận Chốt, hệ thống sẽ <strong>tự động ghi nhận các em này là VẮNG (Không phép)</strong> và hoàn tất chốt sổ ca trực.
                                </div>
                            ) : (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#166534', fontSize: '0.88rem' }}>
                                    <i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>
                                    Tất cả <strong>{students.length} học sinh</strong> trong phòng đã được điểm danh đầy đủ.
                                </div>
                            )}

                            <p style={{ fontSize: '0.88rem', margin: 0, color: '#475569' }}>
                                Thầy/Cô có chắc chắn muốn chốt điểm danh phòng này lên hệ thống không?
                            </p>
                        </div>
                        <div className="dd-modal-actions">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setShowChotConfirmModal(false)}
                                disabled={chotting}
                            >
                                Quay lại kiểm tra
                            </button>
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={handleChotPhong}
                                disabled={chotting}
                                style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 700 }}
                            >
                                {chotting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                Xác nhận chốt danh sách
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {AlertUI}
        </>
    );
}
