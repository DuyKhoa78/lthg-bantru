import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { useAlert } from '../hooks/useAlert';
import { removeAccents } from '../utils/stringUtils';
import '../styles/admin.css';
import '../pages/nghiepvu/DiemDanh.css';

const QUICK_REASONS = [
    'Nghỉ ốm / Bị bệnh',
    'Gia đình có việc',
    'Đi khám bệnh',
    'Thi HSG / Hoạt động trường',
    'Phụ huynh đón về sớm',
];

const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

export default function BaoPhepModal({
    open,
    onClose,
    defaultDate,
    defaultLoai = 'ca_ngay',
    onSuccess,
    students = [],
}) {
    const { showAlert, AlertUI } = useAlert();
    const [activeTab, setActiveTab] = useState('record'); // 'record' | 'list'

    // Form states
    const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
    const [startDate, setStartDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
    const [ca, setCa] = useState(defaultLoai); // 'an' | 'ngu' | 'ca_ngay'
    const [ghiChu, setGhiChu] = useState('');

    // Students state
    const [allStudents, setAllStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [selectedHsIds, setSelectedHsIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [filterLop, setFilterLop] = useState('');

    // Absences list state
    const [listDate, setListDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
    const [phepList, setPhepList] = useState([]);
    const [loadingList, setLoadingList] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [cancellingId, setCancellingId] = useState(null);

    // Sync defaultDate when modal opens
    useEffect(() => {
        if (open) {
            const d = defaultDate || new Date().toISOString().split('T')[0];
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setStartDate(d);
            setEndDate(d);
            setListDate(d);
            setCa(defaultLoai || 'ca_ngay');
            setSelectedHsIds(new Set());
            setGhiChu('');
            setActiveTab('record');
        }
    }, [open, defaultDate, defaultLoai]);

    // Load students (use prop if available, also fetch all students)
    useEffect(() => {
        if (!open) return;
        if (allStudents.length === 0 && students && students.length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAllStudents(students);
        }
        if (allStudents.length > 0) return;

        setLoadingStudents(true);
        api.get('/api/hocsinh/all')
            .then(res => {
                if (res.data?.ok && res.data.hocsinh?.length > 0) {
                    setAllStudents(res.data.hocsinh);
                }
            })
            .catch(err => {
                console.error('Lỗi tải danh sách học sinh:', err);
                if (!students || students.length === 0) {
                    showAlert('Không thể tải danh sách học sinh', 'error');
                }
            })
            .finally(() => setLoadingStudents(false));
    }, [open, allStudents.length, students, showAlert]);

    // Extract unique classes
    const classList = useMemo(() => {
        const classes = new Set();
        allStudents.forEach(s => { if (s.lop) classes.add(s.lop); });
        return Array.from(classes).sort();
    }, [allStudents]);

    // Filter students for search dropdown/list
    const filteredStudents = useMemo(() => {
        const query = removeAccents(searchQuery.toLowerCase().trim());
        return allStudents.filter(s => {
            if (filterLop && s.lop !== filterLop) return false;
            if (!query) return true;
            const nameMatch = removeAccents((s.ho_ten || '').toLowerCase()).includes(query);
            const idMatch = String(s.id).includes(query);
            const lopMatch = (s.lop || '').toLowerCase().includes(query);
            return nameMatch || idMatch || lopMatch;
        });
    }, [allStudents, filterLop, searchQuery]);

    // Selected students objects
    const selectedStudents = useMemo(() => {
        return allStudents.filter(s => selectedHsIds.has(s.id));
    }, [allStudents, selectedHsIds]);

    const toggleStudent = (id) => {
        setSelectedHsIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedHsIds(prev => {
            const next = new Set(prev);
            filteredStudents.forEach(s => next.add(s.id));
            return next;
        });
    };

    // Load existing excused absence list
    const fetchPhepList = useCallback((targetDate) => {
        setLoadingList(true);
        api.get(`/api/diemdanh/danh-sach-phep/?ngay=${targetDate}`)
            .then(res => {
                if (res.data?.ok) {
                    setPhepList(res.data.list || []);
                }
            })
            .catch(err => {
                console.error('Lỗi tải danh sách báo phép:', err);
            })
            .finally(() => setLoadingList(false));
    }, []);

    useEffect(() => {
        if (open && activeTab === 'list') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchPhepList(listDate);
        }
    }, [open, activeTab, listDate, fetchPhepList]);

    // Submit handler
    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (selectedHsIds.size === 0) {
            return showAlert('Vui lòng chọn ít nhất 1 học sinh cần báo vắng phép!', 'warning');
        }
        if (!startDate) {
            return showAlert('Vui lòng chọn ngày bắt đầu!', 'warning');
        }
        if (dateMode === 'range' && !endDate) {
            return showAlert('Vui lòng chọn ngày kết thúc!', 'warning');
        }
        if (dateMode === 'range' && startDate > endDate) {
            return showAlert('Ngày bắt đầu không được lớn hơn ngày kết thúc!', 'warning');
        }

        setSubmitting(true);
        try {
            const payload = {
                ma_hs_list: Array.from(selectedHsIds),
                tu_ngay: startDate,
                den_ngay: dateMode === 'range' ? endDate : startDate,
                ca,
                ghi_chu: ghiChu.trim() || null,
            };

            const res = await api.post('/api/diemdanh/bao-phep-truoc/', payload);
            if (res.data?.ok) {
                showAlert(res.data.message || 'Đã ghi nhận vắng phép thành công!', 'success');
                setSelectedHsIds(new Set());
                setGhiChu('');
                onSuccess?.();
                // Chuyển sang xem danh sách để người dùng an tâm
                setListDate(startDate);
                setActiveTab('list');
                fetchPhepList(startDate);
            } else {
                showAlert(res.data?.error || 'Có lỗi xảy ra', 'error');
            }
        } catch (err) {
            showAlert(err.response?.data?.error || 'Không thể lưu vắng phép', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Cancel absence handler
    const handleCancelPhep = async (item) => {
        if (!window.confirm(`Bạn có chắc muốn hủy vắng phép cho học sinh ${item.hoc_sinh?.ho_ten || item.ma_hs_id}?`)) {
            return;
        }
        setCancellingId(item.id);
        try {
            const res = await api.post('/api/diemdanh/huy-phep/', {
                ma_hs_id: item.ma_hs_id,
                ngay: item.ngay,
                ca: 'ca_ngay',
            });
            if (res.data?.ok) {
                showAlert('Đã hủy vắng phép thành công!', 'success');
                fetchPhepList(listDate);
                onSuccess?.();
            } else {
                showAlert(res.data?.error || 'Lỗi khi hủy vắng phép', 'error');
            }
        } catch (err) {
            showAlert(err.response?.data?.error || 'Lỗi khi kết nối server', 'error');
        } finally {
            setCancellingId(null);
        }
    };

    if (!open) return null;

    return (
        <>
            {AlertUI}
            <div className="modal-overlay open" style={{ zIndex: 99999 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <div className="modal-box" style={{ maxWidth: 840, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', borderRadius: 16 }}>
                    
                    {/* Header */}
                <div style={{
                    padding: '16px 22px',
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #009CFF 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.25rem'
                        }}>
                            <i className="fas fa-calendar-check"></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                                Báo vắng phép trước cho Học sinh
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
                                Ghi nhận lịch nghỉ phép không làm xáo trộn điểm danh của các bạn khác trong phòng
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                            fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                    padding: '0 20px'
                }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('record')}
                        style={{
                            padding: '12px 18px', border: 'none', background: 'none',
                            fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            color: activeTab === 'record' ? '#009CFF' : '#64748b',
                            borderBottom: activeTab === 'record' ? '3px solid #009CFF' : '3px solid transparent',
                            display: 'inline-flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <i className="fas fa-edit"></i> Ghi nhận vắng phép
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('list')}
                        style={{
                            padding: '12px 18px', border: 'none', background: 'none',
                            fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            color: activeTab === 'list' ? '#009CFF' : '#64748b',
                            borderBottom: activeTab === 'list' ? '3px solid #009CFF' : '3px solid transparent',
                            display: 'inline-flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <i className="fas fa-list-check"></i> Danh sách đã báo phép
                    </button>
                </div>

                {/* Body Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#fff' }}>
                    {activeTab === 'record' ? (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            
                            {/* BƯỚC 1: CHỌN HỌC SINH */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <label style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#009CFF', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>1</span>
                                        Chọn học sinh xin phép ({selectedHsIds.size} em đã chọn)
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {filteredStudents.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={selectAllFiltered}
                                                style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Chọn tất cả ({filteredStudents.length})
                                            </button>
                                        )}
                                        {selectedHsIds.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedHsIds(new Set())}
                                                style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Bỏ chọn hết
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Chips of selected students */}
                                {selectedStudents.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, maxHeight: 90, overflowY: 'auto', padding: 6, background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 8 }}>
                                        {selectedStudents.map(s => (
                                            <span
                                                key={s.id}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                                                    padding: '3px 8px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600
                                                }}
                                            >
                                                <strong>{s.id}</strong> - {s.ho_ten} ({s.lop})
                                                <i
                                                    className="fas fa-times"
                                                    style={{ cursor: 'pointer', opacity: 0.7 }}
                                                    onClick={() => toggleStudent(s.id)}
                                                    title="Bỏ chọn"
                                                ></i>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Filter & Search bar */}
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 12 }}>
                                    <select
                                        value={filterLop}
                                        onChange={e => setFilterLop(e.target.value)}
                                        style={{ height: 38, borderRadius: 8, border: '1.5px solid #cbd5e1', padding: '0 10px', fontSize: '0.85rem', fontWeight: 600 }}
                                    >
                                        <option value="">Tất cả các lớp</option>
                                        {classList.map(l => (
                                            <option key={l} value={l}>Lớp {l}</option>
                                        ))}
                                    </select>
                                    <div style={{ position: 'relative' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                        <input
                                            type="text"
                                            placeholder="Gõ tên học sinh hoặc mã số bán trú để tìm kiếm..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            style={{
                                                width: '100%', height: 38, borderRadius: 8,
                                                border: '1.5px solid #cbd5e1', padding: '0 32px 0 34px',
                                                fontSize: '0.88rem'
                                            }}
                                        />
                                        {searchQuery && (
                                            <i
                                                className="fas fa-times-circle"
                                                style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8', cursor: 'pointer' }}
                                                onClick={() => setSearchQuery('')}
                                            ></i>
                                        )}
                                    </div>
                                </div>

                                {/* Student Checklist Box */}
                                <div style={{
                                    maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0',
                                    borderRadius: 8, background: '#fff'
                                }}>
                                    {loadingStudents ? (
                                        <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                                            <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Đang tải học sinh...
                                        </div>
                                    ) : filteredStudents.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: '0.88rem' }}>
                                            Không tìm thấy học sinh nào phù hợp
                                        </div>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                                                    <th style={{ width: 40, padding: '6px 8px', textAlign: 'center' }}></th>
                                                    <th style={{ width: 70, padding: '6px 8px', textAlign: 'center' }}>Mã BT</th>
                                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Họ và tên</th>
                                                    <th style={{ width: 80, padding: '6px 8px', textAlign: 'center' }}>Lớp</th>
                                                    <th style={{ width: 90, padding: '6px 8px', textAlign: 'center' }}>P.Ăn</th>
                                                    <th style={{ width: 90, padding: '6px 8px', textAlign: 'center' }}>P.Ngủ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredStudents.map(s => {
                                                    const isChecked = selectedHsIds.has(s.id);
                                                    return (
                                                        <tr
                                                            key={s.id}
                                                            onClick={() => toggleStudent(s.id)}
                                                            style={{
                                                                cursor: 'pointer',
                                                                background: isChecked ? '#fffbeb' : '#fff',
                                                                borderBottom: '1px solid #f1f5f9',
                                                                transition: 'background 0.1s'
                                                            }}
                                                        >
                                                            <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    readOnly
                                                                    style={{ cursor: 'pointer', width: 16, height: 16, pointerEvents: 'none' }}
                                                                />
                                                            </td>
                                                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#c00', padding: '6px 8px' }}>{s.id}</td>
                                                            <td style={{ fontWeight: 600, color: '#1e293b', padding: '6px 8px' }}>{s.ho_ten}</td>
                                                            <td style={{ textAlign: 'center', padding: '6px 8px' }}>{s.lop}</td>
                                                            <td style={{ textAlign: 'center', color: '#0369a1', fontWeight: 500, padding: '6px 8px' }}>{s.phong_an || '—'}</td>
                                                            <td style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 500, padding: '6px 8px' }}>{s.phong_ngu || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* BƯỚC 2 & 3: THỜI GIAN VÀ CA VẮNG */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                
                                {/* Thời gian */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <label style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#009CFF', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>2</span>
                                        Thời gian vắng phép
                                    </label>
                                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                                            <input type="radio" name="dateMode" checked={dateMode === 'single'} onChange={() => setDateMode('single')} />
                                            1 ngày
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                                            <input type="radio" name="dateMode" checked={dateMode === 'range'} onChange={() => setDateMode('range')} />
                                            Nhiều ngày (Khoảng ngày)
                                        </label>
                                    </div>

                                    {dateMode === 'single' ? (
                                        <div>
                                            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Chọn ngày xin nghỉ:</span>
                                            <div className="dd-date-input-wrapper" onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch { /* unsupported */ } } }}>
                                                <span className="dd-date-display">{fmtDate(startDate)}</span>
                                                <i className="far fa-calendar-alt dd-date-icon"></i>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={e => setStartDate(e.target.value)}
                                                    className="dd-date-native-input"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <div>
                                                <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Từ ngày:</span>
                                                <div className="dd-date-input-wrapper" onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch { /* unsupported */ } } }}>
                                                    <span className="dd-date-display" style={{ fontSize: '0.85rem' }}>{fmtDate(startDate)}</span>
                                                    <i className="far fa-calendar-alt dd-date-icon" style={{ fontSize: '0.85rem' }}></i>
                                                    <input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={e => setStartDate(e.target.value)}
                                                        className="dd-date-native-input"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Đến ngày:</span>
                                                <div className="dd-date-input-wrapper" onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch { /* unsupported */ } } }}>
                                                    <span className="dd-date-display" style={{ fontSize: '0.85rem' }}>{fmtDate(endDate)}</span>
                                                    <i className="far fa-calendar-alt dd-date-icon" style={{ fontSize: '0.85rem' }}></i>
                                                    <input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={e => setEndDate(e.target.value)}
                                                        className="dd-date-native-input"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Ca vắng */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <label style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#009CFF', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>3</span>
                                        Buổi vắng phép (Ca)
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <label
                                            onClick={() => setCa('ca_ngay')}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                borderRadius: 8, cursor: 'pointer',
                                                border: ca === 'ca_ngay' ? '2px solid #009CFF' : '1px solid #cbd5e1',
                                                background: ca === 'ca_ngay' ? '#e0f2fe' : '#fff',
                                                fontWeight: 700, fontSize: '0.88rem', color: ca === 'ca_ngay' ? '#0369a1' : '#334155'
                                            }}
                                        >
                                            <input type="radio" name="ca" checked={ca === 'ca_ngay'} onChange={() => setCa('ca_ngay')} />
                                            <span>🍱 Cả ngày (Ăn trưa + Ngủ trưa)</span>
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <label
                                                onClick={() => setCa('an')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                                    borderRadius: 8, cursor: 'pointer',
                                                    border: ca === 'an' ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                                                    background: ca === 'an' ? '#fef3c7' : '#fff',
                                                    fontWeight: 600, fontSize: '0.85rem', color: ca === 'an' ? '#b45309' : '#334155'
                                                }}
                                            >
                                                <input type="radio" name="ca" checked={ca === 'an'} onChange={() => setCa('an')} />
                                                <span>🍽️ Chỉ ca Ăn</span>
                                            </label>
                                            <label
                                                onClick={() => setCa('ngu')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                                    borderRadius: 8, cursor: 'pointer',
                                                    border: ca === 'ngu' ? '2px solid #8b5cf6' : '1px solid #cbd5e1',
                                                    background: ca === 'ngu' ? '#ede9fe' : '#fff',
                                                    fontWeight: 600, fontSize: '0.85rem', color: ca === 'ngu' ? '#6d28d9' : '#334155'
                                                }}
                                            >
                                                <input type="radio" name="ca" checked={ca === 'ngu'} onChange={() => setCa('ngu')} />
                                                <span>🛏️ Chỉ ca Ngủ</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BƯỚC 4: LÝ DO / GHI CHÚ */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                <label style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#009CFF', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>4</span>
                                    Lý do nghỉ / Ghi chú (tùy chọn)
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {QUICK_REASONS.map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setGhiChu(r)}
                                            style={{
                                                fontSize: '0.78rem', background: ghiChu === r ? '#e2e8f0' : '#fff',
                                                border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 8px',
                                                cursor: 'pointer', color: '#475569', fontWeight: 500
                                            }}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Nhập lý do nghỉ phép của học sinh..."
                                    value={ghiChu}
                                    onChange={e => setGhiChu(e.target.value)}
                                    style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #cbd5e1', padding: '0 12px', fontSize: '0.88rem' }}
                                />
                            </div>

                            {/* Nút Submit */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={onClose}
                                    disabled={submitting}
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={submitting || selectedHsIds.size === 0}
                                    style={{ minWidth: 200, fontWeight: 700 }}
                                >
                                    {submitting ? (
                                        <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i> Đang lưu...</>
                                    ) : (
                                        <><i className="fas fa-check-circle" style={{ marginRight: 6 }}></i> Xác nhận báo vắng phép ({selectedHsIds.size})</>
                                    )}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* TAB 2: DANH SÁCH ĐÃ BÁO PHÉP */
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#475569', margin: 0 }}>Xem ngày:</label>
                                    <div className="dd-date-input-wrapper" style={{ width: 160 }} onClick={(e) => { const inp = e.currentTarget.querySelector('input[type="date"]'); if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch { /* unsupported */ } } }}>
                                        <span className="dd-date-display" style={{ fontSize: '0.88rem' }}>{fmtDate(listDate)}</span>
                                        <i className="far fa-calendar-alt dd-date-icon" style={{ fontSize: '0.88rem' }}></i>
                                        <input
                                            type="date"
                                            value={listDate}
                                            onChange={e => setListDate(e.target.value)}
                                            className="dd-date-native-input"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        onClick={() => fetchPhepList(listDate)}
                                        disabled={loadingList}
                                    >
                                        <i className={`fas fa-sync-alt ${loadingList ? 'fa-spin' : ''}`}></i> Làm mới
                                    </button>
                                </div>
                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                    Tổng cộng: <strong style={{ color: '#d97706' }}>{phepList.length}</strong> học sinh vắng phép
                                </span>
                            </div>

                            {loadingList ? (
                                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                                    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#009CFF', marginBottom: 12 }}></i>
                                    <p>Đang tải danh sách vắng phép...</p>
                                </div>
                            ) : phepList.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>
                                    <i className="fas fa-user-check" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
                                    <h4 style={{ color: '#475569', margin: '0 0 6px' }}>Chưa có học sinh nào báo vắng phép</h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem' }}>Không có học sinh nào xin nghỉ phép trong ngày {listDate}.</p>
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                                                <th style={{ width: 45, padding: '10px 8px', textAlign: 'center' }}>STT</th>
                                                <th style={{ width: 75, padding: '10px 8px', textAlign: 'center' }}>Mã BT</th>
                                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Họ và tên</th>
                                                <th style={{ width: 80, padding: '10px 8px', textAlign: 'center' }}>Lớp</th>
                                                <th style={{ width: 85, padding: '10px 8px', textAlign: 'center' }}>P.Ăn</th>
                                                <th style={{ width: 85, padding: '10px 8px', textAlign: 'center' }}>P.Ngủ</th>
                                                <th style={{ width: 110, padding: '10px 8px', textAlign: 'center' }}>Ca vắng</th>
                                                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Lý do / Ghi chú</th>
                                                <th style={{ width: 80, padding: '10px 8px', textAlign: 'center' }}>Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {phepList.map((item, idx) => {
                                                const hs = item.hoc_sinh;
                                                const isAnPhep = item.diem_danh_an === 2;
                                                const isNguPhep = item.diem_danh_ngu === 2;
                                                const caLabel = (isAnPhep && isNguPhep)
                                                    ? 'Cả ngày (Ăn + Ngủ)'
                                                    : isAnPhep
                                                    ? 'Ăn trưa'
                                                    : 'Nghỉ trưa';

                                                return (
                                                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ textAlign: 'center', padding: '10px 8px', color: '#64748b' }}>{idx + 1}</td>
                                                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#c00', padding: '10px 8px' }}>{item.ma_hs_id}</td>
                                                        <td style={{ fontWeight: 600, color: '#1e293b', padding: '10px 8px' }}>{hs?.ho_ten || 'Học sinh #' + item.ma_hs_id}</td>
                                                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>{hs?.lop || '—'}</td>
                                                        <td style={{ textAlign: 'center', color: '#0369a1', padding: '10px 8px' }}>{hs?.phong_an || '—'}</td>
                                                        <td style={{ textAlign: 'center', color: '#7c3aed', padding: '10px 8px' }}>{hs?.phong_ngu || '—'}</td>
                                                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                                                            <span style={{
                                                                background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309',
                                                                padding: '2px 8px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700
                                                            }}>
                                                                {caLabel}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 8px', color: '#475569', fontStyle: item.ghi_chu ? 'normal' : 'italic' }}>
                                                            {item.ghi_chu || 'Không có ghi chú'}
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCancelPhep(item)}
                                                                disabled={cancellingId === item.id}
                                                                title="Hủy vắng phép nếu học sinh đi học"
                                                                style={{
                                                                    background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626',
                                                                    borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '0.78rem',
                                                                    fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                                                                }}
                                                            >
                                                                {cancellingId === item.id ? (
                                                                    <i className="fas fa-spinner fa-spin"></i>
                                                                ) : (
                                                                    <><i className="fas fa-undo"></i> Hủy</>
                                                                )}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Nút đóng ở Tab 2 */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={onClose}
                                    style={{ fontWeight: 700, padding: '8px 22px' }}
                                >
                                    <i className="fas fa-check" style={{ marginRight: 6 }}></i> Hoàn tất / Đóng
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
}
