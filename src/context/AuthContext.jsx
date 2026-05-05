import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Kiểm tra session hiện tại khi load app
  useEffect(() => {
    api.get('/api/auth/me')
      .then((res) => {
        if (res.data?.ok) setUser(res.data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password, remember = false) => {
    const res = await api.post('/auth-proxy/login/', { username, password, remember });
    if (res.data?.ok) {
      setUser(res.data.user);
      return res.data.user;
    }
    throw new Error(res.data?.error || 'Đăng nhập thất bại');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth-proxy/logout/');
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
