'use strict';
/* ── PHONG.JS – Quản lý phòng ── */

const PHONG_DATA = window.PHONG_DATA || [];

let phongList = [...PHONG_DATA];
let editingMa = null;
let phongModal;

document.addEventListener('DOMContentLoaded', () => {
    phongModal = new Modal('phongModal');
    _render();
    _bindFilters();
    _bindModal();
});

function _visible() {
    const loai = document.getElementById('f-loai-phong')?.value;
    const gt   = document.getElementById('f-gt-phong')?.value;
    const ma   = (document.getElementById('f-ma-phong')?.value || '').toLowerCase();
    return phongList.filter(p =>
        (loai === '' || String(p.loai_phong) === loai) &&
        (gt   === '' || String(p.gioi_tinh) === gt || (p.gioi_tinh === null && gt === '')) &&
        (!ma   || p.ma_phong.toLowerCase().includes(ma))
    );
}

function _render() {
    const data = _visible();
    _renderGrid(data); _renderTable(data);
}

function _renderGrid(data) {
    const grid = document.getElementById('room-grid');
    if (!grid) return;
    grid.innerHTML = data.map(p => {
        const pct  = Math.round(p.hs_count / p.suc_chua * 100);
        const is_an = p.loai_phong === 0;
        return `
        <div class="room-card" data-ma="${p.ma_phong}">
            <div class="room-card-header ${is_an ? 'an' : 'ngu'}">
                <span><i class="fas fa-${is_an ? 'utensils' : 'bed'}"></i> ${p.ma_phong}</span>
                ${!is_an ? Utils.gioiTinhLabel(p.gioi_tinh).replace('badge-','badge badge-') : ''}
            </div>
            <div class="room-card-body">
                <div class="room-cap-row">
                    <span class="current">${p.hs_count}</span>
                    <span class="capacity">/ ${p.suc_chua} HS</span>
                </div>
                <div class="progress">
                    <div class="progress-bar ${pct>=90?'red':pct>=70?'yellow':'green'}" style="width:${pct}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:8px;">
                    <span style="font-size:0.75rem;color:var(--text-muted);">Trống: ${p.suc_chua - p.hs_count}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${pct}% đầy</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function _renderTable(data) {
    const tbody = document.getElementById('phong-tbody');
    if (!tbody) return;
    const isAdmin = window.IS_ADMIN === true;
    tbody.innerHTML = data.map(p => {
        const trongPct = Math.round(p.hs_count / p.suc_chua * 100);
        return `
        <tr>
            <td><strong>${p.ma_phong}</strong></td>
            <td>${Utils.loaiPhongLabel(p.loai_phong)}</td>
            <td>${p.suc_chua}</td>
            <td>${p.loai_phong === 1 ? Utils.gioiTinhLabel(p.gioi_tinh) : '—'}</td>
            <td>${p.sl_diem_danh || 1}</td>
            <td>${p.sl_ho_tro || 1}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="progress" style="width:80px;">
                        <div class="progress-bar ${trongPct>=90?'red':trongPct>=70?'yellow':'green'}"
                             style="width:${trongPct}%"></div>
                    </div>
                    <span style="font-size:0.82rem;">${p.hs_count}</span>
                </div>
            </td>
            <td>${p.suc_chua - p.hs_count}</td>
            ${isAdmin ? `<td>
                <div class="table-actions">
                    <button class="btn btn-edit" data-edit="${p.ma_phong}" title="Sửa"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-del"  data-del="${p.ma_phong}"  title="Xóa"><i class="fas fa-trash"></i></button>
                </div>
            </td>` : ''}
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => _openEdit(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => _delete(btn.dataset.del));
    });
}

function _bindFilters() {
    ['f-loai-phong','f-gt-phong','f-ma-phong'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', _render);
        document.getElementById(id)?.addEventListener('change', _render);
    });
}

