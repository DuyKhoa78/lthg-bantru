import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { removeAccents } from '../../utils/stringUtils';
import './InTheBanTru.css';

// Ảnh khung dán 3x4 tiêu chuẩn in ấn
const pastePhotoAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 130'><rect width='100' height='130' fill='%23fafafa' stroke='%23cbd5e1' stroke-width='2' stroke-dasharray='4'/><text x='50' y='58' font-family='sans-serif' font-size='9' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>ẢNH THẺ</text><text x='50' y='74' font-family='sans-serif' font-size='11' font-weight='900' fill='%2364748b' text-anchor='middle'>3 x 4 cm</text><text x='50' y='90' font-family='sans-serif' font-size='7' fill='%2394a3b8' text-anchor='middle'>(Dán tại đây)</text></svg>";
const defaultStudentAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 130'><rect width='100' height='130' fill='%23f1f5f9'/><circle cx='50' cy='46' r='23' fill='%2394a3b8'/><path d='M15 125 C15 88, 32 78, 50 78 C68 78, 85 88, 85 125 Z' fill='%2364748b'/><polygon points='44,78 56,78 53,108 47,108' fill='%231e3a8a'/><polygon points='40,78 50,88 60,78 50,81' fill='%23ffffff'/><text x='50' y='126' font-family='sans-serif' font-size='7' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>3x4</text></svg>";

// Bảng 3 màu cố định theo khối: Khối 10 Đỏ, Khối 11 Teal, Khối 12 Xanh Navy
const colorThemes = {
  red:  { navy: '#450a0a', blue: '#991b1b', gold: '#d97706', text: '#fef08a', name: 'Khối 10 (Đỏ)' },
  teal: { navy: '#042f2e', blue: '#0f766e', gold: '#0d9488', text: '#bae6fd', name: 'Khối 11 (Teal)' },
  navy: { navy: '#0a192f', blue: '#1e3a8a', gold: '#38bdf8', text: '#bae6fd', name: 'Khối 12 (Xanh Navy)' }
};

// Component render mã QR chuẩn quang học 100% bằng QRCode.js
function QRCodeView({ value, size = 66 }) {
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

// MẶT TRƯỚC THẺ BÁN TRÚ (Cố định: Khối 10 đỏ, 11 teal, 12 xanh navy | Khung dán 3x4 | Rõ dấu)
function CardFront({ student, namHoc }) {
  if (!student) return <div className="print-item-cell" style={{ border: 'none', background: 'transparent' }} />;

  const theme = getStudentTheme(student);
  const cardId = getCardId(student);
  const qrText = `MSBT: ${cardId}`;
  // Cố định font rõ dấu (chuẩn hóa Unicode NFC tiếng Việt sắc nét 100%)
  const displayName = (student.name || '').normalize('NFC');
  // Cố định khung dán ảnh 3x4
  const avatarSrc = pastePhotoAvatar;
  const nameFontSize = displayName.length > 22 ? '9.4px' : (displayName.length > 17 ? '10.2px' : '11px');

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
        <img src="/logo.png" alt="Logo" className="head-logo-img" onError={(e) => { e.target.src = '/icons.svg'; }} />
        <div className="head-titles">
          <div className="title-sub">SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. HỒ CHÍ MINH</div>
          <div className="title-school">TRƯỜNG THPT LÊ THỊ HỒNG GẤM</div>
        </div>
        <div className="year-tag">{namHoc || '2026 - 2027'}</div>
      </div>

      {/* WATERMARK TRỐNG ĐỒNG BẢO MẬT CHÌM */}
      <div className="card-watermark-trongdong">
        <img src="/trong-dong-user.png" alt="Trống đồng" />
      </div>

      {/* TIÊU ĐỀ */}
      <div className="card-main-title">THẺ BÁN TRÚ</div>

      {/* THÔNG TIN CHI TIẾT */}
      <div className="card-h-content">
        <div className="avatar-frame">
          <img src={avatarSrc} alt={displayName} onError={(e) => { e.target.src = defaultStudentAvatar; }} />
        </div>

        <div className="info-column">
          <div className="student-name-block">
            <div className="name-label">Họ và tên</div>
            <div className="student-fullname-val" style={{ fontSize: nameFontSize }} title={displayName}>
              {displayName}
            </div>
          </div>

          <div className="meta-row-clean">
            <span className="meta-lbl">Lớp:</span>
            <span className="meta-val blue">{student.lop}</span>
            <span className="meta-sep">•</span>
            <span className="meta-lbl">Giới tính:</span>
            <span className="meta-val">{student.gt === 0 ? 'Nam' : 'Nữ'}</span>
          </div>

          <div className="meta-row-clean">
            <span className="meta-lbl">Mã số:</span>
            <span className="meta-id-highlight">{cardId}</span>
          </div>

          <div className="room-badges-compact">
            <span className="room-tag-sm pill-orange"><i className="fas fa-utensils"></i> Ăn: <b>{student.an || 'Chưa xếp'}</b></span>
            <span className="room-tag-sm pill-green"><i className="fas fa-bed"></i> Ngủ: <b>{student.ngu || 'Chưa xếp'}</b></span>
          </div>
        </div>

        {/* MÃ QR CODE THẬT */}
        <QRCodeView value={qrText} size={66} />
      </div>
    </div>
  );
}

