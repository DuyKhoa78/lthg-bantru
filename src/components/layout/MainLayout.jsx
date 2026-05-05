import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Footer from './Footer';

const MOBILE_BP = 768;

export default function MainLayout() {
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
        <div className="card-wrap">
          <Outlet />
        </div>
      </main>
      <Footer collapsed={!isMobile && collapsed} />
    </div>
  );
}
