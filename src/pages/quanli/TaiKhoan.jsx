import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { removeAccents, getSortNames } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './TaiKhoan.css';

const ROLES = [
  { value: 'admin',     label: 'Quản trị viên', badge: 'badge-danger',  icon: 'fa-shield-alt' },
  { value: 'quan_ly',   label: 'Quản lý',        badge: 'badge-warning', icon: 'fa-user-tie' },
  { value: 'hoc_vu',    label: 'Học vụ',         badge: 'badge-info',    icon: 'fa-user-clock' },
  { value: 'giao_vien', label: 'Giáo viên',      badge: 'badge-purple',  icon: 'fa-chalkboard-teacher' },
  { value: 'ke_toan',   label: 'Kế toán',        badge: 'badge-success', icon: 'fa-calculator' },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.value, r]));

const EMPTY_FORM = { username: '', fullname: '', position: '', role: 'giao_vien', is_active: true, password: '', giao_vien_id: null };

function RoleBadge({ role }) {
  const r = ROLE_MAP[role];
  if (!r) return <span className="badge badge-gray">{role}</span>;
  return <span className={`badge ${r.badge}`}><i className={`fas ${r.icon}`}></i> {r.label}</span>;
}

function AvatarIcon({ name, active }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
  return (
    <div className={`tk-avatar ${active ? '' : 'tk-avatar-inactive'}`}>
      {initials}
    </div>
  );
}

