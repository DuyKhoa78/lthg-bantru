# 🎨 Front-end — Quản lý Bán trú THPT Lê Thị Hồng Gấm

Thư mục này chứa toàn bộ tài sản giao diện của dự án, được tổ chức lại để chuẩn bị chuyển sang **React**.

---

## 📁 Cấu trúc thư mục

```
Front-end/
├── public/
│   └── assets/
│       ├── img/          ← Ảnh tĩnh (logo, avatar...)
│       └── font/         ← Font chữ tùy chỉnh
├── src/
│   ├── pages/            ← HTML templates gốc (tham khảo khi viết React component)
│   │   ├── core/         ← Layout chính (base.html, index/dashboard)
│   │   ├── accounts/     ← Đăng nhập, profile, quản lý tài khoản
│   │   ├── nghiepvu/     ← Điểm danh, lịch trực, báo cáo
│   │   └── quanli/       ← Học sinh, giáo viên, phòng, vật dụng, cấu hình
│   ├── styles/           ← Toàn bộ CSS
│   │   ├── base.css      ← Layout & sidebar chung
│   │   ├── main.css      ← Styles tổng quan
│   │   ├── login.css     ← Trang đăng nhập
│   │   ├── dashboard.css ← Trang dashboard
│   │   ├── components.css← Modal, form, bảng dùng chung
│   │   ├── diemdanh.css  ← Màn hình điểm danh
│   │   ├── baocao.css    ← Báo cáo
│   │   └── admin.css     ← Trang admin
│   └── scripts/          ← Toàn bộ JavaScript
│       ├── base.js       ← Sidebar toggle, theme chung
│       ├── main.js       ← Khởi tạo chung
│       ├── components.js ← Modal & component dùng chung
│       ├── diemdanh.js   ← Logic điểm danh ăn/ngủ
│       ├── giaovien.js   ← CRUD giáo viên
│       ├── hocsinh.js    ← CRUD học sinh
│       ├── phong.js      ← CRUD phòng
│       ├── lichtruc.js   ← Xem lịch trực
│       ├── lichtruc_khung.js ← Lịch khung tuần
│       └── baocao.js     ← Báo cáo & export
└── api-reference/
    └── api_endpoints.md  ← Danh sách toàn bộ API endpoint của Django backend
```

---

## 🚀 Lộ trình chuyển sang React

### Bước 1 — Khởi tạo dự án React
```bash
# Tạo app Vite + React
npx create-vite@latest . --template react
npm install
```

### Bước 2 — Cài thư viện cần thiết
```bash
npm install axios react-router-dom
npm install @tanstack/react-query   # Quản lý API state
```

### Bước 3 — Tổ chức component
Dựa vào từng file trong `src/pages/`, tạo React component tương ứng:

| Template cũ | React Component |
|---|---|
| `core/base.html` | `src/layouts/MainLayout.jsx` |
| `accounts/login.html` | `src/pages/Login.jsx` |
| `accounts/profile.html` | `src/pages/Profile.jsx` |
| `nghiepvu/diemdanh_an.html` | `src/pages/DiemDanhAn.jsx` |
| `nghiepvu/diemdanh_ngu.html` | `src/pages/DiemDanhNgu.jsx` |
| `nghiepvu/lichtruc.html` | `src/pages/LichTruc.jsx` |
| `nghiepvu/baocao.html` | `src/pages/BaoCao.jsx` |
| `quanli/hocsinh.html` | `src/pages/HocSinh.jsx` |
| `quanli/giaovien.html` | `src/pages/GiaoVien.jsx` |
| `quanli/phong.html` | `src/pages/Phong.jsx` |
| `quanli/vatdung.html` | `src/pages/VatDung.jsx` |
| `quanli/cauhinh.html` | `src/pages/CauHinh.jsx` |
| `accounts/taikhoan.html` | `src/pages/TaiKhoan.jsx` |

### Bước 4 — Kết nối API
Xem `api-reference/api_endpoints.md` để biết toàn bộ endpoint cần gọi.
Dùng `axios` hoặc `fetch` kết hợp với CSRF token của Django.

---

## ⚙️ Django Backend
Backend Django vẫn đang chạy tại: `http://127.0.0.1:8000` (development)

Khi React gọi API, cần:
1. Cấu hình **CORS** trong Django (`django-cors-headers`)
2. Gửi **CSRF token** với mọi request POST/PUT/DELETE
3. Đảm bảo người dùng đã **đăng nhập** (session-based auth hoặc chuyển sang JWT)
