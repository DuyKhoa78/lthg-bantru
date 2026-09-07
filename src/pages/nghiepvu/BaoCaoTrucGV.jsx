import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/admin.css';
import './BaoCaoTrucGV.css';

export default function BaoCaoTrucGV() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();
  const [confirmDel, setConfirmDel] = useState(null);

  // Chế độ xem: 'day' | 'week' | 'month'
  const [viewMode, setViewMode] = useState('day');

  const formatYMD = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseYMD = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // State thời gian (dùng giờ địa phương Việt Nam)
  const today = new Date();
  const todayStr = formatYMD(today);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Tuần (Thứ 2 đến Thứ 6)
  const getWeekRange = (refDateStr) => {
    const d = parseYMD(refDateStr || todayStr);
    const day = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - day + 1);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return {
      start: formatYMD(mon),
      end: formatYMD(fri),
    };
  };

  const [weekRange, setWeekRange] = useState(() => getWeekRange(todayStr));

  // Tháng / Năm
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const [caTruc, setCaTruc] = useState('all'); // 'all', '0', '1'
  const [filterType, setFilterType] = useState('all'); // 'all', 'vi_pham'
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState({
    records: [],
    stats: { total: 0, caAnCount: 0, caNguCount: 0, totalVang: 0, gvSummary: [] },
    phongChuaBaoCaoAn: [],
    phongChuaBaoCaoNgu: [],
    ma_bao_mat_hien_tai: 'BT789',
    ten_truong: 'LÊ THỊ HỒNG GẤM',
    nam_hoc: '2026-2027',
    nguoi_phu_trach: 'Tạ Thị Diệu Lê',
    tu_ngay: todayStr,
    den_ngay: todayStr,
  });

  const [showGuide, setShowGuide] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load danh sách báo cáo theo viewMode
  const loadReports = useCallback(async () => {
    try {
      let url = `/api/baocaotruc/?mode=${viewMode}`;

      if (viewMode === 'day') {
        url += `&ngay=${selectedDate}`;
      } else if (viewMode === 'week') {
        url += `&tu_ngay=${weekRange.start}&den_ngay=${weekRange.end}`;
      } else if (viewMode === 'month') {
        url += `&thang=${selectedMonth}&nam=${selectedYear}`;
      }

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
  }, [viewMode, selectedDate, weekRange, selectedMonth, selectedYear, caTruc, showAlert]);

  // Tải báo cáo lần đầu & tự động cập nhật khi chuyển tab hoặc mỗi 15s (tránh setState đồng bộ trong effect)
  useEffect(() => {
    let ignore = false;

    const fetchCurrentReports = async () => {
      try {
        let url = `/api/baocaotruc/?mode=${viewMode}`;

        if (viewMode === 'day') {
          url += `&ngay=${selectedDate}`;
        } else if (viewMode === 'week') {
          url += `&tu_ngay=${weekRange.start}&den_ngay=${weekRange.end}`;
        } else if (viewMode === 'month') {
          url += `&thang=${selectedMonth}&nam=${selectedYear}`;
        }

        if (caTruc !== 'all') {
          url += `&ca_truc=${caTruc}`;
        }

        const res = await api.get(url);
        if (!ignore && res.data?.ok) {
          setData(res.data);
        }
      } catch (err) {
        if (!ignore) {
          showAlert('Lỗi tải báo cáo: ' + (err.response?.data?.error || err.message), 'danger');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchCurrentReports();

    // Tự động làm mới dữ liệu mỗi 15s để bắt kịp giáo viên nộp Google Form
    const timer = setInterval(() => {
      fetchCurrentReports();
    }, 15000);

    const onFocus = () => {
      fetchCurrentReports();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      ignore = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [viewMode, selectedDate, weekRange, selectedMonth, selectedYear, caTruc, showAlert]);

  // Xóa báo cáo (Admin/Quản lý) sử dụng ConfirmDialog thay thế window.confirm
  const handleDelete = (id, phong, gv, ca_truc) => {
    setConfirmDel({
      type: 'single',
      id,
      title: 'Xác nhận xóa bản ghi báo cáo',
      message: `Bạn có chắc chắn muốn xóa bản ghi báo cáo của giáo viên "${gv}" (Phòng ${phong} - ${ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa'}) khỏi hệ thống?`
    });
  };

  // Xóa toàn bộ dữ liệu theo khoảng thời gian sau khi đã xuất báo cáo
  const handleClearRange = () => {
    const rangeName = viewMode === 'month'
      ? `Tháng ${selectedMonth}/${selectedYear}`
      : viewMode === 'week'
        ? `Tuần từ ${formatDateVN(data.tu_ngay)} đến ${formatDateVN(data.den_ngay)}`
        : `Ngày ${formatDateVN(data.tu_ngay)}`;
    setConfirmDel({
      type: 'range',
      title: `Xác nhận xóa dữ liệu ${rangeName}`,
      message: `Hành động này sẽ xóa toàn bộ ${data.records?.length || 0} lượt báo cáo của ${rangeName} (sau khi Thầy/Cô đã xuất biên bản/báo cáo). Thao tác này không thể hoàn tác!`
    });
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      if (confirmDel.type === 'single') {
        const res = await api.post('/api/baocaotruc/delete/', { id: confirmDel.id });
        if (res.data?.ok) {
          showAlert('Đã xóa bản ghi báo cáo thành công', 'success');
          setConfirmDel(null);
          setLoading(true);
          loadReports();
        }
      } else if (confirmDel.type === 'range') {
        let payload = {};
        if (viewMode === 'month') {
          payload = { thang: selectedMonth, nam: selectedYear };
        } else if (viewMode === 'week') {
          payload = { tu_ngay: data.tu_ngay, den_ngay: data.den_ngay };
        } else {
          payload = { tu_ngay: data.tu_ngay, den_ngay: data.den_ngay };
        }
        if (caTruc !== 'all') payload.ca_truc = caTruc;
        const res = await api.post('/api/baocaotruc/delete-range/', payload);
        if (res.data?.ok) {
          showAlert(res.data.message || 'Đã xóa dữ liệu thành công', 'success');
          setConfirmDel(null);
          setLoading(true);
          loadReports();
        }
      }
    } catch (err) {
      showAlert('Không thể xóa: ' + (err.response?.data?.error || err.message), 'danger');
      setConfirmDel(null);
    }
  };

  // Format thời gian hiển thị đúng giờ nộp trên Google Form/Sheet (tránh bị lệch +7 tiếng)
  const formatTime = (iso) => {
    if (!iso) return '';
    try {
      const s = String(iso).trim();
      // Trích xuất trực tiếp giờ:phút nguyên bản từ chuỗi thời gian do Google gửi
      const m = s.match(/[T\s](\d{1,2}):(\d{2})/);
      if (m) {
        return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
      }
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  const formatDateVN = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Trích xuất danh sách học sinh vi phạm từ nội dung giáo viên điền
  // Hỗ trợ giáo viên điền nhiều học sinh, có hoặc không có thời gian vi phạm (VD: 2 giờ HS A, 2.15 HS B...)
  const parseStudentViolations = useCallback((rawText, record = {}) => {
    if (!rawText || !rawText.trim()) return [];

    const text = rawText.trim();
    let rawItems;

    if (text.includes('\n')) {
      rawItems = text.split('\n').map(s => s.trim()).filter(Boolean);
    } else if (text.includes(';') || text.includes(' | ')) {
      rawItems = text.split(/[;|]/).map(s => s.trim()).filter(Boolean);
    } else {
      // Phân tách nếu có nhiều học sinh ngăn cách bằng dấu phẩy theo mốc thời gian hoặc danh xưng
      const splitPattern = /,\s*(?=(?:\d{1,2}(?:\s*giờ(?:\s*\d{1,2})?|\.\d{2}|:\d{2}|[hH]\d{0,2})|HS\s+|em\s+|bạn\s+|(?:\b(?:10|11|12)[A-Za-z]\d*)))/i;
      if (splitPattern.test(text)) {
        rawItems = text.split(splitPattern).map(s => s.trim()).filter(Boolean);
      } else {
        rawItems = [text];
      }
    }

    return rawItems.map((item, idx) => {
      // Chỉ gỡ bỏ ký tự đầu dòng nếu là gạch đầu dòng, dấu chấm tròn hoặc số thứ tự dạng 1. / 1)
      const cleanItem = item.replace(/^[-*•\s]+/, '').replace(/^\d+[.)]\s+/, '').trim();

      // 1. Trích xuất mốc thời gian vi phạm nếu giáo viên có ghi (VD: 2 giờ, 2.15, 12h30, 13:15, 2h...)
      let timeFound = '';
      const timeMatch = cleanItem.match(/(?:lúc\s*)?(\b\d{1,2}(?:\s*giờ(?:\s*\d{1,2})?|\.\d{2}|:\d{2}|[hH]\d{0,2}))\b/i);
      if (timeMatch) {
        timeFound = timeMatch[0].trim();
      }

      // 2. Trích xuất Lớp (VD: 10A1, 11B2, 12C3, (11B2), Lớp 10A1...)
      let classFound = 'Chưa rõ lớp';
      const classMatch = cleanItem.match(/(?:\b(?:lớp|lop)\s*)?\(?(\b(?:10|11|12)[A-Za-z]\d*)\)?/i);
      if (classMatch) {
        classFound = classMatch[1].toUpperCase();
      }

      return {
        id: `${record.id || 'r'}_${idx}`,
        recordId: record.id,
        index: idx + 1,
        raw: cleanItem,
        thoi_gian_vi_pham: timeFound,
        thoi_gian_hien_thi: timeFound || (record.created_at ? formatTime(record.created_at) : ''),
        lop: classFound,
        ma_phong: record.ma_phong || '',
        ca_truc: record.ca_truc,
        ca_str: record.ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa',
        ngay: record.ngay || '',
        ngay_str: formatDateVN(record.ngay),
        created_at: record.created_at,
        ho_ten_gv: record.ho_ten_gv || '',
        tinh_hinh: record.tinh_hinh || '',
        ghi_chu: record.ghi_chu || '',
      };
    });
  }, []);

  // Danh sách toàn bộ các ca học sinh vi phạm đã được phân tích theo từng học sinh
  const allParsedViolations = useMemo(() => {
    const viPhamRecords = (data.records || []).filter(r => r.hs_vi_pham && r.hs_vi_pham.trim());
    const list = [];
    viPhamRecords.forEach(r => {
      const items = parseStudentViolations(r.hs_vi_pham, r);
      items.forEach(it => list.push(it));
    });
    return list;
  }, [data.records, parseStudentViolations]);

  // Gom nhóm học sinh vi phạm theo Lớp (phục vụ gửi GVCN)
  const violationsByClass = useMemo(() => {
    const groups = {};
    allParsedViolations.forEach(item => {
      const c = item.lop || 'Chưa rõ lớp';
      if (!groups[c]) groups[c] = [];
      groups[c].push(item);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Chưa rõ lớp') return 1;
      if (b === 'Chưa rõ lớp') return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const result = {};
    sortedKeys.forEach(k => {
      result[k] = groups[k];
    });
    return result;
  }, [allParsedViolations]);

  // Lọc dữ liệu theo search và filterType
  const filteredRecords = useMemo(() => {
    let list = data.records || [];
    if (filterType === 'vi_pham') {
      list = list.filter(r => r.hs_vi_pham && r.hs_vi_pham.trim());
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(r =>
        (r.ho_ten_gv || '').toLowerCase().includes(q) ||
        (r.ma_phong || '').toLowerCase().includes(q) ||
        (r.si_so || '').toLowerCase().includes(q) ||
        (r.hs_vi_pham || '').toLowerCase().includes(q) ||
        (r.ghi_chu || '').toLowerCase().includes(q) ||
        (r.ngay || '').includes(q)
      );
    }
    return list;
  }, [data.records, filterType, searchTerm]);

  // Điều hướng Ngày
  const changeDateBy = (offsetDays) => {
    setLoading(true);
    const d = parseYMD(selectedDate);
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(formatYMD(d));
  };

  // Điều hướng Tuần
  const changeWeekBy = (offsetWeeks) => {
    setLoading(true);
    const d = parseYMD(weekRange.start);
    d.setDate(d.getDate() + offsetWeeks * 7);
    setWeekRange(getWeekRange(formatYMD(d)));
  };

  // ── 2.1. HÀM XUẤT BIÊN BẢN BÁO CÁO TỔNG HỢP CA TRỰC GỬI LÃNH ĐẠO / BGH (PDF A4 KHỔ ĐỨNG) ──
  const exportLeaderReportPdf = () => {
    if (!data.records || data.records.length === 0) {
      showAlert('Chưa có dữ liệu báo cáo nào trong thời gian này để xuất biên bản!', 'info');
      return;
    }

    const todayDate = new Date();
    const todayStrFull = `TP. Hồ Chí Minh, ngày ${todayDate.getDate()} tháng ${todayDate.getMonth() + 1} năm ${todayDate.getFullYear()}`;

    const timeTitle = viewMode === 'day'
      ? `Ngày ${formatDateVN(data.tu_ngay)}`
      : viewMode === 'week'
      ? `Tuần từ ngày ${formatDateVN(data.tu_ngay)} đến ngày ${formatDateVN(data.den_ngay)}`
      : `Tháng ${selectedMonth} năm ${selectedYear}`;

    // Luôn thống kê toàn bộ form / các phòng đã nộp báo cáo ca trực
    const sortedRecords = [...(data.records || [])].sort((a, b) => {
      if (a.ngay !== b.ngay) {
        return (a.ngay || '').localeCompare(b.ngay || '');
      }
      if (a.ca_truc !== b.ca_truc) {
        return (a.ca_truc || 0) - (b.ca_truc || 0);
      }
      return (a.ma_phong || '').localeCompare(b.ma_phong || '', undefined, { numeric: true });
    });

    const tot = data.records.length;
    const viPhamRoomsCount = (data.records || []).filter(r => r.hs_vi_pham && r.hs_vi_pham.trim()).length;
    const okCount = tot - viPhamRoomsCount;
    const okPercent = tot > 0 ? Math.round((okCount / tot) * 100) : 100;
    const totalHsVang = (data.records || []).reduce((sum, r) => sum + (Number(r.so_hs_vang) || 0), 0);

    // Khối phòng chưa nộp (nếu xem theo ngày)
    let pendingRoomsHtml = '';
    if (viewMode === 'day' && (data.phongChuaBaoCaoAn?.length > 0 || data.phongChuaBaoCaoNgu?.length > 0)) {
      pendingRoomsHtml = `
        <div style="font-size:9pt; font-style:italic; margin-top:4px; color:#b91c1c;">
          * Lưu ý các phòng chưa gửi báo cáo: ${data.phongChuaBaoCaoAn?.length > 0 ? `Ca Ăn (${data.phongChuaBaoCaoAn.join(', ')})` : ''} ${data.phongChuaBaoCaoNgu?.length > 0 ? `Ca Nghỉ (${data.phongChuaBaoCaoNgu.join(', ')})` : ''}
        </div>
      `;
    }

    const rowsHtml = sortedRecords.map((r, i) => {
      const hasViPham = Boolean(r.hs_vi_pham && r.hs_vi_pham.trim());
      const soVang = Number(r.so_hs_vang) || 0;

      return `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="text-align:center; font-size:8.5pt;">
          <div style="font-weight:600;">${formatDateVN(r.ngay)}</div>
          ${r.created_at ? `<div style="font-size:8pt; color:#64748b; margin-top:2px;">(Lúc ${formatTime(r.created_at)})</div>` : ''}
        </td>
        <td style="text-align:center; font-size:9pt;">
          <div>${r.ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa'}</div>
          <div style="font-weight:bold; color:#1e3a8a;">Phòng ${r.ma_phong}</div>
        </td>
        <td style="font-size:9pt;">
          <div style="font-weight:600; color:#1e293b;">${r.ho_ten_gv || '—'}</div>
          ${r.sdt_xac_nhan ? `<div style="font-size:8pt; color:#64748b;">${r.sdt_xac_nhan}</div>` : ''}
        </td>
        <td style="text-align:center; font-size:8.5pt;">
          <div style="font-weight:600; color:#0f172a;">Sĩ số: <strong style="font-size:9.5pt;">${r.si_so || '—'}</strong></div>
          ${soVang > 0 
            ? `<div style="color:#dc2626; font-weight:bold; margin-top:2px;">Vắng: ${soVang}</div>` 
            : '<div style="color:#16a34a; font-size:8pt; margin-top:2px;">0 vắng</div>'}
          ${r.danh_sach_vang ? `<div style="font-size:7.5pt; color:#b91c1c; font-style:italic; margin-top:1px;">(${r.danh_sach_vang})</div>` : ''}
        </td>
        <td style="font-size:9pt; color:#334155;">
          ${r.tinh_hinh && r.tinh_hinh.trim() ? r.tinh_hinh : 'Tốt, trật tự'}
        </td>
        <td style="font-size:9pt;">
          ${hasViPham 
            ? `<div style="font-weight:bold; color:#b91c1c;">${r.hs_vi_pham}</div>` 
            : '<span style="color:#16a34a; font-weight:600;">✓ Không có</span>'}
        </td>
        <td style="font-size:8.5pt; color:#475569;">
          ${r.ghi_chu && r.ghi_chu.trim() ? r.ghi_chu : '<span style="color:#94a3b8; font-style:italic;">—</span>'}
        </td>
      </tr>
      `;
    }).join('');

    const mainTitle = 'BÁO CÁO TỔNG HỢP TÌNH HÌNH TRỰC BÁN TRÚ';
    const section2Title = 'II. BẢNG TỔNG HỢP CHI TIẾT CÁC CA TRỰC / PHÒNG BÁN TRÚ';

    const printHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${mainTitle} - Gửi Ban Giám Hiệu</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm 10mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:"Times New Roman",Times,serif; font-size:10pt; color:#000; background:#fff; line-height:1.28; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
    .hdr-left { text-align:center; width:48%; }
    .hdr-left .l1 { font-size:9pt; }
    .hdr-left .l2 { font-size:10pt; font-weight:bold; }
    .hdr-left .l3 { font-size:9.5pt; font-style:italic; text-decoration:underline; }
    .hdr-right { text-align:center; width:50%; }
    .hdr-right .l1 { font-size:9.5pt; font-weight:bold; }
    .hdr-right .l2 { font-size:9.5pt; font-weight:bold; }
    .hdr-divider { width:120px; height:1px; background:#000; margin:2px auto 0; }
    .title-box { text-align:center; margin:10px 0 12px; }
    .main-title { font-size:13pt; font-weight:bold; text-transform:uppercase; color:#000; letter-spacing:0.5px; }
    .sub-title { font-size:10pt; font-style:italic; margin-top:3px; }
    
    table.data-table { width:100%; border-collapse:collapse; border:1px solid #000; margin-bottom:12px; font-size:8.8pt; }
    table.data-table th, table.data-table td { border:1px solid #000; padding:4px 5px; vertical-align:middle; }
    table.data-table th { background:#f5f5f5 !important; text-align:center; font-weight:bold; font-size:8.8pt; }
    table.data-table tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    
    .note-box { font-style:italic; font-size:9pt; margin-top:8px; margin-bottom:12px; color:#1e293b; line-height:1.45; }
    .sig-section { display:flex; justify-content:flex-end; margin-top:20px; page-break-inside:avoid; break-inside:avoid; }
    .sig-box { width:45%; text-align:center; }
    .sig-date { font-style:italic; font-size:9.5pt; margin-bottom:4px; }
    .sig-role { font-weight:bold; font-size:10.5pt; text-transform:uppercase; }
    .sig-hint { font-style:italic; font-size:8.5pt; }
    .sig-space { height:55px; }
    .sig-name { font-weight:bold; font-size:10.5pt; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="l1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
      <div class="l2">${data.ten_truong ? (data.ten_truong.includes('TRƯỜNG') || data.ten_truong.includes('TRUNG TÂM') ? data.ten_truong : `TRƯỜNG THPT ${data.ten_truong}`) : 'TRƯỜNG THPT LÊ THI HỒNG GẤM'}</div>
      <div class="l3">Bộ phận Quản lý Bán trú</div>
    </div>
    <div class="hdr-right">
      <div class="l1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div class="l2">Độc lập – Tự do – Hạnh phúc</div>
      <div class="hdr-divider"></div>
    </div>
  </div>

  <div class="title-box">
    <h1 class="main-title">${mainTitle}</h1>
    <div class="sub-title">Thời gian: <strong>${timeTitle}</strong> (Năm học: ${data.nam_hoc || '2026-2027'})</div>
  </div>

  <div style="font-size:10pt; margin-bottom:10px; line-height:1.45;">
    <strong>I. TÌNH HÌNH TỔNG QUÁT:</strong>
    <div style="margin-left:15px; margin-top:3px;">
      - Tổng số ca trực tiếp nhận báo cáo: <strong>${tot} lượt</strong> (Ca Ăn trưa: ${data.stats?.caAnCount || 0} lượt, Ca Nghỉ trưa: ${data.stats?.caNguCount || 0} lượt).<br />
      - Nề nếp chung: <strong>${okCount}/${tot} phòng (${okPercent}%)</strong> học sinh chấp hành tốt nội quy.<br />
      - Tình hình học sinh vắng trong ca trực: <strong>${totalHsVang} lượt</strong> học sinh vắng.<br />
      - Học sinh vi phạm nề nếp / bất thường: ${viPhamRoomsCount > 0 
        ? `<strong style="color:#b91c1c;">${viPhamRoomsCount} phòng (${allParsedViolations.length} lượt vi phạm)</strong> có ghi nhận học sinh vi phạm cần xử lý.` 
        : `<strong style="color:#16a34a;">Không có</strong> (100% các phòng đều sinh hoạt nghiêm túc).`}
    </div>
  </div>

  <div style="font-weight:bold; font-size:10pt; text-transform:uppercase; margin-bottom:6px; color:#000;">
    ${section2Title}
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width:30px;">STT</th>
        <th style="width:75px;">Thời gian</th>
        <th style="width:75px;">Ca & Phòng</th>
        <th style="width:105px;">Giáo viên trực</th>
        <th style="width:70px;">Sĩ số / Vắng</th>
        <th style="width:115px;">Tình hình nề nếp</th>
        <th>Học sinh vi phạm / Bất thường</th>
        <th style="width:110px;">Ghi chú / Kiến nghị</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="note-box">
    ${viPhamRoomsCount > 0 
      ? `* Ghi chú: Toàn bộ các trường hợp học sinh có hành vi bất thường / vi phạm nề nếp đã được bôi đỏ đậm trong danh sách trên.
         <br />** Kính đề nghị Ban Giám Thị và Giáo viên Chủ nhiệm liên hệ phụ huynh, làm việc với các học sinh có tên nêu trên để răn đe, giáo dục.`
      : `* Ghi chú: Toàn bộ các phòng trong ca trực đều sinh hoạt nghiêm túc, học sinh chấp hành tốt nội quy, không có học sinh vi phạm.`}
    ${pendingRoomsHtml}
  </div>

  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-date">${todayStrFull}</div>
      <div class="sig-role">NGƯỜI LẬP BẢNG</div>
      <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
      <div class="sig-space"></div>
      <div class="sig-name">${user?.fullname || 'Huỳnh Duy Khoa'}</div>
    </div>
  </div>

  <script>window.onload = function() { setTimeout(window.print, 400); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showAlert('Trình duyệt đang chặn cửa sổ mới! Vui lòng cho phép popup để xem và in biên bản.', 'warning');
      return;
    }
    w.document.write(printHtml);
    w.document.close();
  };

  // ── 2.2. HÀM XUẤT DANH SÁCH HỌC SINH VI PHẠM THEO LỚP GỬI GIÁO VIÊN CHỦ NHIỆM (PDF A4 KHỔ ĐỨNG - CẮT TRANG RIÊNG TỪNG LỚP) ──
  const exportGvcnReportPdf = (targetLop = null) => {
    if (allParsedViolations.length === 0) {
      showAlert('Không có trường hợp học sinh vi phạm nào trong thời gian này để xuất báo cáo gửi GVCN!', 'info');
      return;
    }

    const todayDate = new Date();
    const todayStrFull = `TP. Hồ Chí Minh, ngày ${todayDate.getDate()} tháng ${todayDate.getMonth() + 1} năm ${todayDate.getFullYear()}`;

    const timeTitle = viewMode === 'day'
      ? `Ngày ${formatDateVN(data.tu_ngay)}`
      : viewMode === 'week'
      ? `Tuần từ ngày ${formatDateVN(data.tu_ngay)} đến ngày ${formatDateVN(data.den_ngay)}`
      : `Tháng ${selectedMonth} năm ${selectedYear}`;

    let classEntries = Object.entries(violationsByClass);
    if (targetLop && targetLop !== 'all') {
      classEntries = classEntries.filter(([c]) => c === targetLop);
      if (classEntries.length === 0) {
        showAlert(`Không có học sinh vi phạm nào thuộc Lớp ${targetLop}!`, 'info');
        return;
      }
    }

    const classPagesHtml = classEntries.map(([lopName, students]) => `
      <div class="class-page">
        <div class="hdr">
          <div class="hdr-left">
            <div class="l1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
            <div class="l2">${data.ten_truong ? (data.ten_truong.includes('TRƯỜNG') || data.ten_truong.includes('TRUNG TÂM') ? data.ten_truong : `TRƯỜNG THPT ${data.ten_truong}`) : 'TRƯỜNG THPT LÊ THI HỒNG GẤM'}</div>
            <div class="l3">Bộ phận Quản lý Bán trú</div>
          </div>
          <div class="hdr-right">
            <div class="l1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div class="l2">Độc lập – Tự do – Hạnh phúc</div>
            <div class="hdr-divider"></div>
          </div>
        </div>

        <div class="title-box">
          <h1 class="main-title">BÁO CÁO DANH SÁCH HỌC SINH VI PHẠM NỀ NẾP BÁN TRÚ</h1>
          <div class="sub-title">Thời gian: <strong>${timeTitle}</strong> (Năm học: ${data.nam_hoc || '2026-2027'})</div>
        </div>

        <div style="font-size:10pt; margin-bottom:12px; line-height:1.45;">
          <strong>Kính gửi:</strong> Giáo viên Chủ nhiệm <strong>Lớp ${lopName}</strong>
          <div style="font-style:italic; font-size:9.5pt; color:#1e293b; margin-top:2px;">
            Bộ phận Quản lý Bán trú thông báo danh sách học sinh của lớp có hành vi vi phạm nề nếp trong ca trực bán trú để Thầy/Cô nắm bắt và phối hợp nhắc nhở, giáo dục:
          </div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width:35px;">STT</th>
              <th style="width:85px;">Thời gian</th>
              <th style="width:80px;">Ca & Phòng</th>
              <th>Họ tên học sinh & Chi tiết vi phạm cụ thể</th>
              <th style="width:160px;">Đề xuất GVCN phối hợp</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="text-align:center; font-size:9pt;">
                  <div style="font-weight:600;">${s.ngay_str}</div>
                  ${s.thoi_gian_vi_pham ? `<div style="color:#b91c1c; font-weight:bold;">${s.thoi_gian_vi_pham}</div>` : (s.created_at ? `<div style="color:#64748b; font-size:8.5pt;">(Lúc ${formatTime(s.created_at)})</div>` : '-')}
                </td>
                <td style="text-align:center; font-size:9pt;">
                  <div>${s.ca_str}</div>
                  <div style="font-weight:bold; color:#1e3a8a;">Phòng ${s.ma_phong}</div>
                </td>
                <td>
                  <div style="font-weight:bold; color:#b91c1c; font-size:9.5pt;">${s.raw}</div>
                </td>
                <td style="font-size:9pt; color:#1e293b;">
                  ${[s.tinh_hinh, s.ghi_chu].filter(Boolean).join(' - ') || 'Nhắc nhở, liên hệ PH răn đe'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="note-box">
          * Ghi chú: Học sinh có thể ghi nhận mốc thời gian vi phạm cụ thể trong ca trực (nếu có ghi nhận).
          <br />** Kính đề nghị Quý Thầy/Cô Chủ nhiệm phối hợp cùng Ban Giám Thị nhắc nhở, làm việc với học sinh và liên hệ phụ huynh để răn đe, giáo dục.
        </div>

        <div class="sig-section" style="display:flex; justify-content:flex-end; margin-top:24px; page-break-inside:avoid;">
          <div class="sig-box" style="width:45%; text-align:center;">
            <div class="sig-date">${todayStrFull}</div>
            <div class="sig-role">NGƯỜI LẬP BẢNG</div>
            <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
            <div class="sig-space" style="height:60px;"></div>
            <div class="sig-name">${user?.fullname || 'Huỳnh Duy Khoa'}</div>
          </div>
        </div>
      </div>
    `).join('');

    const printHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Cáo Học Sinh Vi Phạm Nề Nếp Bán Trú Theo Lớp - Gửi GVCN</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm 12mm 14mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:"Times New Roman",Times,serif; font-size:10pt; color:#000; background:#fff; line-height:1.28; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
    .hdr-left { text-align:center; width:48%; }
    .hdr-left .l1 { font-size:9pt; }
    .hdr-left .l2 { font-size:10pt; font-weight:bold; }
    .hdr-left .l3 { font-size:9.5pt; font-style:italic; text-decoration:underline; }
    .hdr-right { text-align:center; width:50%; }
    .hdr-right .l1 { font-size:9.5pt; font-weight:bold; }
    .hdr-right .l2 { font-size:9.5pt; font-weight:bold; }
    .hdr-divider { width:120px; height:1px; background:#000; margin:2px auto 0; }
    .title-box { text-align:center; margin:10px 0 12px; }
    .main-title { font-size:13.5pt; font-weight:bold; text-transform:uppercase; color:#000; letter-spacing:0.5px; }
    .sub-title { font-size:10.5pt; font-style:italic; margin-top:3px; }
    
    table.data-table { width:100%; border-collapse:collapse; border:1px solid #000; font-size:9.5pt; margin-bottom:10px; }
    table.data-table th, table.data-table td { border:1px solid #000; padding:5px 6px; vertical-align:middle; }
    table.data-table th { background:#f5f5f5 !important; text-align:center; font-weight:bold; }
    
    .note-box { font-style:italic; font-size:9.5pt; margin-top:8px; margin-bottom:12px; color:#1e293b; }
    .sig-section { display:flex; justify-content:flex-end; margin-top:20px; page-break-inside:avoid; }
    .sig-box { width:45%; text-align:center; }
    .sig-date { font-style:italic; font-size:9.5pt; margin-bottom:4px; }
    .sig-role { font-weight:bold; font-size:10.5pt; text-transform:uppercase; }
    .sig-hint { font-style:italic; font-size:8.5pt; }
    .sig-space { height:60px; }
    .sig-name { font-weight:bold; font-size:10.5pt; }

    .class-page {
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .class-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    @media screen {
      .class-page {
        padding-bottom: 24px;
        margin-bottom: 28px;
        border-bottom: 2px dashed #94a3b8;
      }
      .class-page:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }
    }

    @media print {
      body { margin: 0; padding: 0; }
      .class-page {
        page-break-after: always !important;
        break-after: page !important;
        border-bottom: none !important;
        margin-bottom: 0 !important;
        padding-bottom: 0 !important;
      }
      .class-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  </style>
</head>
<body>
  ${classPagesHtml}
  <script>window.onload = function() { setTimeout(window.print, 400); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showAlert('Trình duyệt đang chặn cửa sổ mới! Vui lòng cho phép popup để xem và in biên bản.', 'warning');
      return;
    }
    w.document.write(printHtml);
    w.document.close();
  };

  // ── 2.2. HÀM XUẤT BIÊN BẢN BÁO CÁO ĐẦY ĐỦ TẤT CẢ CÁC PHÒNG (IN / PDF A4) ──
  const exportDailyReportPdf = () => {
    if (!data.records || data.records.length === 0) {
      showAlert('Chưa có dữ liệu báo cáo để xuất biên bản!', 'warning');
      return;
    }

    const todayDate = new Date();
    const todayStrFull = `TP. Hồ Chí Minh, ngày ${todayDate.getDate()} tháng ${todayDate.getMonth() + 1} năm ${todayDate.getFullYear()}`;

    const titleText = viewMode === 'day'
      ? 'BIÊN BẢN TỔNG HỢP TÌNH HÌNH TRỰC BÁN TRÚ NGÀY'
      : viewMode === 'week'
      ? 'BIÊN BẢN TỔNG HỢP TÌNH HÌNH TRỰC BÁN TRÚ THEO TUẦN'
      : 'BẢNG TỔNG HỢP TÌNH HÌNH TRỰC BÁN TRÚ THEO THÁNG';

    const subTitleText = viewMode === 'day'
      ? `Ngày: <strong>${formatDateVN(data.tu_ngay)}</strong> (Năm học: ${data.nam_hoc || '2026-2027'})`
      : viewMode === 'week'
      ? `Tuần từ ngày <strong>${formatDateVN(data.tu_ngay)}</strong> đến ngày <strong>${formatDateVN(data.den_ngay)}</strong> (Năm học: ${data.nam_hoc || '2026-2027'})`
      : `Tháng <strong>${selectedMonth}/${selectedYear}</strong> (Năm học: ${data.nam_hoc || '2026-2027'})`;

    // Danh sách các phòng
    const rowsHtml = data.records.map((r, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="text-align:center; font-weight:600;">${formatDateVN(r.ngay)}</td>
        <td style="text-align:center;">${r.ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa'}</td>
        <td style="text-align:center; font-weight:bold;">${r.ma_phong}</td>
        <td style="text-align:center; font-weight:600;">${r.si_so || '—'}</td>
        <td style="font-weight:600;">${r.ho_ten_gv || ''}</td>
        <td>${r.hs_vi_pham ? `<div style="color:#b91c1c; font-weight:bold;">${r.hs_vi_pham}</div>` : 'Bình thường, trật tự'}</td>
        <td>${[r.tinh_hinh, r.ghi_chu].filter(Boolean).join(' - ') || 'Bình thường'}</td>
      </tr>
    `).join('');

    // Khối phòng chưa nộp (nếu xem theo ngày)
    let pendingRoomsHtml = '';
    if (viewMode === 'day' && (data.phongChuaBaoCaoAn?.length > 0 || data.phongChuaBaoCaoNgu?.length > 0)) {
      pendingRoomsHtml = `
        <div style="font-size:9.5pt; font-style:italic; margin-bottom:12px; color:#1e293b;">
          * Lưu ý các phòng chưa gửi báo cáo: ${data.phongChuaBaoCaoAn?.length > 0 ? `Ca Ăn (${data.phongChuaBaoCaoAn.join(', ')})` : ''} ${data.phongChuaBaoCaoNgu?.length > 0 ? `Ca Nghỉ (${data.phongChuaBaoCaoNgu.join(', ')})` : ''}
        </div>
      `;
    }

    const printHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${titleText} (${data.tu_ngay} đến ${data.den_ngay})</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm 10mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:"Times New Roman",Times,serif; font-size:10pt; color:#000; background:#fff; line-height:1.25; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
    .hdr-left { text-align:center; width:48%; }
    .hdr-left .l1 { font-size:9pt; }
    .hdr-left .l2 { font-size:10pt; font-weight:bold; }
    .hdr-left .l3 { font-size:9.5pt; font-style:italic; text-decoration:underline; }
    .hdr-right { text-align:center; width:50%; }
    .hdr-right .l1 { font-size:9.5pt; font-weight:bold; }
    .hdr-right .l2 { font-size:9.5pt; font-weight:bold; }
    .hdr-divider { width:130px; height:1px; background:#000; margin:2px auto 0; }
    .title-box { text-align:center; margin:10px 0 14px; }
    .main-title { font-size:14pt; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; }
    .sub-title { font-size:11pt; font-style:italic; margin-top:3px; color:#1e293b; }

    table.data-table { width:100%; border-collapse:collapse; border:1.5px solid #000; margin-bottom:14px; font-size:9.5pt; }
    table.data-table th, table.data-table td { border:1px solid #000; padding:5px 6px; vertical-align:middle; }
    table.data-table th { background:#f5f5f5 !important; text-align:center; font-weight:bold; }
    
    .sig-section { display:flex; justify-content:space-between; margin-top:20px; page-break-inside:avoid; break-inside:avoid; }
    .sig-box { width:45%; text-align:center; }
    .sig-date { font-style:italic; font-size:10pt; margin-bottom:4px; }
    .sig-role { font-weight:bold; font-size:11pt; text-transform:uppercase; }
    .sig-hint { font-style:italic; font-size:9pt; }
    .sig-space { height:60px; }
    .sig-name { font-weight:bold; font-size:11pt; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="l1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
      <div class="l2">${data.ten_truong ? (data.ten_truong.includes('TRƯỜNG') || data.ten_truong.includes('TRUNG TÂM') ? data.ten_truong : `TRƯỜNG THPT ${data.ten_truong}`) : 'TRƯỜNG THPT LÊ THI HỒNG GẤM'}</div>
      <div class="l3">Bộ phận Quản lý Bán trú</div>
    </div>
    <div class="hdr-right">
      <div class="l1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div class="l2">Độc lập – Tự do – Hạnh phúc</div>
      <div class="hdr-divider"></div>
    </div>
  </div>

  <div class="title-box">
    <h1 class="main-title">${titleText}</h1>
    <div class="sub-title">${subTitleText}</div>
  </div>

  ${pendingRoomsHtml}

  <div style="font-weight:bold; font-size:10.5pt; text-transform:uppercase; margin-bottom:6px; color:#000;">
    BẢNG CHI TIẾT CÁC LƯỢT BÁO CÁO CA TRỰC
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width:35px;">STT</th>
        <th style="width:90px;">Ngày trực</th>
        <th style="width:75px;">Ca trực</th>
        <th style="width:60px;">Phòng</th>
        <th style="width:55px;">Sỉ số</th>
        <th style="width:140px;">Giáo viên trực</th>
        <th style="width:300px;">Học sinh bất thường / Quậy phá / Sự cố</th>
        <th>Tình hình nề nếp & CSVC</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="sig-section" style="display:flex; justify-content:flex-end; margin-top:24px; page-break-inside:avoid;">
    <div class="sig-box" style="width:40%; text-align:center;">
      <div class="sig-date">${todayStrFull}</div>
      <div class="sig-role">NGƯỜI LẬP BẢNG</div>
      <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
      <div class="sig-space" style="height:65px;"></div>
      <div class="sig-name">${user?.fullname || 'Huỳnh Duy Khoa'}</div>
    </div>
  </div>

  <script>window.onload = function() { setTimeout(window.print, 400); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showAlert('Trình duyệt đang chặn cửa sổ mới! Vui lòng cho phép popup để xem và in biên bản.', 'warning');
      return;
    }
    w.document.write(printHtml);
    w.document.close();
  };

  // ── 3. HÀM XUẤT BẢNG TÍNH EXCEL (.XLSX CHUẨN MICROSOFT EXCEL) ──
  const exportExcelDaily = () => {
    if (!data.records || data.records.length === 0) {
      showAlert('Chưa có dữ liệu để xuất Excel!', 'warning');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Danh sách chi tiết các ca trực
      const headerRows = [
        ['TRƯỜNG THPT LÊ THỊ HỒNG GẤM - BỘ PHẬN QUẢN LÝ BÁN TRÚ'],
        [`BÁO CÁO CA TRỰC BÁN TRÚ (${viewMode === 'day' ? `Ngày ${formatDateVN(data.tu_ngay)}` : viewMode === 'week' ? `Tuần từ ${formatDateVN(data.tu_ngay)} đến ${formatDateVN(data.den_ngay)}` : `Tháng ${selectedMonth}/${selectedYear}`})`],
        [`Tổng số lượt trực: ${data.records.length} lượt | Ca Ăn: ${data.stats?.caAnCount || 0} | Ca Nghỉ: ${data.stats?.caNguCount || 0} | HS Vi phạm: ${data.stats?.coViPhamCount || 0} phòng`],
        [],
        [
          'STT',
          'Ngày trực',
          'Giờ gửi',
          'Ca trực',
          'Mã phòng',
          'Sỉ số',
          'Giáo viên trực',
          'Học sinh bất thường / Quậy phá / Sự cố',
          'Tình hình nề nếp chung',
          'Ghi chú đề xuất CSVC'
        ]
      ];

      const dataRows = data.records.map((r, i) => [
        i + 1,
        formatDateVN(r.ngay),
        formatTime(r.created_at),
        r.ca_truc === 0 ? 'Ăn trưa' : 'Nghỉ trưa',
        r.ma_phong,
        r.si_so || '',
        r.ho_ten_gv,
        r.hs_vi_pham || 'Bình thường, trật tự',
        r.tinh_hinh || 'Bình thường',
        r.ghi_chu || ''
      ]);

      const aoaAll = [...headerRows, ...dataRows];
      const wsAll = XLSX.utils.aoa_to_sheet(aoaAll);

      // Định dạng độ rộng cột (Column widths)
      wsAll['!cols'] = [
        { wch: 6 },  // STT
        { wch: 14 }, // Ngày trực
        { wch: 10 }, // Giờ gửi
        { wch: 12 }, // Ca trực
        { wch: 12 }, // Mã phòng
        { wch: 10 }, // Sỉ số
        { wch: 26 }, // Giáo viên trực
        { wch: 45 }, // Học sinh bất thường
        { wch: 25 }, // Tình hình nề nếp
        { wch: 30 }, // Ghi chú CSVC
      ];

      XLSX.utils.book_append_sheet(wb, wsAll, 'Chi_Tiet_Bao_Cao');

      // Sheet 2: Danh sách các trường hợp vi phạm chi tiết từng học sinh (Báo cáo BGH)
      if (allParsedViolations.length > 0) {
        const vpHeader = [
          ['DANH SÁCH HỌC SINH VI PHẠM NỀ NẾP BÁN TRÚ (BÁO CÁO BAN GIÁM HIỆU)'],
          [`Thời gian: ${viewMode === 'day' ? `Ngày ${formatDateVN(data.tu_ngay)}` : `Từ ${formatDateVN(data.tu_ngay)} đến ${formatDateVN(data.den_ngay)}`} | Tổng số học sinh vi phạm: ${allParsedViolations.length} lượt`],
          [],
          ['STT', 'Lớp', 'Ngày trực', 'Thời gian vi phạm', 'Ca trực', 'Phòng', 'Chi tiết Học sinh & Hành vi vi phạm cụ thể', 'Ghi chú / Kiến nghị xử lý']
        ];
        const vpRows = allParsedViolations.map((v, i) => [
          i + 1,
          v.lop,
          v.ngay_str,
          v.thoi_gian_vi_pham || (v.created_at ? `Lúc ${formatTime(v.created_at)}` : ''),
          v.ca_str,
          v.ma_phong,
          v.raw,
          [v.tinh_hinh, v.ghi_chu].filter(Boolean).join(' - ') || 'Cần GVCN & Giám thị nhắc nhở'
        ]);
        const wsVP = XLSX.utils.aoa_to_sheet([...vpHeader, ...vpRows]);
        wsVP['!cols'] = [
          { wch: 6 },
          { wch: 12 },
          { wch: 14 },
          { wch: 18 },
          { wch: 12 },
          { wch: 10 },
          { wch: 50 },
          { wch: 35 }
        ];
        XLSX.utils.book_append_sheet(wb, wsVP, 'HS_Vi_Pham');

        // Sheet 3: Danh sách gom theo Lớp để gửi Giáo viên Chủ nhiệm
        const lopHeader = [
          ['DANH SÁCH HỌC SINH VI PHẠM NỀ NẾP BÁN TRÚ - PHÂN THEO TỪNG LỚP'],
          [`Thời gian: ${viewMode === 'day' ? `Ngày ${formatDateVN(data.tu_ngay)}` : `Từ ${formatDateVN(data.tu_ngay)} đến ${formatDateVN(data.den_ngay)}`}`],
          [],
          ['Lớp', 'STT', 'Họ tên & Chi tiết vi phạm', 'Thời gian vi phạm', 'Ngày trực', 'Ca trực', 'Phòng', 'Kiến nghị GVCN phối hợp']
        ];
        const lopRows = [];
        Object.entries(violationsByClass).forEach(([lopName, students]) => {
          students.forEach((s, idx) => {
            lopRows.push([
              lopName,
              idx + 1,
              s.raw,
              s.thoi_gian_vi_pham || (s.created_at ? `Lúc ${formatTime(s.created_at)}` : ''),
              s.ngay_str,
              s.ca_str,
              s.ma_phong,
              [s.tinh_hinh, s.ghi_chu].filter(Boolean).join(' - ') || 'Nhắc nhở, răn đe học sinh'
            ]);
          });
        });
        const wsLop = XLSX.utils.aoa_to_sheet([...lopHeader, ...lopRows]);
        wsLop['!cols'] = [
          { wch: 12 },
          { wch: 6 },
          { wch: 50 },
          { wch: 18 },
          { wch: 14 },
          { wch: 12 },
          { wch: 10 },
          { wch: 35 }
        ];
        XLSX.utils.book_append_sheet(wb, wsLop, 'Theo_Lop_Gui_GVCN');
      }

      // Tên file chuẩn .xlsx
      const fileName = `Bao_Cao_Truc_${viewMode}_${data.tu_ngay}_den_${data.den_ngay}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showAlert(`Đã tải xuống file Excel chuẩn (.xlsx) thành công: ${fileName}!`, 'success');
    } catch (err) {
      console.error('Lỗi xuất Excel:', err);
      showAlert('Không thể xuất file Excel: ' + err.message, 'danger');
    }
  };

  // Code mẫu Apps Script
  const sampleScript = `/**
 * GOOGLE APPS SCRIPT - BÁO CÁO CA TRỰC THPT LÊ THI HỒNG GẤM
 * Hỗ trợ Form chia 2 phần (Trực ăn & Trực ngủ) hoặc Google Sheets 13 cột chuẩn.
 * Dán code này vào Google Form hoặc Google Sheets -> Tiện ích mở rộng -> Apps Script
 */
const WEBHOOK_URL = "${window.location.origin.includes('localhost') ? 'https://lthg-bantru.vercel.app' : window.location.origin}/api/webhook/google-form-baocao";
const WEBHOOK_SECRET = "bantru-lthg-secret-key-2025";

/**
 * 🚀 CÁCH 1: HÀM DÀNH CHO GOOGLE FORM (Tạo trigger On form submit chọn hàm này)
 */
function onFormSubmit(e) {
  try {
    const timestamp = e.response.getTimestamp();
    let thoi_gian_nop = Utilities.formatDate(timestamp, "Asia/Ho_Chi_Minh", "yyyy-MM-dd'T'HH:mm:ss") + "+07:00";

    const itemResponses = e.response.getItemResponses();
    let ca_truc = "Trực ăn";
    let ma_phong = "", ho_ten_gv = "";
    let si_so = "";
    let hs_vi_pham = "";
    let tinh_hinh = "Tốt", ghi_chu = "";

    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
      const answer = String(itemResponses[i].getResponse() || "").trim();
      if (!answer) continue;

      if (title.includes("ca")) {
        ca_truc = answer;
      } else if (title.includes("phòng") || title.includes("phong")) {
        ma_phong = answer;
        if (title.includes("ăn")) ca_truc = "Trực ăn";
        else if (title.includes("ngủ") || title.includes("nghi")) ca_truc = "Trực ngủ";
      } else if (title.includes("giáo viên") || title.includes("họ và tên") || title.includes("họ tên") || title.includes("tên gv")) {
        ho_ten_gv = answer;
      } else if (title.includes("sỉ số") || title.includes("sĩ số") || title.includes("số lượng") || title.includes("số hs")) {
        si_so = answer;
      } else if (title.includes("vi phạm") || title.includes("bất thường") || title.includes("quậy") || title.includes("mất trật tự") || title.includes("sự cố")) {
        hs_vi_pham = answer;
      } else if (title.includes("tình hình") || title.includes("nề nếp") || title.includes("nền nếp") || title.includes("trật tự")) {
        tinh_hinh = answer;
      } else if (title.includes("ghi chú") || title.includes("góp ý") || title.includes("đề xuất") || title.includes("phản ánh")) {
        ghi_chu = answer;
      }
    }

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: thoi_gian_nop,
      ca_truc: ca_truc,
      ma_phong: ma_phong,
      ho_ten_gv: ho_ten_gv,
      si_so: si_so,
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
    Logger.log("Lỗi Form: " + err.toString());
  }
}

/**
 * 🚀 CÁCH 2: HÀM DÀNH CHO GOOGLE SHEETS (Nếu dán Apps Script từ Google Trang tính)
 * Tạo trigger chọn hàm 'onSheetSubmit', Loại sự kiện: 'Khi gửi biểu mẫu' (On form submit)
 */
function onSheetSubmit(e) {
  try {
    const row = e.values || [];
    // Thứ tự 13 cột theo Google Sheets mới:
    // 0: Dấu thời gian | 1: Ca trực 
    // Ca ăn: 2: Họ và tên giáo viên | 3: Phòng ăn | 4: Tình hình chung | 5: Sỉ số | 6: Ghi chú/Góp ý
    // Ca ngủ: 7: Họ và tên | 8: Phòng ngủ | 9: Sỉ số | 10: Tình hình chung | 11: Ghi nhận HS vi phạm nề nếp (Nếu có) | 12: Ghi chú/Góp ý
    const timestamp = row[0] || new Date();
    const ca_truc_raw = row[1] || "";
    const isCaNgu = String(ca_truc_raw).toLowerCase().includes("ngủ") || String(ca_truc_raw).toLowerCase().includes("nghi") || (Boolean(row[8]) && !row[3]);

    const payload = {
      token: WEBHOOK_SECRET,
      thoi_gian_nop: timestamp,
      ca_truc: isCaNgu ? "Trực ngủ" : "Trực ăn",
      ho_ten_gv: isCaNgu ? (row[7] || "") : (row[2] || ""),
      ma_phong: isCaNgu ? (row[8] || "") : (row[3] || ""),
      si_so: isCaNgu ? (row[9] || "") : (row[5] || ""),
      tinh_hinh: isCaNgu ? (row[10] || "Tốt") : (row[4] || "Tốt"),
      hs_vi_pham: isCaNgu ? (row[11] || "") : "",
      ghi_chu: isCaNgu ? (row[12] || "") : (row[6] || ""),
      nguon: "google_sheet"
    };

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Lỗi Sheets: " + err.toString());
  }
}

/**
 * ⚡ TỰ ĐỘNG TẠO GOOGLE FORM PHÂN NHÁNH 2 PHẦN (ĂN & NGỦ) CHỈ 1 CLICK:
 * Chọn hàm 'tuDongTaoFormBaoCao' ở thanh trên cùng và bấm 'Chạy' (Run).
 */
function tuDongTaoFormBaoCao() {
  const form = FormApp.getActiveForm();
  form.setTitle("BÁO CÁO CA TRỰC BÁN TRÚ - THPT LÊ THI HỒNG GẤM")
      .setDescription("Hệ thống tự động đồng bộ về phần mềm quản lý của trường.");

  const items = form.getItems();
  for (let i = 0; i < items.length; i++) form.deleteItem(items[i]);

  const teachers = [
    "Bùi Phùng Đức Anh", "Bùi Thanh Toàn", "Cao Thị Mai Huệ", "Đặng Thị Yến", "Đào Thị Cẩm Hạnh",
    "Đinh Thị Tuyết Lan", "Đỗ Ngọc Bích Vân", "Đỗ Văn Thương", "Hồ Quang Thịnh", "Hoàng Thanh Thủy",
    "Huỳnh Duy Khoa", "Lê Hoàng Hà", "Lê Thị Huyền Nhung", "Lý Công Thành", "Mai Quỳnh Châu",
    "Mai Thị Tường Vi", "Nguyễn Ngọc Cầm", "Nguyễn Thị Nhung", "Phạm Thị Thanh Hà", "Phan Thanh Nhật",
    "Trần Bá Lâm", "Trần Nhật Tân", "Trần Nhật Thiên Thanh", "Trần Thị Khánh Huyền", "Trần Thị Kim Thoại", "N. Tân + N. Cầm"
  ];
  const roomsAn = ["HT.A", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "A20", "A21", "D21", "D22", "D23", "D31", "D32", "D33", "D41", "D42", "D43", "E", "E1", "E2", "E3"];
  const roomsNgu = ["D21", "D22", "D23", "D31", "D32", "D33", "D41", "D42", "D43", "A20", "A21", "E", "E1", "E2", "E3", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "HT.A"];

  // PHẦN 1: Ca Trực ăn
  const pageAn = form.addPageBreakItem().setTitle("PHẦN 1: BÁO CÁO CA TRỰC ĂN TRƯA");
  form.addListItem().setTitle("Họ và tên giáo viên").setChoiceValues(teachers).setRequired(true);
  form.addListItem().setTitle("Phòng ăn").setChoiceValues(roomsAn).setRequired(true);
  form.addMultipleChoiceItem().setTitle("Tình hình chung").setChoiceValues(["Tốt", "Bình Thường", "Còn ồn ào, nhắc nhở", "Khác"]).showOtherOption(true);
  form.addTextItem().setTitle("Sỉ số");
  form.addParagraphTextItem().setTitle("Ghi chú/Góp ý");

  // PHẦN 2: Ca Trực ngủ
  const pageNgu = form.addPageBreakItem().setTitle("PHẦN 2: BÁO CÁO CA TRỰC NGHỈ TRƯA");
  form.addListItem().setTitle("Họ và tên").setChoiceValues(teachers).setRequired(true);
  form.addListItem().setTitle("Phòng ngủ").setChoiceValues(roomsNgu).setRequired(true);
  form.addTextItem().setTitle("Sỉ số");
  form.addMultipleChoiceItem().setTitle("Tình hình chung").setChoiceValues(["Tốt", "Bình Thường", "Còn ồn ào, nhắc nhở", "Khác"]).showOtherOption(true);
  form.addParagraphTextItem().setTitle("Ghi nhận HS vi phạm nề nếp (Nếu có)").setHelpText("Ghi rõ Họ tên HS, Lớp, thời gian vi phạm nếu có. Nếu không có để trống.");
  form.addParagraphTextItem().setTitle("Ghi chú/Góp ý");

  // ĐIỀU HƯỚNG TRANG ĐẦU: Ca trực
  const itemCa = form.addMultipleChoiceItem();
  itemCa.setTitle("Ca trực")
        .setChoices([
           itemCa.createChoice("Trực ăn", pageAn),
           itemCa.createChoice("Trực ngủ", pageNgu)
        ])
        .setRequired(true);
  form.moveItem(itemCa.getIndex(), 0);

  Logger.log("✅ Đã tự động tạo xong Biểu mẫu Form 2 nhánh (Trực ăn & Trực ngủ) chuẩn xác 100%!");
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
        <div className="bctruc-title-group">
          <div className="bctruc-title-icon">
            <i className="fas fa-clipboard-check"></i>
          </div>
          <div className="bctruc-title-text">
            <h1 className="bctruc-title">
              Báo cáo ca trực Giáo viên
              <span className="bctruc-live-badge">
                <span className="bctruc-live-dot"></span>
                Tự động từ Google Form
              </span>
            </h1>
            <div className="bctruc-subtitle">
              Theo dõi tiến độ nộp báo cáo, nề nếp phòng ăn &amp; phòng ngủ theo thời gian thực
            </div>
          </div>
        </div>

        {/* CÁC NÚT HÀNH ĐỘNG TỔNG HỢP & XUẤT */}
        <div className="bctruc-actions">
          <button
            className="bctruc-btn bctruc-btn-danger"
            onClick={exportLeaderReportPdf}
            title="Xuất biên bản báo cáo gửi Ban Giám Hiệu (Khổ giấy đứng A4)"
          >
            <i className="fas fa-file-invoice"></i>
            <span>Biên bản BGH</span>
          </button>

          <button
            className="bctruc-btn bctruc-btn-warning"
            onClick={exportGvcnReportPdf}
            title="Xuất danh sách học sinh vi phạm phân theo từng Lớp gửi Giáo viên Chủ nhiệm (Khổ giấy đứng A4)"
          >
            <i className="fas fa-chalkboard-teacher"></i>
            <span>Báo cáo GVCN (Lớp)</span>
          </button>

          <button
            className="bctruc-btn bctruc-btn-outline"
            onClick={exportDailyReportPdf}
            title="Xuất biên bản báo cáo trực bán trú đầy đủ tất cả các phòng theo chuẩn văn bản A4"
          >
            <i className="fas fa-print"></i>
            <span>In ca trực</span>
          </button>

          <button
            className="bctruc-btn bctruc-btn-excel"
            onClick={exportExcelDaily}
            title="Tải bảng tính Excel chi tiết báo cáo"
          >
            <i className="fas fa-file-excel"></i>
            <span>Xuất Excel</span>
          </button>

          <button
            className="bctruc-btn bctruc-btn-primary"
            onClick={() => setShowGuide(true)}
            title="Xem hướng dẫn tích hợp Google Form tự động"
          >
            <i className="fab fa-google"></i>
            <span>Hướng dẫn Form</span>
          </button>

          {(user?.is_admin || user?.is_superuser) && data.records?.length > 0 && (
            <button
              className="bctruc-btn bctruc-btn-danger-ghost"
              onClick={handleClearRange}
              title="Xóa toàn bộ dữ liệu báo cáo sau khi đã xuất báo cáo"
            >
              <i className="fas fa-trash-alt"></i>
              <span>Xóa dữ liệu</span>
            </button>
          )}
        </div>
      </div>

      {/* ── BỘ ĐIỀU HƯỚNG THỜI GIAN: NGÀY / TUẦN / THÁNG ── */}
      <div className="bctruc-toolbar">
        {/* Switch Chế độ: Ngày / Tuần / Tháng */}
        <div className="bctruc-view-switch">
          <button
            className={`bctruc-view-btn ${viewMode === 'day' ? 'active' : ''}`}
            onClick={() => setViewMode('day')}
          >
            <i className="fas fa-calendar-day"></i> Ngày
          </button>
          <button
            className={`bctruc-view-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => setViewMode('week')}
          >
            <i className="fas fa-calendar-week"></i> Tuần
          </button>
          <button
            className={`bctruc-view-btn ${viewMode === 'month' ? 'active' : ''}`}
            onClick={() => setViewMode('month')}
          >
            <i className="fas fa-calendar-alt"></i> Tháng
          </button>
        </div>

        {/* Bộ chọn chi tiết theo từng chế độ */}
        <div className="bctruc-toolbar-controls">
          {/* CHẾ ĐỘ NGÀY */}
          {viewMode === 'day' && (
            <>
              <button className="bctruc-nav-arrow" onClick={() => changeDateBy(-1)} title="Ngày trước">
                <i className="fas fa-chevron-left"></i>
              </button>
              <input
                type="date"
                className="bctruc-date-input"
                style={{ width: 145 }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <button className="bctruc-nav-arrow" onClick={() => changeDateBy(1)} title="Ngày sau">
                <i className="fas fa-chevron-right"></i>
              </button>
              <button
                className="bctruc-quick-btn"
                onClick={() => setSelectedDate(todayStr)}
              >
                Hôm nay
              </button>
            </>
          )}

          {/* CHẾ ĐỘ TUẦN */}
          {viewMode === 'week' && (
            <>
              <button className="bctruc-nav-arrow" onClick={() => changeWeekBy(-1)} title="Tuần trước">
                <i className="fas fa-chevron-left"></i>
              </button>
              <div className="bctruc-week-pill">
                <i className="far fa-calendar-check"></i>
                <span>{formatDateVN(weekRange.start)} ➔ {formatDateVN(weekRange.end)}</span>
              </div>
              <button className="bctruc-nav-arrow" onClick={() => changeWeekBy(1)} title="Tuần sau">
                <i className="fas fa-chevron-right"></i>
              </button>
              <button
                className="bctruc-quick-btn"
                onClick={() => setWeekRange(getWeekRange(todayStr))}
              >
                Tuần này
              </button>
            </>
          )}

          {/* CHẾ ĐỘ THÁNG */}
          {viewMode === 'month' && (
            <>
              <select
                className="bctruc-select"
                style={{ width: 115 }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>

              <select
                className="bctruc-select"
                style={{ width: 95 }}
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              >
                {[2025, 2026, 2027, 2028].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                className="bctruc-quick-btn"
                onClick={() => {
                  setSelectedMonth(today.getMonth() + 1);
                  setSelectedYear(today.getFullYear());
                }}
              >
                Tháng này
              </button>
            </>
          )}

          <div className="bctruc-toolbar-divider"></div>

          {/* Lọc Ca trực */}
          <select
            className="bctruc-select"
            style={{ width: 140 }}
            value={caTruc}
            onChange={(e) => setCaTruc(e.target.value)}
          >
            <option value="all">Tất cả ca trực</option>
            <option value="0">Ca Ăn trưa</option>
            <option value="1">Ca Nghỉ trưa</option>
          </select>

          <button
            className="bctruc-refresh-btn"
            onClick={() => loadReports()}
            disabled={loading}
            title="Làm mới dữ liệu"
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
      </div>

      {/* 5 Hero Stat Cards */}
      <div className="bctruc-stats-grid">
        <div className="bctruc-stat-card theme-blue">
          <div className="bctruc-stat-top">
            <div className="bctruc-stat-icon">
              <i className="fas fa-file-signature"></i>
            </div>
            <div className="bctruc-stat-meta">
              <div className="bctruc-stat-label">Báo cáo nhận được</div>
              <div className="bctruc-stat-value">
                {data.stats?.total || 0}
                <span className="bctruc-stat-value-unit">lượt</span>
              </div>
            </div>
          </div>
          <div className="bctruc-stat-footer">
            <span className="bctruc-stat-badge blue">
              <i className="fas fa-check-circle"></i> Đã đồng bộ
            </span>
          </div>
        </div>

        <div className="bctruc-stat-card theme-amber">
          <div className="bctruc-stat-top">
            <div className="bctruc-stat-icon">
              <i className="fas fa-utensils"></i>
            </div>
            <div className="bctruc-stat-meta">
              <div className="bctruc-stat-label">Ca Ăn trưa</div>
              <div className="bctruc-stat-value">
                {data.stats?.caAnCount || 0}
                {viewMode === 'day' && data.stats?.totalPhongAn ? (
                  <span className="bctruc-stat-value-unit">/ {data.stats.totalPhongAn}</span>
                ) : (
                  <span className="bctruc-stat-value-unit">lượt</span>
                )}
              </div>
            </div>
          </div>
          <div className="bctruc-stat-footer">
            <span className="bctruc-stat-badge amber">
              <i className="fas fa-clock"></i> Khung 11h - 12h
            </span>
          </div>
        </div>

        <div className="bctruc-stat-card theme-purple">
          <div className="bctruc-stat-top">
            <div className="bctruc-stat-icon">
              <i className="fas fa-bed"></i>
            </div>
            <div className="bctruc-stat-meta">
              <div className="bctruc-stat-label">Ca Nghỉ trưa</div>
              <div className="bctruc-stat-value">
                {data.stats?.caNguCount || 0}
                {viewMode === 'day' && data.stats?.totalPhongNgu ? (
                  <span className="bctruc-stat-value-unit">/ {data.stats.totalPhongNgu}</span>
                ) : (
                  <span className="bctruc-stat-value-unit">lượt</span>
                )}
              </div>
            </div>
          </div>
          <div className="bctruc-stat-footer">
            <span className="bctruc-stat-badge purple">
              <i className="fas fa-moon"></i> Khung 12h - 13h30
            </span>
          </div>
        </div>

        <div
          className="bctruc-stat-card theme-red"
          onClick={() => setFilterType(filterType === 'vi_pham' ? 'all' : 'vi_pham')}
          title="Bấm để lọc danh sách học sinh vi phạm gửi BGH"
        >
          <div className="bctruc-stat-top">
            <div className="bctruc-stat-icon">
              <i className={`fas ${(data.stats?.coViPhamCount || 0) > 0 ? 'fa-bullhorn' : 'fa-check-circle'}`}></i>
            </div>
            <div className="bctruc-stat-meta">
              <div className="bctruc-stat-label">HS Vi phạm / Bất thường</div>
              <div className="bctruc-stat-value" style={{ color: (data.stats?.coViPhamCount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                {data.stats?.coViPhamCount || 0}
                <span className="bctruc-stat-value-unit" style={{ color: (data.stats?.coViPhamCount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                  phòng
                </span>
              </div>
            </div>
          </div>
          <div className="bctruc-stat-footer">
            {(data.stats?.coViPhamCount || 0) > 0 ? (
              <span className="bctruc-stat-badge red">
                <i className="fas fa-exclamation-triangle"></i> Cần xử lý • Xem ngay ➔
              </span>
            ) : (
              <span className="bctruc-stat-badge green">
                <i className="fas fa-check"></i> Không có vi phạm
              </span>
            )}
          </div>
        </div>

        <div className="bctruc-stat-card theme-green">
          <div className="bctruc-stat-top">
            <div className="bctruc-stat-icon">
              <i className="fas fa-shield-alt"></i>
            </div>
            <div className="bctruc-stat-meta">
              <div className="bctruc-stat-label">Phòng nề nếp tốt</div>
              <div className="bctruc-stat-value" style={{ color: '#16a34a' }}>
                {Math.max(0, (data.records?.length || 0) - (data.stats?.coViPhamCount || 0))}
                <span className="bctruc-stat-value-unit" style={{ color: '#16a34a' }}>phòng</span>
              </div>
            </div>
          </div>
          <div className="bctruc-stat-footer">
            <span className="bctruc-stat-badge green">
              <i className="fas fa-smile"></i> Chấp hành tốt
            </span>
          </div>
        </div>
      </div>

      {/* Cảnh báo phòng chưa gửi (chỉ khi xem theo ngày) */}
      {viewMode === 'day' && (data.phongChuaBaoCaoAn?.length > 0 || data.phongChuaBaoCaoNgu?.length > 0) && (
        <div className="bctruc-pending-banner">
          <div className="bctruc-pending-icon">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <div className="bctruc-pending-content">
            <div className="bctruc-pending-title">
              Tiến độ nộp báo cáo ngày {formatDateVN(selectedDate)}: Chưa đủ 100% các phòng
            </div>
            <div className="bctruc-pending-rooms-wrap">
              {data.phongChuaBaoCaoAn?.length > 0 && (
                <div className="bctruc-pending-group">
                  <span className="bctruc-pending-group-label">Ca Ăn ({data.phongChuaBaoCaoAn.length} phòng):</span>
                  <div className="bctruc-pending-tags">
                    {data.phongChuaBaoCaoAn.map(p => (
                      <span key={p} className="bctruc-pending-tag">{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.phongChuaBaoCaoNgu?.length > 0 && (
                <div className="bctruc-pending-group">
                  <span className="bctruc-pending-group-label">Ca Ngủ ({data.phongChuaBaoCaoNgu.length} phòng):</span>
                  <div className="bctruc-pending-tags">
                    {data.phongChuaBaoCaoNgu.map(p => (
                      <span key={p} className="bctruc-pending-tag">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Danh sách báo cáo chi tiết */}
      <div className="bctruc-card">
        <div className="bctruc-table-header">
          <h3 className="bctruc-table-title">
            Chi tiết các lượt báo cáo ({filteredRecords.length} lượt)
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, marginLeft: 8 }}>
              (Từ {formatDateVN(data.tu_ngay)} đến {formatDateVN(data.den_ngay)})
            </span>
          </h3>

          {/* Filter tabs & Search */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="bctruc-view-switch" style={{ padding: 2 }}>
              <button
                className={`bctruc-view-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
                style={{ fontSize: '0.8rem', padding: '5px 12px' }}
              >
                Tất cả ({data.records?.length || 0})
              </button>
              <button
                className={`bctruc-view-btn ${filterType === 'vi_pham' ? 'active' : ''}`}
                onClick={() => setFilterType('vi_pham')}
                style={{
                  fontSize: '0.8rem',
                  padding: '5px 12px',
                  color: filterType === 'vi_pham' ? '#dc2626' : '#b91c1c',
                  fontWeight: 700
                }}
                title="Lọc riêng các phòng có học sinh vi phạm để báo cáo Ban Giám Hiệu"
              >
                <i className="fas fa-bullhorn" style={{ marginRight: 4 }}></i>
                Chỉ HS vi phạm ({data.stats?.coViPhamCount || 0})
              </button>
            </div>

            <div className="bctruc-search-box">
              <i className="fas fa-search bctruc-search-icon"></i>
              <input
                type="text"
                className="bctruc-search-input"
                placeholder="Tìm ngày, GV, phòng, HS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Banner chế độ Báo cáo Lãnh đạo */}
        {filterType === 'vi_pham' && (
          <div style={{
            background: '#fef2f2',
            border: '1.5px solid #fca5a5',
            padding: '12px 16px',
            margin: '0 20px 16px 20px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div>
              <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-bullhorn"></i> CHẾ ĐỘ BÁO CÁO LÃNH ĐẠO: CÁC TRƯỜNG HỢP HỌC SINH VI PHẠM
              </div>
              <div style={{ fontSize: '0.84rem', color: '#7f1d1d', marginTop: 3 }}>
                Đang ghi nhận <strong>{allParsedViolations.length} lượt vi phạm</strong> (thuộc {Object.keys(violationsByClass).length} lớp) cần Ban Giám Hiệu và GVCN phối hợp xử lý.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="bctruc-btn bctruc-btn-danger" onClick={exportLeaderReportPdf} style={{ height: 34, fontSize: '0.82rem' }}>
                <i className="fas fa-file-pdf"></i> In biên bản BGH (Khổ đứng)
              </button>
              <button className="bctruc-btn bctruc-btn-warning" onClick={exportGvcnReportPdf} style={{ height: 34, fontSize: '0.82rem' }}>
                <i className="fas fa-chalkboard-teacher"></i> In danh sách gửi GVCN
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#009CFF' }}></i>
            <p style={{ marginTop: 12 }}>Đang tải báo cáo ca trực...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="bctruc-empty">
            <i className="fas fa-clipboard-list"></i>
            <h4>{filterType === 'vi_pham' ? 'Không có học sinh nào vi phạm!' : 'Không có báo cáo nào trong khoảng thời gian này'}</h4>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              {filterType === 'vi_pham'
                ? 'Toàn bộ các phòng đều có nề nếp tốt, học sinh trật tự và không có sự cố nào cần báo cáo Lãnh đạo.'
                : 'Khi giáo viên gửi biểu mẫu Google Form, thông tin sẽ hiển thị tự động tại đây theo thời gian thực.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-hover" style={{ margin: 0 }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ width: 50, textAlign: 'center' }}>STT</th>
                  {viewMode !== 'day' && <th style={{ width: 95 }}>Ngày</th>}
                  <th style={{ width: 70 }}>Giờ gửi</th>
                  <th style={{ width: 95 }}>Ca trực</th>
                  <th style={{ width: 75 }}>Phòng</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Sỉ số</th>
                  <th style={{ minWidth: 150 }}>Giáo viên trực</th>
                  <th style={{ minWidth: 260 }}>
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>
                      <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }}></i>
                      Học sinh bất thường / Quậy phá / Sự cố
                    </span>
                  </th>
                  <th style={{ minWidth: 130 }}>Tình hình trật tự</th>
                  <th style={{ minWidth: 130 }}>Ghi chú / CSVC</th>
                  {(user?.is_admin || user?.is_superuser) && <th style={{ width: 50, textAlign: 'center' }}>Xóa</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, idx) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    {viewMode !== 'day' && (
                      <td style={{ fontWeight: 600, color: '#1e3a8a' }}>
                        {formatDateVN(r.ngay)}
                      </td>
                    )}
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
                    <td style={{ textAlign: 'center' }}>
                      {r.si_so ? (
                        <span style={{
                          background: '#f1f5f9',
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          display: 'inline-block'
                        }}>
                          {r.si_so}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                      {r.ho_ten_gv}
                    </td>
                    <td>
                      {r.hs_vi_pham ? (
                        <div style={{ background: '#fff1f2', border: '1.5px solid #fca5a5', padding: '8px 10px', borderRadius: 6 }}>
                          <div style={{ color: '#b91c1c', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fas fa-exclamation-triangle"></i> Vi phạm / Bất thường ({parseStudentViolations(r.hs_vi_pham, r).length} HS):
                            </span>
                            {r.created_at && (
                              <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '1px 7px', borderRadius: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                                <i className="far fa-clock" style={{ marginRight: 3 }}></i>Nộp lúc {formatTime(r.created_at)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {parseStudentViolations(r.hs_vi_pham, r).map((item, i) => (
                              <div key={i} style={{ fontSize: '0.84rem', color: '#991b1b', fontWeight: 600, background: '#fff', padding: '5px 8px', borderRadius: 4, border: '1px solid #fecaca' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                  {item.lop !== 'Chưa rõ lớp' && (
                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 3, fontSize: '0.74rem', fontWeight: 800 }}>
                                      Lớp {item.lop}
                                    </span>
                                  )}
                                  {item.thoi_gian_vi_pham && (
                                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 3, fontSize: '0.74rem', fontWeight: 700 }}>
                                      <i className="far fa-clock" style={{ marginRight: 2 }}></i>{item.thoi_gian_vi_pham}
                                    </span>
                                  )}
                                </div>
                                <div>{item.raw}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#16a34a', fontSize: '0.82rem', fontWeight: 500 }}>
                          <i className="fas fa-check-circle"></i> Bình thường, trật tự
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ color: '#334155', fontSize: '0.86rem' }}>
                        {r.tinh_hinh || 'Bình thường'}
                      </span>
                    </td>
                    <td>
                      {r.ghi_chu ? (
                        <span style={{ color: '#d97706', fontWeight: 600, fontSize: '0.85rem' }}>
                          <i className="fas fa-wrench" style={{ marginRight: 4 }}></i>
                          {r.ghi_chu}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
                    {(user?.is_admin || user?.is_superuser) && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-sm text-danger"
                          title="Xóa bản ghi báo cáo này"
                          onClick={() => handleDelete(r.id, r.ma_phong, r.ho_ten_gv, r.ca_truc)}
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

      {/* Modal Hướng dẫn Google Form */}
      {showGuide && (
        <div className="modal-overlay open" onClick={() => setShowGuide(false)}>
          <div className="modal-box modal-lg" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                <i className="fab fa-google" style={{ color: '#ea4335', marginRight: 8 }}></i>
                Hướng dẫn tích hợp Google Form tự động gửi về Web
              </h3>
              <button className="modal-close" onClick={() => setShowGuide(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ lineHeight: 1.6, color: '#334155', fontSize: '0.9rem' }}>
                <p>
                  <strong>Cách hoạt động:</strong> Giáo viên điền biểu mẫu Google Form trên điện thoại (Google gánh toàn bộ tải miễn phí). Ngay khi giáo viên bấm gửi, Google Apps Script sẽ tự động bắn dữ liệu về trang web của bạn ngay lập tức!
                </p>

                <h4 style={{ fontSize: '0.95rem', color: '#0284c7', marginTop: 16 }}>Bước 1: Cấu trúc Form chia 2 phần (Trực ăn & Trực ngủ)</h4>
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 10,
                  fontSize: '0.86rem',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <i className="fas fa-check-circle" style={{ color: '#16a34a' }}></i>
                  <span><strong>Đã hỗ trợ 100% Form 2 phần & Sheet 13 cột chuẩn:</strong> Hệ thống tự động nhận diện cả 2 nhánh (Trực ăn & Trực ngủ), tự động trích xuất Phòng ăn / Phòng ngủ, Họ tên GV, Sỉ số, Tình hình chung, HS vi phạm và Dấu thời gian.</span>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
                    • Câu hỏi đầu: <code>Ca trực</code> (Hộp chọn/Trắc nghiệm: <em>Trực ăn</em> / <em>Trực ngủ</em>)
                  </div>
                  <div style={{ paddingLeft: 12, borderLeft: '3px solid #0284c7', marginBottom: 8, marginTop: 6 }}>
                    <strong style={{ color: '#0369a1' }}>Phần 1 - Trực ăn:</strong>
                    <div style={{ fontSize: '0.84rem', color: '#334155', marginTop: 2 }}>
                      1. Họ và tên giáo viên &nbsp;|&nbsp; 2. Phòng ăn &nbsp;|&nbsp; 3. Tình hình chung &nbsp;|&nbsp; 4. Sỉ số &nbsp;|&nbsp; 5. Ghi chú/Góp ý
                    </div>
                  </div>
                  <div style={{ paddingLeft: 12, borderLeft: '3px solid #8b5cf6' }}>
                    <strong style={{ color: '#6d28d9' }}>Phần 2 - Trực ngủ:</strong>
                    <div style={{ fontSize: '0.84rem', color: '#334155', marginTop: 2 }}>
                      1. Họ và tên &nbsp;|&nbsp; 2. Phòng ngủ &nbsp;|&nbsp; 3. Sỉ số &nbsp;|&nbsp; 4. Tình hình chung &nbsp;|&nbsp; 5. Ghi nhận HS vi phạm nề nếp (Nếu có) &nbsp;|&nbsp; 6. Ghi chú/Góp ý
                    </div>
                  </div>
                </div>

                <h4 style={{ fontSize: '0.95rem', color: '#0284c7', marginTop: 16 }}>Bước 2: Dán mã Google Apps Script</h4>
                <p>
                  Trong giao diện sửa Google Form (hoặc Google Trang tính liên kết):
                  <br />• Nếu từ <strong>Google Form</strong>: Bấm dấu <strong>3 chấm dọc (Góc trên bên phải)</strong> ➔ Chọn <strong>Trình chỉnh sửa tập lệnh (Apps Script)</strong>.
                  <br />• Nếu từ <strong>Google Trang tính (Google Sheets)</strong>: Bấm menu <strong>Tiện ích mở rộng</strong> ➔ Chọn <strong>Apps Script</strong>.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Mã nguồn Apps Script (Dùng chung cho cả Form & Sheet):</span>
                  <button className="btn btn-sm btn-outline-primary" onClick={handleCopy}>
                    <i className={`fas ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i> {copySuccess ? 'Đã sao chép!' : 'Sao chép mã'}
                  </button>
                </div>
                <pre className="bctruc-guide-code">{sampleScript}</pre>

                <h4 style={{ fontSize: '0.95rem', color: '#0284c7', marginTop: 16 }}>Bước 3: Tạo Trình kích hoạt (Trigger)</h4>
                <p>
                  Ở cột bên trái của trang Apps Script, bấm vào biểu tượng <strong>Chiếc đồng hồ (Trình kích hoạt - Triggers)</strong>:
                  <br />• Bấm <strong>Thêm trình kích hoạt (Add Trigger)</strong> ở góc dưới bên phải.
                  <br />• <strong>Nếu dán trong Google Form:</strong> Chọn hàm <code>onFormSubmit</code>, Loại sự kiện: <em>Đang gửi biểu mẫu (On form submit)</em>.
                  <br />• <strong>Nếu dán trong Google Sheet:</strong> Chọn hàm <code>onSheetSubmit</code>, Loại sự kiện: <em>Khi gửi biểu mẫu (On form submit)</em>.
                  <br />• Bấm <strong>Lưu (Save)</strong> và cấp quyền Google là hoàn tất 100%!
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowGuide(false)}>Đã hiểu</button>
            </div>
          </div>
        </div>
      )}

      {/* Hộp thoại xác nhận xóa ConfirmDialog (Không bị trình duyệt chặn như window.confirm) */}
      <ConfirmDialog
        open={Boolean(confirmDel)}
        title={confirmDel?.title || 'Xác nhận xóa'}
        message={confirmDel?.message || ''}
        confirmText="Xác nhận xóa"
        cancelText="Hủy"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
