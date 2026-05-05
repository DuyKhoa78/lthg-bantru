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
      {/* ── Hero Banner ── */}
      <div className="dash-hero">
        <div className="dash-hero-left">
          <h1>Xin chào! Chào mừng trở lại 👋</h1>
          <p>
            Hệ thống Quản lý Bán trú · Trường THPT Lê Thị Hồng Gấm<br/>
            {today.day.charAt(0).toUpperCase() + today.day.slice(1)}, {today.date}
            {data?.nam_hoc && <>&nbsp;·&nbsp; Năm học <strong>{data.nam_hoc}</strong></>}
          </p>
          <div className="dash-hero-badges">
            <span className="dash-badge">
              <i className="fas fa-utensils"></i> Ăn: {stat.eating ?? 0} HS ({eatPct}%)
            </span>
            <span className="dash-badge">
              <i className="fas fa-bed"></i> Ngủ: {stat.sleeping ?? 0} HS ({sleepPct}%)
            </span>
            {(stat.absent ?? 0) > 0 && (
              <span className="dash-badge" style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(252,165,165,0.4)' }}>
                <i className="fas fa-user-minus"></i> Vắng: {stat.absent} HS
              </span>
            )}
          </div>
        </div>
        <div className="dash-hero-right">
          <small>TỔNG HỌC SINH</small>
          <div className="big-num">{stat.total ?? 0}</div>
          <small>bán trú</small>
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

      {/* ── General Info ── */}
      <div className="section-header">
        <div className="section-header-bar"></div>
        <h3>Tổng quan học sinh bán trú</h3>
        {data?.nam_hoc && <span className="section-badge">NH {data.nam_hoc}</span>}
      </div>
      <div className="general-container">
        <div className="main-total-card">
          <div className="total-info">
            <i className="fas fa-school main-icon"></i>
            <div className="total-info-text">
              <p>Tổng số học sinh đăng ký</p>
              <h1>{stat.total ?? 0}</h1>
            </div>
          </div>
          <div className="total-gender-split">
            <div className="gender-box male-bg">
              <i className="fas fa-mars"></i> Nam <span>{stat.male ?? 0}</span>
            </div>
            <div className="gender-box female-bg">
              <i className="fas fa-venus"></i> Nữ <span>{stat.female ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="grade-info-grid">
          {stat.khoi && Object.entries(stat.khoi).map(([name, g]) => (
            <div className="grade-stat-card" key={name}>
              <div className="grade-stat-header">
                <i className="fas fa-layer-group"></i> KHỐI {name}
              </div>
              <div className="grade-total-num">
                <small>Sĩ số:</small>
                <span>{g.total ?? 0}</span>
              </div>
              <div className="grade-gender-info">
                <div className="m-count"><i className="fas fa-mars"></i> Nam <b>{g.male ?? 0}</b></div>
                <div className="f-count"><i className="fas fa-venus"></i> Nữ <b>{g.female ?? 0}</b></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
