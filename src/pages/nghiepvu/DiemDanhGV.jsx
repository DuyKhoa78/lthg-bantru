import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAlert } from '../../hooks/useAlert.jsx';
import '../../styles/admin.css';

// Chuyển YYYY-MM-DD → DD/MM/YYYY
const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const shiftDate = (baseIso, days) => {
  if (!baseIso) return '';
  const d = new Date(baseIso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayVN = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DOW_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export default function DiemDanhGV() {
  const { showAlert, AlertUI } = useAlert();

  const [date, setDate] = useState(todayVN);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [filterCa, setFilterCa] = useState('all'); // 'all', '0' (Ăn), '1' (Ngủ)
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'comat', 'vang', 'thay'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Quick Action confirming
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [confirmAllSaving, setConfirmAllSaving] = useState(false);

  // Fetch duty schedule for selected date
  const loadDayData = useCallback(async (selectedDate, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/api/lichtruc/day/?ngay=${selectedDate}`);
      if (res.data?.ok) {
        setRecords(res.data.records || []);
      }
    } catch (err) {
      showAlert('Lỗi tải dữ liệu lịch trực: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    loadDayData(date);
  }, [date, loadDayData]);

  // Day label (e.g. Thứ Hai, 14/09/2026)
  const dayOfWeekLabel = useMemo(() => {
    if (!date) return '';
    try {
      const d = new Date(date + 'T00:00:00');
      const dow = DOW_NAMES[d.getDay()] || '';
      return `${dow}, ${fmtDate(date)}`;
    } catch {
      return fmtDate(date);
    }
  }, [date]);

  // Navigation handlers
  const handlePrevDay = () => setDate(d => shiftDate(d, -1));
  const handleNextDay = () => setDate(d => shiftDate(d, 1));
  const handleToday = () => setDate(todayVN());

  // Quick attendance toggle for one record
  const handleToggleStatus = async (record, newStatus) => {
    try {
      // Optimistic update
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, xac_nhan_truc: newStatus } : r));

      const res = await api.post('/api/lichtruc/diem-danh/', {
        id: record.id,
        xac_nhan_truc: newStatus,
      });
      if (!res.data?.ok) {
        // Rollback
        loadDayData(date, true);
        showAlert(res.data?.error || 'Lỗi cập nhật điểm danh', 'danger');
      }
    } catch (err) {
      loadDayData(date, true);
      showAlert('Lỗi cập nhật điểm danh: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  // Quick attendance: All present
  const handleMarkAllPresent = async () => {
    setConfirmAllSaving(true);
    try {
      const payload = {
        ngay: date,
        xac_nhan_truc: true,
      };
      if (filterCa !== 'all') {
        payload.loai_truc = parseInt(filterCa);
      }
      const res = await api.post('/api/lichtruc/diem-danh-all/', payload);
      if (res.data?.ok) {
        showAlert(`Đã điểm danh Có mặt cho toàn bộ ca trực!`, 'success');
        await loadDayData(date, true);
        setConfirmAllOpen(false);
      }
    } catch (err) {
      showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setConfirmAllSaving(false);
    }
  };



  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Filter ca (Ăn / Ngủ)
      if (filterCa !== 'all' && r.loai_truc !== parseInt(filterCa)) {
        return false;
      }

      const isSubstituted = Boolean(r.ma_gv_truc_thay_id || (r.ten_gv_truc_thay && r.ten_gv_truc_thay.trim()));
      const isComat = r.xac_nhan_truc !== false;

      // Filter status
      if (filterStatus === 'comat' && !isComat) return false;
      if (filterStatus === 'vang' && isComat) return false;
      if (filterStatus === 'thay' && !isSubstituted) return false;

      // Search term (Room, Teacher name, Substitute name)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const phongMatch = r.ma_phong_id?.toLowerCase().includes(term);
        const gvMatch = r.giao_vien?.ho_ten?.toLowerCase().includes(term);
        const gvThayMatch = r.giao_vien_truc_thay?.ho_ten?.toLowerCase().includes(term);
        const tenNgoaiMatch = r.ten_gv_truc_thay?.toLowerCase().includes(term);
        if (!phongMatch && !gvMatch && !gvThayMatch && !tenNgoaiMatch) return false;
      }

      return true;
    });
  }, [records, filterCa, filterStatus, searchTerm]);

  // KPI calculations
  const stats = useMemo(() => {
    const total = records.length;
    const comat = records.filter(r => r.xac_nhan_truc !== false).length;
    const vang = records.filter(r => r.xac_nhan_truc === false).length;
    const thay = records.filter(r => Boolean(r.ma_gv_truc_thay_id || (r.ten_gv_truc_thay && r.ten_gv_truc_thay.trim()))).length;
    return { total, comat, vang, thay };
  }, [records]);



  return (
    <div className="diemdanh-gv-page" style={{ paddingBottom: 60 }}>
      {AlertUI}

      {/* ─── HEADER ─── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span style={{ color: 'var(--text-muted)' }}>Điểm danh</span>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Điểm danh Giáo viên</span>
          </div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-user-check" style={{ color: 'var(--primary)' }}></i>
            Điểm danh Giáo viên trực
          </h2>
          <p style={{ color: '#64748b', margin: '4px 0 0' }}>
            Quản lý điểm danh ca trực bán trú hàng ngày, xác nhận có mặt / vắng của giáo viên.
          </p>
        </div>

        <div className="page-header-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/lich-truc-admin"
            className="btn btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            title="Đến Phân công theo ngày để điều động trực thay"
          >
            <i className="fas fa-calendar-check" style={{ color: 'var(--primary)' }}></i>
            <span>Phân công theo Ngày</span>
          </Link>

          <button
            className="btn btn-primary"
            onClick={() => setConfirmAllOpen(true)}
            disabled={loading || records.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #0284c7, #0ea5e9)', border: 'none', boxShadow: '0 2px 6px rgba(14,165,233,0.3)' }}
          >
            <i className="fas fa-check-double"></i>
            <span>Điểm danh tất cả có mặt</span>
          </button>
        </div>
      </div>

      {/* ─── DATE NAVIGATION & TOOLBAR ─── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '14px 18px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
        }}
      >
        {/* Date Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handlePrevDay}
            title="Ngày trước"
            style={{ width: 36, height: 36, padding: 0, borderRadius: 8, display: 'grid', placeItems: 'center' }}
          >
            <i className="fas fa-chevron-left"></i>
          </button>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <i className="fas fa-calendar-day" style={{ position: 'absolute', left: 12, color: 'var(--primary)', pointerEvents: 'none' }}></i>
            <input
              type="date"
              className="form-control"
              value={date}
              onChange={e => e.target.value && setDate(e.target.value)}
              style={{ paddingLeft: 34, fontWeight: 600, fontSize: '0.95rem', height: 38, width: 160 }}
            />
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleNextDay}
            title="Ngày sau"
            style={{ width: 36, height: 36, padding: 0, borderRadius: 8, display: 'grid', placeItems: 'center' }}
          >
            <i className="fas fa-chevron-right"></i>
          </button>

          <button
            className={`btn btn-sm ${date === todayVN() ? 'btn-primary' : 'btn-ghost'}`}
            onClick={handleToday}
            style={{ height: 38, borderRadius: 8, fontWeight: 600 }}
          >
            Hôm nay
          </button>

          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginLeft: 6 }}>
            {dayOfWeekLabel}
          </div>
        </div>

        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 220, maxWidth: 360 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }}></i>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm theo phòng, tên GV..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 34, height: 38, borderRadius: 8 }}
            />
          </div>
        </div>
      </div>

      {/* ─── KPI SUMMARY CARDS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Card 1: Tổng ca */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
            <i className="fas fa-clipboard-list"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Tổng lượt trực</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{stats.total}</div>
          </div>
        </div>

        {/* Card 2: Có mặt */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#f0fdf4', color: '#16a34a', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
            <i className="fas fa-check-circle"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Đã có mặt</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a' }}>{stats.comat}</div>
          </div>
        </div>

        {/* Card 3: Vắng */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fef2f2', color: '#dc2626', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
            <i className="fas fa-times-circle"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Vắng trực</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>{stats.vang}</div>
          </div>
        </div>

        {/* Card 4: Trực thay */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fffbeb', color: '#d97706', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
            <i className="fas fa-exchange-alt"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Có trực thay</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706' }}>{stats.thay}</div>
          </div>
        </div>
      </div>

      {/* ─── FILTER TABS & SUB-FILTERS ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {/* Ca Trực Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, background: '#e2e8f0', padding: 4, borderRadius: 10 }}>
          <button
            onClick={() => setFilterCa('all')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filterCa === 'all' ? '#fff' : 'transparent',
              color: filterCa === 'all' ? '#0f172a' : '#64748b',
              boxShadow: filterCa === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Tất cả các ca
          </button>
          <button
            onClick={() => setFilterCa('0')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: filterCa === '0' ? '#fff' : 'transparent',
              color: filterCa === '0' ? '#2563eb' : '#64748b',
              boxShadow: filterCa === '0' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <i className="fas fa-utensils"></i>
            Ca Ăn
          </button>
          <button
            onClick={() => setFilterCa('1')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: filterCa === '1' ? '#fff' : 'transparent',
              color: filterCa === '1' ? '#16a34a' : '#64748b',
              boxShadow: filterCa === '1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <i className="fas fa-bed"></i>
            Ca Ngủ
          </button>
        </div>

        {/* Trạng thái filter buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginRight: 4 }}>Trạng thái:</span>
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'comat', label: 'Có mặt', icon: 'fa-check-circle', color: '#16a34a' },
            { id: 'vang', label: 'Vắng', icon: 'fa-times-circle', color: '#dc2626' },
            { id: 'thay', label: 'Trực thay', icon: 'fa-exchange-alt', color: '#d97706' },
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setFilterStatus(btn.id)}
              style={{
                border: '1px solid',
                borderColor: filterStatus === btn.id ? (btn.color || '#2563eb') : '#cbd5e1',
                background: filterStatus === btn.id ? (btn.color ? `${btn.color}15` : '#eff6ff') : '#fff',
                color: filterStatus === btn.id ? (btn.color || '#2563eb') : '#475569',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.78rem',
                fontWeight: filterStatus === btn.id ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {btn.icon && <i className={`fas ${btn.icon}`}></i>}
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── DUTY LIST TABLE / CARDS ─── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: 'var(--primary)', marginBottom: 12 }}></i>
            <div style={{ fontWeight: 600 }}>Đang tải lịch trực ngày {fmtDate(date)}...</div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <i className="fas fa-calendar-times" style={{ fontSize: '2.5rem', marginBottom: 12, color: '#cbd5e1' }}></i>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>Không có ca trực nào phù hợp</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
              {records.length === 0
                ? `Ngày ${fmtDate(date)} chưa có lịch phân công trực hoặc đang là ngày nghỉ bán trú.`
                : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'}
            </div>
            {records.length === 0 && (
              <Link to="/lich-truc-admin" className="btn btn-sm btn-ghost" style={{ marginTop: 14 }}>
                <i className="fas fa-calendar-check" style={{ marginRight: 6 }}></i>
                Đi đến trang Phân công theo Ngày
              </Link>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', width: 100 }}>Phòng</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', width: 160 }}>Ca & Nhiệm vụ</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Người trực thực tế</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', width: 240 }}>Trạng thái Điểm danh</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((item) => {
                  const isCaAn = item.loai_truc === 0;
                  const isDiemDanh = item.nhiem_vu === 0;
                  const isComat = item.xac_nhan_truc !== false;

                  // Trực thay
                  const hasGvThay = Boolean(item.ma_gv_truc_thay_id);
                  const hasNgoaiThay = Boolean(item.ten_gv_truc_thay && item.ten_gv_truc_thay.trim());
                  const hasSubstitute = hasGvThay || hasNgoaiThay;

                  // Tên người trực thực tế (Primary display name)
                  const isNgoai = Boolean(hasNgoaiThay);
                  const actualName = hasNgoaiThay
                    ? item.ten_gv_truc_thay.trim()
                    : hasGvThay
                    ? (item.giao_vien_truc_thay?.ho_ten || `GV #${item.ma_gv_truc_thay_id}`)
                    : (item.giao_vien?.ho_ten || `GV #${item.ma_gv_id}`);

                  // Tên GV ban đầu được phân công
                  const originalTeacherName = item.giao_vien?.ho_ten || `GV #${item.ma_gv_id}`;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isComat ? '#ffffff' : '#fef2f220',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = isComat ? '#ffffff' : '#fef2f220'}
                    >
                      {/* Phòng */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: isCaAn ? '#eff6ff' : '#f0fdf4',
                            color: isCaAn ? '#2563eb' : '#16a34a',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 800,
                            fontSize: '0.85rem'
                          }}>
                            <i className="fas fa-door-open"></i>
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>
                            {item.ma_phong_id}
                          </span>
                        </div>
                      </td>

                      {/* Ca & Nhiệm vụ */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {/* Ca badge */}
                          <span
                            style={{
                              alignSelf: 'flex-start',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isCaAn ? '#eff6ff' : '#f0fdf4',
                              color: isCaAn ? '#1d4ed8' : '#15803d',
                              border: `1px solid ${isCaAn ? '#bfdbfe' : '#bbf7d0'}`,
                            }}
                          >
                            <i className={`fas ${isCaAn ? 'fa-utensils' : 'fa-bed'}`}></i>
                            {isCaAn ? 'Ca Ăn' : 'Ca Ngủ'}
                          </span>

                          {/* Nhiệm vụ badge */}
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <i className={`fas ${isDiemDanh ? 'fa-clipboard-check' : 'fa-eye'}`} style={{ color: isDiemDanh ? '#2563eb' : '#16a34a' }}></i>
                            {isDiemDanh ? 'Điểm danh' : 'Giám sát'}
                          </span>
                        </div>
                      </td>

                      {/* Người trực thực tế (RULE: Nếu trực thay, CHỈ hiện người trực thay, làm rõ thay ai) */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {hasSubstitute ? (
                          <div>
                            {/* Tên người trực thay (Primary) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#b45309' }}>
                                {actualName}
                              </span>

                              {isNgoai ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fde68a',
                                  }}
                                >
                                  <i className="fas fa-user-tag"></i>
                                  Ngoài DS
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: '#fffbeb',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                  }}
                                >
                                  <i className="fas fa-exchange-alt"></i>
                                  Trực thay
                                </span>
                              )}
                            </div>

                            {/* Dòng làm rõ: thay cho ai */}
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="fas fa-exchange-alt" style={{ color: '#d97706', fontSize: '0.7rem' }}></i>
                              <span>Trực thay cho: <strong>{originalTeacherName}</strong></span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                              {actualName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                              Giáo viên chính thức
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Trạng thái Điểm danh (1-touch Toggle Buttons) */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
                          {/* Nút Có mặt */}
                          <button
                            onClick={() => handleToggleStatus(item, true)}
                            title="Xác nhận Có mặt"
                            style={{
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: isComat ? '#16a34a' : 'transparent',
                              color: isComat ? '#ffffff' : '#64748b',
                              boxShadow: isComat ? '0 1px 4px rgba(22,163,74,0.35)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <i className="fas fa-check-circle"></i>
                            Có mặt
                          </button>

                          {/* Nút Vắng */}
                          <button
                            onClick={() => handleToggleStatus(item, false)}
                            title="Đánh dấu Vắng trực"
                            style={{
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: !isComat ? '#dc2626' : 'transparent',
                              color: !isComat ? '#ffffff' : '#64748b',
                              boxShadow: !isComat ? '0 1px 4px rgba(220,38,38,0.35)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <i className="fas fa-times-circle"></i>
                            Vắng
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>



      {/* ─── MODAL CONFIRM: ĐIỂM DANH TẤT CẢ CÓ MẶT ─── */}
      {confirmAllOpen && (
        <div className="modal-overlay open" onClick={() => !confirmAllSaving && setConfirmAllOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-check-double" style={{ color: '#16a34a' }}></i>
                Xác nhận điểm danh tất cả
              </div>
              <button className="modal-close" onClick={() => !confirmAllSaving && setConfirmAllOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: '#334155' }}>
                Bạn có chắc chắn muốn điểm danh <strong>Có mặt</strong> cho toàn bộ giáo viên trực{' '}
                {filterCa === 'all' ? 'tất cả các ca' : (filterCa === '0' ? 'Ca Ăn' : 'Ca Ngủ')} trong ngày{' '}
                <strong>{fmtDate(date)}</strong>?
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmAllOpen(false)}
                disabled={confirmAllSaving}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleMarkAllPresent}
                disabled={confirmAllSaving}
                style={{ background: '#16a34a', borderColor: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {confirmAllSaving && <i className="fas fa-spinner fa-spin"></i>}
                <span>Đồng ý có mặt tất cả</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
