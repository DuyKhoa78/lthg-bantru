import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import BaoCaoTrucModal from '../../components/BaoCaoTrucModal';
import './GvDashboard.css';

export default function GvDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [dutyData, setDutyData] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    // Trạng thái đóng/mở chi tiết từng phòng riêng lẻ (mặc định ẩn)
    const [expandedShifts, setExpandedShifts] = useState({});

    const toggleShiftDetail = (loaiTruc) => {
        setExpandedShifts(prev => ({
            ...prev,
            [loaiTruc]: !prev[loaiTruc]
        }));
    };

    // Modal xem khung giờ & quy định cho tiện ích nhanh
    const [showRulesModal, setShowRulesModal] = useState(false);

    // Modal thông báo khi chưa đủ điều kiện mở báo cáo
    const [reportBlockedInfo, setReportBlockedInfo] = useState(null);

    // Modal gửi Báo Cáo Ca Trực lên Admin
    const [showBaoCaoModal, setShowBaoCaoModal] = useState(false);
    const [baoCaoTarget, setBaoCaoTarget] = useState({
        ca_truc: 0,
        ma_phong: '',
        ngay: '',
        is_giam_sat: false,
    });

    // Hàm kiểm tra điều kiện mở Báo Cáo thời gian thực (real-time):
    // 1. Phải chốt điểm danh (trang_thai_chot === 'da_chot' || da_diem_danh || is_chot)
    // 2. Phải trong khung giờ quy định (Ăn: 11h15 - 11h45, Ngủ: 11h40 - 12h45)
    const checkCanReport = useCallback((loaiTruc, roomCodes = []) => {
        const isAdmin = user?.role === 'admin' || user?.role === 'quan_ly' || user?.is_superuser;

        const h = currentTime.getHours();
        const m = currentTime.getMinutes();
        const curMins = h * 60 + m;

        const isAn = loaiTruc === 0 || loaiTruc === 2;
        const startMins = isAn ? 675 : 700; // 11:15 or 11:40
        const endMins = isAn ? 705 : 765;   // 11:45 or 12:45
        const startStr = isAn ? '11:15' : '11:40';
        const endStr = isAn ? '11:45' : '12:45';
        const timeRange = `${startStr} – ${endStr}`;

        let timeState = 'trong_gio';
        if (curMins < startMins) timeState = 'sap_den';
        else if (curMins >= endMins) timeState = 'da_qua_gio';

        const targetItems = (dutyData?.assignments || []).filter(a => {
            if (a.loai_truc !== loaiTruc) return false;
            if (roomCodes && roomCodes.length > 0 && !roomCodes.includes(a.ma_phong_id)) return false;
            return true;
        });

        // Phòng đã chốt khi trang_thai_chot === 'da_chot' hoặc da_diem_danh hoặc is_chot
        const unchotRooms = targetItems
            .filter(a => !(a.trang_thai_chot === 'da_chot' || a.da_diem_danh || a.is_chot))
            .map(a => a.ma_phong_id);

        const allChot = targetItems.length > 0 && unchotRooms.length === 0;
        const chotCount = targetItems.length - unchotRooms.length;

        let canReport = true;
        let reason = '';

        if (!isAdmin) {
            if (!allChot && loaiTruc !== 2) {
                canReport = false;
                reason = `Thầy/Cô phải hoàn thành điểm danh và CHỐT SỔ phòng ${unchotRooms.join(', ')} xong mới được gửi báo cáo ca trực!`;
            } else if (timeState === 'sap_den') {
                canReport = false;
                const minsWait = startMins - curMins;
                reason = `Chưa tới giờ báo cáo (Khung giờ: ${timeRange}). Cổng báo cáo sẽ mở lúc ${startStr} (còn ${minsWait} phút)!`;
            } else if (timeState === 'da_qua_gio') {
                canReport = false;
                reason = `Đã quá thời gian báo cáo quy định (đóng lúc ${endStr}). Hệ thống đã khóa tiếp nhận báo cáo!`;
            }
        }

        return {
            canReport,
            reason,
            timeState,
            allChot,
            chotCount,
            totalRooms: targetItems.length,
            unchotRooms,
            timeRange,
            startStr,
            endStr,
            minsRemaining: timeState === 'trong_gio' ? (endMins - curMins) : 0,
            minsWait: timeState === 'sap_den' ? (startMins - curMins) : 0,
            gioHienTai: currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
    }, [currentTime, dutyData, user]);

    const handleOpenBaoCao = (caTruc, maPhong, ngay, isGiamSat = false, customCheck = null) => {
        const targetRooms = maPhong ? maPhong.split(',').map(s => s.trim()).filter(Boolean) : [];
        const check = customCheck || checkCanReport(caTruc, targetRooms);

        if (!check.canReport) {
            setReportBlockedInfo({
                ca_truc: caTruc,
                ma_phong: maPhong,
                ca_title: caTruc === 0 ? 'Báo Cáo Ca Ăn Trưa' : (caTruc === 1 ? 'Báo Danh Ca Nghỉ Trưa' : 'Báo Cáo Giám Sát'),
                reason: check.reason,
                check: check,
                ngay: ngay || dutyData?.today || new Date().toISOString().split('T')[0],
            });
            return;
        }

        setBaoCaoTarget({
            ca_truc: caTruc !== undefined ? caTruc : 0,
            ma_phong: maPhong || '',
            ngay: ngay || dutyData?.today || new Date().toISOString().split('T')[0],
            is_giam_sat: Boolean(isGiamSat),
        });
        setShowBaoCaoModal(true);
    };

    const fetchDuty = useCallback(async () => {
        try {
            const res = await api.get('/api/giao-vien/ca-truc-hom-nay');
            if (res.data?.ok) {
                setDutyData(res.data);
            }
        } catch (err) {
            console.error('Error loading duty data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDuty();
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, [fetchDuty]);

    const formatVNDate = (d) => {
        const dows = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dow = dows[d.getDay()];
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${dow}, ${day}/${month}/${year}`;
    };

    const formatVNTime = (d) => {
        return d.toLocaleTimeString('vi-VN', { hour12: false });
    };

    // Kiểm tra giai đoạn thời gian trong ngày để highlight nhịp sinh hoạt bán trú
    const routinePhase = useMemo(() => {
        const h = currentTime.getHours();
        const m = currentTime.getMinutes();
        const totalMinutes = h * 60 + m;

        // 10:55 (655m) - 11:30 (690m): Điểm danh Ca Ăn
        if (totalMinutes >= 655 && totalMinutes <= 690) return 'an';
        // 11:30 (690m) - 12:05 (725m): Điểm danh Phòng Ngủ
        if (totalMinutes > 690 && totalMinutes <= 725) return 'diemdanh_ngu';
        // 11:45 (705m) - 13:15 (795m): Học sinh ngủ trưa
        if (totalMinutes > 725 && totalMinutes <= 795) return 'hs_ngu';
        // 13:15 (795m) - 13:30 (810m): Báo thức chiều
        if (totalMinutes > 795 && totalMinutes <= 810) return 'thuc';
        return null;
    }, [currentTime]);

    // Tính toán số ca trực hôm nay (chỉ có 2 loại ca: Trực Ăn và Trực Ngủ)
    const shiftSummary = useMemo(() => {
        if (!dutyData?.assignments || dutyData.assignments.length === 0) {
            return { count: 0, text: 'Hôm nay nghỉ trực', subText: '' };
        }
        const hasAn = dutyData.assignments.some(a => a.loai_truc === 0);
        const hasNgu = dutyData.assignments.some(a => a.loai_truc === 1);
        const totalRooms = dutyData.assignments.length;

        if (hasAn && hasNgu) {
            return {
                count: 2,
                text: '2 ca: Trực ăn & Trực ngủ',
                subText: `2 ca • ${totalRooms} phòng`
            };
        } else if (hasAn) {
            return {
                count: 1,
                text: '1 ca: Trực ăn',
                subText: `1 ca Ăn • ${totalRooms} phòng`
            };
        } else if (hasNgu) {
            return {
                count: 1,
                text: '1 ca: Trực ngủ',
                subText: `1 ca Ngủ • ${totalRooms} phòng`
            };
        }
        return {
            count: 0,
            text: 'Hôm nay nghỉ trực',
            subText: ''
        };
    }, [dutyData]);

    // Cảnh báo & Nhắc nhở thông minh cho GV theo thời gian thực (Ăn: 11h15-12h, Ngủ: 11h45-13h)
    const dutyReminders = useMemo(() => {
        if (!dutyData?.assignments || dutyData.assignments.length === 0) return [];

        const h = currentTime.getHours();
        const m = currentTime.getMinutes();
        const curMins = h * 60 + m;

        const hasAn = dutyData.assignments.some(a => a.loai_truc === 0);
        const hasNgu = dutyData.assignments.some(a => a.loai_truc === 1);

        const anItems = dutyData.assignments.filter(a => a.loai_truc === 0);
        const nguItems = dutyData.assignments.filter(a => a.loai_truc === 1);

        // Kiểm tra xem đã hoàn thành chốt điểm danh chưa (phải chốt sổ mới tính là xong)
        const anDiemDanhDone = hasAn && anItems.every(a => a.trang_thai_chot === 'da_chot' || a.da_diem_danh || a.is_chot);
        const nguDiemDanhDone = hasNgu && nguItems.every(a => a.trang_thai_chot === 'da_chot' || a.da_diem_danh || a.is_chot);

        // Kiểm tra xem đã gửi báo cáo chưa
        const anBaoCaoDone = hasAn && anItems.some(a => a.bao_cao?.da_bao_cao);
        const nguBaoCaoDone = hasNgu && nguItems.some(a => a.bao_cao?.da_bao_cao);

        const reminders = [];

        // ════════════ CA ĂN ════════════
        if (hasAn) {
            const anRoomsStr = anItems.map(i => i.ma_phong_id).join(', ');
            // 1. Sắp tới giờ điểm danh: 10:30 -> 10:55 (630 -> 655)
            if (curMins >= 630 && curMins < 655) {
                reminders.push({
                    id: 'an_sap_diemdanh',
                    type: 'info',
                    icon: 'fas fa-bell',
                    title: 'Sắp tới giờ điểm danh Ca Ăn (10:55 – 11:30)',
                    content: `Còn ${655 - curMins} phút nữa hệ thống sẽ mở cổng điểm danh cho phòng ${anRoomsStr}. Thầy/Cô chuẩn bị đón học sinh tại nhà ăn!`,
                    badge: `Mở lúc 10:55 (còn ${655 - curMins}p)`,
                    ca: 0,
                    actionText: null
                });
            }
            // 2. Trong giờ điểm danh nhưng chưa đến giờ báo cáo: 10:55 -> 11:15 (655 -> 675)
            else if (curMins >= 655 && curMins < 675) {
                if (!anDiemDanhDone) {
                    reminders.push({
                        id: 'an_dang_diemdanh_chua_xong',
                        type: 'warning',
                        icon: 'fas fa-qrcode',
                        title: 'Đang trong giờ điểm danh Ca Ăn (10:55 – 11:30)',
                        content: `Thầy/Cô vui lòng thực hiện điểm danh học sinh phòng ${anRoomsStr}. Lưu ý: Phải điểm danh xong mới được gửi báo cáo ca ăn!`,
                        badge: 'Cần điểm danh trước',
                        ca: 0,
                        actionType: 'diemdanh',
                        path: `/diemdanh-an?ngay=${dutyData.today}&gop=1`,
                        actionText: 'Vào điểm danh ca ăn ngay'
                    });
                } else {
                    reminders.push({
                        id: 'an_diemdanh_xong_cho_baocao',
                        type: 'info',
                        icon: 'fas fa-hourglass-half',
                        title: 'Đã điểm danh ca ăn • Chờ mở cổng báo cáo',
                        content: `Cổng Báo Cáo Ca Ăn sẽ mở lúc 11:15 (còn ${675 - curMins} phút). Thầy/Cô có thể chuẩn bị nội dung nhận xét trước.`,
                        badge: `Mở báo cáo lúc 11:15`,
                        ca: 0,
                        actionText: null
                    });
                }
            }
            // 3. Trong khung giờ báo cáo ca ăn: 11:15 -> 12:00 (675 -> 720)
            else if (curMins >= 675 && curMins <= 720) {
                const minsLeft = 720 - curMins;
                if (!anDiemDanhDone) {
                    // Chưa điểm danh -> cảnh báo nghiêm ngặt
                    reminders.push({
                        id: 'an_trong_gio_baocao_chua_diemdanh',
                        type: 'danger',
                        icon: 'fas fa-exclamation-triangle',
                        title: 'Chưa điểm danh • Không thể gửi Báo Cáo Ca Ăn!',
                        content: `Cổng báo cáo ca ăn đang mở (đóng lúc 12:00, còn ${minsLeft} phút). Theo quy định, Thầy/Cô PHẢI ĐIỂM DANH XONG mới được gửi báo cáo!`,
                        badge: `Đóng lúc 12:00 (${minsLeft}p)`,
                        ca: 0,
                        actionType: 'diemdanh',
                        path: `/diemdanh-an?ngay=${dutyData.today}&gop=1`,
                        actionText: 'Vào điểm danh phòng ăn ngay'
                    });
                } else if (!anBaoCaoDone) {
                    // Đã điểm danh nhưng chưa gửi báo cáo
                    const isUrgent = minsLeft <= 15;
                    reminders.push({
                        id: 'an_can_gui_baocao',
                        type: isUrgent ? 'danger-pulse' : 'warning-pulse',
                        icon: isUrgent ? 'fas fa-exclamation-circle' : 'fas fa-paper-plane',
                        title: isUrgent ? `🚨 SẮP HẾT HẠN BÁO CÁO CA ĂN! (Đóng lúc 12:00)` : `🔔 Đang trong khung giờ Báo Cáo Ca Ăn (11:15 – 12:00)`,
                        content: `Còn ${minsLeft} phút để gửi báo cáo ca ăn lên Ban Quản Lý. Sau 12:00 hệ thống sẽ khóa và không thể gửi báo cáo!`,
                        badge: `Còn ${minsLeft} phút`,
                        ca: 0,
                        actionType: 'baocao',
                        actionTarget: { ca: 0, phong: anRoomsStr },
                        actionText: 'Gửi báo cáo ca ăn ngay'
                    });
                } else {
                    // Đã báo cáo rồi -> thông báo có thể chỉnh sửa/cập nhật trước 12:00
                    reminders.push({
                        id: 'an_da_baocao',
                        type: 'success',
                        icon: 'fas fa-check-circle',
                        title: '✓ Đã gửi Báo Cáo Ca Ăn thành công',
                        content: `Thầy/Cô có thể chỉnh sửa và cập nhật lại thông tin báo cáo nếu cần (cổng đóng lúc 12:00, còn ${minsLeft} phút).`,
                        badge: `Có thể cập nhật đến 12:00`,
                        ca: 0,
                        actionType: 'baocao',
                        actionTarget: { ca: 0, phong: anRoomsStr },
                        actionText: 'Cập nhật báo cáo ca ăn'
                    });
                }
            }
            // 4. Đã qua giờ ca ăn: > 12:00 (720)
            else if (curMins > 720 && curMins < 840) {
                if (!anBaoCaoDone) {
                    reminders.push({
                        id: 'an_qua_gio_chua_baocao',
                        type: 'neutral',
                        icon: 'fas fa-lock',
                        title: 'Đã hết thời gian Báo Cáo Ca Ăn (đã đóng lúc 12:00)',
                        content: 'Sau 12:00 hệ thống đã khóa tiếp nhận báo cáo ca ăn. Mọi cập nhật cần liên hệ trực tiếp BQL.',
                        badge: 'Đã khóa cổng',
                        ca: 0,
                        actionText: null
                    });
                }
            }
        }

        // ════════════ CA NGỦ ════════════
        if (hasNgu) {
            const nguRoomsStr = nguItems.map(i => i.ma_phong_id).join(', ');
            // 1. Sắp tới giờ điểm danh: 11:10 -> 11:30 (670 -> 690)
            if (curMins >= 670 && curMins < 690) {
                reminders.push({
                    id: 'ngu_sap_diemdanh',
                    type: 'info',
                    icon: 'fas fa-bell',
                    title: 'Sắp tới giờ điểm danh Ca Ngủ (11:30 – 12:05)',
                    content: `Còn ${690 - curMins} phút nữa hệ thống sẽ mở cổng điểm danh cho phòng ${nguRoomsStr}. Thầy/Cô chuẩn bị nhận phòng ngủ!`,
                    badge: `Mở lúc 11:30 (còn ${690 - curMins}p)`,
                    ca: 1,
                    actionText: null
                });
            }
            // 2. Trong giờ điểm danh nhưng chưa đến giờ báo cáo: 11:30 -> 11:45 (690 -> 705)
            else if (curMins >= 690 && curMins < 705) {
                if (!nguDiemDanhDone) {
                    reminders.push({
                        id: 'ngu_dang_diemdanh_chua_xong',
                        type: 'warning',
                        icon: 'fas fa-qrcode',
                        title: 'Đang trong giờ điểm danh Ca Ngủ (11:30 – 12:05)',
                        content: `Thầy/Cô vui lòng thực hiện điểm danh học sinh phòng ${nguRoomsStr}. Lưu ý: Phải điểm danh xong mới được báo danh phòng ngủ!`,
                        badge: 'Cần điểm danh trước',
                        ca: 1,
                        actionType: 'diemdanh',
                        path: `/diemdanh-ngu?ngay=${dutyData.today}&gop=1`,
                        actionText: 'Vào điểm danh phòng ngủ ngay'
                    });
                } else {
                    reminders.push({
                        id: 'ngu_diemdanh_xong_cho_baocao',
                        type: 'info',
                        icon: 'fas fa-hourglass-half',
                        title: 'Đã điểm danh phòng ngủ • Chờ mở cổng báo danh',
                        content: `Cổng Báo Danh Phòng Ngủ sẽ mở lúc 11:45 (còn ${705 - curMins} phút). Thầy/Cô chuẩn bị gửi báo danh lên BQL.`,
                        badge: `Mở báo danh lúc 11:45`,
                        ca: 1,
                        actionText: null
                    });
                }
            }
            // 3. Trong khung giờ báo danh phòng ngủ: 11:45 -> 13:00 (705 -> 780)
            else if (curMins >= 705 && curMins <= 780) {
                const minsLeft = 780 - curMins;
                if (!nguDiemDanhDone) {
                    // Chưa điểm danh -> cảnh báo nghiêm ngặt
                    reminders.push({
                        id: 'ngu_trong_gio_baocao_chua_diemdanh',
                        type: 'danger',
                        icon: 'fas fa-exclamation-triangle',
                        title: 'Chưa điểm danh • Không thể báo danh phòng ngủ!',
                        content: `Cổng báo danh phòng ngủ đang mở (đóng lúc 13:00, còn ${minsLeft} phút). Theo quy định, Thầy/Cô PHẢI ĐIỂM DANH XONG mới được báo danh!`,
                        badge: `Đóng lúc 13:00 (${minsLeft}p)`,
                        ca: 1,
                        actionType: 'diemdanh',
                        path: `/diemdanh-ngu?ngay=${dutyData.today}&gop=1`,
                        actionText: 'Vào điểm danh phòng ngủ ngay'
                    });
                } else if (!nguBaoCaoDone) {
                    // Đã điểm danh nhưng chưa gửi báo danh
                    const isUrgent = minsLeft <= 15;
                    reminders.push({
                        id: 'ngu_can_gui_baocao',
                        type: isUrgent ? 'danger-pulse' : 'warning-pulse',
                        icon: isUrgent ? 'fas fa-exclamation-circle' : 'fas fa-paper-plane',
                        title: isUrgent ? `🚨 SẮP HẾT HẠN BÁO DANH PHÒNG NGỦ! (Đóng lúc 13:00)` : `🔔 Đang trong khung giờ Báo Danh Phòng Ngủ (11:45 – 13:00)`,
                        content: `Còn ${minsLeft} phút để gửi báo danh phòng ${nguRoomsStr} lên Ban Quản Lý. Sau 13:00 hệ thống sẽ khóa tiếp nhận!`,
                        badge: `Còn ${minsLeft} phút`,
                        ca: 1,
                        actionType: 'baocao',
                        actionTarget: { ca: 1, phong: nguRoomsStr },
                        actionText: 'Gửi báo danh phòng ngủ ngay'
                    });
                } else {
                    // Đã báo cáo rồi -> thông báo có thể chỉnh sửa/cập nhật trước 13:00
                    reminders.push({
                        id: 'ngu_da_baocao',
                        type: 'success',
                        icon: 'fas fa-check-circle',
                        title: '✓ Đã gửi Báo Danh Phòng Ngủ thành công',
                        content: `Thầy/Cô có thể chỉnh sửa và cập nhật lại thông tin báo danh nếu cần (cổng đóng lúc 13:00, còn ${minsLeft} phút).`,
                        badge: `Có thể cập nhật đến 13:00`,
                        ca: 1,
                        actionType: 'baocao',
                        actionTarget: { ca: 1, phong: nguRoomsStr },
                        actionText: 'Cập nhật báo danh phòng ngủ'
                    });
                }
            }
            // 4. Đã qua giờ ca ngủ: > 13:00 (780)
            else if (curMins > 780 && curMins < 870) {
                if (!nguBaoCaoDone) {
                    reminders.push({
                        id: 'ngu_qua_gio_chua_baocao',
                        type: 'neutral',
                        icon: 'fas fa-lock',
                        title: 'Đã hết thời gian Báo Danh Phòng Ngủ (đã đóng lúc 13:00)',
                        content: 'Sau 13:00 hệ thống đã khóa tiếp nhận báo danh phòng ngủ hôm nay. Mọi cập nhật cần liên hệ BQL.',
                        badge: 'Đã khóa cổng',
                        ca: 1,
                        actionText: null
                    });
                }
            }
        }

        return reminders;
    }, [currentTime, dutyData]);

    const userInitial = useMemo(() => {
        const name = user?.fullname || user?.username || 'GV';
        const parts = name.trim().split(' ');
        return parts[parts.length - 1].charAt(0).toUpperCase();
    }, [user]);

    const avatarUrl = user?.avatar_url
        ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${import.meta.env.BASE_URL}${user.avatar_url.replace(/^\//, '')}`)
        : null;

    return (
        <div className="gv-dashboard-container">
            {/* Header Greeting Banner - Mobile First App Style */}
            <div className="gv-welcome-banner">
                <div className="gv-welcome-bg-glow-1"></div>
                <div className="gv-welcome-bg-glow-2"></div>

                <div className="gv-welcome-content">
                    {/* Top sub-badge */}
                    <div className="gv-top-school-tag">
                        <span className="gv-badge-role">
                            <i className="fas fa-graduation-cap"></i> CỔNG GIÁO VIÊN BÁN TRÚ
                        </span>
                        <span className="gv-badge-school">THPT LÊ THỊ HỒNG GẤM</span>
                    </div>

                    {/* Main Greeting Row with Avatar */}
                    <div className="gv-profile-greeting-row">
                        <div className="gv-avatar-ring">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt="GV Avatar"
                                    className="gv-avatar-img"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <div className="gv-avatar-placeholder">
                                    {userInitial}
                                </div>
                            )}
                            <span className="gv-avatar-online-dot" title="Sẵn sàng trực"></span>
                        </div>

                        <div className="gv-greeting-info">
                            <span className="gv-greeting-label">Xin chào Thầy/Cô</span>
                            <h2 className="gv-user-fullname">
                                {user?.fullname || user?.username || 'Giáo viên'}
                            </h2>
                        </div>
                    </div>

                    {/* Live Clock & Date Status Capsule */}
                    <div className="gv-time-capsule-bar">
                        <div className="gv-capsule-item gv-capsule-date">
                            <i className="fas fa-calendar-alt"></i>
                            <span>{formatVNDate(currentTime)}</span>
                        </div>
                        <div className="gv-capsule-item gv-capsule-time">
                            <span className="gv-pulse-live-dot"></span>
                            <span className="gv-clock-digits">{formatVNTime(currentTime)}</span>
                        </div>
                        {shiftSummary.count > 0 && (
                            <div className="gv-capsule-item gv-capsule-duty-count" title={`${dutyData?.assignments?.length || 0} phòng phụ trách`}>
                                <i className="fas fa-bolt"></i>
                                <span>{shiftSummary.text}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="gv-loading-state">
                    <div className="gv-loading-spinner-wrap">
                        <i className="fas fa-circle-notch fa-spin"></i>
                    </div>
                    <p className="gv-loading-title">Đang đồng bộ dữ liệu ca trực...</p>
                    <small>Vui lòng đợi giây lát</small>
                </div>
            ) : !dutyData?.assignments || dutyData.assignments.length === 0 ? (
                /* GIAO DIỆN KHI KHÔNG CÓ LỊCH TRỰC HÔM NAY (MOBILE-OPTIMIZED) */
                <div className="gv-rest-day-wrapper">
                    {/* Main Rest Card */}
                    <div className="gv-no-duty-card">
                        <div className="gv-no-duty-badge">
                            <div className="gv-no-duty-glow"></div>
                            <div className="gv-no-duty-icon-circle">
                                <i className="fas fa-mug-hot"></i>
                            </div>
                        </div>

                        <div className="gv-no-duty-status-tag">
                            <span className="gv-status-ping"></span>
                            <span>HÔM NAY NGHỈ TRỰC</span>
                        </div>

                        <h3 className="gv-no-duty-title">Hôm nay Thầy/Cô không có lịch trực bán trú</h3>
                        <p className="gv-no-duty-desc">
                            Thầy/Cô không có ca phân công ăn hoặc ngủ trưa hôm nay. Chúc Thầy/Cô một ngày làm việc và giảng dạy tràn đầy năng lượng!
                        </p>

                        <div className="gv-action-row">
                            <button className="btn gv-btn-primary-mobile" onClick={() => navigate('/lich-truc')}>
                                <i className="fas fa-calendar-alt"></i>
                                <span>Xem toàn bộ lịch trực tuần</span>
                                <i className="fas fa-chevron-right gv-btn-arrow"></i>
                            </button>
                        </div>
                    </div>

                    {/* TIỆN ÍCH NHANH TRÊN DI ĐỘNG (QUICK ACTIONS FOR TEACHERS) */}
                    <div className="gv-quick-actions-section">
                        <div className="gv-section-header-compact">
                            <i className="fas fa-th-large"></i>
                            <span>Tiện ích nhanh cho Giáo viên</span>
                        </div>
                        <div className="gv-quick-actions-grid">
                            <div className="gv-quick-card card-blue" onClick={() => navigate('/lich-truc')}>
                                <div className="gv-quick-icon">
                                    <i className="fas fa-calendar-week"></i>
                                </div>
                                <div className="gv-quick-meta">
                                    <h4>Lịch trực tuần</h4>
                                    <p>Xem phân công cá nhân & toàn trường</p>
                                </div>
                                <i className="fas fa-arrow-right gv-quick-arrow"></i>
                            </div>

                            <div className="gv-quick-card card-purple" onClick={() => handleOpenBaoCao(0, '', dutyData?.today)}>
                                <div className="gv-quick-icon">
                                    <i className="fas fa-file-signature"></i>
                                </div>
                                <div className="gv-quick-meta">
                                    <h4>Báo cáo ca trực</h4>
                                    <p>Gửi nề nếp, vi phạm & CSVC lên BQL</p>
                                </div>
                                <i className="fas fa-paper-plane gv-quick-arrow"></i>
                            </div>

                            <div className="gv-quick-card card-amber" onClick={() => setShowRulesModal(true)}>
                                <div className="gv-quick-icon">
                                    <i className="fas fa-clock"></i>
                                </div>
                                <div className="gv-quick-meta">
                                    <h4>Khung giờ bán trú</h4>
                                    <p>Điểm danh 11:30–12:05 • Ngủ 11:45–13:15</p>
                                </div>
                                <i className="fas fa-info-circle gv-quick-arrow"></i>
                            </div>
                        </div>
                    </div>

                    {/* TIMELINE NHỊP SINH HOẠT BÁN TRÚ TRONG NGÀY */}
                    <div className="gv-routine-timeline-card">
                        <div className="gv-routine-header">
                            <div className="gv-routine-title">
                                <i className="fas fa-history"></i>
                                <span>Nhịp sinh hoạt Bán trú trong ngày</span>
                            </div>
                            <span className="gv-routine-badge">Quy chuẩn trường</span>
                        </div>

                        <div className="gv-timeline-steps">
                            {/* Ca 1: Ăn trưa */}
                            <div className={`gv-timeline-step ${routinePhase === 'an' ? 'active-phase' : ''}`}>
                                <div className="gv-step-indicator orange">
                                    <i className="fas fa-utensils"></i>
                                </div>
                                <div className="gv-step-content">
                                    <div className="gv-step-top">
                                        <strong className="gv-step-name">1. Ca Ăn Trưa</strong>
                                        <span className="gv-step-hours">10:55 – 11:30</span>
                                    </div>
                                    <p className="gv-step-desc">
                                        Điểm danh học sinh ăn trưa tại nhà ăn, theo dõi khẩu phần và tác phong bàn ăn.
                                    </p>
                                    {routinePhase === 'an' && (
                                        <span className="gv-phase-live-pill">
                                            <span className="gv-pulse-dot-green"></span> Đang trong giờ ăn trưa
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Ca 2: Điểm danh phòng ngủ */}
                            <div className={`gv-timeline-step ${routinePhase === 'diemdanh_ngu' ? 'active-phase' : ''}`}>
                                <div className="gv-step-indicator indigo">
                                    <i className="fas fa-clipboard-check"></i>
                                </div>
                                <div className="gv-step-content">
                                    <div className="gv-step-top">
                                        <strong className="gv-step-name">2. Điểm Danh Nghỉ Trưa</strong>
                                        <span className="gv-step-hours">11:30 – 12:05</span>
                                    </div>
                                    <p className="gv-step-desc">
                                        Giáo viên điểm danh học sinh tại phòng ngủ, ổn định chỗ nằm và chốt sĩ số lên Ban Quản Lý.
                                    </p>
                                    {routinePhase === 'diemdanh_ngu' && (
                                        <span className="gv-phase-live-pill">
                                            <span className="gv-pulse-dot-green"></span> Đang trong khung giờ điểm danh
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Ca 3: Học sinh ngủ trưa */}
                            <div className={`gv-timeline-step ${routinePhase === 'hs_ngu' ? 'active-phase' : ''}`}>
                                <div className="gv-step-indicator purple">
                                    <i className="fas fa-bed"></i>
                                </div>
                                <div className="gv-step-content">
                                    <div className="gv-step-top">
                                        <strong className="gv-step-name">3. Giờ Học Sinh Ngủ Trưa</strong>
                                        <span className="gv-step-hours">11:45 – 13:15</span>
                                    </div>
                                    <p className="gv-step-desc">
                                        Học sinh ngủ trưa, giữ trật tự và không gian yên tĩnh tuyệt đối trong toàn bộ phòng ngủ.
                                    </p>
                                    {routinePhase === 'hs_ngu' && (
                                        <span className="gv-phase-live-pill">
                                            <span className="gv-pulse-dot-green"></span> Đang trong giờ học sinh ngủ
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Ca 4: Báo thức chiều */}
                            <div className={`gv-timeline-step ${routinePhase === 'thuc' ? 'active-phase' : ''}`}>
                                <div className="gv-step-indicator cyan">
                                    <i className="fas fa-bell"></i>
                                </div>
                                <div className="gv-step-content">
                                    <div className="gv-step-top">
                                        <strong className="gv-step-name">4. Báo Thức Chiều</strong>
                                        <span className="gv-step-hours">13:15</span>
                                    </div>
                                    <p className="gv-step-desc">
                                        Đánh thức học sinh dậy, nhắc nhở xếp chăn gối gọn gàng và chuẩn bị vào học tiết chiều.
                                    </p>
                                    <div className="gv-timeline-warning-note">
                                        <i className="fas fa-exclamation-triangle"></i>
                                        <span><strong>Lưu ý cho GV:</strong> Giáo viên tuyệt đối <strong>không được đánh thức trước 13h00!</strong></span>
                                    </div>
                                    {routinePhase === 'thuc' && (
                                        <span className="gv-phase-live-pill">
                                            <span className="gv-pulse-dot-green"></span> Giờ báo thức học sinh
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* GIAO DIỆN KHI CÓ LỊCH TRỰC HÔM NAY (MOBILE-OPTIMIZED) */
                <div className="gv-duty-section">
                    <div className="gv-section-title">
                        <div className="gv-section-title-left">
                            <h3><i className="fas fa-calendar-check"></i> Ca trực hôm nay</h3>
                            <span className="gv-total-assigned">{shiftSummary.subText}</span>
                        </div>
                        {(() => {
                            const hasAnyReportDone = dutyData.assignments.some(a => a.bao_cao?.da_bao_cao);
                            const anyCanReport = dutyData.assignments.some(a => {
                                const chk = checkCanReport(a.loai_truc, [a.ma_phong_id]);
                                return chk.canReport;
                            });
                            const firstCa = dutyData.assignments[0]?.loai_truc || 0;
                            const firstCheck = checkCanReport(firstCa);

                            return (
                                <button
                                    type="button"
                                    className={`btn gv-btn-header-baocao ${hasAnyReportDone ? 'btn-header-baocao-done' : ''} ${!anyCanReport ? 'btn-baocao-dimmed' : 'btn-baocao-active'}`}
                                    onClick={() => handleOpenBaoCao(
                                        dutyData.assignments[0]?.loai_truc || 0,
                                        dutyData.assignments[0]?.ma_phong_id || '',
                                        dutyData.today,
                                        false,
                                        anyCanReport ? null : firstCheck
                                    )}
                                    title={!anyCanReport ? (firstCheck.reason || 'Chưa đủ điều kiện mở báo cáo') : (hasAnyReportDone ? 'Chỉnh sửa / Cập nhật báo cáo ca trực' : 'Gửi báo cáo ca trực cho Ban Quản Lý')}
                                >
                                    <i className={`fas ${hasAnyReportDone ? 'fa-sync-alt' : 'fa-file-signature'}`}></i>
                                    <span>
                                        {hasAnyReportDone ? 'Cập nhật báo cáo' : 'Báo cáo ca trực'}
                                    </span>
                                </button>
                            );
                        })()}
                    </div>

                    {/* BANNER CẢNH BÁO & NHẮC NHỞ QUY ĐỊNH THỜI GIAN VÀ ĐIỂM DANH */}
                    {dutyReminders.length > 0 && (
                        <div className="gv-duty-reminders-container">
                            {dutyReminders.map(rem => (
                                <div key={rem.id} className={`gv-duty-reminder-card rem-${rem.type}`}>
                                    <div className="gv-rem-left">
                                        <div className="gv-rem-icon-wrap">
                                            <i className={rem.icon}></i>
                                        </div>
                                        <div className="gv-rem-content">
                                            <div className="gv-rem-header-row">
                                                <h4 className="gv-rem-title">{rem.title}</h4>
                                                {rem.badge && <span className="gv-rem-badge">{rem.badge}</span>}
                                            </div>
                                            <p className="gv-rem-desc">{rem.content}</p>
                                        </div>
                                    </div>
                                    {rem.actionText && (
                                        <div className="gv-rem-action-wrap">
                                            {rem.actionType === 'diemdanh' ? (
                                                <button
                                                    type="button"
                                                    className="btn gv-btn-rem-action btn-diemdanh-action"
                                                    onClick={() => navigate(rem.path)}
                                                >
                                                    <i className="fas fa-qrcode"></i>
                                                    <span>{rem.actionText}</span>
                                                </button>
                                            ) : rem.actionType === 'baocao' ? (
                                                <button
                                                    type="button"
                                                    className="btn gv-btn-rem-action btn-baocao-action"
                                                    onClick={() => handleOpenBaoCao(rem.actionTarget?.ca, rem.actionTarget?.phong, dutyData.today)}
                                                >
                                                    <i className={`fas ${rem.type === 'success' ? 'fa-sync-alt' : 'fa-paper-plane'}`}></i>
                                                    <span>{rem.actionText}</span>
                                                </button>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Nhóm nhiệm vụ theo ca trực để hỗ trợ điểm danh gộp nhiều phòng */}
                    {(() => {
                        // Nhóm các ca trực theo loại (0: Ăn, 1: Ngủ)
                        const shiftGroups = {};
                        dutyData.assignments.forEach(item => {
                            const key = item.loai_truc; // 0 or 1
                            if (!shiftGroups[key]) {
                                const isAn = key === 0;
                                shiftGroups[key] = {
                                    loai_truc: key,
                                    isAn,
                                    title: isAn ? 'Ca Ăn Trưa' : 'Ca Nghỉ Trưa',
                                    iconClass: isAn ? 'fas fa-utensils' : 'fas fa-bed',
                                    iconColor: isAn ? '#f59e0b' : '#6366f1',
                                    path: isAn ? '/diemdanh-an' : '/diemdanh-ngu',
                                    khung_gio: item.khung_gio,
                                    state: item.khung_gio.state,
                                    ngay: item.ngay || dutyData.today,
                                    items: []
                                };
                            }
                            shiftGroups[key].items.push(item);
                        });

                        return Object.values(shiftGroups).map(shift => {
                            const hasMultipleRooms = shift.items.length >= 2;
                            const totalStudents = shift.items.reduce((sum, i) => sum + (i.total_students || 0), 0);
                            const totalDraft = shift.items.reduce((sum, i) => sum + (i.draft_count || 0), 0);
                            const totalCoMat = shift.items.reduce((sum, i) => sum + (i.so_co_mat || 0), 0);
                            const totalVang = shift.items.reduce((sum, i) => sum + (i.tong_vang || 0), 0);
                            const totalDiemDanh = shift.items.reduce((sum, i) => sum + (i.da_diem_danh_count || 0), 0);
                            const allAbsentStudents = shift.items.flatMap(i => i.danh_sach_vang || []);

                            const isItemChot = (i) => i.trang_thai_chot === 'da_chot' || i.da_diem_danh || i.is_chot;
                            const chotCount = shift.items.filter(isItemChot).length;
                            const allChot = shift.items.length > 0 && chotCount === shift.items.length;
                            const roomCodes = shift.items.map(i => i.ma_phong_id);
                            const roomCodesStr = roomCodes.join(', ');

                            const shiftReportDone = shift.items.some(i => i.bao_cao?.da_bao_cao);

                            return (
                                <div key={shift.loai_truc} className="gv-shift-group-wrapper">
                                    {/* THẺ TỔNG HỢP CA TRỰC */}
                                    <div className={`gv-consolidated-shift-card ${shift.isAn ? 'card-an' : 'card-ngu'}`}>
                                        <div className="gv-consolidated-top">
                                            <div className="gv-shift-header-main">
                                                <div className="gv-shift-brand-group">
                                                    <div className="gv-card-icon" style={{ backgroundColor: `${shift.iconColor}20`, color: shift.iconColor }}>
                                                        <i className={shift.iconClass}></i>
                                                    </div>
                                                    <div className="gv-shift-titles">
                                                        <div className="gv-shift-title-line">
                                                            <h4 className="gv-shift-title-text">{shift.title}</h4>
                                                            {hasMultipleRooms && (
                                                                <span className="gv-consolidated-badge">
                                                                    <i className="fas fa-layer-group"></i> {shift.items.length} PHÒNG
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="gv-shift-time-badge">
                                                            <i className="far fa-clock"></i> {shift.khung_gio.start} – {shift.khung_gio.end}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="gv-shift-status-tag">
                                                    {shift.state === 'sap_den' && <span className="tag-pending">⏳ Sắp diễn ra</span>}
                                                    {shift.state === 'dang_dien_ra' && <span className="tag-active">🟢 Đang diễn ra</span>}
                                                    {shift.state === 'da_qua_gio' && <span className="tag-closed">🔒 Đã quá giờ</span>}
                                                </div>
                                            </div>

                                            <div className="gv-room-chips-list">
                                                <span className="gv-room-chips-label">Phụ trách:</span>
                                                {roomCodes.map(c => (
                                                    <span key={c} className="gv-room-mini-chip">
                                                        <i className="fas fa-door-open"></i> {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="gv-consolidated-body">
                                            <div className="gv-consolidated-stats-grid">
                                                <div className="gv-cstat-item">
                                                    <span className="label">Tổng sĩ số</span>
                                                    <span className="val font-bold">{totalStudents} HS</span>
                                                </div>
                                                <div className="gv-cstat-item">
                                                    <span className="label">Đã điểm danh</span>
                                                    <span className="val font-bold text-primary">
                                                        {allChot ? `${totalCoMat} em` : `${totalDiemDanh > 0 ? totalDiemDanh : totalDraft}/${totalStudents} em`}
                                                    </span>
                                                </div>
                                                {allChot ? (
                                                    <div className="gv-cstat-item">
                                                        <span className="label">HS vắng</span>
                                                        <span className={`val font-bold ${totalVang > 0 ? 'text-danger' : 'text-success'}`}>
                                                            {totalVang} em
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="gv-cstat-item">
                                                        <span className="label">Đang lưu nháp</span>
                                                        <span className="val text-amber-600 font-bold">{totalDraft} em</span>
                                                    </div>
                                                )}
                                                <div className="gv-cstat-item">
                                                    <span className="label">Tiến độ chốt sổ</span>
                                                    <span className={`val font-bold ${allChot ? 'text-success' : chotCount > 0 ? 'text-warning' : ''}`}>
                                                        {allChot ? '✓ Đã chốt' : `${chotCount}/${shift.items.length} phòng chốt`}
                                                    </span>
                                                </div>
                                                <div className="gv-cstat-item" title={shiftReportDone ? 'Đã hoàn thành gửi báo cáo ca trực' : 'Chưa gửi báo cáo ca trực'}>
                                                    <span className="label">Báo cáo ca trực</span>
                                                    <span className={`val font-bold ${shiftReportDone ? 'text-success' : 'text-amber-600'}`}>
                                                        {shiftReportDone ? '✓ Đã gửi' : '⏳ Chưa gửi'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* HIỂN THỊ CHI TIẾT SĨ SỐ VÀ DANH SÁCH HS VẮNG SAU KHI ĐÃ CHỐT SỔ */}
                                            {allChot && (
                                                <div className="gv-consolidated-chot-banner">
                                                    <div className="gv-chot-banner-header">
                                                        <div className="gv-chot-banner-title">
                                                            <i className="fas fa-check-circle text-success"></i>
                                                            <span>ĐÃ CHỐT SỔ ĐIỂM DANH ({shift.items.length}/{shift.items.length} PHÒNG)</span>
                                                        </div>
                                                        <div className="gv-chot-banner-badges">
                                                            <span className="badge-siso">Sĩ số: <strong>{totalStudents} HS</strong></span>
                                                            <span className="badge-comat">Có mặt: <strong>{totalCoMat} em</strong></span>
                                                            <span className={`badge-vang ${totalVang > 0 ? 'has-vang' : 'no-vang'}`}>
                                                                Vắng: <strong>{totalVang} em</strong>
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {allAbsentStudents.length > 0 ? (
                                                        <div className="gv-chot-vang-detail">
                                                            <span className="vang-detail-title"><i className="fas fa-user-times"></i> Danh sách HS vắng ({allAbsentStudents.length}):</span>
                                                            <div className="vang-student-tags">
                                                                {allAbsentStudents.map((s, idx) => (
                                                                    <span key={idx} className="vang-student-tag" title={s.ghi_chu || s.loai}>
                                                                        <strong>{s.ho_ten}</strong> {s.lop ? `(${s.lop})` : ''} <span className="tag-room">🚪 {s.ma_phong_id}</span> <em className="tag-loai">({s.loai})</em>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="gv-chot-vang-none">
                                                            <i className="fas fa-check-double text-success"></i> Sĩ số {totalStudents} học sinh đều có mặt đầy đủ, không có học sinh vắng!
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {(() => {
                                                const shiftCheck = checkCanReport(shift.loai_truc, roomCodes);
                                                return (
                                                    <div className="gv-consolidated-action-row">
                                                        <div className="gv-consolidated-btns-wrap">
                                                            <button
                                                                type="button"
                                                                className="btn gv-btn-consolidated"
                                                                onClick={() => navigate(`${shift.path}?ngay=${shift.ngay}&gop=1`)}
                                                            >
                                                                <i className="fas fa-qrcode"></i>
                                                                <span>VÀO ĐIỂM DANH ({roomCodesStr})</span>
                                                                <i className="fas fa-arrow-right"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`btn gv-btn-consolidated-baocao ${shiftReportDone ? 'btn-baocao-submitted' : ''} ${!allChot ? 'btn-baocao-dimmed' : 'btn-baocao-active'}`}
                                                                onClick={() => handleOpenBaoCao(shift.loai_truc, roomCodes.join(', '), shift.ngay, shift.items.some(i => i.nhiem_vu === 1), shiftCheck)}
                                                                style={{
                                                                    opacity: allChot || shiftReportDone ? 1 : 0.6,
                                                                    cursor: allChot || shiftReportDone ? 'pointer' : 'not-allowed',
                                                                }}
                                                                title={!allChot ? 'Thầy/Cô phải hoàn thành điểm danh và Chốt sổ trước khi gửi Báo cáo ca' : (shiftReportDone ? 'Cập nhật báo cáo' : 'Mở biểu mẫu báo cáo')}
                                                            >
                                                                <i className={`fas ${shiftReportDone ? 'fa-sync-alt' : 'fa-file-signature'}`}></i>
                                                                <span>
                                                                    {shiftReportDone
                                                                        ? (shiftCheck.timeState === 'da_qua_gio' ? 'XEM BÁO CÁO' : 'CẬP NHẬT BÁO CÁO')
                                                                        : (shift.isAn ? 'BÁO CÁO CA ĂN' : 'BÁO CÁO CA NGỦ')
                                                                    }
                                                                </span>
                                                            </button>
                                                        </div>
                                                        {hasMultipleRooms && (
                                                            <small className="gv-consolidated-hint">
                                                                <i className="fas fa-magic"></i> Quét mã QR liên tục cho cả {shift.items.length} phòng, không lo nhầm phòng!
                                                            </small>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* DANH SÁCH CHI TIẾT TỪNG PHÒNG RIÊNG LẺ (MẶC ĐỊNH ẨN - KHI NÀO CHỌN CHI TIẾT MỚI HIỆN RA) */}
                                    {hasMultipleRooms && (
                                        <div className="gv-toggle-detail-container">
                                            <button
                                                type="button"
                                                className={`btn gv-btn-toggle-detail ${expandedShifts[shift.loai_truc] ? 'is-expanded' : ''}`}
                                                onClick={() => toggleShiftDetail(shift.loai_truc)}
                                                title="Bấm để xem danh sách và điểm danh riêng từng phòng"
                                            >
                                                <i className={`fas ${expandedShifts[shift.loai_truc] ? 'fa-chevron-up' : 'fa-list-ul'}`}></i>
                                                <span>
                                                    {expandedShifts[shift.loai_truc] 
                                                        ? `Thu gọn danh sách từng phòng (${shift.items.length} phòng)` 
                                                        : `Hoặc điểm danh riêng từng phòng (${shift.items.length} phòng)`}
                                                </span>
                                                <i className={`fas ${expandedShifts[shift.loai_truc] ? 'fa-chevron-up' : 'fa-chevron-down'} toggle-arrow`}></i>
                                            </button>

                                            {expandedShifts[shift.loai_truc] && (
                                                <div className="gv-expanded-room-content">
                                                    <div className="gv-sub-section-divider">
                                                        <i className="fas fa-door-open text-primary"></i>
                                                        <span>Danh sách chi tiết từng phòng phụ trách:</span>
                                                    </div>

                                                    <div className="gv-cards-grid">
                                                        {shift.items.map(item => {
                                                            const state = item.khung_gio.state;
                                                            const isChot = isItemChot(item);

                                                            return (
                                                                <div key={item.id} className={`gv-duty-card ${shift.isAn ? 'card-an' : 'card-ngu'}`}>
                                                                    <div className="gv-card-top">
                                                                        <div className="gv-card-icon" style={{ backgroundColor: `${shift.iconColor}15`, color: shift.iconColor }}>
                                                                            <i className={shift.iconClass}></i>
                                                                        </div>
                                                                        <div className="gv-card-shift-meta">
                                                                            <span className="gv-shift-type">{shift.title}</span>
                                                                            <span className="gv-shift-time">
                                                                                {item.khung_gio.start} – {item.khung_gio.end}
                                                                            </span>
                                                                        </div>
                                                                        <div className="gv-shift-status-tag">
                                                                            {state === 'sap_den' && <span className="tag-pending">⏳ Sắp diễn ra</span>}
                                                                            {state === 'dang_dien_ra' && <span className="tag-active">🟢 Đang diễn ra</span>}
                                                                            {state === 'da_qua_gio' && <span className="tag-closed">🔒 Đã quá giờ</span>}
                                                                        </div>
                                                                    </div>

                                                                    <div className="gv-card-body">
                                                                        <div className="gv-room-highlight">
                                                                            <span className="gv-room-label">Phòng phụ trách</span>
                                                                            <span className="gv-room-code">
                                                                                <i className="fas fa-door-open"></i> {item.ma_phong_id}
                                                                            </span>
                                                                        </div>

                                                                        <div className="gv-duty-stats">
                                                                            <div className="gv-stat-pill">
                                                                                <span className="label">Nhiệm vụ:</span>
                                                                                <span className="val font-semibold">
                                                                                    {item.nhiem_vu === 0 ? '✓ Điểm danh HS' : '👀 Giám sát ca'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="gv-stat-pill">
                                                                                <span className="label">Sĩ số phòng:</span>
                                                                                <span className="val font-bold">{item.total_students} HS</span>
                                                                            </div>
                                                                            <div className="gv-stat-pill">
                                                                                <span className="label">Đã điểm danh:</span>
                                                                                <span className="val font-bold text-primary">
                                                                                    {isChot ? `${item.so_co_mat} em` : `${item.da_diem_danh_count || 0}/${item.total_students} HS`}
                                                                                </span>
                                                                            </div>
                                                                            {isChot ? (
                                                                                <div className="gv-stat-pill">
                                                                                    <span className="label">HS vắng:</span>
                                                                                    <span className={`val font-bold ${item.tong_vang > 0 ? 'text-danger' : 'text-success'}`}>
                                                                                        {item.tong_vang || 0} em
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="gv-stat-pill">
                                                                                    <span className="label">Đang lưu nháp:</span>
                                                                                    <span className="val text-amber-600 font-bold">{item.draft_count} em</span>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Trạng thái chốt & hiển thị sĩ số, HS vắng sau khi chốt */}
                                                                        <div className="gv-chot-status-box">
                                                                            {isChot ? (
                                                                                <div className="status-badge success">
                                                                                    <i className="fas fa-check-circle"></i>
                                                                                    <div style={{ flex: 1 }}>
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                            <strong>ĐÃ CHỐT SỔ LÊN TỔNG</strong>
                                                                                            <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700 }}>Sĩ số: {item.total_students} HS</span>
                                                                                        </div>
                                                                                        <div style={{ fontSize: '0.8rem', marginTop: 3, display: 'flex', gap: 8, color: '#065f46' }}>
                                                                                            <span>Có mặt: <strong>{item.so_co_mat}</strong> em</span>
                                                                                            <span>•</span>
                                                                                            <span>Vắng: <strong className={item.tong_vang > 0 ? 'text-danger' : 'text-success'}>{item.tong_vang || 0} em</strong></span>
                                                                                        </div>
                                                                                        {item.danh_sach_vang && item.danh_sach_vang.length > 0 && (
                                                                                            <div style={{ marginTop: 4, fontSize: '0.76rem', color: '#b91c1c', background: '#fef2f2', padding: '3px 6px', borderRadius: 4, border: '1px solid #fecaca' }}>
                                                                                                <strong>Vắng: </strong>
                                                                                                {item.danh_sach_vang.map(v => `${v.ho_ten} (${v.lop || ''})`).join(', ')}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ) : item.draft_count > 0 ? (
                                                                                <div className="status-badge info">
                                                                                    <i className="fas fa-edit"></i>
                                                                                    <div>
                                                                                        <strong>ĐANG LƯU BẢN NHÁP</strong>
                                                                                        <small>Đã ghi nhận {item.draft_count}/{item.total_students} học sinh</small>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="status-badge neutral">
                                                                                    <i className="fas fa-clock"></i>
                                                                                    <div>
                                                                                        <strong>CHƯA ĐIỂM DANH</strong>
                                                                                        <small>Chưa ghi nhận dữ liệu</small>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {!item.can_diem_danh && (
                                                                            <p className="gv-restricted-note">
                                                                                <i className="fas fa-info-circle"></i> {item.note_quyen}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    <div className="gv-card-footer">
                                                                        <button
                                                                            type="button"
                                                                            className="btn gv-btn-enter-room w-100"
                                                                            onClick={() => navigate(`${shift.path}?ngay=${item.ngay || dutyData.today}&phong=${item.ma_phong_id}`)}
                                                                        >
                                                                            <i className="fas fa-qrcode"></i> Điểm danh {item.ma_phong_id}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* MODAL XEM KHUNG GIỜ VÀ QUY ĐỊNH BÁN TRÚ */}
            {showRulesModal && (
                <div className="gv-modal-backdrop" onClick={() => setShowRulesModal(false)}>
                    <div className="gv-modal-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="gv-modal-drag-handle"></div>
                        <div className="gv-modal-header">
                            <div className="gv-modal-title-wrap">
                                <i className="fas fa-clock text-primary"></i>
                                <h3>Khung giờ & Quy định Trực Bán Trú</h3>
                            </div>
                            <button className="gv-modal-close-btn" onClick={() => setShowRulesModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="gv-modal-body">
                            <div className="gv-rule-item">
                                <div className="gv-rule-badge orange">1. Ăn Trưa</div>
                                <div className="gv-rule-detail">
                                    <strong>10:55 – 11:30</strong>
                                    <p>Hệ thống mở cổng điểm danh cho Giáo viên phụ trách ăn trưa. Quét mã QR thẻ học sinh hoặc chọn trạng thái Có mặt / Vắng.</p>
                                </div>
                            </div>

                            <div className="gv-rule-item">
                                <div className="gv-rule-badge indigo">2. Điểm Danh Ngủ</div>
                                <div className="gv-rule-detail">
                                    <strong>11:30 – 12:05</strong>
                                    <p>Hệ thống mở cổng điểm danh cho Giáo viên phụ trách phòng ngủ. Ổn định chỗ nằm, giữ trật tự và chốt sĩ số lên Ban Quản Lý.</p>
                                </div>
                            </div>

                            <div className="gv-rule-item">
                                <div className="gv-rule-badge purple">3. Học Sinh Ngủ</div>
                                <div className="gv-rule-detail">
                                    <strong>11:45 – 13:15</strong>
                                    <p>Học sinh ngủ trưa tập trung. Tắt đèn, giữ yên tĩnh và trật tự tuyệt đối trong toàn bộ phòng ngủ.</p>
                                </div>
                            </div>

                            <div className="gv-rule-item">
                                <div className="gv-rule-badge cyan">4. Báo Thức Chiều</div>
                                <div className="gv-rule-detail">
                                    <strong>13:15</strong>
                                    <p>Đánh thức học sinh dậy, vệ sinh cá nhân, xếp gọn chăn gối để chuẩn bị vào học tiết chiều.</p>
                                    <div style={{ marginTop: 6, color: '#dc2626', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fas fa-exclamation-triangle"></i>
                                        <span>Lưu ý nghiêm ngặt: Giáo viên tuyệt đối không được đánh thức học sinh trước 13h00!</span>
                                    </div>
                                </div>
                            </div>

                            <div className="gv-rule-note">
                                <i className="fas fa-lightbulb"></i>
                                <span><strong>Mẹo thao tác trên điện thoại:</strong> Khi phụ trách từ 2 phòng trở lên, hãy bấm <strong>"VÀO ĐIỂM DANH TẤT CẢ PHÒNG"</strong> để quét mã QR liên tục mà không cần chuyển phòng qua lại!</span>
                            </div>
                        </div>

                        <div className="gv-modal-footer">
                            <button className="btn btn-primary w-100" onClick={() => setShowRulesModal(false)}>
                                Đã hiểu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CẢNH BÁO KHI CHƯA ĐỦ ĐIỀU KIỆN MỞ BÁO CÁO */}
            {reportBlockedInfo && (
                <div className="gv-modal-backdrop" onClick={() => setReportBlockedInfo(null)}>
                    <div className="gv-blocked-modal-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="gv-modal-drag-handle"></div>

                        <div className="gv-blocked-modal-header">
                            <div className="gv-bm-icon">
                                <i className="fas fa-tasks"></i>
                            </div>
                            <div className="gv-bm-header-text">
                                <h3 className="gv-bm-title">Điều Kiện Mở Báo Cáo</h3>
                                <div className="gv-bm-pills">
                                    <span className="gv-bm-badge ca">{reportBlockedInfo.ca_title}</span>
                                    {reportBlockedInfo.ma_phong && (
                                        <span className="gv-bm-badge room">
                                            <i className="fas fa-door-open"></i> {reportBlockedInfo.ma_phong}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button type="button" className="gv-modal-close-btn" onClick={() => setReportBlockedInfo(null)} aria-label="Đóng">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="gv-blocked-modal-body">
                            <div className="gv-bm-summary-note">
                                <i className="fas fa-info-circle"></i>
                                <span>Để đảm bảo số liệu chính xác lên Ban Quản Lý, Thầy/Cô cần đáp ứng 2 điều kiện sau:</span>
                            </div>

                            <div className="gv-bm-steps-list">
                                {/* BƯỚC 1: ĐIỂM DANH & CHỐT SỔ */}
                                <div className={`gv-bm-step-card ${reportBlockedInfo.check?.allChot ? 'is-ok' : 'is-pending'}`}>
                                    <div className="gv-bm-step-indicator">
                                        <i className={`fas ${reportBlockedInfo.check?.allChot ? 'fa-check' : 'fa-clipboard-list'}`}></i>
                                    </div>
                                    <div className="gv-bm-step-main">
                                        <div className="gv-bm-step-top">
                                            <span className="gv-bm-step-name">1. Chốt sổ điểm danh</span>
                                            <span className={`gv-bm-status-pill ${reportBlockedInfo.check?.allChot ? 'pill-ok' : 'pill-warn'}`}>
                                                {reportBlockedInfo.check?.allChot ? '✓ Đã xong' : 'Chưa hoàn thành'}
                                            </span>
                                        </div>

                                        {reportBlockedInfo.check?.allChot ? (
                                            <p className="gv-bm-step-text ok-text">✓ Đã hoàn thành điểm danh và chốt sổ tất cả các phòng.</p>
                                        ) : (
                                            <div className="gv-bm-step-details">
                                                <div className="gv-bm-room-chips-row">
                                                    <span className="label">Phòng chưa chốt:</span>
                                                    <div className="chips">
                                                        {(reportBlockedInfo.check?.unchotRooms || [reportBlockedInfo.ma_phong]).map(r => (
                                                            <span key={r} className="room-chip">{r}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="gv-bm-step-text warn-text">
                                                    Thầy/Cô cần điểm danh và bấm "Chốt sổ" để hệ thống lấy số liệu tự động.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* BƯỚC 2: KHUNG GIỜ BÁO CÁO */}
                                <div className={`gv-bm-step-card ${reportBlockedInfo.check?.timeState === 'trong_gio' ? 'is-ok' : reportBlockedInfo.check?.timeState === 'da_qua_gio' ? 'is-danger' : 'is-pending'}`}>
                                    <div className="gv-bm-step-indicator">
                                        <i className={`fas ${reportBlockedInfo.check?.timeState === 'trong_gio' ? 'fa-check' : 'fa-clock'}`}></i>
                                    </div>
                                    <div className="gv-bm-step-main">
                                        <div className="gv-bm-step-top">
                                            <span className="gv-bm-step-name">2. Khung giờ báo cáo</span>
                                            <span className={`gv-bm-status-pill ${reportBlockedInfo.check?.timeState === 'trong_gio' ? 'pill-ok' : reportBlockedInfo.check?.timeState === 'da_qua_gio' ? 'pill-danger' : 'pill-time'}`}>
                                                {reportBlockedInfo.check?.timeState === 'trong_gio' ? '🟢 Đang mở' : reportBlockedInfo.check?.timeState === 'da_qua_gio' ? 'Đã quá giờ' : '⏳ Chưa tới giờ'}
                                            </span>
                                        </div>

                                        <div className="gv-bm-time-strip">
                                            <div className="time-strip-item">
                                                <span className="strip-title"><i className="fas fa-calendar-check"></i> Khung giờ:</span>
                                                <strong className="strip-val">{reportBlockedInfo.check?.timeRange || (reportBlockedInfo.ca_truc === 0 ? '11:15 – 11:45' : '11:40 – 12:45')}</strong>
                                            </div>
                                            <div className="time-strip-item live">
                                                <span className="strip-title"><span className="pulse-dot"></span> Hiện tại:</span>
                                                <strong className="strip-val">{reportBlockedInfo.check?.gioHienTai}</strong>
                                            </div>
                                        </div>

                                        <div className="gv-bm-step-details">
                                            {reportBlockedInfo.check?.timeState === 'trong_gio' && (
                                                <p className="gv-bm-step-text ok-text">✓ Đang trong khung giờ báo cáo (Còn {reportBlockedInfo.check?.minsRemaining} phút).</p>
                                            )}
                                            {reportBlockedInfo.check?.timeState === 'sap_den' && (
                                                <p className="gv-bm-step-text time-text">
                                                    ⏳ Cổng báo cáo sẽ mở lúc <strong>{reportBlockedInfo.check?.startStr}</strong>
                                                    {reportBlockedInfo.check?.minsWait && reportBlockedInfo.check.minsWait <= 120 
                                                        ? ` (còn ${reportBlockedInfo.check.minsWait} phút)`
                                                        : ` (trưa nay)`
                                                    }.
                                                </p>
                                            )}
                                            {reportBlockedInfo.check?.timeState === 'da_qua_gio' && (
                                                <p className="gv-bm-step-text danger-text">Đã quá giờ báo cáo ca trực (đã đóng lúc {reportBlockedInfo.check?.endStr}).</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="gv-blocked-modal-footer">
                            {!reportBlockedInfo.check?.allChot ? (
                                <button
                                    type="button"
                                    className="btn gv-bm-btn-action"
                                    onClick={() => {
                                        const path = reportBlockedInfo.ca_truc === 0 ? '/diemdanh-an' : '/diemdanh-ngu';
                                        const pParam = reportBlockedInfo.ma_phong ? (reportBlockedInfo.ma_phong.includes(',') ? `&gop=1` : `&phong=${reportBlockedInfo.ma_phong}`) : '&gop=1';
                                        setReportBlockedInfo(null);
                                        navigate(`${path}?ngay=${reportBlockedInfo.ngay}${pParam}`);
                                    }}
                                >
                                    <i className="fas fa-qrcode"></i>
                                    <span>Vào Điểm Danh & Chốt Sổ Ngay</span>
                                    <i className="fas fa-arrow-right"></i>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn gv-bm-btn-secondary"
                                    onClick={() => setReportBlockedInfo(null)}
                                >
                                    Đã Hiểu
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL GỬI BÁO CÁO CA TRỰC LÊN ADMIN / BAN QUẢN LÝ */}
            <BaoCaoTrucModal
                isOpen={showBaoCaoModal}
                onClose={() => setShowBaoCaoModal(false)}
                initialNgay={baoCaoTarget.ngay}
                initialCaTruc={baoCaoTarget.ca_truc}
                initialMaPhong={baoCaoTarget.ma_phong}
                isGiamSat={baoCaoTarget.is_giam_sat}
                roomList={dutyData?.assignments || []}
                onSuccess={() => {
                    fetchDuty();
                }}
            />
        </div>
    );
}
