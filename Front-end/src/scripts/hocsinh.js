'use strict';
/* ── HOCSINH.JS – Quản lý học sinh ── */

let HS_DATA = [];
if (window.HS_DATA) {
    HS_DATA = window.HS_DATA;
}
let nextId = 1; // Not used much now as IDs come from DB
let editingId = null;
let hsModal, importModal;
const PAGE_SIZE = 10;
let currentPage = 1;

let NGU_PHONG = {
    0: [],
    1: []
};

document.addEventListener('DOMContentLoaded', () => {
    // Nạp danh sách phòng ngủ từ CSDL (inject từ Django template)
    if (window.DS_PHONG_NGU) {
        NGU_PHONG = window.DS_PHONG_NGU;
    }
    hsModal     = new Modal('hsModal');
    importModal = new Modal('importModal');
    _buildLopFilter();
    _render();
    _bindFilters();
    _bindModal();
    _bindImport();
});

/* ── Filters ── */
function _buildLopFilter() {
    const sel = document.getElementById('f-lop-hs');
    const classes = [...new Set(HS_DATA.map(s => s.lop))].sort();
    classes.forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
}
function _bindFilters() {
    ['f-khoi-hs','f-lop-hs','f-gt-hs','f-trang-thai-hs','f-search-hs'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', () => { currentPage=1; _render(); })
    );
    document.getElementById('f-khoi-hs')?.addEventListener('change', () => { currentPage=1; _render(); });
}

function _filtered() {
    const khoi = document.getElementById('f-khoi-hs')?.value  || '';
    const lop  = document.getElementById('f-lop-hs')?.value   || '';
    const gt   = document.getElementById('f-gt-hs')?.value    || '';
    const tt   = document.getElementById('f-trang-thai-hs')?.value || '';
    const q    = (document.getElementById('f-search-hs')?.value || '').toLowerCase();
    return HS_DATA.filter(s =>
        (!khoi || s.lop.startsWith(khoi)) &&
        (!lop  || s.lop  === lop) &&
        (gt    === '' || String(s.gioi_tinh) === gt) &&
        (tt    === '' || (tt === '1' ? s.dang_hoc : !s.dang_hoc)) &&
        (!q    || s.ho_ten.toLowerCase().includes(q))
    );
}

/* ── Render ── */
function _render() {
    const data = _filtered();
    // Stats
    const val = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    val('hs-total',   data.length);
    val('hs-nam',     data.filter(s=>s.gioi_tinh===0).length);
    val('hs-nu',      data.filter(s=>s.gioi_tinh===1).length);
    val('stat-hs-danghoc', data.filter(s=>s.dang_hoc).length);

    // Pagination
    const pages     = Math.ceil(data.length / PAGE_SIZE);
    const start     = (currentPage - 1) * PAGE_SIZE;
    const pageData  = data.slice(start, start + PAGE_SIZE);
    _renderTable(pageData, start);
    _renderPagination(data.length, pages);
}

function _renderTable(data, offset) {
    const tbody = document.getElementById('hs-tbody');
    if (!tbody) return;
    const isAdmin = window.IS_ADMIN === true;
    tbody.innerHTML = data.map((s, i) => `
    <tr>
        <td style="color:var(--text-muted);font-weight:600;">${offset+i+1}</td>
        <td><span style="font-family:monospace;font-size:.82rem;font-weight:700;background:var(--gray-100);padding:2px 8px;border-radius:4px;color:var(--primary-color);">${s.id}</span></td>
        <td>
            <div style="font-weight:700;">${s.ho_ten}</div>
            ${s.ghi_chu ? `<div style="font-size:0.75rem;color:var(--text-muted);">${s.ghi_chu}</div>` : ''}
        </td>
        <td>${Utils.gioiTinhLabel(s.gioi_tinh)}</td>
        <td><span class="badge badge-primary">${s.lop}</span></td>
        <td><span class="badge badge-an">${s.phong_an}</span></td>
        <td><span class="badge badge-ngu">${s.phong_ngu}</span></td>
        <td>${s.dang_hoc
            ? '<span class="badge badge-success"><i class="fas fa-check"></i> Đang học</span>'
            : '<span class="badge badge-danger"><i class="fas fa-times"></i> Rút bán trú</span>'}</td>
        ${isAdmin ? `<td>
            <div class="table-actions">
                <button class="btn btn-edit" data-id="${s.id}" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="btn btn-del" id="btn-del-${s.id}" data-id="${s.id}" title="Xóa"><i class="fas fa-trash"></i></button>
            </div>
        </td>` : ''}
    </tr>`).join('');

    tbody.querySelectorAll('[data-id]').forEach(btn => {
        const btnId = parseInt(btn.dataset.id);
        if (btn.classList.contains('btn-edit')) btn.addEventListener('click', () => _openEdit(btnId));
        if (btn.classList.contains('btn-del'))  btn.addEventListener('click', () => _delete(btnId));
    });
}

