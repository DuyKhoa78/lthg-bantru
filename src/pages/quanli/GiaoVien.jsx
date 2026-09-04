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

  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const fetchData = () => {
    setLoading(true);
    api.get('/api/giaovien/')
      .then((res) => { if (res.data?.ok) setData(res.data.giaovien); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, []);

  const handleCopyCode = (gv) => {
    if (!gv.ma_bao_mat) return;
    navigator.clipboard.writeText(gv.ma_bao_mat);
    setCopiedCodeId(gv.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleResetCode = async (gv) => {
    if (!window.confirm(`Bạn có chắc muốn cấp mã bảo mật mới cho giáo viên "${gv.ho_ten}"? (Mã cũ sẽ hết hiệu lực)`)) return;
    try {
      const res = await api.post(`/api/giaovien/${gv.id}/reset-code/`);
      if (res.data?.ok) {
        showAlert(`Đã cấp mã mới cho ${gv.ho_ten}: ${res.data.ma_bao_mat}`, 'success');
        fetchData();
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Cấp mã thất bại', 'danger');
    }
  };

  const handleExportCodes = () => {
    if (!data.length) return showAlert('Chưa có giáo viên nào để xuất danh sách', 'warning');
    const header = '\uFEFFSTT,Họ và tên,Giới tính,Số điện thoại,Mã bảo mật Form (5 ký tự)\n';
    const rows = data.map((gv, i) =>
      `${i + 1},"${gv.ho_ten}","${gv.gioi_tinh === 0 ? 'Nam' : 'Nữ'}","${gv.so_dien_thoai || ''}","${gv.ma_bao_mat || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Sach_Ma_GV_BanTru_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert('Đã xuất danh sách mã Giáo viên thành công', 'success');
  };

  const handleDownloadTemplate = () => {
    const header = '\uFEFFSTT,Họ và tên,Giới tính,Số điện thoại\n1,Nguyễn Văn A,Nam,0901234567\n2,Trần Thị B,Nữ,\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mau_Danh_Sach_Giao_Vien.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = async () => {
    if (!importFile) return showAlert('Vui lòng chọn file CSV trước khi tải lên', 'warning');
    setImporting(true);
    const formData = new FormData();
    formData.append('file', importFile);
    try {
      const res = await api.post('/api/giaovien/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.ok) {
        const msg = res.data.created
          ? `Đã nạp thành công: ${res.data.created} giáo viên mới được thêm (${res.data.updated || 0} đã có cập nhật). Hệ thống đã tự động cấp mã 5 ký tự duy nhất!`
          : `Đã nạp thành công và cập nhật dữ liệu cho ${res.data.success} giáo viên!`;
        showAlert(msg, 'success');
        setModal(null);
        setImportFile(null);
        fetchData();
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Nhập file thất bại', 'danger');
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    let result = data.filter((gv) => {
      if (search) {
        const searchStr = removeAccents(search.toLowerCase());
        const nameStr = removeAccents(gv.ho_ten.toLowerCase());
        const codeStr = (gv.ma_bao_mat || '').toLowerCase();
        if (!nameStr.includes(searchStr) && !codeStr.includes(searchStr)) return false;
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

  const openAdd = () => { setForm({ ...EMPTY_FORM, ma_bao_mat: '' }); setModal('add'); };
  const openEdit = (gv) => { setForm({ ...gv, so_dien_thoai: gv.so_dien_thoai || '', ma_bao_mat: gv.ma_bao_mat || '' }); setModal({ edit: gv }); };

  // Hàm sinh mã 5 ký tự ngẫu nhiên duy nhất trên Client (đảm bảo không trùng với bất kỳ GV nào đang có)
  const generateUniqueClientCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const used = new Set(data.map(g => g.ma_bao_mat ? g.ma_bao_mat.toUpperCase() : null).filter(Boolean));
    let code = '';
    let attempts = 0;
    do {
      attempts++;
      let rand = '';
      for (let i = 0; i < 3; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code = 'GV' + rand;
    } while (used.has(code) && attempts < 1000);

    setForm(prev => ({ ...prev, ma_bao_mat: code }));
  };

  // Trạng thái kiểm tra mã bảo mật theo thời gian thực
  const codeStatus = useMemo(() => {
    const raw = (form.ma_bao_mat || '').trim().toUpperCase();
    if (!raw) {
      return {
        type: 'info',
        message: (
          <span style={{ color: '#64748b' }}>
            💡 Để trống hệ thống sẽ <strong>tự động cấp mã duy nhất</strong> (dạng <code>GVxxx</code>) khi bấm Lưu.
          </span>
        )
      };
    }
    if (raw.length < 5) {
      return {
        type: 'warning',
        message: <span style={{ color: '#ea580c' }}>⚠️ Mã Form phải đúng 5 ký tự (hiện có: {raw.length}/5)</span>
      };
    }
    const currentId = modal === 'add' ? null : modal.edit?.id;
    const dup = data.find(g => g.ma_bao_mat && g.ma_bao_mat.toUpperCase() === raw && g.id !== currentId);
    if (dup) {
      return {
        type: 'error',
        message: (
          <span style={{ color: '#dc2626', fontWeight: 600 }}>
            ❌ Mã "{raw}" đã bị trùng với GV: {dup.ho_ten}! Vui lòng bấm "Sinh mã mới" hoặc đổi mã khác.
          </span>
        )
      };
    }
    return {
      type: 'success',
      message: <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ Mã "{raw}" hợp lệ & duy nhất (chưa ai sử dụng)</span>
    };
  }, [form.ma_bao_mat, data, modal]);

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

    // Kiểm tra trùng mã Form nếu người dùng nhập thủ công
    if (form.ma_bao_mat && form.ma_bao_mat.trim()) {
      const cleanCode = form.ma_bao_mat.trim().toUpperCase();
      if (cleanCode.length !== 5) {
        return showAlert('Mã Form (mã bảo mật) phải có đúng 5 ký tự!', 'warning');
      }
      const currentId = modal === 'add' ? null : modal.edit?.id;
      const dup = data.find(g => g.ma_bao_mat && g.ma_bao_mat.toUpperCase() === cleanCode && g.id !== currentId);
      if (dup) {
        return showAlert(`Mã "${cleanCode}" đã thuộc về giáo viên "${dup.ho_ten}". Vui lòng chọn mã khác hoặc để trống để tự sinh!`, 'danger');
      }
    }

    setSaving(true);
    try {
      const res = await api.post('/api/giaovien/save/', {
        id: modal === 'add' ? undefined : modal.edit.id,
        ho_ten: form.ho_ten,
        gioi_tinh: Number(form.gioi_tinh),
        so_dien_thoai: form.so_dien_thoai || null,
        nhiem_vu: form.nhiem_vu ?? 0,
        dang_lam: form.dang_lam,
        lich_ranh: form.lich_ranh || [false, false, false, false, false],
        ma_bao_mat: form.ma_bao_mat ? form.ma_bao_mat.trim().toUpperCase() : undefined,
      });
      if (res.data?.ok) {
        showAlert(
          modal === 'add'
            ? `Thêm giáo viên thành công! Mã GV: ${res.data.ma_bao_mat}`
            : 'Cập nhật giáo viên thành công!',
          'success'
        );
        setModal(null);
        fetchData();
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Lưu thất bại', 'danger');
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
          <p>Mỗi giáo viên có một <strong>Mã Form (5 ký tự)</strong> riêng để tự động xác thực khi gửi báo cáo trực Google Form.</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user?.is_admin || user?.is_superuser ? (
            <>
              <button className="btn btn-outline" onClick={handleExportCodes} title="Xuất danh sách GV kèm mã bảo mật 5 ký tự">
                <i className="fas fa-file-export"></i> Xuất mã GV
              </button>
              <button className="btn btn-outline" onClick={() => setModal('import')} title="Tải danh sách GV từ file CSV">
                <i className="fas fa-file-import"></i> Nhập file CSV
              </button>
              <button className="btn btn-primary" onClick={openAdd}>
                <i className="fas fa-plus"></i> Thêm giáo viên
              </button>
            </>
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
                <th>#</th><th>Họ tên</th><th>Mã Form (5 ký tự)</th><th>Giới tính</th>
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
                  <td>
                    {gv.ma_bao_mat ? (
                      <div className="gv-code-badge" title="Mã bảo mật riêng dùng để điền vào Google Form">
                        <i className="fas fa-key" style={{ fontSize: '0.7rem' }}></i>
                        <span>{gv.ma_bao_mat}</span>
                        <button
                          className="gv-code-btn"
                          onClick={() => handleCopyCode(gv)}
                          title="Sao chép mã"
                        >
                          <i className={`fas ${copiedCodeId === gv.id ? 'fa-check text-success' : 'fa-copy'}`}></i>
                        </button>
                        {(user?.is_admin || user?.is_superuser) && (
                          <button
                            className="gv-code-reset-btn"
                            onClick={() => handleResetCode(gv)}
                            title="Cấp lại mã mới ngẫu nhiên"
                          >
                            <i className="fas fa-redo-alt"></i>
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Chưa có</span>
                    )}
                  </td>
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

      {modal && modal !== 'import' && (
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

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Mã Form Báo Cáo (5 ký tự)</label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={generateUniqueClientCode}
                    style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4 }}
                    title="Sinh ngẫu nhiên một mã 5 ký tự duy nhất (chưa ai dùng)"
                  >
                    <i className="fas fa-random" style={{ marginRight: 4 }}></i> Sinh mã mới
                  </button>
                </div>
                <input
                  className="form-control"
                  maxLength={5}
                  style={{
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    maxWidth: 180,
                    borderColor: codeStatus.type === 'error' ? '#ef4444' : codeStatus.type === 'success' ? '#10b981' : undefined
                  }}
                  value={form.ma_bao_mat || ''}
                  onChange={(e) => setForm({ ...form, ma_bao_mat: e.target.value.toUpperCase().slice(0, 5) })}
                  placeholder={modal === 'add' ? 'Tự động sinh duy nhất' : 'VD: GV84B'}
                />
                <div style={{ marginTop: 4, fontSize: '0.8rem' }}>
                  {codeStatus.message}
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

      {/* Modal Nhập danh sách GV từ file CSV */}
      {modal === 'import' && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-file-import"></i> Nhập danh sách Giáo viên từ CSV</div>
              <button className="modal-close" onClick={() => { setModal(null); setImportFile(null); }}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: 12 }}>
                Tải lên file danh sách Giáo viên (định dạng CSV). Hệ thống sẽ <strong>tự động sinh mã bảo mật 5 ký tự</strong> riêng cho từng Thầy/Cô.
              </p>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={handleDownloadTemplate}>
                  <i className="fas fa-download"></i> Tải file mẫu CSV
                </button>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  💡 Cột SĐT là tùy chọn (có thể để trống)
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Chọn file CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  className="form-control"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setModal(null); setImportFile(null); }}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleImportSubmit} disabled={importing || !importFile}>
                <i className={`fas ${importing ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i> {importing ? 'Đang nạp GV...' : 'Tải lên & Tự sinh mã'}
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
