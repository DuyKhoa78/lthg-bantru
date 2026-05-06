/**
 * cache.js — Tiện ích cache bằng sessionStorage với TTL
 * Dùng cho dữ liệu ít thay đổi: danh sách phòng, cấu hình hệ thống...
 */

const DEFAULT_TTL = 30 * 60 * 1000; // 30 phút

export function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (expiry && Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }));
  } catch {
    // sessionStorage đầy hoặc private mode — bỏ qua
  }
}

export function cacheDelete(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

export function cacheDeleteAll() {
  try {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith('app_cache_'));
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

/**
 * cachedFetch — Gọi API có cache
 * @param {string} cacheKey  - Tên key trong sessionStorage
 * @param {Function} fetchFn - Hàm async trả về data (không cần try/catch)
 * @param {number} ttl       - Thời gian cache tính bằng ms (mặc định 30 phút)
 */
export async function cachedFetch(cacheKey, fetchFn, ttl = DEFAULT_TTL) {
  const hit = cacheGet(cacheKey);
  if (hit !== null) return { data: hit, fromCache: true };

  const data = await fetchFn();
  cacheSet(cacheKey, data, ttl);
  return { data, fromCache: false };
}
