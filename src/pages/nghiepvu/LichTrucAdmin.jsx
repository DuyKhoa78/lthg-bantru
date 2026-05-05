import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import { removeAccents } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './LichTruc.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const toDateStr = d => {
  try {
    if (!d || isNaN(new Date(d).getTime())) return '';
    const dd = new Date(d);
    return `${dd.getFullYear()}-${p2(dd.getMonth() + 1)}-${p2(dd.getDate())}`;
  } catch { return ''; }
};

// "Nguyễn Văn An" → "N. An"  |  "An" → "An"
const abbrevName = (fullName) => {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  const firstInitial = parts[0][0].toUpperCase();
  return `${firstInitial}. ${lastName}`;
};

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function LichTrucAdmin() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  // ─── State ─────────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [loading, setLoading]     = useState(false);
  const [showT5, setShowT5]       = useState(false);

  const [giaoVienList, setGiaoVienList] = useState([]);
  const [phongList, setPhongList]       = useState([]);
  const [pcData, setPcData]             = useState([]);

  // Detail modal (click vào tag GV)
  const [detailPC, setDetailPC]   = useState(null); // bản ghi pc đang xem

  // Picker modal (thêm GV / trực thay)
  const [picker, setPicker]             = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerNhiemVu, setPickerNhiemVu] = useState('all');
  const [pickerSaving, setPickerSaving] = useState(false);

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ─── Computed ───────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    try {
      return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
        .filter(d => {
          const dow = d.getDay();
          if (dow === 4) return showT5;
          return true;
        });
    } catch { return []; }
  }, [weekStart, showT5]);

  const weekLabel = useMemo(() => {
    if (!weekDays || weekDays.length === 0) return '...';
    try {
      const start = weekDays[0].toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
      const end = weekDays[weekDays.length - 1].toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
      return `${start} – ${end}`;
    } catch { return '...'; }
  }, [weekDays]);

  // ─── Load Data ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/api/giaovien/?limit=500').catch(() => ({ data: {} })),
      api.get('/api/phong/an').catch(() => ({ data: {} })),
      api.get('/api/phong/ngu').catch(() => ({ data: {} })),
    ]).then(([resGV, resAn, resNgu]) => {
      if (resGV.data?.ok) setGiaoVienList(resGV.data.giaovien || []);
      setPhongList([
        ...(resAn.data?.ok ? resAn.data.phong : []),
        ...(resNgu.data?.ok ? resNgu.data.phong : []),
      ]);
    }).catch(() => {});
  }, []);

  const loadWeek = useCallback(async (monday) => {
    setLoading(true);
    try {
      const dateStrMon = toDateStr(monday);
      const [resData, resConfig] = await Promise.all([
        api.get(`/api/lichtruc/week/?tuan=${dateStrMon}`),
        api.get(`/api/lichtruc/config-tuan/?tuan=${dateStrMon}`)
      ]);
      if (resData.data?.ok) setPcData(resData.data.records || []);
      if (resConfig.data?.ok) setShowT5(resConfig.data.config.show_t5 || false);
    } catch (err) {
      showAlert('Lỗi tải dữ liệu: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  // ─── Actions ────────────────────────────────────────────────────────
  const navWeek = (dir) => setWeekStart(d => getMonday(addDays(d, dir * 7)));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const doDelete = async () => {
    const pcId = confirmDelete;
    setConfirmDelete(null);
    setDetailPC(null);
    try {
      const res = await api.post('/api/lichtruc/delete/', { id: pcId });
      if (res.data?.ok) await loadWeek(weekStart);
    } catch (err) {
      showAlert('Lỗi xóa: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  const addGV = async (gvSelected) => {
    if (!picker || !gvSelected) return;
    const { ngay, phong_id, loai_truc } = picker;
    const cellEntries = (pcData || []).filter(p => p.ngay === ngay && p.ma_phong_id === phong_id && p.loai_truc === loai_truc);

    if (cellEntries.find(x => x.ma_gv_id === gvSelected.id)) {
      showAlert(`${gvSelected.ho_ten} đã có trong ô này`, 'warning');
      return;
    }

    if (picker.mode !== 'substitute') {
      const phong = (phongList || []).find(p => p.ma_phong === phong_id);
      if (phong) {
        const slToiDa = gvSelected.nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
        const hienTai = cellEntries.filter(p => {
          const g = (giaoVienList || []).find(x => x.id === p.ma_gv_id);
          return g?.nhiem_vu === gvSelected.nhiem_vu;
        }).length;
        if (hienTai >= slToiDa) {
          showAlert(`Phòng ${phong_id} đã đủ GV ${gvSelected.nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'}`, 'danger');
          return;
        }
      }
    }

    setPickerSaving(true);
    try {
      const originalPC = picker.mode === 'substitute'
        ? (pcData || []).find(x => String(x.id) === String(picker.originalPCId))
        : null;
      const res = await api.post('/api/lichtruc/save/', {
        id: picker.originalPCId,
        ma_gv_id: picker.mode === 'substitute' ? originalPC?.ma_gv_id : gvSelected.id,
        ma_gv_truc_thay_id: picker.mode === 'substitute' ? gvSelected.id : null,
        ma_phong_id: phong_id,
        ngay,
        loai_truc,
      });
      if (res.data?.ok) {
        await loadWeek(weekStart);
        setPicker(null);
        setDetailPC(null);
      }
    } catch (err) {
      showAlert('Lỗi lưu: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setPickerSaving(false);
    }
  };

  const applyKhung = async () => {
    setLoading(true);
    try {
      const res = await api.post('/api/lichtruc/apply-khung/', { tuan: toDateStr(weekStart), force: false });
      if (res.data?.ok) { showAlert(res.data.message, 'success'); loadWeek(weekStart); }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
    finally { setLoading(false); }
  };

  const clearDay = async (d) => {
    if (!window.confirm(`Bạn có chắc muốn xóa TOÀN BỘ lịch phân công ngày ${toDateStr(d)} (đánh dấu là ngày nghỉ bán trú)?`)) return;
    try {
      const res = await api.post('/api/lichtruc/clear-day/', { ngay: toDateStr(d) });
      if (res.data?.ok) { showAlert(res.data.message, 'success'); await loadWeek(weekStart); }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
  };

  const applyDay = async (d) => {
    try {
      const sourceThu = d.getDay() - 1; // 1=T2 -> sourceThu=0
      if (d.getDay() === 0 || d.getDay() === 6) {
        showAlert('Chỉ có thể nạp tự động cho T2-T6', 'warning'); return;
      }
      const res = await api.post('/api/lichtruc/apply-day-bu/', { targetDate: toDateStr(d), sourceThu, force: false });
      if (res.data?.ok) { showAlert(res.data.message, 'success'); await loadWeek(weekStart); }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
  };

  const getCellData = useCallback((phong_id, ngayStr, loai_truc) =>
    (pcData || []).filter(p => p.ma_phong_id === phong_id && p.ngay === ngayStr && p.loai_truc === loai_truc), [pcData]);

  const filteredGVList = useMemo(() => {
    if (!giaoVienList) return [];
    return giaoVienList.filter(gv => {
      if (!gv.dang_lam) return false;
      if (pickerNhiemVu !== 'all' && gv.nhiem_vu !== parseInt(pickerNhiemVu)) return false;
      if (pickerSearch) {
        const searchStr = removeAccents(pickerSearch.toLowerCase());
        const nameStr = removeAccents(gv.ho_ten.toLowerCase());
        if (!nameStr.includes(searchStr)) return false;
      }
      
      if (picker) {
        const { ngay, loai_truc, phong_id } = picker;
        
        // 1. Kiểm tra giới tính (Nếu là phòng ngủ)
        const currentPhong = phongList.find(p => p.ma_phong === phong_id);
        if (loai_truc === 1 && currentPhong && currentPhong.gioi_tinh !== null) {
          // 0: Nam, 1: Nữ. GV gioi_tinh: 0: Nam, 1: Nữ
          if (gv.gioi_tinh !== currentPhong.gioi_tinh) return false;
        }

        // 2. Kiểm tra GV đã bận ở phòng khác trong cùng buổi (loai_truc) chưa
        const isBusy = (pcData || []).some(pc => 
          pc.ngay === ngay && 
          pc.loai_truc === loai_truc && 
          (pc.ma_gv_id === gv.id || pc.ma_gv_truc_thay_id === gv.id)
        );
        if (isBusy) return false;

        // 3. Nếu là trực thay, không cho tự thay cho mình
        if (picker.mode === 'substitute' && picker.originalPCId) {
          const originalPC = (pcData || []).find(x => String(x.id) === String(picker.originalPCId));
          if (originalPC && gv.id === originalPC.ma_gv_id) return false;
        }
      }
      return true;
    });
  }, [giaoVienList, phongList, picker, pickerSearch, pickerNhiemVu, pcData]);

  // ─── Helper lấy thông tin GV từ pc record ──────────────────────────
  const getGVInfo = (pc) => pc.giao_vien || (giaoVienList || []).find(g => g.id === pc.ma_gv_id);
  const getGVThayInfo = (pc) => pc.giao_vien_truc_thay || (giaoVienList || []).find(g => g.id === pc.ma_gv_truc_thay_id);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Phân công theo Ngày</span>
          </div>
          <h2><i className="fas fa-calendar-check" style={{ color: 'var(--primary)' }}></i> Phân công theo Ngày</h2>
        </div>
        <div className="page-header-actions">
          <div className="header-button-group" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`btn btn-sm ${showT5 ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={async () => {
                const nv = !showT5; setShowT5(nv);
                try { await api.post('/api/lichtruc/config-tuan/save/', { tuan: toDateStr(weekStart), show_t5: nv }); } catch { /* ignore */ }
              }}
            >
              <i className={`fas ${showT5 ? 'fa-eye-slash' : 'fa-eye'}`}></i> {showT5 ? 'Ẩn Thứ 5' : 'Dạy bù (T5)'}
            </button>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={goToday} 
              disabled={loading}
            >
              <i className="fas fa-calendar-day"></i> Tuần này
            </button>
            <button 
              className="btn btn-success btn-sm" 
              style={{ fontWeight: 600, boxShadow: '0 2px 6px rgba(34,197,94,0.2)' }}
              onClick={applyKhung} 
              disabled={loading}
            >
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} Nạp lịch cố định
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div className="week-nav" style={{ margin: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(-1)} disabled={loading}><i className="fas fa-chevron-left"></i></button>
          <span className="week-label">{loading ? <i className="fas fa-spinner fa-spin"></i> : `Tuần: ${weekLabel}`}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(1)} disabled={loading}><i className="fas fa-chevron-right"></i></button>
        </div>

        {/* CHÚ THÍCH MÀU SẮC - Ngang hàng với chọn tuần */}
        <div className="lt-legend" style={{ 
          display: 'flex', 
          gap: '16px', 
          fontSize: '0.75rem', 
          background: '#f8fafc', 
          padding: '6px 14px', 
          borderRadius: '20px', 
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, background: '#2563eb', borderRadius: '50%' }}></span>
            <span style={{ fontWeight: 600, color: '#475569' }}>Điểm danh</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, background: '#16a34a', borderRadius: '50%' }}></span>
            <span style={{ fontWeight: 600, color: '#475569' }}>Hỗ trợ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-exchange-alt" style={{ color: '#d97706', fontSize: '0.7rem' }}></i>
            <span style={{ fontWeight: 600, color: '#475569' }}>Trực thay</span>
          </div>
        </div>
      </div>


      <div style={{ overflowX: 'auto' }}>
        <table className="lt-admin-table" style={{ width: '100%', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Phòng</th>
              {(weekDays || []).map((d, i) => {
                const isToday = toDateStr(d) === toDateStr(new Date());
                const dayHasSchedule = (pcData || []).some(pc => pc.ngay === toDateStr(d));
                return (
                  <th key={i} style={isToday ? { background: 'var(--primary)', color: '#fff' } : {}}>
                    <div>{DOW_SHORT[d.getDay()]}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 400, marginBottom: dayHasSchedule ? 6 : 8 }}>{p2(d.getDate())}/{p2(d.getMonth() + 1)}</div>
                    {user?.is_admin && (
                      <div style={{ fontSize: '0.65rem', fontWeight: 'normal', display: 'flex', justifyContent: 'center' }}>
                        {dayHasSchedule ? (
                          <button 
                            style={{ background: isToday ? 'rgba(255,255,255,0.2)' : '#fee2e2', border: 'none', borderRadius: 4, padding: '3px 8px', color: isToday ? '#fff' : '#ef4444', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600 }}
                            onClick={() => clearDay(d)}
                            title="Đánh dấu ngày này là ngày nghỉ bán trú"
                          >
                            <i className="fas fa-ban"></i> Nghỉ
                          </button>
                        ) : (
                          <button 
                            style={{ background: isToday ? 'rgba(255,255,255,0.2)' : '#dcfce7', border: 'none', borderRadius: 4, padding: '3px 8px', color: isToday ? '#fff' : '#10b981', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600 }}
                            onClick={() => applyDay(d)}
                            title="Tạo lịch phân công từ khung cố định cho ngày này"
                          >
                            <i className="fas fa-plus"></i> Có bán trú
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(phongList || []).map(phong => (
              <tr key={phong.ma_phong}>
                <td className="lt-admin-td-phong">
                  <div style={{ fontWeight: 600 }}>{phong.ma_phong}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{phong.loai_phong === 0 ? 'Phòng ăn' : `Phòng ngủ (${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'})`}</div>
                </td>
                {(weekDays || []).map((d, idx) => {
                  const ngayStr = toDateStr(d);
                  const cellData = getCellData(phong.ma_phong, ngayStr, phong.loai_phong);
                  return (
                    <td key={idx} className="lt-admin-td-cell">
                      {cellData.map(pc => {
                        const gv = getGVInfo(pc);
                        const gvThay = pc.ma_gv_truc_thay_id ? getGVThayInfo(pc) : null;
                        const isDD = gv?.nhiem_vu === 0;
                        const isHT = gv?.nhiem_vu === 1;
                        const borderColor = isDD ? '#2563eb' : (isHT ? '#16a34a' : '#64748b');
                        const bgColor = isDD ? '#eff6ff' : (isHT ? '#f0fdf4' : '#f8fafc');

                        return (
                          <div
                            key={pc.id}
                            onClick={() => setDetailPC({ ...pc, _phong: phong, _ngay: ngayStr })}
                            style={{
                              background: bgColor,
                              borderLeft: `3px solid ${borderColor}`,
                              padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                              cursor: 'pointer', lineHeight: 1.25,
                              transition: 'box-shadow 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
                          >
                            {/* Nếu có trực thay: hiện tên GV thay màu vàng đậm ở trên */}
                            {gvThay ? (
                              <>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#b45309' }}>
                                  {gvThay.ho_ten}
                                </div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 1 }}>
                                  thay: {abbrevName(gv?.ho_ten)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isDD ? '#1e40af' : (isHT ? '#166534' : '#1e293b') }}>
                                {gv?.ho_ten}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {user?.is_admin && (() => {
                        const countDD = cellData.filter(p => (p.giao_vien?.nhiem_vu ?? (giaoVienList || []).find(g => g.id === p.ma_gv_id)?.nhiem_vu) === 0).length;
                        const countHT = cellData.filter(p => (p.giao_vien?.nhiem_vu ?? (giaoVienList || []).find(g => g.id === p.ma_gv_id)?.nhiem_vu) === 1).length;
                        if (countDD < (phong.sl_diem_danh || 1) || countHT < (phong.sl_ho_tro || 1)) {
                          return <button className="lt-add-btn" onClick={() => setPicker({ ngay: ngayStr, phong_id: phong.ma_phong, loai_truc: phong.loai_phong, mode: 'add' })}><i className="fas fa-plus"></i></button>;
                        }
                        return null;
                      })()}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Modal Chi tiết GV (click vào tag) ─── */}
      {detailPC && (() => {
        const gv    = getGVInfo(detailPC);
        const gvThay = detailPC.ma_gv_truc_thay_id ? getGVThayInfo(detailPC) : null;
        const isDD  = gv?.nhiem_vu === 0;
        const isHT  = gv?.nhiem_vu === 1;
        return (
          <div className="modal-overlay open" onClick={() => setDetailPC(null)}>
            <div className="modal-box" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Chi tiết phân công</div>
                <button className="modal-close" onClick={() => setDetailPC(null)}><i className="fas fa-times"></i></button>
              </div>
              <div className="modal-body">
                {/* Thông tin phòng + ngày */}
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12 }}>
                  <i className="fas fa-door-open" style={{ marginRight: 6 }}></i>
                  {detailPC._phong?.ma_phong} — {detailPC._ngay}
                </div>

                {/* GV được phân công */}
                <div style={{ background: isDD ? '#eff6ff' : (isHT ? '#f0fdf4' : '#f8fafc'), borderLeft: `4px solid ${isDD ? '#2563eb' : (isHT ? '#16a34a' : '#94a3b8')}`, padding: '10px 12px', borderRadius: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {gvThay ? 'Người được thay' : 'Giáo viên trực'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isDD ? '#1e40af' : (isHT ? '#166534' : '#1e293b') }}>
                    {gv?.ho_ten || '?'}
                  </div>
                  <div style={{ fontSize: '0.7rem', marginTop: 2 }}>
                    <span className={`badge ${isDD ? 'badge-primary' : (isHT ? 'badge-success' : '')}`} style={{ fontSize: '0.6rem' }}>
                      {isDD ? 'Điểm danh' : (isHT ? 'Hỗ trợ' : '?')}
                    </span>
                  </div>
                </div>

                {/* Nếu có trực thay */}
                {gvThay && (
                  <div style={{ background: '#fffbeb', borderLeft: '4px solid #d97706', padding: '10px 12px', borderRadius: 6, marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      <i className="fas fa-exchange-alt"></i> Người trực thay
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#b45309' }}>
                      {gvThay.ho_ten}
                    </div>
                  </div>
                )}

                {/* Nút hành động (chỉ admin) */}
                {user?.is_admin && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDetailPC(null);
                        setPicker({ ngay: detailPC._ngay, phong_id: detailPC._phong?.ma_phong, loai_truc: detailPC._phong?.loai_phong, mode: 'substitute', originalPCId: detailPC.id });
                        setPickerSearch(''); setPickerNhiemVu('all');
                      }}
                    >
                      <i className="fas fa-user-friends"></i> {gvThay ? 'Đổi người thay' : 'Trực thay'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => { setConfirmDelete(detailPC.id); setDetailPC(null); }}
                    >
                      <i className="fas fa-trash"></i> Xóa phân công
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modal Chọn GV (thêm / trực thay) ─── */}
      {picker && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <div className="modal-title">{picker.mode === 'substitute' ? '👥 Chọn GV trực thay' : '➕ Thêm giáo viên'} — {picker.phong_id}</div>
              <button className="modal-close" onClick={() => setPicker(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" className="form-control" placeholder="Tìm tên..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
                <select className="form-select" style={{ width: 130 }} value={pickerNhiemVu} onChange={e => setPickerNhiemVu(e.target.value)}>
                  <option value="all">Tất cả</option>
                  <option value="0">Điểm danh</option>
                  <option value="1">Hỗ trợ</option>
                </select>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {(filteredGVList || []).length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: '0.85rem' }}>Không có giáo viên phù hợp</div>
                )}
                {(filteredGVList || []).map(gv => (
                  <div key={gv.id} className="lt-picker-item" onClick={() => !pickerSaving && addGV(gv)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: gv.nhiem_vu === 0 ? 'rgba(37,99,235,0.03)' : 'rgba(22,163,74,0.03)'
                  }}>
                    <span style={{ fontWeight: 500 }}>{gv.ho_ten}</span>
                    <span className={`badge ${gv.nhiem_vu === 0 ? 'badge-primary' : 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                      {gv.nhiem_vu === 0 ? 'Điểm danh' : 'Hỗ trợ'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {AlertUI}

      {/* ─── Modal Xác nhận xóa ─── */}
      {confirmDelete && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ padding: '24px 16px 16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🗑️</div>
              <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>Xác nhận xóa phân công</h3>
              <p style={{ color: '#64748b', marginBottom: 20, fontSize: '0.85rem' }}>Thao tác này không thể hoàn tác.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Hủy</button>
                <button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Xóa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
