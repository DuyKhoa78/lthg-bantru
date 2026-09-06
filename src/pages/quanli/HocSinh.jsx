import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { removeAccents, getSortNames } from '../../utils/stringUtils';
import '../../styles/admin.css';

const EMPTY_FORM = { ho_ten: '', lop: '', gioi_tinh: '', ma_phong_an: '', ma_phong_ngu: '', dang_hoc: true, ghi_chu: '', ma_bt: '' };
const CSV_COLS   = ['STT', 'Mã BT', 'Họ tên', 'GT', 'Lớp', 'P.Ngủ', 'P.Ăn', 'Ghi chú'];

// Sắp xếp thứ tự tự nhiên các lớp (10A1 -> 10A2 -> ... -> 10A10 -> 11A1 -> 12A10)
function compareClasses(lopA, lopB) {
  const matchA = (lopA || '').trim().match(/^(\d+)(.*)$/);
  const matchB = (lopB || '').trim().match(/^(\d+)(.*)$/);
  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;
    return matchA[2].localeCompare(matchB[2], 'vi', { numeric: true, sensitivity: 'base' });
  }
  return (lopA || '').localeCompare(lopB || '', 'vi', { numeric: true });
}

// Sắp xếp thứ tự Alphabet tiếng Việt (Tên -> Họ -> Đệm)
function compareVietnameseNames(nameA, nameB) {
  const a = getSortNames(nameA);
  const b = getSortNames(nameB);
  let cmp = a.first.localeCompare(b.first, 'vi');
  if (cmp !== 0) return cmp;
  cmp = a.last.localeCompare(b.last, 'vi');
  if (cmp !== 0) return cmp;
  return a.middle.localeCompare(b.middle, 'vi');
}