export default function TaiKhoan() {
  const { user: currentUser } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal]         = useState(null);   // null | 'add' | { edit: user } | { reset: user }
  const [form, setForm]           = useState(EMPTY_FORM);
  const [showPw, setShowPw]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // { id, name }
  const [resetPw, setResetPw]     = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [gvList, setGvList]           = useState([]);

  const isAdmin = currentUser?.is_admin || currentUser?.is_superuser;

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true);
    api.get('/api/taikhoan/')
      .then(res => { if (res.data?.ok) setData(res.data.users); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    api.get('/api/giaovien/?limit=500')
      .then(res => { if (res.data?.ok) setGvList(res.data.giaovien || []); })
      .catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    let result = data.filter(u => {
      if (search) {
        const searchStr = removeAccents(search.toLowerCase());
        const nameStr = removeAccents((u.fullname || '').toLowerCase());
        const userStr = removeAccents((u.username || '').toLowerCase());
        if (!nameStr.includes(searchStr) && !userStr.includes(searchStr)) return false;
      }
      if (filterRole   && u.role !== filterRole) return false;
      if (filterStatus !== '' && String(Number(u.is_active)) !== filterStatus) return false;
      return true;
    });

    result.sort((a, b) => {
      const nameA = getSortNames(a.fullname || a.username);
      const nameB = getSortNames(b.fullname || b.username);
      let cmp = nameA.first.localeCompare(nameB.first, 'vi');
      if (cmp !== 0) return cmp;
      cmp = nameA.middle.localeCompare(nameB.middle, 'vi');
      if (cmp !== 0) return cmp;
      return nameA.last.localeCompare(nameB.last, 'vi');
    });

    return result;
  }, [data, search, filterRole, filterStatus]);

  const isSuperUser = Boolean(currentUser?.is_superuser);

  // ── Mở modal ──────────────────────────────────────────────────────
  const openAdd  = () => { setForm(EMPTY_FORM); setShowPw(false); setModal('add'); };
  const openEdit = (u) => {
    if (u.is_superuser && !isSuperUser) {
      return showAlert('Bạn không có quyền chỉnh sửa tài khoản Super Admin!', 'warning');
    }
    setForm({
      username: u.username,
      fullname: u.fullname || '',
      position: u.position || '',
      role: u.role,
      is_active: u.is_active,
      password: '',
      giao_vien_id: u.giao_vien_id || null,
    });
    setModal({ edit: u });
  };
  const openReset = (u) => {
    if (u.is_superuser && !isSuperUser) {
      return showAlert('Bạn không có quyền đặt lại mật khẩu cho tài khoản Super Admin!', 'warning');
    }
    setResetPw('');
    setShowResetPw(false);
    setModal({ reset: u });
  };

  // ── Lưu tạo / cập nhật ────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.username.trim()) return showAlert('Username không được để trống!', 'warning');
    if (!form.fullname.trim()) return showAlert('Họ tên không được để trống!', 'warning');
    if (modal === 'add' && !form.password) return showAlert('Mật khẩu không được để trống khi tạo mới!', 'warning');
    if (modal === 'add' && form.password.length < 6) return showAlert('Mật khẩu ít nhất 6 ký tự!', 'warning');

    setSaving(true);
    try {
      const payload = { ...form };
      if (modal !== 'add') delete payload.password;
      if (modal !== 'add') payload.id = modal.edit.id;
      if (payload.role !== 'giao_vien') payload.giao_vien_id = null;

      await api.post('/api/taikhoan/save/', payload);
      setModal(null);
      fetchData(true);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lưu thất bại!', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle trạng thái hoạt động nhanh ─────────────────────────────
  const toggleActive = async (u) => {
    if (u.is_superuser) {
      return showAlert('Không thể vô hiệu hóa tài khoản Super Admin!', 'warning');
    }
    if (u.id === currentUser?.id) {
      return showAlert('Không thể tắt tài khoản đang đăng nhập!', 'warning');
    }
    if (u.role === 'admin' && !isSuperUser) {
      return showAlert('Bạn không có quyền vô hiệu hóa Quản trị viên!', 'warning');
    }
    try {
      await api.post('/api/taikhoan/save/', {
        id: u.id, username: u.username, fullname: u.fullname,
        position: u.position, role: u.role, is_active: !u.is_active,
      });
      setData(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
    } catch (err) {
      showAlert(err.response?.data?.error || 'Cập nhật thất bại!', 'danger');
    }
  };

  // ── Xóa ────────────────────────────────────────────────────────────
  const doDelete = async () => {
    const id = confirmDel.id;
    setConfirmDel(null);
    try {
      await api.post('/api/taikhoan/delete/', { id });
      setData(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xóa thất bại!');
    }
  };

  // ── Đặt lại mật khẩu ──────────────────────────────────────────────
  const doResetPw = async () => {
    if (!resetPw || resetPw.length < 6) return showAlert('Mật khẩu mới ít nhất 6 ký tự!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/taikhoan/reset-pw/', { id: modal.reset.id, new_password: resetPw });
      showAlert('Đặt lại mật khẩu thành công!', 'success');
      setModal(null);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Đặt lại mật khẩu thất bại!');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <i className="fas fa-lock" style={{ fontSize: '3rem', color: '#ef4444', marginBottom: 16, display: 'block' }}></i>
        <h2 style={{ color: '#1a202c', marginBottom: 8 }}>Không có quyền truy cập</h2>
        <p style={{ color: '#64748b' }}>Chỉ Quản trị viên mới có thể quản lý tài khoản.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Về Dashboard</Link>
      </div>
    );
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Quản lý tài khoản</span>
          </div>
          <h2><i className="fas fa-users-cog" style={{ color: 'var(--primary)' }}></i> Quản lý Tài khoản</h2>
          <p>Tạo, cập nhật và phân quyền tài khoản nhân viên trong hệ thống.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <i className="fas fa-user-plus"></i> Thêm tài khoản
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <label><i className="fas fa-filter"></i></label>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Tất cả vai trò</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="1">Đang hoạt động</option>
          <option value="0">Bị vô hiệu hóa</option>
        </select>
        <input type="text" placeholder="Tìm tên hoặc username..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* ── Danh sách dạng thẻ ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
          <p style={{ marginTop: 12 }}>Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <i className="fas fa-user-slash" style={{ fontSize: '2.5rem', marginBottom: 12, display: 'block' }}></i>
          Không tìm thấy tài khoản nào
        </div>
      ) : (
        <div className="tk-cards-grid">
          {filtered.map(u => (
            <div key={u.id} className={`tk-card ${!u.is_active ? 'tk-card-inactive' : ''}`}>
              <div className="tk-card-top">
                <AvatarIcon name={u.fullname || u.username} active={u.is_active} />
                <div className="tk-card-meta">
                  <div className="tk-card-name">
                    {u.fullname || u.username}
                    {u.is_superuser && <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: '0.65rem' }}>Super</span>}
                    {u.id === currentUser?.id && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: '0.65rem' }}>Bạn</span>}
                  </div>
                  <div className="tk-card-username">@{u.username}</div>
                  {u.position && <div className="tk-card-position"><i className="fas fa-briefcase"></i> {u.position}</div>}
                </div>
                <div className="tk-card-status">
                  {u.is_active
                    ? <span className="badge badge-success"><i className="fas fa-circle" style={{ fontSize: '.45rem' }}></i> Hoạt động</span>
                    : <span className="badge badge-gray"><i className="fas fa-circle" style={{ fontSize: '.45rem' }}></i> Vô hiệu</span>
                  }
                </div>
              </div>

              <div className="tk-card-role">
                <RoleBadge role={u.role} />
                {u.giao_vien?.ho_ten && (
                  <span className="badge badge-gray" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Hồ sơ giáo viên liên kết">
                    <i className="fas fa-link" style={{ color: '#009CFF' }}></i> {u.giao_vien.ho_ten}
                  </span>
                )}
                {u.email && <span className="tk-email"><i className="fas fa-envelope"></i> {u.email}</span>}
              </div>

              <div className="tk-card-actions">
                <button
                  className="btn-icon edit"
                  title={u.is_superuser && !isSuperUser ? "Không thể chỉnh sửa Super Admin" : "Sửa thông tin"}
                  onClick={() => openEdit(u)}
                  disabled={u.is_superuser && !isSuperUser}
                  style={u.is_superuser && !isSuperUser ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                >
                  <i className="fas fa-edit"></i>
                </button>
                <button
                  className="btn-icon"
                  title={u.is_superuser && !isSuperUser ? "Không thể đặt lại mật khẩu Super Admin" : "Đặt lại mật khẩu"}
                  style={{ color: '#f59e0b', ...(u.is_superuser && !isSuperUser ? { opacity: 0.35, cursor: 'not-allowed' } : {}) }}
                  onClick={() => openReset(u)}
                  disabled={u.is_superuser && !isSuperUser}
                >
                  <i className="fas fa-key"></i>
                </button>
                <button
                  className="btn-icon"
                  title={
                    u.is_superuser
                      ? "Không thể vô hiệu hóa Super Admin"
                      : u.id === currentUser?.id
                        ? "Không thể tắt tài khoản của chính mình"
                        : (!isSuperUser && u.role === 'admin')
                          ? "Bạn không có quyền vô hiệu hóa Quản trị viên"
                          : (u.is_active ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản')
                  }
                  style={{
                    color: u.is_active ? '#f59e0b' : '#22c55e',
                    ...(u.is_superuser || u.id === currentUser?.id || (!isSuperUser && u.role === 'admin') ? { opacity: 0.35, cursor: 'not-allowed' } : {})
                  }}
                  onClick={() => toggleActive(u)}
                  disabled={u.is_superuser || u.id === currentUser?.id || (!isSuperUser && u.role === 'admin')}
                >
                  <i className={`fas ${u.is_active ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                </button>
                <button
                  className="btn-icon delete"
                  title={
                    u.is_superuser
                      ? "Không thể xóa Super Admin"
                      : u.id === currentUser?.id
                        ? "Không thể xóa tài khoản của chính mình"
                        : (!isSuperUser && u.role === 'admin')
                          ? "Chỉ Super Admin mới được xóa Quản trị viên"
                          : "Xóa tài khoản"
                  }
                  style={u.is_superuser || u.id === currentUser?.id || (!isSuperUser && u.role === 'admin') ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                  onClick={() => setConfirmDel({ id: u.id, name: u.fullname || u.username })}
                  disabled={u.is_superuser || u.id === currentUser?.id || (!isSuperUser && u.role === 'admin')}
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal thêm / sửa ── */}
      {(modal === 'add' || modal?.edit) && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className={`fas ${modal === 'add' ? 'fa-user-plus' : 'fa-user-edit'}`}></i>
                {modal === 'add' ? ' Thêm tài khoản mới' : ` Sửa: ${modal.edit.username}`}
              </div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên đăng nhập <span className="required">*</span></label>
                <input
                  className="form-control"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="vd: nguyen.van.a"
                  disabled={modal?.edit}
                />
                {modal?.edit && <small style={{ color: '#94a3b8' }}>Không thể đổi tên đăng nhập</small>}
              </div>

              <div className="form-group">
                <label className="form-label">Họ và tên <span className="required">*</span></label>
                <input className="form-control" value={form.fullname} onChange={e => setForm({ ...form, fullname: e.target.value })} placeholder="Nguyễn Văn A" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Chức vụ</label>
                  <input className="form-control" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="VD: Giáo viên" />
                </div>
                <div className="form-group">
                  <label className="form-label">Vai trò <span className="required">*</span></label>
                  <select
                    className="form-control"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    disabled={modal?.edit?.is_superuser}
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  {modal?.edit?.is_superuser && <small style={{ color: '#94a3b8' }}>Super Admin luôn có vai trò Quản trị viên</small>}
                </div>
              </div>

              {form.role === 'giao_vien' && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-chalkboard-teacher" style={{ color: '#8b5cf6' }}></i>
                    Hồ sơ Giáo viên liên kết
                  </label>
                  <select
                    className="form-control"
                    value={form.giao_vien_id || ''}
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : null;
                      const gv = gvList.find(x => x.id === val);
                      setForm(prev => ({
                        ...prev,
                        giao_vien_id: val,
                        fullname: prev.fullname || gv?.ho_ten || '',
                        position: prev.position || 'Giáo viên',
                      }));
                    }}
                  >
                    <option value="">-- Chọn giáo viên từ danh mục (tuỳ chọn) --</option>
                    {gvList.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.ho_ten} {g.to_bo_mon ? `(${g.to_bo_mon})` : ''}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#64748b', marginTop: 4, display: 'block', fontSize: '0.8rem' }}>
                    Tài khoản giáo viên cần liên kết với hồ sơ GV để tự động đồng bộ ca trực và điểm danh đúng phòng được phân công.
                  </small>
                </div>
              )}

              {modal === 'add' && (
                <div className="form-group">
                  <label className="form-label">Mật khẩu <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="form-control"
                      style={{ paddingRight: 44 }}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Ít nhất 6 ký tự"
                    />
                    <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowPw(p => !p)}>
                      <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
              )}

              <div className="toggle-wrapper" style={{ marginTop: 4 }}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    disabled={modal?.edit?.is_superuser}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className="toggle-label">
                  Tài khoản đang hoạt động
                  {modal?.edit?.is_superuser && <small style={{ color: '#94a3b8', display: 'block' }}>(Tài khoản Super Admin không thể bị vô hiệu hóa)</small>}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal đặt lại mật khẩu ── */}
      {modal?.reset && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-key"></i> Đặt lại mật khẩu</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="info-banner" style={{ marginBottom: 16 }}>
                <i className="fas fa-info-circle"></i> Đặt lại mật khẩu cho: <strong>{modal.reset.fullname || modal.reset.username}</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Mật khẩu mới <span className="required">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showResetPw ? 'text' : 'password'}
                    className="form-control"
                    style={{ paddingRight: 44 }}
                    value={resetPw}
                    onChange={e => setResetPw(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                  />
                  <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowResetPw(p => !p)}>
                    <i className={`fas ${showResetPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={doResetPw} disabled={saving}>
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-key'}`}></i> {saving ? 'Đang lưu...' : 'Đặt lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Xóa tài khoản"
        message={confirmDel ? `Bạn có chắc muốn xóa tài khoản "${confirmDel.name}" khỏi hệ thống? Hành động này không thể hoàn tác.` : ''}
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
