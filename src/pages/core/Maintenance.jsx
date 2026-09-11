import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

export default function Maintenance({ status, onRetry }) {
  const { user, login, logout, refreshSystemStatus } = useAuth();
  const [checking, setChecking] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState('');
  const [turningOff, setTurningOff] = useState(false);

  const isSuperAdmin = Boolean(user && (user.is_superuser === true || user.role === 'super_admin'));

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
          if (refreshSystemStatus) await refreshSystemStatus();
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
  }, [onRetry, refreshSystemStatus]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setAdminLoginError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setAdminLoginLoading(true);
    setAdminLoginError('');
    try {
      const loggedUser = await login(adminUsername.trim(), adminPassword.trim());
      const isSuper = Boolean(loggedUser?.is_superuser === true || loggedUser?.role === 'super_admin');
      if (!isSuper) {
        await logout();
        setAdminLoginError('Tài khoản này không phải Super Admin. Chỉ Super Admin mới có quyền truy cập khi đang bảo trì.');
      } else {
        if (refreshSystemStatus) await refreshSystemStatus();
        if (onRetry) onRetry();
        else window.location.reload();
      }
    } catch (err) {
      setAdminLoginError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleQuickTurnOff = async () => {
    setTurningOff(true);
    try {
      await api.post('/api/hethong/save/', {
        bao_tri: false,
      });
      if (refreshSystemStatus) await refreshSystemStatus();
      if (onRetry) onRetry();
      else window.location.reload();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi tắt bảo trì');
    } finally {
      setTurningOff(false);
    }
  };

  useEffect(() => {
    // Tự động kiểm tra trạng thái mỗi 20 giây
    const timer = setInterval(checkStatus, 20000);
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
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.12) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-5%',
        width: '450px',
        height: '450px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }}></div>

      {/* Main Container Card */}
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '36px 28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
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
          maxWidth: '420px',
          width: '100%',
          margin: '0 auto 20px',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 14px 34px -6px rgba(0, 0, 0, 0.5)',
          background: '#ffffff',
          padding: '12px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px solid rgba(255, 255, 255, 0.2)'
        }}>
          <img
            src={`${import.meta.env.BASE_URL}bao-tri.jpg`}
            onError={(e) => { e.currentTarget.src = '/bao-tri.jpg'; }}
            alt="Hệ thống đang bảo trì"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: '260px',
              objectFit: 'contain',
              display: 'block',
              borderRadius: '10px',
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
          letterSpacing: '-0.5px'
        }}>
          Hệ thống đang bảo trì vui lòng quay lại sau.
        </h1>

        {/* Announcement Text */}
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
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái'}
          </button>

          {/* 1. Nếu đã đăng nhập và LÀ Super Admin */}
          {isSuperAdmin ? (
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              padding: '14px 18px',
              color: '#fef08a',
              marginTop: '16px',
              textAlign: 'center',
              width: '100%',
              maxWidth: '440px',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.94rem', marginBottom: '6px' }}>
                👑 Super Admin: <strong>{user.fullname || user.username}</strong>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#fde68a', marginBottom: '14px' }}>
                Chế độ bảo trì đang bật. Bạn có quyền vào hệ thống quản trị hoặc tắt bảo trì ngay.
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link
                  to="/"
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
                  }}
                >
                  <i className="fas fa-desktop"></i> Vào Hệ thống Quản trị
                </Link>
                <button
                  type="button"
                  onClick={handleQuickTurnOff}
                  disabled={turningOff}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)',
                  }}
                >
                  <i className="fas fa-check-circle"></i> {turningOff ? 'Đang tắt...' : 'Tắt bảo trì ngay'}
                </button>
              </div>
            </div>
          ) : user ? (
            /* 2. Nếu đã đăng nhập nhưng KHÔNG PHẢI Super Admin (ví dụ admin thường, giáo viên) */
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '0.85rem',
              color: '#fca5a5',
              marginTop: '12px',
              textAlign: 'center',
              lineHeight: 1.5,
              width: '100%',
              maxWidth: '380px'
            }}>
              <i className="fas fa-lock" style={{ marginRight: 6, color: '#f87171' }}></i>
              Tài khoản <strong>{user.username}</strong> ({user.fullname || user.role_display || user.role}) không có quyền truy cập khi đang bảo trì.<br />
              Chỉ <strong>Super Admin</strong> mới có thể truy cập lúc này.
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    background: 'transparent',
                    border: '1px solid #f87171',
                    color: '#fca5a5',
                    borderRadius: '6px',
                    padding: '5px 14px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  <i className="fas fa-sign-out-alt"></i> Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            /* 3. Nếu chưa đăng nhập (khách, người dùng ngoài): Có form ẩn cho Super Admin đăng nhập */
            !showAdminLogin ? (
              <button
                type="button"
                onClick={() => setShowAdminLogin(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  marginTop: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'underline',
                }}
              >
                <i className="fas fa-user-shield"></i> Dành cho Super Admin (Đăng nhập quản trị)
              </button>
            ) : (
              <form
                onSubmit={handleAdminLogin}
                style={{
                  marginTop: '16px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  width: '100%',
                  maxWidth: '340px',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e2e8f0', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><i className="fas fa-key" style={{ color: '#f59e0b', marginRight: 6 }}></i> Đăng nhập Super Admin</span>
                  <button
                    type="button"
                    onClick={() => { setShowAdminLogin(false); setAdminLoginError(''); }}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
                {adminLoginError && (
                  <div style={{ background: '#7f1d1d', color: '#fecaca', fontSize: '0.78rem', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px' }}>
                    {adminLoginError}
                  </div>
                )}
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="Tên đăng nhập Super Admin"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#ffffff',
                      fontSize: '0.86rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Mật khẩu"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#ffffff',
                      fontSize: '0.86rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={adminLoginLoading}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#d97706',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: adminLoginLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {adminLoginLoading ? 'Đang xác thực...' : 'Đăng nhập Quản trị'}
                </button>
              </form>
            )
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
