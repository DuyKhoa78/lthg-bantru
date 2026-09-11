import { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Footer from './Footer';

const MOBILE_BP = 768;

export default function MainLayout() {
  const { systemStatus } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BP);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth <= MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const toggle = () => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className={`sidebar-backdrop${mobileOpen ? ' visible' : ''}`}
          onClick={closeMobile}
        />
      )}

      <Sidebar
        collapsed={!isMobile && collapsed}
        mobileOpen={isMobile && mobileOpen}
        onToggle={toggle}
      />
      <Navbar
        collapsed={!isMobile && collapsed}
        onToggle={toggle}
      />
      <main
        className={`main-content${!isMobile && collapsed ? ' sidebar-collapsed' : ''}`}
        id="mainContent"
      >
        {/* Banner cảnh báo Admin khi đang bật Chế độ bảo trì */}
        {systemStatus?.bao_tri && (
          <div style={{
            background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '10px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
            fontWeight: 500,
            fontSize: '0.88rem',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.25rem', color: '#fef08a' }}></i>
              <span>
                <strong style={{ color: '#fef08a' }}>CHẾ ĐỘ BẢO TRÌ ĐANG BẬT:</strong> Hệ thống đang bảo trì — Hiện chỉ có Super Admin mới có quyền truy cập.
              </span>
            </div>
            <Link to="/cau-hinh" style={{
              background: '#ffffff',
              color: '#b45309',
              padding: '5px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.82rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            }}>
              <i className="fas fa-sliders-h"></i> Cấu hình / Tắt bảo trì
            </Link>
          </div>
        )}

        <div className="card-wrap">
          <Outlet />
        </div>
      </main>
      <Footer collapsed={!isMobile && collapsed} />
    </div>
  );
}
