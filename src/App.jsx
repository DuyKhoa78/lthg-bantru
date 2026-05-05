import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

// ── Nhóm 1 ──
import Login     from './pages/accounts/Login';
import Dashboard from './pages/core/Dashboard';

// ── Nhóm 2: Nghiệp vụ ──
import DiemDanhAn    from './pages/nghiepvu/DiemDanhAn';
import DiemDanhNgu   from './pages/nghiepvu/DiemDanhNgu';
import LichTruc      from './pages/nghiepvu/LichTruc';
import LichTrucAdmin from './pages/nghiepvu/LichTrucAdmin';
import LichTrucKhung from './pages/nghiepvu/LichTrucKhung';
import BaoCao        from './pages/nghiepvu/BaoCao';

// ── Nhóm 3: Quản lý ──
import GiaoVien from './pages/quanli/GiaoVien';
import HocSinh  from './pages/quanli/HocSinh';
import Phong    from './pages/quanli/Phong';
import VatDung  from './pages/quanli/VatDung';
import CauHinh  from './pages/quanli/CauHinh';

// ── Nhóm 4: Tài khoản ──
import Profile   from './pages/accounts/Profile';
import TaiKhoan from './pages/quanli/TaiKhoan';

// ── Placeholder cho các trang chưa làm ──
const Placeholder = ({ name }) => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
    <i className="fas fa-tools" style={{ fontSize: '3rem', color: '#009CFF', marginBottom: '16px', display: 'block' }}></i>
    <h2 style={{ fontWeight: 800, color: '#1a202c', marginBottom: '8px' }}>{name}</h2>
    <p>Trang này đang được phát triển.</p>
  </div>
);

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}
