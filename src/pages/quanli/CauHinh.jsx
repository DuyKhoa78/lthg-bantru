import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import '../../styles/admin.css';
import './CauHinh.css';

export default function CauHinh() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const canEdit = user?.is_admin || user?.is_superuser || user?.role === 'quan_ly';

  const [heThong, setHeThong] = useState({ nam_hoc: '', nguoi_phu_trach: '', ten_truong: '' });
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
          if (he_thong) setHeThong({ nam_hoc: he_thong.nam_hoc || '', nguoi_phu_trach: he_thong.nguoi_phu_trach || '', ten_truong: he_thong.ten_truong || '' });
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
          <p>Cấu hình thông tin chung, năm học, người phụ trách và đơn giá bán trú.</p>
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
              <select className="form-control" value={heThong.nam_hoc || ''} disabled={!canEdit} onChange={(e) => setHeThong({ ...heThong, nam_hoc: e.target.value })}>
                {(!heThong.nam_hoc || heThong.nam_hoc < '2025-2026') && <option value={heThong.nam_hoc}>{heThong.nam_hoc}</option>}
                {Array.from({ length: 10 }, (_, i) => {
                  const y = 2025 + i;
                  return `${y}-${y + 1}`;
                }).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Người phụ trách</label>
              <select className="form-control" value={heThong.nguoi_phu_trach} disabled={!canEdit} onChange={(e) => setHeThong({ ...heThong, nguoi_phu_trach: e.target.value })}>
                <option value="">-- Chọn người phụ trách --</option>
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

        {/* Thông tin hệ thống */}
        <div className="cauhinh-section">
          <div className="cauhinh-section-header"><i className="fas fa-info-circle"></i> Thông tin Hệ thống</div>
          <div className="cauhinh-section-body">
            {[
              { label: 'Phiên bản', value: 'v1.0.0' },
              { label: 'Framework', value: 'React + Node.js + Supabase' },
              { label: 'Người phát triển', value: 'Duy Khoa' },
              { label: 'Cập nhật lần cuối', value: new Date().toLocaleDateString('vi-VN') },
            ].map((item, i) => (
              <div key={i} className="cauhinh-info-row">
                <span className="cauhinh-info-label">{item.label}</span>
                <span className="cauhinh-info-value">{item.value}</span>
              </div>
            ))}
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
