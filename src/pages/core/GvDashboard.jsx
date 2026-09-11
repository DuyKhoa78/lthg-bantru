import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import './GvDashboard.css';

export default function GvDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [dutyData, setDutyData] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());

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
        return `${dow}, ngày ${day}/${month}/${year}`;
    };

    const formatVNTime = (d) => {
        return d.toLocaleTimeString('vi-VN', { hour12: false });
    };

    return (
        <div className="gv-dashboard-container">
            {/* Header Greeting Banner */}
            <div className="gv-welcome-banner">
                <div className="gv-welcome-text">
                    <span className="gv-badge-role">CỔNG GIÁO VIÊN BÁN TRÚ</span>
                    <h2>Kính chào Thầy/Cô {user?.fullname || user?.username}!</h2>
                    <p className="gv-current-date">
                        📅 {formatVNDate(currentTime)} • ⏰ <span className="gv-clock-live">{formatVNTime(currentTime)}</span>
                    </p>
                </div>
                <div className="gv-welcome-icon">
                    <i className="fas fa-clipboard-check"></i>
                </div>
            </div>

            {loading ? (
                <div className="gv-loading-state">
                    <i className="fas fa-circle-notch fa-spin"></i>
                    <p>Đang tải thông tin ca trực hôm nay...</p>
                </div>
            ) : !dutyData?.assignments || dutyData.assignments.length === 0 ? (
                <div className="gv-no-duty-card">
                    <div className="gv-no-duty-icon">🌴</div>
                    <h3>Hôm nay Thầy/Cô không có lịch trực bán trú</h3>
                    <p>Chúc Thầy/Cô một ngày làm việc và giảng dạy thật hiệu quả!</p>
                    <div className="gv-action-row">
                        <button className="btn btn-outline-primary" onClick={() => navigate('/lich-truc')}>
                            <i className="fas fa-calendar-alt"></i> Xem toàn bộ lịch trực tuần
                        </button>
                    </div>
                </div>
            ) : (
                <div className="gv-duty-section">
                    <div className="gv-section-title">
                        <h3><i className="fas fa-tasks"></i> Ca trực của Thầy/Cô hôm nay</h3>
                        <span className="gv-total-assigned">{dutyData.assignments.length} nhiệm vụ</span>
                    </div>

                    <div className="gv-cards-grid">
                        {dutyData.assignments.map(item => {
                            const isAn = item.loai_truc === 0;
                            const title = isAn ? 'Ca Ăn Trưa' : 'Ca Nghỉ Trưa';
                            const iconClass = isAn ? 'fas fa-utensils' : 'fas fa-bed';
                            const iconColor = isAn ? '#f59e0b' : '#6366f1';
                            const path = isAn ? '/diemdanh-an' : '/diemdanh-ngu';

                            const state = item.khung_gio.state; // 'sap_den' | 'dang_dien_ra' | 'da_qua_gio'
                            const isChot = item.trang_thai_chot === 'da_chot';

                            return (
                                <div key={item.id} className={`gv-duty-card ${isAn ? 'card-an' : 'card-ngu'}`}>
                                    <div className="gv-card-top">
                                        <div className="gv-card-icon" style={{ backgroundColor: `${iconColor}15`, color: iconColor }}>
                                            <i className={iconClass}></i>
                                        </div>
                                        <div className="gv-card-shift-meta">
                                            <span className="gv-shift-type">{title}</span>
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
                                            <span className="gv-room-label">Phòng phân công</span>
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
                                                <span className="val">{item.total_students} HS</span>
                                            </div>
                                            <div className="gv-stat-pill">
                                                <span className="label">Đang lưu nháp:</span>
                                                <span className="val text-primary font-bold">{item.draft_count} em</span>
                                            </div>
                                        </div>

                                        {/* Trạng thái chốt */}
                                        <div className="gv-chot-status-box">
                                            {isChot ? (
                                                <div className="status-badge success">
                                                    <i className="fas fa-check-circle"></i>
                                                    <div>
                                                        <strong>ĐÃ CHỐT SỔ LÊN TỔNG</strong>
                                                        <small>{item.ghi_chu_chot || 'Hoàn thành'}</small>
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

                                        {/* Notice if not allowed */}
                                        {!item.can_diem_danh && (
                                            <p className="gv-restricted-note">
                                                <i className="fas fa-info-circle"></i> {item.note_quyen}
                                            </p>
                                        )}
                                    </div>

                                    <div className="gv-card-footer">
                                        <button
                                            className={`btn w-100 ${state === 'dang_dien_ra' ? 'btn-primary' : 'btn-outline-primary'}`}
                                            onClick={() => navigate(path)}
                                        >
                                            <i className="fas fa-qrcode"></i> Vào điểm danh phòng {item.ma_phong_id}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Quick instructions for teachers */}
            <div className="gv-guide-card">
                <h4><i className="fas fa-lightbulb"></i> Hướng dẫn điểm danh bán trú bằng QR</h4>
                <div className="gv-guide-steps">
                    <div className="gv-guide-step">
                        <span className="step-num">1</span>
                        <div>
                            <strong>Chọn đúng phòng trực</strong>
                            <p>Hệ thống tự động khóa vào đúng phòng Thầy/Cô được phân công hôm nay.</p>
                        </div>
                    </div>
                    <div className="gv-guide-step">
                        <span className="step-num">2</span>
                        <div>
                            <strong>Bấm Quét mã QR thẻ</strong>
                            <p>Camera tự nhận diện mã thẻ <code>MSBT: 26xxx</code>, phát âm thanh và hiển thị thẻ học sinh.</p>
                        </div>
                    </div>
                    <div className="gv-guide-step">
                        <span className="step-num">3</span>
                        <div>
                            <strong>Bảo toàn dữ liệu 100%</strong>
                            <p>Mỗi lượt quét đều được lưu tức thì vào máy và đồng bộ lên máy chủ, không lo mất mạng hay tắt máy.</p>
                        </div>
                    </div>
                    <div className="gv-guide-step">
                        <span className="step-num">4</span>
                        <div>
                            <strong>Chốt điểm danh lên Tổng</strong>
                            <p>Trước 11h30 (ca ăn) hoặc 12h00 (ca ngủ), bấm <em>Chốt điểm danh</em> để gửi báo cáo chính thức.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
