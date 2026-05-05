import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import { removeAccents } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './LichTruc.css';

const DAYS_LABEL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5 ☕', 'Thứ 6'];
const LOAI_PHONG = { 0: 'Ăn', 1: 'Ngủ' };

export default function LichTrucKhung() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  // ─── State ─────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(true);
  const [autoLoading, setAutoLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const [giaoVienList, setGiaoVienList] = useState([]);
  const [phongList, setPhongList]       = useState([]);

  // khungData: { [phong_id]: { [thu]: [{id, ma_gv_id, ho_ten, nhiem_vu}] } }
  const [khungData, setKhungData]   = useState({});

  // picker modal
  const [picker, setPicker]         = useState(null); // { phong_id, thu }
  const [pickerSearch, setPickerSearch] = useState('');

  // apply-khung modal
  const [showApply, setShowApply]   = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [applyTuan, setApplyTuan]   = useState(() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().split('T')[0];
  });
  const [applyForce, setApplyForce] = useState(false);

  // ─── Load dữ liệu ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resGV, resKhung, resPhongAn, resPhongNgu] = await Promise.all([
        api.get('/api/giaovien/?limit=500').catch(() => ({ data: {} })),
        api.get('/api/lichtruc_khung/').catch(() => ({ data: {} })),
        api.get('/api/phong/an').catch(() => ({ data: {} })),
        api.get('/api/phong/ngu').catch(() => ({ data: {} })),
      ]);

      // GV list
      if (resGV.data?.ok) setGiaoVienList(resGV.data.giaovien || []);

      // Phòng list (An trước, Ngu sau)
      const allPhong = [
        ...(resPhongAn.data?.ok ? resPhongAn.data.phong : []),
        ...(resPhongNgu.data?.ok ? resPhongNgu.data.phong : []),
      ];
      setPhongList(allPhong);

      // Khung data → group theo phong, thu
      if (resKhung.data?.ok) {
        const grouped = {};
        allPhong.forEach(p => {
          grouped[p.ma_phong] = { 0: [], 1: [], 2: [], 3: [], 4: [] };
        });
        (resKhung.data.lich_khung || []).forEach(k => {
          const pid = k.ma_phong_id;
          const thu = k.thu;
          if (!grouped[pid]) grouped[pid] = { 0: [], 1: [], 2: [], 3: [], 4: [] };
          if (!grouped[pid][thu]) grouped[pid][thu] = [];
          grouped[pid][thu].push({
            id: k.id,
            ma_gv_id: k.ma_gv_id,
            ho_ten: k.giao_vien?.ho_ten || `GV #${k.ma_gv_id}`,
            nhiem_vu: k.nhiem_vu ?? 0, // lấy từ bản ghi, không từ GV
          });
        });
        setKhungData(grouped);
      }
    } catch (err) {
      showAlert('Lỗi tải dữ liệu: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // ─── Xóa 1 GV khỏi ô (gọi API delete) ─────────────────────────────
  const removeGV = async (phong_id, thu, lichId) => {
    // Optimistic: xóa khỏi state ngay lập tức không reload
    setKhungData(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (copy[phong_id]?.[thu]) {
        copy[phong_id][thu] = copy[phong_id][thu].filter(x => x.id !== lichId);
      }
      return copy;
    });
    try {
      await api.post('/api/lichtruc_khung/delete/', { id: lichId });
    } catch (err) {
      showAlert('Không thể xóa: ' + (err.response?.data?.error || err.message), 'danger');
      await loadData(); // Hoàn tác: tải lại nếu lỗi
    }
  };

  // ─── Thêm GV vào ô (gọi API save) ──────────────────────────────────
  const addGV = async (gv, nhiem_vu) => {
    const { phong_id, thu } = picker;
    // 1. Kiểm tra đã có chưa
    const cellEntries = khungData[phong_id]?.[thu] || [];
    if (cellEntries.find(x => x.ma_gv_id === gv.id)) {
      showAlert(`${gv.ho_ten} đã có trong ô này`, 'warning');
      return;
    }

    // 2. Kiểm tra giới hạn số lượng GV theo vai trò được chọn
    const phong = phongList.find(p => p.ma_phong === phong_id);
    if (phong) {
      const slToiDa = nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
      const hienTai = cellEntries.filter(x => x.nhiem_vu === nhiem_vu).length;
      if (hienTai >= slToiDa) {
        showAlert(`Phòng ${phong_id} đã đủ số lượng GV ${nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'} (Tối đa: ${slToiDa})`, 'danger');
        return;
      }
    }
    try {
      const res = await api.post('/api/lichtruc_khung/save/', {
        ma_phong_id: phong_id,
        ma_gv_id: gv.id,
        thu,
        nhiem_vu,
      });
      if (res.data?.ok) {
        setKhungData(prev => {
          const copy = JSON.parse(JSON.stringify(prev));
          if (!copy[phong_id]) copy[phong_id] = { 0: [], 1: [], 2: [], 3: [], 4: [] };
          copy[phong_id][thu].push({
            id: res.data.id || res.data.record?.id,
            ma_gv_id: gv.id,
            ho_ten: gv.ho_ten,
            nhiem_vu,
          });
          return copy;
        });
        setPicker(null);
        setPickerSearch('');
      }
    } catch (err) {
      showAlert('Không thể thêm: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  // ─── Xếp lịch tự động ───────────────────────────────────────────────
  const autoSchedule = async () => {
    setConfirmAuto(false);
    setAutoLoading(true);
    try {
      const res = await api.post('/api/lichtruc_khung/auto/');
      if (res.data?.ok) {
        const { total, can_bang, warnings } = res.data;
        let msg = `Đã tạo ${total} lịch khung. Cân bằng tải: ${can_bang?.min ?? '?'}–${can_bang?.max ?? '?'} buổi/GV.`;
        if (warnings?.length) msg += ` ⚠️ ${warnings.length} cảnh báo kiểm tra console.`;
        showAlert(msg, 'success');
        await loadData();
      }
    } catch (err) {
      showAlert('Lỗi xếp tự động: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setAutoLoading(false);
    }
  };

  // ─── Nạp vào lịch thực tế ───────────────────────────────────────────
  const applyKhung = async () => {
    setApplyLoading(true);
    try {
      const res = await api.post('/api/lichtruc/apply-khung/', {
        tuan: applyTuan,
        force: applyForce,
      });
      if (res.data?.ok) {
        showAlert(res.data.message, 'success');
        setShowApply(false);
      }
    } catch (err) {
      showAlert('Lỗi nạp lịch: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setApplyLoading(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────
  const filteredGV = giaoVienList.filter(gv => {
    if (!gv.dang_lam) return false;
    if (pickerSearch) {
      const searchStr = removeAccents(pickerSearch.toLowerCase());
      const nameStr = removeAccents(gv.ho_ten.toLowerCase());
      if (!nameStr.includes(searchStr)) return false;
    }
    if (picker) {
      // Chỉ hiện GV rảnh vào buổi đó
      const thu = picker.thu;
      const lichRanh = Array.isArray(gv.lich_ranh) ? gv.lich_ranh
        : (typeof gv.lich_ranh === 'string' ? JSON.parse(gv.lich_ranh) : null);
      if (!lichRanh || lichRanh[thu] !== true) return false;

      // Ẩn GV đã có trong ô này
      const already = khungData[picker.phong_id]?.[picker.thu]?.map(x => x.ma_gv_id) || [];
      if (already.includes(gv.id)) return false;

      // Kiểm tra giới tính phòng ngủ
      const currentPhong = phongList.find(p => p.ma_phong === picker.phong_id);
      if (currentPhong?.loai_phong === 1 && currentPhong.gioi_tinh !== null) {
        if (gv.gioi_tinh !== currentPhong.gioi_tinh) return false;
      }

      // Kiểm tra GV đã bận ở phòng CÙNG LOẠI cùng buổi (ăn vs ăn, ngủ vs ngủ)
      const currentPhongObj = phongList.find(p => p.ma_phong === picker.phong_id);
      const currentLoai = currentPhongObj?.loai_phong;
      const isBusy = Object.entries(khungData).some(([pid, thuMap]) => {
        if (pid === picker.phong_id) return false;
        const otherPhong = phongList.find(p => p.ma_phong === pid);
        if (otherPhong?.loai_phong !== currentLoai) return false; // khác loại thì OK
        return (thuMap[picker.thu] || []).some(x => x.ma_gv_id === gv.id);
      });
      if (isBusy) return false;
    }
    return true;
  });

  const getPhongLabel = (p) => {
    const loai = p.loai_phong === 0 ? 'Phòng ăn' : 'Phòng ngủ';
    const gt = p.loai_phong === 1 ? ` (${p.gioi_tinh === 0 ? 'Nam' : 'Nữ'})` : '';
    return `${loai} ${p.ma_phong}${gt}`;
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Lịch trực Cố định</span>
          </div>
          <h2><i className="fas fa-th" style={{ color: 'var(--primary)' }}></i> Lịch trực Cố định (T2–T6)</h2>
          <p>Lịch khung cố định quanh năm dựa theo lịch rảnh giáo viên.</p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-success"
            onClick={() => setConfirmAuto(true)}
            disabled={autoLoading || loading}
          >
            {autoLoading
              ? <><i className="fas fa-spinner fa-spin"></i> Đang xếp...</>
              : <><i className="fas fa-magic"></i> Xếp lịch Tự Động</>
            }
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowApply(true)}
            disabled={loading}
          >
            <i className="fas fa-calendar-check"></i> Nạp vào Lịch Thực Tế
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="info-banner">
        <i className="fas fa-info-circle" style={{ fontSize: '1.1rem' }}></i>
        <span>
          GV trực <strong>Thứ 2 → Thứ 6</strong>, buổi trưa.&nbsp;
          <span style={{ color: '#d97706' }}>☕ Thứ 5</span> mặc định nghỉ — phân công khi có <strong>dạy bù</strong>.
          &nbsp;·&nbsp; <strong>Xếp tự động</strong> dùng thuật toán cân bằng tải (Weighted Round-Robin).
        </span>
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
          <p style={{ marginTop: 12 }}>Đang tải dữ liệu...</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div className="khung-grid" style={{ minWidth: 700, gridTemplateColumns: `220px repeat(5, 1fr)` }}>
            {/* Header Row */}
            <div className="khung-header" style={{ textAlign: 'left', paddingLeft: 14 }}>Phòng</div>
            {DAYS_LABEL.map((d, i) => (
              <div key={i} className="khung-header"
                style={i === 3 ? { background: 'linear-gradient(135deg,#78350f,#d97706)' } : {}}>
                {d}
              </div>
            ))}

            {/* Data Rows */}
            {phongList.map(phong => {
              const pid = phong.ma_phong;
              const isNgu = phong.loai_phong === 1;
              return [
                /* Room label */
                <div key={`r-${pid}`} className="khung-cell khung-room-label">
                  <div>
                    <span style={{ fontWeight: 700 }}>{pid}</span>
                    <span style={{ fontSize: '0.75rem', marginLeft: 6, color: isNgu ? '#7c3aed' : '#059669' }}>
                      [{LOAI_PHONG[phong.loai_phong]}
                      {isNgu ? ` · ${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'}` : ''}]
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                    {phong.sl_diem_danh} ĐD · {phong.sl_ho_tro} HT
                  </div>
                </div>,
                /* Day cells */
                ...Array.from({ length: 5 }, (_, thu) => {
                  const gvInCell = khungData[pid]?.[thu] || [];
                  return (
                    <div key={`${pid}-${thu}`} className="khung-cell">
                      {gvInCell.map(item => {
                          const isDD = item.nhiem_vu === 0;
                          return (
                            <div key={item.id} className="lt-gv-tag" style={{
                              background: isDD ? '#eff6ff' : '#f0fdf4',
                              borderLeft: `3px solid ${isDD ? '#2563eb' : '#16a34a'}`,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '4px 6px', marginBottom: 4, borderRadius: 4,
                            }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isDD ? '#1e40af' : '#166534' }}>{item.ho_ten}</span>
                              {user?.is_admin && (
                                <button className="lt-gv-remove" title="Xóa" onClick={() => removeGV(pid, thu, item.id)}>
                                  <i className="fas fa-times"></i>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      {user?.is_admin && (() => {
                        const isFullDD = gvInCell.filter(x => x.nhiem_vu === 0).length >= (phong.sl_diem_danh || 1);
                        const isFullHT = gvInCell.filter(x => x.nhiem_vu === 1).length >= (phong.sl_ho_tro || 1);
                        if (isFullDD && isFullHT) return null;
                        
                        return (
                          <button
                            className="lt-add-btn"
                            title="Thêm GV"
                            onClick={() => { setPicker({ phong_id: pid, thu }); setPickerSearch(''); }}
                          >
                            <i className="fas fa-plus"></i>
                          </button>
                        );
                      })()}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      )}

      {/* ── GV Picker Modal ── */}
      {picker && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">
                <i className="fas fa-chalkboard-teacher"></i>&nbsp;
                Thêm GV — {phongList.find(p => p.ma_phong === picker.phong_id) && getPhongLabel(phongList.find(p => p.ma_phong === picker.phong_id))}
                &nbsp;· {DAYS_LABEL[picker.thu]}
              </div>
              <button className="modal-close" onClick={() => setPicker(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 10 }}>
                <input
                  className="form-control"
                  placeholder="Tìm tên giáo viên..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 8 }}>
                Bấm <span style={{ color: '#2563eb', fontWeight: 700 }}>ĐD</span> (Điểm danh) hoặc <span style={{ color: '#16a34a', fontWeight: 700 }}>HT</span> (Hỗ trợ) để chọn vai trò cho GV.
              </p>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: 8 }}>
                {filteredGV.length === 0
                  ? <p style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Không có kết quả</p>
                  : filteredGV.map(gv => {
                    const cellEntries = khungData[picker.phong_id]?.[picker.thu] || [];
                    const phong = phongList.find(p => p.ma_phong === picker.phong_id);
                    const ddFull = phong && cellEntries.filter(x => x.nhiem_vu === 0).length >= (phong.sl_diem_danh || 1);
                    const htFull = phong && cellEntries.filter(x => x.nhiem_vu === 1).length >= (phong.sl_ho_tro || 1);
                    return (
                      <div key={gv.id}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="fas fa-user" style={{ color: '#64748b', fontSize: '0.85rem' }}></i>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{gv.ho_ten}</div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              {gv.gioi_tinh === 0 ? 'Nam' : 'Nữ'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn" disabled={ddFull}
                            style={{ padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, background: ddFull ? '#e2e8f0' : '#dbeafe', color: ddFull ? '#94a3b8' : '#2563eb', border: 'none', borderRadius: 4, cursor: ddFull ? 'not-allowed' : 'pointer' }}
                            onClick={() => addGV(gv, 0)}
                            title="Thêm với vai trò Điểm danh"
                          >ĐD</button>
                          <button
                            className="btn" disabled={htFull}
                            style={{ padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, background: htFull ? '#e2e8f0' : '#dcfce7', color: htFull ? '#94a3b8' : '#16a34a', border: 'none', borderRadius: 4, cursor: htFull ? 'not-allowed' : 'pointer' }}
                            onClick={() => addGV(gv, 1)}
                            title="Thêm với vai trò Hỗ trợ"
                          >HT</button>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPicker(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply Khung Modal ── */}
      {showApply && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fas fa-calendar-check"></i> Nạp lịch khung vào lịch thực tế
              </div>
              <button className="modal-close" onClick={() => setShowApply(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#64748b', marginBottom: 16, fontSize: '0.9rem' }}>
                Hệ thống sẽ nạp lịch khung cố định vào lịch phân công thực tế cho tuần đã chọn (T2–T6).
              </p>
              <div className="form-group">
                <label className="form-label">Chọn tuần (ngày bất kỳ trong tuần)</label>
                <input
                  type="date"
                  className="form-control"
                  value={applyTuan}
                  onChange={e => setApplyTuan(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="forceOverwrite"
                  checked={applyForce}
                  onChange={e => setApplyForce(e.target.checked)}
                />
                <label htmlFor="forceOverwrite" style={{ cursor: 'pointer', marginBottom: 0 }}>
                  Ghi đè nếu đã có lịch (cập nhật audit)
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowApply(false)}>Hủy</button>
              <button
                className="btn btn-primary"
                onClick={applyKhung}
                disabled={applyLoading}
              >
                {applyLoading
                  ? <><i className="fas fa-spinner fa-spin"></i> Đang nạp...</>
                  : <><i className="fas fa-check"></i> Xác nhận nạp</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {AlertUI}

      {/* ── Confirm Auto Modal ── */}
      {confirmAuto && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ padding: '24px 20px 16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🪄</div>
              <h3 style={{ marginBottom: 8, fontSize: '1rem' }}>Xếp lịch tự động</h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
                Thao tác này sẽ <strong>xóa toàn bộ lịch khung hiện tại</strong> và tạo lại từ đầu bằng thuật toán cân bằng tải. Bạn có muốn tiếp tục?
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmAuto(false)}>Hủy</button>
                <button className="btn btn-success" onClick={autoSchedule} disabled={autoLoading}>
                  {autoLoading ? <><i className="fas fa-spinner fa-spin"></i> Đang xếp...</> : <><i className="fas fa-magic"></i> Xác nhận xếp</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
