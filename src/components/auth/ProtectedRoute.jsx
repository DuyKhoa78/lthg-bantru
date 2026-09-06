import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Maintenance from '../../pages/core/Maintenance';

export default function ProtectedRoute({ children }) {
  const { user, loading, systemStatus, refreshSystemStatus } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f0f4f9',
        fontFamily: "'Be Vietnam Pro', sans-serif", color: '#64748b',
        flexDirection: 'column', gap: '16px'
      }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#009CFF' }}></i>
        <span>Đang tải...</span>
      </div>
    );
  }

  // Khi hệ thống bật bảo trì: Chặn mọi người dùng, ngoại trừ Quản trị viên (Admin / Superuser)
  const isAdmin = user && (user.is_superuser || user.is_admin || user.role === 'admin');
  if (systemStatus?.bao_tri && !isAdmin) {
    return <Maintenance status={systemStatus} onRetry={refreshSystemStatus} />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
