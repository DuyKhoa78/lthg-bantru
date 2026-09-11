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
    thong_bao: 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ. Quý Thầy Cô vui lòng quay lại sau ít phút!',
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
      background: '#ffffff',
      fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: '#1e293b',
      padding: '32px 16px',
    }}>
      {/* Container Card */}
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '16px',
        padding: '28px 24px',
        textAlign: 'center',
      }}>
        {/* Hình ảnh bảo trì */}
        <div style={{
          maxWidth: '340px',
          width: '100%',
          margin: '0 auto 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <img
            src={`${import.meta.env.BASE_URL}bao-tri.jpg`}
            onError={(e) => { e.currentTarget.src = '/bao-tri.jpg'; }}
            alt="Hệ thống đang bảo trì"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: '220px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* Tên trường & Tiêu đề */}
        <div style={{
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#64748b',
          fontWeight: 700,
          marginBottom: '6px',
        }}>
          {systemInfo?.ten_truong || 'TRƯỜNG THPT LÊ THỊ HỒNG GẤM'}
        </div>
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          lineHeight: 1.35,
          color: '#0f172a',
          marginBottom: '12px',
        }}>
          Hệ thống đang bảo trì vui lòng quay lại sau.
        </h1>

        {/* Nội dung thông báo */}
        <p style={{
          fontSize: '0.98rem',
          lineHeight: 1.6,
          color: '#475569',
          marginBottom: '20px',
        }}>
          {systemInfo?.thong_bao || 'Hệ thống Quản lý Bán trú đang được bảo trì và nâng cấp định kỳ. Quý Thầy Cô vui lòng quay lại sau ít phút!'}
        </p>

        {/* Thời gian dự kiến (nếu có) */}
        {systemInfo?.thoi_gian && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 18px',
            marginBottom: '22px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            color: '#475569',
          }}>
            <i className="far fa-clock" style={{ color: '#d97706', fontSize: '1rem' }}></i>
            <span>Thời gian dự kiến: <strong style={{ color: '#b45309' }}>{systemInfo.thoi_gian}</strong></span>
          </div>
        )}

        {/* Nút bấm thao tác */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={checkStatus}
            disabled={checking}
            style={{
              width: '100%',
              maxWidth: '280px',
              padding: '11px 22px',
              borderRadius: '8px',
              border: 'none',
              background: '#009CFF',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: checking ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(0, 156, 255, 0.25)',
              transition: 'all 0.2s ease',
              opacity: checking ? 0.7 : 1,
            }}
          >
            <i className={`fas fa-sync-alt ${checking ? 'fa-spin' : ''}`}></i>
            {checking ? 'Đang kiểm tra...' : 'Tải lại trang'}
          </button>

          {/* 1. Nếu đã đăng nhập và LÀ Super Admin */}
          {isSuperAdmin ? (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '10px',
              padding: '14px 18px',
              color: '#166534',
              marginTop: '16px',
              textAlign: 'center',
              width: '100%',
              maxWidth: '440px',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px' }}>
                👑 Super Admin: <strong>{user.fullname || user.username}</strong>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#15803d', marginBottom: '12px' }}>
                Chế độ bảo trì đang bật. Bạn có quyền vào hệ thống hoặc tắt bảo trì ngay.
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link
                  to="/"
                  style={{
                    background: '#009CFF',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fas fa-desktop"></i> Vào Hệ thống
                </Link>
                <button
                  type="button"
                  onClick={handleQuickTurnOff}
                  disabled={turningOff}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fas fa-check-circle"></i> {turningOff ? 'Đang tắt...' : 'Tắt bảo trì ngay'}
                </button>
              </div>
            </div>
          ) : user ? (
            /* 2. Nếu đã đăng nhập nhưng KHÔNG PHẢI Super Admin */
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '0.85rem',
              color: '#991b1b',
              marginTop: '12px',
              textAlign: 'center',
              lineHeight: 1.5,
              width: '100%',
              maxWidth: '380px'
            }}>
              <i className="fas fa-lock" style={{ marginRight: 6, color: '#dc2626' }}></i>
              Tài khoản <strong>{user.username}</strong> ({user.fullname || user.role_display || user.role}) không có quyền truy cập khi đang bảo trì.<br />
              Chỉ <strong>Super Admin</strong> mới có thể truy cập lúc này.
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dc2626',
                    color: '#dc2626',
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
            /* 3. Nếu chưa đăng nhập: Nút ẩn kín đáo cho Super Admin */
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
                  marginTop: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'underline',
                }}
              >
                <i className="fas fa-user-shield"></i> Dành cho Super Admin (Đăng nhập)
              </button>
            ) : (
              <form
                onSubmit={handleAdminLogin}
                style={{
                  marginTop: '16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px 18px',
                  width: '100%',
                  maxWidth: '340px',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><i className="fas fa-key" style={{ color: '#d97706', marginRight: 6 }}></i> Đăng nhập Super Admin</span>
                  <button
                    type="button"
                    onClick={() => { setShowAdminLogin(false); setAdminLoginError(''); }}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
                {adminLoginError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.78rem', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px' }}>
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
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#1e293b',
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
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#1e293b',
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
                    borderRadius: '6px',
                    border: 'none',
                    background: '#009CFF',
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
        marginTop: '24px',
        fontSize: '0.82rem',
        color: '#94a3b8',
        textAlign: 'center',
      }}>
        Bộ phận Quản lý Bán trú • Năm học {systemInfo?.nam_hoc || '2026-2027'}
      </div>
    </div>
  );
}
