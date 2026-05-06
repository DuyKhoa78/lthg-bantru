import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const menuItems = [
  // ─── Tất cả roles ───
  { to: '/', icon: 'fas fa-th-large', label: 'Dashboard', roles: 'all' },

  // ─── Điểm danh ───
  { label: 'ĐIỂM DANH', type: 'label', permission: 'can_diem_danh' },
  { to: '/diemdanh-an',  icon: 'fas fa-utensils', label: 'Điểm danh ăn',  permission: 'can_diem_danh' },
  { to: '/diemdanh-ngu', icon: 'fas fa-bed',      label: 'Điểm danh ngủ', permission: 'can_diem_danh' },

  // ─── Lịch trực & Báo cáo ───
  { label: 'LỊCH TRỰC & BÁO CÁO', type: 'label', roles: 'authenticated' },
  { to: '/lich-truc', icon: 'fas fa-calendar-alt', label: 'Lịch trực GV',         roles: 'authenticated' },
  { to: '/bao-cao',   icon: 'fas fa-chart-bar',    label: 'Thống kê & Báo cáo',   roles: 'authenticated' },

  // ─── Quản lý danh mục (Admin + Quản lý + Kế toán xem) ───
  { label: 'QUẢN LÝ DANH MỤC', type: 'label', permission: 'can_quan_ly_danh_muc' },
  { to: '/lich-truc-admin', icon: 'fas fa-calendar-check', label: 'Phân công theo Ngày',  permission: 'can_quan_ly_danh_muc' },
  { to: '/lich-truc-khung', icon: 'fas fa-th',             label: 'Lịch trực Cố định',    permission: 'can_quan_ly_danh_muc' },
  { to: '/cau-hinh',        icon: 'fas fa-sliders-h',      label: 'Thiết lập',             permission: 'can_quan_ly_danh_muc' },
  { to: '/vat-dung',        icon: 'fas fa-boxes',          label: 'Vật dụng',              permission: 'can_quan_ly_danh_muc' },

  // ─── Quản trị (Admin only) ───
  { label: 'QUẢN TRỊ', type: 'label', permission: 'can_quan_tri' },
  { to: '/phong',     icon: 'fas fa-door-open',         label: 'Quản lý phòng',     permission: 'can_quan_tri' },
  { to: '/hoc-sinh',  icon: 'fas fa-user-graduate',     label: 'Quản lý học sinh',  permission: 'can_quan_tri' },
  { to: '/giao-vien', icon: 'fas fa-chalkboard-teacher',label: 'Quản lý giáo viên', permission: 'can_quan_tri' },
  { to: '/tai-khoan', icon: 'fas fa-users-cog',         label: 'Quản lý tài khoản', permission: 'can_quan_tri' },

  // ─── Xem dữ liệu (Quản lý – read only) ───
  { label: 'XEM DỮ LIỆU', type: 'label', onlyQuanLy: true },
  { to: '/phong',     icon: 'fas fa-door-open',         label: 'Danh sách phòng',   onlyQuanLy: true },
  { to: '/hoc-sinh',  icon: 'fas fa-user-graduate',     label: 'Danh sách học sinh',onlyQuanLy: true },
  { to: '/giao-vien', icon: 'fas fa-chalkboard-teacher',label: 'Danh sách giáo viên',onlyQuanLy: true },
];

export default function Sidebar({ collapsed, mobileOpen }) {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (to) => location.pathname === to;

  const canShow = (item) => {
    if (!user) return false;
    if (item.roles === 'all') return true;
    if (item.roles === 'authenticated') return true;
    if (item.permission && user[item.permission]) return true;
    if (item.onlyQuanLy && user.is_quan_ly && !user.can_quan_tri) return true;
    return false;
  };

  const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullname || 'U')}&background=009CFF&color=fff&rounded=true`;

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} id="sidebar">
      {/* Logo */}
      <Link to="/" className="sidebar-logo" style={{ textDecoration: 'none' }}>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo THPT Lê Thị Hồng Gấm" />
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">QL BÁN TRÚ</span>
          <span className="sidebar-logo-name">THPT Lê Thị Hồng Gấm</span>
        </div>
      </Link>

      {/* Menu */}
      <ul className="sidebar-menu">
        {menuItems.map((item, idx) => {
          if (!canShow(item)) return null;

          if (item.type === 'label') {
            return <li key={idx} className="menu-label">{item.label}</li>;
          }

          return (
            <li key={idx} className={isActive(item.to) ? 'active' : ''}>
              <Link to={item.to}>
                <i className={item.icon}></i>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Sidebar User */}
      {user && (
        <div className="sidebar-user">
          <div className="avatar-wrap">
            <img
              src={user.avatar_url || '/user.jpg'}
              alt="avatar"
              onError={(e) => { e.target.src = avatarFallback; }}
            />
            <span className="online-dot status-online"></span>
          </div>
          <div>
            <div className="sidebar-user-name">{user.fullname || user.username}</div>
            <div className="sidebar-user-role">{user.role_display}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
