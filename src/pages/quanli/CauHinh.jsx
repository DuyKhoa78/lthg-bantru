import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import '../../styles/admin.css';
import './CauHinh.css';

export default function CauHinh() {
  const { user, refreshSystemStatus } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const canEdit = user?.is_admin || user?.is_superuser;

  const [heThong, setHeThong] = useState({
    nam_hoc: '',
    nguoi_phu_trach: '',
    ten_truong: '',
    ma_bao_mat_gv: 'BT789',
    bao_tri: false,
    thong_bao_bao_tri: '',
    thoi_gian_bao_tri: '',
  });
  const [giaAn, setGiaAn] = useState('');
  const [giaNgu, setGiaNgu] = useState('');
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/cauhinh/'),
      api.get('/api/nguoidung/quanly/').catch(() => ({ data: { ok: false } }))
    ])
      .then(([resCauHinh, resUsers]) => {
        if (resCauHinh.data?.ok) {
          const { he_thong, gia_an, gia_ngu } = resCauHinh.data;
          if (he_thong) setHeThong({
            nam_hoc:           (he_thong.nam_hoc && he_thong.nam_hoc !== '2025-2026') ? he_thong.nam_hoc : '2026-2027',
            nguoi_phu_trach:   he_thong.nguoi_phu_trach   || '',
            ten_truong:        he_thong.ten_truong         || '',
            ma_bao_mat_gv:     he_thong.ma_bao_mat_gv      || 'BT789',
            bao_tri:           Boolean(he_thong.bao_tri),
            thong_bao_bao_tri: he_thong.thong_bao_bao_tri  || 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ. Quý Thầy Cô và Học sinh vui lòng quay lại sau ít phút!',
            thoi_gian_bao_tri: he_thong.thoi_gian_bao_tri  || 'Dự kiến hoàn tất trong 15-30 phút',
          });
          if (gia_an) setGiaAn(parseInt(gia_an.don_gia) || '');
          if (gia_ngu) setGiaNgu(parseInt(gia_ngu.don_gia) || '');
        }
        if (resUsers.data?.ok) {
          setManagers(resUsers.data.users || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.post('/api/hethong/save/', heThong),
        api.post('/api/cauhinh/save/', { an: parseFloat(giaAn) || 0, ngu: parseFloat(giaNgu) || 0 }),
      ]);
      if (refreshSystemStatus) await refreshSystemStatus();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--primary)' }}></i></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb"><Link to="/">Dashboard</Link><span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span><span>Thiết lập</span></div>
          <h2><i className="fas fa-sliders-h" style={{ color: 'var(--primary)' }}></i> Thiết lập Hệ thống</h2>
          <p>Cấu hình thông tin chung, năm học, Giám đốc và đơn giá bán trú.</p>
        </div>
        {canEdit && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <i className={`fas ${saved ? 'fa-check' : saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i>
              {saved ? 'Đã lưu!' : saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        )}
      </div>

      <div className="cauhinh-grid">
        {/* Thông tin trường */}
        <div className="cauhinh-section">
          <div className="cauhinh-section-header"><i className="fas fa-school"></i> Thông tin Trường</div>
          <div className="cauhinh-section-body">
            <div className="form-group">
              <label className="form-label">Tên trường</label>
              <input className="form-control" value={heThong.ten_truong} disabled={!canEdit} onChange={(e) => setHeThong({ ...heThong, ten_truong: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Năm học</label>
              <select className="form-control" value={heThong.nam_hoc || '2026-2027'} disabled={!canEdit} onChange={(e) => setHeThong({ ...heThong, nam_hoc: e.target.value })}>
                {Array.from({ length: 10 }, (_, i) => {
                  const y = 2026 + i;
                  return `${y}-${y + 1}`;
                }).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Giám Đốc</label>
              <select className="form-control" value={heThong.nguoi_phu_trach} disabled={!canEdit} onChange={(e) => setHeThong({ ...heThong, nguoi_phu_trach: e.target.value })}>
                <option value="">-- Chọn Giám đốc --</option>
                {managers.map(m => (
                  <option key={m.id} value={m.fullname}>{m.fullname}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Cấu hình giá */}
        <div className="cauhinh-section">
          <div className="cauhinh-section-header"><i className="fas fa-money-bill-wave"></i> Đơn giá Bán trú</div>
          <div className="cauhinh-section-body">
            <div className="form-group">
              <label className="form-label"><i className="fas fa-utensils" style={{ color: 'var(--primary)' }}></i> Đơn giá ca Ăn (VNĐ/ca)</label>
              <input type="text" className="form-control" value={giaAn ? Number(giaAn).toLocaleString('vi-VN') : ''} disabled={!canEdit} onChange={(e) => setGiaAn(e.target.value.replace(/\D/g, ''))} placeholder="VD: 50.000" />
            </div>
            <div className="form-group">
              <label className="form-label"><i className="fas fa-bed" style={{ color: '#a855f7' }}></i> Đơn giá ca Ngủ (VNĐ/ca)</label>
              <input type="text" className="form-control" value={giaNgu ? Number(giaNgu).toLocaleString('vi-VN') : ''} disabled={!canEdit} onChange={(e) => setGiaNgu(e.target.value.replace(/\D/g, ''))} placeholder="VD: 30.000" />
            </div>
          </div>
        </div>

        {/* Cấu hình Mã bảo mật Báo cáo trực GV */}
        <div className="cauhinh-section">
          <div className="cauhinh-section-header">
            <i className="fas fa-shield-alt" style={{ color: '#10b981' }}></i> Xác thực Báo cáo Trực GV (Google Form)
          </div>
          <div className="cauhinh-section-body">
            <div className="form-group">
              <label className="form-label">
                Mã bảo mật ca trực (Đúng 5 ký tự)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  maxLength={5}
                  className="form-control"
                  style={{
                    fontWeight: 700,
                    letterSpacing: '3px',
                    fontSize: '1.15rem',
                    textTransform: 'uppercase',
                    maxWidth: 180,
                    color: '#047857',
                    background: '#f0fdf4',
                    borderColor: '#a7f3d0'
                  }}
                  value={heThong.ma_bao_mat_gv || ''}
                  disabled={!canEdit}
                  onChange={(e) => setHeThong({ ...heThong, ma_bao_mat_gv: e.target.value.toUpperCase().slice(0, 5) })}
                  placeholder="BT789"
                />
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    title="Tạo mã 5 ký tự ngẫu nhiên"
                    onClick={() => {
                      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                      let res = 'BT';
                      for (let i = 0; i < 3; i++) {
                        res += chars.charAt(Math.floor(Math.random() * chars.length));
                      }
                      setHeThong({ ...heThong, ma_bao_mat_gv: res });
                    }}
                  >
                    <i className="fas fa-dice"></i> Đổi mã ngẫu nhiên
                  </button>
                )}
              </div>
              <small style={{ display: 'block', marginTop: 8, color: '#64748b', lineHeight: 1.5 }}>
                <i className="fas fa-info-circle" style={{ color: '#0284c7' }}></i> <strong>Chống học sinh giả mạo:</strong> Mã bí mật 5 ký tự này chỉ cung cấp nội bộ cho các Giáo viên trực ca điền vào Google Form. Nếu học sinh gửi form mà không biết mã hoặc nhập sai, hệ thống sẽ tự động gắn cờ cảnh báo <em>⚠️ Sai mã</em> trên bảng duyệt.
              </small>
            </div>
          </div>
        </div>

        {/* Chế độ bảo trì hệ thống */}
        <div className="cauhinh-section" style={{
          border: heThong.bao_tri ? '2px solid #f59e0b' : '1px solid var(--border)',
          boxShadow: heThong.bao_tri ? '0 0 16px rgba(245, 158, 11, 0.25)' : undefined,
        }}>
          <div className="cauhinh-section-header" style={{
            background: heThong.bao_tri ? '#fffbeb' : undefined,
            color: heThong.bao_tri ? '#b45309' : undefined,
          }}>
            <i className="fas fa-tools" style={{ color: '#f59e0b' }}></i>
            <span>Chế độ Bảo trì Hệ thống (Maintenance Mode)</span>
            {heThong.bao_tri ? (
              <span style={{
                marginLeft: 'auto',
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fcd34d',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '.75rem',
                fontWeight: 700
              }}>
                ĐANG BẬT
              </span>
            ) : (
              <span style={{
                marginLeft: 'auto',
                background: '#f1f5f9',
                color: '#64748b',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '.75rem',
                fontWeight: 600
              }}>
                Đang tắt
              </span>
            )}
          </div>
          <div className="cauhinh-section-body">
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Trạng thái bảo trì:</span>
                <label style={{ cursor: canEdit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={heThong.bao_tri}
                    disabled={!canEdit}
                    onChange={(e) => setHeThong({ ...heThong, bao_tri: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <strong style={{ color: heThong.bao_tri ? '#b45309' : '#15803d', fontSize: '.92rem' }}>
                    {heThong.bao_tri ? 'BẬT BẢO TRÌ (Khóa truy cập người dùng)' : 'TẮT BẢO TRÌ (Hoạt động bình thường)'}
                  </strong>
                </label>
              </label>
              <p style={{ fontSize: '.84rem', color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                Khi bật, mọi người dùng thông thường khi vào web sẽ thấy thông báo <strong>"Hệ thống đang bảo trì vui lòng quay lại sau"</strong>. Chỉ tài khoản <strong>Super Admin</strong> mới có thể đăng nhập để kiểm tra và cấu hình.
              </p>
            </div>

            {heThong.bao_tri && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
                <div className="form-group">
                  <label className="form-label">Nội dung thông báo bảo trì gửi người dùng</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    disabled={!canEdit}
                    value={heThong.thong_bao_bao_tri}
                    onChange={(e) => setHeThong({ ...heThong, thong_bao_bao_tri: e.target.value })}
                    placeholder="Nhập lời nhắn gửi đến phụ huynh, học sinh và giáo viên..."
                  />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Thời gian dự kiến hoàn tất</label>
                  <input
                    type="text"
                    className="form-control"
                    disabled={!canEdit}
                    value={heThong.thoi_gian_bao_tri}
                    onChange={(e) => setHeThong({ ...heThong, thoi_gian_bao_tri: e.target.value })}
                    placeholder="VD: 15-30 phút, hoặc Đến 15h00 ngày hôm nay"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="info-banner" style={{ marginTop: 16 }}>
          <i className="fas fa-lock"></i> Bạn không có quyền chỉnh sửa cấu hình hệ thống.
        </div>
      )}
      {AlertUI}
    </>
  );
}

