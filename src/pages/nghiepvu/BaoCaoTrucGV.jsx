import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert';
import api from '../../services/api';
import './BaoCaoTrucGV.css';

export default function BaoCaoTrucGV() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [ngay, setNgay] = useState(todayStr);
  const [caTruc, setCaTruc] = useState('all'); // 'all', '0', '1'
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    records: [],
    stats: { total: 0, caAnCount: 0, caNguCount: 0, totalVang: 0 },
    phongChuaBaoCaoAn: [],
    phongChuaBaoCaoNgu: [],
    ma_bao_mat_hien_tai: 'BT789',
  });

  const [showGuide, setShowGuide] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load danh sách báo cáo
  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url = `/api/baocaotruc/?ngay=${ngay}`;
      if (caTruc !== 'all') {
        url += `&ca_truc=${caTruc}`;
      }
      const res = await api.get(url);
      if (res.data?.ok) {
        setData(res.data);
      }
    } catch (err) {
      showAlert('Lỗi tải báo cáo: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setLoading(false);
    }
  }, [ngay, caTruc, showAlert]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadReports(); }, [loadReports]);

  // Xóa báo cáo (Admin/Quản lý)
  const handleDelete = async (id, phong, gv) => {
    if (!window.confirm(`Bạn có chắc muốn xóa bản ghi báo cáo của ${gv} (Phòng ${phong})?`)) return;
    try {
      const res = await api.post('/api/baocaotruc/delete/', { id });
      if (res.data?.ok) {
        showAlert('Đã xóa báo cáo thành công', 'success');
        loadReports(true);
      }
    } catch (err) {
      showAlert('Không thể xóa: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  // Format thời gian
  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Code mẫu Apps Script
  const sampleScript = `/**
 * GOOGLE APPS SCRIPT - BÁO CÁO CA TRỰC THPT LÊ THỊ HỒNG GẤM
 * Dán code này vào Google Form -> Trình chỉnh sửa tập lệnh (Apps Script)
 */
const WEBHOOK_URL = "${window.location.origin.includes('localhost') ? 'https://lthg-bantru.vercel.app' : window.location.origin}/api/webhook/google-form-baocao";
const WEBHOOK_SECRET = "bantru-lthg-secret-key-2025";

function onFormSubmit(e) {
  try {
    const itemResponses = e.response.getItemResponses();
    let ngay = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
    let ca_truc = "Ăn trưa";
    let ma_phong = "", ho_ten_gv = "", ma_xac_thuc = "";
    let hs_vi_pham = "", tinh_hinh = "Nề nếp tốt, trật tự", ghi_chu = "";

    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
      const answer = itemResponses[i].getResponse();

      if (title.includes("ngày")) ngay = answer;
      else if (title.includes("ca")) ca_truc = answer;
      else if (title.includes("phòng")) ma_phong = answer;
      else if (title.includes("giáo viên") || title.includes("họ và tên") || title.includes("tên gv")) ho_ten_gv = answer;
      else if (title.includes("mã") || title.includes("bảo mật") || title.includes("xác thực") || title.includes("xác nhận")) ma_xac_thuc = String(answer).trim().toUpperCase();
      else if (title.includes("vi phạm") || title.includes("không nề nếp") || title.includes("chưa nề nếp") || title.includes("chi tiết") || title.includes("vắng")) hs_vi_pham = answer;
      else if (title.includes("tình hình") || title.includes("nề nếp") || title.includes("trật tự")) tinh_hinh = answer;
      else if (title.includes("đề xuất") || title.includes("phản ánh") || title.includes("ghi chú") || title.includes("ý kiến")) ghi_chu = answer;
    }

    const payload = {
      token: WEBHOOK_SECRET,
      ngay: ngay,
      ca_truc: ca_truc,
      ma_phong: ma_phong,
      ho_ten_gv: ho_ten_gv,
      ma_xac_thuc: ma_xac_thuc,
      hs_vi_pham: hs_vi_pham,
      tinh_hinh: tinh_hinh,
      ghi_chu: ghi_chu,
      nguon: "google_form"
    };

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Lỗi: " + err.toString());
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleScript);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  return (
    <div className="bctruc-container">
      {AlertUI}

      {/* Header */}
      <div className="bctruc-header">
        <div>
          <div className="bctruc-title">
            <i className="fas fa-clipboard-check" style={{ color: '#009CFF' }}></i>
            Báo cáo ca trực Giáo viên
          </div>
          <div className="bctruc-subtitle">
            Dữ liệu nhận tự động từ Google Form / Zalo theo thời gian thực (Giáo viên không cần vào web)
          </div>
        </div>

        <div className="bctruc-actions">
          <input
            type="date"
            className="form-control"
            style={{ width: 160 }}
            value={ngay}
            onChange={(e) => setNgay(e.target.value)}
          />

          <select
            className="form-select"
            style={{ width: 140 }}
            value={caTruc}
            onChange={(e) => setCaTruc(e.target.value)}
          >
            <option value="all">Tất cả ca trực</option>
            <option value="0">🍽️ Ca Ăn trưa</option>
            <option value="1">🛏️ Ca Nghỉ trưa</option>
          </select>

          <button className="btn btn-outline-primary" onClick={loadReports} disabled={loading} title="Làm mới">
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>

          <button className="btn btn-primary" onClick={() => setShowGuide(true)}>
            <i className="fab fa-google"></i> Hướng dẫn Google Form
          </button>
        </div>
      </div>

      {/* Security Code Banner */}
      <div className="bctruc-security-box">
        <div className="bctruc-security-info">
          <i className="fas fa-user-shield" style={{ fontSize: '1.6rem', color: '#059669' }}></i>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Xác thực Báo cáo Trực bằng Mã Riêng của Từng Giáo Viên (5 ký tự)
            </div>
            <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: 2 }}>
              Mỗi Thầy/Cô được hệ thống tự động sinh 1 mã 5 ký tự riêng (VD: <code>GVxxx</code>). Khi gửi Form, hệ thống đối chiếu mã để xác nhận danh tính chính chủ và chặn HS giả mạo.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            to="/giaovien"
            className="btn btn-sm btn-outline"
            style={{ borderColor: '#a7f3d0', color: '#047857', background: '#fff' }}
            title="Xem và xuất danh sách mã 5 ký tự của tất cả Giáo viên"
          >
            <i className="fas fa-users-cog"></i> Xem & Xuất mã các GV
          </Link>
          {(user?.is_admin || user?.is_superuser) && (
            <Link
              to="/cauhinh"
              className="btn btn-sm btn-outline"
              style={{ borderColor: '#cbd5e1', color: '#475569', background: '#fff' }}
              title="Mã Master dự phòng của trường"
            >
              <i className="fas fa-shield-alt"></i> Mã Master trường
            </Link>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="bctruc-stats-grid">
        <div className="bctruc-stat-card">
          <div className="bctruc-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <i className="fas fa-file-signature"></i>
          </div>
          <div className="bctruc-stat-info">
            <h4>Báo cáo nhận được</h4>
            <div className="stat-val">{data.stats?.total || 0}</div>
          </div>
        </div>

        <div className="bctruc-stat-card">
          <div className="bctruc-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <i className="fas fa-utensils"></i>
          </div>
          <div className="bctruc-stat-info">
            <h4>Ca Ăn trưa</h4>
            <div className="stat-val">{data.stats?.caAnCount || 0}</div>
          </div>
        </div>

        <div className="bctruc-stat-card">
          <div className="bctruc-stat-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <i className="fas fa-bed"></i>
          </div>
          <div className="bctruc-stat-info">
            <h4>Ca Nghỉ trưa</h4>
            <div className="stat-val">{data.stats?.caNguCount || 0}</div>
          </div>
        </div>

        <div className="bctruc-stat-card">
          <div className="bctruc-stat-icon" style={{ background: (data.stats?.coViPhamCount || 0) > 0 ? '#fee2e2' : '#dcfce7', color: (data.stats?.coViPhamCount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
            <i className={`fas ${(data.stats?.coViPhamCount || 0) > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'}`}></i>
          </div>
          <div className="bctruc-stat-info">
            <h4>Phòng có HS vi phạm</h4>
            <div className="stat-val" style={{ color: (data.stats?.coViPhamCount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
              {(data.stats?.coViPhamCount || 0) > 0 ? `${data.stats.coViPhamCount} phòng` : '0 (Tốt)'}
            </div>
          </div>
        </div>
      </div>

      {/* Cảnh báo phòng chưa gửi */}
      {(data.phongChuaBaoCaoAn?.length > 0 || data.phongChuaBaoCaoNgu?.length > 0) && (
        <div className="bctruc-pending-banner">
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.2rem', marginTop: 2 }}></i>
          <div>
            <strong>Tiến độ nộp báo cáo:</strong>
            {data.phongChuaBaoCaoAn?.length > 0 && (
              <div style={{ marginTop: 4 }}>
                • <strong>Ca Ăn chưa nộp ({data.phongChuaBaoCaoAn.length} phòng):</strong> {data.phongChuaBaoCaoAn.join(', ')}
              </div>
            )}
            {data.phongChuaBaoCaoNgu?.length > 0 && (
              <div style={{ marginTop: 2 }}>
                • <strong>Ca Ngủ chưa nộp ({data.phongChuaBaoCaoNgu.length} phòng):</strong> {data.phongChuaBaoCaoNgu.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danh sách báo cáo */}
      <div className="bctruc-card">
        <div className="bctruc-table-header">
          <h3 className="bctruc-table-title">
            Danh sách chi tiết ngày {ngay.split('-').reverse().join('/')} ({data.records?.length || 0} lượt báo cáo)
          </h3>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#009CFF' }}></i>
            <p style={{ marginTop: 12 }}>Đang tải báo cáo ca trực...</p>
          </div>
        ) : data.records?.length === 0 ? (
          <div className="bctruc-empty">
            <i className="fas fa-clipboard-list"></i>
            <h4>Chưa có báo cáo nào trong ngày này</h4>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Khi giáo viên trực gửi biểu mẫu Google Form hoặc Zalo, thông tin sẽ hiển thị tự động tại đây.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-hover" style={{ margin: 0 }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ width: 80 }}>Giờ gửi</th>
                  <th style={{ width: 110 }}>Ca trực</th>
                  <th style={{ width: 100 }}>Phòng</th>
                  <th style={{ width: 200 }}>Giáo viên trực</th>
                  <th style={{ minWidth: 220 }}>Nề nếp & Học sinh vi phạm</th>
                  <th>Tình hình chung</th>
                  <th>Ghi chú / Đề xuất</th>
                  {(user?.is_admin || user?.is_superuser) && <th style={{ width: 60, textAlign: 'center' }}>Xóa</th>}
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} style={{ background: r.is_hop_le === false ? '#fff5f5' : 'transparent' }}>
                    <td style={{ fontWeight: 600, color: '#475569' }}>
                      {formatTime(r.created_at)}
                    </td>
                    <td>
                      {r.ca_truc === 0 ? (
                        <span className="bctruc-badge-an">
                          <i className="fas fa-utensils"></i> Ăn trưa
                        </span>
                      ) : (
                        <span className="bctruc-badge-ngu">
                          <i className="fas fa-bed"></i> Nghỉ trưa
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="bctruc-phong-pill">{r.ma_phong}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.ho_ten_gv}</div>
                      {r.is_hop_le ? (
                        <div className="bctruc-verify-badge valid" title="Mã bảo mật 5 ký tự khớp chính xác">
                          <i className="fas fa-shield-alt"></i> Hợp lệ: {r.ma_xac_thuc || 'Đúng mã'}
                        </div>
                      ) : (
                        <div className="bctruc-verify-badge invalid" title="Mã xác thực không đúng với mã hệ thống hiện tại">
                          <i className="fas fa-exclamation-triangle"></i> Sai mã: "{r.ma_xac_thuc || 'Trống'}" (Nghi vấn HS)
                        </div>
                      )}
                    </td>
                    <td>
                      {r.danh_sach_vang ? (
                        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '6px 10px', borderRadius: 6 }}>
                          <div style={{ color: '#e11d48', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="fas fa-exclamation-circle"></i> Có học sinh vi phạm:
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#881337', marginTop: 3, whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                            {r.danh_sach_vang}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-check-circle"></i> Nề nếp tốt
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.88rem', color: '#334155' }}>
                        {r.tinh_hinh || 'Bình thường'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {r.ghi_chu || '-'}
                      </div>
                    </td>
                    {(user?.is_admin || user?.is_superuser) && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ color: '#ef4444' }}
                          title="Xóa báo cáo"
                          onClick={() => handleDelete(r.id, r.ma_phong, r.ho_ten_gv)}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Hướng Dẫn Kết Nối Google Form */}
      {showGuide && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fab fa-google" style={{ color: '#ea4335' }}></i> Hướng dẫn kết nối Google Form với Web Bán Trú
              </div>
              <button className="modal-close" onClick={() => setShowGuide(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.6 }}>
                <p>
                  <strong>Bước 1:</strong> Tạo Google Form với các câu hỏi sau:
                </p>
                <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
                  <li><strong>Ngày trực</strong> (loại Ngày/Date)</li>
                  <li><strong>Ca trực</strong> (Trắc nghiệm: <code>Ăn trưa</code>, <code>Nghỉ trưa</code>)</li>
                  <li><strong>Phòng trực</strong> (Menu thả xuống chọn mã phòng: <code>A20</code>, <code>E2</code>, <code>HT.A</code>...)</li>
                  <li><strong>Họ và tên Giáo viên trực</strong> (Trả lời ngắn)</li>
                  <li>
                    <strong style={{ color: '#047857' }}>Mã bảo mật cá nhân của Giáo viên (5 ký tự)</strong> (Trả lời ngắn - Ví dụ: <code>GV84B</code>)
                    <br />
                    <small style={{ color: '#64748b' }}>💡 <em>Mỗi Thầy/Cô được hệ thống cấp 1 mã riêng khi nạp danh sách GV lên web. GV điền mã này để hệ thống xác nhận chính chủ và chống học sinh nghịch phá.</em></small>
                  </li>
                  <li><strong>Tình hình nề nếp / trật tự</strong> (Trắc nghiệm: <code>Nề nếp tốt, trật tự</code>, <code>Bình thường</code>, <code>Có học sinh vi phạm</code>)</li>
                  <li><strong>Chi tiết học sinh vi phạm (nếu có)</strong> (Đoạn: Tên em, Lớp, Lỗi vi phạm. Phòng ngoan để trống)</li>
                  <li><strong>Đề xuất / Phản ánh khác</strong> (Đoạn - nếu có)</li>
                </ul>

                <p>
                  <strong>Bước 2:</strong> Mở Google Form ➔ Bấm <strong>⋮ (3 chấm)</strong> góc phải ➔ Chọn <strong>Trình chỉnh sửa tập lệnh (Apps Script)</strong>.
                </p>
                <p>
                  <strong>Bước 3:</strong> Dán đoạn mã sau vào và bấm Lưu (Ctrl + S):
                </p>

                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
                    onClick={handleCopy}
                  >
                    <i className={`fas ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i> {copySuccess ? 'Đã sao chép!' : 'Sao chép mã script'}
                  </button>
                  <pre className="bctruc-guide-code">{sampleScript}</pre>
                </div>

                <p>
                  <strong>Bước 4:</strong> Bấm biểu tượng <strong>Đồng hồ (Trình kích hoạt - Triggers)</strong> ở menu bên trái ➔ <strong>+ Thêm trình kích hoạt</strong>:
                </p>
                <ul style={{ paddingLeft: 20 }}>
                  <li>Chọn hàm: <code>onFormSubmit</code></li>
                  <li>Nguồn sự kiện: <strong>Từ biểu mẫu (From form)</strong></li>
                  <li>Loại sự kiện: <strong>Khi gửi biểu mẫu (On form submit)</strong> ➔ Bấm <strong>Lưu</strong>.</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowGuide(false)}>
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
