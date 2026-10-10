import { useState, useEffect, useCallback, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { docSoThanhChu, formatDateDMY, formatVND, formatDonGia, formatTien } from '../../utils/stringUtils';
import './TongHopChiTra.css';

// Helper hiển thị tần suất chi bằng tiếng Việt
const formatTanSuat = (val) => {
  if (val === 'dinh_ky') return 'Định kỳ';
  if (val === 'phat_sinh') return 'Phát sinh';
  if (val === 'mot_lan') return 'Một lần';
  return (val && val !== '-') ? val : '';
};

const COLUMN_DISPLAY_MAP = {
  truc_phong: { title: 'Trực phòng', sub: 'Ngủ 180k', type: 'nguon', width: 78, tooltip: 'Trực phòng ngủ (180.000đ/ca) - Tự động đồng bộ từ CSDL' },
  vs_bv: { title: 'Trực vệ sinh & BV', sub: 'Cố định', type: 'green', width: 90, tooltip: 'Trực vệ sinh & Bảo vệ: Hỗ trợ phân mục Định kỳ (màu đỏ) hoặc Một lần (màu xanh). Rê chuột vào từng ô để xem chi tiết.' },
  tiep_nhan_vd: { title: 'Tiếp nhận & VS', sub: 'Vật dụng', type: 'green', width: 95, tooltip: 'Nhắn tin, tiếp nhận và VS vật dụng: Hỗ trợ phân mục Định kỳ (màu đỏ) hoặc Một lần (màu xanh).' },
  y_te: { title: 'Y tế', sub: 'ĐG 70k', type: 'days', width: 68, tooltip: 'Chăm sóc Y tế (70.000đ/ngày) - Cho phép chỉnh sửa' },
  bt_an: { title: 'Bán trú ăn', sub: 'KT 100k', type: 'nguon', width: 78, tooltip: 'Bán trú ăn (100.000đ/ca) - Tự động đồng bộ từ CSDL' },
  cap_nhat_tt: { title: 'Cập nhật TT & VS', sub: 'Hàng tháng', type: 'green', width: 98, tooltip: 'Cập nhật thông tin & VS: Hỗ trợ phân mục Định kỳ (màu đỏ) hoặc Một lần (màu xanh).' },
  thiet_bi: { title: 'Trực thiết bị', sub: 'ĐG 100k', type: 'days', width: 72, tooltip: 'Trực thiết bị (100.000đ/ca) - Cho phép chỉnh sửa' },
  gs_an: { title: 'Giám sát ăn', sub: 'ĐG 100k', type: 'days', width: 78, tooltip: 'Giám sát ăn (100.000đ/ca) - Khóa theo chấm công thực tế' },
  gs_ban_tru: { title: 'GS bán trú', sub: 'ĐG 250k', type: 'days', width: 78, tooltip: 'Giám sát bán trú (250.000đ/ngày) - Phân công nghiệp vụ' },
};

function getColDisplay(col) {
  const isLocked = ['truc_phong', 'bt_an', 'gs_an'].includes(col?.ma_khoan_chi);
  if (COLUMN_DISPLAY_MAP[col.ma_khoan_chi]) {
    const item = COLUMN_DISPLAY_MAP[col.ma_khoan_chi];
    let sub = item.sub;
    if (col.loai_tinh === 'ngay_don_gia' || col.loai_tinh === 'so_ngay_don_gia') {
      sub = `ĐG ${Math.round((col.don_gia_mac_dinh || 0) / 1000)}k`;
    }
    return { ...item, sub, fullTitle: item.tooltip || col.ten_khoan_chi, isLocked };
  }
  let sub = 'Trực tiếp';
  let type = 'direct';
  if (col.loai_tinh === 'nguon_truc_an') { sub = 'KT 100k'; type = 'nguon'; }
  else if (col.loai_tinh === 'nguon_truc_ngu') { sub = 'Ngủ 180k'; type = 'nguon'; }
  else if (col.loai_tinh === 'ngay_don_gia' || col.loai_tinh === 'so_ngay_don_gia') {
    sub = `ĐG ${Math.round((col.don_gia_mac_dinh || 0) / 1000)}k`;
    type = 'days';
  }
  return {
    title: col.ten_khoan_chi && col.ten_khoan_chi.length > 18 ? col.ten_khoan_chi.slice(0, 16) + '...' : (col.ten_khoan_chi || ''),
    sub,
    type,
    width: 95,
    fullTitle: col.ten_khoan_chi,
    isLocked,
  };
}

export default function TongHopChiTra() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(
    user && (user.is_superuser === true || user.role === 'admin' || user.role === 'super_admin')
  );
  const isSuperAdminOrAccountant = Boolean(
    user && (user.is_superuser || user.role === 'admin' || user.role === 'ke_toan' || user.role === 'super_admin')
  );

  // Danh sách kỳ và kỳ hiện tại
  const [kyList, setKyList] = useState([]);
  const [selectedKyId, setSelectedKyId] = useState(null);
  const [kyData, setKyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [namHoc, setNamHoc] = useState('2026-2027');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    ten_ky: '',
    tu_ngay: '',
    den_ngay: '',
    ngay_lap: new Date().toISOString().split('T')[0],
    ghi_chu: '',
  });

  const [showAddRecipientModal, setShowAddRecipientModal] = useState(false);
  const [existingTeachers, setExistingTeachers] = useState([]);
  const [addRecipientForm, setAddRecipientForm] = useState({
    isCustom: false,
    giao_vien_id: '',
    ho_ten: '',
    ma_dinh_danh: '',
    so_tai_khoan: '',
    ngan_hang: '',
    ghi_chu: '',
  });



  const [showCellEditModal, setShowCellEditModal] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [cellForm, setCellForm] = useState({
    so_ngay: 0,
    don_gia: 0,
    so_tien_nhap: 0,
    so_tien_dieu_chinh: 0,
    ly_do_dieu_chinh: '',
    tan_suat: 'dinh_ky',
    ghi_chu: '',
  });

  // Inline edit cho Số tài khoản & Ghi chú của từng nhân sự
  const [editingRecipientCell, setEditingRecipientCell] = useState(null);
  // { recipientId, field: 'so_tai_khoan' | 'ghi_chu', value, recipient }

  // Modal Chốt kỳ an toàn & Điều chỉnh khoảng ngày chốt kỳ
  const [showChotKyModal, setShowChotKyModal] = useState(false);
  const [chotTuNgay, setChotTuNgay] = useState('');
  const [chotDenNgay, setChotDenNgay] = useState('');
  const [confirmChotText, setConfirmChotText] = useState('');
  const [previewChotData, setPreviewChotData] = useState(null);
  const [loadingPreviewChot, setLoadingPreviewChot] = useState(false);
  const [submittingChot, setSubmittingChot] = useState(false);

  const addDaysFrontend = (dateStr, n) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };



  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCategoryEditModal, setShowCategoryEditModal] = useState(false);
  const [showEditKyModal, setShowEditKyModal] = useState(false);
  const [submittingEditKy, setSubmittingEditKy] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [submittingUnlock, setSubmittingUnlock] = useState(false);
  const [showDeleteKyModal, setShowDeleteKyModal] = useState(false);
  const [submittingDeleteKy, setSubmittingDeleteKy] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // In-app modal thông báo thay thế alert() của trình duyệt
  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'success', // 'success' | 'error' | 'warning' | 'info'
    title: '',
    message: '',
  });

  const showNotify = useCallback((title, message, type = 'info') => {
    setNotifyModal({
      isOpen: true,
      type,
      title,
      message,
    });
  }, []);

  const notifySuccess = useCallback((message, title = 'Thành công') => showNotify(title, message, 'success'), [showNotify]);
  const notifyError = useCallback((message, title = 'Thông báo lỗi') => showNotify(title, message, 'error'), [showNotify]);
  const notifyWarning = useCallback((message, title = 'Cảnh báo') => showNotify(title, message, 'warning'), [showNotify]);

  const [editKyForm, setEditKyForm] = useState({
    ten_ky: '',
    tu_ngay: '',
    den_ngay: '',
    ngay_lap: '',
    ghi_chu: '',
    trang_thai: 'dang_dien_ra',
  });
  const [categoryList, setCategoryList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    ma_khoan_chi: '',
    ten_khoan_chi: '',
    loai_tinh: 'truc_tiep',
    don_gia_mac_dinh: 0,
    tan_suat: 'dinh_ky',
    thu_tu_hien_thi: 10,
    kich_hoat: true,
  });

  // Tải danh sách kỳ
  const fetchKyList = useCallback(async (preferKyId = null) => {
    try {
      const res = await api.get('/api/ketoan/ky-tong-hop');
      if (res.data?.ok) {
        const list = res.data.data || [];
        setKyList(list);
        if (list.length > 0) {
          setSelectedKyId((prev) => {
            if (preferKyId && list.some((k) => k.id === preferKyId)) return preferKyId;
            if (prev && list.some((k) => k.id === prev)) return prev;
            return list[0].id;
          });
        } else {
          setSelectedKyId(null);
          setKyData(null);
        }
        return list;
      }
      return [];
    } catch (err) {
      console.error('Lỗi tải danh sách kỳ:', err);
      return [];
    }
  }, []);

  // Tải chi tiết kỳ đang chọn
  const fetchKyDetail = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/ketoan/ky-tong-hop/${id}`);
      if (res.data?.ok) {
        setKyData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải chi tiết kỳ:', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải danh mục giáo viên khi thêm người nhận
  const fetchTeachers = useCallback(async () => {
    try {
      const res = await api.get('/api/giaovien/?limit=500');
      if (res.data?.ok) {
        setExistingTeachers(res.data.data || []);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách giáo viên:', err);
    }
  }, []);

  // Tải thiết lập danh mục & lịch sử thao tác
  const fetchSettings = useCallback(async () => {
    try {
      const [catRes, auditRes] = await Promise.all([
        api.get('/api/ketoan/danh-muc-khoan-chi'),
        api.get('/api/ketoan/lich-su-thiet-lap'),
      ]);
      if (catRes.data?.ok) setCategoryList(catRes.data.data || []);
      if (auditRes.data?.ok) setAuditLogs(auditRes.data.data || []);
    } catch (err) {
      console.error('Lỗi tải thiết lập:', err);
    }
  }, []);

  useEffect(() => {
    fetchKyList();
    api
      .get('/api/cauhinh/')
      .then((res) => {
        if (res.data?.he_thong?.nam_hoc) {
          setNamHoc(res.data.he_thong.nam_hoc);
        }
      })
      .catch(() => {});
  }, [fetchKyList]);

  useEffect(() => {
    if (selectedKyId) {
      fetchKyDetail(selectedKyId);
    }
  }, [selectedKyId, fetchKyDetail]);

  // Thông tin kỳ hiện tại (hỗ trợ cả kyData.ky và kyData phẳng)
  const kyInfo = useMemo(() => {
    return kyData?.ky || kyData || {};
  }, [kyData]);

  const effectiveNamHoc = useMemo(() => {
    return (
      kyInfo?.nam_hoc ||
      namHoc ||
      (kyInfo?.tu_ngay ? `${kyInfo.tu_ngay.split('-')[0]}-${parseInt(kyInfo.tu_ngay.split('-')[0], 10) + 1}` : '2026-2027')
    );
  }, [kyInfo, namHoc]);

  const cleanKyTen = useMemo(() => {
    return (kyInfo?.ten_ky || '').replace(/^kỳ\s+/i, '').trim();
  }, [kyInfo]);

  const todayVN = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }, []);

  const isKyDaChot = kyInfo?.trang_thai === 'da_chot';
  const ngayLapHienThi = isKyDaChot
    ? (kyInfo?.den_ngay || (kyInfo?.ngay_chot ? String(kyInfo.ngay_chot).substring(0, 10) : todayVN))
    : todayVN;

  const maxClosedDenNgay = useMemo(() => {
    return (kyList || [])
      .filter((k) => k.id !== kyInfo?.id && k.trang_thai === 'da_chot' && k.den_ngay)
      .reduce((max, k) => (!max || k.den_ngay > max ? k.den_ngay : max), null);
  }, [kyList, kyInfo?.id]);

  const minTuNgayAllowed = useMemo(() => {
    return maxClosedDenNgay ? addDaysFrontend(maxClosedDenNgay, 1) : '';
  }, [maxClosedDenNgay]);

  // Danh mục mặc định chuẩn 9 cột
  const DEFAULT_COLUMNS = useMemo(
    () => [
      { id: 1, ma_khoan_chi: 'truc_phong', ten_khoan_chi: 'Trực phòng', loai_tinh: 'nguon_truc_ngu', don_gia_mac_dinh: 180000 },
      { id: 2, ma_khoan_chi: 'vs_bv', ten_khoan_chi: 'Trực vệ sinh và bảo vệ', loai_tinh: 'truc_tiep', don_gia_mac_dinh: 0 },
      { id: 3, ma_khoan_chi: 'tiep_nhan_vd', ten_khoan_chi: 'Nhắn tin, tiếp nhận và VS vật dụng', loai_tinh: 'truc_tiep', don_gia_mac_dinh: 0 },
      { id: 4, ma_khoan_chi: 'y_te', ten_khoan_chi: 'Y tế', loai_tinh: 'ngay_don_gia', don_gia_mac_dinh: 70000 },
      { id: 5, ma_khoan_chi: 'bt_an', ten_khoan_chi: 'Bán trú ăn', loai_tinh: 'nguon_truc_an', don_gia_mac_dinh: 100000 },
      { id: 6, ma_khoan_chi: 'cap_nhat_tt', ten_khoan_chi: 'Cập nhật TT ăn ngủ hàng tháng', loai_tinh: 'truc_tiep', don_gia_mac_dinh: 0 },
      { id: 7, ma_khoan_chi: 'thiet_bi', ten_khoan_chi: 'Trực thiết bị', loai_tinh: 'ngay_don_gia', don_gia_mac_dinh: 100000 },
      { id: 8, ma_khoan_chi: 'gs_an', ten_khoan_chi: 'Trực kiểm tra GS ăn', loai_tinh: 'ngay_don_gia', don_gia_mac_dinh: 100000 },
      { id: 9, ma_khoan_chi: 'gs_ban_tru', ten_khoan_chi: 'Trực GS bán trú', loai_tinh: 'ngay_don_gia', don_gia_mac_dinh: 250000 },
    ],
    []
  );

  // Danh sách cột hiển thị (lấy từ backend hoặc mặc định)
  const columns = useMemo(() => {
    const list = kyData?.columns || kyData?.danh_muc;
    if (Array.isArray(list) && list.length > 0) return list;
    return DEFAULT_COLUMNS;
  }, [kyData, DEFAULT_COLUMNS]);

  // Danh sách người nhận hiển thị (lấy từ backend)
  const filteredRecipients = useMemo(() => {
    const list = kyData?.rows || kyData?.nguoi_nhan || [];
    if (!searchName.trim()) return list;
    const term = searchName.toLowerCase().trim();
    return list.filter((r) => r.ho_ten?.toLowerCase().includes(term));
  }, [kyData, searchName]);

  // Tổng các cột và tổng toàn bảng
  const columnSums = useMemo(() => {
    if (kyData?.columnTotals && kyData?.grandTotal !== undefined && !searchName.trim()) {
      return {
        sums: kyData.columnTotals,
        grandTotal: kyData.grandTotal,
        totalDaChi: kyData.grandPaid || 0,
        totalConLai: kyData.grandRemaining || 0,
      };
    }

    const sums = {};
    columns.forEach((c) => {
      sums[c.ma_khoan_chi] = 0;
    });
    let grandTotal = 0;
    let totalDaChi = 0;

    filteredRecipients.forEach((nn) => {
      columns.forEach((col) => {
        let ct = nn.chi_tiet ? nn.chi_tiet[col.ma_khoan_chi] : null;
        if (!ct && Array.isArray(nn.chi_tiet_khoan_chi)) {
          ct = nn.chi_tiet_khoan_chi.find((c) => c.ma_khoan_chi === col.ma_khoan_chi);
        }
        const val = parseFloat(ct?.thanh_tien) || 0;
        sums[col.ma_khoan_chi] = (sums[col.ma_khoan_chi] || 0) + val;
      });
      grandTotal += parseFloat(nn.tong_tien) || 0;
      totalDaChi += parseFloat(nn.da_thanh_toan || nn.da_chi) || 0;
    });

    return { sums, grandTotal, totalDaChi, totalConLai: grandTotal - totalDaChi };
  }, [columns, filteredRecipients, kyData, searchName]);

  // Xác định ngày kết thúc muộn nhất trong danh sách các kỳ đã chốt (BỎ QUA KỲ HỆ THỐNG)
  const maxExistingDenNgay = useMemo(() => {
    if (!kyList || kyList.length === 0) return '';
    const closedKys = kyList.filter(
      (k) => k.trang_thai === 'da_chot' && !k.ten_ky?.toLowerCase().includes('hệ thống')
    );
    if (closedKys.length === 0) return '';
    let max = '';
    closedKys.forEach((k) => {
      if (k.den_ngay && (!max || k.den_ngay > max)) {
        max = k.den_ngay;
      }
    });
    return max;
  }, [kyList]);

  // Ngày bắt đầu tối thiểu cho kỳ mới (ngày tiếp theo sau kỳ đã chốt kết thúc muộn nhất, hoặc 07/09/2026 nếu chưa có kỳ chốt)
  const minCreateTuNgay = useMemo(() => {
    return maxExistingDenNgay ? addDaysFrontend(maxExistingDenNgay, 1) : '2026-09-07';
  }, [maxExistingDenNgay]);

  // ─── Xử lý Mở modal Tạo kỳ mới với gợi ý ngày thông minh (KHÔNG CHỒNG LẤN) ──
  const handleOpenCreateModal = () => {
    const nextStart = minCreateTuNgay;
    let defaultEnd = todayVN;
    if (nextStart.startsWith('2026-09')) {
      defaultEnd = '2026-09-30';
    } else {
      const parts = nextStart.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const lastDay = new Date(y, m, 0).getDate();
        defaultEnd = `${parts[0]}-${parts[1]}-${String(lastDay).padStart(2, '0')}`;
      }
    }
    if (defaultEnd < nextStart) defaultEnd = nextStart;

    const monthStr = nextStart.split('-')[1] || '09';
    const yearStr = nextStart.split('-')[0] || '2026';
    const defaultName = `Tháng ${monthStr}/${yearStr}`;

    setCreateForm({
      ten_ky: defaultName,
      tu_ngay: nextStart,
      den_ngay: defaultEnd,
      ngay_lap: todayVN,
      ghi_chu: '',
    });
    setShowCreateModal(true);
  };

  // ─── Xử lý Tạo kỳ mới ────────────────────────────────────────────────────────
  const handleCreateKy = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!createForm.ten_ky || !createForm.tu_ngay || !createForm.den_ngay) {
      notifyWarning('Vui lòng điền đầy đủ tên kỳ và khoảng ngày.', 'Thiếu thông tin');
      return;
    }
    if (createForm.tu_ngay > createForm.den_ngay) {
      notifyWarning('Từ ngày không được lớn hơn Đến ngày.', 'Khoảng ngày không hợp lệ');
      return;
    }

    // Kiểm tra chống chồng lấn thời gian với kỳ đã chốt (BỎ QUA KỲ HỆ THỐNG)
    if (maxExistingDenNgay && createForm.tu_ngay <= maxExistingDenNgay) {
      notifyError(
        `Từ ngày (${formatDateDMY(createForm.tu_ngay)}) bị chồng lấn với kỳ đã chốt trước đó (${formatDateDMY(maxExistingDenNgay)})!\nKỳ mới phải bắt đầu từ ngày ${formatDateDMY(minCreateTuNgay)} trở đi để tránh bị tính thừa / trùng số ca trực.`,
        'Khoảng ngày bị chồng lấn'
      );
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await api.post('/api/ketoan/ky-tong-hop', createForm);
      if (res.data?.ok) {
        setShowCreateModal(false);
        setCreateForm({
          ten_ky: '',
          tu_ngay: '',
          den_ngay: '',
          ngay_lap: todayVN,
          ghi_chu: '',
        });
        await fetchKyList(res.data.data.id);
        setSelectedKyId(res.data.data.id);
        await fetchKyDetail(res.data.data.id);
        notifySuccess(
          `Đã tạo kỳ "${res.data.data.ten_ky}" thành công (${formatDateDMY(res.data.data.tu_ngay)} → ${formatDateDMY(res.data.data.den_ngay)})!`,
          'Tạo kỳ thành công'
        );
      }
    } catch (err) {
      notifyError(err.response?.data?.error || err.message, 'Lỗi tạo kỳ');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // ─── Xử lý Chốt / Mở lại kỳ ──────────────────────────────────────────────────
  const fetchPreviewChot = useCallback(async (kyId, denNgay, tuNgay) => {
    if (!kyId || !denNgay) return;
    setLoadingPreviewChot(true);
    try {
      const qTu = tuNgay ? `&tu_ngay=${tuNgay}` : '';
      const res = await api.get(`/api/ketoan/ky-tong-hop/${kyId}/preview-chot?den_ngay=${denNgay}${qTu}`);
      if (res.data?.ok) {
        setPreviewChotData(res.data.data);
      }
    } catch (err) {
      console.warn('Lỗi xem trước chốt kỳ:', err);
    } finally {
      setLoadingPreviewChot(false);
    }
  }, []);

  const handleToggleLock = () => {
    if (!kyInfo?.id) return;
    const isLocked = kyInfo.trang_thai === 'da_chot';

    if (isLocked) {
      handleOpenUnlockModal();
    } else {
      const initTuNgay = kyInfo.tu_ngay || '';
      const initDenNgay = kyInfo.den_ngay || '';
      setChotTuNgay(initTuNgay);
      setChotDenNgay(initDenNgay);
      setConfirmChotText('');
      fetchPreviewChot(kyInfo.id, initDenNgay, initTuNgay);
      setShowChotKyModal(true);
    }
  };

  // ─── Super Admin: Mở lại kỳ tổng hợp ───────────────────────────────────────
  const handleOpenUnlockModal = () => {
    if (!kyInfo?.id) return;
    setShowUnlockModal(true);
  };

  const handleExecuteUnlock = async () => {
    if (!kyInfo?.id) return;
    setSubmittingUnlock(true);
    try {
      const res = await api.post(`/api/ketoan/ky-tong-hop/${kyInfo.id}/mo-lai`, {
        ly_do: 'Mở lại từ màn hình Kế toán',
      });
      if (res.data?.ok) {
        setShowUnlockModal(false);
        await fetchKyDetail(kyInfo.id);
        await fetchKyList(kyInfo.id);
        notifySuccess(res.data.message || 'MỞ LẠI kỳ tổng hợp thành công. Kế toán có thể tiếp tục chỉnh sửa số liệu.', 'Mở lại kỳ');
      }
    } catch (err) {
      notifyError('Thao tác thất bại: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingUnlock(false);
    }
  };

  // Giữ alias tương thích
  const handleConfirmUnlock = handleOpenUnlockModal;

  // ─── Super Admin: Sửa thông tin kỳ tổng hợp ─────────────────────────────────
  const handleOpenEditKy = () => {
    if (!kyInfo || !kyInfo.id) return;
    setEditKyForm({
      ten_ky: kyInfo.ten_ky || '',
      tu_ngay: kyInfo.tu_ngay ? String(kyInfo.tu_ngay).substring(0, 10) : '',
      den_ngay: kyInfo.den_ngay ? String(kyInfo.den_ngay).substring(0, 10) : '',
      ngay_lap: kyInfo.ngay_lap ? String(kyInfo.ngay_lap).substring(0, 10) : '',
      ghi_chu: kyInfo.ghi_chu || '',
      trang_thai: kyInfo.trang_thai || 'dang_dien_ra',
    });
    setShowEditKyModal(true);
  };

  const handleSaveEditKy = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!kyInfo?.id) return;
    setSubmittingEditKy(true);
    try {
      const res = await api.put(`/api/ketoan/ky-tong-hop/${kyInfo.id}`, editKyForm);
      if (res.data?.ok) {
        setShowEditKyModal(false);
        await fetchKyDetail(kyInfo.id);
        await fetchKyList(kyInfo.id);
        notifySuccess('Cập nhật thông tin kỳ thành công!', 'Sửa kỳ thành công');
      }
    } catch (err) {
      notifyError('Không thể cập nhật kỳ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingEditKy(false);
    }
  };

  // ─── Super Admin: Xóa kỳ tổng hợp (kể cả đã chốt) ──────────────────────────
  const handleOpenDeleteKy = () => {
    if (!kyInfo?.id) return;
    setShowDeleteKyModal(true);
  };

  const handleExecuteDeleteKy = async () => {
    if (!kyInfo?.id) return;
    setSubmittingDeleteKy(true);
    try {
      const currentDeletingId = kyInfo.id;
      const res = await api.delete(`/api/ketoan/ky-tong-hop/${currentDeletingId}`);
      if (res.data?.ok) {
        setShowDeleteKyModal(false);
        const list = await fetchKyList();
        const remaining = (list || []).filter((k) => k.id !== currentDeletingId);
        if (remaining.length > 0) {
          setSelectedKyId(remaining[0].id);
          await fetchKyDetail(remaining[0].id);
        } else {
          setSelectedKyId(null);
          setKyData(null);
        }
        notifySuccess(res.data.message || 'Đã xóa kỳ thành công!', 'Xóa kỳ thành công');
      }
    } catch (err) {
      notifyError('Không thể xóa kỳ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingDeleteKy(false);
    }
  };

  // Giữ alias tương thích
  const handleDeleteKy = handleOpenDeleteKy;

  const handleExecuteChotKy = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!kyInfo?.id) return;

    if (chotTuNgay && chotDenNgay && chotTuNgay > chotDenNgay) {
      notifyWarning('Từ ngày không được lớn hơn Đến ngày.', 'Khoảng ngày không hợp lệ');
      return;
    }

    if (minTuNgayAllowed && chotTuNgay && chotTuNgay < minTuNgayAllowed) {
      notifyError(
        `Từ ngày (${formatDateDMY(chotTuNgay)}) không được chồng lấn với kỳ trước đã chốt (kỳ trước kết thúc ngày ${formatDateDMY(maxClosedDenNgay)})! Kỳ mới phải bắt đầu từ ngày mới.`,
        'Khoảng ngày bị chồng lấn'
      );
      return;
    }

    if (confirmChotText.trim().toLowerCase() !== 'tôi chốt') {
      notifyWarning('Vui lòng nhập chính xác "Tôi chốt" để xác nhận.', 'Chưa xác nhận');
      return;
    }

    setSubmittingChot(true);
    try {
      const res = await api.post(`/api/ketoan/ky-tong-hop/${kyInfo.id}/chot`, {
        tu_ngay: chotTuNgay || kyInfo.tu_ngay,
        den_ngay: chotDenNgay || kyInfo.den_ngay,
        tong_tien: columnSums.grandTotal,
      });
      if (res.data?.ok) {
        setShowChotKyModal(false);
        setConfirmChotText('');
        await fetchKyList();
        if (res.data.new_ky?.id) {
          setSelectedKyId(res.data.new_ky.id);
        } else {
          await fetchKyDetail(kyInfo.id);
        }
        notifySuccess(res.data.message || 'CHỐT kỳ tổng hợp thành công.', 'Chốt kỳ thành công');
      }
    } catch (err) {
      notifyError('Chốt kỳ thất bại: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingChot(false);
    }
  };



  // ─── Xử lý Thêm người nhận ────────────────────────────────────────────────────
  const handleOpenAddRecipient = () => {
    fetchTeachers();
    setAddRecipientForm({
      isCustom: false,
      giao_vien_id: '',
      ho_ten: '',
      ma_dinh_danh: '',
      so_tai_khoan: '',
      ngan_hang: '',
      ghi_chu: '',
    });
    setShowAddRecipientModal(true);
  };

  const handleAddRecipient = async (e) => {
    e.preventDefault();
    if (!kyInfo?.id) return;

    let payload;
    if (addRecipientForm.isCustom) {
      if (!addRecipientForm.ho_ten.trim()) {
        notifyWarning('Vui lòng nhập họ và tên người nhận.');
        return;
      }
      payload = {
        ho_ten: addRecipientForm.ho_ten.trim(),
        ma_dinh_danh: addRecipientForm.ma_dinh_danh.trim() || `NV_NGOAI_${Date.now()}`,
        so_tai_khoan: addRecipientForm.so_tai_khoan.trim(),
        ngan_hang: addRecipientForm.ngan_hang.trim(),
        ghi_chu: addRecipientForm.ghi_chu.trim(),
      };
    } else {
      if (!addRecipientForm.giao_vien_id) {
        notifyWarning('Vui lòng chọn nhân sự từ danh sách.');
        return;
      }
      const gv = existingTeachers.find((t) => t.id === parseInt(addRecipientForm.giao_vien_id));
      if (!gv) {
        notifyError('Không tìm thấy thông tin giáo viên đã chọn.');
        return;
      }
      payload = {
        giao_vien_id: gv.id,
        ho_ten: gv.ho_ten,
        ma_dinh_danh: `GV_${gv.id}`,
        so_tai_khoan: gv.so_tai_khoan || '',
        ngan_hang: gv.ngan_hang || '',
        ghi_chu: addRecipientForm.ghi_chu.trim(),
      };
    }

    try {
      const res = await api.post(`/api/ketoan/ky-tong-hop/${kyInfo.id}/nguoi-nhan`, payload);
      if (res.data?.ok) {
        setShowAddRecipientModal(false);
        fetchKyDetail(kyInfo.id);
        notifySuccess('Thêm người nhận thành công.');
      }
    } catch (err) {
      notifyError('Không thể thêm người nhận: ' + (err.response?.data?.error || err.message));
    }
  };

  // ─── Xóa người nhận khỏi kỳ ───────────────────────────────────────────────────
  const handleDeleteRecipient = async (nnId, hoTen) => {
    if (kyInfo?.trang_thai === 'da_chot') {
      alert('Kỳ tổng hợp đã chốt, không thể xóa người nhận.');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${hoTen}" khỏi kỳ tổng hợp này?`)) return;

    try {
      const res = await api.delete(`/api/ketoan/ky-tong-hop/${kyInfo.id}/nguoi-nhan/${nnId}`);
      if (res.data?.ok) {
        fetchKyDetail(kyInfo.id);
      }
    } catch (err) {
      alert('Không thể xóa: ' + (err.response?.data?.error || err.message));
    }
  };

  // ─── Chỉnh sửa ô / khoản chi của người nhận ──────────────────────────────────
  // 5 cột khóa tuyệt đối không cho phép chỉnh sửa cho bất kỳ ai:
  // 1. Trực phòng (Ngủ 180k)
  // 2. Y tế (ĐG 70k) - Mai Quỳnh Châu
  // 3. Bán trú ăn (KT 100k)
  // 4. Trực thiết bị (ĐG 100k) - Trần Nhật Tân (16 ca x 100k)
  // 5. Giám sát ăn (ĐG 100k)
  // 3 cột khóa bảo vệ từ CSDL chấm công thực tế
  const STRICT_LOCKED_CATEGORIES = useMemo(
    () => new Set(['truc_phong', 'bt_an', 'gs_an']),
    []
  );

  const isHuynhDucVinhRecipient = useCallback((recipient) => {
    const name = (recipient?.ho_ten || '').trim().toLowerCase();
    return name.includes('huỳnh đức vịnh') || name.includes('đức vịnh');
  }, []);

  const isCsdlSourceCol = useCallback((col, recipient) => {
    if (!col) return false;
    // 3 cột tuyệt đối không được chỉnh sửa (trừ Super Admin)
    if (STRICT_LOCKED_CATEGORIES.has(col.ma_khoan_chi)) return true;

    // Khoản gs_ban_tru: người khác khóa, riêng Huỳnh Đức Vịnh được phép sửa
    if (col.ma_khoan_chi === 'gs_ban_tru') {
      const isVinh = recipient ? isHuynhDucVinhRecipient(recipient) : false;
      return !isVinh;
    }

    const loai = col.loai_tinh || col.loai_tinh_toan || '';
    return loai.startsWith('nguon_');
  }, [STRICT_LOCKED_CATEGORIES, isHuynhDucVinhRecipient]);

  const handleOpenCellEdit = (recipient, col, ctParam) => {
    if (kyInfo?.trang_thai === 'da_chot' && !isSuperAdmin) {
      return;
    }

    if (isCsdlSourceCol(col, recipient) && !isSuperAdmin) {
      return;
    }

    let ct = ctParam;
    if (!ct) {
      ct = recipient.chi_tiet ? recipient.chi_tiet[col.ma_khoan_chi] : null;
      if (!ct && Array.isArray(recipient.chi_tiet_khoan_chi)) {
        ct = recipient.chi_tiet_khoan_chi.find((c) => c.ma_khoan_chi === col.ma_khoan_chi);
      }
    }
    ct = ct || {};

    const isVinh = isHuynhDucVinhRecipient(recipient);
    const initialDonGia = parseFloat(
      ct.don_gia || col.don_gia_mac_dinh || (col.ma_khoan_chi === 'gs_ban_tru' ? 250000 : (col.ma_khoan_chi === 'y_te' ? 70000 : (col.ma_khoan_chi === 'truc_phong' ? 180000 : 100000)))
    ) || 0;
    const currentThanhTien = parseFloat(ct.thanh_tien) || 0;
    let computedSoNgay = ct.so_ngay !== undefined && ct.so_ngay !== null && Number(ct.so_ngay) > 0
      ? Number(ct.so_ngay)
      : (isVinh && col.ma_khoan_chi === 'gs_ban_tru' ? 9 : (initialDonGia > 0 && currentThanhTien > 0 ? Math.round(currentThanhTien / initialDonGia) : 0));
    const initialSoNgay = Math.round(computedSoNgay || 0);
    const initialSoTienNhap = parseFloat(
      ct.so_tien_nhap !== undefined && parseFloat(ct.so_tien_nhap) > 0
        ? ct.so_tien_nhap
        : ct.tien_nhap !== undefined && parseFloat(ct.tien_nhap) > 0
        ? ct.tien_nhap
        : ct.thanh_tien !== undefined && parseFloat(ct.thanh_tien) > 0
        ? ct.thanh_tien
        : ct.tien_nguon || 0
    ) || 0;

    const nameNorm = (recipient.ho_ten || '').toLowerCase();
    const isPhamThiThanhHa = nameNorm.includes('thanh hà');
    const isHongCam = nameNorm.includes('hồng cẩm') || nameNorm.includes('trần thị hồng cẩm');

    let initialTanSuat = ct.tan_suat;
    if (!initialTanSuat) {
      if (isPhamThiThanhHa && col.ma_khoan_chi === 'tiep_nhan_vd') {
        initialTanSuat = 'dinh_ky';
      } else if (isHongCam && col.ma_khoan_chi === 'cap_nhat_tt') {
        initialTanSuat = 'dinh_ky';
      } else if (col.ma_khoan_chi === 'vs_bv') {
        initialTanSuat = 'dinh_ky';
      } else {
        initialTanSuat = col.tan_suat || 'dinh_ky';
      }
    }

    setEditingCell({
      recipient,
      category: col,
      cellData: ct,
    });

    setCellForm({
      so_ngay: initialSoNgay,
      don_gia: initialDonGia,
      so_tien_nhap: initialSoTienNhap,
      so_tien_dieu_chinh: parseFloat(ct.tien_dieu_chinh || ct.so_tien_dieu_chinh) || 0,
      ly_do_dieu_chinh: ct.ly_do_dieu_chinh || '',
      tan_suat: initialTanSuat,
      ghi_chu: ct.ghi_chu || '',
    });

    setShowCellEditModal(true);
  };

  const handleSaveCellEdit = async (e) => {
    e.preventDefault();
    if (!editingCell || !kyInfo?.id) return;

    try {
      const payload = {
        nguoi_nhan_id: editingCell.recipient.id,
        ho_ten: editingCell.recipient.ho_ten,
        ma_khoan_chi: editingCell.category.ma_khoan_chi,
        tan_suat: cellForm.tan_suat || 'dinh_ky',
        so_ngay: Math.max(0, Math.round(Number(cellForm.so_ngay) || 0)),
        don_gia: cellForm.don_gia,
        tien_nhap: cellForm.so_tien_nhap,
        so_tien_nhap: cellForm.so_tien_nhap,
        tien_dieu_chinh: cellForm.so_tien_dieu_chinh,
        so_tien_dieu_chinh: cellForm.so_tien_dieu_chinh,
        ly_do_dieu_chinh: cellForm.ly_do_dieu_chinh,
        ghi_chu: cellForm.ghi_chu ? cellForm.ghi_chu.trim() : '',
      };

      const res = await api.put(`/api/ketoan/ky-tong-hop/${kyInfo.id}/chi-tiet-khoan`, payload);
      if (res.data?.ok) {
        setShowCellEditModal(false);
        fetchKyDetail(kyInfo.id);
      }
    } catch (err) {
      alert('Không thể lưu thay đổi: ' + (err.response?.data?.error || err.message));
    }
  };

  // ─── Inline Edit: Cập nhật Số tài khoản hoặc Ghi chú của người nhận ─────────────
  const handleStartEditRecipientField = (recipient, field) => {
    if (kyInfo?.trang_thai === 'da_chot') return;
    setEditingRecipientCell({
      recipientId: recipient.id,
      field,
      value: recipient[field] || '',
      recipient,
    });
  };

  const handleSaveRecipientField = async () => {
    if (!editingRecipientCell || !kyInfo?.id || kyInfo?.trang_thai === 'da_chot') {
      setEditingRecipientCell(null);
      return;
    }
    const { recipient, field, value } = editingRecipientCell;
    const trimmed = value !== undefined ? String(value).trim() : '';
    const currentVal = (recipient[field] || '').trim();

    // Tắt chế độ edit ngay lập tức
    setEditingRecipientCell(null);

    // Nếu giá trị không đổi thì bỏ qua không gọi API
    if (trimmed === currentVal) return;

    // Cập nhật lạc quan (optimistic update) trên giao diện tức thì
    setKyData((prev) => {
      if (!prev) return prev;
      const updateList = (list) =>
        (list || []).map((r) =>
          r.id === recipient.id || r.ho_ten === recipient.ho_ten ? { ...r, [field]: trimmed } : r
        );
      return {
        ...prev,
        rows: prev.rows ? updateList(prev.rows) : prev.rows,
        nguoi_nhan: prev.nguoi_nhan ? updateList(prev.nguoi_nhan) : prev.nguoi_nhan,
      };
    });

    try {
      const payload = {
        ho_ten: recipient.ho_ten,
        nhan_su_id: recipient.nhan_su_id || null,
        [field]: trimmed,
      };
      await api.put(`/api/ketoan/ky-tong-hop/${kyInfo.id}/nguoi-nhan/${recipient.id}`, payload);
    } catch (err) {
      console.error('Lỗi cập nhật người nhận:', err);
      alert('Không thể lưu thông tin: ' + (err.response?.data?.error || err.message));
      fetchKyDetail(kyInfo.id);
    }
  };

  const handleKeyDownRecipientField = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRecipientField();
    } else if (e.key === 'Escape') {
      setEditingRecipientCell(null);
    }
  };

  // ─── Xuất file Excel ──────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!kyInfo?.id) return;
    const url = `${api.defaults.baseURL || ''}/api/ketoan/ky-tong-hop/${kyInfo.id}/export-excel`;
    window.open(url, '_blank');
  };

  // ─── Tạo nội dung HTML in & xuất PDF chuẩn khổ A4 Ngang ────────────────────────
  const generateTongHopPrintHtml = (
    customRows = null,
    isFirstPage = true,
    isLastPage = true,
    pageNum = 1,
    totalPages = 1,
    isPrintMode = false
  ) => {
    if (!kyInfo) return '';
    const tuDMY = formatDateDMY(kyInfo.tu_ngay);
    const denDMY = formatDateDMY(kyInfo.den_ngay);
    let dayStr = '08', monthStr = '10', yearStr = '2026';
    if (ngayLapHienThi) {
      const parts = ngayLapHienThi.split('-');
      if (parts.length === 3) {
        yearStr = parts[0];
        monthStr = parts[1];
        dayStr = parts[2];
      }
    }
    const todayStr = `Thành phố Hồ Chí Minh, Ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`;

    const activeCols = columns.filter((col) => col.kich_hoat !== false);

    const theadCols = activeCols
      .map((c) => {
        const disp = getColDisplay(c);
        let bg = '#1e40af';
        let border = '#1d4ed8';

        if (disp.type === 'green') {
          bg = '#16a34a';
          border = '#15803d';
        } else if (disp.type === 'days') {
          bg = '#0284c7';
          border = '#0369a1';
        } else if (disp.type === 'nguon') {
          bg = '#6366f1';
          border = '#4f46e5';
        }

        const thBg = isPrintMode ? '#ffffff' : bg;
        const thColor = isPrintMode ? '#000000' : '#ffffff';
        const thBorder = isPrintMode ? '#000000' : border;
        const subColor = isPrintMode ? '#000000' : '#ffffff';

        return `
          <th style="padding: 3.5px 2px; font-size: 7.5pt; border: 1px solid ${thBorder}; text-align: center; background: ${thBg} !important; color: ${thColor} !important; font-weight: bold; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <div style="font-size: 7.8pt; line-height: 1.15; font-weight: bold;">${disp.title}</div>
            <div style="font-size: 6.8pt; font-weight: normal; opacity: ${isPrintMode ? '1' : '0.92'}; color: ${subColor}; margin-top: 1px;">(${disp.sub})</div>
          </th>
        `;
      })
      .join('');

    const displayRows = customRows || filteredRecipients;

    const tbodyRows = displayRows
      .map((r, idx) => {
        const colTds = activeCols
          .map((c) => {
            let ct = r.chi_tiet ? r.chi_tiet[c.ma_khoan_chi] : null;
            if (!ct && Array.isArray(r.chi_tiet_khoan_chi)) {
              ct = r.chi_tiet_khoan_chi.find((item) => item.ma_khoan_chi === c.ma_khoan_chi);
            }
            const v = parseFloat(ct?.thanh_tien) || 0;
            const cellColor = isPrintMode ? '#000000' : (v > 0 ? '#0f172a' : '#94a3b8');
            const cellBorder = isPrintMode ? '#000000' : '#cbd5e1';
            return `<td style="padding: 2.2px 3px; font-size: 7.8pt; border: 1px solid ${cellBorder}; text-align: ${v > 0 ? 'right' : 'center'}; white-space: nowrap; color: ${cellColor}; font-weight: ${v > 0 ? '500' : 'normal'}; background: #ffffff !important;">${v > 0 ? formatVND(v) : ''}</td>`;
          })
          .join('');

        const rowBg = isPrintMode ? '#ffffff' : (idx % 2 === 1 ? '#f8fafc' : '#ffffff');
        const borderColor = isPrintMode ? '#000000' : '#cbd5e1';
        const sttColor = isPrintMode ? '#000000' : '#334155';
        const nameColor = isPrintMode ? '#000000' : '#0f172a';
        const totalBg = isPrintMode ? '#ffffff' : '#ecfdf5';
        const totalColor = isPrintMode ? '#000000' : '#047857';
        const tkColor = isPrintMode ? '#000000' : '#0284c7';
        const gcColor = isPrintMode ? '#000000' : '#475569';

        return `
          <tr style="background-color: ${rowBg} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <td style="padding: 2.2px 2px; font-size: 7.8pt; border: 1px solid ${borderColor}; text-align: center; color: ${sttColor}; font-weight: 500;">${r.stt || idx + 1}</td>
            <td style="padding: 2.2px 5px; font-size: 8pt; border: 1px solid ${borderColor}; text-align: left; font-weight: 600; color: ${nameColor}; white-space: nowrap;">${r.ho_ten}</td>
            ${colTds}
            <td style="padding: 2.2px 4px; font-size: 8pt; border: 1px solid ${borderColor}; text-align: right; font-weight: bold; background: ${totalBg} !important; color: ${totalColor}; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${formatVND(r.tong_tien)}</td>
            <td style="padding: 2.2px 3px; font-size: 7.5pt; border: 1px solid ${borderColor}; text-align: center; font-family: Consolas, monospace; color: ${tkColor}; font-weight: 600;">${(r.so_tai_khoan && r.so_tai_khoan !== '-') ? r.so_tai_khoan : ''}</td>
            <td style="padding: 2.2px 3px; font-size: 7.5pt; border: 1px solid ${borderColor}; text-align: center; color: ${gcColor};">${(r.ghi_chu && r.ghi_chu !== '-') ? r.ghi_chu : ''}</td>
          </tr>
        `;
      })
      .join('');

    const colFooterTds = activeCols
      .map((c) => {
        const sum = columnSums.sums[c.ma_khoan_chi] || 0;
        const cellBorder = isPrintMode ? '#000000' : '#cbd5e1';
        const cellColor = isPrintMode ? '#000000' : '#0f172a';
        return `<td style="padding: 3.5px 3px; font-size: 8pt; border: 1px solid ${cellBorder}; text-align: right; font-weight: bold; color: ${cellColor}; white-space: nowrap; background: #ffffff !important;">${sum > 0 ? formatVND(sum) : ''}</td>`;
      })
      .join('');

    const pageCountBadge = totalPages > 1 ? `<span style="font-size: 8pt; font-weight: bold; color: #64748b; margin-left: 8px;">(Trang ${pageNum}/${totalPages})</span>` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>BẢNG TỔNG HỢP CB-GV-NV THAM GIA CÔNG TÁC BÁN TRÚ NH ${effectiveNamHoc}${cleanKyTen ? ' - ' + cleanKyTen : ''}</title>
        <style>
          @page { size: A4 landscape; margin: 5mm 6mm 5mm 6mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 8.5pt; color: #000; margin: 0; padding: 0; background: #ffffff; width: 100%; }
          .thct-print-wrapper { width: 100%; font-family: 'Times New Roman', Times, serif; font-size: 8.5pt; color: #000000; background: #ffffff; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          th, td { vertical-align: middle; }
          .hdr-title { text-align: center; font-size: 12.5pt; font-weight: bold; text-transform: uppercase; margin-top: 2px; margin-bottom: 2px; color: ${isPrintMode ? '#000000' : '#b91c1c'}; letter-spacing: 0.3px; }
          .hdr-sub { text-align: center; font-style: italic; font-size: 8.5pt; margin-bottom: 4px; color: ${isPrintMode ? '#000000' : '#1e40af'}; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 10px; page-break-inside: avoid; break-inside: avoid; }
          .sig-col { text-align: center; font-size: 8.5pt; }
          .sig-space { height: 46px; }
          .sig-name { font-weight: bold; font-size: 9pt; color: #000000; }
          @media print {
            body, .thct-print-wrapper {
              background: #ffffff !important;
              color: #000000 !important;
              -webkit-print-color-adjust: economy !important;
              print-color-adjust: economy !important;
            }
            table, th, td, tr {
              background: #ffffff !important;
              background-color: #ffffff !important;
              color: #000000 !important;
              border-color: #000000 !important;
            }
            .hdr-title, .hdr-sub, .sig-name, div, span, b, p {
              color: #000000 !important;
            }
            tr { page-break-inside: avoid !important; break-inside: avoid !important; }
            thead { display: table-header-group !important; }
            .sig-row { page-break-inside: avoid !important; break-inside: avoid !important; }
          }
        </style>
      </head>
      <body>
        <div class="thct-print-wrapper">
          ${
            isFirstPage
              ? `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
              <div style="text-align: center; width: 45%;">
                <div style="font-size: 8pt; font-weight: 600; text-transform: uppercase; color: ${isPrintMode ? '#000000' : '#334155'};">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
                <div style="font-size: 9pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; color: #000000;">TRƯỜNG THPT LÊ THI HỒNG GẤM</div>
              </div>
              <div style="text-align: center; width: 50%;">
                <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #000000;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                <div style="font-size: 8pt; font-weight: 600; text-decoration: underline; color: ${isPrintMode ? '#000000' : '#334155'};">Độc lập - Tự do - Hạnh phúc</div>
              </div>
            </div>

            <div class="hdr-title">BẢNG TỔNG HỢP CB-GV-NV THAM GIA CÔNG TÁC BÁN TRÚ NH ${effectiveNamHoc}</div>
            <div class="hdr-sub">${cleanKyTen ? `<b style="${isPrintMode ? 'color: #000000;' : 'color: #1e40af;'}">${cleanKyTen}</b> ` : ''}(Từ ngày ${tuDMY} đến ngày ${denDMY})${pageCountBadge}</div>
            `
              : `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1.5px solid ${isPrintMode ? '#000000' : '#1e3a8a'}; padding-bottom: 3px;">
              <div style="font-size: 8.5pt; font-weight: bold; color: ${isPrintMode ? '#000000' : '#b91c1c'}; text-transform: uppercase;">
                BẢNG TỔNG HỢP CB-GV-NV THAM GIA CÔNG TÁC BÁN TRÚ NH ${effectiveNamHoc}${cleanKyTen ? ' - ' + cleanKyTen : ''}
              </div>
              <div style="font-size: 8pt; font-weight: bold; color: ${isPrintMode ? '#000000' : '#1e40af'};">
                Trang ${pageNum}/${totalPages}
              </div>
            </div>
            `
          }

          <table>
            <thead>
              <tr>
                <th style="padding: 3.5px 2px; font-size: 7.5pt; width: 28px; background: ${isPrintMode ? '#ffffff' : '#1e3a8a'} !important; color: ${isPrintMode ? '#000000' : '#ffffff'} !important; text-align: center; font-weight: bold; border: 1px solid ${isPrintMode ? '#000000' : '#172554'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">STT</th>
                <th style="padding: 3.5px 4px; font-size: 7.8pt; min-width: 120px; background: ${isPrintMode ? '#ffffff' : '#1e3a8a'} !important; color: ${isPrintMode ? '#000000' : '#ffffff'} !important; text-align: center; font-weight: bold; border: 1px solid ${isPrintMode ? '#000000' : '#172554'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">HỌ VÀ TÊN</th>
                ${theadCols}
                <th style="padding: 3.5px 4px; font-size: 8pt; width: 84px; background: ${isPrintMode ? '#ffffff' : '#fde047'} !important; color: ${isPrintMode ? '#000000' : '#0f172a'} !important; text-align: center; font-weight: 800; border: 1px solid ${isPrintMode ? '#000000' : '#eab308'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">TỔNG CỘNG</th>
                <th style="padding: 3.5px 3px; font-size: 7.5pt; width: 85px; background: ${isPrintMode ? '#ffffff' : '#0284c7'} !important; color: ${isPrintMode ? '#000000' : '#ffffff'} !important; text-align: center; font-weight: bold; border: 1px solid ${isPrintMode ? '#000000' : '#0369a1'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">SỐ TÀI KHOẢN</th>
                <th style="padding: 3.5px 3px; font-size: 7.5pt; width: 68px; background: ${isPrintMode ? '#ffffff' : '#475569'} !important; color: ${isPrintMode ? '#000000' : '#ffffff'} !important; text-align: center; font-weight: bold; border: 1px solid ${isPrintMode ? '#000000' : '#334155'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">GHI CHÚ</th>
              </tr>
            </thead>
            <tbody>
              ${tbodyRows}
              ${
                isLastPage
                  ? `
              <tr style="background: ${isPrintMode ? '#ffffff' : '#fef08a'} !important; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                <td colspan="2" style="padding: 3.5px 4px; font-size: 8.5pt; text-align: center; font-weight: bold; color: #000000; border: 1px solid ${isPrintMode ? '#000000' : '#cbd5e1'}; background: ${isPrintMode ? '#ffffff' : '#fef08a'} !important;">TỔNG CỘNG</td>
                ${colFooterTds}
                <td style="padding: 3.5px 4px; font-size: 8.5pt; text-align: right; font-weight: 800; color: ${isPrintMode ? '#000000' : '#dc2626'}; background: ${isPrintMode ? '#ffffff' : '#fde047'} !important; white-space: nowrap; border: 1px solid ${isPrintMode ? '#000000' : '#cbd5e1'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${formatVND(columnSums.grandTotal)}</td>
                <td colspan="2" style="background: ${isPrintMode ? '#ffffff' : '#fef08a'} !important; border: 1px solid ${isPrintMode ? '#000000' : '#cbd5e1'}; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></td>
              </tr>
              `
                  : ''
              }
            </tbody>
          </table>

          ${
            isLastPage
              ? `
          <div style="margin-top: 5px; font-style: italic; font-size: 8pt; color: #000000;">
            * Số tiền bằng chữ: <b style="${isPrintMode ? 'color: #000000;' : 'color: #1e3a8a;'}">${docSoThanhChu(columnSums.grandTotal)}</b>
          </div>

          <div class="sig-row">
            <div class="sig-col" style="width: 36%;">
              <div style="height: 14px;"></div>
              <div style="font-weight: bold; color: #000000; font-size: 9pt;">Người lập</div>
              <div style="font-size: 7.5pt; font-style: italic; color: ${isPrintMode ? '#000000' : '#64748b'}; margin-top: 1px;">(Ký, ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">${user?.fullname || user?.username || kyInfo?.created_by_name || 'Kế toán'}</div>
            </div>
            <div class="sig-col" style="width: 44%;">
              <div style="font-style: italic; font-size: 8pt; color: ${isPrintMode ? '#000000' : '#334155'}; margin-bottom: 2px;">${todayStr}</div>
              <div style="font-weight: bold; color: #000000; font-size: 9pt;">GIÁM ĐỐC</div>
              <div style="font-size: 7.5pt; font-style: italic; color: ${isPrintMode ? '#000000' : '#64748b'}; margin-top: 1px;">(Ký, ghi rõ họ tên)</div>
              <div class="sig-space"></div>
              <div class="sig-name">Vũ Quốc Phong</div>
            </div>
          </div>
          `
              : `
          <div style="text-align: right; font-style: italic; font-size: 8pt; color: #64748b; margin-top: 5px;">
            (Xem tiếp trang ${pageNum + 1}...)
          </div>
          `
          }
        </div>
      </body>
      </html>
    `;
  };

  // ─── In bảng trực tiếp qua hidden iframe ──────────────────────────────────────
  const handlePrint = () => {
    if (!kyInfo?.id) return;
    const html = generateTongHopPrintHtml(filteredRecipients, true, true, 1, 1, true);
    let iframe = document.getElementById('thct-print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'thct-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
    }, 350);
  };

  // ─── Xuất file PDF (A4 Ngang) trực tiếp bằng html2canvas + jsPDF ─────────────
  const handleExportPDF = async () => {
    if (!kyInfo?.id || isExportingPDF) return;
    setIsExportingPDF(true);
    let container = null;
    try {
      const displayRows = filteredRecipients;

      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '0';
      container.style.top = '0';
      container.style.width = '1122px';
      container.style.minHeight = '794px';
      container.style.padding = '5mm 6mm';
      container.style.background = '#ffffff';
      container.style.zIndex = '-9999';
      container.style.boxSizing = 'border-box';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);

      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
        compress: true,
      });

      // Nếu số lượng nhân sự <= 30 (như 29 nhân sự hiện tại), xuất trọn vẹn trên 1 trang duy nhất
      if (displayRows.length <= 30) {
        container.innerHTML = generateTongHopPrintHtml(displayRows, true, true, 1, 1);
        await new Promise((r) => setTimeout(r, 120));

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1122,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const renderedHeightMm = (canvas.height * 297) / canvas.width;
        if (renderedHeightMm > 210) {
          const finalHeight = 210;
          const finalWidth = (210 * canvas.width) / canvas.height;
          const xOffset = (297 - finalWidth) / 2;
          pdf.addImage(imgData, 'JPEG', xOffset, 0, finalWidth, finalHeight, undefined, 'FAST');
        } else {
          pdf.addImage(imgData, 'JPEG', 0, 0, 297, renderedHeightMm, undefined, 'FAST');
        }
      } else {
        // Nếu số lượng nhân sự > 30 (chia thành nhiều trang chuẩn chỉnh từng trang, không cắt đôi dòng)
        const ROWS_PAGE_1 = 24;
        const ROWS_PER_SUB_PAGE = 26;
        const pages = [];

        pages.push(displayRows.slice(0, ROWS_PAGE_1));
        let rem = displayRows.slice(ROWS_PAGE_1);
        while (rem.length > 0) {
          pages.push(rem.slice(0, ROWS_PER_SUB_PAGE));
          rem = rem.slice(ROWS_PER_SUB_PAGE);
        }

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const isFirstPage = pIdx === 0;
          const isLastPage = pIdx === pages.length - 1;
          const pageRows = pages[pIdx];

          container.innerHTML = generateTongHopPrintHtml(
            pageRows,
            isFirstPage,
            isLastPage,
            pIdx + 1,
            pages.length
          );
          await new Promise((r) => setTimeout(r, 100));

          const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 1122,
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.98);
          if (pIdx > 0) {
            pdf.addPage('a4', 'landscape');
          }

          const renderedHeightMm = (canvas.height * 297) / canvas.width;
          if (renderedHeightMm > 210) {
            const finalHeight = 210;
            const finalWidth = (210 * canvas.width) / canvas.height;
            const xOffset = (297 - finalWidth) / 2;
            pdf.addImage(imgData, 'JPEG', xOffset, 0, finalWidth, finalHeight, undefined, 'FAST');
          } else {
            pdf.addImage(imgData, 'JPEG', 0, 0, 297, renderedHeightMm, undefined, 'FAST');
          }
        }
      }

      pdf.save(`Bang_Tong_Hop_CB_GV_NV_NH_${effectiveNamHoc}_${(cleanKyTen || 'Ban_Tru').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (err) {
      console.error('Lỗi xuất file PDF:', err);
      alert('Không thể tạo file PDF: ' + err.message);
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      setIsExportingPDF(false);
    }
  };

  // ─── Mở thiết lập kế toán ─────────────────────────────────────────────────────
  const handleOpenSettings = () => {
    fetchSettings();
    setEditingCategory(null);
    setCategoryForm({
      ma_khoan_chi: '',
      ten_khoan_chi: '',
      loai_tinh: 'truc_tiep',
      don_gia_mac_dinh: 0,
      tan_suat: 'dinh_ky',
      thu_tu_hien_thi: 10,
      kich_hoat: true,
    });
    setShowSettingsModal(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/ketoan/danh-muc-khoan-chi', {
        id: editingCategory ? editingCategory.id : undefined,
        ...categoryForm,
      });
      if (res.data?.ok) {
        alert(editingCategory ? 'Cập nhật khoản chi thành công.' : 'Thêm khoản chi mới thành công.');
        fetchSettings();
        if (kyInfo?.id) {
          fetchKyDetail(kyInfo.id);
        }
        setShowCategoryEditModal(false);
        setEditingCategory(null);
        setCategoryForm({
          ma_khoan_chi: '',
          ten_khoan_chi: '',
          loai_tinh: 'truc_tiep',
          don_gia_mac_dinh: 0,
          tan_suat: 'dinh_ky',
          thu_tu_hien_thi: 10,
          kich_hoat: true,
        });
      }
    } catch (err) {
      alert('Không thể lưu danh mục: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleToggleCategoryActive = async (cat) => {
    const action = cat.kich_hoat ? 'ngừng sử dụng' : 'kích hoạt lại';
    if (!window.confirm(`Bạn có chắc muốn ${action} khoản chi "${cat.ten_khoan_chi}"?`)) return;
    try {
      const res = await api.post('/api/ketoan/danh-muc-khoan-chi', {
        id: cat.id,
        ten_khoan_chi: cat.ten_khoan_chi,
        kich_hoat: !cat.kich_hoat,
      });
      if (res.data?.ok) {
        fetchSettings();
        if (kyInfo?.id) {
          fetchKyDetail(kyInfo.id);
        }
      }
    } catch (err) {
      alert('Lỗi thao tác: ' + (err.response?.data?.error || err.message));
    }
  };



  // Helper render ô tiền
  const renderCellContent = (recipient, col) => {
    let ct = recipient.chi_tiet ? recipient.chi_tiet[col.ma_khoan_chi] : null;
    if (!ct && Array.isArray(recipient.chi_tiet_khoan_chi)) {
      ct = recipient.chi_tiet_khoan_chi.find((c) => c.ma_khoan_chi === col.ma_khoan_chi);
    }
    const amount = parseFloat(ct?.thanh_tien) || 0;

    const nameNorm = (recipient.ho_ten || '').toLowerCase();
    const isPhamThiThanhHa = nameNorm.includes('thanh hà');
    const isHongCam = nameNorm.includes('hồng cẩm') || nameNorm.includes('trần thị hồng cẩm');
    const isVuQuocPhong = nameNorm.includes('vũ quốc phong') || nameNorm.includes('quốc phong');
    const isHuynhDucVinh = isHuynhDucVinhRecipient(recipient);

    // Xác định tần suất: ưu tiên cấu hình trên từng ô ct.tan_suat -> fallback theo nhân sự / danh mục
    const effectiveTanSuat = ct?.tan_suat || (
      (isPhamThiThanhHa && col.ma_khoan_chi === 'tiep_nhan_vd') ? 'dinh_ky' :
      (isHongCam && col.ma_khoan_chi === 'cap_nhat_tt') ? 'dinh_ky' :
      (col.ma_khoan_chi === 'vs_bv') ? 'dinh_ky' :
      (col.tan_suat || 'dinh_ky')
    );

    let cellClass = 'money-cell';
    const loai = col.loai_tinh || col.loai_tinh_toan || '';
    if (loai.startsWith('nguon_')) {
      cellClass += ' source-cell';
    } else if (loai === 'ngay_don_gia' || loai === 'so_ngay_don_gia') {
      cellClass += ' days-cell';
    } else {
      cellClass += ' direct-cell';
    }

    // Chỉ tô màu nổi bật khi có số tiền phát sinh > 0
    if (amount > 0) {
      if ((isVuQuocPhong || isHuynhDucVinh) && col.ma_khoan_chi === 'gs_ban_tru') {
        // Vũ Quốc Phong và Huỳnh Đức Vịnh trực giám sát bán trú đều tô vàng
        cellClass += ' thct-cell-yellow-highlight';
      } else if (
        col.ma_khoan_chi === 'tiep_nhan_vd' ||
        col.ma_khoan_chi === 'cap_nhat_tt' ||
        col.ma_khoan_chi === 'vs_bv'
      ) {
        // Chỉ áp dụng các ô trong 3 cột màu xanh:
        // Nếu định kì thì màu đỏ, nền đỏ; còn không (1 lần) thì màu xanh
        if (effectiveTanSuat === 'dinh_ky') {
          cellClass += ' thct-cell-red-highlight';
        } else {
          cellClass += ' thct-cell-green';
        }
      }
    }

    const isLocked = isCsdlSourceCol(col, recipient);
    if (isLocked) {
      cellClass += ' csdl-locked-cell';
    }

    const hasAdj = ct?.tien_dieu_chinh && parseFloat(ct.tien_dieu_chinh) !== 0;
    if (hasAdj) {
      cellClass += ' has-adj';
    }

    const hasNote = Boolean(ct?.ghi_chu && ct.ghi_chu.trim());
    if (hasNote) {
      cellClass += ' has-note';
    }

    const customNote = hasNote ? `💬 CHÚ THÍCH: ${ct.ghi_chu.trim()}` : '';

    let tooltip;
    if (col.ma_khoan_chi === 'tiep_nhan_vd' || col.ma_khoan_chi === 'cap_nhat_tt' || col.ma_khoan_chi === 'vs_bv') {
      const tanSuatLabel = effectiveTanSuat === 'dinh_ky'
        ? 'Định kỳ (Màu đỏ, nền đỏ - Phụ cấp cố định hàng tháng)'
        : 'Một lần (Màu xanh - Phụ cấp phát sinh đột xuất)';
      const mainInfo = amount > 0
        ? `${recipient.ho_ten} | ${col.ten_khoan_chi}: ${formatVND(amount)}\n• Phân mục: ${tanSuatLabel}\n(Nhấn vào ô để xem / chỉnh sửa)`
        : `${recipient.ho_ten} | ${col.ten_khoan_chi}: Chưa có số tiền (0 đ)\n(Nhấn vào ô để nhập số tiền & ghi chú)`;
      tooltip = hasNote ? `${customNote}\n────────────────────────\n${mainInfo}` : mainInfo;
    } else if (hasAdj) {
      const mainInfo = `${recipient.ho_ten} | Điều chỉnh: ${parseFloat(ct.tien_dieu_chinh) > 0 ? '+' : ''}${formatVND(ct.tien_dieu_chinh)} (${ct.ly_do_dieu_chinh || 'Không có lý do'})`;
      tooltip = hasNote ? `${customNote}\n────────────────────────\n${mainInfo}` : mainInfo;
    } else if (amount === 0) {
      const mainInfo = `${recipient.ho_ten} | ${col.ten_khoan_chi}: Chưa có ca trực (0 đ)`;
      tooltip = hasNote ? `${customNote}\n────────────────────────\n${mainInfo}` : mainInfo;
    } else {
      // Khi có số tiền > 0: tính toán số ca/ngày chuẩn xác và làm tròn thành số nguyên
      const effectiveDonGia = parseFloat(
        ct?.don_gia || col.don_gia_mac_dinh || (
          col.ma_khoan_chi === 'gs_ban_tru' ? 250000 :
          col.ma_khoan_chi === 'y_te' ? 70000 :
          col.ma_khoan_chi === 'truc_phong' ? 180000 : 100000
        )
      ) || 0;
      const rawDays = ct?.so_ngay !== undefined && ct?.so_ngay !== null && Number(ct.so_ngay) > 0
        ? Number(ct.so_ngay)
        : (effectiveDonGia > 0 ? Math.round(amount / effectiveDonGia) : 0);
      const effectiveDays = Math.round(rawDays);

      let mainInfo;
      if (col.ma_khoan_chi === 'truc_phong') {
        const dg = effectiveDonGia || 180000;
        mainInfo = `${recipient.ho_ten} | Trực phòng: ${formatVND(amount)} (${effectiveDays} ca ngủ × ${formatVND(dg)})`;
      } else if (col.ma_khoan_chi === 'bt_an') {
        const dg = effectiveDonGia || 100000;
        mainInfo = `${recipient.ho_ten} | Bán trú ăn: ${formatVND(amount)} (${effectiveDays} ca ăn × ${formatVND(dg)})`;
      } else if (col.ma_khoan_chi === 'gs_an') {
        const dg = effectiveDonGia || 100000;
        mainInfo = `${recipient.ho_ten} | Giám sát ăn: ${formatVND(amount)} (${effectiveDays} ca GS × ${formatVND(dg)})`;
      } else if (col.ma_khoan_chi === 'thiet_bi') {
        const dg = effectiveDonGia || 100000;
        mainInfo = `${recipient.ho_ten} | Trực thiết bị: ${formatVND(amount)} (${effectiveDays} ca × ${formatVND(dg)})`;
      } else if (col.ma_khoan_chi === 'y_te') {
        const dg = effectiveDonGia || 70000;
        mainInfo = `${recipient.ho_ten} | Chăm sóc Y tế: ${formatVND(amount)} (${effectiveDays} ngày × ${formatVND(dg)})`;
      } else if (col.ma_khoan_chi === 'gs_ban_tru') {
        const dg = effectiveDonGia || 250000;
        mainInfo = `${recipient.ho_ten} | GS bán trú: ${formatVND(amount)} (${effectiveDays} ngày × ${formatVND(dg)})`;
      } else if (loai === 'ngay_don_gia' || loai === 'so_ngay_don_gia') {
        mainInfo = `${recipient.ho_ten} | ${col.ten_khoan_chi}: ${formatVND(amount)} (${effectiveDays} ngày × ${formatVND(effectiveDonGia)})`;
      } else {
        mainInfo = `${recipient.ho_ten} | ${col.ten_khoan_chi}: ${formatVND(amount)}\n(Nhấn để xem / sửa)`;
      }
      tooltip = hasNote ? `${customNote}\n────────────────────────\n${mainInfo}` : mainInfo;
    }

    const canEdit = !isLocked && !isKyDaChot;

    return (
      <td
        key={col.ma_khoan_chi}
        className={`${cellClass} ${isKyDaChot ? 'cell-locked-view' : ''}`}
        onClick={canEdit ? () => handleOpenCellEdit(recipient, col, ct) : undefined}
        style={isKyDaChot ? { cursor: 'default' } : undefined}
        title={tooltip}
      >
        {amount > 0 ? formatTien(amount) : ''}
      </td>
    );
  };

  return (
    <div className="thct-container">
      {/* ─── THANH ĐIỀU KHIỂN TINH GỌN (2 HÀNG CÂN ĐỐI) ─── */}
      <div className="thct-toolbar-compact">
        {/* HÀNG 1: Tiêu đề + Bộ chọn Kỳ + Trạng thái ──── Chỉ số tài chính tổng hợp */}
        <div className="thct-tb-row1">
          <div className="thct-tb-left">
            <span className="thct-app-badge">
              <i className="fas fa-file-invoice-dollar"></i> KẾ TOÁN BÁN TRÚ
            </span>
            <div className="thct-period-picker">
              <label><i className="far fa-calendar-alt"></i> Kỳ:</label>
              <select
                className="thct-select-sm"
                value={selectedKyId || ''}
                onChange={(e) => setSelectedKyId(parseInt(e.target.value))}
              >
                {kyList.length === 0 && (
                  <option value="">-- Chưa có kỳ tổng hợp nào --</option>
                )}
                {/* 1. Nhóm Kỳ Hệ Thống (Thời gian thực) */}
                {kyList.filter((k) => k.ten_ky?.toLowerCase().includes('hệ thống') || k.created_by_name === 'Hệ thống').length > 0 && (
                  <optgroup label="⚡ Kỳ hệ thống (Thời gian thực)">
                    {kyList
                      .filter((k) => k.ten_ky?.toLowerCase().includes('hệ thống') || k.created_by_name === 'Hệ thống')
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.ten_ky} ({formatDateDMY(k.tu_ngay)} - {formatDateDMY(k.den_ngay)})
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* 2. Nhóm Kỳ Kế Toán Đã Tạo (Đang thực hiện) */}
                {kyList.filter((k) => !k.ten_ky?.toLowerCase().includes('hệ thống') && k.created_by_name !== 'Hệ thống' && k.trang_thai === 'dang_dien_ra').length > 0 && (
                  <optgroup label="📋 Kỳ kế toán (Đang thực hiện)">
                    {kyList
                      .filter((k) => !k.ten_ky?.toLowerCase().includes('hệ thống') && k.created_by_name !== 'Hệ thống' && k.trang_thai === 'dang_dien_ra')
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.ten_ky} ({formatDateDMY(k.tu_ngay)} - {formatDateDMY(k.den_ngay)})
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* 3. Nhóm Các Kỳ Đã Chốt Sổ */}
                {kyList.filter((k) => k.trang_thai === 'da_chot').length > 0 && (
                  <optgroup label="🔒 Kỳ đã chốt sổ">
                    {kyList
                      .filter((k) => k.trang_thai === 'da_chot')
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.ten_ky} ({formatDateDMY(k.tu_ngay)} - {formatDateDMY(k.den_ngay)})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              {loading && (
                <i className="fas fa-spinner fa-spin" style={{ color: '#2563eb', marginLeft: '6px', fontSize: '13px' }} title="Đang tải dữ liệu..."></i>
              )}
            </div>
            {kyInfo?.trang_thai && (
              <span
                className={`thct-badge-status ${kyInfo.trang_thai}`}
                title={
                  kyInfo.trang_thai === 'dang_dien_ra'
                    ? `Kỳ hệ thống đang diễn ra: Tự động tổng hợp số liệu từ ${formatDateDMY(kyInfo.tu_ngay)} đến hôm nay (${formatDateDMY(kyInfo.den_ngay)}). Cuối tháng bấm "Chốt kỳ" để đóng sổ.`
                    : `Kỳ đã chốt sổ: Số liệu đã đóng băng an toàn (${formatDateDMY(kyInfo.tu_ngay)} - ${formatDateDMY(kyInfo.den_ngay)}).`
                }
              >
                <i className={`fas fa-${kyInfo.trang_thai === 'da_chot' ? 'lock' : 'bolt'}`}></i>
                {kyInfo.trang_thai === 'da_chot' ? 'Đã chốt' : 'Đang diễn ra'}
              </span>
            )}
          </div>

          <div className="thct-metrics-group">
            <span className="thct-metric-pill thct-metric-total">
              Tổng tiền: <strong>{formatVND(columnSums.grandTotal)}</strong>
            </span>
          </div>
        </div>

        {/* HÀNG 2: Cụm nút thao tác (Đưa xuống) ──── Ô tìm kiếm */}
        <div className="thct-tb-row2">
          <div className="thct-tb-actions">
            <button className="thct-btn-sm thct-btn-primary" onClick={handleOpenCreateModal} title="Tạo kỳ tổng hợp chi trả mới">
              <i className="fas fa-plus"></i> Tạo kỳ
            </button>
            {kyInfo?.trang_thai !== 'da_chot' && (
              <button className="thct-btn-sm thct-btn-outline" onClick={handleOpenAddRecipient} title="Thêm giáo viên / nhân sự nhận chi trả">
                <i className="fas fa-user-plus"></i> Thêm người
              </button>
            )}
            {isSuperAdminOrAccountant && kyInfo?.id && (
              kyInfo.trang_thai === 'da_chot' ? (
                <div style={{ display: 'inline-flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="thct-btn-sm thct-btn-locked"
                    disabled
                    title="Kỳ đã chốt sổ, số liệu đã được lưu trữ"
                  >
                    <i className="fas fa-lock"></i> Đã chốt sổ
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      className="thct-btn-sm thct-btn-amber"
                      onClick={handleConfirmUnlock}
                      title="Super Admin: Mở lại kỳ đã chốt để kế toán sửa sai"
                    >
                      <i className="fas fa-lock-open"></i> Mở lại kỳ
                    </button>
                  )}
                </div>
              ) : (
                <button
                  className="thct-btn-sm thct-btn-amber"
                  onClick={handleToggleLock}
                  title="Khóa chốt kỳ số liệu (đồng bộ Báo cáo)"
                >
                  <i className="fas fa-lock"></i> Chốt kỳ
                </button>
              )
            )}
            {(isSuperAdmin || (isSuperAdminOrAccountant && kyInfo?.trang_thai !== 'da_chot')) && kyInfo?.id && (
              <>
                <button
                  className="thct-btn-sm thct-btn-outline"
                  onClick={handleOpenEditKy}
                  title="Sửa thông tin kỳ tổng hợp (Tên kỳ, từ ngày, đến ngày, ghi chú...)"
                >
                  <i className="fas fa-edit" style={{ color: '#2563eb' }}></i> Sửa kỳ
                </button>
                <button
                  className="thct-btn-sm thct-btn-outline"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={handleDeleteKy}
                  title="Xóa kỳ tổng hợp"
                >
                  <i className="fas fa-trash-alt"></i> Xóa kỳ
                </button>
              </>
            )}
            <button className="thct-btn-sm thct-btn-excel" onClick={handleExportExcel} disabled={!kyInfo?.id} title="Xuất dữ liệu ra file Excel chuẩn kế toán">
              <i className="fas fa-file-excel"></i> Xuất Excel
            </button>
            <button className="thct-btn-sm thct-btn-pdf" onClick={handleExportPDF} disabled={!kyInfo?.id || isExportingPDF} title="Xuất và tải file PDF khổ A4 Ngang">
              <i className={isExportingPDF ? "fas fa-spinner fa-spin" : "fas fa-file-pdf"}></i> {isExportingPDF ? 'Đang xuất PDF...' : 'Xuất PDF'}
            </button>
            <button className="thct-btn-sm thct-btn-print" onClick={handlePrint} disabled={!kyInfo?.id} title="In bảng tổng hợp hoặc lưu file PDF trực tiếp qua trình duyệt">
              <i className="fas fa-print"></i> In / Lưu PDF
            </button>
            {isSuperAdminOrAccountant && (
              <button className="thct-btn-sm thct-btn-outline" onClick={handleOpenSettings} title="Thiết lập danh mục khoản chi & đơn giá">
                <i className="fas fa-sliders-h"></i> Thiết lập
              </button>
            )}
          </div>

          <div className="thct-search-box">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Tìm tên người nhận..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
            {searchName && (
              <button type="button" onClick={() => setSearchName('')} className="thct-search-clear" title="Xóa tìm kiếm">
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Bảng Spreadsheet Tổng hợp ─── */}
      <div className="thct-table-card">
        <div className="thct-table-scroll">
          <table className="thct-table">
            <thead>
              <tr>
                <th className="thct-sticky-stt">STT</th>
                <th className="thct-sticky-name">HỌ VÀ TÊN</th>
                {columns.map((col) => {
                  const disp = getColDisplay(col);
                  return (
                    <th
                      key={col.ma_khoan_chi}
                      className={`thct-th-kc thct-th-${disp.type}`}
                      style={{ width: disp.width, minWidth: disp.width, maxWidth: disp.width }}
                      title={disp.fullTitle}
                    >
                      <div className="thct-col-title">
                        {disp.title}
                        {disp.isLocked && (
                          <i
                            className="fas fa-lock"
                            style={{ fontSize: '9px', marginLeft: '4px', opacity: 0.65, verticalAlign: 'middle' }}
                            title="Khoản chi cố định từ CSDL / Phân công nhiệm vụ (Không chỉnh sửa)"
                          ></i>
                        )}
                      </div>
                      <div className="thct-col-sub">{disp.sub}</div>
                    </th>
                  );
                })}
                <th className="thct-th-total" style={{ width: 88, minWidth: 88 }}>
                  <div className="thct-col-title">TỔNG CỘNG</div>
                  <div className="thct-col-sub">(VNĐ)</div>
                </th>
                <th className="thct-th-acc" style={{ width: 100, minWidth: 100 }} title="Nhấp vào ô bên dưới để nhập/sửa số tài khoản">
                  <div className="thct-col-title">TÀI KHOẢN</div>
                  <div className="thct-col-sub">Ngân hàng</div>
                </th>
                <th style={{ width: 125, minWidth: 105 }} title="Nhấp vào ô bên dưới để nhập/sửa ghi chú">
                  <div className="thct-col-title">GHI CHÚ</div>
                  <div className="thct-col-sub">(Kỳ chi trả)</div>
                </th>
                {kyInfo?.trang_thai !== 'da_chot' && (
                  <th style={{ width: 42, minWidth: 42, textAlign: 'center' }}>XÓA</th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (kyInfo?.trang_thai !== 'da_chot' ? 5 : 4)} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {loading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <i className="fas fa-spinner fa-spin" style={{ color: '#2563eb' }}></i>
                        Đang tải dữ liệu...
                      </span>
                    ) : kyList.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '16px' }}>
                        <i className="far fa-calendar-plus" style={{ fontSize: '2.5rem', color: '#94a3b8' }}></i>
                        <span style={{ fontSize: '1rem', fontWeight: 500, color: '#475569' }}>Hệ thống chưa có kỳ tổng hợp nào.</span>
                        <button
                          type="button"
                          className="thct-btn thct-btn-primary"
                          style={{ padding: '8px 18px', fontSize: '0.88rem' }}
                          onClick={handleOpenCreateModal}
                        >
                          <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Bấm vào đây để tạo kỳ mới
                        </button>
                      </div>
                    ) : (
                      'Chưa có người nhận nào trong kỳ tổng hợp này.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((nn, idx) => {
                  const tongTien = parseFloat(nn.tong_tien) || 0;

                  return (
                    <tr key={nn.id}>
                      <td className="thct-sticky-stt">{nn.stt || idx + 1}</td>
                      <td className="thct-sticky-name">
                        <strong style={{ color: '#0f172a' }}>{nn.ho_ten}</strong>
                      </td>

                      {/* Các cột khoản chi */}
                      {columns.map((col) => renderCellContent(nn, col))}

                      {/* Cột Tổng cộng */}
                      <td className="total-cell">
                        {formatTien(tongTien)}
                      </td>

                      {/* Cột Số tài khoản - Cho phép nhập/sửa trực tiếp */}
                      <td
                        className={`account-cell ${editingRecipientCell?.recipientId === nn.id && editingRecipientCell?.field === 'so_tai_khoan' ? 'is-editing' : ''}`}
                        onClick={!isKyDaChot ? () => handleStartEditRecipientField(nn, 'so_tai_khoan') : undefined}
                        title={isKyDaChot ? (nn.so_tai_khoan || 'Số tài khoản') : "Nhấp để nhập / sửa số tài khoản ngân hàng"}
                        style={isKyDaChot ? { cursor: 'default' } : undefined}
                      >
                        {editingRecipientCell?.recipientId === nn.id && editingRecipientCell?.field === 'so_tai_khoan' ? (
                          <input
                            type="text"
                            autoFocus
                            className="thct-inline-input"
                            value={editingRecipientCell.value}
                            onChange={(e) => setEditingRecipientCell({ ...editingRecipientCell, value: e.target.value })}
                            onBlur={handleSaveRecipientField}
                            onKeyDown={handleKeyDownRecipientField}
                            placeholder="Nhập số TK..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="thct-cell-text-wrapper">
                            <span>{(nn.so_tai_khoan && nn.so_tai_khoan !== '-') ? nn.so_tai_khoan : ''}</span>
                            {!isKyDaChot && <i className="fas fa-pen thct-cell-edit-icon" title="Sửa STK"></i>}
                          </div>
                        )}
                      </td>

                      {/* Cột Ghi chú - Cho phép nhập/sửa trực tiếp */}
                      <td
                        className={`note-cell ${editingRecipientCell?.recipientId === nn.id && editingRecipientCell?.field === 'ghi_chu' ? 'is-editing' : ''}`}
                        onClick={!isKyDaChot ? () => handleStartEditRecipientField(nn, 'ghi_chu') : undefined}
                        title={isKyDaChot ? (nn.ghi_chu || '') : (nn.ghi_chu ? `Ghi chú: ${nn.ghi_chu}\n(Nhấp để sửa)` : 'Nhấp để nhập ghi chú')}
                        style={isKyDaChot ? { cursor: 'default' } : undefined}
                      >
                        {editingRecipientCell?.recipientId === nn.id && editingRecipientCell?.field === 'ghi_chu' ? (
                          <input
                            type="text"
                            autoFocus
                            className="thct-inline-input"
                            value={editingRecipientCell.value}
                            onChange={(e) => setEditingRecipientCell({ ...editingRecipientCell, value: e.target.value })}
                            onBlur={handleSaveRecipientField}
                            onKeyDown={handleKeyDownRecipientField}
                            placeholder="Nhập ghi chú..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="thct-cell-text-wrapper" style={{ justifyContent: nn.ghi_chu ? 'flex-start' : 'center' }}>
                            <span
                              style={{
                                maxWidth: '120px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: nn.ghi_chu ? '#0f172a' : '#94a3b8',
                              }}
                            >
                              {(nn.ghi_chu && nn.ghi_chu !== '-') ? nn.ghi_chu : ''}
                            </span>
                            {!isKyDaChot && <i className="fas fa-pen thct-cell-edit-icon" title="Sửa ghi chú"></i>}
                          </div>
                        )}
                      </td>

                      {/* Thao tác xóa */}
                      {kyInfo?.trang_thai !== 'da_chot' && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="thct-btn thct-btn-danger"
                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteRecipient(nn.id, nn.ho_ten)}
                            title="Xóa người nhận"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Dòng Tổng cộng */}
            {filteredRecipients.length > 0 && (
              <tfoot>
                <tr>
                  <td className="thct-sticky-stt"></td>
                  <td className="thct-sticky-name" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                    TỔNG CỘNG
                  </td>
                  {columns.map((col) => (
                    <td key={col.ma_khoan_chi} className="money-cell">
                      {formatTien(columnSums.sums[col.ma_khoan_chi])}
                    </td>
                  ))}
                  <td className="grand-total money-cell">
                    {formatVND(columnSums.grandTotal)}
                  </td>
                  <td className="thct-tfoot-empty"></td>
                  <td className="thct-tfoot-empty"></td>
                  {kyInfo?.trang_thai !== 'da_chot' && <td className="thct-tfoot-empty"></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Tiền bằng chữ */}
        {filteredRecipients.length > 0 && (
          <div className="thct-table-footer-info">
            <div className="thct-in-words">
              Số tiền bằng chữ: <strong>{docSoThanhChu(columnSums.grandTotal)}</strong>
            </div>
            <div style={{ color: '#64748b' }}>
              Ngày lập: {formatDateDMY(ngayLapHienThi)} | Người lập: <strong>{user?.fullname || user?.username || kyInfo?.created_by_name || 'Kế toán'}</strong>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL: Tạo kỳ mới ─── */}
      {showCreateModal && (
        <div className="thct-modal-overlay">
          <div className="thct-modal-card">
            <div className="thct-modal-header">
              <h3>Tạo kỳ tổng hợp chi trả mới</h3>
              <button className="thct-modal-close" onClick={() => setShowCreateModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleCreateKy}>
              <div className="thct-modal-body">
                <div className="thct-form-group">
                  <label>Tên kỳ tổng hợp *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: TH T012026 hoặc Kỳ Tháng 01/2026"
                    className="thct-form-input"
                    value={createForm.ten_ky}
                    onChange={(e) => setCreateForm({ ...createForm, ten_ky: e.target.value })}
                  />
                </div>

                <div className="thct-form-row">
                  <div className="thct-form-group">
                    <label>Từ ngày *</label>
                    <input
                      type="date"
                      required
                      min={minCreateTuNgay}
                      className="thct-form-input"
                      value={createForm.tu_ngay}
                      onChange={(e) => setCreateForm({ ...createForm, tu_ngay: e.target.value })}
                    />
                    {maxExistingDenNgay && (
                      <div style={{ fontSize: '0.78rem', color: '#0284c7', marginTop: '4px' }}>
                        ℹ️ Tiếp nối từ <strong>{formatDateDMY(minCreateTuNgay)}</strong> (kỳ trước kết thúc ngày {formatDateDMY(maxExistingDenNgay)})
                      </div>
                    )}
                  </div>
                  <div className="thct-form-group">
                    <label>Đến ngày *</label>
                    <input
                      type="date"
                      required
                      min={createForm.tu_ngay || minCreateTuNgay}
                      className="thct-form-input"
                      value={createForm.den_ngay}
                      onChange={(e) => setCreateForm({ ...createForm, den_ngay: e.target.value })}
                    />
                  </div>
                </div>

                <div className="thct-form-group">
                  <label>Ngày lập báo cáo</label>
                  <input
                    type="date"
                    className="thct-form-input"
                    value={createForm.ngay_lap}
                    onChange={(e) => setCreateForm({ ...createForm, ngay_lap: e.target.value })}
                  />
                </div>

                <div className="thct-form-group">
                  <label>Ghi chú</label>
                  <textarea
                    rows={2}
                    placeholder="Ghi chú về đợt chi trả..."
                    className="thct-form-textarea"
                    value={createForm.ghi_chu}
                    onChange={(e) => setCreateForm({ ...createForm, ghi_chu: e.target.value })}
                  />
                </div>
              </div>
              <div className="thct-modal-footer">
                <button type="button" className="thct-btn" onClick={() => setShowCreateModal(false)} disabled={submittingCreate}>
                  Hủy
                </button>
                <button type="submit" className="thct-btn thct-btn-primary" disabled={submittingCreate}>
                  <i className={submittingCreate ? "fas fa-spinner fa-spin" : "fas fa-plus"} style={{ marginRight: '6px' }}></i>
                  {submittingCreate ? 'Đang khởi tạo...' : 'Khởi tạo kỳ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ─── MODAL: Thêm người nhận ─── */}
      {showAddRecipientModal && (
        <div className="thct-modal-overlay">
          <div className="thct-modal-card">
            <div className="thct-modal-header">
              <h3>Thêm người nhận vào kỳ tổng hợp</h3>
              <button className="thct-modal-close" onClick={() => setShowAddRecipientModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAddRecipient}>
              <div className="thct-modal-body">
                <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recipientType"
                      checked={!addRecipientForm.isCustom}
                      onChange={() => setAddRecipientForm({ ...addRecipientForm, isCustom: false })}
                    />
                    Chọn từ danh mục Giáo viên
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recipientType"
                      checked={addRecipientForm.isCustom}
                      onChange={() => setAddRecipientForm({ ...addRecipientForm, isCustom: true })}
                    />
                    Nhập người nhận ngoài danh mục
                  </label>
                </div>

                {!addRecipientForm.isCustom ? (
                  <div className="thct-form-group">
                    <label>Chọn giáo viên *</label>
                    <select
                      className="thct-form-select"
                      value={addRecipientForm.giao_vien_id}
                      onChange={(e) => setAddRecipientForm({ ...addRecipientForm, giao_vien_id: e.target.value })}
                      required
                    >
                      <option value="">-- Chọn giáo viên --</option>
                      {existingTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.ho_ten} {t.so_tai_khoan ? `(STK: ${t.so_tai_khoan})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="thct-form-group">
                      <label>Họ và tên *</label>
                      <input
                        type="text"
                        required
                        className="thct-form-input"
                        placeholder="Ví dụ: Nguyễn Văn A"
                        value={addRecipientForm.ho_ten}
                        onChange={(e) => setAddRecipientForm({ ...addRecipientForm, ho_ten: e.target.value })}
                      />
                    </div>
                    <div className="thct-form-group">
                      <label>Mã định danh nội bộ</label>
                      <input
                        type="text"
                        className="thct-form-input"
                        placeholder="Ví dụ: NV_NGOAI_01"
                        value={addRecipientForm.ma_dinh_danh}
                        onChange={(e) => setAddRecipientForm({ ...addRecipientForm, ma_dinh_danh: e.target.value })}
                      />
                    </div>
                    <div className="thct-form-row">
                      <div className="thct-form-group">
                        <label>Số tài khoản</label>
                        <input
                          type="text"
                          className="thct-form-input"
                          placeholder="Giữ nguyên số 0 đầu..."
                          value={addRecipientForm.so_tai_khoan}
                          onChange={(e) => setAddRecipientForm({ ...addRecipientForm, so_tai_khoan: e.target.value })}
                        />
                      </div>
                      <div className="thct-form-group">
                        <label>Ngân hàng</label>
                        <input
                          type="text"
                          className="thct-form-input"
                          placeholder="Ví dụ: Vietcombank, Sacombank"
                          value={addRecipientForm.ngan_hang}
                          onChange={(e) => setAddRecipientForm({ ...addRecipientForm, ngan_hang: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="thct-form-group">
                  <label>Ghi chú</label>
                  <input
                    type="text"
                    className="thct-form-input"
                    value={addRecipientForm.ghi_chu}
                    onChange={(e) => setAddRecipientForm({ ...addRecipientForm, ghi_chu: e.target.value })}
                  />
                </div>
              </div>
              <div className="thct-modal-footer">
                <button type="button" className="thct-btn" onClick={() => setShowAddRecipientModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="thct-btn thct-btn-primary">
                  Thêm vào danh sách
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Chỉnh sửa ô khoản chi ─── */}
      {showCellEditModal && editingCell && (
        <div className="thct-modal-overlay">
          <div className="thct-modal-card">
            <div className="thct-modal-header">
              <h3>
                Chỉnh sửa: {editingCell.category.ten_khoan_chi} ({editingCell.recipient.ho_ten})
              </h3>
              <button className="thct-modal-close" onClick={() => setShowCellEditModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveCellEdit}>
              <div className="thct-modal-body">
                {/* Khoản lấy từ nguồn */}
                {(editingCell.category.loai_tinh?.startsWith('nguon_') || editingCell.category.loai_tinh_toan?.startsWith('nguon_')) && (
                  <div className="thct-form-group" style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#1e40af', marginBottom: '4px' }}>
                      Khoản tiền tự động lấy từ Chấm công trực:
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e3a8a' }}>
                      {formatVND(editingCell.cellData.tien_nguon || editingCell.cellData.so_tien_nguon)}
                    </div>
                  </div>
                )}

                {/* Khoản tính theo ngày x đơn giá */}
                {(editingCell.category.loai_tinh === 'ngay_don_gia' ||
                  editingCell.category.loai_tinh === 'so_ngay_don_gia' ||
                  editingCell.category.loai_tinh_toan === 'ngay_don_gia') && (
                  <div className="thct-form-row">
                    <div className="thct-form-group">
                      <label>Số ngày thực hiện *</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        className="thct-form-input"
                        value={cellForm.so_ngay !== undefined && cellForm.so_ngay !== null ? Math.round(Number(cellForm.so_ngay)) : 0}
                        onChange={(e) => setCellForm({ ...cellForm, so_ngay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      />
                    </div>
                    <div className="thct-form-group">
                      <label>Đơn giá (đ/ngày)</label>
                      <input
                        type="text"
                        readOnly
                        className="thct-form-input"
                        style={{
                          backgroundColor: '#f1f5f9',
                          cursor: 'not-allowed',
                          color: '#1e293b',
                          fontWeight: 600,
                        }}
                        value={`${formatVND(cellForm.don_gia || editingCell.category?.don_gia_mac_dinh || 250000)} / ngày`}
                      />
                    </div>
                  </div>
                )}

                {/* Khoản nhập tiền trực tiếp & Hình thức tính (Định kỳ / Một lần) trên cùng một hàng đều đặn, đẹp mắt */}
                {(editingCell.category.loai_tinh === 'truc_tiep' || editingCell.category.loai_tinh_toan === 'nhap_truc_tiep') && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: ['vs_bv', 'tiep_nhan_vd', 'cap_nhat_tt'].includes(editingCell.category?.ma_khoan_chi)
                        ? '1fr 1.25fr'
                        : '1fr',
                      gap: '14px',
                      alignItems: 'start',
                      marginBottom: '12px',
                    }}
                  >
                    {/* Cột trái: Số tiền nhập trực tiếp */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                          minHeight: '22px',
                        }}
                      >
                        <label style={{ fontWeight: 600, fontSize: '0.84rem', color: '#1e293b', margin: 0 }}>
                          Số tiền (đ) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        {cellForm.so_tien_nhap > 0 && (
                          <span
                            style={{
                              color: '#2563eb',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              backgroundColor: '#eff6ff',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              border: '1px solid #bfdbfe',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatVND(cellForm.so_tien_nhap)}
                          </span>
                        )}
                      </div>
                      <div style={{ height: '48px', display: 'flex', alignItems: 'stretch' }}>
                        <input
                          type="number"
                          step="1000"
                          min="0"
                          required
                          className="thct-form-input"
                          style={{
                            width: '100%',
                            height: '100%',
                            padding: '0 12px',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#1e3a8a',
                            borderRadius: '8px',
                            border: '1.5px solid #cbd5e1',
                            boxSizing: 'border-box',
                          }}
                          value={cellForm.so_tien_nhap}
                          onChange={(e) => setCellForm({ ...cellForm, so_tien_nhap: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    {/* Cột phải: 2 cái lựa chọn (Định kỳ & Một lần) được đưa lên cùng hàng */}
                    {['vs_bv', 'tiep_nhan_vd', 'cap_nhat_tt'].includes(editingCell.category?.ma_khoan_chi) && (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '6px',
                            minHeight: '22px',
                          }}
                        >
                          <label style={{ fontWeight: 600, fontSize: '0.84rem', color: '#1e293b', margin: 0 }}>
                            Hình thức tính:
                          </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', height: '48px' }}>
                          <label
                            title="Định kỳ: Khoản cố định hàng tháng (màu đỏ, nền đỏ). Tự động kế thừa sang kỳ sau."
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              border: cellForm.tan_suat === 'dinh_ky' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                              backgroundColor: cellForm.tan_suat === 'dinh_ky' ? '#fef2f2' : '#ffffff',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxSizing: 'border-box',
                              height: '100%',
                            }}
                          >
                            <input
                              type="radio"
                              name="cell_tan_suat"
                              value="dinh_ky"
                              checked={cellForm.tan_suat === 'dinh_ky'}
                              onChange={() => setCellForm({ ...cellForm, tan_suat: 'dinh_ky' })}
                              style={{ accentColor: '#dc2626', width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, margin: 0 }}
                            />
                            <div style={{ lineHeight: 1.25 }}>
                              <div style={{ fontWeight: 'bold', color: cellForm.tan_suat === 'dinh_ky' ? '#dc2626' : '#1e293b', fontSize: '0.84rem' }}>
                                Định kỳ
                              </div>
                              <div style={{ fontSize: '0.7rem', color: cellForm.tan_suat === 'dinh_ky' ? '#b91c1c' : '#64748b' }}>
                                Hàng tháng (đỏ)
                              </div>
                            </div>
                          </label>

                          <label
                            title="Một lần (1 lần): Khoản phát sinh đột xuất (màu xanh). Sang kỳ khác tự động về 0 đ."
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              border: cellForm.tan_suat === 'mot_lan' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                              backgroundColor: cellForm.tan_suat === 'mot_lan' ? '#f0fdf4' : '#ffffff',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxSizing: 'border-box',
                              height: '100%',
                            }}
                          >
                            <input
                              type="radio"
                              name="cell_tan_suat"
                              value="mot_lan"
                              checked={cellForm.tan_suat === 'mot_lan'}
                              onChange={() => setCellForm({ ...cellForm, tan_suat: 'mot_lan' })}
                              style={{ accentColor: '#16a34a', width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, margin: 0 }}
                            />
                            <div style={{ lineHeight: 1.25 }}>
                              <div style={{ fontWeight: 'bold', color: cellForm.tan_suat === 'mot_lan' ? '#15803d' : '#1e293b', fontSize: '0.84rem' }}>
                                Một lần (1 lần)
                              </div>
                              <div style={{ fontSize: '0.7rem', color: cellForm.tan_suat === 'mot_lan' ? '#166534' : '#64748b' }}>
                                Phát sinh (xanh)
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Mục để người dùng nhập nội dung chú thích (hiện khi rê chuột vào ô) */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontSize: '0.82rem', marginBottom: '4px' }}>
                    <i className="fas fa-comment-dots" style={{ color: '#0284c7' }}></i>
                    <span>Nội dung chú thích (hiện khi rê chuột vào ô trên bảng):</span>
                  </label>
                  <input
                    type="text"
                    className="thct-form-input"
                    placeholder="Ví dụ: Phụ cấp kiểm tra cuối buổi, hỗ trợ thêm đợt 1..."
                    value={cellForm.ghi_chu || ''}
                    onChange={(e) => setCellForm({ ...cellForm, ghi_chu: e.target.value })}
                    style={{
                      width: '100%',
                      fontSize: '0.82rem',
                      padding: '6px 10px',
                      borderColor: cellForm.ghi_chu ? '#0284c7' : '#cbd5e1',
                      backgroundColor: cellForm.ghi_chu ? '#f0f9ff' : '#ffffff',
                    }}
                  />
                </div>

                {/* Phần điều chỉnh tăng/giảm */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Điều chỉnh bổ sung (nếu có):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        Số tiền điều chỉnh (+/-)
                        {cellForm.so_tien_dieu_chinh !== 0 && (
                          <span
                            style={{
                              marginLeft: '4px',
                              color: cellForm.so_tien_dieu_chinh > 0 ? '#16a34a' : '#dc2626',
                              fontWeight: 600,
                            }}
                          >
                            ({cellForm.so_tien_dieu_chinh > 0 ? '+' : ''}
                            {formatVND(cellForm.so_tien_dieu_chinh)})
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="1000"
                        className="thct-form-input"
                        style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                        placeholder="Ví dụ: 100000 hoặc -50000"
                        value={cellForm.so_tien_dieu_chinh}
                        onChange={(e) =>
                          setCellForm({ ...cellForm, so_tien_dieu_chinh: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        Lý do điều chỉnh
                      </label>
                      <input
                        type="text"
                        className="thct-form-input"
                        style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                        placeholder="Ví dụ: Trực bù ca ngày 12/01"
                        value={cellForm.ly_do_dieu_chinh}
                        onChange={(e) => setCellForm({ ...cellForm, ly_do_dieu_chinh: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Dự kiến thành tiền */}
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>Thành tiền sau điều chỉnh:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#0284c7' }}>
                    {formatVND(
                      (editingCell.category.loai_tinh === 'ngay_don_gia' ||
                      editingCell.category.loai_tinh === 'so_ngay_don_gia' ||
                      editingCell.category.loai_tinh_toan === 'ngay_don_gia'
                        ? (cellForm.so_ngay || 0) * (cellForm.don_gia || 0)
                        : editingCell.category.loai_tinh === 'truc_tiep' ||
                          editingCell.category.loai_tinh_toan === 'nhap_truc_tiep'
                        ? cellForm.so_tien_nhap || 0
                        : parseFloat(editingCell.cellData.tien_nguon || editingCell.cellData.so_tien_nguon) || 0) +
                        (cellForm.so_tien_dieu_chinh || 0)
                    )}
                  </strong>
                </div>
              </div>
              <div className="thct-modal-footer" style={{ padding: '10px 18px' }}>
                <button type="button" className="thct-btn" onClick={() => setShowCellEditModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="thct-btn thct-btn-primary">
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ─── MODAL: Thiết lập Kế toán & Nhật ký audit ─── */}
      {showSettingsModal && (
        <div className="thct-modal-overlay">
          <div className="thct-modal-card extra-wide">
            <div className="thct-modal-header">
              <h3>Thiết lập Kế toán Bán trú & Lịch sử thay đổi</h3>
              <button className="thct-modal-close" onClick={() => setShowSettingsModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="thct-modal-body">
              {/* Danh sách danh mục khoản chi */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#0f172a', fontWeight: 700 }}>
                  Danh mục các khoản chi đang cấu hình ({categoryList.length} khoản):
                </h4>
                <button
                  type="button"
                  className="thct-btn thct-btn-primary"
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryForm({
                      ma_khoan_chi: '',
                      ten_khoan_chi: '',
                      loai_tinh: 'truc_tiep',
                      don_gia_mac_dinh: 0,
                      tan_suat: 'dinh_ky',
                      thu_tu_hien_thi: (categoryList.length + 1) * 10,
                      kich_hoat: true,
                    });
                    setShowCategoryEditModal(true);
                  }}
                >
                  <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Thêm khoản chi mới
                </button>
              </div>

              <div style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '20px' }}>
                <table className="thct-diff-table">
                  <thead>
                    <tr>
                      <th>Thứ tự</th>
                      <th>Tên khoản chi</th>
                      <th>Cách tính</th>
                      <th style={{ textAlign: 'right' }}>Đơn giá</th>
                      <th>Tần suất</th>
                      <th style={{ textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryList.map((c) => (
                      <tr key={c.id}>
                        <td>{c.thu_tu_hien_thi}</td>
                        <td><strong>{c.ten_khoan_chi}</strong></td>
                        <td>
                          {c.loai_tinh === 'nguon_truc_an' && 'Từ Trực Ăn'}
                          {c.loai_tinh === 'nguon_truc_ngu' && 'Từ Trực Ngủ'}
                          {(c.loai_tinh === 'so_ngay_don_gia' || c.loai_tinh === 'ngay_don_gia') && 'Ngày × đơn giá'}
                          {c.loai_tinh === 'truc_tiep' && 'Nhập trực tiếp'}
                        </td>
                        <td className="money" style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                          {formatDonGia(c.don_gia_mac_dinh)}
                        </td>
                        <td>{formatTanSuat(c.tan_suat)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`thct-pay-badge ${c.kich_hoat ? 'da_chi_du' : 'chua_chi'}`}>
                            {c.kich_hoat ? 'Đang dùng' : 'Ngừng dùng'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="thct-btn"
                            style={{ padding: '3px 8px', fontSize: '0.76rem', marginRight: '4px' }}
                            onClick={() => {
                              setEditingCategory(c);
                              setCategoryForm({
                                ma_khoan_chi: c.ma_khoan_chi,
                                ten_khoan_chi: c.ten_khoan_chi,
                                loai_tinh: c.loai_tinh,
                                don_gia_mac_dinh: parseFloat(c.don_gia_mac_dinh) || 0,
                                tan_suat: c.tan_suat,
                                thu_tu_hien_thi: c.thu_tu_hien_thi,
                                kich_hoat: c.kich_hoat,
                              });
                              setShowCategoryEditModal(true);
                            }}
                          >
                            <i className="fas fa-edit" style={{ marginRight: '3px' }}></i> Sửa
                          </button>
                          <button
                            type="button"
                            className="thct-btn thct-btn-danger"
                            style={{ padding: '3px 8px', fontSize: '0.76rem' }}
                            onClick={() => handleToggleCategoryActive(c)}
                          >
                            {c.kich_hoat ? 'Khóa' : 'Bật'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Nhật ký cập nhật bên dưới */}
              <div className="thct-audit-box">
                <h4>
                  <i className="fas fa-history" style={{ color: '#64748b' }}></i>
                  Lịch sử cập nhật thiết lập kế toán:
                </h4>
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  <table className="thct-audit-table">
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Người thao tác</th>
                        <th>Hành động</th>
                        <th>Nội dung chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>
                            Chưa có lịch sử thay đổi nào được ghi lại.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {new Date(log.created_at).toLocaleString('vi-VN')}
                            </td>
                            <td>
                              <strong>{log.nguoi_thao_tac_ten}</strong> ({log.chuc_vu || 'Kế toán'})
                            </td>
                            <td>{log.hanh_dong}</td>
                            <td>{log.noi_dung}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="thct-modal-footer">
              <button type="button" className="thct-btn" onClick={() => setShowSettingsModal(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Chốt kỳ tổng hợp an toàn ─── */}
      {showChotKyModal && kyInfo?.id && (
        <div className="thct-modal-overlay">
          <div className="thct-modal-card" style={{ maxWidth: '520px' }}>
            <div
              className="thct-modal-header"
              style={{
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#ffffff',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.15rem',
                  }}
                >
                  <i className="fas fa-lock"></i>
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>
                    Chốt kỳ tổng hợp chi trả
                  </h3>
                  <div style={{ fontSize: '0.85rem', opacity: 0.95, marginTop: '2px' }}>
                    {kyInfo.ten_ky}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="thct-modal-close"
                style={{ color: '#fff' }}
                onClick={() => {
                  setShowChotKyModal(false);
                  setConfirmChotText('');
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form
              onSubmit={handleExecuteChotKy}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                className="thct-modal-body"
                style={{
                  padding: '16px 20px',
                  overflowY: 'auto',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {/* Khối hiển thị thời gian áp dụng chốt kỳ (Cố định theo kỳ đã tạo, không chỉnh sửa) */}
                <div
                  style={{
                    background: '#fff7ed',
                    border: '1.5px solid #ffedd5',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#9a3412',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i className="far fa-calendar-alt" style={{ marginRight: '6px' }}></i>
                    THỜI GIAN ÁP DỤNG CHỐT KỲ:
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      background: '#ffffff',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #fed7aa',
                      gap: '10px',
                    }}
                  >
                    {/* TỪ NGÀY */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#78716c', fontWeight: 700, marginBottom: '2px' }}>
                        TỪ NGÀY:
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ea580c' }}>
                        {formatDateDMY(kyInfo.tu_ngay) || '—'}
                      </div>
                    </div>

                    {/* Mũi tên */}
                    <div style={{ color: '#ea580c', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center' }}>
                      <i className="fas fa-arrow-right"></i>
                    </div>

                    {/* ĐẾN NGÀY */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#78716c', fontWeight: 700, marginBottom: '2px' }}>
                        ĐẾN NGÀY (CHỐT ĐẾN):
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ea580c' }}>
                        {formatDateDMY(kyInfo.den_ngay) || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tóm tắt số liệu xem trước */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tổng số người nhận:</span>
                      {loadingPreviewChot && <i className="fas fa-spinner fa-spin" style={{ color: '#ea580c' }}></i>}
                    </div>
                    <strong style={{ fontSize: '1.02rem', color: '#0f172a' }}>
                      {previewChotData ? previewChotData.tong_so_nguoi : filteredRecipients.length} nhân sự
                    </strong>
                  </div>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tổng tiền chi trả:</span>
                      {loadingPreviewChot && <i className="fas fa-spinner fa-spin" style={{ color: '#ea580c' }}></i>}
                    </div>
                    <strong style={{ fontSize: '1.02rem', color: '#ea580c' }}>
                      {formatVND(columnSums.grandTotal)}
                    </strong>
                  </div>
                </div>

                {/* Cảnh báo đóng băng */}
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    fontSize: '0.84rem',
                    color: '#991b1b',
                    lineHeight: 1.45,
                  }}
                >
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                  <strong>Lưu ý quan trọng:</strong> Sau khi chốt, toàn bộ số liệu công trực và số tiền sẽ được <strong>đóng băng cố định</strong> để bảo toàn số liệu kế toán.
                </div>

                {/* Ô nhập xác nhận "Tôi chốt" */}
                <div className="thct-form-group" style={{ marginBottom: '4px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: '#1e293b',
                      marginBottom: '6px',
                    }}
                  >
                    Vui lòng nhập chính xác chữ <span style={{ color: '#ea580c', background: '#ffedd5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fed7aa', fontWeight: 800 }}>Tôi chốt</span> để mở khóa: *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="thct-form-input"
                    style={{
                      fontSize: '0.95rem',
                      padding: '8px 12px',
                      borderColor:
                        confirmChotText.trim().toLowerCase() === 'tôi chốt'
                          ? '#16a34a'
                          : confirmChotText
                          ? '#ef4444'
                          : '#cbd5e1',
                      borderWidth: '2px',
                    }}
                    placeholder='Nhập đúng "Tôi chốt"'
                    value={confirmChotText}
                    onChange={(e) => setConfirmChotText(e.target.value)}
                  />
                  {confirmChotText && confirmChotText.trim().toLowerCase() !== 'tôi chốt' && (
                    <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '4px' }}>
                      <i className="fas fa-times-circle"></i> Chưa đúng cụm từ "Tôi chốt"
                    </div>
                  )}
                  {confirmChotText.trim().toLowerCase() === 'tôi chốt' && (
                    <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '4px', fontWeight: 600 }}>
                      <i className="fas fa-check-circle"></i> Đã xác nhận chính xác!
                    </div>
                  )}
                </div>
              </div>

              <div
                className="thct-modal-footer"
                style={{
                  padding: '12px 20px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="thct-btn"
                  onClick={() => {
                    setShowChotKyModal(false);
                    setConfirmChotText('');
                  }}
                  disabled={submittingChot}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="thct-btn"
                  disabled={
                    submittingChot ||
                    confirmChotText.trim().toLowerCase() !== 'tôi chốt'
                  }
                  style={{
                    background:
                      confirmChotText.trim().toLowerCase() === 'tôi chốt'
                        ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
                        : '#cbd5e1',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    cursor:
                      confirmChotText.trim().toLowerCase() === 'tôi chốt'
                        ? 'pointer'
                        : 'not-allowed',
                    boxShadow:
                      confirmChotText.trim().toLowerCase() === 'tôi chốt'
                        ? '0 2px 6px rgba(234, 88, 12, 0.3)'
                        : 'none',
                    padding: '8px 18px',
                  }}
                >
                  {submittingChot ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang chốt kỳ...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-lock"></i> Xác nhận chốt kỳ
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── MODAL: Hộp thoại Thêm / Sửa khoản chi ─── */}
      {showCategoryEditModal && (
        <div className="thct-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="thct-modal-card" style={{ maxWidth: '640px' }}>
            <div className="thct-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563eb',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  <i className={editingCategory ? 'fas fa-edit' : 'fas fa-plus'}></i>
                </span>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                  {editingCategory ? 'Chỉnh sửa khoản chi' : 'Thêm khoản chi mới'}
                </h3>
              </div>
              <button
                type="button"
                className="thct-modal-close"
                onClick={() => {
                  setShowCategoryEditModal(false);
                  setEditingCategory(null);
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveCategory}>
              <div className="thct-modal-body" style={{ padding: '16px 20px' }}>
                <div className="thct-form-row">
                  <div className="thct-form-group">
                    <label>Mã khoản chi *</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingCategory)}
                      placeholder="Ví dụ: truc_thiet_bi"
                      className="thct-form-input"
                      value={categoryForm.ma_khoan_chi}
                      onChange={(e) => setCategoryForm({ ...categoryForm, ma_khoan_chi: e.target.value })}
                    />
                  </div>
                  <div className="thct-form-group">
                    <label>Tên khoản chi *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Trực thiết bị bán trú"
                      className="thct-form-input"
                      value={categoryForm.ten_khoan_chi}
                      onChange={(e) => setCategoryForm({ ...categoryForm, ten_khoan_chi: e.target.value })}
                    />
                  </div>
                </div>

                <div className="thct-form-row">
                  <div className="thct-form-group">
                    <label>Cách tính *</label>
                    <select
                      className="thct-form-select"
                      disabled={Boolean(editingCategory && STRICT_LOCKED_CATEGORIES.has(editingCategory.ma_khoan_chi))}
                      value={categoryForm.loai_tinh}
                      onChange={(e) => setCategoryForm({ ...categoryForm, loai_tinh: e.target.value })}
                    >
                      <option value="truc_tiep">Nhập số tiền trực tiếp</option>
                      <option value="so_ngay_don_gia">Số ngày × đơn giá</option>
                      <option value="nguon_truc_an">Lấy từ Chấm công Trực Ăn</option>
                      <option value="nguon_truc_ngu">Lấy từ Chấm công Trực Ngủ</option>
                    </select>
                  </div>

                  <div className="thct-form-group">
                    <label>
                      Đơn giá mặc định (đ)
                      {categoryForm.don_gia_mac_dinh > 0 && (
                        <span style={{ marginLeft: '6px', color: '#2563eb', fontWeight: 600 }}>
                          ({formatVND(categoryForm.don_gia_mac_dinh)})
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="1000"
                      min="0"
                      className="thct-form-input"
                      value={categoryForm.don_gia_mac_dinh}
                      onChange={(e) =>
                        setCategoryForm({ ...categoryForm, don_gia_mac_dinh: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="thct-form-row">
                  <div className="thct-form-group">
                    <label>Tần suất chi</label>
                    <select
                      className="thct-form-select"
                      value={categoryForm.tan_suat}
                      onChange={(e) => setCategoryForm({ ...categoryForm, tan_suat: e.target.value })}
                    >
                      <option value="dinh_ky">Định kỳ</option>
                      <option value="phat_sinh">Phát sinh theo kỳ</option>
                      <option value="mot_lan">Một lần</option>
                    </select>
                  </div>

                  <div className="thct-form-group">
                    <label>Thứ tự hiển thị</label>
                    <input
                      type="number"
                      className="thct-form-input"
                      value={categoryForm.thu_tu_hien_thi}
                      onChange={(e) =>
                        setCategoryForm({ ...categoryForm, thu_tu_hien_thi: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="thct-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="thct-btn"
                  onClick={() => {
                    setShowCategoryEditModal(false);
                    setEditingCategory(null);
                  }}
                >
                  Hủy
                </button>
                <button type="submit" className="thct-btn thct-btn-primary">
                  {editingCategory ? 'Lưu cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Sửa thông tin kỳ tổng hợp (Super Admin) ─── */}
      {showEditKyModal && kyInfo?.id && (
        <div className="thct-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="thct-modal-card" style={{ maxWidth: '580px' }}>
            <div className="thct-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563eb',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  <i className="fas fa-edit"></i>
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Chỉnh sửa thông tin kỳ</h3>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    {kyInfo.ten_ky} (ID: {kyInfo.id})
                  </div>
                </div>
              </div>
              <button type="button" className="thct-modal-close" onClick={() => setShowEditKyModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveEditKy}>
              <div className="thct-modal-body" style={{ padding: '16px 20px' }}>
                <div className="thct-form-group" style={{ marginBottom: '14px' }}>
                  <label>Tên kỳ tổng hợp *</label>
                  <input
                    type="text"
                    required
                    className="thct-form-input"
                    value={editKyForm.ten_ky}
                    onChange={(e) => setEditKyForm({ ...editKyForm, ten_ky: e.target.value })}
                  />
                </div>

                <div className="thct-form-row" style={{ marginBottom: '14px' }}>
                  <div className="thct-form-group">
                    <label>Từ ngày *</label>
                    <input
                      type="date"
                      required
                      className="thct-form-input"
                      value={editKyForm.tu_ngay}
                      onChange={(e) => setEditKyForm({ ...editKyForm, tu_ngay: e.target.value })}
                    />
                  </div>
                  <div className="thct-form-group">
                    <label>Đến ngày *</label>
                    <input
                      type="date"
                      required
                      className="thct-form-input"
                      value={editKyForm.den_ngay}
                      onChange={(e) => setEditKyForm({ ...editKyForm, den_ngay: e.target.value })}
                    />
                  </div>
                </div>

                <div className="thct-form-row" style={{ marginBottom: '14px' }}>
                  <div className="thct-form-group">
                    <label>Ngày lập báo cáo</label>
                    <input
                      type="date"
                      className="thct-form-input"
                      value={editKyForm.ngay_lap}
                      onChange={(e) => setEditKyForm({ ...editKyForm, ngay_lap: e.target.value })}
                    />
                  </div>
                  {isSuperAdmin && (
                    <div className="thct-form-group">
                      <label style={{ color: '#ea580c', fontWeight: 700 }}>
                        Trạng thái kỳ (Super Admin)
                      </label>
                      <select
                        className="thct-form-select"
                        value={editKyForm.trang_thai}
                        onChange={(e) => setEditKyForm({ ...editKyForm, trang_thai: e.target.value })}
                      >
                        <option value="dang_dien_ra">Đang diễn ra (Mở khóa số liệu)</option>
                        <option value="da_chot">Đã chốt sổ (Đóng băng số liệu)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="thct-form-group">
                  <label>Ghi chú</label>
                  <textarea
                    rows={2}
                    className="thct-form-input"
                    value={editKyForm.ghi_chu}
                    onChange={(e) => setEditKyForm({ ...editKyForm, ghi_chu: e.target.value })}
                    placeholder="Ghi chú về kỳ chi trả này..."
                  />
                </div>
              </div>

              <div className="thct-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" className="thct-btn" onClick={() => setShowEditKyModal(false)} disabled={submittingEditKy}>
                  Hủy
                </button>
                <button type="submit" className="thct-btn thct-btn-primary" disabled={submittingEditKy}>
                  <i className={submittingEditKy ? "fas fa-spinner fa-spin" : "fas fa-save"} style={{ marginRight: '6px' }}></i>
                  {submittingEditKy ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Xác nhận mở lại kỳ tổng hợp (Super Admin) ─── */}
      {showUnlockModal && kyInfo?.id && (
        <div className="thct-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="thct-modal-card" style={{ maxWidth: '480px' }}>
            <div className="thct-modal-header" style={{ borderBottom: '1px solid #fed7aa', background: '#fffbeb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: '#fef3c7',
                    color: '#d97706',
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  <i className="fas fa-lock-open"></i>
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#92400e' }}>Xác nhận mở lại kỳ</h3>
                  <div style={{ fontSize: '0.8rem', color: '#b45309' }}>Quản trị viên cấp cao (Super Admin)</div>
                </div>
              </div>
              <button type="button" className="thct-modal-close" onClick={() => setShowUnlockModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="thct-modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#1e293b' }}>
                Bạn có chắc chắn muốn <strong>MỞ LẠI</strong> kỳ <strong>"{kyInfo.ten_ky}"</strong>?
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.88rem',
                  color: '#475569',
                }}
              >
                <div>📅 Khoảng ngày: <strong>{formatDateDMY(kyInfo.tu_ngay)} → {formatDateDMY(kyInfo.den_ngay)}</strong></div>
                <div style={{ marginTop: '6px', color: '#b45309' }}>
                  ⚠️ Kỳ sẽ chuyển về trạng thái <strong>"Đang diễn ra"</strong> để kế toán tiếp tục hiệu chỉnh số liệu chi trả.
                </div>
              </div>
            </div>
            <div
              className="thct-modal-footer"
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button type="button" className="thct-btn" onClick={() => setShowUnlockModal(false)} disabled={submittingUnlock}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="thct-btn thct-btn-amber"
                onClick={handleExecuteUnlock}
                disabled={submittingUnlock}
              >
                <i className={submittingUnlock ? "fas fa-spinner fa-spin" : "fas fa-lock-open"} style={{ marginRight: '6px' }}></i>
                {submittingUnlock ? 'Đang mở lại...' : 'Xác nhận Mở lại kỳ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Xác nhận xóa kỳ tổng hợp (Super Admin) ─── */}
      {showDeleteKyModal && kyInfo?.id && (
        <div className="thct-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="thct-modal-card" style={{ maxWidth: '500px' }}>
            <div className="thct-modal-header" style={{ borderBottom: '1px solid #fecaca', background: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: '#fee2e2',
                    color: '#dc2626',
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  <i className="fas fa-trash-alt"></i>
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#991b1b' }}>Xác nhận xóa kỳ tổng hợp</h3>
                  <div style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                    {kyInfo.trang_thai === 'da_chot' ? 'Quyền can thiệp Quản trị viên cấp cao (Super Admin)' : 'Kế toán / Quản trị viên'}
                  </div>
                </div>
              </div>
              <button type="button" className="thct-modal-close" onClick={() => setShowDeleteKyModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="thct-modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#1e293b' }}>
                Bạn có chắc chắn muốn xóa vĩnh viễn kỳ <strong>"{kyInfo.ten_ky}"</strong>?
              </p>
              <div
                style={{
                  background: '#fff5f5',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #fed7d7',
                  fontSize: '0.88rem',
                  color: '#7f1d1d',
                }}
              >
                <div>📅 Khoảng ngày: <strong>{formatDateDMY(kyInfo.tu_ngay)} → {formatDateDMY(kyInfo.den_ngay)}</strong></div>
                <div style={{ marginTop: '6px', fontWeight: 600 }}>
                  {kyInfo.trang_thai === 'da_chot'
                    ? '⚠️ CẢNH BÁO QUAN TRỌNG: Kỳ này ĐÃ CHỐT SỔ! Xóa kỳ này sẽ xóa vĩnh viễn toàn bộ bảng chi tiết người nhận và thanh toán liên quan.'
                    : '⚠️ Thao tác này sẽ xóa kỳ cùng danh sách chi tiết chi trả liên quan và không thể khôi phục.'}
                </div>
              </div>
            </div>
            <div
              className="thct-modal-footer"
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button type="button" className="thct-btn" onClick={() => setShowDeleteKyModal(false)} disabled={submittingDeleteKy}>
                Hủy
              </button>
              <button
                type="button"
                className="thct-btn"
                style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                onClick={handleExecuteDeleteKy}
                disabled={submittingDeleteKy}
              >
                <i className={submittingDeleteKy ? "fas fa-spinner fa-spin" : "fas fa-trash-alt"} style={{ marginRight: '6px' }}></i>
                {submittingDeleteKy ? 'Đang xóa...' : 'Xóa vĩnh viễn kỳ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL THÔNG BÁO HỆ THỐNG (Thay thế alert trình duyệt) ─── */}
      {notifyModal.isOpen && (
        <div className="thct-modal-overlay" style={{ zIndex: 1300 }}>
          <div className="thct-modal-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '24px 20px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                background:
                  notifyModal.type === 'success' ? '#dcfce7' : notifyModal.type === 'error' ? '#fee2e2' : '#fef3c7',
                color:
                  notifyModal.type === 'success' ? '#16a34a' : notifyModal.type === 'error' ? '#dc2626' : '#d97706',
              }}
            >
              <i
                className={
                  notifyModal.type === 'success'
                    ? 'fas fa-check-circle'
                    : notifyModal.type === 'error'
                    ? 'fas fa-exclamation-triangle'
                    : 'fas fa-exclamation-circle'
                }
              ></i>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#1e293b' }}>
              {notifyModal.title}
            </h3>
            <p
              style={{
                margin: '0 0 20px 0',
                fontSize: '0.95rem',
                color: '#475569',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}
            >
              {notifyModal.message}
            </p>
            <button
              type="button"
              className="thct-btn thct-btn-primary"
              style={{ minWidth: '120px', margin: '0 auto' }}
              onClick={() => setNotifyModal((prev) => ({ ...prev, isOpen: false }))}
            >
              Đồng ý
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
