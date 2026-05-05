import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/admin.css';

const LOAI_MAP = {
  khay_an:   'Khay ăn / Bát đĩa',
  giuong:    'Giường / Nệm',
  binh_nuoc: 'Bình nước',
  dieu_hoa:  'Máy điều hoà',
  quat:      'Quạt trần / Quạt điện',
  tu_do:     'Tủ đồ',
  khac:      'Khác',
};

const LOAI_OPTIONS = Object.entries(LOAI_MAP);

const EMPTY_FORM = {
  nam_hoc: '', lan_mua: 1, loai_vat_dung: 'khay_an', so_luong: '', ngay_mua: new Date().toISOString().split('T')[0],
};

export default function VatDung() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const [data, setData]       = useState([]);
  const [phongList, setPhongList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);  // null | 'add' | { phanbo: item }
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  // Phân bổ
  const [phanboModal, setPhanboModal] = useState(null); // { mua_id, con_lai }
  const [pbForm, setPbForm]   = useState({ phong_id: '', so_luong: '' });
  const [confirmDel, setConfirmDel] = useState(null); // id number

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/vatdung/'),
      api.get('/api/phong/'),
    ]).then(([vdRes, phRes]) => {
      if (vdRes.data?.ok) setData(vdRes.data.vatdung);
      if (phRes.data?.ok) setPhongList(phRes.data.phong);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Chỉ gọi setState trong callback bất đồng bộ (.then / .finally)
    Promise.all([
      api.get('/api/vatdung/'),
      api.get('/api/phong/'),
    ]).then(([vdRes, phRes]) => {
      if (vdRes.data?.ok) setData(vdRes.data.vatdung);
      if (phRes.data?.ok) setPhongList(phRes.data.phong);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Thống kê
  const stats = {
    loai:   data.length,
    tongSL: data.reduce((s, d) => s + (d.so_luong || 0), 0),
    daPhan: data.reduce((s, d) => s + (d.da_phan || 0), 0),
    conLai: data.reduce((s, d) => s + (d.con_lai || 0), 0),
  };

  const handleSaveMua = async () => {
    if (!form.nam_hoc || !form.so_luong) return showAlert('Vui lòng điền đầy đủ!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/vatdung/mua/save/', form);
      setModal(null);
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) { showAlert(err.response?.data?.error || 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  const handleDeleteMua = (id) => setConfirmDel(id);
  const doDeleteMua = async () => {
    const id = confirmDel;
    setConfirmDel(null);
    try {
      await api.post('/api/vatdung/mua/delete/', { id });
      fetchData();
    } catch (err) { showAlert(err.response?.data?.error || 'Xóa thất bại'); }
  };

  const handleSavePhanbo = async () => {
    if (!pbForm.phong_id || !pbForm.so_luong) return showAlert('Chọn phòng và nhập số lượng!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/vatdung/phanbo/save/', {
        mua_id:    phanboModal.mua_id,
        phong_id:  pbForm.phong_id,
        so_luong:  Number(pbForm.so_luong),
      });
      setPhanboModal(null);
      setPbForm({ phong_id: '', so_luong: '' });
      fetchData();
    } catch (err) { showAlert(err.response?.data?.error || 'Phân bổ thất bại'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link><span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Vật dụng</span>
          </div>
          <h2><i className="fas fa-boxes" style={{color:'var(--primary)'}}></i> Quản lý Vật dụng</h2>
          <p>Theo dõi các lần mua sắm vật dụng bán trú và phân bổ cho phòng.</p>
        </div>
        <div className="page-header-actions">
          {user?.can_quan_ly_danh_muc
            ? <button className="btn btn-primary" onClick={() => setModal('add')}><i className="fas fa-plus"></i> Thêm lần mua</button>
            : <span className="badge badge-warning" style={{padding:'8px 14px'}}><i className="fas fa-eye"></i> Chế độ xem</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards-row">
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-boxes"></i></div><div className="stat-card-info"><p>Lần mua</p><h3>{stats.loai}</h3></div></div>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-cubes"></i></div><div className="stat-card-info"><p>Tổng SL</p><h3>{stats.tongSL}</h3></div></div>
        <div className="stat-card purple"><div className="stat-card-icon"><i className="fas fa-share-square"></i></div><div className="stat-card-info"><p>Đã phân bổ</p><h3>{stats.daPhan}</h3></div></div>
        <div className="stat-card yellow"><div className="stat-card-icon"><i className="fas fa-warehouse"></i></div><div className="stat-card-info"><p>Còn lại</p><h3>{stats.conLai}</h3></div></div>
      </div>

      {/* Bảng dữ liệu */}
      <div className="datatable-wrapper">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Loại vật dụng</th>
                <th>Năm học</th>
                <th>Lần mua</th>
                <th>Ngày mua</th>
                <th>Tổng SL</th>
                <th>Đã phân bổ</th>
                <th>Còn lại</th>
                <th>Phân bổ chi tiết</th>
                {user?.can_quan_ly_danh_muc && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" style={{textAlign:'center',padding:'40px'}}>
                  <i className="fas fa-spinner fa-spin"></i> Đang tải...
                </td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="10" style={{textAlign:'center',padding:'40px',color:'#94a3b8'}}>Chưa có dữ liệu vật dụng</td></tr>
              ) : data.map((vd, i) => (
                <tr key={vd.id}>
                  <td>{i + 1}</td>
                  <td><b>{LOAI_MAP[vd.loai_vat_dung] || vd.loai_vat_dung}</b></td>
                  <td>{vd.nam_hoc}</td>
                  <td><span className="badge badge-gray">Lần {vd.lan_mua}</span></td>
                  <td>{vd.ngay_mua ? new Date(vd.ngay_mua).toLocaleDateString('vi-VN') : '—'}</td>
                  <td><b>{vd.so_luong}</b></td>
                  <td>
                    <span className={`badge ${vd.da_phan > 0 ? 'badge-success' : 'badge-gray'}`}>
                      {vd.da_phan ?? 0}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${(vd.con_lai ?? 0) > 0 ? 'badge-warning' : 'badge-gray'}`}>
                      {vd.con_lai ?? 0}
                    </span>
                  </td>
                  <td>
                    <div style={{fontSize:'0.75rem',color:'#64748b'}}>
                      {vd.phan_bo?.length > 0
                        ? vd.phan_bo.map(pb => (
                          <span key={pb.id} style={{marginRight:6}}>
                            {pb.phong?.ma_phong || pb.phong_id}: <b>{pb.so_luong}</b>
                          </span>
                        ))
                        : <span style={{color:'#cbd5e1'}}>Chưa phân bổ</span>
                      }
                    </div>
                    {user?.can_quan_ly_danh_muc && (vd.con_lai ?? 0) > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{marginTop:4,fontSize:'0.75rem',padding:'2px 8px'}}
                        onClick={() => { setPhanboModal({mua_id: vd.id, con_lai: vd.con_lai}); setPbForm({phong_id:'',so_luong:''}); }}
                      >
                        <i className="fas fa-plus"></i> Phân bổ
                      </button>
                    )}
                  </td>
                  {user?.can_quan_ly_danh_muc && (
                    <td><div className="action-btns">
                      <button className="btn-icon delete" onClick={() => handleDeleteMua(vd.id)} title="Xoá">
                        <i className="fas fa-trash"></i>
                      </button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm lần mua */}
      {modal === 'add' && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-boxes"></i> Thêm lần mua vật dụng</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Loại vật dụng <span className="required">*</span></label>
                <select className="form-control" value={form.loai_vat_dung}
                  onChange={e => setForm({...form, loai_vat_dung: e.target.value})}>
                  {LOAI_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Năm học <span className="required">*</span></label>
                  <input className="form-control" value={form.nam_hoc}
                    onChange={e => setForm({...form, nam_hoc: e.target.value})}
                    placeholder="VD: 2025-2026" />
                </div>
                <div className="form-group">
                  <label className="form-label">Lần mua</label>
                  <input type="number" className="form-control" min="1" value={form.lan_mua}
                    onChange={e => setForm({...form, lan_mua: Number(e.target.value)})} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Số lượng <span className="required">*</span></label>
                  <input type="number" className="form-control" min="1" value={form.so_luong}
                    onChange={e => setForm({...form, so_luong: e.target.value})} placeholder="VD: 200" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngày mua</label>
                  <input type="date" className="form-control" value={form.ngay_mua}
                    onChange={e => setForm({...form, ngay_mua: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSaveMua} disabled={saving}>
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Phân bổ */}
      {phanboModal && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-share-square"></i> Phân bổ vật dụng</div>
              <button className="modal-close" onClick={() => setPhanboModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="info-banner" style={{marginBottom:12}}>
                <i className="fas fa-info-circle"></i> Còn lại: <b>{phanboModal.con_lai}</b> cái chưa phân bổ
              </div>
              <div className="form-group">
                <label className="form-label">Phòng <span className="required">*</span></label>
                <select className="form-control" value={pbForm.phong_id}
                  onChange={e => setPbForm({...pbForm, phong_id: e.target.value})}>
                  <option value="">-- Chọn phòng --</option>
                  {phongList.map(p => (
                    <option key={p.ma_phong} value={p.ma_phong}>
                      {p.ma_phong} ({p.loai_phong === 0 ? 'Phòng ăn' : p.gioi_tinh === 0 ? 'Ngủ Nam' : 'Ngủ Nữ'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Số lượng <span className="required">*</span></label>
                <input type="number" className="form-control" min="1" max={phanboModal.con_lai}
                  value={pbForm.so_luong}
                  onChange={e => setPbForm({...pbForm, so_luong: e.target.value})}
                  placeholder={`Tối đa ${phanboModal.con_lai}`} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPhanboModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSavePhanbo} disabled={saving}>
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i> {saving ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Xóa lần mua"
        message="Bạn có chắc muốn xóa lần mua vật dụng này?"
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDeleteMua}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
