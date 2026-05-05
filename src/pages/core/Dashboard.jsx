import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import './Dashboard.css';

/* ── Helpers ─────────────────────────────────────────── */
function StatCard({ icon, label, value, colorClass, footer }) {
  return (
    <div className={`stat-card-item ${colorClass}`}>
      <div className="stat-card-top">
        <div className="stat-card-icon-wrap"><i className={icon}></i></div>
        <div className="stat-card-text">
          <p>{label}</p>
          <h3>{value}</h3>
        </div>
      </div>
      {footer && <div className="stat-card-footer">{footer}</div>}
    </div>
  );
}

function GradeCard({ khoi, info }) {
  const iconMap = { '10': 'fas fa-school', '11': 'fas fa-book-open', '12': 'fas fa-graduation-cap' };
  const colorMap = { '10': '#38bdf8', '11': '#34d399', '12': '#fb923c' };
  return (
    <div className="grade-card">
      <div className="grade-header" style={{ background: `linear-gradient(135deg, #0f3460, ${colorMap[khoi] || '#009CFF'})` }}>
        <i className={iconMap[khoi] || 'fas fa-school'}></i>
        CHI TIẾT KHỐI {khoi}
      </div>
      <div className="grade-metrics">
        <div className="metric-box bg-blue-light">
          <div className="metric-icon"><i className="fas fa-users"></i></div>
          <p>Sĩ số</p><h4>{info.total ?? 0}</h4>
        </div>
        <div className="metric-box bg-yellow-light">
          <div className="metric-icon"><i className="fas fa-clipboard-check"></i></div>
          <p>Có Phép</p><h4>{info.phep ?? 0}</h4>
        </div>
        <div className="metric-box bg-red-light">
          <div className="metric-icon"><i className="fas fa-user-times"></i></div>
          <p>Không P</p><h4>{info.vang ?? 0}</h4>
        </div>
      </div>
      <div className="grade-progress">
        <div>
          <div className="progress-info">
            <span>Ăn trưa: <b>{info.eating ?? 0}</b></span>
            <span className="percent">{info.eat_pct ?? 0}%</span>
          </div>
          <div className="progress-bar">
            <div className="bar-fill bg-green" style={{ width: `${info.eat_pct ?? 0}%` }}></div>
          </div>
        </div>
        <div>
          <div className="progress-info">
            <span>Nghỉ trưa: <b>{info.sleeping ?? 0}</b></span>
            <span className="percent">{info.sleep_pct ?? 0}%</span>
          </div>
          <div className="progress-bar">
            <div className="bar-fill bg-purple" style={{ width: `${info.sleep_pct ?? 0}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */
export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const today = useMemo(() => {
    const d = new Date();
    return {
      day:  d.toLocaleDateString('vi-VN', { weekday: 'long' }),
      date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    api.get('/api/dashboard/', { signal: ctrl.signal })
      .then(r => { if (r.data?.ok) setData(r.data); })
      .catch(e => { if (e?.name !== 'CanceledError') setError(e.response?.data?.error || 'Không thể tải dữ liệu'); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const stat = data?.stat || {};

  /* ── Loading ── */
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '100px 20px', color: '#64748b' }}>
      <div style={{ fontSize: '3rem', color: '#009CFF', marginBottom: 16 }}>
        <i className="fas fa-circle-notch fa-spin"></i>
      </div>
      <p style={{ fontWeight: 600, fontSize: '1rem' }}>Đang tải dữ liệu...</p>
      <p style={{ fontSize: '0.85rem', marginTop: 6, color: '#94a3b8' }}>Vui lòng chờ trong giây lát</p>
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#dc2626' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}><i className="fas fa-triangle-exclamation"></i></div>
      <p style={{ fontWeight: 700, fontSize: '1rem' }}>Không tải được dữ liệu</p>
      <p style={{ fontSize: '0.85rem', marginTop: 8, color: '#94a3b8' }}>{error}</p>
    </div>
  );

  const eatPct   = stat.total ? Math.round((stat.eating   ?? 0) * 100 / stat.total) : 0;
  const sleepPct = stat.total ? Math.round((stat.sleeping ?? 0) * 100 / stat.total) : 0;

  return (
    <>
      {/* ── Header gọn ── */}
      <div className="content-header">
        <h2 className="page-title">Thống kê điểm danh bán trú</h2>
        <div className="today-badge">
          <i className="fas fa-calendar-day"></i>
          <span>{today.day.charAt(0).toUpperCase() + today.day.slice(1)}, {today.date}</span>
          {data?.nam_hoc && <span style={{ borderLeft:'1px solid #BAE6FD', paddingLeft:10, marginLeft:4 }}>NH {data.nam_hoc}</span>}
        </div>
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="stats-container">
        <StatCard
          icon="fas fa-user-graduate" label="Tổng học sinh bán trú"
          value={stat.total ?? 0} colorClass="blue"
          footer={<><span>Nam: <b>{stat.male ?? 0}</b></span><span>Nữ: <b>{stat.female ?? 0}</b></span></>}
        />
        <StatCard
          icon="fas fa-utensils" label="Học sinh ăn trưa"
          value={stat.eating ?? 0} colorClass="green"
          footer={<span>{eatPct}% đã điểm danh ăn hôm nay</span>}
        />
        <StatCard
          icon="fas fa-bed" label="Học sinh nghỉ trưa"
          value={stat.sleeping ?? 0} colorClass="purple"
          footer={<span>{sleepPct}% đã điểm danh ngủ hôm nay</span>}
        />
        <StatCard
          icon="fas fa-user-slash" label="Học sinh vắng"
          value={stat.absent ?? 0} colorClass="orange"
          footer={<><span>Vắng ăn: <b>{stat.absent_eat ?? 0}</b></span><span>Vắng ngủ: <b>{stat.absent_sleep ?? 0}</b></span></>}
        />
      </div>

      {/* ── Grade Details ── */}
      <div className="detail-section">
        <div className="section-header">
          <div className="section-header-bar"></div>
          <h3>Thống kê theo khối lớp</h3>
          <span className="section-badge">Hôm nay</span>
        </div>
        <div className="grade-container">
          {stat.khoi
            ? Object.entries(stat.khoi).map(([k, info]) => <GradeCard key={k} khoi={k} info={info} />)
            : <p style={{ color: '#94a3b8', padding: 20, fontWeight: 500 }}>Chưa có dữ liệu điểm danh hôm nay.</p>
          }
        </div>
      </div>

    </>
  );
}
