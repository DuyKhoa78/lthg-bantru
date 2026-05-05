'use strict';
/* ── GIAOVIEN.JS – Quản lý giáo viên + Lịch rảnh buổi trưa (T2–T6) ── */

// lich_ranh: mảng 5 boolean [T2,T3,T4,T5,T6] – true = rảnh buổi trưa hôm đó
// Thứ 5 (index 3): mặc định false (nghỉ), chỉ bật khi có dạy bù
// Thứ 7, Chủ nhật: không áp dụng (không đi trực)
let GV_DATA = window.GV_DATA || [];
let nextGvId = 1;
let editingGvId   = null;
let editingRanhId = null;
let ranhTemp      = Array(5).fill(false);

// Thứ 5 (index 3) = ngày nghỉ mặc định, chỉ bật khi dạy bù
const DAYS         = ['T2',    'T3',    'T4',    'T5',         'T6'   ];
const DAYS_FULL    = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5',      'Thứ 6'];
const DAY_IS_SPECIAL = [false, false, false, true, false]; // index 3 = Thứ 5

let gvModal, ranhModal, gvDetailModal;

document.addEventListener('DOMContentLoaded', () => {
    gvModal   = new Modal('gvModal');
    ranhModal = new Modal('ranhModal');
    gvDetailModal = new Modal('gvDetailModal');
    _render();
    _bindFilters();
    _bindModal();
    _bindRanhModal();
    window._renderRanhOverview = _renderRanhOverview;
});

/* ── Ngày hôm nay → index trong DAYS (T2=0..T6=4), null nếu T7/CN ── */
function _todayDowIndex() {
    const d = new Date().getDay(); // 0=Sun,1=Mon..6=Sat
    if (d === 0 || d === 6) return null; // T7/CN nghỉ
    return d - 1; // Mon=0..Fri=4
}

/* ── Filter ── */
function _filtered() {
    const gt = document.getElementById('f-gt-gv')?.value || '';
    const tt = document.getElementById('f-tt-gv')?.value || '';
    const q  = (document.getElementById('f-search-gv')?.value || '').toLowerCase();
    return GV_DATA.filter(g =>
        (gt === '' || String(g.gioi_tinh) === gt) &&
        (tt === '' || (tt==='1' ? g.dang_lam : !g.dang_lam)) &&
        (!q  || g.ho_ten.toLowerCase().includes(q))
    );
}

/* ── Render stats + table ── */
function _render() {
    const todayIdx = _todayDowIndex();
    const s = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    s('gv-total',   GV_DATA.length);
    s('stat-danglam', GV_DATA.filter(g=>g.dang_lam).length);
    s('gv-nam',     GV_DATA.filter(g=>g.gioi_tinh===0).length);
    s('gv-nu',      GV_DATA.filter(g=>g.gioi_tinh===1).length);

    const ranhTodayEl = document.getElementById('gv-ranh-today');
    if (ranhTodayEl) {
        if (todayIdx === null) {
            ranhTodayEl.textContent = '—';
            ranhTodayEl.title = 'Hôm nay là ngày nghỉ (T7/CN)';
        } else {
            ranhTodayEl.textContent = GV_DATA.filter(g => g.dang_lam && g.lich_ranh[todayIdx]).length;
        }
    }
    _renderTable(_filtered());
}

