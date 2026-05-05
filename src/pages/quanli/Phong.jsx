import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/admin.css';
import './Phong.css';

const EMPTY_FORM = { ma_phong: '', loai_phong: '0', suc_chua: '', gioi_tinh: '0', sl_diem_danh: 1, sl_ho_tro: 1 };

function loaiLabel(p) {
  if (p.loai_phong === 0) return 'Phòng ăn';
  return p.gioi_tinh === 0 ? 'Phòng ngủ Nam' : 'Phòng ngủ Nữ';
}
function loaiBadge(p) {
  if (p.loai_phong === 0) return 'badge-info';
  return p.gioi_tinh === 0 ? 'badge-primary' : 'badge-warning';
}

function PhongCard({ p, isAdmin, onEdit, onDelete }) {
  const pct = p.suc_chua > 0 ? Math.min(100, Math.round((p.so_hs_hien_tai ?? 0) / p.suc_chua * 100)) : 0;
  return (
    <div className={`phong-card${p.loai_phong === 0 ? ' an' : p.gioi_tinh === 0 ? ' nam' : ' nu'}`}>
      <div className="phong-card-header">
        <i className={`fas ${p.loai_phong === 0 ? 'fa-utensils' : 'fa-moon'}`}></i>
        <span>{p.ma_phong}</span>
        <span className={`badge ${loaiBadge(p)}`}>{loaiLabel(p)}</span>
      </div>
      <div className="phong-capacity">
        <div className="capacity-info">
          <span>{p.so_hs_hien_tai ?? 0}/{p.suc_chua} HS</span>
          <span>{pct}%</span>
        </div>
        <div className="capacity-bar">
          <div className="capacity-fill" style={{
            width: `${pct}%`,
            background: pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e'
          }}></div>
        </div>
      </div>
      <div className="phong-meta" style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 6 }}>
        <span><i className="fas fa-user-tie" style={{ marginRight: 4 }}></i>Điểm danh: {p.sl_diem_danh} GV</span>
        <span style={{ marginLeft: 12 }}><i className="fas fa-hands-helping" style={{ marginRight: 4 }}></i>Hỗ trợ: {p.sl_ho_tro} GV</span>
      </div>
      {isAdmin && (
        <div className="phong-actions">
          <button className="btn-icon edit" onClick={() => onEdit(p)}><i className="fas fa-edit"></i></button>
          <button className="btn-icon delete" onClick={() => onDelete(p.ma_phong)}><i className="fas fa-trash"></i></button>
        </div>
      )}
    </div>
  );
}

