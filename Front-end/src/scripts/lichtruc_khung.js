'use strict';

const KHUNG_DATA = window.KHUNG_DATA || [];
const PHONG = window.PHONG_DATA || [];
const GV = window.GV_DATA || [];

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];

let currentKhung = [...KHUNG_DATA];
let gvModal;
let activePhong = null;
let activeThu = null;

document.addEventListener('DOMContentLoaded', () => {
    gvModal = new Modal('gvModal');
    renderGrid();
    
    document.getElementById('btn-auto-schedule')?.addEventListener('click', autoSchedule);
    document.getElementById('btn-save-khung')?.addEventListener('click', saveKhung);
    document.getElementById('btn-add-gv-confirm')?.addEventListener('click', confirmAddGv);
});

// ------------------------------------
// Đặt tên hiển thị thông minh: tận dụng họ khi trùng tên
// ------------------------------------
function _smartName(gv, peersInCell) {
    const parts = gv.ho_ten.trim().split(' ');
    const ten   = parts[parts.length - 1];  // Tên (last word)
    const lot   = parts.length > 1 ? parts[parts.length - 2] : '';  // Chữ lót
    const ho    = parts[0];  // Họ (first word)

    const same_ten = peersInCell.filter(p => {
        const pp = p.ho_ten.trim().split(' ');
        return pp[pp.length - 1] === ten && p.id !== gv.id;
    });

    if (same_ten.length === 0) return ten;

    // Trùng tên → thêm chữ lót
    const same_lot = same_ten.filter(p => {
        const pp = p.ho_ten.trim().split(' ');
        return pp.length > 1 && pp[pp.length - 2] === lot;
    });

    const lotInit = lot ? lot[0] + '. ' : '';
    if (same_lot.length === 0) return `${lotInit}${ten}`;

    // Vẫn trùng → thêm họ
    return `${ho[0]}. ${ten}`;
}

function renderGrid() {
    const grid = document.getElementById('khung-table');
    if (!grid) return;
    
    // Header
    let html = `<div class="khung-header">Phòng / Ca</div>`;
    DAYS.forEach(d => {
        html += `<div class="khung-header">${d}</div>`;
    });
    
    // Rows
    PHONG.forEach(p => {
        html += `<div class="khung-room-label">
            <div>
                <span class="badge ${p.loai_phong === 0 ? 'badge-an' : 'badge-ngu'}" style="font-size:1rem;">${p.ma_phong}</span>
                <div style="font-size:0.7rem;margin-top:4px;">${p.sl_diem_danh} ĐD · ${p.sl_ho_tro} HT</div>
            </div>
        </div>`;
        
        for (let thu = 0; thu <= 4; thu++) {
            const pcArr = currentKhung.filter(k => k.ma_phong === p.ma_phong && k.thu === thu);
            html += `<div class="khung-cell">`;
            
            pcArr.forEach(pc => {
                const gv = GV.find(g => g.id === pc.ma_gv);
                if (gv) {
                    const isDD = gv.nhiem_vu === 0;
                    // Tất cả GV trong ô đó (để xử lý tên trùng)
                    const peersInCell = pcArr.map(pk => GV.find(g => g.id === pk.ma_gv)).filter(Boolean);
                    const label = _smartName(gv, peersInCell);
                    html += `<div class="gv-tag ${isDD ? '' : 'ht'}">
                        <span title="${gv.ho_ten}"><i class="fas ${isDD ? 'fa-clipboard-check' : 'fa-hands-helping'}" style="pointer-events:none"></i> ${label}</span>
                        <button type="button" class="gv-remove" data-gv="${gv.id}" data-phong="${p.ma_phong}" data-thu="${thu}" title="Xóa" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px 4px;">
                          <i class="fas fa-times" style="pointer-events:none"></i>
                        </button>
                    </div>`;
                }
            });
            
            html += `<div class="add-gv-btn" data-phong="${p.ma_phong}" data-thu="${thu}">+ Thêm GV</div>`;
            html += `</div>`;
        }
    });
    
    grid.innerHTML = html;

    // Dùng event delegation: lắng nghe toàn bộ click trên grid
    grid.addEventListener('click', (e) => {
        // Xóa GV
        const removeBtn = e.target.closest('.gv-remove');
        if (removeBtn) {
            e.stopPropagation();
            const gid = parseInt(removeBtn.dataset.gv);
            const pid = removeBtn.dataset.phong;
            const t   = parseInt(removeBtn.dataset.thu);
            currentKhung = currentKhung.filter(k => !(k.ma_gv == gid && k.ma_phong == pid && k.thu == t));
            renderGrid();
            return;
        }
        // Thêm GV
        const addBtn = e.target.closest('.add-gv-btn');
        if (addBtn) {
            activePhong = addBtn.dataset.phong;
            activeThu   = parseInt(addBtn.dataset.thu);
            openGvSelectionModal();
        }
    });
}

