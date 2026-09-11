import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import '../../styles/admin.css';
import './DiemDanh.css';

export default function GiamSatChot() {
    const { user } = useAuth();

    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const [chotDate, setChotDate] = useState(today);
    const [chotLoai, setChotLoai] = useState('0'); // '0' = Ăn, '1' = Ngủ
    const [chotData, setChotData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Live clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Khung giờ ca trực
    const shiftInfo = useMemo(() => {
        const mins = currentTime.getHours() * 60 + currentTime.getMinutes();
        if (chotLoai === '0') {
            const start = 655; // 10h55
            const end = 690;   // 11h30
            let status = 'sap_den';
            let remaining = 0;
            if (mins >= start && mins <= end) {
                status = 'dang_dien_ra';
                remaining = end - mins;
            } else if (mins > end) {
                status = 'da_qua_gio';
            }
            return { status, remaining, startLabel: '10:55', endLabel: '11:30', name: 'Ca Ăn' };
        } else {
            const start = 690; // 11h30
            const end = 720;   // 12h00
            let status = 'sap_den';
            let remaining = 0;
            if (mins >= start && mins <= end) {
                status = 'dang_dien_ra';
                remaining = end - mins;
            } else if (mins > end) {
                status = 'da_qua_gio';
            }
            return { status, remaining, startLabel: '11:30', endLabel: '12:00', name: 'Ca Ngủ' };
        }
    }, [currentTime, chotLoai]);

    // Fetch dữ liệu từ API
    const fetchChotData = useCallback(async (d, l, showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const res = await api.get(`/api/baocao/tinh-hinh-chot-phong/?ngay=${d}&loai=${l}`);
            if (res.data?.ok) {
                setChotData(res.data.rooms || []);
            }
        } catch (err) {
            console.error('Lỗi lấy dữ liệu chốt phòng:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load khi thay đổi ngày hoặc ca
    useEffect(() => {
        let active = true;
        api.get(`/api/baocao/tinh-hinh-chot-phong/?ngay=${chotDate}&loai=${chotLoai}`)
            .then(res => {
                if (active && res.data?.ok) setChotData(res.data.rooms || []);
            })
            .catch(err => {
                if (active) console.error('Lỗi lấy dữ liệu chốt phòng:', err);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [chotDate, chotLoai]);

    // Tự động làm mới mỗi 20 giây nếu đang bật auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchChotData(chotDate, chotLoai, false);
        }, 20000);
        return () => clearInterval(interval);
    }, [autoRefresh, chotDate, chotLoai, fetchChotData]);

    const completedRooms = chotData.filter(r => r.trang_thai_chot === 'da_chot' || r.trang_thai_chot === 'tu_dong_chot' || r.is_completed);
    const pendingRooms = chotData.filter(r => r.trang_thai_chot !== 'da_chot' && r.trang_thai_chot !== 'tu_dong_chot' && !r.is_completed);

    const completedCount = completedRooms.length;
    const pendingCount = pendingRooms.length;

    // Tổng hợp số HS từ các phòng ĐÃ HOÀN THÀNH
    const totalHsChot = completedRooms.reduce((acc, r) => acc + (r.total_hs || 0), 0);
    const totalCoMat = completedRooms.reduce((acc, r) => acc + (r.stats?.comat || 0), 0);
    const totalVang = completedRooms.reduce((acc, r) => acc + (r.stats?.vang || 0), 0);
    const totalPhep = completedRooms.reduce((acc, r) => acc + (r.stats?.phep || 0), 0);

    // Phân quyền: chỉ admin, ban giám hiệu/quản lý và học vụ được xem giám sát chốt
    if (user && !user.is_admin && !user.is_superuser && !user.is_quan_ly && !user.is_hoc_vu) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="admin-page-container">
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: 20 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                        <i className="fas fa-tasks" style={{ color: '#009CFF' }}></i>
                        Tiến Độ Điểm Danh & Chốt Sổ
                    </h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        Theo dõi tình hình hoàn thành điểm danh theo ca trực. Dữ liệu học sinh chỉ được thống kê chính thức khi Giáo viên đã chốt.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: 600, color: '#475569',
                        background: '#f8fafc', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0'
                    }}>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                            style={{ accentColor: '#009CFF' }}
                        />
                        <span>Tự động làm mới (20s)</span>
                    </label>

                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => fetchChotData(chotDate, chotLoai, true)}
                        disabled={loading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                        {loading ? 'Đang cập nhật...' : 'Làm mới ngay'}
                    </button>
                </div>
            </div>

            {/* Banner Khung giờ & Đồng hồ */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12, padding: '12px 18px', marginBottom: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#1e293b' }}>
                        {shiftInfo.name.toUpperCase()} ({shiftInfo.startLabel} – {shiftInfo.endLabel})
                    </span>
                    {shiftInfo.status === 'dang_dien_ra' && (
                        <span style={{ background: '#059669', color: '#fff', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                            ĐANG DIỄN RA (Còn {shiftInfo.remaining} phút)
                        </span>
                    )}
                    {shiftInfo.status === 'sap_den' && (
                        <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                            CHƯA ĐẾN GIỜ
                        </span>
                    )}
                    {shiftInfo.status === 'da_qua_gio' && (
                        <span style={{ background: '#d97706', color: '#fff', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                            ĐÃ HẾT GIỜ CA TRỰC
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Đồng hồ hệ thống:</span>
                    <strong style={{ fontSize: '1.1rem', color: '#0f172a', fontFamily: 'monospace' }}>
                        {currentTime.toLocaleTimeString('vi-VN')}
                    </strong>
                </div>
            </div>

            {/* Thanh điều khiển Ngày & Ca */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap',
                background: '#fff', padding: '12px 18px', borderRadius: 12, border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>
                        <i className="fas fa-calendar-day" style={{ color: '#009CFF' }}></i> Chọn Ngày:
                    </label>
                    <input
                        type="date"
                        value={chotDate}
                        onChange={e => setChotDate(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }}
                    />
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setChotDate(today())}
                        style={{ fontWeight: 700 }}
                    >
                        Hôm nay
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '4px', borderRadius: 10 }}>
                    <button
                        type="button"
                        style={{
                            border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                            fontWeight: 700, fontSize: '0.85rem',
                            background: chotLoai === '0' ? '#009CFF' : 'transparent',
                            color: chotLoai === '0' ? '#fff' : '#64748b',
                            boxShadow: chotLoai === '0' ? '0 2px 6px rgba(0,156,255,0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                        onClick={() => setChotLoai('0')}
                    >
                        <i className="fas fa-utensils"></i> Trực Ăn (10:55 – 11:30)
                    </button>
                    <button
                        type="button"
                        style={{
                            border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                            fontWeight: 700, fontSize: '0.85rem',
                            background: chotLoai === '1' ? '#6c5ce7' : 'transparent',
                            color: chotLoai === '1' ? '#fff' : '#64748b',
                            boxShadow: chotLoai === '1' ? '0 2px 6px rgba(108,92,231,0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                        onClick={() => setChotLoai('1')}
                    >
                        <i className="fas fa-bed"></i> Trực Ngủ (11:30 – 12:00)
                    </button>
                </div>
            </div>

            {/* 3 Thẻ Thống Kê Tinh Gọn: Tổng, Đã hoàn thành, Chưa hoàn thành */}
            <div className="stat-cards-row" style={{ marginBottom: 20 }}>
                <div className="stat-card blue">
                    <div className="stat-card-icon"><i className="fas fa-door-open"></i></div>
                    <div className="stat-card-info">
                        <p>Tổng số phòng trực</p>
                        <h3>{chotData.length}</h3>
                    </div>
                </div>
                <div className="stat-card green">
                    <div className="stat-card-icon" style={{ background: '#ecfdf5', color: '#16a34a' }}>
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-card-info">
                        <p>Đã hoàn thành</p>
                        <h3>{completedCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>phòng</span></h3>
                    </div>
                </div>
                <div className="stat-card yellow">
                    <div className="stat-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="stat-card-info">
                        <p>Chưa hoàn thành</p>
                        <h3>{pendingCount} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>phòng</span></h3>
                    </div>
                </div>
            </div>

            {/* Tóm tắt số liệu học sinh từ các phòng đã hoàn thành */}
            {completedCount > 0 && (
                <div style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                    padding: '10px 16px', marginBottom: 20, fontSize: '0.9rem', color: '#166534',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-check-double" style={{ color: '#16a34a' }}></i>
                        <span>Thống kê từ <strong>{completedCount} phòng đã chốt</strong>:</span>
                        <strong>{totalHsChot} học sinh</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontWeight: 700 }}>
                        <span style={{ color: '#16a34a' }}><i className="fas fa-check"></i> Có mặt: {totalCoMat}</span>
                        <span style={{ color: '#dc2626' }}><i className="fas fa-times"></i> Vắng: {totalVang}</span>
                        <span style={{ color: '#d97706' }}><i className="fas fa-file-alt"></i> Phép: {totalPhep}</span>
                    </div>
                </div>
            )}

            {/* Bảng Giám Sát Chi Tiết Phòng */}
            <div style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)', overflow: 'hidden'
            }}>
                <div style={{
                    padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
                }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-list-check" style={{ color: '#009CFF' }}></i>
                        Danh Sách Phòng Trực & Trạng Thái
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        Hạn chốt: <strong>{chotLoai === '0' ? '11:30' : '12:00'}</strong>
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 44, textAlign: 'center' }}>STT</th>
                                <th style={{ width: 120 }}>Phòng</th>
                                <th>Giáo viên trực</th>
                                <th style={{ textAlign: 'center', width: 100 }}>Sĩ số</th>
                                <th style={{ width: 180 }}>Trạng thái</th>
                                <th style={{ textAlign: 'center', width: 220 }}>Kết quả điểm danh</th>
                                <th style={{ width: 100, textAlign: 'center' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chotData.map((r, i) => {
                                const isCompleted = r.trang_thai_chot === 'da_chot' || r.trang_thai_chot === 'tu_dong_chot' || r.is_completed;

                                return (
                                    <tr key={r.ma_phong}>
                                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{i + 1}</td>
                                        <td>
                                            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
                                                <i className={`fas ${chotLoai === '0' ? 'fa-utensils' : 'fa-bed'}`} style={{ color: chotLoai === '0' ? '#009CFF' : '#6c5ce7', marginRight: 6 }}></i>
                                                {r.ma_phong}
                                            </strong>
                                        </td>
                                        <td>
                                            {r.giao_vien && r.giao_vien.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    {r.giao_vien.map((gv, gvIdx) => (
                                                        <div key={gvIdx} style={{ fontSize: '0.84rem' }}>
                                                            <strong>{gv.ho_ten}</strong>
                                                            {gv.so_dien_thoai && <span style={{ color: '#64748b', marginLeft: 6 }}>({gv.so_dien_thoai})</span>}
                                                            {gv.is_truc_thay && <span style={{ marginLeft: 4, fontSize: '0.7rem', color: '#e11d48', fontWeight: 700 }}>(Trực thay)</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.84rem' }}>Chưa phân công</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                            {r.total_hs} HS
                                        </td>
                                        <td>
                                            {isCompleted ? (
                                                <div>
                                                    <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <i className="fas fa-check-circle"></i> ĐÃ HOÀN THÀNH
                                                    </span>
                                                    {r.thoi_gian_chot && (
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                                                            Chốt lúc {new Date(r.thoi_gian_chot).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <i className="fas fa-clock"></i> CHƯA HOÀN THÀNH
                                                    </span>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                                                        Đang điểm danh (Chưa chốt)
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {isCompleted && r.stats ? (
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700 }}>
                                                    <span style={{ color: '#16a34a' }} title="Có mặt"><i className="fas fa-check"></i> {r.stats.comat}</span>
                                                    <span style={{ color: '#dc2626' }} title="Vắng"><i className="fas fa-times"></i> {r.stats.vang}</span>
                                                    <span style={{ color: '#d97706' }} title="Phép"><i className="fas fa-file-alt"></i> {r.stats.phep}</span>
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                    Chưa chốt sổ
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <Link
                                                to={chotLoai === '0' ? '/diemdanh-an' : '/diemdanh-ngu'}
                                                className="btn btn-outline btn-sm"
                                                style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                            >
                                                <i className="fas fa-external-link-alt"></i> Vào xem
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                            {chotData.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                                        <i className="fas fa-calendar-times" style={{ fontSize: '2rem', display: 'block', marginBottom: 8, color: '#cbd5e1' }}></i>
                                        Không có phân công trực nào trong ngày {chotDate.split('-').reverse().join('/')} cho ca này.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
