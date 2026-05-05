import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { removeAccents, getSortNames } from '../../utils/stringUtils';
import '../../styles/admin.css';

const EMPTY_FORM = { ho_ten: '', lop: '', gioi_tinh: '', ma_phong_an: '', ma_phong_ngu: '', dang_hoc: true, ghi_chu: '', ma_bt: '' };
const CSV_COLS   = ['STT', 'Mã BT', 'Họ tên', 'GT', 'Lớp', 'P.Ngủ', 'P.Ăn', 'Ghi chú'];

export default function HocSinh() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  // ── Dữ liệu chính ──
  const [data, setData]       = useState([]);
  const [phongAn, setPhongAn] = useState([]);
  const [phongNgu, setPhongNgu] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [search, setSearch]       = useState('');
  const [filterLop, setFilterLop] = useState('');
  const [filterGT, setFilterGT]   = useState('');
  const [filterTT, setFilterTT]   = useState('');
  const [filterPhong, setFilterPhong] = useState('');

  const availableLops = useMemo(() => {
    return [...new Set(data.map(h => h.lop))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  // ── Phân trang ──
  const [currentPage, setCurrentPage] = useState(1);

  // ── Modal Thêm/Sửa ──
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Xác nhận xoá ──
  const [confirmDel, setConfirmDel] = useState(null); // { id, name }

  // ── Import CSV ──
  const [importOpen, setImportOpen]     = useState(false);
  const [csvFile, setCsvFile]           = useState(null);
  const [csvLines, setCsvLines]         = useState(null);   // string[] — raw lines
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver]         = useState(false);
  const csvInputRef = useRef();

  // ── Fetch ──
  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/hocsinh/'),
      api.get('/api/phong/'),
    ]).then(([hsRes, phRes]) => {
      if (hsRes.data?.ok) setData(hsRes.data.hocsinh);
      if (phRes.data?.ok) {
        setPhongAn(phRes.data.phong.filter(p => p.loai_phong === 0));
        setPhongNgu(phRes.data.phong.filter(p => p.loai_phong === 1));
      }
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.all([
      api.get('/api/hocsinh/'),
      api.get('/api/phong/'),
    ]).then(([hsRes, phRes]) => {
      if (hsRes.data?.ok) setData(hsRes.data.hocsinh);
      if (phRes.data?.ok) {
        setPhongAn(phRes.data.phong.filter(p => p.loai_phong === 0));
        setPhongNgu(phRes.data.phong.filter(p => p.loai_phong === 1));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Filter / Stats ──
  const filteredAndSorted = useMemo(() => {
    let result = data.filter((hs) => {
      if (search) {
        const searchStr = removeAccents(search.toLowerCase());
        const nameStr = removeAccents(hs.ho_ten.toLowerCase());
        const maStr = String(hs.id || '');
        if (!nameStr.includes(searchStr) && !maStr.includes(searchStr)) return false;
      }
      if (filterLop && hs.lop !== filterLop) return false;
      if (filterGT !== '' && String(hs.gioi_tinh) !== filterGT) return false;
      if (filterTT !== '' && String(Number(hs.dang_hoc)) !== filterTT) return false;
      if (filterPhong && hs.phong_an?.ma_phong !== filterPhong && hs.phong_ngu?.ma_phong !== filterPhong && hs.ma_phong_an_id !== filterPhong && hs.ma_phong_ngu_id !== filterPhong) return false;
      return true;
    });

    result.sort((a, b) => {
      let cmp = (a.lop || '').localeCompare(b.lop || '', 'vi');
      if (cmp !== 0) return cmp;

      const nameA = getSortNames(a.ho_ten);
      const nameB = getSortNames(b.ho_ten);
      cmp = nameA.first.localeCompare(nameB.first, 'vi');
      if (cmp !== 0) return cmp;
      cmp = nameA.middle.localeCompare(nameB.middle, 'vi');
      if (cmp !== 0) return cmp;
      return nameA.last.localeCompare(nameB.last, 'vi');
    });

    return result;
  }, [data, search, filterLop, filterGT, filterTT, filterPhong]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [search, filterLop, filterGT, filterTT, filterPhong]);

  // Pagination logic
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const paginatedData = useMemo(() => {
    return filteredAndSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  }, [filteredAndSorted, currentPage]);

  const stats = {
    total:    data.length,
    nam:      data.filter(h => h.gioi_tinh === 0).length,
    nu:       data.filter(h => h.gioi_tinh === 1).length,
    danghoc:  data.filter(h => h.dang_hoc).length,
  };

  // ── CRUD ──
  const openAdd  = () => { setForm(EMPTY_FORM); setModal('add'); };
  const openEdit = (hs) => {
    setForm({ ...hs, ma_phong_an: hs.ma_phong_an_id || '', ma_phong_ngu: hs.ma_phong_ngu_id || '' });
    setModal({ edit: hs });
  };

  const handleDelete = async (id, name) => {
    setConfirmDel({ id, name });
  };
  const doDelete = async () => {
    const id = confirmDel.id;
    setConfirmDel(null);
    try {
      await api.post(`/api/hocsinh/${id}/delete/`);
      setData(p => p.filter(h => h.id !== id));
    } catch (err) { showAlert(err.response?.data?.error || 'Xóa thất bại'); }
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim() || !form.lop || form.gioi_tinh === '') return showAlert('Vui lòng điền đầy đủ thông tin!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/hocsinh/save/', {
        id: modal === 'add' ? undefined : modal.edit.id,
        ho_ten: form.ho_ten, lop: form.lop,
        gioi_tinh: Number(form.gioi_tinh),
        ma_phong_an: form.ma_phong_an || null,
        ma_phong_ngu: form.ma_phong_ngu || null,
        dang_hoc: form.dang_hoc, ghi_chu: form.ghi_chu,
      });
      setModal(null); fetchData();
    } catch (err) { showAlert(err.response?.data?.error || 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  // ── Import CSV helpers ──
  const openImport = () => {
    setCsvFile(null); setCsvLines(null); setImportResult(null); setDragOver(false);
    if (csvInputRef.current) csvInputRef.current.value = '';
    setImportOpen(true);
  };

  const readCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trimEnd()).filter(Boolean);
      setCsvLines(lines);
      setImportResult(null);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const pickFile = (file) => {
    if (!file) return;
    setCsvFile(file);
    readCSV(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const handleDoImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', csvFile);
    try {
      const res = await api.post('/api/hocsinh/import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      // Cập nhật bảng ngầm ngay lập tức, không đóng modal
      if (res.data?.success > 0) fetchData();
    } catch (err) {
      setImportResult({ ok: false, error: err.response?.data?.error || 'Lỗi không xác định' });
    } finally { setImporting(false); }
  };


  // Build preview info
  const hasHeader  = csvLines ? isNaN(csvLines[0]?.split(',')[0]?.trim()) : false;

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Quản lý học sinh</span>
          </div>
          <h2><i className="fas fa-user-graduate" style={{ color: 'var(--primary)' }}></i> Quản lý Học sinh</h2>
          <p>Thêm, sửa, xóa học sinh và phân bổ phòng ăn / phòng ngủ.</p>
        </div>
        <div className="page-header-actions">
          {(user?.is_admin || user?.is_superuser) ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={openImport}><i className="fas fa-file-csv"></i> Import CSV</button>
              <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Thêm học sinh</button>
            </>
          ) : (
            <span className="badge badge-warning" style={{ padding: '8px 14px' }}><i className="fas fa-eye"></i> Chế độ xem</span>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-cards-row">
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-users"></i></div><div className="stat-card-info"><p>Tổng học sinh</p><h3>{stats.total}</h3></div></div>
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-mars"></i></div><div className="stat-card-info"><p>Nam</p><h3>{stats.nam}</h3></div></div>
        <div className="stat-card purple"><div className="stat-card-icon"><i className="fas fa-venus"></i></div><div className="stat-card-info"><p>Nữ</p><h3>{stats.nu}</h3></div></div>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>Đang học</p><h3>{stats.danghoc}</h3></div></div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <label><i className="fas fa-filter"></i></label>
        <select value={filterLop} onChange={(e) => setFilterLop(e.target.value)}>
          <option value="">Tất cả lớp</option>
          {availableLops.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterGT} onChange={(e) => setFilterGT(e.target.value)}>
          <option value="">Tất cả giới tính</option><option value="0">Nam</option><option value="1">Nữ</option>
        </select>
        <select value={filterTT} onChange={(e) => setFilterTT(e.target.value)}>
          <option value="">Tất cả trạng thái</option><option value="1">Đang học</option><option value="0">Rút bán trú</option>
        </select>
        <select value={filterPhong} onChange={(e) => setFilterPhong(e.target.value)}>
          <option value="">Tất cả phòng</option>
          <optgroup label="Phòng Ăn">
            {phongAn.map(p => <option key={`an-${p.ma_phong}`} value={p.ma_phong}>{p.ma_phong}</option>)}
          </optgroup>
          <optgroup label="Phòng Ngủ">
            {phongNgu.map(p => <option key={`ngu-${p.ma_phong}`} value={p.ma_phong}>{p.ma_phong}</option>)}
          </optgroup>
        </select>
        <input type="text" placeholder="Tìm tên/mã học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* ── Bảng dữ liệu ── */}
      <div className="datatable-wrapper">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>
              <th>#</th><th>Mã BT</th><th>Họ tên</th><th>GT</th><th>Lớp</th><th>Phòng ăn</th><th>Phòng ngủ</th><th>Trạng thái</th>
              {(user?.is_admin || user?.is_superuser) && <th>Thao tác</th>}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}><i className="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>
              ) : paginatedData.map((hs, i) => (
                <tr key={hs.id}>
                  <td>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td style={{ color: '#1e40af' }}><b>{hs.id}</b></td>
                  <td><b>{hs.ho_ten}</b>{hs.ghi_chu && <><br /><small style={{ color: '#94a3b8' }}>{hs.ghi_chu}</small></>}</td>
                  <td><span className={`badge ${hs.gioi_tinh === 0 ? 'badge-info' : 'badge-warning'}`}>{hs.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</span></td>
                  <td><b>{hs.lop}</b></td>
                  <td>{hs.phong_an?.ma_phong || hs.ma_phong_an_id || '—'}</td>
                  <td>{hs.phong_ngu?.ma_phong || hs.ma_phong_ngu_id || '—'}</td>
                  <td>{hs.dang_hoc ? <span className="badge badge-success">Đang học</span> : <span className="badge badge-danger">Rút BT</span>}</td>
                  {(user?.is_admin || user?.is_superuser) && (
                    <td><div className="action-btns">
                      <button className="btn-icon edit" onClick={() => openEdit(hs)}><i className="fas fa-edit"></i></button>
                      <button className="btn-icon delete" onClick={() => handleDelete(hs.id, hs.ho_ten)}><i className="fas fa-trash"></i></button>
                    </div></td>
                  )}
                </tr>
              ))}
              {!loading && paginatedData.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button className="btn btn-sm btn-ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><i className="fas fa-chevron-left"></i> Trang trước</button>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Trang {currentPage} / {totalPages}</span>
            <button className="btn btn-sm btn-ghost" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Trang sau <i className="fas fa-chevron-right"></i></button>
          </div>
        )}
      </div>

      {/* ── Modal Thêm / Sửa học sinh ── */}
      {modal && (
        <div className="modal-overlay open">
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-user-graduate"></i> {modal === 'add' ? 'Thêm học sinh' : 'Sửa học sinh'}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ flex: '0 0 120px' }}>
                  <label className="form-label">Mã BT</label>
                  <input className="form-control" value={modal === 'add' ? 'Tự động' : form.id} disabled style={{ background: '#f1f5f9', fontWeight: 'bold', color: '#1e40af' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Họ và tên <span className="required">*</span></label>
                  <input className="form-control" value={form.ho_ten} onChange={(e) => setForm({ ...form, ho_ten: e.target.value })} placeholder="Nguyễn Văn An" />
                </div>
                <div className="form-group">
                  <label className="form-label">Lớp <span className="required">*</span></label>
                  <input className="form-control" value={form.lop} onChange={(e) => setForm({ ...form, lop: e.target.value })} placeholder="VD: 10A1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Giới tính <span className="required">*</span></label>
                  <select className="form-control" value={form.gioi_tinh} onChange={(e) => setForm({ ...form, gioi_tinh: Number(e.target.value) })}>
                    <option value="">-- Chọn --</option><option value="0">Nam</option><option value="1">Nữ</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <div className="toggle-wrapper">
                    <label className="toggle"><input type="checkbox" checked={form.dang_hoc} onChange={(e) => setForm({ ...form, dang_hoc: e.target.checked })} /><span className="toggle-slider"></span></label>
                    <span className="toggle-label">Đang học</span>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phòng ăn</label>
                  <select className="form-control" value={form.ma_phong_an} onChange={(e) => setForm({ ...form, ma_phong_an: e.target.value })}>
                    <option value="">-- Chọn phòng ăn --</option>
                    {phongAn.map(p => <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Phòng ngủ</label>
                  <select className="form-control" value={form.ma_phong_ngu} onChange={(e) => setForm({ ...form, ma_phong_ngu: e.target.value })}>
                    <option value="">-- Chọn phòng ngủ --</option>
                    {phongNgu.filter(p => form.gioi_tinh === '' || p.gioi_tinh === Number(form.gioi_tinh)).map(p => (
                      <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong} ({p.gioi_tinh === 0 ? 'Nam' : 'Nữ'})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <input className="form-control" value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
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

      {/* ── Modal Import CSV ── */}
      {importOpen && (
        <div className="modal-overlay open">
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-file-csv" style={{ color: '#16a34a' }}></i> Import danh sách học sinh từ CSV</div>
              <button className="modal-close" onClick={() => setImportOpen(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">

              {/* Drag & Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => csvInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#16a34a' : '#cbd5e1'}`,
                  borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? '#f0fdf4' : '#f8fafc',
                  transition: 'all .2s', marginBottom: 14,
                }}
              >
                <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) pickFile(e.target.files[0]); }} />
                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: dragOver ? '#16a34a' : '#94a3b8', marginBottom: 8, display: 'block' }}></i>
                {csvFile
                  ? <><b style={{ color: '#16a34a' }}><i className="fas fa-check-circle"></i> {csvFile.name}</b><br /><small style={{ color: '#64748b' }}>Click để chọn file khác</small></>
                  : <><b style={{ color: '#475569' }}>Kéo thả file CSV vào đây</b><br /><small style={{ color: '#94a3b8' }}>hoặc click để chọn file (.csv)</small></>
                }
              </div>

              {/* Gợi ý định dạng */}
              <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 12, padding: '8px 12px', background: '#f1f5f9', borderRadius: 6, lineHeight: 1.7 }}>
                <i className="fas fa-info-circle" style={{ color: 'var(--primary)' }}></i> <b>Định dạng CSV:</b> {CSV_COLS.join(' , ')}
                <br />
                <i className="fas fa-exclamation-triangle" style={{ color: '#f59e0b' }}></i> Dòng đầu có thể là tiêu đề (bắt đầu bằng <b>STT</b>) hoặc dữ liệu luôn.
              </div>

              {/* Preview table */}
              {csvLines && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: '#475569', marginBottom: 4 }}>
                    <i className="fas fa-table"></i> Xem trước ({csvLines.length} dòng)
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
                      <thead>
                        <tr style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                          {!hasHeader && CSV_COLS.map(c => (
                            <th key={c} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c}</th>
                          ))}
                          {hasHeader && csvLines[0].split(',').map((c, i) => (
                            <th key={i} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c.trim()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvLines.slice(hasHeader ? 1 : 0).map((line, idx) => (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            {line.split(',').map((cell, ci) => (
                              <td key={ci} style={{ padding: '3px 8px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', color: '#334155' }}>
                                {cell.trim()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Kết quả import */}
              {importResult && (() => {
                const d    = importResult;
                const errs = d.errors || [];
                const dups = errs.filter(e => e.msg?.includes('đã tồn tại'));
                const real = errs.filter(e => !e.msg?.includes('đã tồn tại'));
                const hasWarn  = dups.length > 0 || real.length > 0;
                const isAllBad = d.success === 0 && real.length > 0;
                const bg   = !d.ok ? '#fef2f2' : isAllBad ? '#fef2f2' : hasWarn ? '#fffbeb' : '#f0fdf4';
                const bd   = !d.ok ? '#fca5a5' : isAllBad ? '#fca5a5' : hasWarn ? '#fcd34d' : '#86efac';
                const icon = !d.ok || isAllBad ? 'times-circle' : hasWarn ? 'exclamation-triangle' : 'check-circle';
                const ic   = !d.ok || isAllBad ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a';
                return (
                  <div style={{ padding: '12px 14px', borderRadius: 8, background: bg, border: `1px solid ${bd}`, marginTop: 4 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      <i className={`fas fa-${icon}`} style={{ color: ic, marginRight: 6 }}></i>Kết quả import
                    </div>
                    {d.ok ? (
                      <>
                        <div>✅ Thành công: <b>{d.success}</b> học sinh được thêm</div>
                        {dups.length > 0 && <>
                          <div style={{ marginTop: 8, color: '#92400e', fontWeight: 600 }}>⚠️ Bỏ qua {dups.length} học sinh có mã BT đã tồn tại:</div>
                          <ul style={{ maxHeight: 110, overflowY: 'auto', margin: '4px 0', paddingLeft: 18, fontSize: '.77rem', color: '#92400e' }}>
                            {dups.map((e, i) => <li key={i}>Dòng {e.row}: {e.msg}</li>)}
                          </ul>
                        </>}
                        {real.length > 0 && <>
                          <div style={{ marginTop: 8, color: '#991b1b', fontWeight: 600 }}>❌ {real.length} dòng bị lỗi (không thêm được):</div>
                          <ul style={{ maxHeight: 110, overflowY: 'auto', margin: '4px 0', paddingLeft: 18, fontSize: '.77rem', color: '#991b1b' }}>
                            {real.map((e, i) => <li key={i}>Dòng {e.row}: {e.msg}</li>)}
                          </ul>
                        </>}
                      </>
                    ) : (
                      <div style={{ color: '#dc2626' }}>❌ {d.error || 'Lỗi không xác định'}</div>
                    )}
                  </div>
                );
              })()}
            </div>


            <div className="modal-footer" style={{ justifyContent: importResult ? 'center' : 'flex-end' }}>
              {importResult ? (
                /* Sau khi có kết quả: chỉ hiện nút xác nhận nổi bật */
                <button
                  className="btn btn-primary"
                  style={{ minWidth: 160, fontSize: '1rem', padding: '10px 28px' }}
                  onClick={() => setImportOpen(false)}
                >
                  <i className="fas fa-check-circle"></i> Đã hiểu — Đóng
                </button>
              ) : (
                /* Chưa import: nút Đóng + nút Import */
                <>
                  <button className="btn btn-ghost" onClick={() => setImportOpen(false)}>Đóng</button>
                  <button
                    className="btn btn-success"
                    onClick={handleDoImport}
                    disabled={!csvFile || importing}
                  >
                    <i className={`fas ${importing ? 'fa-spinner fa-spin' : 'fa-file-import'}`}></i>
                    {importing ? ' Đang import...' : ' Bắt đầu Import'}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Xóa học sinh"
        message={confirmDel ? `Bạn có chắc muốn xóa học sinh "${confirmDel.name}" khỏi hệ thống?` : ''}
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
