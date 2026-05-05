import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Navbar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Idle detection
  useEffect(() => {
    const IDLE_MS = 5 * 60 * 1000;
    let idleTimer;
    const dots = document.querySelectorAll('.online-dot');

    const setStatus = (cls) => {
      dots.forEach((d) => {
        d.classList.remove('status-online', 'status-idle', 'status-offline');
        d.classList.add(cls);
      });
    };
    const resetIdle = () => {
      setStatus('status-online');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setStatus('status-idle'), IDLE_MS);
    };

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((ev) =>
      document.addEventListener(ev, resetIdle, { passive: true })
    );
    resetIdle();
    return () => {
      clearTimeout(idleTimer);
      ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((ev) =>
        document.removeEventListener(ev, resetIdle)
      );
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullname || 'U')}&background=009CFF&color=fff&rounded=true`;

  return (
    <header className={`navbar${collapsed ? ' sidebar-collapsed' : ''}`} id="navbar">
      <div className="nav-left">
        <button className="menu-btn" onClick={onToggle} title="Toggle menu">
          <i className="fas fa-bars"></i>
        </button>
        <input
          type="text"
          className="global-search"
          placeholder="Tìm kiếm..."
          autoComplete="off"
        />
      </div>

      <div className="marquee-wrap">
        <span className="marquee-text">
          🏫 Chào mừng bạn đến với Hệ thống Quản lý Bán trú — Trường THPT Lê Thị Hồng Gấm · Phân hiệu TP. Hồ Chí Minh · Năm học 2025–2026 🎓
        </span>
      </div>

      {/* Profile Dropdown */}
      <div
        className={`profile-dropdown${dropdownOpen ? ' open' : ''}`}
        ref={dropdownRef}
      >
        <button
          className="dropdown-trigger"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <div className="avatar-wrap">
            <img
              src={user?.avatar || '/user.jpg'}
              alt="User"
              onError={(e) => { e.target.src = avatarFallback; }}
            />
            <span className="online-dot status-online"></span>
          </div>
          <span className="dropdown-username">
            {user?.fullname || user?.username || 'Demo'}
          </span>
          <i className="fas fa-chevron-down dropdown-arrow"></i>
        </button>

        <div className="dropdown-menu">
          <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
            <i className="far fa-user-circle"></i> Hồ sơ cá nhân
          </Link>
          <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
            <i className="fas fa-cog"></i> Đổi mật khẩu
          </Link>
          <div className="dropdown-divider"></div>
          <button className="dropdown-item logout" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt"></i> Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
