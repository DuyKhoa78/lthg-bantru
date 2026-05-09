import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAlert } from '../../hooks/useAlert.jsx';
import api from '../../services/api';
import * as XLSX from 'xlsx';
import { removeAccents } from '../../utils/stringUtils';
import '../../styles/admin.css';
import './LichTruc.css';

// ─── Helpers ──────────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const toDateStr = d => {
  try {
    if (!d || isNaN(new Date(d).getTime())) return '';
    const dd = new Date(d);
    return `${dd.getFullYear()}-${p2(dd.getMonth() + 1)}-${p2(dd.getDate())}`;
  } catch { return ''; }
};

// "Nguyễn Văn An" → "N. An"  |  "An" → "An"
const abbrevName = (fullName) => {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  const firstInitial = parts[0][0].toUpperCase();
  return `${firstInitial}. ${lastName}`;
};

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function LichTrucAdmin() {
  const { user } = useAuth();
  const { showAlert, AlertUI } = useAlert();

  // ─── State ─────────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [loading, setLoading]     = useState(false);
  const [showT5, setShowT5]       = useState(false);
  const [roomTab, setRoomTab]     = useState(0); // 0: Phòng ăn, 1: Phòng ngủ

  const [giaoVienList, setGiaoVienList] = useState([]);
  const [phongList, setPhongList]       = useState([]);
  const [pcData, setPcData]             = useState([]);

  // Detail modal (click vào tag GV)
  const [detailPC, setDetailPC]   = useState(null); // bản ghi pc đang xem

  // Picker modal (thêm GV / trực thay)
  const [picker, setPicker]             = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerNhiemVu, setPickerNhiemVu] = useState('all');
  const [pickerSaving, setPickerSaving] = useState(false);

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Confirm clear day (Nghỉ)
  const [confirmClearDay, setConfirmClearDay] = useState(null); // Date object
  // Modal ngày đặc biệt
  const [specialDayModal, setSpecialDayModal] = useState(null); // { ngay: 'YYYY-MM-DD' }
  const [cauhinhNgayMap, setCauhinhNgayMap] = useState({}); // { 'YYYY-MM-DD': config }
  const [specialLopSelected, setSpecialLopSelected] = useState([]); // ['10A1','10A2',...]
  const [allLopList, setAllLopList] = useState([]); // danh sách tất cả lớp
  const [specialSaving, setSpecialSaving] = useState(false);
  const [specialGhiChu, setSpecialGhiChu] = useState('');
  const [specialTab, setSpecialTab] = useState('lop'); // 'lop' | 'hs'
  const [allHsList, setAllHsList] = useState([]); // tất cả HS (cho tab từng HS)
  const [hsSearchTerm, setHsSearchTerm] = useState('');
  const [hsAssignPicker, setHsAssignPicker] = useState(null);
  const [autoLops, setAutoLops] = useState([]);
  const [autoPhongsAn, setAutoPhongsAn] = useState([]);
  const [autoPhongsNgu, setAutoPhongsNgu] = useState([]);
  const [specialHsThemVao, setSpecialHsThemVao] = useState([]); // [{id, ho_ten, lop, phong_an, phong_ngu}]
  const [specialPhongTamAn, setSpecialPhongTamAn] = useState(''); // mã phòng ăn tạm (legacy)
  const [specialPhongTamNgu, setSpecialPhongTamNgu] = useState(''); // mã phòng ngủ tạm (legacy)
  // Gán nhóm lớp → phòng: [{ phong: 'A20', lops: ['10A2','10A3'] }]
  const [lopPhongAnGroups, setLopPhongAnGroups] = useState([]); // cho ăn
  const [lopPhongNguGroups, setLopPhongNguGroups] = useState([]); // cho ngủ
  // State cho việc gán phòng cho HS khi thêm vào ngày đặc biệt
  const [editingHsId, setEditingHsId] = useState(null); // id HS đang chỉnh sửa phòng trong danh sách đã thêm

  // Danh sách phòng theo loại (dùng cho dropdown phòng tạm)
  const phongAnList = useMemo(() => phongList.filter(p => p.loai_phong === 0), [phongList]);
  const phongNguList = useMemo(() => phongList.filter(p => p.loai_phong === 1), [phongList]);

  // Helper kiểm tra phòng ngủ có phù hợp giới tính HS không
  // Phong ngu luon co gioi tinh xac dinh tu bang phong (0=Nam, 1=Nu)
  // hs.gioi_tinh: 0=Nam, 1=Nu. Strict match: HS Nam chi vao phong Nam, HS Nu chi vao phong Nu
  const isPhongNguCompatible = (phong, hs) => {
    if (!phong) return true;
    if (hs.gioi_tinh === null || hs.gioi_tinh === undefined) return true; // HS chua co gioi tinh
    return phong.gioi_tinh === hs.gioi_tinh; // strict: phai trung khop
  };

  const classSizeMap = useMemo(() => {
    const map = {};
    allHsList.forEach(hs => {
      if (!map[hs.lop]) map[hs.lop] = { total: 0, nam: 0, nu: 0 };
      map[hs.lop].total += 1;
      if (hs.gioi_tinh === 0) map[hs.lop].nam += 1;
      else if (hs.gioi_tinh === 1) map[hs.lop].nu += 1;
    });
    return map;
  }, [allHsList]);

  // ─── Computed ───────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    try {
      return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
        .filter(d => {
          const dow = d.getDay();
          if (dow === 4) return showT5;
          return true;
        });
    } catch { return []; }
  }, [weekStart, showT5]);

  const weekLabel = useMemo(() => {
    if (!weekDays || weekDays.length === 0) return '...';
    try {
      const start = weekDays[0].toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
      const end = weekDays[weekDays.length - 1].toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
      return `${start} – ${end}`;
    } catch { return '...'; }
  }, [weekDays]);

  // ─── Load Data ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/api/giaovien/?limit=500').catch(() => ({ data: {} })),
      api.get('/api/phong/an').catch(() => ({ data: {} })),
      api.get('/api/phong/ngu').catch(() => ({ data: {} })),
    ]).then(([resGV, resAn, resNgu]) => {
      if (resGV.data?.ok) setGiaoVienList(resGV.data.giaovien || []);
      setPhongList([
        ...(resAn.data?.ok ? resAn.data.phong : []),
        ...(resNgu.data?.ok ? resNgu.data.phong : []),
      ]);
    }).catch(() => {});
  }, []);

  const loadWeek = useCallback(async (monday) => {
    setLoading(true);
    try {
      const dateStrMon = toDateStr(monday);
      const friday = toDateStr(addDays(monday, 4));
      const [resData, resConfig, resCauhinhNgay] = await Promise.all([
        api.get(`/api/lichtruc/week/?tuan=${dateStrMon}`),
        api.get(`/api/lichtruc/config-tuan/?tuan=${dateStrMon}`),
        api.get(`/api/cauhinh-ngay/range/?tu=${dateStrMon}&den=${friday}`).catch(() => ({ data: { ok: false } })),
      ]);
      if (resData.data?.ok) setPcData(resData.data.records || []);
      if (resConfig.data?.ok) setShowT5(resConfig.data.config.show_t5 || false);
      if (resCauhinhNgay.data?.ok) setCauhinhNgayMap(resCauhinhNgay.data.map || {});
    } catch (err) {
      showAlert('Lỗi tải dữ liệu: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  // ─── Actions ────────────────────────────────────────────────────────
  const navWeek = (dir) => setWeekStart(d => getMonday(addDays(d, dir * 7)));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const doDelete = async () => {
    const pcId = confirmDelete;
    setConfirmDelete(null);
    setDetailPC(null);
    try {
      const res = await api.post('/api/lichtruc/delete/', { id: pcId });
      if (res.data?.ok) await loadWeek(weekStart);
    } catch (err) {
      showAlert('Lỗi xóa: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  const addGV = async (gvSelected) => {
    if (!picker || !gvSelected) return;
    const { ngay, phong_id, loai_truc } = picker;
    const cellEntries = (pcData || []).filter(p => p.ngay === ngay && p.ma_phong_id === phong_id && p.loai_truc === loai_truc);

    if (cellEntries.find(x => x.ma_gv_id === gvSelected.id)) {
      showAlert(`${gvSelected.ho_ten} đã có trong ô này`, 'warning');
      return;
    }

    if (picker.mode !== 'substitute') {
      const phong = (phongList || []).find(p => p.ma_phong === phong_id);
      if (phong) {
        const slToiDa = gvSelected.nhiem_vu === 0 ? (phong.sl_diem_danh || 1) : (phong.sl_ho_tro || 1);
        const hienTai = cellEntries.filter(p => {
          const g = (giaoVienList || []).find(x => x.id === p.ma_gv_id);
          return g?.nhiem_vu === gvSelected.nhiem_vu;
        }).length;
        if (hienTai >= slToiDa) {
          showAlert(`Phòng ${phong_id} đã đủ GV ${gvSelected.nhiem_vu === 0 ? 'điểm danh' : 'hỗ trợ'}`, 'danger');
          return;
        }
      }
    }

    setPickerSaving(true);
    try {
      const originalPC = picker.mode === 'substitute'
        ? (pcData || []).find(x => String(x.id) === String(picker.originalPCId))
        : null;
      const res = await api.post('/api/lichtruc/save/', {
        id: picker.originalPCId,
        ma_gv_id: picker.mode === 'substitute' ? originalPC?.ma_gv_id : gvSelected.id,
        ma_gv_truc_thay_id: picker.mode === 'substitute' ? gvSelected.id : null,
        ma_phong_id: phong_id,
        ngay,
        loai_truc,
      });
      if (res.data?.ok) {
        await loadWeek(weekStart);
        setPicker(null);
        setDetailPC(null);
      }
    } catch (err) {
      showAlert('Lỗi lưu: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setPickerSaving(false);
    }
  };

  const applyKhung = async () => {
    setLoading(true);
    try {
      const res = await api.post('/api/lichtruc/apply-khung/', { tuan: toDateStr(weekStart), force: false });
      if (res.data?.ok) { showAlert(res.data.message, 'success'); loadWeek(weekStart); }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
    finally { setLoading(false); }
  };

  const clearDay = (d) => {
    setConfirmClearDay(d);
  };

  const doClearDay = async () => {
    const d = confirmClearDay;
    setConfirmClearDay(null);
    if (!d) return;
    try {
      const res = await api.post('/api/lichtruc/clear-day/', { ngay: toDateStr(d) });
      if (res.data?.ok) { showAlert(res.data.message, 'success'); await loadWeek(weekStart); }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
  };

  // Mở modal cấu hình ngày đặc biệt
  const openSpecialDayModal = async (d) => {
    const ngay = toDateStr(d);
    setSpecialTab('lop');
    setEditingHsId(null);
    setHsSearchTerm('');
    setHsAssignPicker(null);
    setAutoLops([]);
    setAutoPhongsAn([]);
    setAutoPhongsNgu([]);
    // Lấy danh sách lớp và HS (nếu chưa có)
    if (allLopList.length === 0 || allHsList.length === 0) {
      try {
        const res = await api.get('/api/hocsinh/an');
        if (res.data?.ok) {
          const hsData = res.data.hocsinh || [];
          setAllHsList(hsData);
          const lops = [...new Set(hsData.map(h => h.lop))].sort();
          setAllLopList(lops);
        }
      } catch { /* ignore */ }
    }
    const existing = cauhinhNgayMap[ngay];
    setSpecialLopSelected(existing?.lop_ap_dung || []);
    setSpecialHsThemVao(existing?.hs_them_vao || []);
    setSpecialGhiChu(existing?.ghi_chu || '');
    setSpecialPhongTamAn(existing?.phong_tam_an || '');
    setSpecialPhongTamNgu(existing?.phong_tam_ngu || '');
    // Chuyển lop_phong_an object { '10A1':'A20', '10A2':'A30' } → groups [{phong,lops}]
    const toGroups = (map) => {
      if (!map) return [];
      const rev = {};
      Object.entries(map).forEach(([lop, phong]) => { if (!rev[phong]) rev[phong] = []; rev[phong].push(lop); });
      return Object.entries(rev).map(([phong, lops]) => ({ phong, lops }));
    };
    setLopPhongAnGroups(toGroups(existing?.lop_phong_an));
    setLopPhongNguGroups(toGroups(existing?.lop_phong_ngu));
    setSpecialDayModal({ ngay });
  };

  const saveSpecialDay = async () => {
    if (!specialDayModal) return;
    setSpecialSaving(true);
    try {
      const hasLop = specialLopSelected.length > 0;
      const hasHs = derivedHsList.length > 0;
      const hasPhongTam = specialPhongTamAn || specialPhongTamNgu || lopPhongAnGroups.length > 0 || lopPhongNguGroups.length > 0;
      // Chuyển groups → object { lop: phong }
      const groupsToMap = (groups) => {
        if (!groups || groups.length === 0) return null;
        const obj = {};
        groups.forEach(({ phong, lops }) => { (lops || []).forEach(lop => { if (lop && phong) obj[lop] = phong; }); });
        return Object.keys(obj).length > 0 ? obj : null;
      };
      const lopPhongAnMap = groupsToMap(lopPhongAnGroups);
      const lopPhongNguMap = groupsToMap(lopPhongNguGroups);
      if (!hasLop && !hasHs && !hasPhongTam) {
        await api.post('/api/cauhinh-ngay/delete/', { ngay: specialDayModal.ngay });
        showAlert('Đã xóa cấu hình ngày đặc biệt — ngày này sẽ điểm danh toàn trường', 'success');
      } else {
        let finalLopApDung = [...specialLopSelected];
        if (finalLopApDung.length === 0) {
          const setClasses = new Set();
          lopPhongAnGroups.forEach(g => g.lops.forEach(l => setClasses.add(l)));
          lopPhongNguGroups.forEach(g => g.lops.forEach(l => setClasses.add(l)));
          if (setClasses.size > 0) {
            finalLopApDung = Array.from(setClasses).sort();
          }
        }
        await api.post('/api/cauhinh-ngay/save/', {
          ngay: specialDayModal.ngay,
          lop_ap_dung: finalLopApDung,
          hs_them_vao: derivedHsList,
          phong_tam_an: specialPhongTamAn || null,
          phong_tam_ngu: specialPhongTamNgu || null,
          lop_phong_an: lopPhongAnMap,
          lop_phong_ngu: lopPhongNguMap,
          ghi_chu: specialGhiChu || null,
        });
        const msg = [];
        if (hasLop) msg.push(`lớp ${specialLopSelected.join(', ')}`);
        if (hasHs) msg.push(`+ ${derivedHsList.length} HS phân bổ riêng`);
        if (lopPhongAnGroups.length > 0) msg.push(`Phòng Ăn: ${lopPhongAnGroups.map(g=>g.phong).join('/')}`);
        if (lopPhongNguGroups.length > 0) msg.push(`Phòng Ngủ: ${lopPhongNguGroups.map(g=>g.phong).join('/')}`);
        showAlert(`Đã lưu: ngày ${specialDayModal.ngay} — ${msg.join(' | ')}`, 'success');
      }
      setSpecialDayModal(null);
      await loadWeek(weekStart);
    } catch (err) {
      showAlert('Lỗi lưu cấu hình: ' + (err.response?.data?.error || err.message), 'danger');
    } finally { setSpecialSaving(false); }
  };

  const applyDay = async (d) => {
    try {
      const sourceThu = d.getDay() - 1; // 1=T2 -> sourceThu=0
      if (d.getDay() === 0 || d.getDay() === 6) {
        showAlert('Chỉ có thể nạp tự động cho T2-T6', 'warning'); return;
      }
      const thuNames = ['', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'];
      const tenThu = thuNames[d.getDay()] || d.getDay();
      const res = await api.post('/api/lichtruc/apply-day-bu/', { targetDate: toDateStr(d), sourceThu, force: false });
      if (res.data?.ok) {
        const { inserted = 0, skipped = 0 } = res.data;
        if (inserted === 0 && skipped === 0) {
          showAlert(
            `Chưa có lịch khung cho Thứ ${tenThu}. Vui lòng vào "Lịch Khung Cố Định" để thiết lập trước, hoặc thêm giáo viên thủ công bằng nút [+] trong từng ô phòng.`,
            'warning'
          );
        } else {
          showAlert(res.data.message, 'success');
        }
        await loadWeek(weekStart);
      }
    } catch (err) { showAlert('Lỗi: ' + (err.response?.data?.error || err.message), 'danger'); }
  };


  // derivedHsList = merge: class-room groups (base) + individual overrides (priority)
  const anMap = {};
  lopPhongAnGroups.forEach(g => g.lops.forEach(lop => { if (lop && g.phong) anMap[lop] = g.phong; }));
  
  const nguMap = {}; // lop -> { '0': ma_phong, '1': ma_phong, 'all': ma_phong }
  lopPhongNguGroups.forEach(g => {
    const phongObj = phongList.find(p => p.ma_phong === g.phong);
    const gt = phongObj ? phongObj.gioi_tinh : null;
    g.lops.forEach(lop => {
      if (lop && g.phong) {
        if (!nguMap[lop]) nguMap[lop] = {};
        if (gt !== null) nguMap[lop][gt] = g.phong;
        else nguMap[lop]['all'] = g.phong;
      }
    });
  });
  
  const assignedLops = new Set([...Object.keys(anMap), ...Object.keys(nguMap)]);
  
  // Base: class-based assignments
  const derivedMap = new Map();
  if (assignedLops.size > 0) {
    allHsList.forEach(hs => {
      if (!assignedLops.has(hs.lop)) return;
      const pAn = anMap[hs.lop] || '';
      let pNgu = '';
      if (nguMap[hs.lop]) {
          pNgu = nguMap[hs.lop][hs.gioi_tinh] || nguMap[hs.lop]['all'] || '';
      }
      derivedMap.set(hs.id, { id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, phong_an: pAn, phong_ngu: pNgu });
    });
  }
  
  // Overlay: individual overrides win (higher priority)
  specialHsThemVao.forEach(h => {
      const exist = derivedMap.get(h.id);
      if (exist) derivedMap.set(h.id, { ...exist, ...h });
      else derivedMap.set(h.id, h);
  });
  
  // Chỉ giữ lại những HS có ít nhất 1 phòng được gán
  const derivedHsList = Array.from(derivedMap.values()).filter(h => h.phong_an || h.phong_ngu);

  const getCellData = useCallback((phong_id, ngayStr, loai_truc) =>
    (pcData || []).filter(p => p.ma_phong_id === phong_id && p.ngay === ngayStr && p.loai_truc === loai_truc), [pcData]);

  const filteredGVList = useMemo(() => {
    if (!giaoVienList) return [];
    return giaoVienList.filter(gv => {
      if (!gv.dang_lam) return false;
      if (pickerNhiemVu !== 'all' && gv.nhiem_vu !== parseInt(pickerNhiemVu)) return false;
      if (pickerSearch) {
        const searchStr = removeAccents(pickerSearch.toLowerCase());
        const nameStr = removeAccents(gv.ho_ten.toLowerCase());
        if (!nameStr.includes(searchStr)) return false;
      }
      
      if (picker) {
        const { ngay, loai_truc, phong_id } = picker;
        
        // 1. Kiểm tra giới tính (Nếu là phòng ngủ)
        const currentPhong = phongList.find(p => p.ma_phong === phong_id);
        if (loai_truc === 1 && currentPhong && currentPhong.gioi_tinh !== null) {
          // 0: Nam, 1: Nữ. GV gioi_tinh: 0: Nam, 1: Nữ
          if (gv.gioi_tinh !== currentPhong.gioi_tinh) return false;
        }

        // 2. Kiểm tra GV đã bận ở phòng khác trong cùng buổi (loai_truc) chưa
        const isBusy = (pcData || []).some(pc => 
          pc.ngay === ngay && 
          pc.loai_truc === loai_truc && 
          (pc.ma_gv_id === gv.id || pc.ma_gv_truc_thay_id === gv.id)
        );
        if (isBusy) return false;

        // 3. Nếu là trực thay, không cho tự thay cho mình
        if (picker.mode === 'substitute' && picker.originalPCId) {
          const originalPC = (pcData || []).find(x => String(x.id) === String(picker.originalPCId));
          if (originalPC && gv.id === originalPC.ma_gv_id) return false;
        }
      }
      return true;
    });
  }, [giaoVienList, phongList, picker, pickerSearch, pickerNhiemVu, pcData]);

  // ─── Helper lấy thông tin GV từ pc record ──────────────────────────
  const getGVInfo = (pc) => pc.giao_vien || (giaoVienList || []).find(g => g.id === pc.ma_gv_id);
  const getGVThayInfo = (pc) => pc.giao_vien_truc_thay || (giaoVienList || []).find(g => g.id === pc.ma_gv_truc_thay_id);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span>Phân công theo Ngày</span>
          </div>
          <h2><i className="fas fa-calendar-check" style={{ color: 'var(--primary)' }}></i> Phân công theo Ngày</h2>
        </div>
        <div className="page-header-actions">
          <div className="header-button-group" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`btn btn-sm ${showT5 ? 'btn-primary' : 'btn-ghost'}`} 
              onClick={async () => {
                const nv = !showT5; setShowT5(nv);
                try { await api.post('/api/lichtruc/config-tuan/save/', { tuan: toDateStr(weekStart), show_t5: nv }); } catch { /* ignore */ }
              }}
            >
              <i className={`fas ${showT5 ? 'fa-eye-slash' : 'fa-eye'}`}></i> {showT5 ? 'Ẩn Thứ 5' : 'Dạy bù (T5)'}
            </button>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={goToday} 
              disabled={loading}
            >
              <i className="fas fa-calendar-day"></i> Tuần này
            </button>
            <button 
              className="btn btn-success btn-sm" 
              style={{ fontWeight: 600, boxShadow: '0 2px 6px rgba(34,197,94,0.2)' }}
              onClick={applyKhung} 
              disabled={loading}
            >
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} Nạp lịch cố định
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div className="week-nav" style={{ margin: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(-1)} disabled={loading}><i className="fas fa-chevron-left"></i></button>
          <span className="week-label">{loading ? <i className="fas fa-spinner fa-spin"></i> : `Tuần: ${weekLabel}`}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navWeek(1)} disabled={loading}><i className="fas fa-chevron-right"></i></button>
        </div>

        {/* CHÚ THÍCH MÀU SẮC - Ngang hàng với chọn tuần */}
        <div className="lt-legend" style={{ 
          display: 'flex', 
          gap: '16px', 
          fontSize: '0.75rem', 
          background: '#f8fafc', 
          padding: '6px 14px', 
          borderRadius: '20px', 
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, background: '#2563eb', borderRadius: '50%' }}></span>
            <span style={{ fontWeight: 600, color: '#475569' }}>Điểm danh</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, background: '#16a34a', borderRadius: '50%' }}></span>
            <span style={{ fontWeight: 600, color: '#475569' }}>Hỗ trợ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-exchange-alt" style={{ color: '#d97706', fontSize: '0.7rem' }}></i>
            <span style={{ fontWeight: 600, color: '#475569' }}>Trực thay</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
        <button
          onClick={() => setRoomTab(0)}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
            background: roomTab === 0 ? 'var(--primary)' : '#fff',
            color: roomTab === 0 ? '#fff' : '#64748b',
            fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: roomTab === 0 ? '0 2px 8px rgba(0,156,255,0.3)' : 'none'
          }}
        >
          <i className="fas fa-utensils"></i> Phòng ăn
        </button>
        <button
          onClick={() => setRoomTab(1)}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
            background: roomTab === 1 ? 'var(--primary)' : '#fff',
            color: roomTab === 1 ? '#fff' : '#64748b',
            fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: roomTab === 1 ? '0 2px 8px rgba(0,156,255,0.3)' : 'none'
          }}
        >
          <i className="fas fa-bed"></i> Phòng ngủ
        </button>
      </div>


      <div style={{ overflowX: 'auto' }}>
        <table className="lt-admin-table" style={{ width: '100%', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Phòng</th>
              {(weekDays || []).map((d, i) => {
                const isToday = toDateStr(d) === toDateStr(new Date());
                const dayHasSchedule = (pcData || []).some(pc => pc.ngay === toDateStr(d));
                return (
                  <th key={i} style={isToday ? { background: 'var(--primary)', color: '#fff' } : {}}>
                    <div>{DOW_SHORT[d.getDay()]}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 400, marginBottom: dayHasSchedule ? 6 : 8 }}>{p2(d.getDate())}/{p2(d.getMonth() + 1)}</div>
                    {user?.is_admin && (
                      <div style={{ fontSize: '0.65rem', fontWeight: 'normal', display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {dayHasSchedule ? (
                          <button 
                            style={{ background: isToday ? '#fff' : '#dc2626', border: 'none', borderRadius: 4, padding: '3px 8px', color: isToday ? '#dc2626' : '#fff', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
                            onClick={() => clearDay(d)}
                            title="Đánh dấu ngày này là ngày nghỉ bán trú"
                          >
                            <i className="fas fa-ban"></i> Nghỉ
                          </button>
                        ) : (
                          <button 
                            style={{ background: isToday ? '#fff' : '#059669', border: 'none', borderRadius: 4, padding: '3px 8px', color: isToday ? '#059669' : '#fff', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
                            onClick={() => applyDay(d)}
                            title="Tạo lịch phân công từ khung cố định cho ngày này"
                          >
                            <i className="fas fa-plus"></i> Có bán trú
                          </button>
                        )}
                        {dayHasSchedule && (() => {
                          const cfg = cauhinhNgayMap[toDateStr(d)];
                          const lopList = cfg?.lop_ap_dung;
                          const hasPhongTam = cfg?.phong_tam_an || cfg?.phong_tam_ngu;
                          const hasGroupConfig = (cfg?.lop_phong_an && Object.keys(cfg.lop_phong_an).length > 0) || (cfg?.lop_phong_ngu && Object.keys(cfg.lop_phong_ngu).length > 0);
                          const hasHsAdded = cfg?.hs_them_vao && cfg.hs_them_vao.length > 0;
                          const hasFilter = (lopList && lopList.length > 0) || hasPhongTam || hasGroupConfig || hasHsAdded;
                          return (
                            <button
                              style={{
                                background: hasFilter ? '#f59e0b' : (isToday ? '#fff' : '#6366f1'),
                                border: 'none', borderRadius: 4, padding: '3px 8px',
                                color: hasFilter ? '#fff' : (isToday ? '#6366f1' : '#fff'),
                                cursor: 'pointer', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                              }}
                              onClick={() => openSpecialDayModal(d)}
                              title={hasFilter
                                ? `Đặc biệt: ${[lopList?.join(', '), cfg?.phong_tam_an && 'PĂ:'+cfg.phong_tam_an, cfg?.phong_tam_ngu && 'PN:'+cfg.phong_tam_ngu].filter(Boolean).join(' | ')}`
                                : 'Cấu hình ngày đặc biệt'}
                            >
                              <i className={`fas ${hasFilter ? 'fa-filter' : 'fa-sliders-h'}`}></i>
                              {' Đặc biệt'}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(phongList || []).filter(p => p.loai_phong === roomTab).map(phong => (
              <tr key={phong.ma_phong}>
                <td className="lt-admin-td-phong">
                  <div style={{ fontWeight: 600 }}>{phong.ma_phong}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{phong.loai_phong === 0 ? 'Phòng ăn' : `Phòng ngủ (${phong.gioi_tinh === 0 ? 'Nam' : 'Nữ'})`}</div>
                </td>
                {(weekDays || []).map((d, idx) => {
                  const ngayStr = toDateStr(d);
                  const cellData = getCellData(phong.ma_phong, ngayStr, phong.loai_phong);
                  return (
                    <td key={idx} className="lt-admin-td-cell">
                      {cellData.map(pc => {
                        const gv = getGVInfo(pc);
                        const gvThay = pc.ma_gv_truc_thay_id ? getGVThayInfo(pc) : null;
                        const isDD = gv?.nhiem_vu === 0;
                        const isHT = gv?.nhiem_vu === 1;
                        const borderColor = isDD ? '#2563eb' : (isHT ? '#16a34a' : '#64748b');
                        const bgColor = isDD ? '#eff6ff' : (isHT ? '#f0fdf4' : '#f8fafc');

                        return (
                          <div
                            key={pc.id}
                            onClick={() => setDetailPC({ ...pc, _phong: phong, _ngay: ngayStr })}
                            style={{
                              background: bgColor,
                              borderLeft: `3px solid ${borderColor}`,
                              padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                              cursor: 'pointer', lineHeight: 1.25,
                              transition: 'box-shadow 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
                          >
                            {/* Nếu có trực thay: hiện tên GV thay màu vàng đậm ở trên */}
                            {gvThay ? (
                              <>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#b45309' }}>
                                  {gvThay.ho_ten}
                                </div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 1 }}>
                                  thay: {abbrevName(gv?.ho_ten)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isDD ? '#1e40af' : (isHT ? '#166534' : '#1e293b') }}>
                                {gv?.ho_ten}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {user?.is_admin && (() => {
                        const countDD = cellData.filter(p => (p.giao_vien?.nhiem_vu ?? (giaoVienList || []).find(g => g.id === p.ma_gv_id)?.nhiem_vu) === 0).length;
                        const countHT = cellData.filter(p => (p.giao_vien?.nhiem_vu ?? (giaoVienList || []).find(g => g.id === p.ma_gv_id)?.nhiem_vu) === 1).length;
                        if (countDD < (phong.sl_diem_danh || 1) || countHT < (phong.sl_ho_tro || 1)) {
                          return <button className="lt-add-btn" onClick={() => setPicker({ ngay: ngayStr, phong_id: phong.ma_phong, loai_truc: phong.loai_phong, mode: 'add' })}><i className="fas fa-plus"></i></button>;
                        }
                        return null;
                      })()}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Modal Chi tiết GV (click vào tag) ─── */}
      {detailPC && (() => {
        const gv    = getGVInfo(detailPC);
        const gvThay = detailPC.ma_gv_truc_thay_id ? getGVThayInfo(detailPC) : null;
        const isDD  = gv?.nhiem_vu === 0;
        const isHT  = gv?.nhiem_vu === 1;
        return (
          <div className="modal-overlay open" onClick={() => setDetailPC(null)}>
            <div className="modal-box" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Chi tiết phân công</div>
                <button className="modal-close" onClick={() => setDetailPC(null)}><i className="fas fa-times"></i></button>
              </div>
              <div className="modal-body">
                {/* Thông tin phòng + ngày */}
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12 }}>
                  <i className="fas fa-door-open" style={{ marginRight: 6 }}></i>
                  {detailPC._phong?.ma_phong} — {detailPC._ngay}
                </div>

                {/* GV được phân công */}
                <div style={{ background: isDD ? '#eff6ff' : (isHT ? '#f0fdf4' : '#f8fafc'), borderLeft: `4px solid ${isDD ? '#2563eb' : (isHT ? '#16a34a' : '#94a3b8')}`, padding: '10px 12px', borderRadius: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {gvThay ? 'Người được thay' : 'Giáo viên trực'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isDD ? '#1e40af' : (isHT ? '#166534' : '#1e293b') }}>
                    {gv?.ho_ten || '?'}
                  </div>
                  <div style={{ fontSize: '0.7rem', marginTop: 2 }}>
                    <span className={`badge ${isDD ? 'badge-primary' : (isHT ? 'badge-success' : '')}`} style={{ fontSize: '0.6rem' }}>
                      {isDD ? 'Điểm danh' : (isHT ? 'Hỗ trợ' : '?')}
                    </span>
                  </div>
                </div>

                {/* Nếu có trực thay */}
                {gvThay && (
                  <div style={{ background: '#fffbeb', borderLeft: '4px solid #d97706', padding: '10px 12px', borderRadius: 6, marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      <i className="fas fa-exchange-alt"></i> Người trực thay
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#b45309' }}>
                      {gvThay.ho_ten}
                    </div>
                  </div>
                )}

                {/* Nút hành động (chỉ admin) */}
                {user?.is_admin && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDetailPC(null);
                        setPicker({ ngay: detailPC._ngay, phong_id: detailPC._phong?.ma_phong, loai_truc: detailPC._phong?.loai_phong, mode: 'substitute', originalPCId: detailPC.id });
                        setPickerSearch(''); setPickerNhiemVu('all');
                      }}
                    >
                      <i className="fas fa-user-friends"></i> {gvThay ? 'Đổi người thay' : 'Trực thay'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => { setConfirmDelete(detailPC.id); setDetailPC(null); }}
                    >
                      <i className="fas fa-trash"></i> Xóa phân công
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modal Chọn GV (thêm / trực thay) ─── */}
      {picker && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <div className="modal-title">{picker.mode === 'substitute' ? '👥 Chọn GV trực thay' : '➕ Thêm giáo viên'} — {picker.phong_id}</div>
              <button className="modal-close" onClick={() => setPicker(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" className="form-control" placeholder="Tìm tên..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
                <select className="form-select" style={{ width: 130 }} value={pickerNhiemVu} onChange={e => setPickerNhiemVu(e.target.value)}>
                  <option value="all">Tất cả</option>
                  <option value="0">Điểm danh</option>
                  <option value="1">Hỗ trợ</option>
                </select>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {(filteredGVList || []).length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: '0.85rem' }}>Không có giáo viên phù hợp</div>
                )}
                {(filteredGVList || []).map(gv => (
                  <div key={gv.id} className="lt-picker-item" onClick={() => !pickerSaving && addGV(gv)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: gv.nhiem_vu === 0 ? 'rgba(37,99,235,0.03)' : 'rgba(22,163,74,0.03)'
                  }}>
                    <span style={{ fontWeight: 500 }}>{gv.ho_ten}</span>
                    <span className={`badge ${gv.nhiem_vu === 0 ? 'badge-primary' : 'badge-success'}`} style={{ fontSize: '0.6rem' }}>
                      {gv.nhiem_vu === 0 ? 'Điểm danh' : 'Hỗ trợ'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {AlertUI}

      {/* ─── Modal Cấu hình Ngày Đặc biệt ─── */}
      {specialDayModal && (() => {
        return (
          <div className="modal-overlay open">
            <div className="modal-box" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <div className="modal-title"><i className="fas fa-filter" style={{ color: '#f59e0b', marginRight: 6 }}></i>Cấu hình Ngày Đặc biệt — {specialDayModal.ngay}</div>
                <button className="modal-close" onClick={() => setSpecialDayModal(null)}><i className="fas fa-times"></i></button>
              </div>

              {/* Tab switcher */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', padding: '0 16px', gap: 4 }}>
                {[{ id: 'lop', label: '📋 Theo Lớp', count: specialLopSelected.length },
                  { id: 'hs', label: '👤 Từng HS', count: derivedHsList.length }
                ].map(tab => (
                  <button key={tab.id} onClick={() => setSpecialTab(tab.id)} style={{
                    padding: '8px 14px', border: 'none', cursor: 'pointer', fontWeight: 600,
                    fontSize: '0.82rem', background: 'transparent', transition: 'all .15s',
                    borderBottom: specialTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent',
                    color: specialTab === tab.id ? '#b45309' : '#64748b', marginBottom: -2,
                  }}>
                    {tab.label}{tab.count > 0 && <span style={{ marginLeft: 4, background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem' }}>{tab.count}</span>}
                  </button>
                ))}
              </div>

              {/* Tab: Theo Lớp */}
              {specialTab === 'lop' && (
                <div className="modal-body" style={{ paddingBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                      Các lớp đã chọn ({specialLopSelected.length}):
                    </div>
                    {specialLopSelected.length > 0 && (
                      <button style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => setSpecialLopSelected([])}><i className="fas fa-trash"></i> Xóa tất cả</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                    {specialLopSelected.map(lop => (
                      <div key={lop} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: '#fef3c7', border: '1px solid #f59e0b', fontSize: '0.85rem', fontWeight: 600, color: '#92400e' }}>
                        {lop}
                        <button onClick={() => setSpecialLopSelected(prev => prev.filter(l => l !== lop))} style={{ border: 'none', background: 'none', color: '#d97706', cursor: 'pointer', padding: '0 2px' }}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                    {specialLopSelected.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem', width: '100%', textAlign: 'center', fontStyle: 'italic', padding: 10 }}>Chưa có lớp nào được chọn (Toàn trường)</p>}
                  </div>
                </div>
              )}

              {/* Section: Gán phòng theo nhóm lớp */}
              {specialTab === 'lop' && (<>
                <div className="modal-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
                  <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0369a1', marginBottom: 8 }}>
                    <i className="fas fa-layer-group" style={{ marginRight: 6 }}></i>
                    GÁN PHÒNG THEO NHÓM LỚP
                    <span style={{ fontWeight: 400, fontSize: '0.73rem', marginLeft: 6, color: '#64748b' }}>(vd: 10A2, 10A3 → A20 | 10A4 → A30)</span>
                  </div>
                  {[{ label: 'ĂN', icon: 'fa-utensils', color: '#059669', groups: lopPhongAnGroups, setGroups: setLopPhongAnGroups, phongList: phongAnList },
                    { label: 'NGỦ', icon: 'fa-bed', color: '#6c5ce7', groups: lopPhongNguGroups, setGroups: setLopPhongNguGroups, phongList: phongNguList }
                  ].map(({ label, icon, color, groups, setGroups, phongList: pList }) => (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color, marginBottom: 5 }}>
                        <i className={`fas ${icon}`} style={{ marginRight: 4 }}></i>Phòng {label} tạm
                      </div>
                      {groups.map((grp, gi) => {
                        const roomObj = pList.find(p => p.ma_phong === grp.phong);
                        const totalHs = grp.lops.reduce((sum, lop) => {
                          const stat = classSizeMap[lop] || { total: 0, nam: 0, nu: 0 };
                          if (label === 'NGỦ' && roomObj && roomObj.gioi_tinh !== null && roomObj.gioi_tinh !== undefined) {
                            return sum + (roomObj.gioi_tinh === 0 ? stat.nam : stat.nu);
                          }
                          return sum + stat.total;
                        }, 0);
                        const sucChua = roomObj?.suc_chua || 0;
                        const isOver = sucChua > 0 && totalHs > sucChua;
                        
                        return (
                        <div key={gi} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <select style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: 4, border: `1px solid ${grp.phong && groups.filter((g,i)=>i!==gi).some(g=>g.phong===grp.phong) ? '#ef4444' : '#d1d5db'}`, minWidth: 70 }}
                              value={grp.phong}
                              onChange={e => setGroups(prev => prev.map((g, i) => i === gi ? { ...g, phong: e.target.value } : g))}>
                              <option value="">-- Phòng --</option>
                                {pList.map(p => {
                                  const usedInOther = groups.some((g, i) => i !== gi && g.phong === p.ma_phong);
                                  let gioiTinhLabel = '';
                                  if (label === 'NGỦ' && p.gioi_tinh !== null && p.gioi_tinh !== undefined) {
                                    gioiTinhLabel = p.gioi_tinh === 0 ? ' (Nam)' : ' (Nữ)';
                                  }
                                  return (
                                    <option key={p.ma_phong} value={p.ma_phong} disabled={usedInOther}
                                      style={{ color: usedInOther ? '#94a3b8' : undefined }}>
                                      {p.ma_phong}{gioiTinhLabel}{usedInOther ? ' - đã dùng' : ''}
                                    </option>
                                  );
                                })}
                            </select>
                            {grp.phong && (
                              <div style={{ fontSize: '0.65rem', textAlign: 'center', fontWeight: 600, color: isOver ? '#ef4444' : '#059669', background: isOver ? '#fee2e2' : '#dcfce7', borderRadius: 4, padding: '1px 4px' }}>
                                {totalHs} / {sucChua} HS
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(specialLopSelected.length > 0 ? specialLopSelected : allLopList).map(lop => {
                              const sel = grp.lops.includes(lop);
                              const isUsedElsewhere = (() => {
                                const otherGroups = groups.filter((g, i) => i !== gi && g.lops.includes(lop));
                                if (otherGroups.length === 0) return false;
                                if (label === 'ĂN') return true; // Ăn chỉ được 1 nhóm
                                if (otherGroups.length >= 2) return true; // Ngủ tối đa 2 nhóm (Nam, Nữ)
                                
                                const thisRoom = pList.find(x => x.ma_phong === grp.phong);
                                const otherRoom = pList.find(x => x.ma_phong === otherGroups[0].phong);
                                
                                if (thisRoom && otherRoom && thisRoom.gioi_tinh !== null && otherRoom.gioi_tinh !== null) {
                                    if (thisRoom.gioi_tinh === otherRoom.gioi_tinh) return true; // Cùng giới tính -> cấm
                                }
                                return false;
                              })();
                              if (isUsedElsewhere) {
                                return (
                                  <label key={lop} title="Lớp này đã được gán ở nhóm khác" style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, cursor: 'not-allowed', fontSize: '0.73rem', fontWeight: 400, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#cbd5e1', opacity: 0.6 }}>
                                    <input type="checkbox" disabled checked={false} />
                                    {lop}
                                  </label>
                                );
                              }
                              return (
                                <label key={lop} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', fontSize: '0.73rem', fontWeight: sel ? 700 : 400, background: sel ? '#dcfce7' : '#f8fafc', border: `1px solid ${sel ? '#86efac' : '#e2e8f0'}`, color: sel ? '#166534' : '#64748b' }}>
                                  <input type="checkbox" checked={sel} style={{ accentColor: color }}
                                    onChange={e => setGroups(prev => prev.map((g, i) => i === gi
                                      ? { ...g, lops: e.target.checked ? [...g.lops, lop] : g.lops.filter(l => l !== lop) }
                                      : g))} />
                                  {lop}
                                </label>
                              );
                            })}
                          </div>
                          <button onClick={() => setGroups(prev => prev.filter((_, i) => i !== gi))}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '0.85rem' }} title="Xóa nhóm">
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                        );
                      })}
                      {/* Bó thêm nhóm nếu còn phòng trống */}
                      {(() => {
                        const usedRooms = groups.map(g => g.phong).filter(Boolean);
                        const availableRooms = pList.filter(p => !usedRooms.includes(p.ma_phong));
                        const allTaken = availableRooms.length === 0 && pList.length > 0;
                        return (
                          <button onClick={() => setGroups(prev => [...prev, { phong: '', lops: [] }])}
                            disabled={allTaken}
                            title={allTaken ? 'Tất cả phòng đã được sử dụng' : ''}
                            style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 4, border: '1px dashed #93c5fd', background: allTaken ? '#f8fafc' : '#eff6ff', color: allTaken ? '#94a3b8' : '#1d4ed8', cursor: allTaken ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            <i className="fas fa-plus"></i> Thêm nhóm {label}
                          </button>
                        );
                      })()}
                    </div>
                  ))}</div>
              </div>
              {/* Section: Upload Excel/CSV */}
              <div className="modal-body" style={{ paddingTop: 0 }}>
                <div style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
                  <i className="fas fa-file-excel" style={{ fontSize: '1.8rem', color: '#10b981', marginBottom: 8 }}></i>
                  <h4 style={{ margin: 0, marginBottom: 4, color: '#334155', fontSize: '0.95rem' }}>Tải lên file Excel/CSV</h4>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
                    Tự động tìm <strong>Tên Lớp</strong> hoặc <strong>Mã Học Sinh</strong> trong file để thêm vào cấu hình ngày đặc biệt.
                  </p>
                  <label style={{ display: 'inline-block', background: '#f59e0b', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}>
                    <i className="fas fa-upload"></i> Chọn file
                    <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        try {
                          const bstr = evt.target.result;
                          const wb = XLSX.read(bstr, { type: 'binary' });
                          const wsname = wb.SheetNames[0];
                          const ws = wb.Sheets[wsname];
                          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                          
                          const importedLops = new Set();
                          const importedHsIds = new Set();
                  
                          data.forEach(row => {
                            row.forEach(cell => {
                               if (typeof cell === 'string' || typeof cell === 'number') {
                                  const str = String(cell).trim();
                                  if (allLopList.includes(str)) importedLops.add(str);
                                  const isHs = allHsList.find(h => String(h.id) === str);
                                  if (isHs) importedHsIds.add(isHs);
                               }
                            });
                          });
                  
                          if (importedLops.size > 0) {
                              setSpecialLopSelected(prev => {
                                const s = new Set([...prev, ...importedLops]);
                                return [...s].sort();
                              });
                          }
                          if (importedHsIds.size > 0) {
                              setSpecialHsThemVao(prev => {
                                 const map = new Map(prev.map(p => [p.id, p]));
                                 importedHsIds.forEach(hs => {
                                   if (!map.has(hs.id)) {
                                      let pNgu = hs.phong_ngu || '';
                                      if (pNgu) {
                                         const roomObj = phongNguList.find(x => x.ma_phong === pNgu);
                                         if (roomObj && roomObj.gioi_tinh !== null && roomObj.gioi_tinh !== undefined && hs.gioi_tinh !== null && hs.gioi_tinh !== undefined && roomObj.gioi_tinh !== hs.gioi_tinh) {
                                            pNgu = '';
                                         }
                                      }
                                      map.set(hs.id, { id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, phong_an: hs.phong_an || '', phong_ngu: pNgu });
                                   }
                                 });
                                 return Array.from(map.values());
                              });
                          }
                          
                          let msg = [];
                          if (importedLops.size > 0) msg.push(`${importedLops.size} lớp`);
                          if (importedHsIds.size > 0) msg.push(`${importedHsIds.size} học sinh`);
                          
                          if (msg.length > 0) {
                              showAlert(`Đã nhập thành công: ${msg.join(', ')}`, 'success');
                          } else {
                              showAlert('Không tìm thấy dữ liệu hợp lệ (Lớp hoặc Mã HS) trong file', 'warning');
                          }
                        } catch (err) {
                          showAlert('Lỗi đọc file: ' + err.message, 'danger');
                        }
                      };
                      reader.readAsBinaryString(file);
                      e.target.value = '';
                    }} />
                  </label>
                </div>
              </div>
              </>)}

              {/* Tab: Từng HS */}
              {specialTab === 'hs' && (
                <div className="modal-body">
                  <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>
                    Gán phòng ăn/ngủ lẻ cho những học sinh đặc biệt hoặc tự động xé lẻ lớp vào phòng nếu quá sức chứa.
                  </p>
                  
                  {/* TỰ ĐỘNG PHÂN BỔ */}
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0369a1', marginBottom: 8 }}><i className="fas fa-magic" style={{ marginRight: 6 }}></i>TỰ ĐỘNG PHÂN BỔ (XÉ LẺ LỚP VÀO PHÒNG)</div>
                    <div style={{ fontSize: '0.75rem', color: '#0369a1', marginBottom: 4, fontWeight: 600 }}>1. Chọn các lớp cần phân bổ:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10, maxHeight: 80, overflowY: 'auto', border: '1px solid #bae6fd', padding: 6, borderRadius: 4, background: '#fff' }}>
                      {allLopList.map(lop => {
                         const sel = autoLops.includes(lop);
                         return (
                           <label key={lop} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: '0.73rem', background: sel ? '#dcfce7' : '#f1f5f9', border: `1px solid ${sel ? '#86efac' : '#e2e8f0'}`, fontWeight: sel ? 700 : 400, color: sel ? '#166534' : '#64748b' }}>
                             <input type="checkbox" checked={sel} onChange={e => setAutoLops(prev => e.target.checked ? [...prev, lop] : prev.filter(x => x !== lop))} style={{ accentColor: '#059669' }} />
                             {lop}
                           </label>
                         );
                      })}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#059669', marginBottom: 4, fontWeight: 600 }}>2. Chọn phòng ĂN (để tự điền):</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, border: '1px solid #a7f3d0', padding: 6, borderRadius: 4, background: '#fff' }}>
                          {phongAnList.map(p => {
                            const sel = autoPhongsAn.includes(p.ma_phong);
                            return (
                              <label key={p.ma_phong} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.73rem', cursor: 'pointer', background: sel ? '#d1fae5' : '#f1f5f9', padding: '2px 4px', borderRadius: 4, border: `1px solid ${sel ? '#34d399' : '#e2e8f0'}`, fontWeight: sel ? 600 : 400, color: sel ? '#065f46' : '#64748b' }}>
                                <input type="checkbox" checked={sel} onChange={e => setAutoPhongsAn(prev => e.target.checked ? [...prev, p.ma_phong] : prev.filter(x => x !== p.ma_phong))} style={{ accentColor: '#059669' }} />
                                {p.ma_phong}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6c5ce7', marginBottom: 4, fontWeight: 600 }}>3. Chọn phòng NGỦ (để tự điền):</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, border: '1px solid #ddd6fe', padding: 6, borderRadius: 4, background: '#fff' }}>
                          {phongNguList.map(p => {
                            const sel = autoPhongsNgu.includes(p.ma_phong);
                            return (
                              <label key={p.ma_phong} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.73rem', cursor: 'pointer', background: sel ? '#ede9fe' : '#f1f5f9', padding: '2px 4px', borderRadius: 4, border: `1px solid ${sel ? '#a78bfa' : '#e2e8f0'}`, fontWeight: sel ? 600 : 400, color: sel ? '#5b21b6' : '#64748b' }}>
                                <input type="checkbox" checked={sel} onChange={e => setAutoPhongsNgu(prev => e.target.checked ? [...prev, p.ma_phong] : prev.filter(x => x !== p.ma_phong))} style={{ accentColor: '#6c5ce7' }} />
                                {p.ma_phong}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <button onClick={() => {
                       if (autoLops.length === 0) return showAlert('Chưa chọn lớp nào!', 'warning');
                       if (autoPhongsAn.length === 0 && autoPhongsNgu.length === 0) return showAlert('Chưa chọn phòng nào!', 'warning');
                       
                       const hsToAssign = allHsList.filter(hs => autoLops.includes(hs.lop) && !derivedHsList.find(x => x.id === hs.id));
                       if (hsToAssign.length === 0) return showAlert('Không có học sinh nào của các lớp này (hoặc đã phân bổ hết rồi).', 'warning');
                       
                       let currentHsList = hsToAssign.map(hs => ({ ...hs }));
                       const toAdd = [];
                       
                       // Phân bổ phòng ăn
                       if (autoPhongsAn.length > 0) {
                          let hsIndex = 0;
                          for (const pMa of autoPhongsAn) {
                             const room = phongAnList.find(x => x.ma_phong === pMa);
                             // Nếu phòng đã có HS từ specialHsThemVao, ta phải trừ đi!
                             const currentOccupied = derivedHsList.filter(x => x.phong_an === pMa).length;
                             const max = room && room.suc_chua > 0 ? Math.max(0, room.suc_chua - currentOccupied) : 1000;
                             let count = 0;
                             while (count < max && hsIndex < currentHsList.length) {
                                currentHsList[hsIndex]._phong_an = pMa;
                                count++;
                                hsIndex++;
                             }
                             if (hsIndex >= currentHsList.length) break;
                          }
                          // Nếu vẫn còn dư học sinh, báo lỗi nhẹ?
                          if (hsIndex < currentHsList.length) {
                             showAlert(`Cảnh báo: Phòng ăn không đủ sức chứa cho ${currentHsList.length - hsIndex} học sinh còn lại!`, 'warning');
                          }
                       }
                       // Phân bổ phòng ngủ — phải kiểm tra giới tính
                       if (autoPhongsNgu.length > 0) {
                          // Gom HS theo giới tính để phân bổ đúng phòng
                          const namHS = currentHsList.filter(hs => hs.gioi_tinh === 0);
                          const nuHS = currentHsList.filter(hs => hs.gioi_tinh === 1);
                          const honHopHS = currentHsList.filter(hs => hs.gioi_tinh !== 0 && hs.gioi_tinh !== 1);

                          const assignToRooms = (hsList, rooms) => {
                             let hsIdx = 0;
                             for (const pMa of rooms) {
                                const room = phongNguList.find(x => x.ma_phong === pMa);
                                const currentOccupied = derivedHsList.filter(x => x.phong_ngu === pMa).length;
                                const max = room && room.suc_chua > 0 ? Math.max(0, room.suc_chua - currentOccupied) : 1000;
                                let count = 0;
                                while (count < max && hsIdx < hsList.length) {
                                   hsList[hsIdx]._phong_ngu = pMa;
                                   count++; hsIdx++;
                                }
                                if (hsIdx >= hsList.length) break;
                             }
                          };

                          const namRooms = autoPhongsNgu.filter(pMa => {
                             const r = phongNguList.find(x => x.ma_phong === pMa);
                             return !r || r.gioi_tinh === 0 || r.gioi_tinh === null || r.gioi_tinh === undefined;
                          });
                          const nuRooms = autoPhongsNgu.filter(pMa => {
                             const r = phongNguList.find(x => x.ma_phong === pMa);
                             return !r || r.gioi_tinh === 1 || r.gioi_tinh === null || r.gioi_tinh === undefined;
                          });

                          if (namHS.length > 0) assignToRooms(namHS, namRooms);
                          if (nuHS.length > 0) assignToRooms(nuHS, nuRooms);
                          if (honHopHS.length > 0) assignToRooms(honHopHS, autoPhongsNgu);

                          const unassignedNgu = currentHsList.filter(hs => !hs._phong_ngu);
                          if (unassignedNgu.length > 0) {
                             showAlert(`⚠️ Có ${unassignedNgu.length} học sinh không được phân bổ phòng ngủ do không có phòng phù hợp giới tính hoặc phòng đã đầy!`, 'warning');
                          }
                       }
                       
                       currentHsList.forEach(hs => {
                          if (hs._phong_an || hs._phong_ngu) {
                             toAdd.push({
                                id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop,
                                phong_an: hs._phong_an || '',
                                phong_ngu: hs._phong_ngu || ''
                             });
                          }
                       });
                       setSpecialHsThemVao(prev => [...toAdd, ...prev]);
                       setAutoLops([]); setAutoPhongsAn([]); setAutoPhongsNgu([]);
                       showAlert(`Đã tự động phân bổ ${toAdd.length} học sinh thành công!`, 'success');
                    }} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <i className="fas fa-magic"></i> Chạy phân bổ tự động
                    </button>
                  </div>
                  
                  {/* TÌM KIẾM THỦ CÔNG */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: 8 }}><i className="fas fa-search" style={{ marginRight: 6 }}></i>TÌM KIẾM HỌC SINH THỦ CÔNG (TRƯỜNG HỢP ĐẶC BIỆT)</div>
                    <div style={{ position: 'relative' }}>
                      <i className="fas fa-search" style={{ position: 'absolute', top: 9, left: 10, color: '#94a3b8', fontSize: '0.9rem' }}></i>
                      <input type="text" className="form-control" style={{ paddingLeft: 32, fontSize: '0.85rem' }}
                        placeholder="Nhập tên, mã HS hoặc lớp..."
                        value={hsSearchTerm} onChange={e => setHsSearchTerm(e.target.value)} />
                    </div>
                    {hsSearchTerm && (() => {
                      const removeAccents = (str) => {
                        return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D') : '';
                      };
                      const q = removeAccents(hsSearchTerm.toLowerCase());
                      const filtered = allHsList.filter(hs => 
                        !derivedHsList.find(x => x.id === hs.id) &&
                        (removeAccents(hs.ho_ten || '').toLowerCase().includes(q) || removeAccents(hs.lop || '').toLowerCase().includes(q))
                      ).slice(0, 10);
                      return (
                        <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff' }}>
                          {filtered.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>Không tìm thấy...</div>
                          ) : filtered.map(hs => (
                            <div key={hs.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: hsAssignPicker?.hs?.id === hs.id ? '#f0fdf4' : '#fff' }}
                              onClick={() => setHsAssignPicker({ hs, phong_an: '', phong_ngu: '' })}>
                              <div style={{ fontSize: '0.82rem' }}><span style={{ fontWeight: 600 }}>{hs.ho_ten}</span> <span style={{ color: '#64748b' }}>({hs.lop})</span></div>
                              {hsAssignPicker?.hs?.id !== hs.id && <button style={{ border: 'none', background: '#e0e7ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}><i className="fas fa-plus"></i> Chọn</button>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    
                    {hsAssignPicker && (
                      <div style={{ marginTop: 8, padding: '10px', background: '#fef9c3', border: '1.5px solid #fbbf24', borderRadius: 6, fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: '#92400e' }}>
                          ✏️ Gán phòng cho: {hsAssignPicker.hs.ho_ten} ({hsAssignPicker.hs.lop})
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', marginBottom: 3 }}>Phòng ĂN</div>
                            <select className="form-select" style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                              value={hsAssignPicker.phong_an} onChange={e => setHsAssignPicker(prev => ({...prev, phong_an: e.target.value}))}>
                              <option value="">(Phòng cố định)</option>
                              {phongAnList.map(p => <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c5ce7', marginBottom: 3 }}>Phòng NGỦ</div>
                            {phongNguList.some(p => p.gioi_tinh !== null && p.gioi_tinh !== undefined) && (
                              <div style={{ fontSize: '0.68rem', color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '2px 6px', marginBottom: 4 }}>
                                <i className="fas fa-venus-mars"></i> HS {hsAssignPicker.hs.gioi_tinh === 0 ? 'Nam' : 'Nữ'} — chỉ hiển thị phòng phù hợp giới tính
                              </div>
                            )}
                            <select className="form-select" style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                              value={hsAssignPicker.phong_ngu} onChange={e => setHsAssignPicker(prev => ({...prev, phong_ngu: e.target.value}))}>
                              <option value="">(Phòng cố định)</option>
                              {phongNguList.filter(p => isPhongNguCompatible(p, hsAssignPicker.hs)).map(p => (
                                <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong} ({p.gioi_tinh === 0 ? 'Nam' : p.gioi_tinh === 1 ? 'Nữ' : 'Hỗn hợp'})</option>
                              ))}
                            </select>
                          </div>
                          <button onClick={() => {
                            if (!hsAssignPicker.phong_an && !hsAssignPicker.phong_ngu) {
                                showAlert('Vui lòng chọn ít nhất 1 phòng!', 'warning'); return;
                            }
                            setSpecialHsThemVao(prev => [{ id: hsAssignPicker.hs.id, ho_ten: hsAssignPicker.hs.ho_ten, lop: hsAssignPicker.hs.lop, phong_an: hsAssignPicker.phong_an, phong_ngu: hsAssignPicker.phong_ngu }, ...prev]);
                            setHsAssignPicker(null);
                            setHsSearchTerm('');
                          }} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                            <i className="fas fa-check"></i> Thêm vào DS
                          </button>
                          <button onClick={() => setHsAssignPicker(null)} style={{ background: 'none', color: '#64748b', border: 'none', padding: '5px 8px', cursor: 'pointer', fontSize: '0.85rem' }}><i className="fas fa-times"></i> Hủy</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {derivedHsList.length > 0 ? (
                    <div style={{ marginTop: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>DANH SÁCH HỌC SINH ({derivedHsList.length} HS):</div>
                      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {derivedHsList.map(x => (
                          <div key={x.id}>
                            {/* Hàng hiển thị */}
                            {editingHsId !== x.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: '0.82rem' }}>
                                <span style={{ flex: 1, fontWeight: 600 }}>{x.ho_ten}</span>
                                <span style={{ color: '#64748b', fontSize: '0.73rem' }}>{x.lop}</span>
                                {x.phong_an && <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>🍽 {x.phong_an}</span>}
                                {x.phong_ngu && <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>🛏 {x.phong_ngu}</span>}
                                <button onClick={() => setEditingHsId(x.id)}
                                  style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', padding: '0 4px', fontSize: '0.82rem' }} title="Chỉnh sửa phòng">
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button onClick={() => {
                                  // Để xóa 1 HS (kể cả từ class), ta set override phong_an và phong_ngu thành rỗng
                                  setSpecialHsThemVao(prev => {
                                    const ex = prev.find(h => h.id === x.id);
                                    if (ex) return prev.map(h => h.id === x.id ? { ...h, phong_an: '', phong_ngu: '' } : h);
                                    return [...prev, { id: x.id, ho_ten: x.ho_ten, lop: x.lop, phong_an: '', phong_ngu: '' }];
                                  });
                                }}
                                  style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', fontSize: '0.9rem' }} title="Xóa khỏi danh sách">
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            ) : (
                              /* Inline editor phòng */
                              <div style={{ padding: '8px 10px', background: '#fef9c3', border: '1.5px solid #fbbf24', borderRadius: 6, fontSize: '0.82rem' }}>
                                <div style={{ fontWeight: 700, marginBottom: 6, color: '#92400e' }}>
                                  ✏️ Gán phòng cho: {x.ho_ten} <span style={{ fontWeight: 400, color: '#64748b' }}>({x.lop})</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', marginBottom: 3 }}>
                                      <i className="fas fa-utensils" style={{ marginRight: 3 }}></i>Phòng ĂN
                                    </div>
                                    <select className="form-select" style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                                      value={x.phong_an || ''}
                                      onChange={e => setSpecialHsThemVao(prev => prev.map(h => h.id === x.id ? { ...h, phong_an: e.target.value } : h))}>
                                      <option value="">(Dùng phòng cố định)</option>
                                      {phongAnList.map(p => <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c5ce7', marginBottom: 3 }}>
                                      <i className="fas fa-bed" style={{ marginRight: 3 }}></i>Phòng NGỦ
                                    </div>
                                    {(() => {
                                      const hsObj = allHsList.find(h => h.id === x.id) || x;
                                      const compatible = phongNguList.filter(p => isPhongNguCompatible(p, hsObj));
                                      return (<>
                                        {compatible.length < phongNguList.length && (
                                          <div style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fee2e2', borderRadius: 3, padding: '1px 5px', marginBottom: 3 }}>
                                            <i className="fas fa-venus-mars"></i> HS {hsObj.gioi_tinh === 0 ? 'Nam' : 'Nữ'} — chỉ hiển thị phòng phù hợp
                                          </div>
                                        )}
                                        <select className="form-select" style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                                          value={x.phong_ngu || ''}
                                          onChange={e => setSpecialHsThemVao(prev => prev.map(h => h.id === x.id ? { ...h, phong_ngu: e.target.value } : h))}>
                                          <option value="">(Dùng phòng cố định)</option>
                                          {compatible.map(p => (
                                            <option key={p.ma_phong} value={p.ma_phong}>{p.ma_phong} ({p.gioi_tinh === 0 ? 'Nam' : p.gioi_tinh === 1 ? 'Nữ' : 'Hỗn hợp'})</option>
                                          ))}
                                        </select>
                                      </>);
                                    })()}
                                  </div>
                                  </div>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button onClick={() => setEditingHsId(null)}
                                    style={{ fontSize: '0.78rem', padding: '3px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
                                    <i className="fas fa-check"></i> Xong
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', width: '100%', textAlign: 'center', fontStyle: 'italic', padding: 10 }}>Chưa có học sinh nào</p>
                  )}
                </div>
              )}

              {/* Ghi chú + footer */}
              <div className="modal-body" style={{ paddingTop: 8 }}>
                <input type="text" className="form-control" placeholder="Ghi chú (vd: Tổng kết học kỳ khối 12...)"
                  value={specialGhiChu} onChange={e => setSpecialGhiChu(e.target.value)}
                  style={{ marginBottom: 10, fontSize: '0.83rem' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setSpecialDayModal(null)}>Hủy</button>
                  <button className="btn btn-danger btn-sm" disabled={specialSaving} onClick={async () => { 
                    if (window.confirm('Bạn có chắc muốn xóa toàn bộ cấu hình ngày này (trả về phòng bình thường)?')) {
                      try {
                        setSpecialSaving(true);
                        await api.post('/api/cauhinh-ngay/delete/', { ngay: specialDayModal.ngay });
                        showAlert('Đã xóa cấu hình, ngày này trở về bình thường', 'success');
                        setSpecialDayModal(null);
                        await loadWeek(weekStart);
                      } catch (err) {
                        showAlert('Lỗi xóa cấu hình: ' + err.message, 'danger');
                      } finally { setSpecialSaving(false); }
                    }
                  }}>
                    <i className="fas fa-trash"></i> Xóa cấu hình
                  </button>
                  <button className="btn btn-primary" onClick={saveSpecialDay} disabled={specialSaving}
                    style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>
                    {specialSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Lưu
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ─── Modal Xác nhận xóa phân công ─── */}
      {confirmDelete && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ padding: '24px 16px 16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🗑️</div>
              <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>Xác nhận xóa phân công</h3>
              <p style={{ color: '#64748b', marginBottom: 20, fontSize: '0.85rem' }}>Thao tác này không thể hoàn tác.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Hủy</button>
                <button className="btn btn-danger" onClick={doDelete}><i className="fas fa-trash"></i> Xóa</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Xác nhận đánh dấu Nghỉ ─── */}
      {confirmClearDay && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ padding: '24px 16px 16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🚫</div>
              <h3 style={{ marginBottom: 6, fontSize: '1rem' }}>Đánh dấu ngày nghỉ bán trú</h3>
              <p style={{ color: '#64748b', marginBottom: 8, fontSize: '0.85rem' }}>
                Xóa <strong>toàn bộ</strong> lịch phân công ngày
              </p>
              <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '1rem', marginBottom: 20 }}>
                {toDateStr(confirmClearDay)}
              </p>
              <p style={{ color: '#64748b', marginBottom: 20, fontSize: '0.8rem' }}>Thao tác này không thể hoàn tác.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmClearDay(null)}>Hủy</button>
                <button className="btn btn-danger" onClick={doClearDay}><i className="fas fa-ban"></i> Đánh dấu Nghỉ</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