export default function Phong() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLoai, setFilterLoai] = useState('');
  const [modal, setModal]     = useState(null); // null | 'add' | { edit: phong }
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // ma_phong string

  const fetchData = () => {
    setLoading(true);
    api.get('/api/phong/')
      .then(res => { if (res.data?.ok) setData(res.data.phong); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, []);

  const filtered = data.filter(p => {
    if (filterLoai === 'an')  return p.loai_phong === 0;
    if (filterLoai === 'ngu') return p.loai_phong === 1;
    return true;
  });

  const stats = {
    total:   data.length,
    phongAn: data.filter(p => p.loai_phong === 0).length,
    phongNgu:data.filter(p => p.loai_phong === 1).length,
  };

  const openAdd  = () => { setForm(EMPTY_FORM); setModal('add'); };
  const openEdit = (p) => {
    setForm({
      ma_phong:      p.ma_phong,
      loai_phong:    String(p.loai_phong),
      suc_chua:      String(p.suc_chua),
      gioi_tinh:     p.gioi_tinh !== null ? String(p.gioi_tinh) : '0',
      sl_diem_danh:  p.sl_diem_danh ?? 1,
      sl_ho_tro:     p.sl_ho_tro ?? 1,
    });
    setModal({ edit: p });
  };

  const handleDelete = (ma_phong) => setConfirmDel(ma_phong);
  const doDelete = async () => {
    const mp = confirmDel;
    setConfirmDel(null);
    try {
      await api.post('/api/phong/delete/', { ma_phong: mp });
      setData(d => d.filter(p => p.ma_phong !== mp));
    } catch (err) { showAlert(err.response?.data?.error || 'Xóa thất bại'); }
  };

  const handleSave = async () => {
    if (!form.ma_phong.trim() || !form.suc_chua) return showAlert('Vui lòng điền đầy đủ!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/phong/save/', {
        is_edit:      modal !== 'add',
        ma_phong:     form.ma_phong.trim().toUpperCase(),
        loai_phong:   Number(form.loai_phong),
        suc_chua:     Number(form.suc_chua),
        gioi_tinh:    Number(form.loai_phong) === 1 ? Number(form.gioi_tinh) : null,
        sl_diem_danh: Number(form.sl_diem_danh),
        sl_ho_tro:    Number(form.sl_ho_tro),
      });
      setModal(null);
      fetchData();
    } catch (err) { showAlert(err.response?.data?.error || 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link><span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Quản lý phòng</span>
          </div>
          <h2><i className="fas fa-door-open" style={{color:'var(--primary)'}}></i> Quản lý Phòng</h2>
          <p>Theo dõi sức chứa phòng ăn và phòng ngủ bán trú.</p>
        </div>
        <div className="page-header-actions">
          {user?.is_admin
            ? <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Thêm phòng</button>
            : <span className="badge badge-warning" style={{padding:'8px 14px'}}><i className="fas fa-eye"></i> Chế độ xem</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards-row">
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-door-open"></i></div><div className="stat-card-info"><p>Tổng phòng</p><h3>{stats.total}</h3></div></div>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-utensils"></i></div><div className="stat-card-info"><p>Phòng ăn</p><h3>{stats.phongAn}</h3></div></div>
        <div className="stat-card purple"><div className="stat-card-icon"><i className="fas fa-moon"></i></div><div className="stat-card-info"><p>Phòng ngủ</p><h3>{stats.phongNgu}</h3></div></div>
      </div>

      {/* Filter */}
      <div className="filter-bar">
        <label><i className="fas fa-filter"></i></label>
        <select value={filterLoai} onChange={e => setFilterLoai(e.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="an">Phòng ăn</option>
          <option value="ngu">Phòng ngủ</option>
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{textAlign:'center',padding:'60px',color:'#94a3b8'}}>
          <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem',color:'var(--primary)'}}></i>
          <p style={{marginTop:12}}>Đang tải dữ liệu...</p>
        </div>
      ) : (
        <div className="phong-grid">
          {filtered.length === 0
            ? <p style={{color:'#94a3b8',padding:'40px 0'}}>Không có phòng nào.</p>
            : filtered.map(p => (
              <PhongCard key={p.ma_phong} p={p} isAdmin={user?.is_admin}
                onEdit={openEdit} onDelete={handleDelete} />
            ))
          }
        </div>
      )}

      {/* Bảng tổng hợp */}
      {!loading && (
        <div className="datatable-wrapper" style={{marginTop:20}}>
          <div className="datatable-toolbar">
            <div style={{fontWeight:700,fontSize:'0.9rem',color:'var(--text-main)',display:'flex',alignItems:'center',gap:8}}>
              <i className="fas fa-table" style={{color:'var(--primary)'}}></i> Danh sách phòng
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã phòng</th><th>Loại</th><th>Giới tính</th>
                  <th>Sức chứa</th><th>GV ĐD</th><th>GV HT</th>
                  {user?.is_admin && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.ma_phong}>
                    <td><b>{p.ma_phong}</b></td>
                    <td><span className={`badge ${loaiBadge(p)}`}>{p.loai_phong === 0 ? 'Phòng ăn' : 'Phòng ngủ'}</span></td>
                    <td>{p.loai_phong === 0 ? '—' : p.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</td>
                    <td>{p.suc_chua}</td>
                    <td>{p.sl_diem_danh}</td>
                    <td>{p.sl_ho_tro}</td>
                    {user?.is_admin && (
                      <td><div className="action-btns">
                        <button className="btn-icon edit" onClick={() => openEdit(p)}><i className="fas fa-edit"></i></button>
                        <button className="btn-icon delete" onClick={() => handleDelete(p.ma_phong)}><i className="fas fa-trash"></i></button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Thêm/Sửa */}
      {modal && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-door-open"></i> {modal === 'add' ? 'Thêm phòng mới' : `Sửa phòng ${modal.edit?.ma_phong}`}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mã phòng <span className="required">*</span></label>
                  <input className="form-control" value={form.ma_phong}
                    disabled={modal !== 'add'}
                    maxLength={4}
                    onChange={e => setForm({...form, ma_phong: e.target.value.toUpperCase()})}
                    placeholder="VD: PA01" />
                  <small style={{ color: '#94a3b8', fontSize: '0.73rem', marginTop: 3, display: 'block' }}>
                    Tối đa 4 ký tự — VD: <b>PA1</b>, <b>PA01</b>, <b>N1</b>
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">Loại phòng <span className="required">*</span></label>
                  <select className="form-control" value={form.loai_phong}
                    onChange={e => setForm({...form, loai_phong: e.target.value})}>
                    <option value="0">Phòng ăn</option>
                    <option value="1">Phòng ngủ</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Sức chứa (HS) <span className="required">*</span></label>
                  <input type="number" className="form-control" min="1" value={form.suc_chua}
                    onChange={e => setForm({...form, suc_chua: e.target.value})} placeholder="VD: 40" />
                </div>
                {Number(form.loai_phong) === 1 && (
                  <div className="form-group">
                    <label className="form-label">Giới tính <span className="required">*</span></label>
                    <select className="form-control" value={form.gioi_tinh}
                      onChange={e => setForm({...form, gioi_tinh: e.target.value})}>
                      <option value="0">Nam</option>
                      <option value="1">Nữ</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Số GV điểm danh</label>
                  <input type="number" className="form-control" min="1" value={form.sl_diem_danh}
                    onChange={e => setForm({...form, sl_diem_danh: Number(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Số GV hỗ trợ</label>
                  <input type="number" className="form-control" min="0" value={form.sl_ho_tro}
                    onChange={e => setForm({...form, sl_ho_tro: Number(e.target.value)})} />
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
        title="Xóa phòng"
        message={confirmDel ? `Bạn có chắc muốn xóa phòng "${confirmDel}" khỏi hệ thống?` : ''}
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
