import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../services/api';
import './BaoCaoTrucModal.css';

/**
 * BaoCaoTrucModal - Giao diện Báo Cáo Ca Trực cho Giáo Viên
 * Quy chuẩn theo đúng nghiệp vụ trường:
 * - Điểm danh Ăn: Ra thẳng Báo Cáo Ăn (chỉ GV Giám Sát mới chọn Giám sát ATTP).
 * - Điểm danh Ngủ: Ra thẳng Báo Cáo Ngủ (bất kỳ GV nào phụ trách phòng đó đều báo cáo được).
/**
 * Chuẩn hóa Sĩ số: loại bỏ tiền tố tên phòng (ví dụ "D31 35/35" -> "35/35", "D.33 28/35" -> "28/35")
 */
const cleanSiSoText = (raw, roomCode) => {
    if (!raw) return '';
    let str = String(raw).trim();
    const fractionMatch = str.match(/\b\d+\s*\/\s*\d+\b/);
    if (fractionMatch) {
        return fractionMatch[0].replace(/\s+/g, '');
    }
    str = str.replace(/^(phòng|phong|p\.?)\s*[a-z0-9.]+\s*[:\s-]*/i, '');
    str = str.replace(/^[a-z]+[._-]?[0-9]+\s*[:\s-]*/i, '');
    if (roomCode) {
        const rooms = String(roomCode).split(new RegExp('[,;\\-/]+')).map(r => r.trim()).filter(Boolean);
        for (const r of rooms) {
            if (/[a-zA-Z]/.test(r)) {
                const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const reg = new RegExp('(^|\\s)' + escaped + '[:\\s-]*', 'gi');
                str = str.replace(reg, '$1').trim();
            }
        }
    }
    return str.trim();
};