export default function HocSinh() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  // ── Dữ liệu chính ──
  const [data, setData]       = useState([]);
  const [phongAn, setPhongAn] = useState([]);
  const [phongNgu, setPhongNgu] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [search, setSearch]       = useState('');
  const [filterLop, setFilterLop] = useState('');
  const [filterGT, setFilterGT]   = useState('');
  const [filterTT, setFilterTT]   = useState('');
  const [filterPhong, setFilterPhong] = useState('');

  const availableLops = useMemo(() => {
    return [...new Set(data.map(h => h.lop))].filter(Boolean).sort(compareClasses);
  }, [data]);

  // ── Phân trang ──
  const [currentPage, setCurrentPage] = useState(1);

  // ── Modal Thêm/Sửa ──
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Xác nhận xoá ──
  const [confirmDel, setConfirmDel] = useState(null); // { id, name }

  // ── Import CSV ──
  const [importOpen, setImportOpen]     = useState(false);
  const [csvFile, setCsvFile]           = useState(null);
  const [csvLines, setCsvLines]         = useState(null);   // string[] — raw lines
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver]         = useState(false);
  const csvInputRef = useRef();

  // ── Xuất PDF theo lớp ──
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelectedLop, setExportSelectedLop] = useState('');
  const [exportOnlyDangHoc, setExportOnlyDangHoc] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [cauhinh, setCauhinh] = useState({
    nam_hoc: '2026-2027',
    nguoi_phu_trach: 'Vũ Quốc Phong',
    ten_truong: 'LÊ THỊ HỒNG GẤM'
  });

  // ── Fetch ──
  const fetchData = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/api/hocsinh/'),
      api.get('/api/phong/'),
      api.get('/api/cauhinh/').catch(() => ({ data: { ok: false } })),
    ]).then(([hsRes, phRes, chRes]) => {
      if (hsRes.data?.ok) setData(hsRes.data.hocsinh);
      if (phRes.data?.ok) {
        setPhongAn(phRes.data.phong.filter(p => p.loai_phong === 0));
        setPhongNgu(phRes.data.phong.filter(p => p.loai_phong === 1));
      }
      if (chRes.data?.ok && chRes.data.he_thong) {
        setCauhinh(chRes.data.he_thong);
      }
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.all([
      api.get('/api/hocsinh/'),
      api.get('/api/phong/'),
      api.get('/api/cauhinh/').catch(() => ({ data: { ok: false } })),
    ]).then(([hsRes, phRes, chRes]) => {
      if (hsRes.data?.ok) setData(hsRes.data.hocsinh);
      if (phRes.data?.ok) {
        setPhongAn(phRes.data.phong.filter(p => p.loai_phong === 0));
        setPhongNgu(phRes.data.phong.filter(p => p.loai_phong === 1));
      }
      if (chRes.data?.ok && chRes.data.he_thong) {
        setCauhinh(chRes.data.he_thong);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Filter / Stats ──
  const filteredAndSorted = useMemo(() => {
    let result = data.filter((hs) => {
      if (search) {
        const searchStr = removeAccents(search.toLowerCase());
        const nameStr = removeAccents(hs.ho_ten.toLowerCase());
        const maStr = String(hs.id || '');
        if (!nameStr.includes(searchStr) && !maStr.includes(searchStr)) return false;
      }
      if (filterLop && hs.lop !== filterLop) return false;
      if (filterGT !== '' && String(hs.gioi_tinh) !== filterGT) return false;
      if (filterTT !== '' && String(Number(hs.dang_hoc)) !== filterTT) return false;
      if (filterPhong && hs.phong_an?.ma_phong !== filterPhong && hs.phong_ngu?.ma_phong !== filterPhong && hs.ma_phong_an_id !== filterPhong && hs.ma_phong_ngu_id !== filterPhong) return false;
      return true;
    });

    result.sort((a, b) => {
      let cmp = compareClasses(a.lop, b.lop);
      if (cmp !== 0) return cmp;
      return compareVietnameseNames(a.ho_ten, b.ho_ten);
    });

    return result;
  }, [data, search, filterLop, filterGT, filterTT, filterPhong]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [search, filterLop, filterGT, filterTT, filterPhong]);

  // Pagination logic
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const paginatedData = useMemo(() => {
    return filteredAndSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  }, [filteredAndSorted, currentPage]);

  const stats = {
    total:    data.length,
    nam:      data.filter(h => h.gioi_tinh === 0).length,
    nu:       data.filter(h => h.gioi_tinh === 1).length,
    danghoc:  data.filter(h => h.dang_hoc).length,
  };

  // ── CRUD ──
  const openAdd  = () => { setForm(EMPTY_FORM); setModal('add'); };
  const openEdit = (hs) => {
    setForm({ ...hs, ma_phong_an: hs.ma_phong_an_id || '', ma_phong_ngu: hs.ma_phong_ngu_id || '' });
    setModal({ edit: hs });
  };

  const handleDelete = async (id, name) => {
    setConfirmDel({ id, name });
  };
  const doDelete = async () => {
    const id = confirmDel.id;
    setConfirmDel(null);
    try {
      await api.post(`/api/hocsinh/${id}/delete/`);
      setData(p => p.filter(h => h.id !== id));
    } catch (err) { showAlert(err.response?.data?.error || 'Xóa thất bại'); }
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim() || !form.lop || form.gioi_tinh === '') return showAlert('Vui lòng điền đầy đủ thông tin!', 'warning');
    setSaving(true);
    try {
      await api.post('/api/hocsinh/save/', {
        id: modal === 'add' ? undefined : modal.edit.id,
        ho_ten: form.ho_ten, lop: form.lop,
        gioi_tinh: Number(form.gioi_tinh),
        ma_phong_an: form.ma_phong_an || null,
        ma_phong_ngu: form.ma_phong_ngu || null,
        dang_hoc: form.dang_hoc, ghi_chu: form.ghi_chu,
      });
      setModal(null); fetchData(true);
    } catch (err) { showAlert(err.response?.data?.error || 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  // ── Import CSV helpers ──
  const openImport = () => {
    setCsvFile(null); setCsvLines(null); setImportResult(null); setDragOver(false);
    if (csvInputRef.current) csvInputRef.current.value = '';
    setImportOpen(true);
  };

  const readCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trimEnd()).filter(Boolean);
      setCsvLines(lines);
      setImportResult(null);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const pickFile = (file) => {
    if (!file) return;
    setCsvFile(file);
    readCSV(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const handleDoImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', csvFile);
    try {
      const res = await api.post('/api/hocsinh/import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      // Cập nhật bảng ngầm ngay lập tức, không đóng modal
      if (res.data?.success > 0) fetchData(true);
    } catch (err) {
      setImportResult({ ok: false, error: err.response?.data?.error || 'Lỗi không xác định' });
    } finally { setImporting(false); }
  };


  // Tải file mẫu CSV chuẩn cho Học sinh (bỏ phòng mặc định để trống)
  const handleDownloadTemplate = () => {
    const header = 'STT,Mã BT,Họ tên,GT,Lớp,P.Ngủ,P.Ăn,Ghi chú\n';
    const sample = '1,1001,Nguyễn Văn An,Nam,10A1,,,\n2,1002,Trần Thị Mai,Nữ,10A1,,,\n3,1003,Lê Hoàng Nam,Nam,10A2,,,\n';
    const blob = new Blob(['\uFEFF' + header + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mau_Danh_Sach_Hoc_Sinh_Ban_Tru.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Kiểm tra nếu người dùng chọn nhầm file Giáo viên
  const isTeacherFile = useMemo(() => {
    if (!csvLines || csvLines.length === 0) return false;
    const header = csvLines[0].toLowerCase();
    return header.includes('mã bảo mật') || header.includes('số điện thoại') || header.includes('gv');
  }, [csvLines]);

  // Build preview info
  const hasHeader  = csvLines ? isNaN(csvLines[0]?.split(',')[0]?.trim()) : false;

  // ── Xử lý Xuất PDF danh sách theo lớp ──
  const openExportPdfModal = (lop = '') => {
    setExportSelectedLop(lop || filterLop || '');
    setExportModalOpen(true);
  };

  const getBasePrintCss = () => `
    @page {
      size: A4 portrait;
      margin: 8mm 12mm 8mm 15mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 10.5pt;
      color: #000;
      background: #fff;
      line-height: 1.2;
    }
    .page-container {
      width: 100%;
      margin: 0 auto;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
    }
    .hdr {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
    }
    .hdr-left {
      text-align: center;
      width: 48%;
    }
    .hdr-left .hdr-line1 {
      font-size: 8.5pt;
    }
    .hdr-left .hdr-line2 {
      font-size: 9pt;
      font-weight: bold;
    }
    .hdr-left .hdr-line3 {
      font-size: 8.5pt;
      font-style: italic;
      text-decoration: underline;
    }
    .hdr-right {
      text-align: center;
      width: 50%;
    }
    .hdr-right .hdr-line1 {
      font-size: 9pt;
      font-weight: bold;
    }
    .hdr-right .hdr-line2 {
      font-size: 9pt;
      font-weight: bold;
    }
    .hdr-divider {
      width: 130px;
      height: 1px;
      background: #000;
      margin: 2px auto 0;
    }
    .title-wrap {
      text-align: center;
      margin: 6px 0 8px;
    }
    .main-title {
      font-size: 14pt;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .sub-class {
      font-size: 12.5pt;
      font-weight: bold;
      color: #1e3a8a;
      margin-top: 1px;
    }
    .sub-year {
      font-size: 9.5pt;
      font-style: italic;
      color: #444;
    }
    .data-table-print {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000;
      margin-bottom: 5px;
    }
    .data-table-print th, .data-table-print td {
      border: 1px solid #000;
      padding: 3px 5px;
      vertical-align: middle;
    }
    .data-table-print th {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: center;
      font-size: 9.5pt;
    }
    .tc { text-align: center; }
    .tl { text-align: left; }
    .tr { text-align: right; }
    .font-bold { font-weight: bold; }
    .name-col { padding-left: 8px; font-weight: 600; }
    .room-col { font-size: 9.5pt; }
    .note-col { font-size: 9pt; }
    .summary-line {
      font-size: 9.5pt;
      margin-bottom: 8px;
    }
    .sig-wrap {
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
      margin-top: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-col {
      min-width: 220px;
      text-align: center;
    }
    .sig-date {
      font-style: italic;
      font-size: 9.5pt;
      margin-bottom: 2px;
    }
    .sig-role {
      font-weight: bold;
      font-size: 10.5pt;
    }
    .sig-hint {
      font-style: italic;
      font-size: 9pt;
    }
    .sig-space {
      height: 55px;
    }
    .sig-name {
      font-weight: bold;
      font-size: 10.5pt;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; break-before: page; }
      .sig-wrap { page-break-inside: avoid; break-inside: avoid; }
      .data-table-print th { background-color: #f2f2f2 !important; }
    }
  `;

  const generateClassHtml = (lop, students, namHoc, nguoiPhuTrach, todayStr, isPageBreak = false) => {
    const namCount = students.filter(s => s.gioi_tinh === 0).length;
    const nuCount = students.filter(s => s.gioi_tinh === 1).length;

    const rowsHtml = students.map((s, idx) => `
      <tr>
        <td class="tc">${idx + 1}</td>
        <td class="tc font-bold">${s.id}</td>
        <td class="tl name-col">${s.ho_ten}</td>
        <td class="tc font-bold room-col">${s.ma_phong_an_id || s.phong_an?.ma_phong || '-'}</td>
        <td class="tc font-bold room-col">${s.ma_phong_ngu_id || s.phong_ngu?.ma_phong || '-'}</td>
        <td class="tl note-col">${s.ghi_chu || ''}</td>
      </tr>
    `).join('');

    return `
    <div class="page-container ${isPageBreak ? 'page-break' : ''}">
      <div class="hdr">
        <div class="hdr-left">
          <div class="hdr-line1">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
          <div class="hdr-line2">TRUNG TÂM GD KT TH VÀ HN LÊ THỊ HỒNG GẤM</div>
          <div class="hdr-line3">Bộ phận Quản lý Bán trú</div>
        </div>
        <div class="hdr-right">
          <div class="hdr-line1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="hdr-line2">Độc lập – Tự do – Hạnh phúc</div>
          <div class="hdr-divider"></div>
        </div>
      </div>

      <div class="title-wrap">
        <h1 class="main-title">DANH SÁCH HỌC SINH BÁN TRÚ</h1>
        <div class="sub-class">LỚP: ${lop}</div>
        <div class="sub-year">Năm học: ${namHoc}</div>
      </div>

      <table class="data-table-print">
        <thead>
          <tr>
            <th style="width: 42px;">STT</th>
            <th style="width: 65px;">Mã BT</th>
            <th style="width: 240px;">Họ và tên</th>
            <th style="width: 65px;">PA</th>
            <th style="width: 65px;">PN</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="6" class="tc" style="padding: 12px; font-style: italic; color: #666;">Chưa có học sinh trong danh sách này</td></tr>'}
        </tbody>
      </table>

      <div class="summary-line">
        * Tổng cộng: <strong>${students.length}</strong> học sinh (Nam: <strong>${namCount}</strong>, Nữ: <strong>${nuCount}</strong>).
        <span style="font-style: italic; color: #333; margin-left: 15px;">(PA: Phòng Ăn, PN: Phòng Ngủ)</span>
      </div>

      <div class="sig-wrap">
        <div class="sig-col">
          <div class="sig-date">${todayStr}</div>
          <div class="sig-role">GIÁM ĐỐC</div>
          <div class="sig-hint">(Ký và ghi rõ họ tên)</div>
          <div class="sig-space"></div>
          <div class="sig-name">${nguoiPhuTrach}</div>
        </div>
      </div>
    </div>
    `;
  };

  const handlePrintPdf = (targetLop) => {
    const d = new Date();
    const todayStr = `TP. Hồ Chí Minh, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    const namHoc = cauhinh?.nam_hoc || '2026-2027';
    const nguoiPhuTrach = cauhinh?.nguoi_phu_trach || 'Vũ Quốc Phong';

    const classesToExport = targetLop ? [targetLop] : availableLops;
    if (classesToExport.length === 0) {
      showAlert('Không có lớp nào để xuất!', 'warning');
      return;
    }

    const pagesHtml = classesToExport.map((lop, idx) => {
      let students = data.filter(s => s.lop === lop);
      if (exportOnlyDangHoc) {
        students = students.filter(s => s.dang_hoc);
      }
      students.sort((a, b) => compareVietnameseNames(a.ho_ten, b.ho_ten));
      return generateClassHtml(lop, students, namHoc, nguoiPhuTrach, todayStr, idx > 0);
    }).join('\n');

    const title = targetLop ? `Danh sách HS lớp ${targetLop}` : 'Tổng hợp danh sách học sinh bán trú tất cả các lớp';
    const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${getBasePrintCss()}</style>
</head>
<body>
  ${pagesHtml}
  <script>window.onload = function() { setTimeout(window.print, 400); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showAlert('Trình duyệt đang chặn mở cửa sổ mới! Vui lòng cho phép popup để xem và in PDF.', 'warning');
      return;
    }
    w.document.write(fullHtml);
    w.document.close();
  };

  const handleDownloadPdf = async (targetLop) => {
    setExportingPdf(true);
    setDownloadProgress('Đang chuẩn bị dữ liệu...');
    let container = null;
    try {
      const d = new Date();
      const todayStr = `TP. Hồ Chí Minh, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
      const namHoc = cauhinh?.nam_hoc || '2026-2027';
      const nguoiPhuTrach = cauhinh?.nguoi_phu_trach || 'Vũ Quốc Phong';

      const classesToExport = targetLop ? [targetLop] : availableLops;
      if (classesToExport.length === 0) {
        showAlert('Không có lớp nào để xuất!', 'warning');
        return;
      }

      // Tạo container render chuẩn hiển thị ngầm, tránh toạ độ âm -9999px gây lỗi html2canvas
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '0';
      container.style.top = '0';
      container.style.width = '794px'; // Chuẩn A4 96dpi (210mm)
      container.style.minHeight = '1123px'; // Chuẩn A4 96dpi (297mm)
      container.style.background = '#ffffff';
      container.style.zIndex = '-9999';
      container.style.pointerEvents = 'none';
      container.style.boxSizing = 'border-box';
      container.style.padding = '8mm 12mm 8mm 15mm';
      document.body.appendChild(container);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfFileName = targetLop 
        ? `Danh_Sach_HS_${targetLop.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
        : `Danh_Sach_HS_Tat_Ca_${classesToExport.length}_Lop.pdf`;

      const baseCss = getBasePrintCss();

      // Kết xuất tuần tự từng trang/lớp một để đảm bảo canvas siêu nhẹ, không bị tràn bộ nhớ hay trắng trang
      for (let i = 0; i < classesToExport.length; i++) {
        const lop = classesToExport[i];
        setDownloadProgress(`Đang tạo lớp ${lop} (${i + 1}/${classesToExport.length})...`);

        let students = data.filter(s => s.lop === lop);
        if (exportOnlyDangHoc) {
          students = students.filter(s => s.dang_hoc);
        }
        students.sort((a, b) => compareVietnameseNames(a.ho_ten, b.ho_ten));

        const classHtml = generateClassHtml(lop, students, namHoc, nguoiPhuTrach, todayStr, false);
        container.innerHTML = `<style>${baseCss}</style>${classHtml}`;

        // Đợi DOM render font chữ đầy đủ
        await new Promise(r => setTimeout(r, 60));

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1024,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }

      setDownloadProgress('Đang tải file về máy...');
      pdf.save(pdfFileName);
      showAlert(`Đã tạo và tải file "${pdfFileName}" thành công!`, 'success');
    } catch (err) {
      console.error('Lỗi xuất PDF:', err);
      showAlert('Lỗi kết xuất PDF trực tiếp. Bạn có thể sử dụng nút "In / Lưu file PDF" để lưu PDF chuẩn sắc nét!', 'warning');
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      setExportingPdf(false);
      setDownloadProgress('');
    }
  };

  const previewStudents = useMemo(() => {
    let list = exportSelectedLop ? data.filter(s => s.lop === exportSelectedLop) : data;
    if (exportOnlyDangHoc) {
      list = list.filter(s => s.dang_hoc);
    }
    return [...list].sort((a, b) => {
      const cmpClass = compareClasses(a.lop, b.lop);
      if (cmpClass !== 0) return cmpClass;
      return compareVietnameseNames(a.ho_ten, b.ho_ten);
    });
  }, [data, exportSelectedLop, exportOnlyDangHoc]);

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Quản lý học sinh</span>
          </div>
          <h2><i className="fas fa-user-graduate" style={{ color: 'var(--primary)' }}></i> Quản lý Học sinh</h2>
          <p>Thêm, sửa, xóa học sinh và phân bổ phòng ăn / phòng ngủ.</p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => openExportPdfModal()}
            style={{ fontWeight: 700, borderColor: '#fca5a5', color: '#dc2626', background: '#fff' }}
            title="Xuất file PDF danh sách học sinh theo từng lớp hoặc tất cả các lớp"
          >
            <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i> Xuất PDF theo lớp
          </button>
          {(user?.is_admin || user?.is_superuser) ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={openImport}><i className="fas fa-file-csv"></i> Import CSV</button>
              <button className="btn btn-primary" onClick={openAdd}><i className="fas fa-plus"></i> Thêm học sinh</button>
            </>
          ) : (
            <span className="badge badge-warning" style={{ padding: '8px 14px' }}><i className="fas fa-eye"></i> Chế độ xem</span>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-cards-row">
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-users"></i></div><div className="stat-card-info"><p>Tổng học sinh</p><h3>{stats.total}</h3></div></div>
        <div className="stat-card blue"><div className="stat-card-icon"><i className="fas fa-mars"></i></div><div className="stat-card-info"><p>Nam</p><h3>{stats.nam}</h3></div></div>
        <div className="stat-card purple"><div className="stat-card-icon"><i className="fas fa-venus"></i></div><div className="stat-card-info"><p>Nữ</p><h3>{stats.nu}</h3></div></div>
        <div className="stat-card green"><div className="stat-card-icon"><i className="fas fa-check-circle"></i></div><div className="stat-card-info"><p>Đang học</p><h3>{stats.danghoc}</h3></div></div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <label><i className="fas fa-filter"></i></label>
        <select value={filterLop} onChange={(e) => setFilterLop(e.target.value)}>
          <option value="">Tất cả lớp</option>
          {availableLops.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {filterLop && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => openExportPdfModal(filterLop)}
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600, padding: '0 10px', height: 36, whiteSpace: 'nowrap' }}
            title={`Xuất file PDF danh sách học sinh lớp ${filterLop}`}
          >
            <i className="fas fa-file-pdf" style={{ marginRight: 4 }}></i> In PDF lớp {filterLop}
          </button>
        )}
        <select value={filterGT} onChange={(e) => setFilterGT(e.target.value)}>
          <option value="">Tất cả giới tính</option><option value="0">Nam</option><option value="1">Nữ</option>
        </select>
        <select value={filterTT} onChange={(e) => setFilterTT(e.target.value)}>
          <option value="">Tất cả trạng thái</option><option value="1">Đang học</option><option value="0">Rút bán trú</option>
        </select>
        <select value={filterPhong} onChange={(e) => setFilterPhong(e.target.value)}>
          <option value="">Tất cả phòng</option>
          <optgroup label="Phòng Ăn">
            {phongAn.map(p => <option key={`an-${p.ma_phong}`} value={p.ma_phong}>{p.ma_phong}</option>)}
          </optgroup>
          <optgroup label="Phòng Ngủ">
            {phongNgu.map(p => <option key={`ngu-${p.ma_phong}`} value={p.ma_phong}>{p.ma_phong}</option>)}
          </optgroup>
        </select>
        <input type="text" placeholder="Tìm tên/mã học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* ── Bảng dữ liệu ── */}
      <div className="datatable-wrapper">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>
              <th>#</th><th>Mã BT</th><th>Họ tên</th><th>GT</th><th>Lớp</th><th>Phòng ăn</th><th>Phòng ngủ</th><th>Trạng thái</th>
              {(user?.is_admin || user?.is_superuser) && <th>Thao tác</th>}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}><i className="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>
              ) : paginatedData.map((hs, i) => (
                <tr key={hs.id}>
                  <td>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td style={{ color: '#1e40af' }}><b>{hs.id}</b></td>
                  <td><b>{hs.ho_ten}</b>{hs.ghi_chu && <><br /><small style={{ color: '#94a3b8' }}>{hs.ghi_chu}</small></>}</td>
                  <td><span className={`badge ${hs.gioi_tinh === 0 ? 'badge-info' : 'badge-warning'}`}>{hs.gioi_tinh === 0 ? 'Nam' : 'Nữ'}</span></td>
                  <td><b>{hs.lop}</b></td>
                  <td>{hs.phong_an?.ma_phong || hs.ma_phong_an_id || '—'}</td>
                  <td>{hs.phong_ngu?.ma_phong || hs.ma_phong_ngu_id || '—'}</td>
                  <td>{hs.dang_hoc ? <span className="badge badge-success">Đang học</span> : <span className="badge badge-danger">Rút BT</span>}</td>
                  {(user?.is_admin || user?.is_superuser) && (
                    <td><div className="action-btns">
                      <button className="btn-icon edit" onClick={() => openEdit(hs)}><i className="fas fa-edit"></i></button>
                      <button className="btn-icon delete" onClick={() => handleDelete(hs.id, hs.ho_ten)}><i className="fas fa-trash"></i></button>
                    </div></td>
                  )}
                </tr>
              ))}
              {!loading && paginatedData.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button className="btn btn-sm btn-ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><i className="fas fa-chevron-left"></i> Trang trước</button>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Trang {currentPage} / {totalPages}</span>
            <button className="btn btn-sm btn-ghost" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Trang sau <i className="fas fa-chevron-right"></i></button>
          </div>
        )}
      </div>

      {/* ── Modal Thêm / Sửa học sinh ── */}
      {modal && (
        <div className="modal-overlay open">
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-user-graduate"></i> {modal === 'add' ? 'Thêm học sinh' : 'Sửa học sinh'}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ flex: '0 0 120px' }}>
                  <label className="form-label">Mã BT</label>
                  <input className="form-control" value={modal === 'add' ? 'Tự động' : form.id} disabled style={{ background: '#f1f5f9', fontWeight: 'bold', color: '#1e40af' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Họ và tên <span className="required">*</span></label>
                  <input className="form-control" value={form.ho_ten} onChange={(e) => setForm({ ...form, ho_ten: e.target.value })} placeholder="Nguyễn Văn An" />
                </div>
                <div className="form-group">
                  <label className="form-label">Lớp <span className="required">*</span></label>
                  <input className="form-control" value={form.lop} onChange={(e) => setForm({ ...form, lop: e.target.value })} placeholder="VD: 10A1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Giới tính <span className="required">*</span></label>
                  <select className="form-control" value={form.gioi_tinh} onChange={(e) => setForm({ ...form, gioi_tinh: Number(e.target.value) })}>
                    <option value="">-- Chọn --</option><option value="0">Nam</option><option value="1">Nữ</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <div className="toggle-wrapper">
                    <label className="toggle"><input type="checkbox" checked={form.dang_hoc} onChange={(e) => setForm({ ...form, dang_hoc: e.target.checked })} /><span className="toggle-slider"></span></label>
                    <span className="toggle-label">Đang học</span>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phòng ăn</label>
                  <select className="form-control" value={form.ma_phong_an} onChange={(e) => setForm({ ...form, ma_phong_an: e.target.value })}>
                    <option value="">-- Chọn phòng ăn --</option>
                    {phongAn.map(p => <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Phòng ngủ</label>
                  <select className="form-control" value={form.ma_phong_ngu} onChange={(e) => setForm({ ...form, ma_phong_ngu: e.target.value })}>
                    <option value="">-- Chọn phòng ngủ --</option>
                    {phongNgu.filter(p => form.gioi_tinh === '' || p.gioi_tinh === Number(form.gioi_tinh)).map(p => (
                      <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong} ({p.gioi_tinh === 0 ? 'Nam' : 'Nữ'})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <input className="form-control" value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Import CSV ── */}
      {importOpen && (
        <div className="modal-overlay open">
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <div className="modal-title"><i className="fas fa-file-csv" style={{ color: '#16a34a' }}></i> Import danh sách học sinh từ CSV</div>
              <button className="modal-close" onClick={() => setImportOpen(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">

              {/* Drag & Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => csvInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#16a34a' : '#cbd5e1'}`,
                  borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? '#f0fdf4' : '#f8fafc',
                  transition: 'all .2s', marginBottom: 14,
                }}
              >
                <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) pickFile(e.target.files[0]); }} />
                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: dragOver ? '#16a34a' : '#94a3b8', marginBottom: 8, display: 'block' }}></i>
                {csvFile
                  ? <><b style={{ color: '#16a34a' }}><i className="fas fa-check-circle"></i> {csvFile.name}</b><br /><small style={{ color: '#64748b' }}>Click để chọn file khác</small></>
                  : <><b style={{ color: '#475569' }}>Kéo thả file CSV vào đây</b><br /><small style={{ color: '#94a3b8' }}>hoặc click để chọn file (.csv)</small></>
                }
              </div>

              {/* Gợi ý định dạng & Nút tải file mẫu */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569' }}>
                  <i className="fas fa-info-circle" style={{ color: 'var(--primary)', marginRight: 4 }}></i>
                  Cột chuẩn: <code>{CSV_COLS.join(' , ')}</code>
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleDownloadTemplate}
                  style={{ fontSize: '.78rem', padding: '3px 10px', borderRadius: 6 }}
                  title="Tải file CSV mẫu chuẩn về máy để điền thông tin"
                >
                  <i className="fas fa-download" style={{ marginRight: 4 }}></i> Tải file mẫu CSV
                </button>
              </div>
              <div style={{ fontSize: '.76rem', color: '#64748b', marginBottom: 10 }}>
                💡 Cột <b>P.Ngủ</b>, <b>P.Ăn</b>, <b>Ghi chú</b> là tùy chọn (có thể để trống, xếp phòng sau).
              </div>

              {isTeacherFile && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', fontSize: '.82rem', marginBottom: 12, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <i className="fas fa-exclamation-triangle"></i> Bạn đang chọn nhầm file "Danh sách Giáo viên"!
                  </div>
                  File này chứa các cột <i>(Mã bảo mật Form, Số điện thoại...)</i> của Giáo viên. Vui lòng chọn đúng file <b>Học sinh</b> hoặc bấm <b>"Tải file mẫu CSV"</b> ở trên để điền danh sách học sinh.
                </div>
              )}

              {/* Preview table */}
              {csvLines && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: '#475569', marginBottom: 4 }}>
                    <i className="fas fa-table"></i> Xem trước ({csvLines.length} dòng)
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
                      <thead>
                        <tr style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                          {!hasHeader && CSV_COLS.map(c => (
                            <th key={c} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c}</th>
                          ))}
                          {hasHeader && csvLines[0].split(',').map((c, i) => (
                            <th key={i} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c.trim()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvLines.slice(hasHeader ? 1 : 0).map((line, idx) => (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            {line.split(',').map((cell, ci) => (
                              <td key={ci} style={{ padding: '3px 8px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', color: '#334155' }}>
                                {cell.trim()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Kết quả import */}
              {importResult && (() => {
                const d    = importResult;
                const errs = d.errors || [];
                const dups = errs.filter(e => e.msg?.includes('đã tồn tại'));
                const real = errs.filter(e => !e.msg?.includes('đã tồn tại'));
                const hasWarn  = dups.length > 0 || real.length > 0;
                const isAllBad = d.success === 0 && real.length > 0;
                const bg   = !d.ok ? '#fef2f2' : isAllBad ? '#fef2f2' : hasWarn ? '#fffbeb' : '#f0fdf4';
                const bd   = !d.ok ? '#fca5a5' : isAllBad ? '#fca5a5' : hasWarn ? '#fcd34d' : '#86efac';
                const icon = !d.ok || isAllBad ? 'times-circle' : hasWarn ? 'exclamation-triangle' : 'check-circle';
                const ic   = !d.ok || isAllBad ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a';
                return (
                  <div style={{ padding: '12px 14px', borderRadius: 8, background: bg, border: `1px solid ${bd}`, marginTop: 4 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      <i className={`fas fa-${icon}`} style={{ color: ic, marginRight: 6 }}></i>Kết quả import
                    </div>
                    {d.ok ? (
                      <>
                        <div>✅ Thành công: <b>{d.success}</b> học sinh được thêm</div>
                        {dups.length > 0 && <>
                          <div style={{ marginTop: 8, color: '#92400e', fontWeight: 600 }}>⚠️ Bỏ qua {dups.length} học sinh có mã BT đã tồn tại:</div>
                          <ul style={{ maxHeight: 110, overflowY: 'auto', margin: '4px 0', paddingLeft: 18, fontSize: '.77rem', color: '#92400e' }}>
                            {dups.map((e, i) => <li key={i}>Dòng {e.row}: {e.msg}</li>)}
                          </ul>
                        </>}
                        {real.length > 0 && <>
                          <div style={{ marginTop: 8, color: '#991b1b', fontWeight: 600 }}>❌ {real.length} dòng bị lỗi (không thêm được):</div>
                          <ul style={{ maxHeight: 110, overflowY: 'auto', margin: '4px 0', paddingLeft: 18, fontSize: '.77rem', color: '#991b1b' }}>
                            {real.map((e, i) => <li key={i}>Dòng {e.row}: {e.msg}</li>)}
                          </ul>
                        </>}
                      </>
                    ) : (
                      <div style={{ color: '#dc2626' }}>❌ {d.error || 'Lỗi không xác định'}</div>
                    )}
                  </div>
                );
              })()}
            </div>


            <div className="modal-footer" style={{ justifyContent: importResult ? 'center' : 'flex-end' }}>
              {importResult ? (
                /* Sau khi có kết quả: chỉ hiện nút xác nhận nổi bật */
                <button
                  className="btn btn-primary"
                  style={{ minWidth: 160, fontSize: '1rem', padding: '10px 28px' }}
                  onClick={() => setImportOpen(false)}
                >
                  <i className="fas fa-check-circle"></i> Đã hiểu — Đóng
                </button>
              ) : (
                /* Chưa import: nút Đóng + nút Import */
                <>
                  <button className="btn btn-ghost" onClick={() => setImportOpen(false)}>Đóng</button>
                  <button
                    className="btn btn-success"
                    onClick={handleDoImport}
                    disabled={!csvFile || importing || isTeacherFile}
                  >
                    <i className={`fas ${importing ? 'fa-spinner fa-spin' : 'fa-file-import'}`}></i>
                    {importing ? ' Đang import...' : ' Bắt đầu Import'}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Modal Xuất file PDF danh sách học sinh theo lớp ── */}
      {exportModalOpen && (
        <div className="modal-overlay open">
          <div className="modal-box modal-lg" style={{ maxWidth: 850 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i>
                <span>Xuất file PDF danh sách học sinh theo lớp</span>
              </div>
              <button className="modal-close" onClick={() => setExportModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Cấu hình chọn lớp & trạng thái */}
              <div className="form-row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div className="form-group" style={{ flex: '1 1 300px' }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    <i className="fas fa-chalkboard" style={{ color: 'var(--primary)', marginRight: 6 }}></i>
                    Chọn lớp muốn xuất PDF:
                  </label>
                  <select
                    className="form-control"
                    value={exportSelectedLop}
                    onChange={(e) => setExportSelectedLop(e.target.value)}
                    style={{ fontWeight: 600, fontSize: '.95rem' }}
                  >
                    <option value="">-- Tất cả các lớp (Gộp {availableLops.length} lớp, mỗi lớp 1 trang) --</option>
                    {availableLops.map(l => {
                      const c = data.filter(s => s.lop === l && (!exportOnlyDangHoc || s.dang_hoc)).length;
                      return <option key={l} value={l}>Lớp {l} ({c} học sinh)</option>;
                    })}
                  </select>
                  <small style={{ color: '#64748b', marginTop: 4, display: 'block' }}>
                    💡 Chọn một lớp cụ thể để xuất danh sách lớp đó, hoặc chọn tất cả để xuất toàn bộ các lớp.
                  </small>
                </div>

                <div className="form-group" style={{ flex: '1 1 240px' }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    <i className="fas fa-filter" style={{ color: '#16a34a', marginRight: 6 }}></i>
                    Lọc trạng thái học sinh:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.88rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={exportOnlyDangHoc}
                        onChange={(e) => setExportOnlyDangHoc(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#16a34a' }}
                      />
                      <span>Chỉ bao gồm học sinh đang học <span className="badge badge-success" style={{ marginLeft: 4 }}>Khuyên dùng</span></span>
                    </label>
                    <small style={{ color: '#64748b' }}>
                      Bỏ tích để bao gồm cả các học sinh đã rút bán trú.
                    </small>
                  </div>
                </div>
              </div>

              {/* Thông tin hành chính văn bản */}
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 14, fontSize: '.84rem', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <span style={{ color: '#64748b' }}>Đơn vị: </span>
                  <b>{cauhinh?.ten_truong || 'THPT LÊ THỊ HỒNG GẤM'}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Năm học: </span>
                  <b style={{ color: '#1e40af' }}>{cauhinh?.nam_hoc || '2026-2027'}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Ký duyệt: </span>
                  <b>GIÁM ĐỐC - {cauhinh?.nguoi_phu_trach || 'Vũ Quốc Phong'}</b>
                </div>
              </div>

              {/* Thống kê tóm tắt */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '.76rem', color: '#1e40af', fontWeight: 600 }}>Đối tượng xuất</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a', marginTop: 2 }}>
                    {exportSelectedLop ? `Lớp ${exportSelectedLop}` : `${availableLops.length} lớp`}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '.76rem', color: '#166534', fontWeight: 600 }}>Tổng số HS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#15803d', marginTop: 2 }}>
                    {previewStudents.length}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '.76rem', color: '#1e40af', fontWeight: 600 }}>Học sinh Nam</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                    {previewStudents.filter(s => s.gioi_tinh === 0).length}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '.76rem', color: '#7e22ce', fontWeight: 600 }}>Học sinh Nữ</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#9333ea', marginTop: 2 }}>
                    {previewStudents.filter(s => s.gioi_tinh === 1).length}
                  </div>
                </div>
              </div>

              {/* Bảng xem trước danh sách */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '.84rem', color: '#334155' }}>
                    <i className="fas fa-list-ol" style={{ color: 'var(--primary)', marginRight: 5 }}></i>
                    Xem trước danh sách ({previewStudents.length} học sinh)
                  </span>
                  <span style={{ fontSize: '.76rem', color: '#64748b' }}>
                    Sắp xếp theo thứ tự Alphabet (Tên ➔ Họ ➔ Đệm)
                  </span>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 45 }}>STT</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 65 }}>Mã BT</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>Họ và tên</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 55 }}>GT</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 65 }}>Lớp</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 60 }}>PA</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', width: 60 }}>PN</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewStudents.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                            Không có học sinh nào phù hợp tiêu chí chọn.
                          </td>
                        </tr>
                      ) : (
                        previewStudents.slice(0, 100).map((hs, i) => (
                          <tr key={hs.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{i + 1}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>{hs.id}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{hs.ho_ten}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                              <span className={`badge ${hs.gioi_tinh === 0 ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '.7rem', padding: '1px 6px' }}>
                                {hs.gioi_tinh === 0 ? 'Nam' : 'Nữ'}
                              </span>
                            </td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>{hs.lop}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{hs.ma_phong_an_id || hs.phong_an?.ma_phong || '—'}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{hs.ma_phong_ngu_id || hs.phong_ngu?.ma_phong || '—'}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', color: '#64748b' }}>{hs.ghi_chu || ''}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {previewStudents.length > 100 && (
                  <div style={{ textAlign: 'center', fontSize: '.75rem', color: '#64748b', marginTop: 4 }}>
                    (Đang hiển thị trước 100/{previewStudents.length} học sinh. Toàn bộ danh sách sẽ được đưa vào bản xuất PDF)
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setExportModalOpen(false)}>
                Đóng
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-danger"
                  onClick={() => handlePrintPdf(exportSelectedLop)}
                  disabled={previewStudents.length === 0}
                  title="Mở giao diện in chuẩn văn bản khổ A4 (Times New Roman, có thể chọn 'Lưu dưới dạng PDF' hoặc in trực tiếp)"
                >
                  <i className="fas fa-print"></i> In / Lưu file PDF
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => handleDownloadPdf(exportSelectedLop)}
                  disabled={previewStudents.length === 0 || exportingPdf}
                  title="Tự động kết xuất từng lớp và ghép thành file .pdf chuẩn tải về máy tính"
                >
                  <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                  {exportingPdf ? ` ${downloadProgress || 'Đang xuất PDF...'}` : ' Tải trực tiếp (.pdf)'}
                </button>
              </div>
              <div style={{ width: '100%', textAlign: 'right', fontSize: '.76rem', color: '#64748b', fontStyle: 'italic', marginTop: 4 }}>
                * Khuyên dùng: Nút "In / Lưu file PDF" tạo bản in chuẩn văn bản vector sắc nét 100% qua hộp thoại in của trình duyệt (chọn Lưu dạng PDF).
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Xóa học sinh"
        message={confirmDel ? `Bạn có chắc muốn xóa học sinh "${confirmDel.name}" khỏi hệ thống?` : ''}
        confirmText="Xóa"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
      {AlertUI}
    </>
  );
}