function _bindModal() {
    // Show/hide gender based on room type
    document.getElementById('f-loai')?.addEventListener('change', (e) => {
        const w = document.getElementById('gt-wrap');
        if (w) w.style.display = e.target.value === '1' ? 'block' : 'none';
    });

    document.getElementById('btn-them-phong')?.addEventListener('click', () => {
        editingMa = null;
        _resetForm();
        phongModal.setTitle('Thêm phòng mới');
        phongModal.open();
    });

    document.getElementById('btn-save-phong')?.addEventListener('click', _save);
}

function _resetForm() {
    ['f-ma','f-loai','f-suc-chua','f-gt'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('f-sl-diem-danh').value = '1';
    document.getElementById('f-sl-ho-tro').value = '1';
    document.querySelectorAll('#phongModal .form-control').forEach(el => el.classList.remove('is-invalid'));
    const gtWrap = document.getElementById('gt-wrap');
    if (gtWrap) gtWrap.style.display = 'none';
}

function _openEdit(ma) {
    editingMa = ma;
    const p = phongList.find(x => x.ma_phong === ma);
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    set('f-ma', p.ma_phong);
    set('f-loai', p.loai_phong);
    set('f-suc-chua', p.suc_chua);
    set('f-gt', p.gioi_tinh ?? '');
    set('f-sl-diem-danh', p.sl_diem_danh ?? 1);
    set('f-sl-ho-tro', p.sl_ho_tro ?? 1);
    const gtWrap = document.getElementById('gt-wrap');
    if (gtWrap) gtWrap.style.display = p.loai_phong === 1 ? 'block' : 'none';
    document.getElementById('f-ma').disabled = true;
    phongModal.setTitle(`Sửa phòng ${ma}`);
    phongModal.open();
}

async function _save() {
    const ma      = document.getElementById('f-ma').value.trim().toUpperCase();
    const loai    = parseInt(document.getElementById('f-loai').value);
    const sucChua = parseInt(document.getElementById('f-suc-chua').value);
    const gt      = document.getElementById('f-gt').value;
    const sl_diem_danh = parseInt(document.getElementById('f-sl-diem-danh').value || 1);
    const sl_ho_tro    = parseInt(document.getElementById('f-sl-ho-tro').value || 1);

    let valid = true;
    const mark = (id, bad) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('is-invalid', bad);
        if (bad) valid = false;
    };
    mark('f-ma', !ma || ma.length > 3);
    mark('f-loai', isNaN(loai));
    mark('f-suc-chua', isNaN(sucChua) || sucChua < 1);
    mark('f-gt', loai === 1 && gt === '');
    if (!valid) return;

    const payload = {
        ma_phong: ma,
        ma_phong_old: editingMa,
        loai_phong: loai,
        suc_chua: sucChua,
        gioi_tinh: loai === 1 ? parseInt(gt) : null,
        sl_diem_danh: sl_diem_danh,
        sl_ho_tro: sl_ho_tro
    };

    try {
        const res = await fetch('/api/phong/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrfToken()
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            if (editingMa) {
                const idx = phongList.findIndex(p => p.ma_phong === editingMa);
                if (idx !== -1) phongList[idx] = { ...phongList[idx], ...payload, ma_phong: result.ma_phong };
                Toast.success(`Đã cập nhật phòng ${editingMa}`);
            } else {
                phongList.push({ ...payload, ma_phong: result.ma_phong, hs_count: 0 });
                Toast.success(`Đã thêm phòng ${ma}`);
            }
            document.getElementById('f-ma').disabled = false;
            phongModal.close();
            _render();
        } else {
            Toast.error('Lỗi khi lưu phòng. Vui lòng kiểm tra lại.');
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

async function _delete(ma) {
    const ok = await Confirm.ask('Xóa phòng?', `Xóa phòng ${ma}? Học sinh trong phòng này sẽ cần được phân bổ lại.`);
    if (!ok) return;
    try {
        const res = await fetch('/api/phong/delete/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': _getCsrfToken() },
            body: JSON.stringify({ ma_phong: ma })
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            phongList = phongList.filter(p => p.ma_phong !== ma);
            _render();
            Toast.success(`Đã xóa phòng ${ma}`);
        } else {
            Toast.error(result.error || 'Không thể xóa phòng này.');
        }
    } catch (e) {
        Toast.error('Không kết nối được với máy chủ.');
    }
}