/* ── Mini grid 5 ô (T2-T6) ── */
function _miniRanhGrid(ranh) {
    return `<div class="mini-ranh-grid">
        ${DAYS.map((d, i) => {
            const special = DAY_IS_SPECIAL[i]; // Thứ 5
            const isRanh = ranh[i];
            return `<div class="mini-ranh-cell">
                <span class="mini-ranh-label" style="${special ? 'color:#f59e0b;' : ''}">${d}</span>
                <div class="mini-ranh-dot ${isRanh ? 'ranh' : (special ? 'special-off' : 'ban')}"
                     title="${DAYS_FULL[i]}${special ? ' (nghỉ / dạy bù)' : ''}: ${isRanh ? 'Rảnh' : 'Bận'}">
                    ${isRanh ? '<i class="fas fa-check"></i>' : (special ? '<i class="fas fa-coffee"></i>' : '<i class="fas fa-minus"></i>')}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function _renderTable(data) {
    const tbody = document.getElementById('gv-tbody');
    if (!tbody) return;
    const isAdmin = window.IS_ADMIN === true;
    tbody.innerHTML = data.map((g, i) => {
        const ranhCount = g.lich_ranh.filter(Boolean).length;
        return `
    <tr>
        <td style="color:var(--text-muted);font-weight:600;text-align:center;">${i+1}</td>
        <td style="font-weight:700; color:var(--text-main); align-content:center;">${g.ho_ten}</td>
        <td style="align-content:center;">${g.nhiem_vu === 0 ? '<span class="badge" style="background:#e0e7ff;color:#4338ca;"><i class="fas fa-clipboard-check"></i> Điểm danh</span>' : '<span class="badge" style="background:#fce7f3;color:#be185d;"><i class="fas fa-hands-helping"></i> Hỗ trợ</span>'}</td>
        <td style="align-content:center;">${g.dang_lam
            ? '<span class="badge badge-success"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Đang làm</span>'
            : '<span class="badge badge-danger"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Nghỉ</span>'}</td>
        <td style="text-align:center; align-content:center;">
            <div style="display:inline-flex;align-items:center;justify-content:center;gap:4px;background:#f8fafc;padding:4px 10px;border-radius:12px;border:1px solid #e2e8f0;">
                <span style="font-size:1.05rem;font-weight:800;color:var(--primary-color);">${g.ca_thang}</span>
            </div>
        </td>
        <td>
            <div style="display:flex;flex-direction:column;gap:5px;">
                ${_miniRanhGrid(g.lich_ranh)}
                <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
                    <span class="ranh-count-badge">
                        <i class="fas fa-sun" style="font-size:0.65rem;"></i> ${ranhCount}/5
                    </span>
                    ${isAdmin ? `<button class="btn-ranh" data-ranh-id="${g.id}">
                        <i class="fas fa-pencil-alt"></i> Sửa lịch
                    </button>` : ''}
                </div>
            </div>
        </td>
        ${isAdmin ? `<td style="text-align:center; align-content:center;">
            <div class="table-actions" style="display:inline-flex; justify-content:center; width:100%;">
                <button class="btn btn-view" data-view-id="${g.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="btn btn-edit" data-id="${g.id}" title="Sửa thông tin"><i class="fas fa-edit"></i></button>
                <button class="btn btn-del"  data-id="${g.id}" title="Xóa"><i class="fas fa-trash"></i></button>
            </div>
        </td>` : `<td style="text-align:center;">
            <button class="btn btn-view" data-view-id="${g.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
        </td>`}
    </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-id]').forEach(btn => {
        if (btn.classList.contains('btn-edit')) btn.addEventListener('click', () => _openEdit(parseInt(btn.dataset.id)));
        if (btn.classList.contains('btn-del'))  btn.addEventListener('click', () => _delete(parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('[data-view-id]').forEach(btn => {
        btn.addEventListener('click', () => _openDetail(parseInt(btn.dataset.viewId)));
    });
    tbody.querySelectorAll('[data-ranh-id]').forEach(btn => {
        btn.addEventListener('click', () => _openRanhModal(parseInt(btn.dataset.ranhId)));
    });
}

/* ── Lịch rảnh overview table ── */
function _renderRanhOverview() {
    const tbody = document.getElementById('ranh-overview-tbody');
    if (!tbody) return;
    const data = _filtered();
    tbody.innerHTML = data.map(g => {
        const ranhCount = g.lich_ranh.filter(Boolean).length;
        const cells = g.lich_ranh.map((r, i) => {
            const special = DAY_IS_SPECIAL[i];
            return `<td>
                ${r
                    ? `<div class="ranh-cell-ranh" title="${DAYS_FULL[i]}: Rảnh"><i class="fas fa-check"></i></div>`
                    : (special
                        ? `<div class="ranh-cell-special" title="Thứ 5 – Nghỉ (chỉ trực khi dạy bù)"><i class="fas fa-coffee"></i></div>`
                        : `<div class="ranh-cell-ban" title="${DAYS_FULL[i]}: Bận"><i class="fas fa-times"></i></div>`)
                }
            </td>`;
        }).join('');
        const danglam = g.dang_lam ? '' : '<span class="badge badge-danger" style="font-size:0.65rem;margin-left:6px;">Nghỉ</span>';
        return `<tr>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#009CFF,#0060df);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:0.8rem;flex-shrink:0;">
                        ${g.ho_ten.charAt(g.ho_ten.lastIndexOf(' ')+1)}
                    </div>
                    <div>
                        <div style="font-weight:700;font-size:0.85rem;">${g.ho_ten}</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);">${Utils.gioiTinhLabel(g.gioi_tinh)}${danglam}</div>
                    </div>
                </div>
            </td>
            ${cells}
            <td>
                <span class="ranh-count-badge" style="font-size:0.8rem;padding:3px 10px;">
                    <i class="fas fa-check-circle" style="font-size:0.75rem;"></i> ${ranhCount} ngày
                </span>
            </td>
        </tr>`;
    }).join('');
}

/* ── Bind filters ── */
function _bindFilters() {
    ['f-gt-gv','f-tt-gv','f-search-gv'].forEach(id => {
        document.getElementById(id)?.addEventListener('input',  () => { _render(); _renderRanhOverview(); });
        document.getElementById(id)?.addEventListener('change', () => { _render(); _renderRanhOverview(); });
    });
}

/* ── Modal Thêm/Sửa GV ── */
function _bindModal() {
    document.getElementById('btn-them-gv')?.addEventListener('click', () => {
        editingGvId = null; _resetForm();
        gvModal.setTitle('Thêm giáo viên'); gvModal.open();
    });
    document.getElementById('btn-save-gv')?.addEventListener('click', _save);
}

function _resetForm() {
    ['gv-hoten','gv-sdt'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('gv-gt').value = '';
    document.getElementById('gv-nhiemvu').value = '0';
    const dl = document.getElementById('gv-danglam'); if (dl) dl.checked = true;
    document.querySelectorAll('#gvModal .form-control').forEach(e => e.classList.remove('is-invalid'));
}

function _openEdit(id) {
    editingGvId = id;
    const g = GV_DATA.find(x => x.id === id);
    if (!g) return;
    const set = (elId, v) => { const el=document.getElementById(elId); if(el) el.value=v??''; };
    set('gv-hoten', g.ho_ten); set('gv-gt', g.gioi_tinh); set('gv-sdt', g.so_dien_thoai||'');
    set('gv-nhiemvu', g.nhiem_vu ?? '0');
    const dl = document.getElementById('gv-danglam'); if (dl) dl.checked = g.dang_lam;
    gvModal.setTitle(`Sửa: ${g.ho_ten}`);
    gvModal.open();
}

function _openDetail(id) {
    const g = GV_DATA.find(x => x.id === id);
    if (!g) return;
    const s = (elId, v) => { const el=document.getElementById(elId); if(el) el.innerHTML=v; };
    s('dt-hoten', g.ho_ten);
    s('dt-gt', Utils.gioiTinhLabel(g.gioi_tinh));
    s('dt-sdt', g.so_dien_thoai || '—');
    s('dt-nhiemvu', g.nhiem_vu === 0 ? 'Điểm danh' : 'Hỗ trợ');
    s('dt-danglam', g.dang_lam 
        ? '<span class="badge badge-success"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Đang làm</span>' 
        : '<span class="badge badge-danger"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Nghỉ</span>');
    gvDetailModal.open();
}

async function _save() {
    const hoTen   = document.getElementById('gv-hoten')?.value.trim();
    const gt      = document.getElementById('gv-gt')?.value;
    const nhiemvu = document.getElementById('gv-nhiemvu')?.value || '0';
    const sdt     = document.getElementById('gv-sdt')?.value.trim();
    const dangLam = document.getElementById('gv-danglam')?.checked ?? true;
    let valid = true;
    const mark = (id, bad) => { const el=document.getElementById(id); if(!el) return; el.classList.toggle('is-invalid',bad); if(bad) valid=false; };
    mark('gv-hoten', !hoTen); mark('gv-gt', gt === '');
    if (!valid) return;

    const payload = {
        id: editingGvId,
        ho_ten: hoTen,
        gioi_tinh: parseInt(gt),
        nhiem_vu: parseInt(nhiemvu),
        so_dien_thoai: sdt || null,
        dang_lam: dangLam
    };

    const btnSave = document.getElementById('btn-save-gv');
    if (btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...'; }

    try {
        const res = await fetch('/api/giaovien/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrfToken()
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            if (editingGvId) {
                const idx = GV_DATA.findIndex(g => g.id === editingGvId);
                if (idx !== -1) GV_DATA[idx] = { ...GV_DATA[idx], ...payload, id: result.id };
                Toast.success(`Đã cập nhật: ${hoTen}`);
            } else {
                GV_DATA.push({ ...payload, id: result.id, ca_thang: 0, lich_ranh: [false, false, false, false, false] });
                Toast.success(`Đã thêm GV: ${hoTen}`);
            }
            gvModal.close();
            _render();
            _renderRanhOverview();
        } else {
            let msg = 'Lỗi khi lưu dữ liệu giáo viên.';
            if (result.errors) {
                if (result.errors.so_dien_thoai) msg = 'Số điện thoại này đã tồn tại trong hệ thống (bị trùng)!';
                else msg = 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.';
            } else if (result.error) {
                msg = result.error;
            }
            Toast.error(msg);
        }
    } catch (e) {
        Toast.error('Không kết nối được với máy chủ.');
    } finally {
        if (btnSave) { btnSave.disabled = false; btnSave.innerHTML = 'Lưu thông tin'; }
    }
}

async function _delete(id) {
    const g = GV_DATA.find(x => x.id === id);
    const ok = await Confirm.ask('Xóa giáo viên?', `Xóa GV "${g?.ho_ten}"? Ca trực liên quan sẽ bị ảnh hưởng.`);
    if (!ok) return;

    try {
        const res = await fetch(`/api/giaovien/${id}/delete/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': _getCsrfToken() }
        });
        if (res.ok) {
            GV_DATA = GV_DATA.filter(x => x.id !== id);
            _render();
            _renderRanhOverview();
            Toast.success(`Đã xóa GV: ${g?.ho_ten}`);
        } else {
            Toast.error('Lỗi khi xóa giáo viên.');
        }
    } catch (e) {
        Toast.error('Không kết nối được với máy chủ.');
    }
}