export default function BaoCaoTrucModal({
    isOpen,
    onClose,
    initialNgay,
    initialCaTruc = 0, // 0 = Ăn, 1 = Ngủ, 2 = Giám sát
    initialMaPhong = '',
    roomList = [],
    isGiamSat = false,
    onSuccess
}) {
    const [submitting, setSubmitting] = useState(false);
    const [loadingAuto, setLoadingAuto] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Ca trực: 0 = Ăn, 1 = Ngủ, 2 = Giám sát
    const [caTruc, setCaTruc] = useState(initialCaTruc !== undefined ? initialCaTruc : 0);
    const [ngay, setNgay] = useState(initialNgay || new Date().toISOString().split('T')[0]);
    const [hoTenGV, setHoTenGV] = useState('');
    const [maPhong, setMaPhong] = useState(initialMaPhong || '');
    const [userIsGiamSat, setUserIsGiamSat] = useState(Boolean(isGiamSat));
    const [daBaoCaoBoiAi, setDaBaoCaoBoiAi] = useState('');

    // Dữ liệu theo form
    const [tinhHinh, setTinhHinh] = useState('Tốt');
    const [siSo, setSiSo] = useState('');
    const [soHsPhep, setSoHsPhep] = useState(0);
    const [danhSachVang, setDanhSachVang] = useState('');
    const [hsViPham, setHsViPham] = useState('');
    const [ghiChu, setGhiChu] = useState('');
    const [vsatThucPham, setVsatThucPham] = useState('');

    // Trạng thái báo cáo
    const [linkGoogleForm, setLinkGoogleForm] = useState('https://forms.gle/6B4GC5aG1KyEuQTaA');
    const [daBaoCao, setDaBaoCao] = useState(false);
    const [thoiGianBaoCao, setThoiGianBaoCao] = useState(null);

    // Ràng buộc thời gian & điểm danh
    const [khungGio, setKhungGio] = useState(null);
    const [daDiemDanh, setDaDiemDanh] = useState(true);
    const [choPhepBaoCao, setChoPhepBaoCao] = useState(true);
    const [lyDoKhoa, setLyDoKhoa] = useState(null);
    const [isAdminOverride, setIsAdminOverride] = useState(false);
    const abortRef = useRef(null);
    const [liveData, setLiveData] = useState(null);

    const handleSyncLatestLive = () => {
        if (!liveData) return;
        setSiSo(cleanSiSoText(liveData.si_so || '', maPhong));
        setSoHsPhep(liveData.so_hs_phep || 0);
        setDanhSachVang(liveData.danh_sach_vang || '');
    };

    // Tự động tải sĩ số, HS vắng không phép và thông tin báo cáo
    const loadAutoInfo = useCallback(async (targetNgay, targetCa, targetPhong) => {
        if (!targetPhong && targetCa !== 2) return;
        
        // Hủy request trước đó nếu đang chạy để tránh dội kết quả cũ đè dữ liệu mới
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        setLoadingAuto(true);
        setErrorMessage('');
        try {
            const res = await api.get('/api/baocaotruc/lay-thong-tin-tu-dong', {
                params: {
                    ngay: targetNgay,
                    ca_truc: targetCa,
                    ma_phong: targetPhong,
                },
                signal: controller.signal
            });
            if (res.data?.ok) {
                const data = res.data;
                const live = data.live_diem_danh || {
                    si_so: data.si_so || '',
                    danh_sach_vang: data.danh_sach_vang || '',
                    so_hs_phep: data.so_hs_phep || 0
                };
                setLiveData(live);

                setHoTenGV(data.ho_ten_gv || '');
                setLinkGoogleForm(data.link_google_form || 'https://forms.gle/6B4GC5aG1KyEuQTaA');
                setDaBaoCao(Boolean(data.da_bao_cao));
                setDaBaoCaoBoiAi(data.da_bao_cao_boi_ai || '');
                setUserIsGiamSat(Boolean(data.is_giam_sat || isGiamSat));

                // Cập nhật ràng buộc khung giờ & điểm danh
                setKhungGio(data.khung_gio_quy_dinh || null);
                setDaDiemDanh(data.da_diem_danh !== undefined ? data.da_diem_danh : true);
                setChoPhepBaoCao(data.cho_phep_bao_cao !== undefined ? data.cho_phep_bao_cao : true);
                setLyDoKhoa(data.ly_do_khoa || null);
                setIsAdminOverride(Boolean(data.is_admin_override));

                if (data.bao_cao_cu) {
                    const bc = data.bao_cao_cu;
                    setSiSo(cleanSiSoText(bc.si_so || data.si_so || '', targetPhong));
                    setSoHsPhep(bc.so_hs_phep !== undefined ? bc.so_hs_phep : (data.so_hs_phep || 0));
                    setDanhSachVang(bc.danh_sach_vang || '');
                    setTinhHinh(bc.tinh_hinh || 'Tốt');
                    setHsViPham(bc.hs_vi_pham || '');
                    setGhiChu(bc.ghi_chu || '');
                    setVsatThucPham(bc.vsat_thuc_pham || '');
                    setThoiGianBaoCao(bc.created_at);
                } else {
                    setSiSo(cleanSiSoText(live.si_so || data.si_so || '', targetPhong));
                    setSoHsPhep(live.so_hs_phep || 0);
                    // danh_sach_vang đã tự động loại bỏ HS phép
                    setDanhSachVang(live.danh_sach_vang || '');
                    setTinhHinh('Tốt');
                    setHsViPham('');
                    setGhiChu('');
                    setVsatThucPham(targetCa === 2 ? 'Đạt tiêu chuẩn, lưu mẫu thức ăn đầy đủ' : '');
                    setThoiGianBaoCao(null);
                }
            }
        } catch (err) {
            if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
                console.error('Lỗi lấy thông tin tự động:', err);
                setErrorMessage(err.response?.data?.error || 'Không thể đồng bộ tự động số liệu sĩ số.');
            }
        } finally {
            if (abortRef.current === controller) {
                setLoadingAuto(false);
            }
        }
    }, [isGiamSat]);

    // Đồng bộ và tải số liệu khi mở modal hoặc thay đổi phòng/ca trực từ props
    useEffect(() => {
        if (isOpen) {
            const currentCa = initialCaTruc !== undefined ? initialCaTruc : 0;
            const currentNgay = initialNgay || new Date().toISOString().split('T')[0];
            const currentPhong = initialMaPhong || (roomList[0]?.ma_phong || roomList[0]?.ma_phong_id || '');

            setCaTruc(currentCa);
            setNgay(currentNgay);
            setMaPhong(currentPhong);
            setUserIsGiamSat(Boolean(isGiamSat));
            setErrorMessage('');
            setSuccessMessage('');

            // Reset dữ liệu về trống trong khi đang tải để không hiển thị nhầm dữ liệu phòng cũ
            setSiSo('');
            setSoHsPhep(0);
            setDanhSachVang('');
            setHsViPham('');
            setGhiChu('');
            setVsatThucPham('');
            setDaBaoCao(false);
            setDaBaoCaoBoiAi('');

            loadAutoInfo(currentNgay, currentCa, currentPhong);
        } else {
            if (abortRef.current) {
                abortRef.current.abort();
            }
        }
    }, [isOpen, initialNgay, initialCaTruc, initialMaPhong, roomList, isGiamSat, loadAutoInfo]);

    // Chuyển ca trực trong modal
    const handleSwitchCaTruc = (newCa) => {
        setCaTruc(newCa);
        loadAutoInfo(ngay, newCa, maPhong);
    };

    // Đếm số lượng HS vắng từ danh sách
    const calculatedAbsentCount = useMemo(() => {
        if (!danhSachVang) return 0;
        return danhSachVang
            .split(/\r?\n|;/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.toLowerCase().startsWith('không') && !s.toLowerCase().startsWith('ko')).length;
    }, [danhSachVang]);

    // Gửi báo cáo lên hệ thống
    const handleSubmit = async (e) => {
        e.preventDefault();
        const todayStr = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        if (ngay > todayStr) {
            setErrorMessage('Không thể gửi báo cáo cho ngày chưa đến trong tương lai. Hệ thống chỉ cho phép thao tác với ngày hiện tại và ngày quá khứ.');
            return;
        }

        const targetPhong = caTruc === 2 ? (maPhong || 'GIÁM SÁT') : maPhong;
        if (!targetPhong) {
            setErrorMessage('Vui lòng chọn phòng trực để báo cáo');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const res = await api.post('/api/baocaotruc/gui-bao-cao', {
                ngay,
                ca_truc: caTruc,
                ma_phong: targetPhong,
                si_so: siSo,
                so_hs_phep: soHsPhep,
                so_hs_vang: calculatedAbsentCount,
                danh_sach_vang: danhSachVang,
                tinh_hinh: tinhHinh,
                hs_vi_pham: caTruc === 1 ? hsViPham : null, // Chỉ ca ngủ mới có vi phạm nề nếp
                ghi_chu: ghiChu,
                vsat_thuc_pham: caTruc === 2 ? vsatThucPham : null, // Chỉ ca giám sát mới có VSATTP
            });

            if (res.data?.ok) {
                setSuccessMessage('✓ Đã gửi báo cáo ca trực lên Ban Quản Lý thành công!');
                setDaBaoCao(true);
                setThoiGianBaoCao(new Date());
                if (onSuccess) onSuccess(res.data.record);
                setTimeout(() => {
                    onClose();
                }, 1600);
            }
        } catch (err) {
            setErrorMessage(err.response?.data?.error || 'Có lỗi khi gửi báo cáo ca trực.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const isFutureDate = ngay > todayStr;

    // Tiêu đề & Icon theo đúng ca trực (Rút gọn tối ưu cho mobile)
    const isCaNgu = (initialCaTruc === 1) || (caTruc === 1);
    const isCaGiamSat = !isCaNgu && caTruc === 2;

    // Ràng buộc thời gian & điểm danh
    const isQuaGio = khungGio?.state === 'qua_gio';
    const isChuaDen = khungGio?.state === 'chua_den';
    const canReportNow = !isFutureDate && (isAdminOverride || (choPhepBaoCao && !isQuaGio && !isChuaDen && daDiemDanh));
    const isInputsDisabled = isFutureDate || (!isAdminOverride && isQuaGio);

    const modalTitle = isCaNgu
        ? 'Báo Cáo Phòng Ngủ'
        : isCaGiamSat
            ? 'Báo Cáo Giám Sát'
            : 'Báo Cáo Ca Ăn Trưa';

    const modalSub = isCaNgu
        ? 'Báo cáo & tình hình nề nếp phòng ngủ'
        : isCaGiamSat
            ? 'Giám sát nề nếp toàn trường & ATTP'
            : 'Báo cáo sĩ số & tình hình bữa ăn';

    const headerIcon = isCaNgu ? 'fas fa-bed' : isCaGiamSat ? 'fas fa-user-shield' : 'fas fa-utensils';
    const headerColorClass = isCaNgu ? 'icon-ngu' : isCaGiamSat ? 'icon-giamsat' : 'icon-an';

    return (
        <div className="bct-modal-backdrop" onClick={onClose}>
            <div className="bct-modal-sheet" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="bct-modal-header">
                    <div className="bct-header-left">
                        <div className={`bct-header-icon ${headerColorClass}`}>
                            <i className={headerIcon}></i>
                        </div>
                        <div>
                            <h3 className="bct-modal-title">{modalTitle}</h3>
                            <p className="bct-modal-sub">{modalSub}</p>
                        </div>
                    </div>
                    <button type="button" className="bct-close-btn" onClick={onClose} aria-label="Đóng">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} className="bct-modal-body">
                    {/* Cảnh báo ngày chưa đến trong tương lai */}
                    {isFutureDate && (
                        <div className="bct-alert-badge danger">
                            <i className="fas fa-calendar-times"></i>
                            <div>
                                <strong>Ngày chưa đến ({ngay})</strong>
                                <small>Hệ thống không cho phép gửi hoặc cập nhật báo cáo cho những ngày trong tương lai.</small>
                            </div>
                        </div>
                    )}

                    {/* Trạng thái nếu phòng đã được gửi báo cáo */}
                    {daBaoCao && (
                        <div className={`bct-alert-badge ${isQuaGio && !isAdminOverride ? 'neutral' : 'success'}`}>
                            <i className={`fas ${isQuaGio && !isAdminOverride ? 'fa-lock' : 'fa-check-circle'}`}></i>
                            <div>
                                <strong>
                                    {isCaNgu && daBaoCaoBoiAi && daBaoCaoBoiAi !== hoTenGV
                                        ? `Phòng này đã được Thầy/Cô ${daBaoCaoBoiAi} gửi báo cáo`
                                        : 'Phòng này đã được gửi báo cáo lên Ban Quản Lý'}
                                </strong>
                                {thoiGianBaoCao && (
                                    <small>
                                        Lúc {new Date(thoiGianBaoCao).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date(thoiGianBaoCao).toLocaleDateString('vi-VN')}
                                        {isQuaGio && !isAdminOverride
                                            ? ` • Đã hết thời hạn cập nhật (sau ${khungGio?.gio_dong || (isCaNgu ? '12:45' : '11:45')})`
                                            : ` • Thầy/Cô có thể chỉnh sửa và cập nhật lại trước ${khungGio?.gio_dong || (isCaNgu ? '12:45' : '11:45')}`}
                                    </small>
                                )}
                            </div>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="bct-alert-badge danger">
                            <i className="fas fa-exclamation-circle"></i>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="bct-alert-badge success">
                            <i className="fas fa-check-circle"></i>
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {loadingAuto && (
                        <div className="bct-loading-strip">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>Đang tự động đồng bộ sĩ số và danh sách vắng...</span>
                        </div>
                    )}

                    {/* ĐỐI VỚI CA ĂN: NẾU VÀ CHỈ NẾU LÀ GV GIÁM SÁT THÌ MỚI CÓ NÚT CHUYỂN GIÁM SÁT.
                        NẾU LÀ GV TRỰC ĂN BÌNH THƯỜNG -> RA THẲNG BÁO CÁO ĂN, KHÔNG HIỆN NÚT NÀY.
                        CÒN LẠI CA NGỦ -> RA THẲNG BÁO DANH NGỦ, KHÔNG CÓ TAB ĂN/NGỦ GÌ LẪN LỘN */}
                    {!isCaNgu && userIsGiamSat && (
                        <div className="bct-an-role-toggle">
                            <span className="bct-role-label">Chọn nhiệm vụ ca ăn:</span>
                            <div className="bct-role-buttons">
                                <button
                                    type="button"
                                    className={`bct-role-btn ${caTruc === 0 ? 'active' : ''}`}
                                    onClick={() => handleSwitchCaTruc(0)}
                                >
                                    <i className="fas fa-utensils"></i> Báo Cáo Trực Ăn
                                </button>
                                <button
                                    type="button"
                                    className={`bct-role-btn ${caTruc === 2 ? 'active' : ''}`}
                                    onClick={() => handleSwitchCaTruc(2)}
                                >
                                    <i className="fas fa-user-shield"></i> Giáo Viên Giám Sát (ATTP)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        1. BÁO CÁO TRỰC ĂN (Ra thẳng báo cáo ăn)
                        ══════════════════════════════════════════════════════════ */}
                    {!isCaNgu && caTruc === 0 && (
                        <div className="bct-form-fields-group">
                            <div className="bct-group-title text-orange">
                                <i className="fas fa-utensils"></i> Thông Tin Báo Cáo Ca Ăn
                            </div>

                            {/* 1 & 2. Họ tên GV & Phòng ăn (Gộp 1 hàng 2 cột gọn trên mobile) */}
                            <div className="bct-inline-2cols">
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>GV báo cáo <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text bg-locked"
                                        value={hoTenGV}
                                        readOnly
                                        title="Tự động nhận diện từ tài khoản"
                                    />
                                </div>
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>Phòng ăn <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text bg-locked font-bold text-indigo text-center"
                                        value={maPhong}
                                        readOnly
                                        title="Phòng ăn theo phân công trực"
                                        required
                                    />
                                </div>
                            </div>

                            {daBaoCao && liveData && (cleanSiSoText(liveData.si_so, maPhong) !== cleanSiSoText(siSo, maPhong) || liveData.danh_sach_vang !== danhSachVang) && (
                                <div style={{
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    marginBottom: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    fontSize: '0.82rem',
                                    color: '#1e40af'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fas fa-info-circle text-primary"></i>
                                        <span>Điểm danh mới nhất: <strong>{cleanSiSoText(liveData.si_so, maPhong)}</strong> (Hiện tại trong form: {cleanSiSoText(siSo, maPhong) || '—'})</span>
                                    </div>
                                    <button
                                        type="button"
                                        style={{
                                            border: '1px solid #3b82f6',
                                            borderRadius: 6,
                                            padding: '2px 8px',
                                            background: '#fff',
                                            color: '#1d4ed8',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                        onClick={handleSyncLatestLive}
                                    >
                                        <i className="fas fa-sync-alt" style={{ marginRight: 4 }}></i> Đồng bộ mới
                                    </button>
                                </div>
                            )}

                            {/* Dải Sĩ số, Phép & HS vắng tự động từ Điểm danh (1 dòng siêu gọn) */}
                            <div className="bct-auto-summary-strip">
                                <div className="bct-summary-item" title="Sĩ số có mặt / Tổng số HS phòng">
                                    <span className="lbl"><i className="fas fa-users"></i> Sĩ số:</span>
                                    <span className="val font-bold text-success">{cleanSiSoText(siSo, maPhong) || '—'}</span>
                                </div>
                                <span className="bct-summary-divider">•</span>
                                <div className={`bct-summary-item ${soHsPhep > 0 ? 'text-amber-700' : ''}`} title="Học sinh có phép (không tính vào vắng)">
                                    <span className="lbl"><i className="fas fa-file-medical"></i> Phép:</span>
                                    <span className={`val font-bold ${soHsPhep > 0 ? 'text-amber-700' : 'text-slate'}`}>{soHsPhep} em</span>
                                </div>
                                <span className="bct-summary-divider">•</span>
                                <div className="bct-summary-item" title="Học sinh vắng không phép">
                                    <span className="lbl"><i className="fas fa-user-times"></i> Vắng:</span>
                                    <span className={`val font-bold ${calculatedAbsentCount > 0 ? 'text-danger' : 'text-slate'}`}>
                                        {calculatedAbsentCount > 0 ? `${calculatedAbsentCount} em` : '0 em'}
                                    </span>
                                </div>
                            </div>

                            {/* 3. Tình hình chung */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Tình hình bữa ăn <span className="text-danger">*</span></span>
                                    {isInputsDisabled && <span className="bct-locked-tag"><i className="fas fa-lock"></i> Đã khóa</span>}
                                </label>
                                <input
                                    type="text"
                                    className={`bct-input-text ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    value={tinhHinh}
                                    onChange={(e) => setTinhHinh(e.target.value)}
                                    placeholder="Tốt / Bình thường..."
                                    required
                                    disabled={isInputsDisabled}
                                />
                                <div className="bct-quick-chips">
                                    <span className="bct-chips-hint">Chọn:</span>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Tốt' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Tốt')}>Tốt</button>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Bình thường' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Bình thường')}>Bình thường</button>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Ổn định, sạch sẽ' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Ổn định, sạch sẽ')}>Ổn định</button>
                                </div>
                            </div>

                            {/* 4. Góp ý / Ghi chú */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Góp ý / Đề xuất <small className="bct-field-sub">(nếu có)</small></span>
                                </label>
                                <textarea
                                    className={`bct-textarea ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    rows={1}
                                    value={ghiChu}
                                    onChange={(e) => setGhiChu(e.target.value)}
                                    placeholder="Khẩu phần ăn, vệ sinh (nếu có)..."
                                    disabled={isInputsDisabled}
                                />
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        2. BÁO CÁO TRỰC NGỦ (Ra thẳng báo danh ngủ, phòng đó ai báo cũng được)
                        ══════════════════════════════════════════════════════════ */}
                    {isCaNgu && (
                        <div className="bct-form-fields-group">
                            <div className="bct-group-title text-indigo">
                                <i className="fas fa-bed"></i> Thông Tin Báo Danh & Phòng Ngủ
                            </div>

                            {/* 1 & 2. Họ tên GV & Phòng ngủ (Gộp 1 hàng 2 cột gọn trên mobile) */}
                            <div className="bct-inline-2cols">
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>GV báo cáo <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text bg-locked"
                                        value={hoTenGV}
                                        readOnly
                                        title="Tự động nhận diện từ tài khoản"
                                    />
                                </div>
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>Phòng ngủ <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text bg-locked font-bold text-indigo text-center"
                                        value={maPhong}
                                        readOnly
                                        title="Phòng ngủ theo phân công trực"
                                        required
                                    />
                                </div>
                            </div>

                            {daBaoCao && liveData && (cleanSiSoText(liveData.si_so, maPhong) !== cleanSiSoText(siSo, maPhong) || liveData.danh_sach_vang !== danhSachVang) && (
                                <div style={{
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    marginBottom: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    fontSize: '0.82rem',
                                    color: '#1e40af'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fas fa-info-circle text-primary"></i>
                                        <span>Điểm danh mới nhất: <strong>{cleanSiSoText(liveData.si_so, maPhong)}</strong> (Hiện tại trong form: {cleanSiSoText(siSo, maPhong) || '—'})</span>
                                    </div>
                                    <button
                                        type="button"
                                        style={{
                                            border: '1px solid #3b82f6',
                                            borderRadius: 6,
                                            padding: '2px 8px',
                                            background: '#fff',
                                            color: '#1d4ed8',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                        onClick={handleSyncLatestLive}
                                    >
                                        <i className="fas fa-sync-alt" style={{ marginRight: 4 }}></i> Đồng bộ mới
                                    </button>
                                </div>
                            )}

                            {/* Dải Sĩ số, Phép & HS vắng tự động từ Điểm danh (1 dòng siêu gọn) */}
                            <div className="bct-auto-summary-strip">
                                <div className="bct-summary-item" title="Sĩ số có mặt / Tổng số HS phòng">
                                    <span className="lbl"><i className="fas fa-users"></i> Sĩ số:</span>
                                    <span className="val font-bold text-success">{cleanSiSoText(siSo, maPhong) || '—'}</span>
                                </div>
                                <span className="bct-summary-divider">•</span>
                                <div className={`bct-summary-item ${soHsPhep > 0 ? 'text-amber-700' : ''}`} title="Học sinh có phép (không tính vào vắng)">
                                    <span className="lbl"><i className="fas fa-file-medical"></i> Phép:</span>
                                    <span className={`val font-bold ${soHsPhep > 0 ? 'text-amber-700' : 'text-slate'}`}>{soHsPhep} em</span>
                                </div>
                                <span className="bct-summary-divider">•</span>
                                <div className="bct-summary-item" title="Học sinh vắng không phép">
                                    <span className="lbl"><i className="fas fa-user-times"></i> Vắng:</span>
                                    <span className={`val font-bold ${calculatedAbsentCount > 0 ? 'text-danger' : 'text-slate'}`}>
                                        {calculatedAbsentCount > 0 ? `${calculatedAbsentCount} em` : '0 em'}
                                    </span>
                                </div>
                            </div>

                            {/* 3. Tình hình chung */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Tình hình nề nếp <span className="text-danger">*</span></span>
                                    {isInputsDisabled && <span className="bct-locked-tag"><i className="fas fa-lock"></i> Đã khóa</span>}
                                </label>
                                <input
                                    type="text"
                                    className={`bct-input-text ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    value={tinhHinh}
                                    onChange={(e) => setTinhHinh(e.target.value)}
                                    placeholder="Tốt / Trật tự / Bình thường..."
                                    required
                                    disabled={isInputsDisabled}
                                />
                                <div className="bct-quick-chips">
                                    <span className="bct-chips-hint">Chọn:</span>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Tốt' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Tốt')}>Tốt</button>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Trật tự' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Trật tự')}>Trật tự</button>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Học sinh ngủ ngoan' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Học sinh ngủ ngoan')}>Ngủ ngoan</button>
                                    <button type="button" disabled={isInputsDisabled} className={`bct-chip ${tinhHinh === 'Bình thường' ? 'chip-active' : ''}`} onClick={() => setTinhHinh('Bình thường')}>Bình thường</button>
                                </div>
                            </div>

                            {/* 4. Ghi nhận HS vi phạm nề nếp */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>HS vi phạm nề nếp <small className="bct-field-sub">(nếu có)</small></span>
                                </label>
                                <textarea
                                    className={`bct-textarea ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    rows={1}
                                    value={hsViPham}
                                    onChange={(e) => setHsViPham(e.target.value)}
                                    placeholder="Dùng điện thoại, làm ồn... (nếu có)"
                                    disabled={isInputsDisabled}
                                />
                            </div>

                            {/* 5. Ghi chú/Góp ý */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Góp ý / Đề xuất <small className="bct-field-sub">(nếu có)</small></span>
                                </label>
                                <textarea
                                    className={`bct-textarea ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    rows={1}
                                    value={ghiChu}
                                    onChange={(e) => setGhiChu(e.target.value)}
                                    placeholder="Cơ sở vật chất: quạt, máy lạnh... (nếu có)"
                                    disabled={isInputsDisabled}
                                />
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        3. BÁO CÁO GIÁM SÁT (Chỉ khi GV chọn Giám sát ca ăn)
                        ══════════════════════════════════════════════════════════ */}
                    {!isCaNgu && caTruc === 2 && (
                        <div className="bct-form-fields-group">
                            <div className="bct-group-title text-purple">
                                <i className="fas fa-user-shield"></i> Giám Sát Ca Trực & ATTP
                            </div>

                            {/* 1 & 2. Họ tên & Khu vực (Gộp 1 hàng 2 cột gọn trên mobile) */}
                            <div className="bct-inline-2cols">
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>Cán bộ GS <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text bg-locked"
                                        value={hoTenGV}
                                        readOnly
                                        title="Tự động nhận diện từ tài khoản"
                                    />
                                </div>
                                <div className="bct-field-item">
                                    <label className="bct-field-label">
                                        <span>Khu vực <span className="text-danger">*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        className="bct-input-text"
                                        value={maPhong}
                                        onChange={(e) => setMaPhong(e.target.value)}
                                        placeholder="Nhà ăn, P5..."
                                        required
                                        disabled={isInputsDisabled}
                                    />
                                </div>
                            </div>

                            {/* 3. Tình hình nề nếp */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Nề nếp toàn trường <span className="text-danger">*</span></span>
                                    {isInputsDisabled && <span className="bct-locked-tag"><i className="fas fa-lock"></i> Đã khóa</span>}
                                </label>
                                <input
                                    type="text"
                                    className={`bct-input-text ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    value={tinhHinh}
                                    onChange={(e) => setTinhHinh(e.target.value)}
                                    placeholder="Tốt / Bình thường..."
                                    required
                                    disabled={isInputsDisabled}
                                />
                                <div className="bct-quick-chips">
                                    <span className="bct-chips-hint">Gợi ý:</span>
                                    <button type="button" disabled={isInputsDisabled} className="bct-chip" onClick={() => setTinhHinh('Tốt')}>Tốt</button>
                                    <button type="button" disabled={isInputsDisabled} className="bct-chip" onClick={() => setTinhHinh('Bình thường')}>Bình thường</button>
                                    <button type="button" disabled={isInputsDisabled} className="bct-chip" onClick={() => setTinhHinh('Toàn trường ổn định')}>Toàn trường ổn định</button>
                                </div>
                            </div>

                            {/* 4. Vệ sinh an toàn thực phẩm */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Vệ sinh ATTP & lưu mẫu</span>
                                </label>
                                <textarea
                                    className={`bct-textarea ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    rows={1}
                                    value={vsatThucPham}
                                    onChange={(e) => setVsatThucPham(e.target.value)}
                                    placeholder="Đạt tiêu chuẩn, lưu mẫu đầy đủ..."
                                    disabled={isInputsDisabled}
                                />
                            </div>

                            {/* 5. Ghi chú/Góp ý */}
                            <div className="bct-field-item">
                                <label className="bct-field-label">
                                    <span>Góp ý / Đề xuất khác</span>
                                </label>
                                <textarea
                                    className={`bct-textarea ${isInputsDisabled ? 'bg-locked' : ''}`}
                                    rows={1}
                                    value={ghiChu}
                                    onChange={(e) => setGhiChu(e.target.value)}
                                    placeholder="Đề xuất, phản ánh khác..."
                                    disabled={isInputsDisabled}
                                />
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="bct-modal-footer">
                        <button
                            type="submit"
                            className={`bct-submit-btn ${!canReportNow ? 'btn-locked' : ''}`}
                            disabled={submitting || !canReportNow}
                            title={!canReportNow ? (lyDoKhoa || 'Chưa đủ điều kiện báo cáo') : ''}
                        >
                            {submitting ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    <span>Đang gửi...</span>
                                </>
                            ) : (
                                <>
                                    <i className={`fas ${daBaoCao ? 'fa-sync-alt' : 'fa-paper-plane'}`}></i>
                                    <span>
                                        {daBaoCao
                                            ? (isCaNgu ? 'Cập nhật báo cáo ca ngủ' : isCaGiamSat ? 'Cập nhật báo cáo giám sát' : 'Cập nhật báo cáo ca ăn')
                                            : (isCaNgu ? 'Gửi báo cáo ca ngủ' : isCaGiamSat ? 'Gửi báo cáo giám sát' : 'Gửi báo cáo ca ăn')}
                                    </span>
                                </>
                            )}
                        </button>

                        {/* Google Form fallback */}
                        <div className="bct-google-form-fallback">
                            <span>Gửi qua: </span>
                            <a
                                href={linkGoogleForm || 'https://forms.gle/6B4GC5aG1KyEuQTaA'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bct-gform-link"
                            >
                                <i className="fab fa-google"></i> Google Form dự phòng
                                <i className="fas fa-external-link-alt bct-external-icon"></i>
                            </a>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
