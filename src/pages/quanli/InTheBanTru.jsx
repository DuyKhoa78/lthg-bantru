import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { matchStudentSearch } from '../../utils/qrUtils';
import './InTheBanTru.css';

// Ảnh khung dán 3x4 tiêu chuẩn in ấn (tỷ lệ 3:4 chuẩn)
const pastePhotoAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 133'><rect width='100' height='133' fill='%23fafafa' stroke='%23cbd5e1' stroke-width='2' stroke-dasharray='4'/><text x='50' y='58' font-family='sans-serif' font-size='9' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>ẢNH THẺ</text><text x='50' y='76' font-family='sans-serif' font-size='12' font-weight='900' fill='%2364748b' text-anchor='middle'>3 x 4 cm</text><text x='50' y='94' font-family='sans-serif' font-size='8' fill='%2394a3b8' text-anchor='middle'>(Dán tại đây)</text></svg>";

// Bảng màu truyền thống theo khối: Khối 10 đỏ đô, Khối 11 xanh ngọc, Khối 12 xanh navy.
const colorThemes = {
  red:  { navy: '#450a0a', blue: '#991b1b', gold: '#d97706', text: '#fef08a', label: 'Khối 10 (Đỏ đô)' },
  teal: { navy: '#042f2e', blue: '#0f766e', gold: '#0d9488', text: '#bae6fd', label: 'Khối 11 (Xanh ngọc)' },
  navy: { navy: '#0a192f', blue: '#1e3a8a', gold: '#38bdf8', text: '#bae6fd', label: 'Khối 12 (Xanh navy)' }
};

// Component render mã QR chuẩn quang học 100% bằng QRCode.js
function QRCodeView({ value, size = 62 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    if (window.QRCode) {
      try {
        new window.QRCode(containerRef.current, {
          text: value || 'MSBT: 0',
          width: size,
          height: size,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.L,
        });
      } catch (e) {
        console.error('Lỗi tạo QR:', e);
      }
    }
  }, [value, size]);

  return <div ref={containerRef} className="qr-scan-zone" />;
}

// Lấy mã thẻ in 26xxx chuẩn (Ví dụ: 1 -> 26001, 90 -> 26090, 100 -> 26100, 15 -> 26015)
function getCardId(hs) {
  if (!hs) return '26000';
  if (hs.id && String(hs.id).startsWith('26') && String(hs.id).length >= 5) {
    return String(hs.id);
  }
  const rawId = hs.raw_id !== undefined ? hs.raw_id : hs.id;
  return `26${String(rawId || '0').padStart(3, '0')}`;
}

// Cố định màu thẻ tự động theo khối lớp: Khối 10 Đỏ, Khối 11 Teal, Khối 12 Xanh Navy
function getStudentTheme(hs) {
  const lop = (hs && hs.lop ? String(hs.lop) : '').trim();
  if (lop.startsWith('10')) return colorThemes.red;
  if (lop.startsWith('11')) return colorThemes.teal;
  if (lop.startsWith('12')) return colorThemes.navy;
  return colorThemes.red;
}

// Base URL của backend (nếu có cấu hình VITE_API_URL từ production hoặc env)
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Lấy đường dẫn ảnh thẻ học sinh (hỗ trợ cả production Vercel/Azure và local dev)
function getStudentAvatarUrl(student) {
  if (!student || !student.avatar_url) return pastePhotoAvatar;
  let url = student.avatar_url;
  if (url.startsWith('/uploads') && API_BASE) {
    return `${API_BASE}${url}`;
  }
  return url;
}

// Xử lý fallback khi ảnh thẻ tải lỗi -> chuyển ngay về khung dán 3x4 tiêu chuẩn
function handleAvatarError(e) {
  e.target.onerror = null;
  e.target.src = pastePhotoAvatar;
}


