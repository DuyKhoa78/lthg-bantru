import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function Maintenance({ status, onRetry }) {
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
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '40px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        textAlign: 'center',
        zIndex: 1,
      }}>
        {/* Animated Badge & Icon */}
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
          marginBottom: '28px',
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

        {/* Big Icon */}
        <div style={{
          position: 'relative',
          width: '96px',
          height: '96px',
          margin: '0 auto 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(245, 158, 11, 0.2))',
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.15)',
        }}>
          <i className="fas fa-tools" style={{
            fontSize: '2.5rem',
            color: '#38bdf8',
            filter: 'drop-shadow(0 4px 10px rgba(56, 189, 248, 0.4))',
          }}></i>
        </div>

        {/* School Name & Title */}
        <div style={{
          fontSize: '0.9rem',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          color: '#94a3b8',
          fontWeight: 600,
          marginBottom: '6px',
        }}>
          {systemInfo?.ten_truong || 'TRƯỜNG THPT LÊ THỊ HỒNG GẤM'}
        </div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          lineHeight: 1.3,
          color: '#ffffff',
          marginBottom: '16px',
          letterSpacing: '-0.5px',
        }}>
          Hệ Thống Đang Được Bảo Trì
        </h1>

        {/* Message description */}
        <p style={{
          fontSize: '1rem',
          lineHeight: 1.6,
          color: '#cbd5e1',
          marginBottom: '24px',
          padding: '0 8px',
        }}>
          {systemInfo?.thong_bao || 'Chúng tôi đang tiến hành cập nhật và tối ưu hóa hệ thống để nâng cao trải nghiệm quản lý bán trú. Xin lỗi quý Thầy Cô và Học sinh vì sự bất tiện này.'}
        </p>

        {/* Estimated Time Box */}
        {systemInfo?.thoi_gian && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.95rem',
            color: '#e2e8f0',
          }}>
            <i className="far fa-clock" style={{ color: '#f59e0b', fontSize: '1.1rem' }}></i>
            <span>Thời gian dự kiến: <strong style={{ color: '#fbbf24' }}>{systemInfo.thoi_gian}</strong></span>
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <button
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
            {checking ? 'Đang kiểm tra hệ thống...' : 'Kiểm tra trạng thái & Tải lại'}
          </button>

          {/* Admin link */}
          <Link
            to="/login"
            style={{
              fontSize: '0.85rem',
              color: '#94a3b8',
              textDecoration: 'none',
              marginTop: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
            onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <i className="fas fa-user-shield"></i>
            Dành cho Quản trị viên (Đăng nhập quản lý)
          </Link>
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
