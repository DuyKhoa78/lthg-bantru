import axios from 'axios';

// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // gửi session cookie
  headers: { 'Content-Type': 'application/json' },
});

// ─── Response interceptor ─────────────────────────────────────────────────────
// Chỉ redirect khi 401 xảy ra ở các API call thực (không phải /api/auth/me)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;
    const is401 = status === 401;

    // DEBUG: log mọi lỗi API để tìm nguyên nhân bị out
    console.error(`[API ERROR] ${error.config?.method?.toUpperCase()} ${url} → ${status}`, error.response?.data);

    // Không redirect vòng lặp từ /api/auth/me – AuthContext tự xử lý
    if (is401 && !url.includes('/api/auth/me') && !window.location.pathname.includes('/login')) {
      console.error(`[API] 401 detected on ${url} → redirecting to /login`);
      const basePath = import.meta.env.BASE_URL || '/';
      window.location.href = `${basePath}login`.replace('//', '/');
    }
    return Promise.reject(error);
  }
);

export default api;
