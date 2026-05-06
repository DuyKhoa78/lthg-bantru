import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

// ── Tải ngay (trang dùng thường xuyên) ──
import Login        from './pages/accounts/Login';
import Dashboard    from './pages/core/Dashboard';
import DiemDanhAn   from './pages/nghiepvu/DiemDanhAn';
import DiemDanhNgu  from './pages/nghiepvu/DiemDanhNgu';
import LichTruc     from './pages/nghiepvu/LichTruc';

// ── Lazy load (trang ít dùng hơn, tải khi cần) ──
const LichTrucAdmin = lazy(() => import('./pages/nghiepvu/LichTrucAdmin'));
const LichTrucKhung = lazy(() => import('./pages/nghiepvu/LichTrucKhung'));
const BaoCao        = lazy(() => import('./pages/nghiepvu/BaoCao'));
const GiaoVien      = lazy(() => import('./pages/quanli/GiaoVien'));
const HocSinh       = lazy(() => import('./pages/quanli/HocSinh'));
const Phong         = lazy(() => import('./pages/quanli/Phong'));
const VatDung       = lazy(() => import('./pages/quanli/VatDung'));
const CauHinh       = lazy(() => import('./pages/quanli/CauHinh'));
const Profile       = lazy(() => import('./pages/accounts/Profile'));
const TaiKhoan      = lazy(() => import('./pages/quanli/TaiKhoan'));

const PageLoader = () => (
  <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#009CFF' }}></i>
  </div>
);


export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ─── Public ─── */}
            <Route path="/login" element={<Login />} />

            {/* ─── Protected ─── */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard */}
              <Route index element={<Dashboard />} />
              <Route path="/" element={<Dashboard />} />

              {/* Nghiệp vụ */}
              <Route path="/diemdanh-an"     element={<DiemDanhAn />} />
              <Route path="/diemdanh-ngu"    element={<DiemDanhNgu />} />
              <Route path="/lich-truc"       element={<LichTruc />} />
              <Route path="/lich-truc-admin" element={<LichTrucAdmin />} />
              <Route path="/lich-truc-khung" element={<LichTrucKhung />} />
              <Route path="/bao-cao"         element={<BaoCao />} />

              {/* Quản lý */}
              <Route path="/giao-vien" element={<GiaoVien />} />
              <Route path="/hoc-sinh"  element={<HocSinh />} />
              <Route path="/phong"     element={<Phong />} />
              <Route path="/vat-dung"  element={<VatDung />} />
              <Route path="/cau-hinh"  element={<CauHinh />} />

              {/* Tài khoản */}
              <Route path="/profile"   element={<Profile />} />
              <Route path="/tai-khoan" element={<TaiKhoan />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