function _renderPagination(total, pages) {
    const foot = document.getElementById('hs-footer');
    if (!foot) return;
    const s = Math.min((currentPage-1)*PAGE_SIZE+1, total);
    const e = Math.min(currentPage*PAGE_SIZE, total);
    let pag = '';
    pag += `<button class="page-btn" data-p="${currentPage-1}" ${currentPage<=1?'disabled':''}><i class="fas fa-chevron-left"></i></button>`;
    for (let p=1; p<=pages; p++) pag += `<button class="page-btn ${p===currentPage?'active':''}" data-p="${p}">${p}</button>`;
    pag += `<button class="page-btn" data-p="${currentPage+1}" ${currentPage>=pages?'disabled':''}><i class="fas fa-chevron-right"></i></button>`;
    foot.innerHTML = `<span class="datatable-info">Hiển thị ${total?s:0}–${e} trong ${total}</span><div class="datatable-pagination">${pag}</div>`;
    foot.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => { currentPage=parseInt(btn.dataset.p); _render(); });
    });
}

/* ── Modal ── */
function _bindModal() {
    document.getElementById('btn-them-hs')?.addEventListener('click', () => {
        editingId = null; _resetHsForm(); hsModal.setTitle('Thêm học sinh'); hsModal.open();
    });
    document.getElementById('hs-gt')?.addEventListener('change', _updateNguPhong);
    document.getElementById('btn-save-hs')?.addEventListener('click', _saveHs);
}

function _updateNguPhong() {
    const gt  = document.getElementById('hs-gt')?.value;
    const sel = document.getElementById('hs-phong-ngu');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Chọn phòng ngủ --</option>';
    if (gt === '') { sel.innerHTML = '<option value="">-- Chọn giới tính trước --</option>'; return; }
    (NGU_PHONG[parseInt(gt)] || []).forEach(p => {
        const o = document.createElement('option'); o.value=p.v; o.textContent=p.l; sel.appendChild(o);
    });
}

