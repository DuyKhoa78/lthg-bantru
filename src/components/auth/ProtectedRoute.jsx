import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
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

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