function _getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
        c = c.trim();
        if (c.startsWith(name + '=')) return decodeURIComponent(c.slice(name.length + 1));
    }
    return '';
}

/* ── Modal Lịch Rảnh ── */
function _bindRanhModal() {
    document.querySelectorAll('[data-modal-close-ranh]').forEach(btn => {
        btn.addEventListener('click', () => ranhModal.close());
    });
    document.getElementById('btn-save-ranh')?.addEventListener('click', _saveRanh);
}

function _openRanhModal(id) {
    editingRanhId = id;
    const g = GV_DATA.find(x => x.id === id);
    if (!g) return;
    ranhTemp = [...g.lich_ranh];
    const title = document.getElementById('ranh-modal-title');
    if (title) title.textContent = `Lịch rảnh buổi trưa – ${g.ho_ten}`;
    _renderRanhModalGrid();
    ranhModal.open();
}

function _renderRanhModalGrid() {
    const grid = document.getElementById('ranh-modal-grid');
    if (!grid) return;
    grid.innerHTML = DAYS.map((d, i) => {
        const special = DAY_IS_SPECIAL[i]; // Thứ 5
        const isRanh  = ranhTemp[i];
        return `
        <div class="ranh-modal-day">
            <div class="ranh-modal-day-label" style="${special ? 'color:#f59e0b;' : ''}">${d}</div>
            <button class="ranh-toggle-btn ${isRanh ? 'ranh' : ''} ${special ? 'special-day' : ''}"
                    data-day="${i}" type="button" title="${DAYS_FULL[i]}${special ? ' – Nghỉ / Dạy bù' : ''}">
                <i class="fas ${isRanh ? 'fa-sun' : (special ? 'fa-coffee' : 'fa-moon')}"></i>
                <span>${isRanh ? 'Rảnh' : (special ? 'Nghỉ' : 'Bận')}</span>
            </button>
            <span style="font-size:0.65rem;color:${special ? '#f59e0b' : 'var(--text-muted)'};text-align:center;font-weight:${special?'700':'400'};">
                ${DAYS_FULL[i]}${special ? '<br><em style="font-size:0.6rem;">(dạy bù)</em>' : ''}
            </span>
        </div>`;
    }).join('');

    grid.querySelectorAll('.ranh-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const day = parseInt(btn.dataset.day);
            ranhTemp[day] = !ranhTemp[day];
            const isRanh   = ranhTemp[day];
            const special  = DAY_IS_SPECIAL[day];
            btn.classList.toggle('ranh', isRanh);
            btn.querySelector('i').className = `fas ${isRanh ? 'fa-sun' : (special ? 'fa-coffee' : 'fa-moon')}`;
            btn.querySelector('span').textContent = isRanh ? 'Rảnh' : (special ? 'Nghỉ' : 'Bận');
        });
    });
}

async function _saveRanh() {
    const idx = GV_DATA.findIndex(g => g.id === editingRanhId);
    if (idx === -1) return;
    
    try {
        const res = await fetch(`/api/giaovien/${editingRanhId}/ranh/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrfToken()
            },
            body: JSON.stringify({ lich_ranh: ranhTemp })
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            GV_DATA[idx].lich_ranh = [...ranhTemp];
            ranhModal.close();
            _render(); _renderRanhOverview();
            Toast.success(`Đã lưu lịch rảnh: ${GV_DATA[idx].ho_ten}`);
        } else {
            Toast.error('Lỗi khi lưu lịch rảnh.');
        }
    } catch (e) {
        Toast.error('Không kết nối được với máy chủ.');
    }
}