// MẶT SAU THẺ BÁN TRÚ: NỘI QUY
function CardBack({ student }) {
  const theme = getStudentTheme(student);
  const cardStyle = {
    '--primary-navy': theme.navy,
    '--primary-blue': theme.blue,
    '--gold-accent': theme.gold,
    '--gold-text': theme.text,
  };

  return (
    <div className="smart-id-card card-horizontal-view card-back-view" style={cardStyle}>
      <div className="card-back-title" style={{ color: 'var(--primary-blue)' }}>
        <i className="fas fa-shield-alt"></i> QUY ĐỊNH SỬ DỤNG THẺ BÁN TRÚ
      </div>
      <ol className="rules-list">
        <li>Thẻ được cấp cho học sinh tham gia bán trú tại Trường và có giá trị đến khi học sinh hoàn thành năm học.</li>
        <li>Học sinh phải luôn đeo thẻ khi ở khu vực phòng ăn và phòng ngủ bán trú.</li>
        <li>Học sinh phải bảo quản, giữ gìn thẻ trong suốt thời gian sử dụng. Trường hợp mất thẻ hoặc thẻ hư hỏng phải báo ngay cho Cô Châu y tế.</li>
        <li>Không cho mượn hoặc sử dụng thẻ của người khác.</li>
        <li>Không tự ý tẩy xóa, chỉnh sửa thông tin hoặc làm thay đổi hình dạng của thẻ.</li>
        <li>Thẻ chỉ có giá trị sử dụng trong phạm vi hoạt động bán trú của nhà trường.</li>
      </ol>
    </div>
  );
}

