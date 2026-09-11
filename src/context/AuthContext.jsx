import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState({
    bao_tri: false,
    thong_bao: '',
    thoi_gian: '',
    ten_truong: '',
    nam_hoc: '',
  });

  const refreshSystemStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/public/system-status/');
      if (res.data?.ok) {
        setSystemStatus(res.data);
        return res.data;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // Kiểm tra phiên đăng nhập và trạng thái hệ thống khi load app
  useEffect(() => {
    Promise.allSettled([
      api.get('/api/auth/me'),
      api.get('/api/public/system-status/'),
    ])
      .then(([authRes, statusRes]) => {
        if (authRes.status === 'fulfilled' && authRes.value?.data?.ok) {
          setUser(authRes.value.data.user);
        } else {
          localStorage.removeItem('qlbt_token');
          setUser(null);
        }

        if (statusRes.status === 'fulfilled' && statusRes.value?.data?.ok) {
          setSystemStatus(statusRes.value.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Tự động kiểm tra trạng thái bảo trì định kỳ mỗi 15 giây
  useEffect(() => {
    const timer = setInterval(() => {
      refreshSystemStatus();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshSystemStatus]);

  const login = useCallback(async (username, password, remember = false) => {
    try {
      // Ưu tiên gọi /api/auth/login (có fallback sang /login/ nếu cần)
      let res;
      try {
        res = await api.post('/api/auth/login', { username, password, remember });
      } catch (err) {
        if (err.response?.status === 404) {
          res = await api.post('/login/', { username, password, remember });
        } else {
          throw err;
        }
      }

      if (res.data?.ok) {
        if (res.data.token) {
          localStorage.setItem('qlbt_token', res.data.token);
        }
        setUser(res.data.user);
        await refreshSystemStatus();
        return res.data.user;
      }
      throw new Error(res.data?.error || 'Đăng nhập thất bại');
    } catch (err) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error, { cause: err });
      }
      throw err;
    }
  }, [refreshSystemStatus]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      try {
        await api.post('/logout/');
      } catch { /* ignore */ }
    } finally {
      localStorage.removeItem('qlbt_token');
      try { sessionStorage.clear(); } catch { /* ignore */ }
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      systemStatus,
      setSystemStatus,
      refreshSystemStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