function openGvSelectionModal() {
    const sel = document.getElementById('f-chon-gv');
    sel.innerHTML = '<option value="">-- Chọn GV --</option>';
    
    const p = PHONG.find(x => x.ma_phong === activePhong);
    const loaiPhongActive = p ? p.loai_phong : null;  // 0=Ăn, 1=Ngủ
    
    GV.forEach(g => {
        if (!g.lich_ranh[activeThu]) return; // Bận
        
        // Ràng buộc giới tính đối với phòng Ngủ
        if (p && p.loai_phong === 1 && p.gioi_tinh !== null) {
            if (g.gioi_tinh !== p.gioi_tinh) return;
        }
        
        // Kiểm tra xung đột: GV đã được xếp cùng loại phòng chưa?
        // (Trực Ăn và Trực Ngủ là 2 ca riêng, nên GV có thể trực cả 2)
        const conflictSameLoại = currentKhung.find(k => {
            if (k.thu !== activeThu || k.ma_gv !== g.id) return false;
            const kPhong = PHONG.find(x => x.ma_phong == k.ma_phong);
            return kPhong && kPhong.loai_phong === loaiPhongActive;
        });

        const suffix = conflictSameLoại ? ` (Đã xếp ${loaiPhongActive === 0 ? 'Ăn' : 'Ngủ'}: ${conflictSameLoại.ma_phong})` : '';
        const roleStr = g.nhiem_vu === 0 ? ' [Điểm danh]' : ' [Hỗ trợ]';
        
        sel.innerHTML += `<option value="${g.id}" ${conflictSameLoại ? 'disabled' : ''}>${g.ho_ten} ${roleStr}${suffix}</option>`;
    });
    
    gvModal.open();
}

function confirmAddGv() {
    const gid = parseInt(document.getElementById('f-chon-gv').value);
    if (isNaN(gid)) return;
    
    const p = PHONG.find(x => x.ma_phong === activePhong);
    const loaiPhongActive = p ? p.loai_phong : null;

    // Chỉ chặn nếu GV đã có trong cùng phòng đó rồi
    if (currentKhung.some(k => k.ma_phong == activePhong && k.thu == activeThu && k.ma_gv == gid)) {
        Toast.warning('Giáo viên này đã có trong phòng!');
        return;
    }
    
    // Chặn nếu đã xếp cùng loại phòng khác (2 phòng ăn cùng lúc)
    const doubleConflict = currentKhung.find(k => {
        if (k.thu != activeThu || k.ma_gv != gid) return false;
        const kPhong = PHONG.find(x => x.ma_phong == k.ma_phong);
        return kPhong && kPhong.loai_phong === loaiPhongActive;
    });
    if (doubleConflict) {
        Toast.warning(`GV này đã được xếp ${loaiPhongActive === 0 ? 'ăn' : 'ngủ'} tại phòng ${doubleConflict.ma_phong}!`);
        return;
    }
    
    currentKhung.push({
        ma_phong: activePhong,
        thu: activeThu,
        ma_gv: gid
    });
    
    gvModal.close();
    renderGrid();
}

async function autoSchedule() {
    const ok = await Confirm.ask('Tự động xếp lịch', 'Hệ thống sẽ chạy thuật toán và viết đè lên lịch khung hiện tại. Tiếp tục?');
    if (!ok) return;
    
    try {
        const res = await fetch('/api/lichtruc_khung/auto/', {
            method: 'POST',
            headers: { 'X-CSRFToken': _getCsrfToken() }
        });
        const ans = await res.json();
        if (ans.ok) {
            Toast.success('Đã xếp lịch xong! Trang sẽ tự reload.');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            Toast.error('Lỗi: ' + ans.error);
        }
    } catch(e) {
        Toast.error('Lỗi kết nối.');
    }
}

async function saveKhung() {
    try {
        const res = await fetch('/api/lichtruc_khung/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrfToken()
            },
            body: JSON.stringify(currentKhung)
        });
        const ans = await res.json();
        if (ans.ok) {
            Toast.success('Đã lưu cố định Lịch Khung.');
        } else {
            Toast.error('Lỗi: ' + ans.error);
        }
    } catch(e) {
        Toast.error('Lỗi kết nối.');
    }
}

function _getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
        let cTrim = c.trim();
        if (cTrim.startsWith(name + '=')) return decodeURIComponent(cTrim.slice(name.length + 1));
    }
    return '';
}
