import axios from 'axios';

// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:4000');

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // gửi session cookie (song song)
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: Tự động đính kèm Token ──────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('qlbt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor ─────────────────────────────────────────────────────
// Chỉ redirect khi 401 xảy ra ở các API call thực (không phải /api/auth/me)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;
    const is401 = status === 401;

    // Log lỗi API nếu có
    if (is401) {
      console.warn(`[API AUTH] 401 Unauthorized: ${error.config?.method?.toUpperCase()} ${url}`);
    }

    // Không redirect vòng lặp từ /api/auth/me – AuthContext tự xử lý
    if (is401 && !url.includes('/api/auth/me') && !window.location.pathname.includes('/login')) {
      console.error(`[API] 401 detected on ${url} → redirecting to /login`);
      localStorage.removeItem('qlbt_token');
      const basePath = import.meta.env.BASE_URL || '/';
      window.location.href = `${basePath}login`.replace('//', '/');
    }
    return Promise.reject(error);
  }
);

export default api;