// Thuật toán đảo cột mặt sau cho in Duplex tự động lật cạnh dài
function getDuplexBackOrder(chunk) {
  const result = [];
  for (let r = 0; r < 4; r++) {
    const leftHs = chunk[r * 2] || null;
    const rightHs = chunk[r * 2 + 1] || null;
    result.push(rightHs); // Cột trái mặt sau = Cột phải mặt trước
    result.push(leftHs);  // Cột phải mặt sau = Cột trái mặt trước
  }
  return result;
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
  const [printLayout, setPrintLayout]     = useState('duplex'); // 'duplex', 'batch', 'pair'

  // ── Bộ lọc In cá nhân ──
  const [selectedStudentId, setSelectedStudentId] = useState(() => searchParams.get('id') || searchParams.get('hs') || '');
  const [individualSearch, setIndividualSearch]   = useState('');
  const [individualLopFilter, setIndividualLopFilter] = useState('all');

  // Tải danh sách học sinh từ backend
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
          const queryId = searchParams.get('id') || searchParams.get('hs');
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
    let list = students;
    if (selectedLop === 'all') list = students;
    else if (selectedLop === 'khoi_10') list = students.filter(s => s.lop.startsWith('10'));
    else if (selectedLop === 'khoi_11') list = students.filter(s => s.lop.startsWith('11'));
    else if (selectedLop === 'khoi_12') list = students.filter(s => s.lop.startsWith('12'));
    else list = students.filter(s => s.lop === selectedLop);
    return [...list].sort((a, b) => Number(a.raw_id ?? a.id) - Number(b.raw_id ?? b.id));
  }, [students, selectedLop]);

  // Danh sách học sinh lọc tìm kiếm (Tab In cá nhân) - Luôn sort mã bán trú tăng dần
  const filteredIndividualStudents = useMemo(() => {
    let list = students;
    if (individualLopFilter !== 'all') {
      list = list.filter(s => s.lop === individualLopFilter);
    }
    if (individualSearch.trim()) {
      const q = removeAccents(individualSearch.trim().toLowerCase());
      list = list.filter(s => {
        const nameNoTone = removeAccents((s.name || '').toLowerCase());
        const idStr = String(s.id || '').toLowerCase();
        const rawIdStr = String(s.raw_id || '').toLowerCase();
        const lopStr = (s.lop || '').toLowerCase();
        return nameNoTone.includes(q) || idStr.includes(q) || rawIdStr.includes(q) || lopStr.includes(q);
      });
    }
    return [...list].sort((a, b) => Number(a.raw_id ?? a.id) - Number(b.raw_id ?? b.id));
  }, [students, individualLopFilter, individualSearch]);

  // Học sinh đang được chọn (Tab In cá nhân)
  const currentIndividualStudent = useMemo(() => {
    if (selectedStudentId) {
      const found = students.find(s => s.id === selectedStudentId || String(s.raw_id) === selectedStudentId);
      if (found) return found;
    }
    return filteredIndividualStudents[0] || students[0] || null;
  }, [students, selectedStudentId, filteredIndividualStudents]);

  // Chia nhóm 8 thẻ / tờ A4
  const sheetChunks = useMemo(() => {
    const list = activeTab === 'canhan' ? (currentIndividualStudent ? [currentIndividualStudent] : []) : classStudents;
    const chunks = [];
    for (let i = 0; i < list.length; i += 8) {
      chunks.push(list.slice(i, i + 8));
    }
    return chunks;
  }, [activeTab, currentIndividualStudent, classStudents]);

  // Thao tác in
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="in-the-ban-tru-page">
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
          <p>Hỗ trợ in thẻ theo từng lớp hoặc in thẻ cho từng cá nhân học sinh (Khổ chuẩn CR80 85.60 x 53.98 mm &bull; Mã số hiển thị 26xxx).</p>
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

            {/* Bố cục in A4 */}
            <div className="in-the-group">
              <span className="in-the-label"><i className="fas fa-print"></i> Bố Cục In A4:</span>
              <div className="in-the-segment">
                <button
                  className={`in-the-segment-btn ${printLayout === 'duplex' ? 'active' : ''}`}
                  onClick={() => setPrintLayout('duplex')}
                  title="Tờ 1 Trước -> Tờ 1 Sau -> Tờ 2 Trước... Khớp 100% khi in đảo mặt"
                >
                  In 2 Mặt Duplex (Tự Động)
                </button>
                <button
                  className={`in-the-segment-btn ${printLayout === 'batch' ? 'active' : ''}`}
                  onClick={() => setPrintLayout('batch')}
                  title="Hết tất cả Mặt Trước rồi lật xấp in Mặt Sau"
                >
                  In 1 Mặt (Lật Xấp)
                </button>
              </div>
            </div>

            {/* Chip tổng số lượng */}
            <div className="in-the-counter-chip">
              <i className="fas fa-id-card"></i>
              <span>{classStudents.length} học sinh &bull; {sheetChunks.length} tờ A4 ({sheetChunks.length * 2} trang in)</span>
            </div>

            <button className="btn btn-primary" onClick={handlePrint} style={{ fontWeight: 700, gap: 6, marginLeft: 'auto' }}>
              <i className="fas fa-print"></i> In Thẻ Lớp Này
            </button>
          </div>
        </div>
      )}

      {/* ── BẢNG TÙY CHỌN DÀNH CHO TAB 2: IN CÁ NHÂN ── */}
      {activeTab === 'canhan' && (
        <div className="in-the-control-card no-print">
          <div className="in-the-row" style={{ marginBottom: 16 }}>
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
                  src={pastePhotoAvatar}
                  alt="Khung dán 3x4"
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
              <div>
                <button className="btn btn-success" onClick={handlePrint} style={{ fontWeight: 700, gap: 6 }}>
                  <i className="fas fa-print"></i> In Thẻ Học Sinh Này
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KHU VỰC XEM TRƯỚC VÀ DÀN TRANG IN KHỔ A4 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <i className="fas fa-circle-notch fa-spin fa-2x" style={{ color: '#0284c7', marginBottom: 12 }}></i>
          <p>Đang tải dữ liệu học sinh từ máy chủ...</p>
        </div>
      ) : sheetChunks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <i className="fas fa-user-slash fa-3x" style={{ color: '#cbd5e1', marginBottom: 14 }}></i>
          <h4 style={{ color: '#475569' }}>Không tìm thấy học sinh nào</h4>
          <p style={{ color: '#94a3b8' }}>Vui lòng kiểm tra lại lớp học hoặc từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div id="printSectionArea">
          {/* Hướng dẫn máy in */}
          <div className="print-guide-banner no-print" style={{ background: '#f0f9ff', border: '1.5px solid #0284c7', borderRadius: 8, padding: '12px 18px', margin: '0 0 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
            <i className="fas fa-info-circle" style={{ color: '#0284c7', fontSize: '1.4rem' }}></i>
            <div style={{ fontSize: '0.88rem', color: '#0f172a', lineHeight: 1.5 }}>
              <strong>LƯU Ý KHI IN THẺ:</strong> Kích thước thẻ đã khóa đúng chuẩn quốc tế <strong>85.60 mm x 53.98 mm</strong>.
              Khi bấm In, chọn khổ giấy <strong>A4</strong>, Tỉ lệ (Scale): <strong>100%</strong> (Actual size), Lề: <strong>Không có (None)</strong>, In 2 mặt: <strong>Lật cạnh dài (Flip on long edge)</strong>.
            </div>
          </div>

          {/* Dàn các tờ A4 */}
          {printLayout === 'duplex' && (
            sheetChunks.map((chunk, sheetIdx) => {
              const sheetNum = sheetIdx + 1;
              const totalSheets = sheetChunks.length;
              const frontCells = [];
              for (let i = 0; i < 8; i++) {
                frontCells.push(chunk[i] || null);
              }
              const duplexOrder = getDuplexBackOrder(chunk);

              return (
                <div key={`sheet_duplex_${sheetIdx}`}>
                  {/* TỜ MẶT TRƯỚC */}
                  <div className="a4-wrapper">
                    <div className="a4-top-meta no-print">
                      <div><strong>Trường THPT Lê Thị Hồng Gấm</strong> — Bảng In Thẻ Bán Trú [TỜ {sheetNum}/{totalSheets}: MẶT TRƯỚC]</div>
                      <div>Khổ: <strong>A4</strong> | Thẻ: <strong>85.60 x 53.98mm</strong> | Mã: <strong>26xxx</strong></div>
                    </div>
                    <div className="a4-grid-h">
                      {frontCells.map((hs, i) => (
                        <div key={i} className="print-item-cell">
                          {hs && <CardFront student={hs} namHoc={namHoc} />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TỜ MẶT SAU (KHỚP DUPLEX) */}
                  <div className="a4-wrapper">
                    <div className="a4-top-meta no-print">
                      <div><strong>Trường THPT Lê Thị Hồng Gấm</strong> — Bảng In Thẻ Bán Trú [TỜ {sheetNum}/{totalSheets}: MẶT SAU - NỘI QUY]</div>
                      <div>Tự động đảo cột khớp 100% khi in 2 mặt (Duplex lật cạnh dài)</div>
                    </div>
                    <div className="a4-grid-h">
                      {duplexOrder.map((hs, i) => (
                        <div key={i} className="print-item-cell">
                          {hs && <CardBack student={hs} />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {printLayout === 'batch' && (
            <>
              {/* TẤT CẢ TỜ MẶT TRƯỚC */}
              {sheetChunks.map((chunk, sheetIdx) => {
                const sheetNum = sheetIdx + 1;
                const totalSheets = sheetChunks.length;
                const frontCells = [];
                for (let i = 0; i < 8; i++) frontCells.push(chunk[i] || null);
                return (
                  <div key={`front_${sheetIdx}`} className="a4-wrapper">
                    <div className="a4-top-meta no-print">
                      <div><strong>Trường THPT Lê Thị Hồng Gấm</strong> — In Thẻ Bán Trú [MẶT TRƯỚC: TỜ {sheetNum}/{totalSheets}]</div>
                      <div>Khổ: <strong>A4</strong> | Thẻ: <strong>85.60 x 53.98mm</strong></div>
                    </div>
                    <div className="a4-grid-h">
                      {frontCells.map((hs, i) => (
                        <div key={i} className="print-item-cell">
                          {hs && <CardFront student={hs} namHoc={namHoc} />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* TẤT CẢ TỜ MẶT SAU */}
              {sheetChunks.map((chunk, sheetIdx) => {
                const sheetNum = sheetIdx + 1;
                const totalSheets = sheetChunks.length;
                const duplexOrder = getDuplexBackOrder(chunk);
                return (
                  <div key={`back_${sheetIdx}`} className="a4-wrapper">
                    <div className="a4-top-meta no-print">
                      <div><strong>Trường THPT Lê Thị Hồng Gấm</strong> — In Thẻ Bán Trú [MẶT SAU: TỜ {sheetNum}/{totalSheets}]</div>
                      <div>Lật cả xấp giấy lại để in mặt sau tương ứng</div>
                    </div>
                    <div className="a4-grid-h">
                      {duplexOrder.map((hs, i) => (
                        <div key={i} className="print-item-cell">
                          {hs && <CardBack student={hs} />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