function _resetHsForm() {
    ['hs-hoten','hs-lop','hs-ghichu'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
    ['hs-gt','hs-phong-an','hs-phong-ngu'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
    const dh = document.getElementById('hs-danghoc'); if (dh) dh.checked = true;
    document.querySelectorAll('#hsModal .form-control').forEach(e => e.classList.remove('is-invalid'));
    _updateNguPhong();
}

function _openEdit(id) {
    editingId = id;
    const s = HS_DATA.find(x => x.id === id);
    if (!s) return;
    const set = (elId, v) => { const el=document.getElementById(elId); if(el) el.value=v??''; };
    set('hs-hoten', s.ho_ten);
    set('hs-lop',   s.lop);
    set('hs-gt',    s.gioi_tinh); _updateNguPhong();
    set('hs-phong-an',  s.phong_an);
    set('hs-phong-ngu', s.phong_ngu);
    set('hs-ghichu', s.ghi_chu || '');
    const dh = document.getElementById('hs-danghoc'); if (dh) dh.checked = s.dang_hoc;
    hsModal.setTitle(`Sửa: ${s.ho_ten} [Mã BT: ${s.id}]`);
    hsModal.open();
}

async function _saveHs() {
    const hoTen   = document.getElementById('hs-hoten')?.value.trim();
    const lop     = document.getElementById('hs-lop')?.value.trim().toUpperCase();
    const gt      = document.getElementById('hs-gt')?.value;
    const phongAn = document.getElementById('hs-phong-an')?.value;
    const phongNgu= document.getElementById('hs-phong-ngu')?.value;
    const dangHoc = document.getElementById('hs-danghoc')?.checked ?? true;
    const ghiChu  = document.getElementById('hs-ghichu')?.value.trim();

    let valid = true;
    const mark = (id, bad) => { const el=document.getElementById(id); if(!el) return; el.classList.toggle('is-invalid',bad); if(bad) valid=false; };
    mark('hs-hoten',    !hoTen);
    mark('hs-lop',      !lop);
    mark('hs-gt',       gt === '' || gt === undefined || gt === null);
    mark('hs-phong-an', !phongAn);
    mark('hs-phong-ngu',!phongNgu);
    if (!valid) return;

    const payload = {
        id:          editingId,
        ho_ten:      hoTen,
        lop:         lop,
        gioi_tinh:   parseInt(gt),
        ma_phong_an: phongAn,
        ma_phong_ngu:phongNgu,
        dang_hoc:    dangHoc,
        ghi_chu:     ghiChu
    };

    const btnSave = document.getElementById('btn-save-hs');
    if (btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...'; }

    try {
        const res = await fetch('/api/hocsinh/save/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': _getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            // Chuẩn hóa object để phù hợp cấu trúc render (phong_an / phong_ngu)
            const normalized = {
                id:         result.id,
                ho_ten:     hoTen,
                lop:        lop,
                gioi_tinh:  parseInt(gt),
                phong_an:   phongAn,
                phong_ngu:  phongNgu,
                dang_hoc:   dangHoc,
                ghi_chu:    ghiChu || ''
            };
            if (editingId) {
                const idx = HS_DATA.findIndex(s => s.id === editingId);
                if (idx !== -1) HS_DATA[idx] = normalized;
                Toast.success(`Đã cập nhật: ${hoTen}`);
            } else {
                HS_DATA.push(normalized);
                // Rebuild dropdown lớp
                const sel = document.getElementById('f-lop-hs');
                if (sel && !Array.from(sel.options).some(o => o.value === lop)) {
                    const o = document.createElement('option'); o.value=lop; o.textContent=lop; sel.appendChild(o);
                }
                Toast.success(`Đã thêm học sinh: ${hoTen} [Mã BT: ${result.id}]`);
            }
            hsModal.close();
            _render();
        } else {
            const errMsg = result.error || Object.values(result.errors || {}).flat().join('; ');
            Toast.error('Lỗi: ' + errMsg);
        }
    } catch (e) {
        Toast.error('Không kết nối được với máy chủ.');
        console.error(e);
    } finally {
        if (btnSave) { btnSave.disabled = false; btnSave.innerHTML = '<i class="fas fa-save"></i> Lưu'; }
    }
}

async function _delete(id) {
    const s = HS_DATA.find(x => x.id === id);
    if (!s) { Toast.error('Không tìm thấy học sinh.'); return; }
    const ok = await Confirm.ask('Xóa học sinh?', `Xóa học sinh "${s.ho_ten}" khỏi hệ thống?`);
    if (!ok) return;

    const delBtn = document.getElementById(`btn-del-${id}`);
    if(delBtn) { delBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; delBtn.disabled = true; }
    
    // Giao diện Optimistic: Làm mờ dòng đang bị xoá đi tạo cảm giác cực nhanh
    const row = delBtn ? delBtn.closest('tr') : null;
    if(row) row.style.opacity = '0.4';

    try {
        const res = await fetch(`/api/hocsinh/${id}/delete/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': _getCsrfToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id })
        });
        let result = {};
        try { result = await res.json(); } catch(_) {}
        if (res.ok && result.ok) {
            HS_DATA = HS_DATA.filter(x => x.id !== id);
            _render();
            Toast.success(`Đã xóa học sinh: ${s.ho_ten}`);
        } else {
            if(row) row.style.opacity = '1';
            if(delBtn) { delBtn.innerHTML = '<i class="fas fa-trash"></i>'; delBtn.disabled = false; }
            alert('Lỗi từ máy chủ khi xóa: ' + (result.error || res.status));
        }
    } catch (e) {
        if(row) row.style.opacity = '1';
        if(delBtn) { delBtn.innerHTML = '<i class="fas fa-trash"></i>'; delBtn.disabled = false; }
        alert('Lỗi trình duyệt/mạng khi gọi hàm xóa: ' + e.message);
        console.error(e);
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

/* ── Import CSV ── */
let _csvFile = null; // Giữ file đã chọn để upload sau

function _bindImport() {
    document.getElementById('btn-import-csv')?.addEventListener('click', () => {
        _csvFile = null;
        _resetImportModal();
        importModal.open();
    });

    const zone  = document.getElementById('import-zone');
    const input = document.getElementById('csv-input');
    zone?.addEventListener('click', () => input?.click());
    zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone?.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) { _csvFile = e.dataTransfer.files[0]; _readCSV(_csvFile); }
    });
    input?.addEventListener('change', e => {
        if (e.target.files[0]) { _csvFile = e.target.files[0]; _readCSV(_csvFile); }
    });

    document.getElementById('btn-confirm-import')?.addEventListener('click', _doImport);
}

function _resetImportModal() {
    const preview = document.getElementById('import-preview');
    const result  = document.getElementById('import-result');
    const btn     = document.getElementById('btn-confirm-import');
    const input   = document.getElementById('csv-input');
    if (preview) preview.style.display = 'none';
    if (result)  result.style.display  = 'none';
    if (btn)     btn.disabled = true;
    if (input)   input.value = '';
}

function _readCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const text  = e.target.result;
        const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l);

        // Hiển thị preview toàn bộ bảng có scrollbar
        const preview = document.getElementById('import-preview');
        const content = document.getElementById('import-preview-content');
        if (preview && content) {
            preview.style.display = 'block';
            const cols = ['STT', 'Mã BT', 'Họ tên', 'GT', 'Lớp', 'P.Ngủ', 'P.Ăn', 'Ghi chú'];
            let html = `<div style="overflow-x:auto; max-height:165px; overflow-y:auto; border:1px solid var(--gray-200); border-radius:4px;"><table style="width:100%;border-collapse:collapse;font-size:0.75rem;">`;
            
            const firstCells = lines[0]?.split(',') || [];
            const hasHeader = firstCells[0]?.trim().toLowerCase() === 'stt' || isNaN(firstCells[0]?.trim());
            
            if (!hasHeader) {
                html += `<tr style="position:sticky;top:0;background:var(--gray-100);z-index:1;">${cols.map(c=>`<th style="padding:4px 8px;text-align:left;border:1px solid var(--gray-200);background:var(--gray-100);">${c}</th>`).join('')}</tr>`;
            }
            
            lines.forEach((line, idx) => {
                const cells = line.split(',');
                const isHead = idx === 0 && hasHeader;
                const stickyStyle = isHead ? 'position:sticky;top:0;z-index:1;' : '';
                html += `<tr style="${isHead?'background:var(--gray-100);font-weight:600;':''} ${stickyStyle}">`;
                cols.forEach((_, ci) => {
                    html += `<td style="padding:4px 8px;border:1px solid var(--gray-200);white-space:nowrap;${isHead?'background:var(--gray-100);':''}">${(cells[ci]||'').trim()}</td>`;
                });
                html += `</tr>`;
            });
            html += `</table></div>`;
            content.innerHTML = html;
        }

        const btn = document.getElementById('btn-confirm-import');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-import"></i> Import'; }

        // Ẩn kết quả cũ
        const result = document.getElementById('import-result');
        if (result) result.style.display = 'none';
    };
    reader.readAsText(file, 'UTF-8');
}

async function _doImport() {
    if (!_csvFile) return;
    const btn = document.getElementById('btn-confirm-import');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...'; }

    const formData = new FormData();
    formData.append('file', _csvFile);

    try {
        const res = await fetch('/api/hocsinh/import/', {
            method: 'POST',
            headers: { 'X-CSRFToken': _getCsrfToken() },
            body: formData
        });
        const data = await res.json();

        const resultDiv = document.getElementById('import-result');
        if (resultDiv) {
            resultDiv.style.display = 'block';
            let html = '';
            if (data.ok) {
                const allErrors  = data.errors || [];
                // Tách lỗi trùng vs lỗi thực sự
                const duplicates = allErrors.filter(e => e.msg && e.msg.includes('đã tồn tại'));
                const realErrors = allErrors.filter(e => !e.msg || !e.msg.includes('đã tồn tại'));
                const hasWarn    = duplicates.length > 0 || realErrors.length > 0;
                const bgColor    = (data.success === 0 && realErrors.length > 0) ? '#fef2f2' : (hasWarn ? '#fffbeb' : '#f0fdf4');
                const bdColor    = (data.success === 0 && realErrors.length > 0) ? '#fca5a5' : (hasWarn ? '#fcd34d' : '#86efac');
                html += `<div style="padding:12px;border-radius:8px;background:${bgColor};border:1px solid ${bdColor};">`;
                html += `<div style="font-weight:700;margin-bottom:8px;"><i class="fas fa-${!hasWarn ? 'check-circle" style="color:#16a34a' : 'exclamation-triangle" style="color:#d97706'}"></i> Kết quả import</div>`;
                html += `<div>✅ Thành công: <b>${data.success}</b> học sinh được thêm</div>`;
                if (duplicates.length > 0) {
                    html += `<div style="margin-top:8px;color:#92400e;font-weight:600;">⚠️ Bỏ qua ${duplicates.length} học sinh có mã BT đã tồn tại:</div>`;
                    html += `<div style="max-height:160px;overflow-y:auto;margin-top:4px;border:1px solid #fcd34d;border-radius:4px;padding:4px;"><ul style="margin:0;padding-left:18px;font-size:0.78rem;color:#92400e;">`;
                    duplicates.forEach(e => { html += `<li>Dòng ${e.row}: ${e.msg}</li>`; });
                    html += `</ul></div>`;
                }
                if (realErrors.length > 0) {
                    html += `<div style="margin-top:8px;color:#991b1b;font-weight:600;">❌ ${realErrors.length} dòng bị lỗi (không thêm được):</div>`;
                    html += `<div style="max-height:160px;overflow-y:auto;margin-top:4px;border:1px solid #fca5a5;border-radius:4px;padding:4px;"><ul style="margin:0;padding-left:18px;font-size:0.78rem;color:#991b1b;">`;
                    realErrors.forEach(e => { html += `<li>Dòng ${e.row}: ${e.msg}</li>`; });
                    html += `</ul></div>`;
                }
                html += `</div>`;

                // Reload sau khi import thành công
                if (data.success > 0) {
                    Toast.success(`Import xong! ${data.success} học sinh đã được thêm.`);
                    setTimeout(() => { window.location.reload(); }, 1800);
                } else if (duplicates.length > 0 && realErrors.length === 0) {
                    Toast.error('Tất cả học sinh trong file đã tồn tại trong CSDL, không có học sinh nào được thêm.');
                }
            } else {
                html = `<div style="padding:12px;border-radius:8px;background:#fef2f2;border:1px solid #fca5a5;"><i class="fas fa-times-circle" style="color:#dc2626"></i> Lỗi: ${data.error || 'Không xác định'}</div>`;
                Toast.error('Import thất bại.');
            }
            resultDiv.innerHTML = html;
        }
    } catch (err) {
        Toast.error('Không kết nối được với máy chủ.');
        console.error(err);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-import"></i> Import lại'; }
    }
}
