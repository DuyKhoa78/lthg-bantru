import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { removeAccents, getSortNames } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './GiaoVien.css';

const DAYS_LABEL = ['T2', 'T3', 'T4', 'T5', 'T6'];

function RanhGrid({ ranh }) {
  return (
    <div className="ranh-mini-grid">
      {DAYS_LABEL.map((d, i) => (
        <div key={i} className="ranh-mini-cell">
          <span className="ranh-mini-label">{d}</span>
          <span className={`ranh-mini-dot ${ranh?.[i] ? 'ranh' : 'ban'}`}>{ranh?.[i] ? '✓' : '✗'}</span>
        </div>
      ))}
    </div>
  );
}

const EMPTY_FORM = { ho_ten: '', gioi_tinh: '', so_dien_thoai: '', dang_lam: true, lich_ranh: [false, false, false, false, false] };

export default function GiaoVien() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGT, setFilterGT] = useState('');
  const [filterTT, setFilterTT] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // { id, name }

  const fetchData = () => {
    setLoading(true);
    api.get('/api/giaovien/')
      .then((res) => { if (res.data?.ok) setData(res.data.giaovien); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    let result = data.filter((gv) => {
      if (search) {
        const searchStr = removeAccents(search.toLowerCase());
        const nameStr = removeAccents(gv.ho_ten.toLowerCase());
        if (!nameStr.includes(searchStr)) return false;
      }
      if (filterGT !== '' && String(gv.gioi_tinh) !== filterGT) return false;
      if (filterTT !== '' && String(Number(gv.dang_lam)) !== filterTT) return false;
      return true;
    });

    result.sort((a, b) => {
      const nameA = getSortNames(a.ho_ten);
      const nameB = getSortNames(b.ho_ten);
      let cmp = nameA.first.localeCompare(nameB.first, 'vi');
      if (cmp !== 0) return cmp;
      cmp = nameA.middle.localeCompare(nameB.middle, 'vi');
      if (cmp !== 0) return cmp;
      return nameA.last.localeCompare(nameB.last, 'vi');
    });

    return result;
  }, [data, search, filterGT, filterTT]);

  const stats = {
    total: data.length,
    nam: data.filter(g => g.gioi_tinh === 0).length,
    nu: data.filter(g => g.gioi_tinh === 1).length,
    danglam: data.filter(g => g.dang_lam).length,
  };

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add'); };
  const openEdit = (gv) => { setForm({ ...gv, so_dien_thoai: gv.so_dien_thoai || '' }); setModal({ edit: gv }); };

  const handleDelete = (id, name) => setConfirmDel({ id, name });
  const doDelete = async () => {
    const id = confirmDel.id;
    setConfirmDel(null);
    try {
      await api.post(`/api/giaovien/${id}/delete/`);
      setData(p => p.filter(g => g.id !== id));
    } catch (err) {
      showAlert(err.response?.data?.error || 'Xóa thất bại');
    }
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim() || form.gioi_tinh === '') return showAlert('Vui lòng điền đầy đủ thông tin!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/giaovien/save/', {
        id: modal === 'add' ? undefined : modal.edit.id,
        ho_ten: form.ho_ten,
        gioi_tinh: Number(form.gioi_tinh),
        so_dien_thoai: form.so_dien_thoai || null,
        nhiem_vu: form.nhiem_vu ?? 0,
        dang_lam: form.dang_lam,
        lich_ranh: form.lich_ranh || [false, false, false, false, false],
      });
      setModal(null);
      fetchData();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link><span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Quản lý giáo viên</span>
          </div>
          <h2><i className="fas fa-chalkboard-teacher" style={{ color: 'var(--primary)' }}></i> Quản lý Giáo viên</h2>
          <p>Thêm, sửa, xóa giáo viên và quản lý lịch rảnh buổi trưa.</p>
        </div>
        <div className="page-header-actions">
          {user?.is_admin || user?.is_superuser ? (
            <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Thêm giáo viên</button>
          ) : (
            <span className="badge badge-warning" style={{ padding: '8px 14px', fontSize: '.8rem' }}><i className="fas fa-eye"></i> Chế độ xem</span>
          )}
        </div>
      </div>

      <div className="stat-cards-row">
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-chalkboard-teacher"></i></div><div className="stat-card-info"><p>Tổng GV</p><h3>{stats.total}</h3></div></div>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-user-check"></i></div><div className="stat-card-info"><p>Đang làm</p><h3>{stats.danglam}</h3></div></div>
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-mars"></i></div><div className="stat-card-info"><p>Nam</p><h3>{stats.nam}</h3></div></div>
        <div className="stat-card purple"><div className="stat-card-icon"><i className="fas fa-venus"></i></div><div className="stat-card-info"><p>Nữ</p><h3>{stats.nu}</h3></div></div>
      </div>

      <div className="filter-bar">
        <label><i className="fas fa-filter"></i></label>
        <select value={filterGT} onChange={(e) => setFilterGT(e.target.value)}>
          <option value="">Tất cả giới tính</option><option value="0">Nam</option><option value="1">Nữ</option>
        </select>
        <select value={filterTT} onChange={(e) => setFilterTT(e.target.value)}>
          <option value="">Tất cả</option><option value="1">Đang làm</option><option value="0">Nghỉ</option>
        </select>
        <input type="text" placeholder="Tìm tên GV..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="datatable-wrapper">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Họ tên</th><th>Giới tính</th>
                <th>Trạng thái</th><th>Ca tháng</th><th>Lịch rảnh (T2–T6)</th>
                {(user?.is_admin || user?.is_superuser) && <th style={{ textAlign: 'center' }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}><i className="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>
              ) : filtered.map((gv, idx) => (
                <tr key={gv.id}>
                  <td>{idx + 1}</td>
                  <td><b>{gv.ho_ten}</b><br /><small style={{ color: '#94a3b8' }}>{gv.so_dien_thoai || '—'}</small></td>
                  <td><span className={`badge ${gv.gioi_tinh === 0 ? 'badge-info' : 'badge-warning'}`}>{gv.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</span></td>
                  <td>{gv.dang_lam ? <span className="badge badge-success"><i className="fas fa-circle" style={{ fontSize: '.5rem' }}></i> Đang làm</span> : <span className="badge badge-danger">Nghỉ</span>}</td>
                  <td><span className="badge badge-gray">{gv.ca_thang ?? 0} ca</span></td>
                  <td><RanhGrid ranh={gv.lich_ranh} /></td>
                  {(user?.is_admin || user?.is_superuser) && (
                    <td>
                      <div className="action-btns" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon edit" onClick={() => openEdit(gv)} title="Sửa"><i className="fas fa-edit"></i></button>
                        <button className="btn-icon delete" onClick={() => handleDelete(gv.id, gv.ho_ten)} title="Xoá"><i className="fas fa-trash"></i></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-chalkboard-teacher"></i> {modal === 'add' ? 'Thêm giáo viên' : 'Sửa giáo viên'}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Họ và tên <span className="required">*</span></label>
                <input className="form-control" value={form.ho_ten} onChange={(e) => setForm({ ...form, ho_ten: e.target.value })} placeholder="Nguyễn Văn A" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Giới tính <span className="required">*</span></label>
                  <select className="form-control" value={form.gioi_tinh} onChange={(e) => setForm({ ...form, gioi_tinh: Number(e.target.value) })}>
                    <option value="">-- Chọn --</option><option value="0">Nam</option><option value="1">Nữ</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Số điện thoại</label>
                  <input className="form-control" value={form.so_dien_thoai} onChange={(e) => setForm({ ...form, so_dien_thoai: e.target.value })} placeholder="090xxxx567" />
                </div>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div className="toggle-wrapper">
                    <label className="toggle">
                      <input type="checkbox" checked={form.dang_lam} onChange={(e) => setForm({ ...form, dang_lam: e.target.checked })} />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-label">Đang làm việc</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Lịch rảnh (Đánh dấu những ngày GV có thể trực)</label>
                <div style={{ display: 'flex', gap: '15px', marginTop: 8 }}>
                  {['T2', 'T3', 'T4', 'T5', 'T6'].map((day, idx) => (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      <input 
                        type="checkbox" 
                        checked={form.lich_ranh?.[idx] || false} 
                        onChange={(e) => {
                          const newRanh = [...(form.lich_ranh || [false, false, false, false, false])];
                          newRanh[idx] = e.target.checked;
                          setForm({ ...form, lich_ranh: newRanh });
                        }} 
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      {day}
                    </label>
                  ))}
                </div>
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

      <ConfirmDialog
        open={!!confirmDel}
        title="Xóa giáo viên"
        message={confirmDel ? `Bạn có chắc muốn xóa giáo viên "${confirmDel.name}" khỏi hệ thống?` : ''}
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
