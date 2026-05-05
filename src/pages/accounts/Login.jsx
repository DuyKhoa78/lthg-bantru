import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './Login.css';

const FEATURES = [
  { icon: 'fas fa-utensils',    color: 'pill-red',    label: 'Điểm danh\năn trưa' },
  { icon: 'fas fa-bed',         color: 'pill-blue',   label: 'Điểm danh\nngủ trưa' },
  { icon: 'fas fa-calendar-alt',color: 'pill-yellow', label: 'Lịch trực\ngiáo viên' },
  { icon: 'fas fa-chart-bar',   color: 'pill-green',  label: 'Báo cáo &\nthống kê' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin.');
      triggerShake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password, remember);
      if (remember) {
        localStorage.setItem('qlbt_remember', btoa(JSON.stringify({ u: username, p: password })));
      } else {
        localStorage.removeItem('qlbt_remember');
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  return (
    <div className="login-wrapper">
      {/* ══ LEFT PANEL ══ */}
      <div className="left-panel">
        <div className="deco-circle deco-1"></div>
        <div className="deco-circle deco-2"></div>
        <div className="deco-circle deco-3"></div>

        <div className="school-logo-wrap">
          <img src="/logo.png" alt="Logo THPT Lê Thị Hồng Gấm" className="school-logo" />
          <div className="school-name">THPT LÊ THỊ HỒNG GẤM</div>
          <div className="school-sub">Phân hiệu tại TP. Hồ Chí Minh</div>
        </div>

        <div className="panel-divider"></div>

        <h2 className="sys-title">Hệ thống<br /><span>Quản lý Bán trú</span></h2>
        <p className="sys-desc">
          Quản lý điểm danh ăn &amp; ngủ, lịch trực giáo viên,
          báo cáo thống kê — mọi thứ trong tầm tay bạn.
        </p>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div className="feature-pill" key={i}>
              <div className={`pill-icon ${f.color}`}>
                <i className={f.icon}></i>
              </div>
              <span>{f.label.split('\n').map((t, j) => (
                <span key={j}>{t}{j === 0 && <br />}</span>
              ))}</span>
            </div>
          ))}
        </div>

        <div className="panel-footer">
          &copy; 2026 &ndash; Thiết kế bởi <strong>Duy Khoa</strong>
        </div>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="right-panel">
        <div className="login-card">
          {/* Card Header */}
          <div className="card-header">
            <div className="logo-mini">
              <img src="/logo.png" alt="Logo" />
            </div>
            <h2 className="card-title">Đăng nhập</h2>
            <p className="card-subtitle">Nhập thông tin tài khoản để tiếp tục</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert-box alert-error" id="login-error">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div className="form-group">
              <label className="form-label" htmlFor="id_username">
                <i className="fas fa-user"></i> Tên đăng nhập
              </label>
              <div className="input-wrap">
                <input
                  type="text"
                  id="id_username"
                  className={`form-input${shake ? ' shake' : ''}`}
                  placeholder="Nhập tên đăng nhập..."
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <span className="input-icon">
                  <i className="fas fa-user-circle"></i>
                </span>
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="id_password">
                <i className="fas fa-lock"></i> Mật khẩu
              </label>
              <div className="input-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  id="id_password"
                  className={`form-input${shake ? ' shake' : ''}`}
                  placeholder="Nhập mật khẩu..."
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="input-icon input-btn-icon"
                  id="togglePassword"
                  title="Hiện/ẩn mật khẩu"
                  onClick={() => setShowPw((v) => !v)}
                >
                  <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* Options Row */}
            <div className="options-row">
              <label className="checkbox-label" htmlFor="id_remember">
                <input
                  type="checkbox"
                  id="id_remember"
                  className="checkbox-input"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="checkbox-box"></span>
                <span>Ghi nhớ đăng nhập</span>
              </label>
              <a href="#" className="forgot-link">Quên mật khẩu?</a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-login"
              id="btn-login"
              disabled={loading}
            >
              {loading ? (
                <span className="btn-loading">
                  <i className="fas fa-circle-notch fa-spin"></i> Đang xử lý...
                </span>
              ) : (
                <span className="btn-text">
                  <i className="fas fa-sign-in-alt"></i> Đăng nhập
                </span>
              )}
            </button>
          </form>



          <div className="card-footer">
            <i className="fas fa-shield-alt"></i>
            Kết nối bảo mật – Dữ liệu được mã hoá
          </div>

          <div className="color-dots">
            <div className="dot dot-red" title="Màu đỏ"></div>
            <div className="dot dot-blue" title="Màu xanh"></div>
            <div className="dot dot-yellow" title="Màu vàng"></div>
            <div className="dot dot-green" title="Màu xanh lục"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