// MẶT SAU THẺ BÁN TRÚ (Kích thước chuẩn 8.8 x 5.5 cm | Đồng bộ màu sắc | Độc lập 1 trang)
function CardBack({ themeKey = 'red', namHoc }) {
  const theme = colorThemes[themeKey] || colorThemes.red;
  const cardStyle = {
    '--primary-navy': theme.navy,
    '--primary-blue': theme.blue,
    '--gold-accent': theme.gold,
    '--gold-text': theme.text,
  };

  return (
    <div className="smart-id-card card-horizontal-view card-back-view" style={cardStyle}>
      {/* WATERMARK TRỐNG ĐỒNG BẢO MẬT CHÌM */}
      <div className="card-watermark-trongdong card-back-watermark">
        <img src="/trong-dong-user.png" alt="Trống đồng" />
      </div>

      {/* HEADER QUY ĐỊNH SỬ DỤNG THẺ (CĂN GIỮA) */}
      <div className="card-back-banner">
        <span className="card-back-banner-text">
          <i className="fas fa-shield-alt"></i> QUY ĐỊNH SỬ DỤNG THẺ
        </span>
      </div>

      {/* NỘI DUNG 4 ĐIỀU QUY ĐỊNH SỬ DỤNG THẺ */}
      <div className="card-back-content">
        <ul className="card-back-rules">
          <li>
            <span className="rule-num">1.</span>
            <span>Đeo thẻ khi vào nhà ăn, phòng nghỉ trưa.</span>
          </li>
          <li>
            <span className="rule-num">2.</span>
            <span>Quét mã QR để điểm danh.</span>
          </li>
          <li>
            <span className="rule-num">3.</span>
            <span>Giữ thẻ sạch, không làm hỏng hoặc mờ mã QR.</span>
          </li>
          <li>
            <span className="rule-num">4.</span>
            <span>Không cho mượn thẻ hoặc dùng thẻ của người khác.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// MẶT TRƯỚC THẺ BÁN TRÚ (Kích thước chuẩn 8.8 x 5.5 cm | Khung dán 3x4 | Rõ dấu)
function CardFront({ student, namHoc }) {
  if (!student) return <div className="print-item-cell" style={{ border: 'none', background: 'transparent' }} />;

  const theme = getStudentTheme(student);
  const cardId = getCardId(student);
  const qrText = `MSBT: ${cardId}`;
  // Cố định font rõ dấu (chuẩn hóa Unicode NFC tiếng Việt sắc nét 100%)
  const displayName = (student.name || '').normalize('NFC');
  // Ảnh thẻ học sinh (nếu có ảnh đã nén thì load, nếu chưa có thì hiển thị khung dán ảnh 3x4 tiêu chuẩn)
  const avatarSrc = getStudentAvatarUrl(student);
  const nameFontSize = displayName.length > 24 ? '8.8px' : (displayName.length > 17 ? '9.8px' : '11px');

  const cardStyle = {
    '--primary-navy': theme.navy,
    '--primary-blue': theme.blue,
    '--gold-accent': theme.gold,
    '--gold-text': theme.text,
  };

  return (
    <div className="smart-id-card card-horizontal-view" style={cardStyle}>
      {/* HEADER */}
      <div className="card-h-head">
        <img src="/logo.png" alt="Logo Trường THPT Lê Thị Hồng Gấm" className="head-logo-img" onError={(e) => { e.target.src = '/icons.svg'; }} />
        <div className="head-titles">
          <div className="title-sub">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
          <div className="title-school">TRƯỜNG THPT LÊ THI HỒNG GẤM</div>
        </div>
        <div className="year-tag">{namHoc || '2026 - 2027'}</div>
      </div>

      {/* WATERMARK TRỐNG ĐỒNG BẢO MẬT CHÌM */}
      <div className="card-watermark-trongdong">
        <img src="/trong-dong-user.png" alt="Trống đồng" />
      </div>

      {/* TIÊU ĐỀ THẺ */}
      <div className="card-main-title">
        <span className="title-text">THẺ BÁN TRÚ</span>
      </div>

      {/* THÔNG TIN CHI TIẾT */}
      <div className="card-h-content">
        <div className="avatar-frame">
          <img
            src={avatarSrc}
            alt={displayName}
            onError={handleAvatarError}
          />
        </div>

        <div className="info-column">
          <div className="student-name-block">
            <div className="name-label">HỌ VÀ TÊN</div>
            <div className="student-fullname-val" style={{ fontSize: nameFontSize }} title={displayName}>
              {displayName}
            </div>
          </div>

          <div className="meta-row-clean meta-row-lop">
            <span className="meta-lbl">Lớp:</span>
            <span className="meta-val-lop">{student.lop}</span>
            <span className="meta-sep">•</span>
            <span className="meta-lbl">Giới tính:</span>
            <span className="meta-val">{student.gt === 0 ? 'Nam' : 'Nữ'}</span>
          </div>

          <div className="meta-row-clean meta-row-id">
            <span className="meta-lbl meta-lbl-id">Mã số:</span>
            <span className="meta-id-highlight">{cardId}</span>
          </div>
        </div>

        {/* MÃ QR ĐIỂM DANH */}
        <div className="qr-wrapper-zone">
          <QRCodeView value={qrText} size={54} />
        </div>
      </div>
    </div>
  );
}

export default function InTheBanTru() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── 2 Chế độ chính: 'lop' (In theo lớp) hoặc 'canhan' (In cá nhân) ──
  const [activeTab, setActiveTab] = useState(() => searchParams.get('mode') || (searchParams.get('id') || searchParams.get('hs') ? 'canhan' : 'lop'));

  // ── Dữ liệu học sinh từ Backend ──
  const [students, setStudents] = useState([]);
  const [classes, setClasses]   = useState([]);
  const [namHoc, setNamHoc]     = useState('2026-2027');
  const [loading, setLoading]   = useState(true);

  // ── Bộ lọc In theo lớp ──
  const [selectedLop, setSelectedLop]     = useState(() => searchParams.get('lop') || '10A1');

  // ── Bộ lọc In cá nhân ──
  const [selectedStudentId, setSelectedStudentId] = useState(() => searchParams.get('id') || searchParams.get('hs') || '');
  const [individualSearch, setIndividualSearch]   = useState('');
  const [individualLopFilter, setIndividualLopFilter] = useState('all');

  // Ref lưu id học sinh từ URL lúc mở trang (tránh re-trigger effect khi searchParams thay đổi)
  const initialQueryIdRef = useRef(searchParams.get('id') || searchParams.get('hs'));

  // Tải danh sách học sinh từ backend khi mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.get('/api/the-ban-tru/danh-sach');
        if (isMounted && res.data?.ok) {
          const rawList = res.data.students || [];
          const sortedList = [...rawList].sort((a, b) => Number(a.raw_id ?? a.id) - Number(b.raw_id ?? b.id));
          setStudents(sortedList);
          setClasses(res.data.classes || []);
          setNamHoc(res.data.nam_hoc || '2026-2027');

          // Nếu có param id từ URL, chọn học sinh đó
          const queryId = initialQueryIdRef.current;
          if (queryId) {
            const found = sortedList.find(s => s.id === queryId || String(s.raw_id) === queryId);
            if (found) {
              setSelectedStudentId(found.id);
              setActiveTab('canhan');
            }
          }
        }
      } catch (err) {
        console.error('Lỗi tải danh sách học sinh in thẻ:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Danh sách học sinh theo lớp đã chọn (Tab In theo lớp) - Luôn sort mã bán trú tăng dần
  const classStudents = useMemo(() => {
    if (!students || students.length === 0) return [];
    let filteredStudents;
    if (selectedLop === 'all') {
      filteredStudents = students;
    } else if (selectedLop.startsWith('khoi_')) {
      const prefix = selectedLop.replace('khoi_', '');
      filteredStudents = students.filter(s => s.lop?.startsWith(prefix));
    } else {
      filteredStudents = students.filter(s => s.lop === selectedLop);
    }
    return [...filteredStudents].sort((a, b) => Number(a.raw_id ?? a.id) - Number(b.raw_id ?? b.id));
  }, [students, selectedLop]);

  // Danh sách học sinh lọc tìm kiếm (Tab In cá nhân) - Luôn sort mã bán trú tăng dần
  const filteredIndividualStudents = useMemo(() => {
    let result = students;
    if (individualLopFilter !== 'all') {
      result = result.filter(s => s.lop === individualLopFilter);
    }
    if (individualSearch.trim()) {
      result = result.filter(s => matchStudentSearch(s, individualSearch));
    }
    return [...result].sort((a, b) => Number(a.raw_id ?? a.id) - Number(b.raw_id ?? b.id));
  }, [students, individualLopFilter, individualSearch]);

  // Học sinh đang được chọn (Tab In cá nhân)
  const currentIndividualStudent = useMemo(() => {
    if (selectedStudentId) {
      const found = students.find(s => s.id === selectedStudentId || String(s.raw_id) === selectedStudentId);
      if (found) return found;
    }
    return filteredIndividualStudents[0] || students[0] || null;
  }, [students, selectedStudentId, filteredIndividualStudents]);

  // ── Chế độ xuất in: 'a4' (Khổ A4 chuẩn tiệm in xén máy) hoặc 'phoi' (In trực tiếp trên phôi CR80) ──
  const [printMode, setPrintMode] = useState('a4');

  // ── Tỉ lệ căn lề khổ A4 (Mặc định: 1.0 - Chuẩn gốc 8.8 x 5.5 cm, lề an toàn đều 16.5mm hai bên) ──
  const [a4Scale, setA4Scale] = useState(1.0);

  // ── Mặt in: 'front' (Mặt trước - theo từng HS) hoặc 'back' (Mặt sau - nội quy chung, đúng 1 trang) ──
  const [cardSide, setCardSide] = useState('front');
  const [backThemeOverride, setBackThemeOverride] = useState(null);

  // Xác định màu sắc mặt sau đồng bộ với mặt trước
  const currentBackThemeKey = useMemo(() => {
    if (backThemeOverride) return backThemeOverride;
    if (activeTab === 'canhan') {
      const lop = currentIndividualStudent?.lop || '';
      if (lop.startsWith('10')) return 'red';
      if (lop.startsWith('11')) return 'teal';
      if (lop.startsWith('12')) return 'navy';
      return 'red';
    }
    if (selectedLop.startsWith('10') || selectedLop === 'khoi_10') return 'red';
    if (selectedLop.startsWith('11') || selectedLop === 'khoi_11') return 'teal';
    if (selectedLop.startsWith('12') || selectedLop === 'khoi_12') return 'navy';
    return 'red';
  }, [activeTab, currentIndividualStudent, selectedLop, backThemeOverride]);

  // Danh sách học sinh cần in
  const targetStudents = useMemo(() => {
    return activeTab === 'canhan' ? (currentIndividualStudent ? [currentIndividualStudent] : []) : classStudents;
  }, [activeTab, currentIndividualStudent, classStudents]);

  // Chia nhóm 8 thẻ / tờ A4 (cho chế độ in A4 ghép khổ chuẩn 8.8 x 5.5 cm)
  const sheetChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < targetStudents.length; i += 8) {
      chunks.push(targetStudents.slice(i, i + 8));
    }
    return chunks;
  }, [targetStudents]);

  // Thao tác in
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`in-the-ban-tru-page print-mode-${printMode}`}>
      {/* ── CẤU HÌNH KÍCH THƯỚC TRANG IN THEO CHẾ ĐỘ CHỌN ── */}
      {printMode === 'phoi' ? (
        <style>{`
          @page {
            size: 88mm 55mm;
            margin: 0;
          }
        `}</style>
      ) : (
        <style>{`
          @page {
            size: A4 portrait;
            margin: 0;
          }
        `}</style>
      )}

      {/* ── BREADCRUMB & HEADER ── */}
      <div className="page-header no-print">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <Link to="/hoc-sinh">Quản lý học sinh</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>In thẻ bán trú</span>
          </div>
          <h2><i className="fas fa-id-card" style={{ color: '#0284c7' }}></i> In Thẻ Bán Trú Học Sinh</h2>
          <p>Bố cục dàn trang chuẩn tiệm in khổ A4 (có vạch Crop-marks xén máy nhanh - 8 thẻ/tờ) &bull; Kích thước thẻ chuẩn 8.8 x 5.5 cm (&lt; 10cm, tỉ lệ cân đối lọt bao thẻ) &bull; Mã số 26xxx.</p>
        </div>
      </div>

      {/* ── TAB CHUYỂN ĐỔI CHẾ ĐỘ: 1. IN THEO LỚP  |  2. IN CÁ NHÂN ── */}
      <div className="in-the-tabs no-print">
        <button
          className={`in-the-tab-btn ${activeTab === 'lop' ? 'active' : ''}`}
          onClick={() => { setActiveTab('lop'); setSearchParams({ mode: 'lop' }); }}
        >
          <i className="fas fa-users-class"></i> 1. In Thẻ Theo Lớp
        </button>
        <button
          className={`in-the-tab-btn ${activeTab === 'canhan' ? 'active' : ''}`}
          onClick={() => { setActiveTab('canhan'); setSearchParams({ mode: 'canhan' }); }}
        >
          <i className="fas fa-user"></i> 2. In Thẻ Cá Nhân
        </button>
      </div>

      {/* ── BẢNG TÙY CHỌN DÀNH CHO TAB 1: IN THEO LỚP ── */}
      {activeTab === 'lop' && (
        <div className="in-the-control-card no-print">
          <div className="in-the-row" style={{ marginBottom: 16 }}>
            {/* Chọn Mặt Thẻ: Mặt Trước (Học sinh) hoặc Mặt Sau (Nội quy 1 trang) */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-layer-group"></i> Mặt In:</span>
              <div className="in-the-segment">
                <button
                  type="button"
                  className={`in-the-segment-btn ${cardSide === 'front' ? 'active' : ''}`}
                  onClick={() => setCardSide('front')}
                  title="In mặt trước: Thông tin chi tiết từng học sinh, ảnh thẻ, mã QR"
                >
                  <i className="fas fa-id-badge"></i> Mặt Trước (Học sinh)
                </button>
                <button
                  type="button"
                  className={`in-the-segment-btn ${cardSide === 'back' ? 'active' : ''}`}
                  onClick={() => setCardSide('back')}
                  title="In mặt sau: Nội quy chung giống nhau tất cả HS - Chỉ in đúng 1 trang duy nhất"
                >
                  <i className="fas fa-shield-alt"></i> Mặt Sau (Nội quy - 1 trang)
                </button>
              </div>
            </div>

            {/* Nếu đang chọn Mặt Sau: Cho phép chọn màu khối đồng bộ */}
            {cardSide === 'back' && (
              <div className="in-the-group">
                <span className="in-the-label"><i className="fas fa-palette"></i> Màu Khối:</span>
                <div className="in-the-segment">
                  <button
                    type="button"
                    className={`in-the-segment-btn ${currentBackThemeKey === 'red' ? 'active' : ''}`}
                    onClick={() => setBackThemeOverride('red')}
                    style={currentBackThemeKey === 'red' ? { background: '#991b1b', color: '#fff' } : {}}
                    title="Màu đỏ đô truyền thống Khối 10"
                  >
                    🔴 Khối 10
                  </button>
                  <button
                    type="button"
                    className={`in-the-segment-btn ${currentBackThemeKey === 'teal' ? 'active' : ''}`}
                    onClick={() => setBackThemeOverride('teal')}
                    style={currentBackThemeKey === 'teal' ? { background: '#0f766e', color: '#fff' } : {}}
                    title="Màu xanh ngọc Khối 11"
                  >
                    🟢 Khối 11
                  </button>
                  <button
                    type="button"
                    className={`in-the-segment-btn ${currentBackThemeKey === 'navy' ? 'active' : ''}`}
                    onClick={() => setBackThemeOverride('navy')}
                    style={currentBackThemeKey === 'navy' ? { background: '#1e3a8a', color: '#fff' } : {}}
                    title="Màu xanh navy Khối 12"
                  >
                    🔵 Khối 12
                  </button>
                </div>
              </div>
            )}

            {/* Chọn lớp */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-filter"></i> Lớp Học:</span>
              <select
                className="in-the-select"
                value={selectedLop}
                onChange={(e) => setSelectedLop(e.target.value)}
              >
                <option value="all">🏫 Toàn trường (Tất cả {students.length} HS)</option>
                <option value="khoi_10">🔴 Toàn bộ Khối 10 ({students.filter(s => s.lop.startsWith('10')).length} HS)</option>
                <option value="khoi_11">🟢 Toàn bộ Khối 11 ({students.filter(s => s.lop.startsWith('11')).length} HS)</option>
                <option value="khoi_12">🔵 Toàn bộ Khối 12 ({students.filter(s => s.lop.startsWith('12')).length} HS)</option>
                <optgroup label="── Danh sách các lớp ──">
                  {classes.map(c => {
                    const count = students.filter(s => s.lop === c).length;
                    return <option key={c} value={c}>Lớp {c} ({count} học sinh)</option>;
                  })}
                </optgroup>
              </select>
            </div>

            {/* Kiểu in: Khổ A4 chuẩn tiệm in hoặc Thẻ rời 8.8 x 5.5 cm */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-sliders-h"></i> Kiểu In:</span>
              <div className="in-the-segment">
                <button
                  type="button"
                  className={`in-the-segment-btn ${printMode === 'a4' ? 'active' : ''}`}
                  onClick={() => setPrintMode('a4')}
                  title="Khổ giấy A4 có vạch Crop-marks - 8 thẻ/tờ chuyên dụng cho tiệm in giấy cứng Couche 300 xén máy"
                >
                  <i className="fas fa-file-alt"></i> Khổ A4 (8 thẻ/tờ)
                </button>
                <button
                  type="button"
                  className={`in-the-segment-btn ${printMode === 'phoi' ? 'active' : ''}`}
                  onClick={() => setPrintMode('phoi')}
                  title="In trực tiếp thẻ kích thước chuẩn 8.8 x 5.5 cm (> 8.6cm và < 9.0cm, máy in thẻ hoặc từng tờ rời)"
                >
                  <i className="fas fa-id-card"></i> In thẻ rời (8.8 x 5.5 cm)
                </button>
              </div>
            </div>

            {/* Căn lề khổ A4: Chuẩn gốc 100% / Thu nhỏ 95% / Thu nhỏ 90% */}
            {printMode === 'a4' && (
              <div className="in-the-group">
                <span className="in-the-label"><i className="fas fa-arrows-alt-h"></i> Căn Lề In:</span>
                <div className="in-the-segment">
                  <button
                    type="button"
                    className={`in-the-segment-btn ${a4Scale === 1.0 ? 'active' : ''}`}
                    onClick={() => setA4Scale(1.0)}
                    title="Kích thước chuẩn gốc 8.8 x 5.5 cm - Lề đều ~16.5mm hai bên khổ A4 (Khuyên dùng)"
                  >
                    <i className="fas fa-shield-alt"></i> Chuẩn 100% (~16.5mm)
                  </button>
                  <button
                    type="button"
                    className={`in-the-segment-btn ${a4Scale === 0.95 ? 'active' : ''}`}
                    onClick={() => setA4Scale(0.95)}
                    title="Thu nhỏ 95% (Thẻ ~9.0 x 5.7 cm) - Chừa lề rộng 14mm cho máy in kẹp lề"
                  >
                    <i className="fas fa-compress-arrows-alt"></i> Lề rộng (95%)
                  </button>
                  <button
                    type="button"
                    className={`in-the-segment-btn ${a4Scale === 0.90 ? 'active' : ''}`}
                    onClick={() => setA4Scale(0.90)}
                    title="Thu nhỏ 90% (Thẻ ~8.5 x 5.4 cm) - Cỡ nhỏ gọn"
                  >
                    <i className="fas fa-ruler"></i> Cỡ nhỏ (90%)
                  </button>
                </div>
              </div>
            )}

            {/* Chip tổng số lượng */}
            <div
              className="in-the-counter-chip"
              style={cardSide === 'back'
                ? { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
                : (printMode === 'a4' ? { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' } : { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' })
              }
            >
              <i className={cardSide === 'back' ? 'fas fa-shield-alt' : (printMode === 'a4' ? 'fas fa-file-alt' : 'fas fa-id-card')}></i>
              <span>
                {cardSide === 'back'
                  ? `Mặt sau nội quy &bull; ĐÚNG 1 TRANG DUY NHẤT &bull; ${colorThemes[currentBackThemeKey]?.label || 'Khối 10'}`
                  : `${classStudents.length} học sinh &bull; ${printMode === 'a4' ? `${sheetChunks.length} tờ A4 (8 thẻ/tờ)` : `${classStudents.length} thẻ (8.8 x 5.5 cm)`}`
                }
              </span>
            </div>

            <button
              className="btn btn-primary"
              onClick={handlePrint}
              style={{ fontWeight: 700, gap: 6, marginLeft: 'auto', background: cardSide === 'back' ? 'linear-gradient(135deg, #d97706, #b45309)' : undefined }}
            >
              <i className="fas fa-print"></i> {cardSide === 'back'
                ? (printMode === 'a4' ? 'In Mặt Sau (1 Tờ A4 Duy Nhất)' : 'In 1 Thẻ Mặt Sau')
                : (printMode === 'a4' ? 'In / Lưu PDF Mặt Trước' : 'In Thẻ Lớp Này')
              }
            </button>
          </div>
        </div>
      )}

      {/* ── BẢNG TÙY CHỌN DÀNH CHO TAB 2: IN CÁ NHÂN ── */}
      {activeTab === 'canhan' && (
        <div className="in-the-control-card no-print">
          <div className="in-the-row" style={{ marginBottom: 16 }}>
            {/* Chọn Mặt Thẻ: Mặt Trước / Mặt Sau */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-layer-group"></i> Mặt In:</span>
              <div className="in-the-segment">
                <button
                  type="button"
                  className={`in-the-segment-btn ${cardSide === 'front' ? 'active' : ''}`}
                  onClick={() => setCardSide('front')}
                >
                  <i className="fas fa-id-badge"></i> Mặt Trước
                </button>
                <button
                  type="button"
                  className={`in-the-segment-btn ${cardSide === 'back' ? 'active' : ''}`}
                  onClick={() => setCardSide('back')}
                >
                  <i className="fas fa-shield-alt"></i> Mặt Sau (1 trang)
                </button>
              </div>
            </div>

            {/* Lọc theo lớp */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-filter"></i> Lọc Lớp:</span>
              <select
                className="in-the-select"
                value={individualLopFilter}
                onChange={(e) => setIndividualLopFilter(e.target.value)}
              >
                <option value="all">Tất cả các lớp</option>
                {classes.map(c => <option key={c} value={c}>Lớp {c}</option>)}
              </select>
            </div>

            {/* Tìm kiếm học sinh */}
            <div className="in-the-group" style={{ flex: 1 }}>
              <span className="in-the-label"><i className="fas fa-search"></i> Tìm Học Sinh:</span>
              <div className="in-the-search-wrap" style={{ flex: 1 }}>
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  className="in-the-search-input"
                  placeholder="Gõ tên hoặc mã học sinh (VD: 26015, Minh, 10A1)..."
                  value={individualSearch}
                  onChange={(e) => setIndividualSearch(e.target.value)}
                />
                {individualSearch && (
                  <button className="in-the-clear-btn" onClick={() => setIndividualSearch('')}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Dropdown danh sách học sinh phù hợp */}
            <div className="in-the-group">
              <span className="in-the-label">Chọn HS:</span>
              <select
                className="in-the-select"
                style={{ maxWidth: 280 }}
                value={currentIndividualStudent?.id || ''}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                {filteredIndividualStudents.map(s => (
                  <option key={s.id} value={s.id}>
                    {getCardId(s)} - {s.name} ({s.lop})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* THÔNG TIN HỌC SINH ĐƯỢC CHỌN */}
          {currentIndividualStudent && (
            <div className="student-detail-summary">
              <div className="student-detail-left">
                <img
                  src={getStudentAvatarUrl(currentIndividualStudent)}
                  onError={handleAvatarError}
                  alt={currentIndividualStudent.name || 'Ảnh học sinh'}
                  className="student-avatar-mini"
                />
                <div className="student-detail-meta">
                  <h4>{currentIndividualStudent.name}</h4>
                  <div className="student-detail-badges">
                    <span className="badge-code-card">Mã Thẻ: {getCardId(currentIndividualStudent)}</span>
                    <span className="badge-class">Lớp: {currentIndividualStudent.lop}</span>
                    <span>{currentIndividualStudent.gt === 0 ? 'Nam' : 'Nữ'}</span>
                    <span className="badge-room-eat"><i className="fas fa-utensils"></i> Ăn: {currentIndividualStudent.an || 'Chưa xếp'}</span>
                    <span className="badge-room-sleep"><i className="fas fa-bed"></i> Ngủ: {currentIndividualStudent.ngu || 'Chưa xếp'}</span>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>(Mã DB gốc: #{currentIndividualStudent.raw_id || currentIndividualStudent.id})</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div className="in-the-segment">
                  <button
                    type="button"
                    className={`in-the-segment-btn ${printMode === 'phoi' ? 'active' : ''}`}
                    onClick={() => setPrintMode('phoi')}
                    title="In trực tiếp thẻ kích thước chuẩn 8.8 x 5.5 cm (> 8.6cm và < 9.0cm, lọt bao thẻ)"
                  >
                    <i className="fas fa-id-card"></i> In thẻ rời (8.8 x 5.5 cm)
                  </button>
                  <button
                    type="button"
                    className={`in-the-segment-btn ${printMode === 'a4' ? 'active' : ''}`}
                    onClick={() => setPrintMode('a4')}
                    title="In trên giấy A4 căn giữa kèm vạch cắt xén 8.8 x 5.5 cm"
                  >
                    <i className="fas fa-file-alt"></i> Khổ A4 (Có vạch cắt)
                  </button>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handlePrint}
                  style={{ fontWeight: 700, gap: 6, background: cardSide === 'back' ? 'linear-gradient(135deg, #d97706, #b45309)' : undefined }}
                >
                  <i className="fas fa-print"></i> {cardSide === 'back'
                    ? (printMode === 'a4' ? 'In Mặt Sau (1 Tờ A4 Duy Nhất)' : 'In 1 Thẻ Mặt Sau')
                    : (printMode === 'a4' ? 'In Tờ A4 Có Vạch Cắt Thẻ' : 'In Thẻ Rời (8.8 x 5.5 cm)')
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KHU VỰC XEM TRƯỚC VÀ XUẤT IN ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <i className="fas fa-circle-notch fa-spin fa-2x" style={{ color: '#0284c7', marginBottom: 12 }}></i>
          <p>Đang tải dữ liệu học sinh từ máy chủ...</p>
        </div>
      ) : targetStudents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <i className="fas fa-user-slash fa-3x" style={{ color: '#cbd5e1', marginBottom: 14 }}></i>
          <h4 style={{ color: '#475569' }}>Không tìm thấy học sinh nào</h4>
          <p style={{ color: '#94a3b8' }}>Vui lòng kiểm tra lại lớp học hoặc từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div id="printSectionArea" className={`print-section-${printMode}`} style={{ '--a4-scale': a4Scale }}>
          {/* Banner Hướng dẫn theo chế độ in và mặt in */}
          {cardSide === 'back' ? (
            <div
              className="print-guide-banner no-print"
              style={{
                background: '#fffbeb',
                border: '1.5px solid #d97706',
                borderRadius: 10,
                padding: '14px 20px',
                margin: '0 0 22px',
                display: 'flex',
                gap: 16,
                alignItems: 'center'
              }}
            >
              <div
                style={{
                  background: '#d97706',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '1.3rem'
                }}
              >
                <i className="fas fa-shield-alt"></i>
              </div>
              <div style={{ flex: 1, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.55 }}>
                <strong style={{ color: '#b45309', fontSize: '0.95rem' }}>MẶT SAU THẺ BÁN TRÚ (NỘI QUY CHUNG — ĐÚNG 1 TRANG DUY NHẤT):</strong>
                <br />
                • <strong>Nội dung giống nhau cho tất cả học sinh:</strong> Hệ thống chỉ xuất <strong>1 trang duy nhất</strong> ({printMode === 'a4' ? '1 tờ A4 gồm 8 thẻ mặt sau liền kề' : '1 thẻ mặt sau 8.8 x 5.5 cm'}). Khi in tiệm hoặc in 2 mặt, chỉ cần in trang này với số lượng bản (copies) tùy ý để lật ghép với mặt trước.
                <br />
                • <strong>Màu sắc đồng bộ với mặt trước:</strong> Đang chọn <strong>{colorThemes[currentBackThemeKey]?.label}</strong>. Thầy/Cô có thể đổi màu khối nhanh ở thanh điều khiển phía trên.
              </div>
            </div>
          ) : printMode === 'a4' ? (
            <div
              className="print-guide-banner no-print"
              style={{
                background: '#f8fafc',
                border: '1.5px solid #0284c7',
                borderRadius: 10,
                padding: '14px 20px',
                margin: '0 0 22px',
                display: 'flex',
                gap: 16,
                alignItems: 'center'
              }}
            >
              <div
                style={{
                  background: '#0284c7',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '1.3rem'
                }}
              >
                <i className="fas fa-print"></i>
              </div>
              <div style={{ flex: 1, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.55 }}>
                <strong style={{ color: '#0369a1', fontSize: '0.95rem' }}>BỐ CỤC CHUẨN XÉN TIỆM IN (KHỔ A4 CÓ VẠCH CROP-MARKS - 8 THẺ/TỜ):</strong>
                <br />
                • <strong>Kích thước chuẩn vừa vặn:</strong> Thẻ đã được tinh chỉnh kích thước chuẩn <strong>8.8 x 5.5 cm (88 x 55 mm)</strong> (tăng đồng bộ cả chiều dài &gt; 8.6cm và &lt; 9.0cm lẫn chiều rộng &gt; 5.4cm theo đúng tỉ lệ chuẩn).
                <br />
                • <strong>LƯU Ý QUAN TRỌNG KHI IN:</strong> Bấm <strong>In / Lưu PDF Gửi Tiệm In</strong> &rarr; Khổ giấy: <strong>A4</strong> &rarr; Mục <strong>Tỉ lệ (Scale): CHỌN "Mặc định (100%)"</strong> &rarr; Lề: <strong>None (Không có)</strong> hoặc <strong>Mặc định</strong>.
              </div>
            </div>
          ) : (
            <div
              className="print-guide-banner no-print"
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #16a34a',
                borderRadius: 8,
                padding: '12px 18px',
                margin: '0 0 20px',
                display: 'flex',
                gap: 14,
                alignItems: 'center'
              }}
            >
              <i className="fas fa-id-card" style={{ color: '#16a34a', fontSize: '1.4rem' }}></i>
              <div style={{ fontSize: '0.88rem', color: '#0f172a', lineHeight: 1.5 }}>
                <strong>CHẾ ĐỘ IN THẺ RỜI (8.8 x 5.5 cm):</strong> Kích thước chuẩn <strong>8.8 x 5.5 cm (88 x 55 mm)</strong>. Phù hợp in trực tiếp phôi nhựa, giấy ảnh bìa dày hoặc máy in thẻ.
              </div>
            </div>
          )}

          {/* DÀN TRANG: KHỔ A4 TIỆM IN (TAB LỚP) HOẶC IN CÁ NHÂN A4 HOẶC THẺ RỜI 8.8 x 5.5 cm */}
          {/* TRƯỜNG HỢP 1: IN MẶT SAU (NỘI QUY CHUNG — ĐÚNG 1 TRANG DUY NHẤT) */}
          {cardSide === 'back' ? (
            printMode === 'a4' ? (
              /* ĐÚNG 1 TỜ A4 DUY NHẤT CHỨA 8 THẺ MẶT SAU */
              <div className="a4-wrapper">
                <div className="a4-cutting-area">
                  {/* Vạch xén đỉnh (Top Crop Marks) */}
                  <span className="crop-mark-v crop-mark-top crop-col-0" title="Vạch xén mép trái (0mm)" />
                  <span className="crop-mark-v crop-mark-top crop-col-1" title="Vạch xén dọc chính giữa (88mm)" />
                  <span className="crop-mark-v crop-mark-top crop-col-2" title="Vạch xén mép phải (190mm)" />

                  {/* Vạch xén đáy (Bottom Crop Marks) */}
                  <span className="crop-mark-v crop-mark-bottom crop-col-0" />
                  <span className="crop-mark-v crop-mark-bottom crop-col-1" />
                  <span className="crop-mark-v crop-mark-bottom crop-col-2" />

                  {/* Vạch xén mép trái (Left Crop Marks) */}
                  <span className="crop-mark-h crop-mark-left crop-row-0" title="Vạch xén mép trên (0mm)" />
                  <span className="crop-mark-h crop-mark-left crop-row-1" title="Vạch xén ngang 1 (60mm)" />
                  <span className="crop-mark-h crop-mark-left crop-row-2" title="Vạch xén ngang 2 (120mm)" />
                  <span className="crop-mark-h crop-mark-left crop-row-3" title="Vạch xén ngang 3 (180mm)" />
                  <span className="crop-mark-h crop-mark-left crop-row-4" title="Vạch xén mép dưới (240mm)" />

                  {/* Vạch xén mép phải (Right Crop Marks) */}
                  <span className="crop-mark-h crop-mark-right crop-row-0" />
                  <span className="crop-mark-h crop-mark-right crop-row-1" />
                  <span className="crop-mark-h crop-mark-right crop-row-2" />
                  <span className="crop-mark-h crop-mark-right crop-row-3" />
                  <span className="crop-mark-h crop-mark-right crop-row-4" />

                  {/* Vạch xén giữa rãnh 2 cột (Center Crop Marks) */}
                  <span className="crop-mark-h crop-mark-center crop-row-0" />
                  <span className="crop-mark-h crop-mark-center crop-row-1" />
                  <span className="crop-mark-h crop-mark-center crop-row-2" />
                  <span className="crop-mark-h crop-mark-center crop-row-3" />
                  <span className="crop-mark-h crop-mark-center crop-row-4" />

                  {/* Lưới 8 thẻ mặt sau liền mạch chuẩn 88mm x 55mm */}
                  <div className="a4-grid-flush">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div key={i} className="print-item-cell-flush">
                        <CardBack themeKey={currentBackThemeKey} namHoc={namHoc} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ĐÚNG 1 THẺ MẶT SAU RỜI (8.8 x 5.5 cm) */
              <div className="phoi-print-container">
                <div className="phoi-preview-meta-bar no-print">
                  <span className="phoi-meta-title">
                    <i className="fas fa-shield-alt" style={{ color: '#d97706' }}></i> Xem trước Mặt Sau Thẻ (1 thẻ 8.8 x 5.5 cm &bull; {colorThemes[currentBackThemeKey]?.label})
                  </span>
                  <span className="phoi-meta-hint">
                    Nội quy chung giống nhau cho tất cả học sinh &bull; In trực tiếp phôi nhựa hoặc máy in thẻ
                  </span>
                </div>
                <div className="phoi-cards-grid">
                  <div className="phoi-card-page">
                    <div className="phoi-card-item-tag no-print">
                      <span className="phoi-tag-num">MẶT SAU</span>
                      <span className="phoi-tag-info">Nội quy bán trú &bull; {colorThemes[currentBackThemeKey]?.label}</span>
                    </div>
                    <div className="phoi-card-wrapper">
                      <CardBack themeKey={currentBackThemeKey} namHoc={namHoc} />
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : activeTab === 'canhan' && printMode === 'a4' ? (
            /* TRƯỜNG HỢP 2: IN CÁ NHÂN MẶT TRƯỚC TRÊN TỜ A4 CÓ VẠCH CẮT XÉN 8.8 x 5.5 cm */
            <div className="a4-wrapper a4-single-card-wrapper">
              <div className="a4-single-card-cut-zone">
                <div className="single-card-cut-frame">
                  {/* Crop marks cho thẻ cá nhân */}
                  <span className="single-crop single-crop-tl-h" />
                  <span className="single-crop single-crop-tl-v" />
                  <span className="single-crop single-crop-tr-h" />
                  <span className="single-crop single-crop-tr-v" />
                  <span className="single-crop single-crop-bl-h" />
                  <span className="single-crop single-crop-bl-v" />
                  <span className="single-crop single-crop-br-h" />
                  <span className="single-crop single-crop-br-v" />

                  <CardFront student={currentIndividualStudent} namHoc={namHoc} />
                </div>
              </div>
            </div>
          ) : printMode === 'a4' ? (
            /* TRƯỜNG HỢP 3: IN MẶT TRƯỚC THEO LỚP (CÁC TỜ A4 - 8 THẺ/TỜ) */
            sheetChunks.map((chunk, sheetIdx) => {
              const frontCells = [];
              for (let i = 0; i < 8; i++) {
                frontCells.push(chunk[i] || null);
              }

              return (
                <div key={`sheet_front_${sheetIdx}`} className="a4-wrapper">
                  {/* Vùng cắt xén chứa 8 thẻ và vạch xén công nghiệp */}
                  <div className="a4-cutting-area">
                    {/* Vạch xén đỉnh (Top Crop Marks) */}
                    <span className="crop-mark-v crop-mark-top crop-col-0" title="Vạch xén mép trái (0mm)" />
                    <span className="crop-mark-v crop-mark-top crop-col-1" title="Vạch xén dọc chính giữa (88mm)" />
                    <span className="crop-mark-v crop-mark-top crop-col-2" title="Vạch xén mép phải (190mm)" />

                    {/* Vạch xén đáy (Bottom Crop Marks) */}
                    <span className="crop-mark-v crop-mark-bottom crop-col-0" />
                    <span className="crop-mark-v crop-mark-bottom crop-col-1" />
                    <span className="crop-mark-v crop-mark-bottom crop-col-2" />

                    {/* Vạch xén mép trái (Left Crop Marks) */}
                    <span className="crop-mark-h crop-mark-left crop-row-0" title="Vạch xén mép trên (0mm)" />
                    <span className="crop-mark-h crop-mark-left crop-row-1" title="Vạch xén ngang 1 (60mm)" />
                    <span className="crop-mark-h crop-mark-left crop-row-2" title="Vạch xén ngang 2 (120mm)" />
                    <span className="crop-mark-h crop-mark-left crop-row-3" title="Vạch xén ngang 3 (180mm)" />
                    <span className="crop-mark-h crop-mark-left crop-row-4" title="Vạch xén mép dưới (240mm)" />

                    {/* Vạch xén mép phải (Right Crop Marks) */}
                    <span className="crop-mark-h crop-mark-right crop-row-0" />
                    <span className="crop-mark-h crop-mark-right crop-row-1" />
                    <span className="crop-mark-h crop-mark-right crop-row-2" />
                    <span className="crop-mark-h crop-mark-right crop-row-3" />
                    <span className="crop-mark-h crop-mark-right crop-row-4" />

                    {/* Vạch xén giữa rãnh 2 cột (Center Crop Marks) */}
                    <span className="crop-mark-h crop-mark-center crop-row-0" />
                    <span className="crop-mark-h crop-mark-center crop-row-1" />
                    <span className="crop-mark-h crop-mark-center crop-row-2" />
                    <span className="crop-mark-h crop-mark-center crop-row-3" />
                    <span className="crop-mark-h crop-mark-center crop-row-4" />

                    {/* Lưới 8 thẻ liền mạch chuẩn 88mm x 55mm */}
                    <div className="a4-grid-flush">
                      {frontCells.map((hs, i) => (
                        <div key={i} className="print-item-cell-flush">
                          {hs ? (
                            <CardFront student={hs} namHoc={namHoc} />
                          ) : (
                            <div className="empty-cell-placeholder" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            /* TRƯỜNG HỢP 4: IN MẶT TRƯỚC THẺ RỜI (PHÔI 8.8 x 5.5 cm) */
            <div className="phoi-print-container">
              <div className="phoi-preview-meta-bar no-print">
                <span className="phoi-meta-title">
                  <i className="fas fa-check-circle" style={{ color: '#16a34a' }}></i> Xem trước danh sách in ({targetStudents.length} thẻ 8.8 x 5.5 cm)
                </span>
                <span className="phoi-meta-hint">
                  Kích thước chuẩn: 8.8 x 5.5 cm (88 x 55 mm) &bull; Tăng đồng bộ dài 8.8 cm & rộng 5.5 cm &bull; Mỗi thẻ in trên 1 trang riêng biệt
                </span>
              </div>

              <div className="phoi-cards-grid">
                {targetStudents.map((hs, idx) => (
                  <div key={hs.id || idx} className="phoi-card-page">
                    <div className="phoi-card-item-tag no-print">
                      <span className="phoi-tag-num">#{idx + 1}</span>
                      <span className="phoi-tag-info">{getCardId(hs)} &bull; {hs.name} ({hs.lop})</span>
                    </div>
                    <div className="phoi-card-wrapper">
                      <CardFront student={hs} namHoc={namHoc} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
