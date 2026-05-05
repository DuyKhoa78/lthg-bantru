import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import '../../styles/admin.css';
import './Profile.css';

export default function Profile() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const [tab, setTab] = useState('info');
  const [form, setForm] = useState({ fullname: '', position: '', email: '' });
  const [pwForm, setPwForm] = useState({ old: '', new1: '', new2: '', otp: '', stage: 'input', showOld: false, showNew: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullname || 'U')}&background=009CFF&color=fff&size=120&rounded=true`;

  useEffect(() => {
    api.get('/api/profile/').then((res) => {
      if (res.data?.ok) {
        const u = res.data.user;
        setForm({ fullname: u.fullname || '', position: u.position || '', email: u.email || '' });
      }
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/api/profile/save/', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleSendOtp = async () => {
    if (!pwForm.old || !pwForm.new1) return showAlert('Vui lòng điền đầy đủ!', 'warning');
    if (pwForm.new1 !== pwForm.new2) return showAlert('Mật khẩu xác nhận không khớp!', 'warning');
    if (pwForm.new1.length < 6) return showAlert('Mật khẩu mới ít nhất 6 ký tự!', 'warning');
    setSaving(true);
    try {
      const res = await api.post('/api/profile/send-otp/', { current_password: pwForm.old, new_password: pwForm.new1 });
      setPwMsg(res.data.message || 'OTP đã được gửi vào email của bạn');
      setPwForm(p => ({ ...p, stage: 'otp' }));
    } catch (err) {
      showAlert(err.response?.data?.error || 'Gửi OTP thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!pwForm.otp) return showAlert('Vui lòng nhập mã OTP!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/profile/verify-otp/', { otp: pwForm.otp });
      setPwMsg('✅ Đổi mật khẩu thành công!');
      setPwForm({ old: '', new1: '', new2: '', otp: '', stage: 'input', showOld: false, showNew: false });
    } catch (err) {
      showAlert(err.response?.data?.error || 'OTP không đúng hoặc đã hết hạn');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = {
    admin: 'Quản trị viên', hoc_vu: 'Học vụ', quan_ly: 'Quản lý', ke_toan: 'Kế toán',
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb"><Link to="/">Dashboard</Link><span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span><span>Hồ sơ cá nhân</span></div>
          <h2><i className="fas fa-user-circle" style={{ color: 'var(--primary)' }}></i> Hồ sơ cá nhân</h2>
          <p>Quản lý thông tin tài khoản và đổi mật khẩu.</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* Avatar Card */}
        <div className="profile-avatar-card">
          <div className="profile-avatar-wrap" title="Nhấn để xem ảnh gốc">
            <a href={user?.avatar_url || '/user.jpg'} target="_blank" rel="noopener noreferrer">
              <img src={user?.avatar_url || '/user.jpg'} alt="avatar" className="profile-avatar"
                onError={(e) => { e.target.src = avatarFallback; }}
                style={{ cursor: 'pointer' }} />
            </a>
          </div>
          <h3 className="profile-name">{user?.fullname || user?.username}</h3>
          <span className="badge badge-info" style={{ margin: '4px 0 8px' }}>{roleLabel[user?.role] || user?.role}</span>
          <div className="profile-info-list">
            <div className="profile-info-item"><i className="fas fa-user"></i> <span>@{user?.username}</span></div>
            <div className="profile-info-item"><i className="fas fa-briefcase"></i> <span>{user?.position || '—'}</span></div>
          </div>
        </div>

        {/* Content Card */}
        <div className="profile-content-card">
          <div className="profile-tabs">
            <button className={`profile-tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}><i className="fas fa-user-edit"></i> Thông tin</button>
            <button className={`profile-tab${tab === 'password' ? ' active' : ''}`} onClick={() => setTab('password')}><i className="fas fa-lock"></i> Đổi mật khẩu</button>
          </div>

          {tab === 'info' && (
            <div className="profile-tab-body">
              <div className="form-group">
                <label className="form-label">Họ và tên</label>
                <input className="form-control" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Chức vụ</label>
                  <input className="form-control" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="VD: Giáo viên chủ nhiệm" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Vai trò</label>
                <input className="form-control" value={roleLabel[user?.role] || user?.role || '—'} disabled style={{ background: '#f8fafc', color: '#94a3b8' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <i className={`fas ${saved ? 'fa-check' : saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> {saved ? 'Đã lưu!' : 'Lưu thông tin'}
                </button>
              </div>
            </div>
          )}

          {tab === 'password' && (
            <div className="profile-tab-body">
              {pwMsg && <div className="info-banner" style={{ marginBottom: 16 }}><i className="fas fa-info-circle"></i> {pwMsg}</div>}
              {pwForm.stage === 'input' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Mật khẩu hiện tại <span className="required">*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input type={pwForm.showOld ? 'text' : 'password'} className="form-control" style={{ paddingRight: 44 }} value={pwForm.old} onChange={(e) => setPwForm({ ...pwForm, old: e.target.value })} placeholder="••••••••" />
                      <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setPwForm({ ...pwForm, showOld: !pwForm.showOld })}>
                        <i className={`fas ${pwForm.showOld ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mật khẩu mới <span className="required">*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input type={pwForm.showNew ? 'text' : 'password'} className="form-control" style={{ paddingRight: 44 }} value={pwForm.new1} onChange={(e) => setPwForm({ ...pwForm, new1: e.target.value })} placeholder="••••••••" />
                      <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setPwForm({ ...pwForm, showNew: !pwForm.showNew })}>
                        <i className={`fas ${pwForm.showNew ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Xác nhận mật khẩu mới <span className="required">*</span></label>
                    <input type="password" className="form-control" value={pwForm.new2} onChange={(e) => setPwForm({ ...pwForm, new2: e.target.value })} placeholder="••••••••" />
                    {pwForm.new2 && pwForm.new1 !== pwForm.new2 && <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 4 }}><i className="fas fa-exclamation-circle"></i> Mật khẩu không khớp</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={handleSendOtp} disabled={saving}>
                      <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i> Gửi mã OTP
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Nhập mã OTP đã gửi vào email <span className="required">*</span></label>
                    <input className="form-control" value={pwForm.otp} onChange={(e) => setPwForm({ ...pwForm, otp: e.target.value })} placeholder="6 chữ số" maxLength={6} style={{ letterSpacing: 8, fontSize: '1.5rem', textAlign: 'center' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn btn-ghost" onClick={() => setPwForm(p => ({ ...p, stage: 'input', otp: '' }))}>Quay lại</button>
                    <button className="btn btn-primary" onClick={handleVerifyOtp} disabled={saving}>
                      <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-key'}`}></i> Xác nhận & Đổi mật khẩu
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {AlertUI}
    </>
  );
}
