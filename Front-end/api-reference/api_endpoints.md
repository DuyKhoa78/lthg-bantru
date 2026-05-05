# 📡 API Endpoints — Django Backend

**Base URL (Development):** `http://127.0.0.1:8000`  
**Base URL (Production):** `https://quanlybantru-lthg.edu.vn`

> ⚠️ Tất cả request POST/PUT/DELETE cần gửi kèm CSRF Token trong header:
> `X-CSRFToken: <token>`

---

## 🔐 Authentication (Xác thực)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/login/` | Đăng nhập |
| `POST` | `/logout/` | Đăng xuất |

---

## 👤 Tài khoản & Profile

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/taikhoan/` | Trang quản lý tài khoản (HTML) |
| `GET`  | `/api/taikhoan/` | Danh sách tài khoản (JSON) |
| `POST` | `/api/taikhoan/save/` | Tạo / cập nhật tài khoản |
| `POST` | `/api/taikhoan/delete/` | Xóa tài khoản |
| `POST` | `/api/taikhoan/reset-pw/` | Reset mật khẩu |
| `GET`  | `/profile/` | Trang cá nhân (HTML) |
| `POST` | `/api/profile/save/` | Lưu thông tin cá nhân |
| `POST` | `/api/profile/send-otp/` | Gửi OTP để xác minh email |
| `POST` | `/api/profile/verify-otp/` | Xác minh OTP |

---

## 🏫 Quản lý — Học sinh

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/hocsinh/` | Trang danh sách học sinh (HTML) |
| `GET`  | `/admin/hocsinh/them/` | Form thêm học sinh (HTML) |
| `GET`  | `/admin/hocsinh/<id>/sua/` | Form sửa học sinh (HTML) |
| `POST` | `/admin/hocsinh/<id>/xoa/` | Xóa học sinh |
| `POST` | `/api/hocsinh/save/` | Tạo / cập nhật học sinh (JSON) |
| `POST` | `/api/hocsinh/<id>/delete/` | Xóa học sinh (JSON) |
| `POST` | `/api/hocsinh/import/` | Import học sinh từ CSV |

---

## 👩‍🏫 Quản lý — Giáo viên

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/giaovien/` | Trang danh sách giáo viên (HTML) |
| `GET`  | `/admin/giaovien/them/` | Form thêm giáo viên (HTML) |
| `GET`  | `/admin/giaovien/<id>/sua/` | Form sửa giáo viên (HTML) |
| `POST` | `/admin/giaovien/<id>/xoa/` | Xóa giáo viên |
| `POST` | `/api/giaovien/save/` | Tạo / cập nhật giáo viên (JSON) |
| `POST` | `/api/giaovien/<id>/delete/` | Xóa giáo viên (JSON) |
| `POST` | `/api/giaovien/<id>/ranh/` | Lưu ngày rảnh của giáo viên |

---

## 🏠 Quản lý — Phòng

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/phong/` | Trang danh sách phòng (HTML) |
| `GET`  | `/admin/phong/them/` | Form thêm phòng (HTML) |
| `GET`  | `/admin/phong/<id>/sua/` | Form sửa phòng (HTML) |
| `POST` | `/api/phong/save/` | Tạo / cập nhật phòng (JSON) |
| `POST` | `/api/phong/delete/` | Xóa phòng (JSON) |

---

## 📦 Quản lý — Vật dụng

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/vatdung/` | Trang quản lý vật dụng (HTML) |
| `POST` | `/api/vatdung/mua/save/` | Lưu lần mua vật dụng |
| `POST` | `/api/vatdung/mua/delete/` | Xóa lần mua |
| `POST` | `/api/vatdung/phanbo/save/` | Lưu phân bổ vật dụng |
| `POST` | `/api/vatdung/phanbo/delete/` | Xóa phân bổ |

---

## ⚙️ Quản lý — Cấu hình & Hệ thống

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/admin/cauhinh/` | Trang cấu hình (HTML) |
| `POST` | `/api/cauhinh/save/` | Lưu cấu hình (năm học, người phụ trách) |
| `POST` | `/api/hethong/save/` | Lưu thông tin hệ thống |

---

## ✅ Nghiệp vụ — Điểm danh

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/diemdanh/an/` | Trang điểm danh ăn (HTML) |
| `GET`  | `/diemdanh/ngu/` | Trang điểm danh ngủ (HTML) |
| `GET`  | `/api/phong/<loai>/` | Danh sách phòng theo loại (`an`/`ngu`) |
| `GET`  | `/api/hocsinh/<loai>/` | Danh sách học sinh theo loại |
| `GET`  | `/api/diemdanh/` | Lấy dữ liệu điểm danh ngày |
| `POST` | `/api/diemdanh/save/` | Lưu điểm danh |

---

## 📅 Nghiệp vụ — Lịch trực

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/lichtruc/` | Trang xem lịch trực (giáo viên) |
| `GET`  | `/admin/lichtruc/` | Trang phân công trực (admin) |
| `POST` | `/admin/lichtruc/<id>/xoa/` | Xóa phân công |
| `GET`  | `/admin/lichtruc_khung/` | Trang lịch khung tuần |
| `POST` | `/api/lichtruc/save/` | Lưu phân công lịch trực |
| `POST` | `/api/lichtruc/delete/` | Xóa phân công lịch trực |
| `POST` | `/api/lichtruc_khung/auto/` | Tự động xếp lịch khung |
| `POST` | `/api/lichtruc_khung/save/` | Lưu lịch khung |
| `POST` | `/api/lichtruc_khung/apply/` | Áp dụng lịch khung |
| `POST` | `/api/lichtruc/apply-khung/` | Nạp từ lịch khung vào tuần |
| `GET`  | `/api/lichtruc/week/` | Lịch trực theo tuần (có auth) |
| `GET`  | `/api/lichtruc/week-public/` | Lịch trực theo tuần (công khai) |
| `GET`  | `/api/lichtruc/month/` | Lịch trực theo tháng |
| `GET`  | `/api/lichtruc/export/` | Xuất lịch ra Excel/PDF |

---

## 📊 Nghiệp vụ — Báo cáo

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/baocao/` | Trang báo cáo (HTML) |
| `GET`  | `/api/baocao/diemdanh/` | Dữ liệu báo cáo điểm danh (JSON) |
| `GET`  | `/api/baocao/full/` | Dữ liệu báo cáo đầy đủ (JSON) |

---

## 🌐 Trang chủ

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/` | Dashboard chính |
