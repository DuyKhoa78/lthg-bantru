import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

export default function Maintenance({ status, onRetry }) {
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [systemInfo, setSystemInfo] = useState(status || {
    bao_tri: true,
    thong_bao: 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ. Quý Thầy Cô và Học sinh vui lòng quay lại sau ít phút!',
    thoi_gian: 'Dự kiến hoàn tất trong 15-30 phút',
    ten_truong: 'LÊ THỊ HỒNG GẤM',
    nam_hoc: '2026-2027',
  });

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await api.get('/api/public/system-status/');
      if (res.data?.ok) {
        setSystemInfo(res.data);
        if (!res.data.bao_tri) {
          if (onRetry) onRetry();
          else window.location.reload();
          return;
        }
      }
    } catch {
      // Giữ nguyên trạng thái bảo trì nếu lỗi
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  }, [onRetry]);

  useEffect(() => {
    // Tự động kiểm tra trạng thái mỗi 30 giây
    const timer = setInterval(checkStatus, 30000);
    return () => clearInterval(timer);
  }, [checkStatus]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: '#f8fafc',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decoration elements */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-5%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.12) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }}></div>

      {/* Main card */}
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        padding: '36px 28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        textAlign: 'center',
        zIndex: 1,
      }}>
        {/* Animated Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '9999px',
          color: '#fbbf24',
          fontSize: '0.85rem',
          fontWeight: 600,
          marginBottom: '20px',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#f59e0b',
            display: 'inline-block',
            boxShadow: '0 0 10px #f59e0b',
          }}></span>
          CHẾ ĐỘ BẢO TRÌ NÂNG CẤP
        </div>

        {/* Hero Maintenance Image from /public/bao-tri.jpg */}
        <div style={{
          maxWidth: '380px',
          width: '100%',
          margin: '0 auto 20px',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 12px 30px -6px rgba(0, 0, 0, 0.45)',
          background: '#ffffff',
          padding: '12px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px solid rgba(255, 255, 255, 0.15)'
        }}>
          <img
            src="/bao-tri.jpg"
            alt="Hệ thống đang bảo trì"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: '220px',
              objectFit: 'contain',
              display: 'block',
              borderRadius: '8px',
            }}
          />
        </div>

        {/* School Name & Title */}
        <div style={{
          fontSize: '0.88rem',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          color: '#94a3b8',
          fontWeight: 600,
          marginBottom: '8px',
        }}>
          {systemInfo?.ten_truong || 'TRƯỜNG THPT LÊ THỊ HỒNG GẤM'}
        </div>
        <h1 style={{
          fontSize: '1.65rem',
          fontWeight: 800,
          lineHeight: 1.35,
          color: '#ffffff',
          marginBottom: '14px',
          letterSpacing: '-0.5px',
        }}>
          Hệ thống đang bảo trì vui lòng quay lại sau.
        </h1>

        {/* Message description */}
        <p style={{
          fontSize: '0.96rem',
          lineHeight: 1.6,
          color: '#cbd5e1',
          marginBottom: '22px',
          padding: '0 8px',
        }}>
          {systemInfo?.thong_bao || 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ để nâng cao trải nghiệm dịch vụ. Quý Thầy Cô và Học sinh vui lòng quay lại sau!'}
        </p>

        {/* Estimated Time Box */}
        {systemInfo?.thoi_gian && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.92rem',
            color: '#e2e8f0',
          }}>
            <i className="far fa-clock" style={{ color: '#f59e0b', fontSize: '1.1rem' }}></i>
            <span>Thời gian dự kiến: <strong style={{ color: '#fbbf24' }}>{systemInfo.thoi_gian}</strong></span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={checkStatus}
            disabled={checking}
            style={{
              width: '100%',
              maxWidth: '320px',
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: checking ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.5)',
              transition: 'all 0.2s ease',
              opacity: checking ? 0.7 : 1,
            }}
          >
            <i className={`fas fa-sync-alt ${checking ? 'fa-spin' : ''}`}></i>
            {checking ? 'Đang kiểm tra hệ thống...' : 'Tải lại trang web'}
          </button>

          {/* If user is logged in as non-superadmin */}
          {user ? (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '0.84rem',
              color: '#fca5a5',
              marginTop: '12px',
              textAlign: 'center',
              lineHeight: 1.5,
              width: '100%',
              maxWidth: '380px'
            }}>
              <i className="fas fa-lock" style={{ marginRight: 6, color: '#f87171' }}></i>
              Tài khoản <strong>{user.username}</strong> ({user.fullname || user.role}) không có quyền truy cập khi đang bảo trì.<br />
              Chỉ <strong>Super Admin</strong> mới có thể truy cập lúc này.
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    background: 'transparent',
                    border: '1px solid #f87171',
                    color: '#fca5a5',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  <i className="fas fa-sign-out-alt"></i> Đăng xuất tài khoản
                </button>
              </div>
            </div>
          ) : (
            /* Super Admin login link */
            <Link
              to="/login"
              style={{
                fontSize: '0.85rem',
                color: '#94a3b8',
                textDecoration: 'none',
                marginTop: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
              onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              <i className="fas fa-user-shield"></i>
              Dành cho Super Admin (Đăng nhập quản trị)
            </Link>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '28px',
        fontSize: '0.8rem',
        color: '#64748b',
        textAlign: 'center',
        zIndex: 1,
      }}>
        Bộ phận Quản lý Bán trú • Năm học {systemInfo?.nam_hoc || '2026-2027'}
      </div>
    </div>
  );
}
