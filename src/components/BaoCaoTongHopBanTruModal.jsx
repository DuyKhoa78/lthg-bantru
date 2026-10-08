import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { docSoThanhChu, formatDateDMY, getSortNames, removeAccents } from '../utils/stringUtils';
import api from '../services/api';
import './BaoCaoTongHopBanTruModal.css';

// ── Chuẩn hóa họ tên (bỏ dấu) để đối chiếu dữ liệu chính xác tuyệt đối không bị trùng ──
const normName = (str) => removeAccents(str || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Hàm sắp xếp danh sách theo bảng chữ cái tiếng Việt (Tên chính A-Z, rồi đến Họ & Đệm) ──
const sortGvByName = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const nameA = getSortNames(a.ho_ten || a.name || '');
    const nameB = getSortNames(b.ho_ten || b.name || '');
    let cmp = nameA.first.localeCompare(nameB.first, 'vi');
    if (cmp !== 0) return cmp;
    cmp = nameA.last.localeCompare(nameB.last, 'vi');
    if (cmp !== 0) return cmp;
    return nameA.middle.localeCompare(nameB.middle, 'vi');
  });
};



// ── Dữ liệu nhân sự bán trú cơ sở (Công ăn và Trực ngủ sẽ được tự động tính trực tiếp từ CSDL) ──
const RAW_CB_GV_NV = [
  { id: 1, ho_ten: 'Trần Bá Lâm', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 700000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0397854806', ghi_chu: '' },
  { id: 2, ho_ten: 'Trần Nhật Tân', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 1600000, gs_an: 0, gs_ban_tru: 0, so_tk: '060146415418', ghi_chu: '' },
  { id: 3, ho_ten: 'Phan Thanh Nhật', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0931158262', ghi_chu: '' },
  { id: 4, ho_ten: 'Bùi Thanh Toàn', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '050128831239', ghi_chu: '' },
  { id: 5, ho_ten: 'Lê Hoàng Hà', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0908345603', ghi_chu: '' },
  { id: 7, ho_ten: 'Đỗ Văn Thương', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '0342184452', ghi_chu: '' },
  { id: 8, ho_ten: 'Đỗ Ngọc Bích Vân', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '060297153784', ghi_chu: '' },
  { id: 9, ho_ten: 'Đặng Thị Yến', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060146446712', ghi_chu: '' },
  { id: 10, ho_ten: 'Phạm Thị Thanh Hà', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 800000, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0903832423', ghi_chu: '' },
  { id: 11, ho_ten: 'Đào Thị Cẩm Hạnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060146399773', ghi_chu: '' },
  { id: 12, ho_ten: 'Trần Nhật Thiên Thanh', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 1000000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060310096671', ghi_chu: '' },
  { id: 13, ho_ten: 'Trần Thị Kim Thoại', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0388706578', ghi_chu: '' },
  { id: 14, ho_ten: 'Đinh Thị Tuyết Lan', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060253956685', ghi_chu: '' },
  { id: 15, ho_ten: 'Mai Thị Tường Vi', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0935595079', ghi_chu: '' },
  { id: 16, ho_ten: 'Lê Thị Huyền Nhung', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1400000, gs_ban_tru: 0, so_tk: '0586613647', ghi_chu: '' },
  { id: 17, ho_ten: 'Cao Thị Mai Huệ', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060275595589', ghi_chu: '' },
  { id: 18, ho_ten: 'Bùi Phùng Đức Anh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060183474475', ghi_chu: '' },
  { id: 19, ho_ten: 'Hoàng Thanh Thủy', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '0387574502', ghi_chu: '' },
  { id: 20, ho_ten: 'Trần Thị Hồng Cẩm', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 500000, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060325382506', ghi_chu: '' },
  { id: 21, ho_ten: 'Vũ Quốc Phong', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 2750000, so_tk: '123698898888', ghi_chu: '' },
  { id: 22, ho_ten: 'Huỳnh Đức Vịnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 2250000, so_tk: '0909930164', ghi_chu: '' },
  { id: 24, ho_ten: 'Lý Công Thành', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1300000, gs_ban_tru: 0, so_tk: '060326149384', ghi_chu: '' },
  { id: 25, ho_ten: 'Nguyễn Thị Nhung', truc_phong: 0, vs_bv: 2000000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060962014341', ghi_chu: '' },
  { id: 26, ho_ten: 'Nguyễn Ngọc Cầm', truc_phong: 0, vs_bv: 800000, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '06014646453', ghi_chu: '' },
  { id: 27, ho_ten: 'Mai Quỳnh Châu', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 1600000, gs_ban_tru: 0, so_tk: '060326378898', ghi_chu: '' },
  { id: 28, ho_ten: 'Huỳnh Duy Khoa', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060818237416', ghi_chu: '' },
  { id: 29, ho_ten: 'Bùi Xuân Kim Sa', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '', ghi_chu: '' },
  { id: 30, ho_ten: 'Hồ Quang Thịnh', truc_phong: 0, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '', ghi_chu: '' },
  { id: 31, ho_ten: 'Trần Thị Khánh Huyền', truc_phong: 1620000, vs_bv: 0, tiep_nhan_vd: 0, y_te: 0, bt_an: 0, cap_nhat_tt: 0, thiet_bi: 0, gs_an: 0, gs_ban_tru: 0, so_tk: '060146437508', ghi_chu: '' },
];

const INITIAL_CB_GV_NV = sortGvByName(RAW_CB_GV_NV);

export default function BaoCaoTongHopBanTruModal({
  isOpen,
  onClose,
  tuNgay = '2026-09-07',
  denNgay = '2026-10-07',
  namHoc = '2026-2027',
  quanLyName = 'Vũ Quốc Phong',
  keToanName = 'Trần Thị Hồng Cẩm',
}) {
  const [activeSubTab, setActiveSubTab] = useState('tong_hop'); // 'tong_hop' | 'tinh_cong_an' | 'tinh_cong_ngu'
  const [tableData, setTableData] = useState(() => sortGvByName(INITIAL_CB_GV_NV));
  const [donGiaAn, setDonGiaAn] = useState(100000);
  const [donGiaYTe, setDonGiaYTe] = useState(70000);
  const [donGiaGsBanTru, setDonGiaGsBanTru] = useState(250000);
  const [soNgayBanTru, setSoNgayBanTru] = useState(0);

  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // ── Đồng bộ trực tiếp từ Kế toán (Nguồn chuẩn 29 nhân sự) ──
  const [keToanKys, setKeToanKys] = useState([]);
  const [selectedKeToanKyId, setSelectedKeToanKyId] = useState(null);
  const [isSyncingKeToan, setIsSyncingKeToan] = useState(false);

  // ── Dữ liệu bảng tính công ăn tải động từ CSDL ──
  const [congAnData, setCongAnData] = useState(null);
  const [loadingCongAn, setLoadingCongAn] = useState(false);
  const [congAnError, setCongAnError] = useState(null);

  // Hàm tải dữ liệu công ăn bán trú trực tiếp từ CSDL
  const fetchCongAnFromDB = useCallback(async () => {
    if (!isOpen) return;
    setLoadingCongAn(true);
    setCongAnError(null);
    try {
      const res = await api.get(`/api/baocao/cong-an-chi-tiet/?tu_ngay=${tuNgay}&den_ngay=${denNgay}`);
      if (res.data?.ok) {
        setCongAnData(res.data);
        if (res.data.don_gia_an) {
          setDonGiaAn(res.data.don_gia_an);
        }
        if (res.data.don_gia_y_te) {
          setDonGiaYTe(res.data.don_gia_y_te);
        }
        if (res.data.don_gia_gs_ban_tru) {
          setDonGiaGsBanTru(res.data.don_gia_gs_ban_tru);
        }

        // Tính tiền Y tế = số ngày/buổi bán trú x 70.000đ
        const workDays = res.data?.workDays || [];
        const soNgay = workDays.length;
        setSoNgayBanTru(soNgay);
        const currentDonGiaYTe = res.data?.don_gia_y_te || 70000;
        const tienYTe = soNgay * currentDonGiaYTe;

        // Tính tiền Giám sát bán trú cho Vũ Quốc Phong = số ngày bán trú x 250.000đ (từ CSDL Thiết lập)
        const currentDonGiaGsBanTru = res.data?.don_gia_gs_ban_tru || 250000;
        const tienGsBanTruPhong = soNgay * currentDonGiaGsBanTru;

        // Đồng bộ số tiền bán trú ăn (bt_an), trực kiểm tra GS ăn (gs_an), trực phòng (truc_phong) và y tế (y_te) từ CSDL sang Tab 1 Bảng Tổng Hợp
        const nguMap = {};
        if (res.data?.nguMap) {
          Object.entries(res.data.nguMap).forEach(([k, v]) => {
            nguMap[normName(k)] = v;
          });
        }
        const anMap = {};
        if (Array.isArray(res.data?.gvList)) {
          res.data.gvList.forEach((g) => {
            anMap[normName(g.ho_ten)] = {
              thanh_tien: g.thanh_tien,
              so_ca: g.so_ca,
              so_tk: g.so_tai_khoan || '',
              ho_ten: g.ho_ten,
              id: g.id || g.ma_gv_id,
              nhiem_vu: g.nhiem_vu !== undefined && g.nhiem_vu !== null ? g.nhiem_vu : 0
            };
          });
        }

        setTableData((prev) => {
          const existingNames = new Set();
          const updated = prev.map((row) => {
            const clean = normName(row.ho_ten);
            existingNames.add(clean);
            const anInfo = anMap[clean];
            const nguInfo = nguMap[clean];
            const isMaiQuynhChau = clean.includes('mai quynh chau') || clean.includes('quynh chau');

            // Xác định chức vụ: 0 = Điểm danh ăn, 1 = Giám sát ăn
            const nv = anInfo ? anInfo.nhiem_vu : (row.nhiem_vu ?? (isMaiQuynhChau ? 1 : 0));
            const defaultTienAn = soNgay * (res.data?.don_gia_an || 100000);
            const tienAn = anInfo ? anInfo.thanh_tien : (isMaiQuynhChau ? defaultTienAn : 0);

            let rowBtAn = 0;
            let rowGsAn = row.gs_an || 0;

            if (isMaiQuynhChau) {
              rowGsAn = tienAn;
              rowBtAn = row.bt_an !== undefined && row.bt_an !== null && row.bt_an !== 0 ? row.bt_an : tienAn;
            } else if (anInfo) {
              if (nv === 1) {
                rowGsAn = tienAn;
                rowBtAn = 0;
              } else {
                rowBtAn = tienAn;
                rowGsAn = 0;
              }
            }

            const isPhamThiThanhHa = clean.includes('thanh ha');
            const isHongCam = clean.includes('hong cam');
            const isVuQuocPhong = clean.includes('quoc phong');

            return {
              ...row,
              tiep_nhan_vd: (row.tiep_nhan_vd !== undefined && row.tiep_nhan_vd !== null && row.tiep_nhan_vd !== 0) ? row.tiep_nhan_vd : (isPhamThiThanhHa ? 800000 : (row.tiep_nhan_vd || 0)),
              cap_nhat_tt: (row.cap_nhat_tt !== undefined && row.cap_nhat_tt !== null && row.cap_nhat_tt !== 0) ? row.cap_nhat_tt : (isHongCam ? 500000 : (row.cap_nhat_tt || 0)),
              gs_ban_tru: isVuQuocPhong ? tienGsBanTruPhong : (row.gs_ban_tru || 0),
              thiet_bi: clean.includes('nhat tan') ? 1600000 : (row.thiet_bi || 0),
              bt_an: rowBtAn,
              gs_an: rowGsAn,
              truc_phong: nguInfo ? nguInfo.thanh_tien_ngu : (row.truc_phong || 0),
              y_te: isMaiQuynhChau ? tienYTe : (row.y_te || 0),
              so_tk: row.so_tk || anInfo?.so_tk || nguInfo?.so_tai_khoan || '',
              nhiem_vu: nv
            };
          });

          // Tự động thêm giáo viên từ CSDL nếu chưa có trong danh sách
          const allDbNames = new Set([...Object.keys(anMap), ...Object.keys(nguMap)]);
          allDbNames.forEach((clean) => {
            if (!existingNames.has(clean)) {
              const anInfo = anMap[clean];
              const nguInfo = nguMap[clean];
              const hoTen = anInfo?.ho_ten || nguInfo?.ho_ten || clean;
              const id = anInfo?.id || nguInfo?.id || Date.now();
              const soTk = anInfo?.so_tk || nguInfo?.so_tai_khoan || '';
              const isMaiQuynhChau = clean.includes('mai quynh chau') || clean.includes('quynh chau');
              const isPhamThiThanhHa = clean.includes('thanh ha');
              const isHongCam = clean.includes('hong cam');
              const isVuQuocPhong = clean.includes('quoc phong');
              const nv = anInfo ? anInfo.nhiem_vu : (isMaiQuynhChau ? 1 : 0);
              const defaultTienAn = soNgay * (res.data?.don_gia_an || 100000);
              const tienAn = anInfo ? anInfo.thanh_tien : (isMaiQuynhChau ? defaultTienAn : 0);

              const rowBtAn = (nv === 1 && !isMaiQuynhChau) ? 0 : tienAn;
              const rowGsAn = (nv === 1 || isMaiQuynhChau) ? tienAn : 0;

              updated.push({
                id,
                ho_ten: hoTen,
                truc_phong: nguInfo ? nguInfo.thanh_tien_ngu : 0,
                vs_bv: 0,
                tiep_nhan_vd: isPhamThiThanhHa ? 800000 : 0,
                y_te: isMaiQuynhChau ? tienYTe : 0,
                bt_an: rowBtAn,
                cap_nhat_tt: isHongCam ? 500000 : 0,
                thiet_bi: clean.includes('nhat tan') ? 1600000 : 0,
                gs_an: rowGsAn,
                gs_ban_tru: isVuQuocPhong ? tienGsBanTruPhong : 0,
                so_tk: soTk,
                ghi_chu: '',
                nhiem_vu: nv
              });
            }
          });

          return sortGvByName(updated);
        });
      } else {
        setCongAnError(res.data?.error || 'Không tải được dữ liệu công ăn từ CSDL');
      }
    } catch (err) {
      console.error('Lỗi tải công ăn từ CSDL:', err);
      setCongAnError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoadingCongAn(false);
    }
  }, [isOpen, tuNgay, denNgay]);

  // 4. Fetch đơn giá phụ cấp từ CauHinhHeThong & Tải công ăn chi tiết
  useEffect(() => {
    if (!isOpen) return;
    api.get('/api/cauhinh/').then((res) => {
      if (res.data?.ok && res.data.he_thong) {
        const ht = res.data.he_thong;
        if (ht.phu_cap_gs_an !== undefined && ht.phu_cap_gs_an !== null) {
          setDonGiaAn(parseInt(ht.phu_cap_gs_an) || 100000);
        }
        if (ht.phu_cap_y_te !== undefined && ht.phu_cap_y_te !== null) {
          setDonGiaYTe(parseInt(ht.phu_cap_y_te) || 70000);
        }
        if (ht.phu_cap_gs_ban_tru !== undefined && ht.phu_cap_gs_ban_tru !== null) {
          setDonGiaGsBanTru(parseInt(ht.phu_cap_gs_ban_tru) || 250000);
        }
      }
    }).catch(console.error);

    fetchCongAnFromDB();
  }, [isOpen, tuNgay, denNgay, fetchCongAnFromDB]);

  // ── Tải trực tiếp dữ liệu từ Kế toán (Nguồn chuẩn 29 nhân sự - không trùng lặp) ──
  const fetchFromKeToan = useCallback(async (kyId = null) => {
    if (!isOpen) return;
    setIsSyncingKeToan(true);
    try {
      // 1. Tải danh sách kỳ từ Kế toán
      const listRes = await api.get('/api/ketoan/ky-tong-hop');
      const kys = listRes.data?.data || [];
      setKeToanKys(kys);

      let targetId = kyId;
      if (!targetId) {
        // Tìm kỳ khớp ngày hoặc kỳ đầu tiên
        const matched = kys.find((k) => k.tu_ngay === tuNgay && k.den_ngay === denNgay) || kys[0];
        targetId = matched?.id;
      }
      if (!targetId && kys.length > 0) {
        targetId = kys[0].id;
      }
      if (!targetId) return;

      setSelectedKeToanKyId(targetId);

      // 2. Lấy chi tiết kỳ từ Kế toán
      const detRes = await api.get(`/api/ketoan/ky-tong-hop/${targetId}`);
      if (detRes.data?.ok && detRes.data?.data) {
        const { rows } = detRes.data.data;
        if (Array.isArray(rows) && rows.length > 0) {
          const loadedRows = rows.map((r, idx) => ({
            id: r.id || idx + 1,
            stt: r.stt || idx + 1,
            ho_ten: r.ho_ten,
            so_tk: r.so_tai_khoan || '',
            truc_phong: r.chi_tiet?.truc_phong?.thanh_tien || 0,
            vs_bv: r.chi_tiet?.vs_bv?.thanh_tien || 0,
            tiep_nhan_vd: r.chi_tiet?.tiep_nhan_vd?.thanh_tien || 0,
            y_te: r.chi_tiet?.y_te?.thanh_tien || 0,
            bt_an: r.chi_tiet?.bt_an?.thanh_tien || 0,
            cap_nhat_tt: r.chi_tiet?.cap_nhat_tt?.thanh_tien || 0,
            thiet_bi: r.chi_tiet?.thiet_bi?.thanh_tien || 0,
            gs_an: r.chi_tiet?.gs_an?.thanh_tien || 0,
            gs_ban_tru: r.chi_tiet?.gs_ban_tru?.thanh_tien || 0,
            ghi_chu: r.ghi_chu || '',
            tong_tien: r.tong_tien,
          }));
          setTableData(loadedRows);
        }
      }
    } catch (err) {
      console.error('Lỗi nạp dữ liệu từ Kế toán:', err);
    } finally {
      setIsSyncingKeToan(false);
    }
  }, [isOpen, tuNgay, denNgay]);

  useEffect(() => {
    if (!isOpen) return;
    fetchFromKeToan();
  }, [isOpen, fetchFromKeToan]);

  if (!isOpen) return null;

  const tuDMY = formatDateDMY(tuNgay);
  const denDMY = formatDateDMY(denNgay);
  const selectedKy = keToanKys.find((k) => k.id === selectedKeToanKyId);
  const isKyDaChot = selectedKy?.trang_thai === 'da_chot';

  let signDay = new Date().getDate();
  let signMonth = new Date().getMonth() + 1;
  let signYear = new Date().getFullYear();

  if (isKyDaChot && denNgay) {
    const parts = String(denNgay).split('-');
    if (parts.length === 3) {
      signYear = parts[0];
      signMonth = parseInt(parts[1], 10);
      signDay = parseInt(parts[2], 10);
    }
  }

  const todayStr = `Thành phố Hồ Chí Minh, ngày ${signDay} tháng ${signMonth} năm ${signYear}`;

  // ── Tính tổng từng cột của Bảng Tổng Hợp ──
  const totals = tableData.reduce(
    (acc, row) => {
      const rowSum =
        (row.truc_phong || 0) +
        (row.vs_bv || 0) +
        (row.tiep_nhan_vd || 0) +
        (row.y_te || 0) +
        (row.bt_an || 0) +
        (row.cap_nhat_tt || 0) +
        (row.thiet_bi || 0) +
        (row.gs_an || 0) +
        (row.gs_ban_tru || 0);

      acc.truc_phong += row.truc_phong || 0;
      acc.vs_bv += row.vs_bv || 0;
      acc.tiep_nhan_vd += row.tiep_nhan_vd || 0;
      acc.y_te += row.y_te || 0;
      acc.bt_an += row.bt_an || 0;
      acc.cap_nhat_tt += row.cap_nhat_tt || 0;
      acc.thiet_bi += row.thiet_bi || 0;
      acc.gs_an += row.gs_an || 0;
      acc.gs_ban_tru += row.gs_ban_tru || 0;
      acc.grand_total += rowSum;
      return acc;
    },
    {
      truc_phong: 0,
      vs_bv: 0,
      tiep_nhan_vd: 0,
      y_te: 0,
      bt_an: 0,
      cap_nhat_tt: 0,
      thiet_bi: 0,
      gs_an: 0,
      gs_ban_tru: 0,
      grand_total: 0,
    }
  );

  const wordsTotal = docSoThanhChu(totals.grand_total);

  // ── 1. Tạo HTML chuẩn cho In / Xuất PDF (A4 Ngang) ──
  const generateTongHopPrintHtml = (isForDownload = false) => {
    const css = `
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;padding:${isForDownload ? '0' : '10px 14px'};background:#fff;}
      .hdr{display:flex;justify-content:space-between;margin-bottom:12px;}
      .hdr-col{text-align:center;}
      .hdr-top{font-size:9.5pt;}
      .hdr-bold{font-size:9.5pt;font-weight:bold;}
      .title-box{text-align:center;margin-bottom:14px;}
      h1{font-size:13pt;font-weight:bold;color:#b91c1c;text-transform:uppercase;margin-bottom:4px;}
      .sub{font-size:10pt;font-weight:bold;color:#000;}
      table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:8.5pt;}
      th,td{border:1px solid #000;padding:4px 3px;vertical-align:middle;}
      th{font-weight:bold;text-align:center;background:#f8fafc;}
      td.c{text-align:center;}
      td.r{text-align:right;}
      td.name{text-align:left;white-space:nowrap;padding-left:4px;font-weight:500;}
      .cell-red{background:#fee2e2 !important;color:#dc2626 !important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .cell-green{background:#dcfce7 !important;color:#15803d !important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .cell-yellow{background:#ffff00 !important;color:#000000 !important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .cell-total{background:#fef08a !important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .reading{font-weight:bold;font-style:italic;margin-top:8px;font-size:9.5pt;}
      .ft{display:flex;justify-content:space-between;margin-top:20px;padding:0 50px;page-break-inside:avoid;}
      .ft-col{text-align:center;}
      .sig-space{height:55px;}
      @page{size:A4 landscape;margin:6mm 8mm;}
      @media print{
        body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
    `;

    let rowsHtml = '';
    tableData.forEach((r, idx) => {
      const sum =
        (r.truc_phong || 0) +
        (r.vs_bv || 0) +
        (r.tiep_nhan_vd || 0) +
        (r.y_te || 0) +
        (r.bt_an || 0) +
        (r.cap_nhat_tt || 0) +
        (r.thiet_bi || 0) +
        (r.gs_an || 0) +
        (r.gs_ban_tru || 0);

      const vsBvStyle = r.vs_bv ? (r.vs_bv_tan_suat === 'dinh_ky' ? 'class="r cell-red"' : 'class="r cell-green"') : 'class="r"';
      const tiepNhanStyle = r.tiep_nhan_vd ? (r.tiep_nhan_vd_tan_suat === 'dinh_ky' ? 'class="r cell-red"' : 'class="r cell-green"') : 'class="r"';
      const capNhatStyle = r.cap_nhat_tt ? (r.cap_nhat_tt_tan_suat === 'dinh_ky' ? 'class="r cell-red"' : 'class="r cell-green"') : 'class="r"';
      const gsBanTruStyle = r.gs_ban_tru ? 'class="r cell-yellow"' : 'class="r"';

      rowsHtml += `<tr>
        <td class="c">${idx + 1}</td>
        <td class="name">${r.ho_ten}</td>
        <td class="r">${r.truc_phong ? r.truc_phong.toLocaleString('vi-VN') : ''}</td>
        <td ${vsBvStyle}>${r.vs_bv ? r.vs_bv.toLocaleString('vi-VN') : ''}</td>
        <td ${tiepNhanStyle}>${r.tiep_nhan_vd ? r.tiep_nhan_vd.toLocaleString('vi-VN') : ''}</td>
        <td class="r">${r.y_te ? r.y_te.toLocaleString('vi-VN') : ''}</td>
        <td class="r">${r.bt_an ? r.bt_an.toLocaleString('vi-VN') : ''}</td>
        <td ${capNhatStyle}>${r.cap_nhat_tt ? r.cap_nhat_tt.toLocaleString('vi-VN') : ''}</td>
        <td class="r">${r.thiet_bi ? r.thiet_bi.toLocaleString('vi-VN') : ''}</td>
        <td class="r">${r.gs_an ? r.gs_an.toLocaleString('vi-VN') : ''}</td>
        <td ${gsBanTruStyle}>${r.gs_ban_tru ? r.gs_ban_tru.toLocaleString('vi-VN') : ''}</td>
        <td class="r cell-total">${sum ? sum.toLocaleString('vi-VN') : ''}</td>
        <td class="c" style="font-family:monospace;font-size:8.5pt;color:#0369a1;font-weight:bold;">${r.so_tk || ''}</td>
        <td class="c">${r.ghi_chu || ''}</td>
      </tr>`;
    });

    const totalHtml = `<tr class="cell-total">
      <td colspan="2" class="c">TỔNG TIỀN</td>
      <td class="r">${totals.truc_phong.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.vs_bv.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.tiep_nhan_vd.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.y_te.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.bt_an.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.cap_nhat_tt.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.thiet_bi.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.gs_an.toLocaleString('vi-VN')}</td>
      <td class="r">${totals.gs_ban_tru.toLocaleString('vi-VN')}</td>
      <td class="r" style="font-size:9.5pt;">${totals.grand_total.toLocaleString('vi-VN')}</td>
      <td colspan="2"></td>
    </tr>`;

    return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng tổng hợp CB-GV-NV bán trú (${tuDMY} - ${denDMY})</title><style>${css}</style></head>
    <body>
      <div class="hdr">
        <div class="hdr-col">
          <div class="hdr-top">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
          <div class="hdr-bold">TRƯỜNG THPT LÊ THỊ HỒNG GẤM</div>
        </div>
        <div class="hdr-col">
          <div class="hdr-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="hdr-bold" style="text-decoration:underline;">Độc lập - Tự do - Hạnh phúc</div>
        </div>
      </div>

      <div class="title-box">
        <h1>BẢNG TỔNG HỢP CB-GV-NV THAM GIA CÔNG TÁC BÁN TRÚ NH ${namHoc}</h1>
        <div class="sub">(${tuDMY} - ${denDMY})</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:28px;">STT</th>
            <th style="width:140px;">HỌ VÀ TÊN</th>
            <th>Trực phòng<br><span style="font-size:7.5pt;font-weight:normal;">(Trực ngủ ĐG 180.000đ)</span></th>
            <th>Trực vệ sinh và bảo vệ</th>
            <th>Tiếp nhận và VS vật dụng</th>
            <th>Y tế<br><span style="font-size:7.5pt;font-weight:normal;">(Số ngày x ĐG 70.000đ)</span></th>
            <th>Bán trú ăn/<br><span style="font-size:7.5pt;font-weight:normal;">(Kiểm tra ATVSTP 100.000đ)</span></th>
            <th>Cập nhật thông tin bán trú ngủ và ăn hàng tháng, kiểm tra VS cuối buổi</th>
            <th>Trực thiết bị<br><span style="font-size:7.5pt;font-weight:normal;">(Số ngày x ĐG 100.000đ)</span></th>
            <th>Trực kiểm tra giám sát ăn bán trú<br><span style="font-size:7.5pt;font-weight:normal;">(Số ngày x ĐG 100.000đ)</span></th>
            <th>Trực giám sát bán trú<br><span style="font-size:7.5pt;font-weight:normal;">(Số ngày x ĐG 250.000đ)</span></th>
            <th style="width:75px;">Tổng Cộng</th>
            <th style="width:95px;">Tài Khoản</th>
            <th style="width:50px;">Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${totalHtml}
        </tbody>
      </table>

      <div class="reading">Bằng chữ: ${wordsTotal}</div>

      <div class="ft">
        <div class="ft-col">
          <div style="height:18px;"></div>
          <div class="hdr-bold">Người lập</div>
          <div style="font-style:italic;font-size:8.5pt;">(Ký, ghi rõ họ tên)</div>
          <div class="sig-space"></div>
          <div class="hdr-bold">${keToanName || 'Trần Thị Hồng Cẩm'}</div>
        </div>
        <div class="ft-col">
          <div style="font-style:italic;">${todayStr}</div>
          <div class="hdr-bold">GIÁM ĐỐC</div>
          <div style="font-style:italic;font-size:8.5pt;">(Ký, ghi rõ họ tên)</div>
          <div class="sig-space"></div>
          <div class="hdr-bold">${quanLyName || 'Vũ Quốc Phong'}</div>
        </div>
      </div>
    </body></html>`;
  };

  // In PDF trực tiếp qua hidden iframe (không lo popup blocker)
  const printTongHop = () => {
    const html = generateTongHopPrintHtml(false);
    let iframe = document.getElementById('bcth-print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'bcth-print-frame';
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

  // Tải file PDF trực tiếp bằng html2canvas + jsPDF
  const downloadTongHopPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    let wrapper = null;
    try {
      wrapper = document.createElement('div');
      wrapper.innerHTML = generateTongHopPrintHtml(true);
      wrapper.style.width = '1120px';
      wrapper.style.padding = '12px 14px';
      wrapper.style.background = '#ffffff';
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-99999px';
      wrapper.style.top = '0';
      document.body.appendChild(wrapper);

      await new Promise((r) => setTimeout(r, 120));

      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 6;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = contentHeight;
      let position = margin;

      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight, undefined, 'FAST');
      heightLeft -= (pageHeight - margin * 2);

      while (heightLeft > 0) {
        position = margin + heightLeft - contentHeight;
        pdf.addPage('a4', 'landscape');
        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight, undefined, 'FAST');
        heightLeft -= (pageHeight - margin * 2);
      }

      pdf.save(`Bang_Tong_Hop_Ban_Tru_${tuNgay}_${denNgay}.pdf`);
    } catch (err) {
      console.error('Lỗi tải file PDF:', err);
      alert('Không thể tạo file PDF: ' + err.message);
    } finally {
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      setIsExportingPDF(false);
    }
  };

  // ── 2. Xuất Excel Bảng Tổng Hợp ──
  const exportTongHopExcel = () => {
    const headers = [
      'STT',
      'HỌ VÀ TÊN',
      'Trực phòng (Trực ngủ 180.000đ)',
      'Trực vệ sinh và bảo vệ',
      'Nhận tin/ Tiếp nhận vật dụng/ VS vật dụng',
      'Y tế (Số ngày x ĐG 70.000đ)',
      'Bán trú ăn/ (Kiểm tra ATVSTP 100.000đ)',
      'Cập nhật thông tin bán trú ngủ và ăn bán trú hàng tháng, kiểm tra vệ sinh cuối buổi',
      'Trực thiết bị (Số ngày x ĐG 100.000đ)',
      'Trực kiểm tra giám sát ăn bán trú (Số ngày x ĐG 100.000đ)',
      'Trực giám sát bán trú (Số ngày x ĐG 250.000đ)',
      'Tổng Cộng',
      'Tài Khoản',
      'Ghi chú',
    ];

    const dataRows = tableData.map((r, i) => {
      const sum =
        (r.truc_phong || 0) +
        (r.vs_bv || 0) +
        (r.tiep_nhan_vd || 0) +
        (r.y_te || 0) +
        (r.bt_an || 0) +
        (r.cap_nhat_tt || 0) +
        (r.thiet_bi || 0) +
        (r.gs_an || 0) +
        (r.gs_ban_tru || 0);

      return [
        i + 1,
        r.ho_ten,
        r.truc_phong > 0 ? r.truc_phong : '',
        r.vs_bv > 0 ? r.vs_bv : '',
        r.tiep_nhan_vd > 0 ? r.tiep_nhan_vd : '',
        r.y_te > 0 ? r.y_te : '',
        r.bt_an > 0 ? r.bt_an : '',
        r.cap_nhat_tt > 0 ? r.cap_nhat_tt : '',
        r.thiet_bi > 0 ? r.thiet_bi : '',
        r.gs_an > 0 ? r.gs_an : '',
        r.gs_ban_tru > 0 ? r.gs_ban_tru : '',
        sum > 0 ? sum : '',
        (r.so_tk && r.so_tk !== '-' && r.so_tk !== '—') ? r.so_tk : '',
        (r.ghi_chu && r.ghi_chu !== '-' && r.ghi_chu !== '—') ? r.ghi_chu : '',
      ];
    });

    const totalRow = [
      '',
      'TỔNG TIỀN',
      totals.truc_phong > 0 ? totals.truc_phong : '',
      totals.vs_bv > 0 ? totals.vs_bv : '',
      totals.tiep_nhan_vd > 0 ? totals.tiep_nhan_vd : '',
      totals.y_te > 0 ? totals.y_te : '',
      totals.bt_an > 0 ? totals.bt_an : '',
      totals.cap_nhat_tt > 0 ? totals.cap_nhat_tt : '',
      totals.thiet_bi > 0 ? totals.thiet_bi : '',
      totals.gs_an > 0 ? totals.gs_an : '',
      totals.gs_ban_tru > 0 ? totals.gs_ban_tru : '',
      totals.grand_total > 0 ? totals.grand_total : '',
      '',
      '',
    ];

    const aoa = [
      ['SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
      ['TRƯỜNG THPT LÊ THỊ HỒNG GẤM', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc'],
      [],
      [`BẢNG TỔNG HỢP CB-GV-NV THAM GIA CÔNG TÁC BÁN TRÚ NH ${namHoc} (${tuDMY}-${denDMY})`],
      [],
      headers,
      ...dataRows,
      totalRow,
      [],
      [`Bằng chữ: ${wordsTotal}`],
      [],
      ['', '', '', '', '', '', '', '', todayStr],
      ['Người lập', '', '', '', '', '', '', '', 'GIÁM ĐỐC'],
      [],
      [],
      [keToanName || 'Trần Thị Hồng Cẩm', '', '', '', '', '', '', '', quanLyName || 'Vũ Quốc Phong'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'TongHopBanTru');
    XLSX.writeFile(wb, `bang-tong-hop-ban-tru_${tuNgay}_den_${denNgay}.xlsx`);
  };

  // ── 3. Xuất PDF Bảng Tính Công Bán Trú Ăn Có Đơn Giá (Lấy từ CSDL) ──
  const exportCongAnDonGiaPDF = () => {
    const workDays = congAnData?.workDays || [];
    const gvList = congAnData?.gvList || [];
    const dailyTotals = congAnData?.dailyTotals || [];
    const totalDays = congAnData?.totalDays || 0;
    const totalMoney = congAnData?.totalMoney || 0;
    const donGia = donGiaAn;

    if (gvList.length === 0) {
      return alert('Chưa có dữ liệu công ăn từ CSDL để xuất PDF!');
    }

    const css = `
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Times New Roman',Times,serif;font-size:9.5pt;color:#000;padding:12px 16px;}
      h1{font-size:13pt;font-weight:bold;text-align:center;text-transform:uppercase;margin-bottom:3px;}
      .sub{text-align:center;font-style:italic;margin-bottom:10px;font-size:10pt;}
      .dg-top{text-align:right;font-weight:bold;color:#b91c1c;margin-bottom:6px;font-size:10pt;}
      table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:8.5pt;}
      th,td{border:1px solid #000;padding:3px 2px;text-align:center;vertical-align:middle;}
      th{background:#f1f5f9;font-weight:bold;}
      td.name{text-align:left;padding-left:6px;white-space:nowrap;}
      td.r{text-align:right;padding-right:4px;}
      .yellow{background:#fde047 !important;font-weight:bold;}
      .ft{display:flex;justify-content:space-between;margin-top:20px;padding:0 50px;page-break-inside:avoid;}
      .ft-col{text-align:center;}
      .sig-space{height:50px;}
      @page{size:A4 landscape;margin:6mm 8mm;}
      @media print{
        body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .yellow{background:#fde047 !important;}
      }
    `;

    let rowsHtml = '';
    gvList.forEach((g, idx) => {
      rowsHtml += `<tr>
        <td>${idx + 1}</td>
        <td class="name">${g.ho_ten_hien_thi}</td>
        ${workDays.map((wd) => `<td>${(g.ngay_an || []).includes(wd.dateStr) ? '1' : ''}</td>`).join('')}
        <td style="color:#b91c1c;font-weight:bold;">${g.so_ca}</td>
        <td class="r" style="font-weight:bold;">${g.thanh_tien.toLocaleString('vi-VN')}</td>
      </tr>`;
    });

    const totalRowHtml = `<tr class="yellow">
      <td colspan="2">Tổng cộng</td>
      ${workDays.map((_, i) => `<td>${dailyTotals[i] || ''}</td>`).join('')}
      <td style="color:#b91c1c;">${totalDays}</td>
      <td class="r" style="color:#b91c1c;">${totalMoney.toLocaleString('vi-VN')}</td>
    </tr>`;

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng tính công bán trú ăn (${tuDMY} - ${denDMY})</title><style>${css}</style></head>
    <body>
      <h1>BẢNG TÍNH CÔNG BÁN TRÚ ĂN NĂM HỌC ${namHoc}</h1>
      <div class="sub">(Từ ngày ${tuDMY} - ${denDMY})</div>
      <div class="dg-top">ĐG: ${donGia.toLocaleString('vi-VN')}</div>

      <table>
        <thead>
          <tr>
            <th style="width:32px;">STT</th>
            <th style="width:160px;">Tên\\Thứ</th>
            ${workDays.map((d) => `<th style="min-width:22px;"><div>${d.dowStr}</div><div style="font-size:7pt;font-weight:normal;color:#475569;">${d.dayMonth}</div></th>`).join('')}
            <th style="width:38px;color:#b91c1c;">TC</th>
            <th style="width:85px;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${totalRowHtml}
        </tbody>
      </table>

      <div class="ft">
        <div class="ft-col">
          <div style="font-weight:bold;">Người lập</div>
          <div class="sig-space"></div>
          <div style="font-weight:bold;">${keToanName || 'Trần Thị Hồng Cẩm'}</div>
        </div>
        <div class="ft-col">
          <div style="font-style:italic;">TPHCM, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
          <div style="font-weight:bold;margin-top:2px;">Giám Đốc</div>
          <div class="sig-space"></div>
          <div style="font-weight:bold;">${quanLyName || 'Vũ Quốc Phong'}</div>
        </div>
      </div>
      <script>window.onload=function(){setTimeout(window.print,400);}</script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return alert('Trình duyệt chặn popup!');
    w.document.write(html);
    w.document.close();
  };

  // ── 4. Xuất Excel Bảng Tính Công Bán Trú Ăn ──
  const exportCongAnExcel = () => {
    const workDays = congAnData?.workDays || [];
    const gvList = congAnData?.gvList || [];
    const dailyTotals = congAnData?.dailyTotals || [];
    const totalDays = congAnData?.totalDays || 0;
    const totalMoney = congAnData?.totalMoney || 0;

    if (gvList.length === 0) {
      return alert('Chưa có dữ liệu công ăn từ CSDL để xuất Excel!');
    }

    const headers = [
      'STT',
      'Tên\\Thứ',
      ...workDays.map((d) => `T${d.dowStr} (${d.dayMonth})`),
      'TC',
      'Thành tiền',
    ];

    const dataRows = gvList.map((g, idx) => {
      const dayCells = workDays.map((wd) =>
        (g.ngay_an || []).includes(wd.dateStr) ? 1 : ''
      );
      return [idx + 1, g.ho_ten_hien_thi, ...dayCells, g.so_ca, g.thanh_tien];
    });

    const totalRow = [
      '',
      'Tổng cộng',
      ...dailyTotals,
      totalDays,
      totalMoney,
    ];

    const aoa = [
      [`BẢNG TÍNH CÔNG BÁN TRÚ ĂN NĂM HỌC ${namHoc}`],
      [`(Từ ngày ${tuDMY} đến ${denDMY})`],
      [`Đơn giá: ${donGiaAn.toLocaleString('vi-VN')} đ/buổi`],
      [],
      headers,
      ...dataRows,
      totalRow,
      [],
      ['Người lập', '', '', '', 'Giám Đốc'],
      [keToanName || 'Trần Thị Hồng Cẩm', '', '', '', quanLyName || 'Vũ Quốc Phong'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'CongBanTruAn');
    XLSX.writeFile(wb, `bang-tinh-cong-an_${tuNgay}_den_${denNgay}.xlsx`);
  };

  // ── 5. Xuất PDF Bảng Tính Công Trực Phòng / Trực Ngủ (Đơn giá 180.000đ) ──
  const exportCongNguDonGiaPDF = () => {
    const donGia = congAnData?.don_gia_ngu || 180000;
    const workDays = congAnData?.workDays || [];
    const gvNguList = congAnData?.gvNguList || [];
    const dailyTotalsNgu = congAnData?.dailyTotalsNgu || [];
    const totalDaysNgu = congAnData?.totalDaysNgu || 0;
    const totalMoneyNgu = congAnData?.totalMoneyNgu || 0;

    const css = `
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Times New Roman',Times,serif;font-size:8.5pt;color:#000;padding:10px 14px;}
      h1{font-size:13pt;font-weight:bold;color:#b91c1c;text-align:center;text-transform:uppercase;margin-bottom:2px;}
      .sub{font-size:9.5pt;font-style:italic;text-align:center;margin-bottom:6px;}
      .dg-top{font-size:9.5pt;font-weight:bold;color:#b91c1c;text-align:right;margin-bottom:6px;}
      table{width:100%;border-collapse:collapse;margin-bottom:12px;}
      th,td{border:1px solid #000;padding:3px 2px;text-align:center;vertical-align:middle;}
      th{background:#f1f5f9;font-weight:bold;}
      td.name{text-align:left;padding-left:6px;white-space:nowrap;}
      td.r{text-align:right;padding-right:4px;}
      .yellow{background:#fde047 !important;font-weight:bold;}
      .ft{display:flex;justify-content:space-between;margin-top:20px;padding:0 50px;page-break-inside:avoid;}
      .ft-col{text-align:center;}
      .sig-space{height:50px;}
      @page{size:A4 landscape;margin:6mm 8mm;}
      @media print{
        body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .yellow{background:#fde047 !important;}
      }
    `;

    let rowsHtml = '';
    gvNguList.forEach((g, idx) => {
      rowsHtml += `<tr>
        <td>${idx + 1}</td>
        <td class="name">${g.ho_ten_hien_thi}</td>
        ${workDays.map((wd) => `<td>${(g.ngay_ngu || []).includes(wd.dateStr) ? '1' : ''}</td>`).join('')}
        <td style="color:#b91c1c;font-weight:bold;">${g.so_ca}</td>
        <td class="r" style="font-weight:bold;">${g.thanh_tien.toLocaleString('vi-VN')}</td>
      </tr>`;
    });

    const totalRowHtml = `<tr class="yellow">
      <td colspan="2">Tổng cộng</td>
      ${workDays.map((_, i) => `<td>${dailyTotalsNgu[i] || ''}</td>`).join('')}
      <td style="color:#b91c1c;">${totalDaysNgu}</td>
      <td class="r" style="color:#b91c1c;">${totalMoneyNgu.toLocaleString('vi-VN')}</td>
    </tr>`;

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Bảng tính công trực phòng - trực ngủ (${tuDMY} - ${denDMY})</title><style>${css}</style></head>
    <body>
      <h1>BẢNG TÍNH CÔNG TRỰC PHÒNG (TRỰC NGỦ) NĂM HỌC ${namHoc}</h1>
      <div class="sub">(Từ ngày ${tuDMY} - ${denDMY})</div>
      <div class="dg-top">ĐG: ${donGia.toLocaleString('vi-VN')} đ/buổi</div>

      <table>
        <thead>
          <tr>
            <th style="width:32px;">STT</th>
            <th style="width:160px;">Tên\\Thứ</th>
            ${workDays.map((d) => `<th style="min-width:22px;"><div>${d.dowStr}</div><div style="font-size:7pt;font-weight:normal;color:#475569;">${d.dayMonth}</div></th>`).join('')}
            <th style="width:38px;color:#b91c1c;">TC</th>
            <th style="width:85px;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${totalRowHtml}
        </tbody>
      </table>

      <div class="ft">
        <div class="ft-col">
          <div style="font-weight:bold;">Người lập</div>
          <div class="sig-space"></div>
          <div style="font-weight:bold;">${keToanName || 'Trần Thị Hồng Cẩm'}</div>
        </div>
        <div class="ft-col">
          <div style="font-style:italic;">TPHCM, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
          <div style="font-weight:bold;margin-top:2px;">Giám Đốc</div>
          <div class="sig-space"></div>
          <div style="font-weight:bold;">${quanLyName || 'Vũ Quốc Phong'}</div>
        </div>
      </div>
      <script>window.onload=function(){setTimeout(window.print,400);}</script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return alert('Trình duyệt chặn popup!');
    w.document.write(html);
    w.document.close();
  };

  // ── 6. Xuất Excel Bảng Tính Công Trực Phòng / Trực Ngủ ──
  const exportCongNguExcel = () => {
    const donGiaNgu = congAnData?.don_gia_ngu || 180000;
    const workDays = congAnData?.workDays || [];
    const gvNguList = congAnData?.gvNguList || [];
    const dailyTotalsNgu = congAnData?.dailyTotalsNgu || [];
    const totalDaysNgu = congAnData?.totalDaysNgu || 0;
    const totalMoneyNgu = congAnData?.totalMoneyNgu || 0;

    if (gvNguList.length === 0) {
      return alert('Chưa có dữ liệu trực phòng / trực ngủ từ CSDL để xuất Excel!');
    }

    const headers = [
      'STT',
      'Tên\\Thứ',
      ...workDays.map((d) => `T${d.dowStr} (${d.dayMonth})`),
      'TC',
      'Thành tiền',
    ];

    const dataRows = gvNguList.map((g, idx) => {
      const dayCells = workDays.map((wd) =>
        (g.ngay_ngu || []).includes(wd.dateStr) ? 1 : ''
      );
      return [idx + 1, g.ho_ten_hien_thi, ...dayCells, g.so_ca, g.thanh_tien];
    });

    const totalRow = [
      '',
      'Tổng cộng',
      ...dailyTotalsNgu,
      totalDaysNgu,
      totalMoneyNgu,
    ];

    const aoa = [
      [`BẢNG TÍNH CÔNG TRỰC PHÒNG (TRỰC NGỦ) NĂM HỌC ${namHoc}`],
      [`(Từ ngày ${tuDMY} đến ${denDMY})`],
      [`Đơn giá: ${donGiaNgu.toLocaleString('vi-VN')} đ/buổi`],
      [],
      headers,
      ...dataRows,
      totalRow,
      [],
      ['Người lập', '', '', '', 'Giám Đốc'],
      [keToanName || 'Trần Thị Hồng Cẩm', '', '', '', quanLyName || 'Vũ Quốc Phong'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'CongTrucPhong');
    XLSX.writeFile(wb, `bang-tinh-cong-truc-phong_${tuNgay}_${denNgay}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="bcth-overlay" onClick={onClose}>
      <div className="bcth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bcth-header">
          <div className="bcth-header-title">
            <i className="fas fa-file-invoice-dollar"></i>
            Hệ Thống Báo Cáo &amp; Tính Công Bán Trú
          </div>
          <button className="bcth-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="bcth-tab-bar">
          <button
            className={`bcth-tab-btn ${activeSubTab === 'tong_hop' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('tong_hop')}
          >
            <i className="fas fa-table"></i>
            1. Bảng Tổng Hợp CB-GV-NV
          </button>
          <button
            className={`bcth-tab-btn ${activeSubTab === 'tinh_cong_an' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('tinh_cong_an')}
          >
            <i className="fas fa-utensils"></i>
            2. Bảng Tính Công Ăn (ĐG {donGiaAn ? `${donGiaAn / 1000}k` : '100k'})
          </button>
          <button
            className={`bcth-tab-btn ${activeSubTab === 'tinh_cong_ngu' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('tinh_cong_ngu')}
          >
            <i className="fas fa-bed"></i>
            3. Bảng Tính Công Trực Phòng / Trực Ngủ (ĐG 180k)
          </button>
        </div>

        <div className="bcth-body">
          {activeSubTab === 'tong_hop' && (
            <div>
              <div className="bcth-toolbar">
                <div className="bcth-toolbar-left" style={{ flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center' }}>
                  <span><strong>Năm học:</strong> {namHoc}</span>
                  <span>|</span>
                  <span><strong>Khoảng ngày:</strong> {tuDMY} → {denDMY}</span>
                  <span>|</span>
                  {keToanKys.length > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ color: '#047857', fontSize: '0.84rem' }}><i className="fas fa-link"></i> Nguồn Kế toán:</strong>
                      <select
                        value={selectedKeToanKyId || ''}
                        onChange={(e) => fetchFromKeToan(Number(e.target.value))}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1.5px solid #10b981',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: '#065f46',
                          backgroundColor: '#ecfdf5',
                          cursor: 'pointer',
                        }}
                      >
                        {keToanKys.map((k) => (
                          <option key={k.id} value={k.id}>
                            Kỳ {k.ten_ky} ({k.trang_thai === 'da_chot' ? 'Đã chốt' : 'Tạm tính'})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => fetchFromKeToan(selectedKeToanKyId)}
                        title="Đồng bộ lại từ bảng Kế toán"
                        style={{
                          background: '#ecfdf5',
                          border: '1px solid #10b981',
                          color: '#059669',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        <i className={`fas fa-sync-alt ${isSyncingKeToan ? 'fa-spin' : ''}`}></i> {isSyncingKeToan ? 'Đang tải...' : 'Đồng bộ'}
                      </button>
                    </div>
                  )}
                  <span>|</span>
                  <span style={{ color: '#059669', fontWeight: 700 }}>
                    <i className="fas fa-check-circle"></i> Đồng bộ: {tableData.length} nhân sự
                  </span>
                </div>
                <div className="bcth-toolbar-right">
                  <button className="btn btn-sm" onClick={exportTongHopExcel} style={{ background: '#10b981', color: '#fff', fontWeight: 600 }}>
                    <i className="fas fa-file-excel"></i> Xuất Excel
                  </button>
                  <button className="btn btn-sm" onClick={printTongHop} style={{ background: '#3b82f6', color: '#fff', fontWeight: 600 }} title="In trực tiếp A4 Ngang">
                    <i className="fas fa-print"></i> In / Xem trước
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={downloadTongHopPDF}
                    disabled={isExportingPDF}
                    style={{ background: '#ef4444', color: '#fff', fontWeight: 600 }}
                    title="Tải file PDF A4 Ngang về máy"
                  >
                    <i className={isExportingPDF ? "fas fa-spinner fa-spin" : "fas fa-download"}></i> {isExportingPDF ? 'Đang tạo PDF...' : 'Tải PDF (A4 Ngang)'}
                  </button>
                </div>
              </div>

              <div className="bcth-table-wrapper">
                <table className="bcth-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>STT</th>
                      <th style={{ minWidth: 160 }}>HỌ VÀ TÊN</th>
                      <th title="Tự động tính: Số ca ngủ × 180.000đ">
                        Trực phòng<br /><small>(Trực ngủ 180k)</small>
                      </th>
                      <th className="bcth-cell-green" title="Phụ cấp trực vệ sinh và bảo vệ">Trực vệ sinh và bảo vệ</th>
                      <th className="bcth-cell-green" title="Nhắn tin, tiếp nhận và vệ sinh vật dụng">Tiếp nhận và VS vật dụng</th>
                      <th title={`Tự động tính: ${(donGiaYTe || 70000).toLocaleString('vi-VN')}đ × Số buổi bán trú`}>
                        Y tế<br /><small>(ĐG {(donGiaYTe || 70000).toLocaleString('vi-VN')}đ)</small>
                      </th>
                      <th title="Tự động tính: Số ca ăn × 100.000đ">
                        Bán trú ăn/<br /><small>(KT ATVSTP 100k)</small>
                      </th>
                      <th className="bcth-cell-green" title="Cập nhật TT ăn ngủ hàng tháng">Cập nhật TT ăn ngủ hàng tháng</th>
                      <th>Trực thiết bị<br /><small>(ĐG 100.000đ)</small></th>
                      <th>Trực kiểm tra GS ăn<br /><small>(ĐG 100.000đ)</small></th>
                      <th title={`Tự động tính: ${(donGiaGsBanTru || 250000).toLocaleString('vi-VN')}đ × Số buổi bán trú`}>
                        Trực GS bán trú<br /><small>(ĐG {(donGiaGsBanTru || 250000).toLocaleString('vi-VN')}đ)</small>
                      </th>
                      <th style={{ minWidth: 90, background: '#fef08a' }}>Tổng Cộng</th>
                      <th style={{ minWidth: 110 }}>Tài Khoản</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => {
                      const isVuQuocPhong = row.ho_ten && (row.ho_ten.toLowerCase().includes('vũ quốc phong') || row.ho_ten.toLowerCase().includes('quốc phong'));
                      const isHuynhDucVinh = row.ho_ten && (row.ho_ten.toLowerCase().includes('huỳnh đức vịnh') || row.ho_ten.toLowerCase().includes('đức vịnh'));
                      const rowTotal =
                        (row.truc_phong || 0) +
                        (row.vs_bv || 0) +
                        (row.tiep_nhan_vd || 0) +
                        (row.y_te || 0) +
                        (row.bt_an || 0) +
                        (row.cap_nhat_tt || 0) +
                        (row.thiet_bi || 0) +
                        (row.gs_an || 0) +
                        (row.gs_ban_tru || 0);

                      const vsBvStyle = row.vs_bv > 0
                        ? (row.vs_bv_tan_suat === 'dinh_ky'
                          ? { backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: 'bold' }
                          : { backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold' })
                        : {};

                      const tiepNhanStyle = row.tiep_nhan_vd > 0
                        ? (row.tiep_nhan_vd_tan_suat === 'dinh_ky'
                          ? { backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: 'bold' }
                          : { backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold' })
                        : {};

                      const capNhatStyle = row.cap_nhat_tt > 0
                        ? (row.cap_nhat_tt_tan_suat === 'dinh_ky'
                          ? { backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: 'bold' }
                          : { backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold' })
                        : {};

                      const gsBanTruStyle = (isVuQuocPhong || isHuynhDucVinh || (row.gs_ban_tru && row.gs_ban_tru > 0))
                        ? { backgroundColor: '#ffff00', color: '#000000', fontWeight: 'bold' }
                        : {};

                      return (
                        <tr key={`gv_row_${row.id || idx}_${row.ho_ten}`}>
                          <td className="center">{idx + 1}</td>
                          <td className="name">{row.ho_ten}</td>
                          <td className="right bcth-cell-locked" title="Tự động tính: Số ca ngủ × 180.000đ">
                            {row.truc_phong ? row.truc_phong.toLocaleString('vi-VN') : ''}
                          </td>
                          <td
                            className="right"
                            style={vsBvStyle}
                            title={row.vs_bv > 0 ? (row.vs_bv_tan_suat === 'dinh_ky' ? 'Khoản chi định kỳ' : 'Khoản chi một lần') : ''}
                          >
                            {row.vs_bv ? row.vs_bv.toLocaleString('vi-VN') : ''}
                          </td>
                          <td
                            className="right"
                            style={tiepNhanStyle}
                            title={row.tiep_nhan_vd > 0 ? (row.tiep_nhan_vd_tan_suat === 'dinh_ky' ? 'Khoản chi định kỳ' : 'Khoản chi một lần') : ''}
                          >
                            {row.tiep_nhan_vd ? row.tiep_nhan_vd.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="right bcth-cell-locked" title={`Tự động tính: ${(donGiaYTe || 70000).toLocaleString('vi-VN')}đ × Số buổi bán trú`}>
                            {row.y_te ? row.y_te.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="right bcth-cell-locked" title="Tự động tính: Số ca điểm danh ăn × 100.000đ">
                            {row.bt_an ? row.bt_an.toLocaleString('vi-VN') : ''}
                          </td>
                          <td
                            className="right"
                            style={capNhatStyle}
                            title={row.cap_nhat_tt > 0 ? (row.cap_nhat_tt_tan_suat === 'dinh_ky' ? 'Khoản chi định kỳ' : 'Khoản chi một lần') : ''}
                          >
                            {row.cap_nhat_tt ? row.cap_nhat_tt.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="right bcth-cell-locked" title="Đơn giá: 100.000đ">
                            {row.thiet_bi ? row.thiet_bi.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="right bcth-cell-locked" title="Đơn giá: 100.000đ">
                            {row.gs_an ? row.gs_an.toLocaleString('vi-VN') : ''}
                          </td>
                          <td
                            className="right bcth-cell-locked"
                            style={gsBanTruStyle}
                            title={`Trực GS bán trú: ${soNgayBanTru > 0 ? `${soNgayBanTru} ngày - ` : ''}${row.gs_ban_tru ? row.gs_ban_tru.toLocaleString('vi-VN') : ''}đ`}
                          >
                            {row.gs_ban_tru ? row.gs_ban_tru.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="right bcth-cell-yellow" style={{ fontWeight: 'bold' }}>
                            {rowTotal ? rowTotal.toLocaleString('vi-VN') : ''}
                          </td>
                          <td className="center" style={{ fontWeight: 600, color: '#0369a1', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                            {(row.so_tk && row.so_tk !== '-' && row.so_tk !== '—') ? row.so_tk : ''}
                          </td>
                          <td className="center" style={{ fontSize: '0.85rem', color: '#475569' }}>
                            {row.ghi_chu || ''}
                          </td>
                        </tr>
                      );
                    })}

                    <tr style={{ background: '#fef08a', fontWeight: 'bold' }}>
                      <td colSpan={2} className="center">TỔNG TIỀN</td>
                      <td className="right">{totals.truc_phong.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.vs_bv.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.tiep_nhan_vd.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.y_te.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.bt_an.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.cap_nhat_tt.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.thiet_bi.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.gs_an.toLocaleString('vi-VN')}</td>
                      <td className="right">{totals.gs_ban_tru.toLocaleString('vi-VN')}</td>
                      <td className="right" style={{ fontSize: '10pt', color: '#b91c1c' }}>{totals.grand_total.toLocaleString('vi-VN')}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bcth-reading-text">
                <i className="fas fa-pen-fancy" style={{ marginRight: 6 }}></i>
                Bằng chữ: {wordsTotal}
              </div>

              <div className="bcth-signatures">
                <div className="bcth-sig-col">
                  <div className="bcth-sig-title">Người lập</div>
                  <div style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>(Ký, ghi rõ họ tên)</div>
                  <div className="bcth-sig-space"></div>
                  <div className="bcth-sig-name">{keToanName || 'Trần Thị Hồng Cẩm'}</div>
                </div>
                <div className="bcth-sig-col">
                  <div style={{ fontStyle: 'italic', fontSize: '0.88rem' }}>{todayStr}</div>
                  <div className="bcth-sig-title">GIÁM ĐỐC</div>
                  <div style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>(Ký, ghi rõ họ tên)</div>
                  <div className="bcth-sig-space"></div>
                  <div className="bcth-sig-name">{quanLyName || 'Vũ Quốc Phong'}</div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: BẢNG TÍNH CÔNG ĂN ĐƠN GIÁ (LẤY TỪ CSDL) ─── */}
          {activeSubTab === 'tinh_cong_an' && (
            <div>
              <div className="bcth-toolbar">
                <div className="bcth-toolbar-left">
                  <span><strong>Bảng Tính Công Bán Trú Ăn</strong> (ĐG: {donGiaAn.toLocaleString('vi-VN')}đ/buổi)</span>
                  <span>|</span>
                  {loadingCongAn ? (
                    <span style={{ color: '#0284c7', fontWeight: 600 }}>
                      <i className="fas fa-spinner fa-spin"></i> Đang tải từ CSDL...
                    </span>
                  ) : congAnError ? (
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                      <i className="fas fa-exclamation-triangle"></i> {congAnError}
                    </span>
                  ) : (
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      <i className="fas fa-database"></i> Dữ liệu CSDL ({congAnData?.gvList?.length || 0} GV, {congAnData?.workDays?.length || 0} ngày)
                    </span>
                  )}
                </div>
                <div className="bcth-toolbar-right">
                  <button className="btn btn-sm btn-outline" onClick={fetchCongAnFromDB} disabled={loadingCongAn}>
                    <i className={`fas fa-sync ${loadingCongAn ? 'fa-spin' : ''}`}></i> Nạp lại từ CSDL
                  </button>
                  <button className="btn btn-sm" onClick={exportCongAnExcel} style={{ background: '#10b981', color: '#fff', fontWeight: 600 }}>
                    <i className="fas fa-file-excel"></i> Xuất Excel
                  </button>
                  <button className="btn btn-sm" onClick={exportCongAnDonGiaPDF} style={{ background: '#ef4444', color: '#fff', fontWeight: 600 }}>
                    <i className="fas fa-file-pdf"></i> In / Xuất PDF (A4 Ngang)
                  </button>
                </div>
              </div>

              <div className="bcth-table-wrapper" style={{ padding: 16 }}>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
                    BẢNG TÍNH CÔNG BÁN TRÚ ĂN NĂM HỌC {namHoc}
                  </h2>
                  <div style={{ fontStyle: 'italic', color: '#475569', marginTop: 4 }}>(Từ ngày {tuDMY} - {denDMY})</div>
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#b91c1c', fontSize: '1rem', marginTop: 8 }}>
                    ĐG: {donGiaAn.toLocaleString('vi-VN')}
                  </div>
                </div>

                {loadingCongAn ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <i className="fas fa-spinner fa-spin fa-2x"></i>
                    <p style={{ marginTop: 8 }}>Đang truy vấn bảng phân công trực và tính công ăn từ CSDL...</p>
                  </div>
                ) : (
                  <table className="bcth-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>STT</th>
                        <th style={{ minWidth: 170 }}>Tên\Thứ</th>
                        {(congAnData?.workDays || []).map((d, i) => (
                          <th key={i} style={{ minWidth: 26, padding: '4px 2px' }} title={`Ngày ${d.dayMonth} (${d.dateStr})`}>
                            <div>{d.dowStr}</div>
                            <div style={{ fontSize: '6.5pt', fontWeight: 'normal', color: '#64748b', marginTop: 1 }}>{d.dayMonth}</div>
                          </th>
                        ))}
                        <th style={{ width: 44, color: '#b91c1c' }}>TC</th>
                        <th style={{ width: 100 }}>Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(congAnData?.gvList || []).length === 0 ? (
                        <tr>
                          <td colSpan={(congAnData?.workDays?.length || 0) + 4} style={{ textAlign: 'center', padding: 24, fontStyle: 'italic', color: '#64748b' }}>
                            Không tìm thấy ca trực bán trú ăn nào từ {tuDMY} đến {denDMY} trong CSDL.
                          </td>
                        </tr>
                      ) : (
                        (congAnData?.gvList || []).map((g, idx) => (
                          <tr key={g.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="name">{g.ho_ten_hien_thi}</td>
                            {(congAnData?.workDays || []).map((wd, i) => {
                              const hasDuty = (g.ngay_an || []).includes(wd.dateStr);
                              return (
                                <td key={i} className="center">
                                  {hasDuty ? '1' : ''}
                                </td>
                              );
                            })}
                            <td className="center" style={{ color: '#b91c1c', fontWeight: 'bold' }}>{g.so_ca}</td>
                            <td className="right" style={{ fontWeight: 'bold' }}>{g.thanh_tien.toLocaleString('vi-VN')}</td>
                          </tr>
                        ))
                      )}

                      {(congAnData?.gvList || []).length > 0 && (
                        <tr className="bcth-cell-yellow">
                          <td colSpan={2} className="center">Tổng cộng</td>
                          {(congAnData?.workDays || []).map((_, i) => (
                            <td key={i} className="center font-bold">
                              {congAnData?.dailyTotals?.[i] || ''}
                            </td>
                          ))}
                          <td className="center" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                            {congAnData?.totalDays || 0}
                          </td>
                          <td className="right" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                            {(congAnData?.totalMoney || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 3: BẢNG TÍNH CÔNG TRỰC PHÒNG / TRỰC NGỦ (LẤY TỪ CSDL) ─── */}
          {activeSubTab === 'tinh_cong_ngu' && (
            <div>
              <div className="bcth-toolbar">
                <div className="bcth-toolbar-left">
                  <span><strong>Bảng Tính Công Trực Phòng (Trực Ngủ)</strong> (ĐG: {(congAnData?.don_gia_ngu || 180000).toLocaleString('vi-VN')}đ/buổi)</span>
                  <span>|</span>
                  {loadingCongAn ? (
                    <span style={{ color: '#0284c7', fontWeight: 600 }}>
                      <i className="fas fa-spinner fa-spin"></i> Đang tải từ CSDL...
                    </span>
                  ) : congAnError ? (
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                      <i className="fas fa-exclamation-triangle"></i> {congAnError}
                    </span>
                  ) : (
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      <i className="fas fa-database"></i> Dữ liệu CSDL ({congAnData?.gvNguList?.length || 0} GV, {congAnData?.workDays?.length || 0} ngày)
                    </span>
                  )}
                </div>
                <div className="bcth-toolbar-right">
                  <button className="btn btn-sm btn-outline" onClick={fetchCongAnFromDB} disabled={loadingCongAn}>
                    <i className={`fas fa-sync ${loadingCongAn ? 'fa-spin' : ''}`}></i> Nạp lại từ CSDL
                  </button>
                  <button className="btn btn-sm" onClick={exportCongNguExcel} style={{ background: '#10b981', color: '#fff', fontWeight: 600 }}>
                    <i className="fas fa-file-excel"></i> Xuất Excel
                  </button>
                  <button className="btn btn-sm" onClick={exportCongNguDonGiaPDF} style={{ background: '#ef4444', color: '#fff', fontWeight: 600 }}>
                    <i className="fas fa-file-pdf"></i> In / Xuất PDF (A4 Ngang)
                  </button>
                </div>
              </div>

              <div className="bcth-table-wrapper" style={{ padding: 16 }}>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
                    BẢNG TÍNH CÔNG TRỰC PHÒNG (TRỰC NGỦ) NĂM HỌC {namHoc}
                  </h2>
                  <div style={{ fontStyle: 'italic', color: '#475569', marginTop: 4 }}>(Từ ngày {tuDMY} - {denDMY})</div>
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#b91c1c', fontSize: '1rem', marginTop: 8 }}>
                    ĐG: {(congAnData?.don_gia_ngu || 180000).toLocaleString('vi-VN')} đ/buổi
                  </div>
                </div>

                {loadingCongAn ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <i className="fas fa-spinner fa-spin fa-2x"></i>
                    <p style={{ marginTop: 8 }}>Đang truy vấn bảng phân công trực ngủ từ CSDL...</p>
                  </div>
                ) : (
                  <table className="bcth-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>STT</th>
                        <th style={{ minWidth: 170 }}>Tên\Thứ</th>
                        {(congAnData?.workDays || []).map((d, i) => (
                          <th key={i} style={{ minWidth: 26, padding: '4px 2px' }} title={`Ngày ${d.dayMonth} (${d.dateStr})`}>
                            <div>{d.dowStr}</div>
                            <div style={{ fontSize: '6.5pt', fontWeight: 'normal', color: '#64748b', marginTop: 1 }}>{d.dayMonth}</div>
                          </th>
                        ))}
                        <th style={{ width: 44, color: '#b91c1c' }}>TC</th>
                        <th style={{ width: 100 }}>Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(congAnData?.gvNguList || []).length === 0 ? (
                        <tr>
                          <td colSpan={(congAnData?.workDays?.length || 0) + 4} style={{ textAlign: 'center', padding: 24, fontStyle: 'italic', color: '#64748b' }}>
                            Không tìm thấy ca trực phòng / trực ngủ nào từ {tuDMY} đến {denDMY} trong CSDL.
                          </td>
                        </tr>
                      ) : (
                        (congAnData?.gvNguList || []).map((g, idx) => (
                          <tr key={g.id || idx}>
                            <td className="center">{idx + 1}</td>
                            <td className="name">{g.ho_ten_hien_thi}</td>
                            {(congAnData?.workDays || []).map((wd, i) => {
                              const hasDuty = (g.ngay_ngu || []).includes(wd.dateStr);
                              return (
                                <td key={i} className="center">
                                  {hasDuty ? '1' : ''}
                                </td>
                              );
                            })}
                            <td className="center" style={{ color: '#b91c1c', fontWeight: 'bold' }}>{g.so_ca}</td>
                            <td className="right" style={{ fontWeight: 'bold' }}>{g.thanh_tien.toLocaleString('vi-VN')}</td>
                          </tr>
                        ))
                      )}

                      {(congAnData?.gvNguList || []).length > 0 && (
                        <tr className="bcth-cell-yellow">
                          <td colSpan={2} className="center">Tổng cộng</td>
                          {(congAnData?.workDays || []).map((_, i) => (
                            <td key={i} className="center font-bold">
                              {congAnData?.dailyTotalsNgu?.[i] || ''}
                            </td>
                          ))}
                          <td className="center" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                            {congAnData?.totalDaysNgu || 0}
                          </td>
                          <td className="right" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                            {(congAnData?.totalMoneyNgu || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
