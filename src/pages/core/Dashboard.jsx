import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import './Dashboard.css';

function StatCard({ icon, label, value, colorClass }) {
  return (
    <div className={`stat-card-item ${colorClass}`}>
      <div className="stat-card-body">
        <div className="stat-card-icon-wrap"><i className={icon}></i></div>
        <div className="stat-card-text"><p>{label}</p><h3>{value}</h3></div>
      </div>
    </div>
  );
}

function GradeCard({ khoi, info }) {
  const icons = { '10': 'fas fa-school', '11': 'fas fa-book', '12': 'fas fa-graduation-cap' };
  return (
    <div className="grade-card">
      <div className="grade-header"><i className={icons[khoi] || 'fas fa-school'}></i> CHI TIẾT KHỐI {khoi}</div>
      <div className="grade-metrics">
        <div className="metric-box bg-blue-light"><div className="metric-icon"><i className="fas fa-calendar-check"></i></div><p>Tổng SL</p><h4>{info.total ?? 0}</h4></div>
        <div className="metric-box bg-yellow-light"><div className="metric-icon"><i className="fas fa-file-signature"></i></div><p>Có Phép</p><h4>{info.phep ?? 0}</h4></div>
        <div className="metric-box bg-red-light"><div className="metric-icon"><i className="fas fa-exclamation-circle"></i></div><p>Không P</p><h4>{info.vang ?? 0}</h4></div>
      </div>
      <div className="grade-progress">
        <div className="progress-item">
          <div className="progress-info"><span>Học sinh ăn: <b>{info.eating ?? 0}</b></span><span className="percent">{info.eat_pct ?? 0}%</span></div>
          <div className="progress-bar"><div className="bar-fill bg-green" style={{ width: `${info.eat_pct ?? 0}%` }}></div></div>
        </div>
        <div className="progress-item">
          <div className="progress-info"><span>Học sinh ngủ: <b>{info.sleeping ?? 0}</b></span><span className="percent">{info.sleep_pct ?? 0}%</span></div>
          <div className="progress-bar"><div className="bar-fill bg-purple" style={{ width: `${info.sleep_pct ?? 0}%` }}></div></div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    api.get('/api/dashboard/', { signal: ctrl.signal })
      .then((res) => { if (res.data?.ok) setData(res.data); })
      .catch((err) => { if (err?.name !== 'CanceledError') setError(err.response?.data?.error || 'Không thể tải dữ liệu'); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const stat = data?.stat || {};

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#64748b' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--primary)' }}></i>
      <p style={{ marginTop: 12 }}>Đang tải dữ liệu...</p>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
      <i className="fas fa-exclamation-triangle" style={{ fontSize: '2rem' }}></i>
      <p style={{ marginTop: 12 }}>{error}</p>
    </div>
  );

  return (
    <>
      <div className="content-header">
        <h2 className="page-title">Thống kê hôm nay</h2>
        <div className="today-badge"><i className="fas fa-calendar-day"></i><span>{today}</span></div>
      </div>

      <div className="stats-container">
        <StatCard icon="fas fa-users"    label="Tổng số HS bán trú" value={stat.total ?? 0}   colorClass="blue" />
        <StatCard icon="fas fa-utensils" label="Số học sinh ăn"     value={stat.eating ?? 0}  colorClass="green" />
        <StatCard icon="fas fa-bed"      label="Số học sinh ngủ"    value={stat.sleeping ?? 0} colorClass="purple" />
        <div className="stat-card-item orange">
          <div className="stat-card-body">
            <div className="stat-card-icon-wrap"><i className="fas fa-user-slash"></i></div>
            <div className="stat-card-text">
              <p>Số học sinh vắng</p><h3>{stat.absent ?? 0}</h3>
              <div className="card-sub-text">
                <span>Vắng ăn: <b>{stat.absent_eat ?? 0}</b></span><br />
                <span>Vắng ngủ: <b>{stat.absent_sleep ?? 0}</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h3 className="section-subtitle">Thông tin chi tiết theo khối</h3>
        <div className="grade-container">
          {stat.khoi ? (
            Object.entries(stat.khoi).map(([khoi, info]) => <GradeCard key={khoi} khoi={khoi} info={info} />)
          ) : (
            <p style={{ color: '#94a3b8', padding: 20 }}>Chưa có dữ liệu điểm danh hôm nay.</p>
          )}
        </div>
      </div>

      <div className="content-header" style={{ marginTop: '4px' }}>
        <h2 className="page-title">Thông tin chung học sinh bán trú</h2>
        {data?.nam_hoc && <span className="today-badge"><i className="fas fa-calendar-alt"></i> Năm học: {data.nam_hoc}</span>}
      </div>
      <div className="general-container">
        <div className="main-total-card">
          <div className="total-info">
            <i className="fas fa-school main-icon"></i>
            <div><p>Tổng số học sinh bán trú</p><h1>{stat.total ?? 0}</h1></div>
          </div>
          <div className="total-gender-split">
            <div className="gender-box male-bg"><i className="fas fa-mars"></i> Nam <span>{stat.male ?? 0}</span></div>
            <div className="gender-box female-bg"><i className="fas fa-venus"></i> Nữ <span>{stat.female ?? 0}</span></div>
          </div>
        </div>
        <div className="grade-info-grid">
          {stat.khoi && Object.entries(stat.khoi).map(([khoi_name, g_info]) => (
            <div className="grade-stat-card" key={khoi_name}>
              <div className="grade-stat-header">KHỐI {khoi_name}</div>
              <div className="grade-total-num"><small>Tổng ĐK:</small><span>{g_info.total ?? 0}</span></div>
              <div className="grade-gender-info">
                <div className="m-count"><i className="fas fa-mars"></i> Nam <b>{g_info.male ?? 0}</b></div>
                <div className="f-count"><i className="fas fa-venus"></i> Nữ <b>{g_info.female ?? 0}</b></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
