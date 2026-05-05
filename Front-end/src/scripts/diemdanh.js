/* ============================================================
   DIEMDANH.JS – Logic điểm danh Ăn & Ngủ
   ============================================================ */
'use strict';

/* ── Mock Data (thay bằng API Django thực tế) ── */
let MOCK_STUDENTS  = [];
let MOCK_ROOMS_AN  = [];
let MOCK_ROOMS_NGU = [];

/* ── Utilities ── */
const _DOWS = ['CN','T2','T3','T4','T5','T6','T7'];
const _DOWS_FULL = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];

function _getMonday(d) {
    const r = new Date(d); const dow = r.getDay();
    r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1)); return r;
}
function _addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function _p2(n) { return String(n).padStart(2, '0'); }
function _fmtD(d) { return `${_p2(d.getDate())}/${_p2(d.getMonth()+1)}/${d.getFullYear()}`; }
function _fmtISO(d) { return `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}`; }

/**
 * Lấy mảng tối đa 4 Monday đầu tuần học trong tháng.
 * @param {number} year   năm (4 chữ số)
 * @param {number} month  tháng 1-based
 * @returns {Date[]} mảng các Monday (tối đa 4)
 */
function _getMonthSchoolWeeks(year, month) {
    const lastDay = new Date(year, month, 0); // ngày cuối tháng
    const weeks   = [];
    let d = new Date(year, month - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // tìm Monday đầu tiên
    while (d <= lastDay && weeks.length < 4) {
        weeks.push(new Date(d));
        d.setDate(d.getDate() + 7);
    }
    return weeks;
}

/**
 * Tính số tuần học kể từ 1/9 của namHocStart
 */
function _calcWeekNum(monday, namHocStart) {
    const startDate = new Date(namHocStart, 8, 1); // 1 tháng 9
    return Math.max(1, Math.ceil((monday - startDate) / (7 * 86400000)));
}

/* ── Core DiemDanh Manager ── */
class DiemDanhManager {
    /**
     * @param {string} loai  'an' | 'ngu'
     * @param {string} phongField  'phong_an' | 'phong_ngu'
     */
    constructor(loai, phongField) {
        this.loai        = loai;
        this.phongField  = phongField;
        this.rooms       = [];
        this.students    = []; // sẽ nạp từ API
        this.activeRoom  = null;
        this.date        = Utils.today();
        this.weekMode    = false;
        this.records     = {};

        this._loadDataFromAPI();
    }

    _recKey(sid, date) { return `${sid}_${date || this.date}`; }

    /* ===== NẠP DỮ LIỆU TỪ API ===== */
    async _loadDataFromAPI() {
        try {
            const [rRes, sRes] = await Promise.all([
                fetch(`/api/phong/${this.loai}/`),
                fetch(`/api/hocsinh/${this.loai}/`),
            ]);
            const rData = await rRes.json();
            const sData = await sRes.json();
            this.rooms    = rData.phong    || [];
            this.students = sData.hocsinh  || [];
        } catch(e) {
            console.warn('Không thể tải dữ liệu từ API, dùng mock data:', e);
            // fallback mock
            this.rooms    = this.loai === 'an' ? MOCK_ROOMS_AN    : MOCK_ROOMS_NGU;
            this.students = MOCK_STUDENTS;
        }
        this._initUI();
    }

    /* ===== INIT ===== */
    _initUI() {
        this._renderRoomList();
        this._bindDatePicker();
        this._bindQuickActions();
        this._bindSaveBtn();
        this._bindWeekModeToggle();

        // Nạp điểm danh đã có cho ngày hôm nay
        this._loadAttendanceForDate(this.date);

        // Auto-select first room
        if (this.rooms.length) this.selectRoom(this.rooms[0].ma_phong);
    }

    /* ===== NẠP ĐIỂM DANH ĐÃ LƯU ===== */
    async _loadAttendanceForDate(dateStr) {
        try {
            const res = await fetch(`/api/diemdanh/?ngay=${dateStr}&loai=${this.loai}`);
            if (!res.ok) return;
            const data = await res.json();
            const saved = data.records || {};
            // Merge vào this.records
            for (const [sid, rec] of Object.entries(saved)) {
                const key = this._recKey(parseInt(sid), dateStr);
                this.records[key] = { status: rec.status, ghi_chu: rec.ghi_chu || '' };
            }
            // Re-render nếu đang hiển thị
            if (this.activeRoom) {
                if (this.weekMode) this._renderWeekTable();
                else this._renderStudentTable();
            }
        } catch(e) {
            // Không gây crash – dữ liệu cũ giữ nguyên
        }
    }

    /* ===== ROOM LIST ===== */
    _renderRoomList() {
        const list = document.getElementById('dd-room-list');
        if (!list) return;
        const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
        list.innerHTML = this.rooms.map(r => {
            const students = this.students.filter(s => s[phongKey] === r.ma_phong);
            const done = students.every(s => this.records[this._recKey(s.id)] !== undefined);
            return `
            <li class="dd-room-item" data-room="${r.ma_phong}" id="room-item-${r.ma_phong}">
                <div class="dd-room-item-name">
                    <i class="fas fa-${this.loai === 'an' ? 'utensils' : 'bed'}"></i>
                    ${r.ma_phong}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
                    <span class="dd-room-count">${students.length}/${r.suc_chua}</span>
                    ${students.length > 0
                        ? `<span class="dd-room-item-status">${done
                            ? '<span class="badge badge-dadiemdanh" style="font-size:0.68rem;">✓ Xong</span>'
                            : '<span class="badge badge-chuadiemdanh" style="font-size:0.68rem;">● Chờ</span>'}</span>`
                        : ''}
                </div>
            </li>`;
        }).join('');

        list.querySelectorAll('.dd-room-item').forEach(el => {
            el.addEventListener('click', () => this.selectRoom(el.dataset.room));
        });
    }

    selectRoom(roomId) {
        this.activeRoom = roomId;
        document.querySelectorAll('.dd-room-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.getElementById(`room-item-${roomId}`);
        if (activeEl) activeEl.classList.add('active');
        if (this.weekMode) {
            this._renderWeekTable();
        } else {
            this._renderStudentTable();
        }
    }

    /* ===== DATE PICKER ===== */
    _bindDatePicker() {
        const picker = document.getElementById('dd-date');
        if (!picker) return;
        picker.value = this.date;
        picker.addEventListener('change', (e) => {
            this.date = e.target.value;
            this._loadAttendanceForDate(this.date).then(() => {
                if (this.weekMode) this._renderWeekTable();
                else this._renderStudentTable();
            });
        });
    }

    /* ===== WEEK MODE TOGGLE ===== */
    _bindWeekModeToggle() {
        const btn = document.getElementById('btn-week-mode');
        if (!btn) return;
        btn.addEventListener('click', () => {
            this.weekMode = !this.weekMode;
            btn.classList.toggle('active', this.weekMode);
            btn.innerHTML = this.weekMode
                ? '<i class="fas fa-table"></i> Chế độ nhập tuần <span class="badge-on">BẬT</span>'
                : '<i class="fas fa-table"></i> Chế độ nhập tuần';
            if (this.activeRoom) {
                if (this.weekMode) this._renderWeekTable();
                else this._renderStudentTable();
            }
        });
    }

    /* ===== WEEK MODE TABLE ===== */
    _renderWeekTable() {
        const container = document.getElementById('dd-student-area');
        if (!container) return;

        const room     = this.activeRoom;
        const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
        const students = this.students.filter(s => s[phongKey] === room);

        // Tính 5 ngày T2–T6 của tuần đang chọn
        const baseDate = this.date ? new Date(this.date + 'T00:00:00') : new Date();
        const monday   = _getMonday(baseDate);
        const weekDays = Array.from({length: 5}, (_, i) => _addDays(monday, i)); // T2–T6

        // Update header với search inline bên phải
        const fromStr = _fmtD(monday);
        const toStr   = _fmtD(_addDays(monday, 4));
        const mainHeader = document.querySelector('.dd-main-header');
        if (mainHeader) {
            mainHeader.innerHTML = `
            <div class="dd-main-header-info">
                <h3 id="dd-room-title">Phòng ${room} – Chế độ nhập tuần</h3>
                <p id="dd-room-subtitle">Tuần: ${fromStr} – ${toStr} &nbsp;|&nbsp; ${students.length} học sinh</p>
            </div>
            <div class="dd-search-inline">
                <i class="fas fa-search"></i>
                <input type="text" id="dd-search-input" placeholder="Tìm học sinh..." autocomplete="off">
                <span class="dd-search-count" id="dd-search-count">${students.length} HS</span>
            </div>`;
        }

        if (!students.length) {
            container.innerHTML = `<div class="dd-empty"><i class="fas fa-users"></i><h3>Phòng chưa có học sinh</h3><p>Admin cần phân bổ học sinh vào phòng này trước.</p></div>`;
            return;
        }

        // Pre-fill defaults for all days
        weekDays.forEach(d => {
            const dateStr = _fmtISO(d);
            students.forEach(s => {
                const key = this._recKey(s.id, dateStr);
                if (this.records[key] === undefined) {
                    this.records[key] = { status: 0, ghi_chu: '' };
                }
            });
        });

        const dayHeaders = weekDays.map((d, i) => {
            const label = _DOWS[d.getDay()];
            const dateStr = _fmtD(d);
            const isToday = _fmtISO(d) === this.date;
            return `<th class="dd-week-th ${isToday ? 'today' : ''}">${label}<br><span class="dd-week-date">${dateStr}</span></th>`;
        }).join('');

        const statusSymbols = { 0: '✔', 1: 'V', 3: 'P' };
        const statusClasses  = { 0: 'wk-comat', 1: 'wk-vang', 3: 'wk-phep' };
        const statusLabels   = { 0: 'Có mặt', 1: 'Vắng', 3: 'Phép' };

        const rows = students.map((s, i) => {
            const cells = weekDays.map(d => {
                const dateStr = _fmtISO(d);
                const key     = this._recKey(s.id, dateStr);
                const st      = this.records[key]?.status ?? 0;
                return `<td><button class="dd-week-cell ${statusClasses[st]}"
                    data-student="${s.id}" data-date="${dateStr}" data-status="${st}"
                    title="${statusLabels[st]}">${statusSymbols[st]}</button></td>`;
            }).join('');
            return `<tr id="wk-row-${s.id}">
                <td class="dd-stt">${i+1}</td>
                <td><div class="dd-name">${s.ho_ten}</div><div class="dd-class">${s.lop}</div></td>
                ${cells}
                <td><input class="dd-note-input" type="text" placeholder="Ghi chú..."
                    value="${this.records[this._recKey(s.id, _fmtISO(weekDays[0]))]?.ghi_chu || ''}"
                    data-student="${s.id}"></td>
            </tr>`;
        }).join('');

        container.innerHTML = `
        <div class="dd-week-info-bar">
            <i class="fas fa-info-circle"></i>
            Nhấn vào ô điểm danh để đổi trạng thái: <strong>✔ Có mặt</strong> → <strong style="color:#e74c3c">V Vắng</strong> → <strong style="color:#e67e22">P Phép</strong>
        </div>
        <div class="dd-table-wrapper">
            <table class="dd-table dd-week-table">
                <thead>
                    <tr>
                        <th class="dd-stt">#</th>
                        <th>Học sinh</th>
                        ${dayHeaders}
                        <th>Ghi chú</th>
                    </tr>
                </thead>
                <tbody id="dd-tbody">${rows}</tbody>
            </table>
        </div>`;

        // Bind click cycle: 0 → 1 → 3 → 0
        const cycle = { 0: 1, 1: 3, 3: 0 };
        container.querySelectorAll('.dd-week-cell').forEach(btn => {
            btn.addEventListener('click', () => {
                const sid    = parseInt(btn.dataset.student);
                const date   = btn.dataset.date;
                const key    = this._recKey(sid, date);
                const curSt  = this.records[key]?.status ?? 0;
                const newSt  = cycle[curSt];
                this.records[key] = { ...this.records[key], status: newSt };
                btn.dataset.status = newSt;
                btn.className = `dd-week-cell ${statusClasses[newSt]}`;
                btn.textContent = statusSymbols[newSt];
                btn.title = statusLabels[newSt];
                this._updateWeekSummary(students, weekDays);
            });
        });

        // Bind note inputs
        container.querySelectorAll('.dd-note-input').forEach(inp => {
            inp.addEventListener('input', e => {
                const sid = parseInt(e.target.dataset.student);
                // Ghi chú áp dụng cho ngày đầu tuần (hoặc có thể mở rộng sau)
                const key = this._recKey(sid, _fmtISO(weekDays[0]));
                if (this.records[key]) this.records[key].ghi_chu = e.target.value;
            });
        });

        this._updateWeekSummary(students, weekDays);
        this._bindSearch(students);
    }

    _updateWeekSummary(students, weekDays) {
        let comat = 0, vang = 0, phep = 0;
        students.forEach(s => {
            weekDays.forEach(d => {
                const st = this.records[this._recKey(s.id, _fmtISO(d))]?.status ?? 0;
                if (st === 0) comat++;
                else if (st === 1) vang++;
                else if (st === 3) phep++;
            });
        });
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('sum-comat', comat); set('sum-vang', vang); set('sum-phep', phep);
    }

    /* ===== STUDENT TABLE (chế độ ngày đơn) ===== */
    _renderStudentTable() {
        const container = document.getElementById('dd-student-area');
        if (!container) return;

        const room     = this.activeRoom;
        const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
        const students = this.students.filter(s => s[phongKey] === room);

        // Update header với search inline bên phải
        const mainHeader = document.querySelector('.dd-main-header');
        if (mainHeader) {
            mainHeader.innerHTML = `
            <div class="dd-main-header-info">
                <h3 id="dd-room-title">Phòng ${room}</h3>
                <p id="dd-room-subtitle">Ngày ${Utils.formatDate(this.date)} &nbsp;|&nbsp; ${students.length} học sinh</p>
            </div>
            <div class="dd-search-inline">
                <i class="fas fa-search"></i>
                <input type="text" id="dd-search-input" placeholder="Tìm học sinh..." autocomplete="off">
                <span class="dd-search-count" id="dd-search-count">${students.length} HS</span>
            </div>`;
        }

        if (!students.length) {
            container.innerHTML = `<div class="dd-empty"><i class="fas fa-users"></i><h3>Phòng chưa có học sinh</h3><p>Admin cần phân bổ học sinh vào phòng này trước.</p></div>`;
            this._updateSummary(students);
            return;
        }

        students.forEach(s => {
            const key = this._recKey(s.id);
            if (this.records[key] === undefined) {
                this.records[key] = { status: 0, ghi_chu: '' };
            }
        });

        container.innerHTML = `
        <div class="dd-table-wrapper">
            <table class="dd-table">
                <thead>
                    <tr>
                        <th class="dd-stt">#</th>
                        <th>Học sinh</th>
                        <th>Lớp</th>
                        <th>Trạng thái</th>
                        <th>Ghi chú</th>
                    </tr>
                </thead>
                <tbody id="dd-tbody"></tbody>
            </table>
        </div>`;

        const tbody = document.getElementById('dd-tbody');
        tbody.innerHTML = students.map((s, i) => {
            const rec = this.records[this._recKey(s.id)];
            return `
            <tr id="dd-row-${s.id}">
                <td class="dd-stt">${i + 1}</td>
                <td><div class="dd-name">${s.ho_ten}</div></td>
                <td><span class="badge badge-primary">${s.lop}</span></td>
                <td>
                    <div class="dd-status-group" data-student="${s.id}">
                        ${this._statusBtn(0, 'check', 'Có mặt', rec.status)}
                        ${this._statusBtn(1, 'times', 'Vắng',   rec.status)}
                        ${this._statusBtn(3, 'file-alt', 'Phép', rec.status)}
                    </div>
                </td>
                <td>
                    <input class="dd-note-input" type="text"
                        placeholder="Ghi chú..."
                        value="${rec.ghi_chu}"
                        data-student="${s.id}">
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.dd-status-group').forEach(group => {
            group.querySelectorAll('.dd-status-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sid    = parseInt(group.dataset.student);
                    const status = parseInt(btn.dataset.status);
                    this.records[this._recKey(sid)].status = status;
                    group.querySelectorAll('.dd-status-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this._updateSummary(students);
                    this._refreshRoomBadge();
                });
            });
        });

        tbody.querySelectorAll('.dd-note-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const sid = parseInt(e.target.dataset.student);
                this.records[this._recKey(sid)].ghi_chu = e.target.value;
            });
        });

        this._updateSummary(students);
        this._bindSearch(students);
    }

    _statusBtn(status, icon, label, selected) {
        return `<button class="dd-status-btn ${selected === status ? 'selected' : ''}" data-status="${status}">
            <i class="fas fa-${icon}"></i>${label}</button>`;
    }

    /* ===== SEARCH (dùng chung cho cả 2 chế độ) ===== */
    _bindSearch(students) {
        const searchInput = document.getElementById('dd-search-input');
        const countBadge  = document.getElementById('dd-search-count');
        if (!searchInput) return;
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            let visible = 0;
            document.querySelectorAll('#dd-tbody tr').forEach(row => {
                const name = row.querySelector('.dd-name')?.textContent.toLowerCase() || '';
                const lop  = row.querySelector('.dd-class, .badge')?.textContent.toLowerCase() || '';
                const match = !q || name.includes(q) || lop.includes(q);
                row.style.display = match ? '' : 'none';
                if (match) visible++;
            });
            if (countBadge) countBadge.textContent = `${visible}/${students.length} HS`;
        });
        setTimeout(() => searchInput.focus(), 80);
    }

    _bindQuickActions() {
        document.getElementById('btn-all-present')?.addEventListener('click', () => {
            const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
            const students = this.students.filter(s => s[phongKey] === this.activeRoom);
            if (this.weekMode) {
                const baseDate = this.date ? new Date(this.date + 'T00:00:00') : new Date();
                const monday = _getMonday(baseDate);
                const weekDays = Array.from({length: 5}, (_, i) => _addDays(monday, i));
                students.forEach(s => {
                    weekDays.forEach(d => {
                        const key = this._recKey(s.id, _fmtISO(d));
                        this.records[key] = { status: 0, ghi_chu: this.records[key]?.ghi_chu || '' };
                    });
                });
                this._renderWeekTable();
            } else {
                students.forEach(s => this.records[this._recKey(s.id)] = { status: 0, ghi_chu: this.records[this._recKey(s.id)]?.ghi_chu || '' });
                this._renderStudentTable();
            }
            Toast.success('Đánh dấu tất cả Có mặt');
        });
        document.getElementById('btn-all-vang')?.addEventListener('click', () => {
            const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
            const students = this.students.filter(s => s[phongKey] === this.activeRoom);
            if (this.weekMode) {
                const baseDate = this.date ? new Date(this.date + 'T00:00:00') : new Date();
                const monday = _getMonday(baseDate);
                const weekDays = Array.from({length: 5}, (_, i) => _addDays(monday, i));
                students.forEach(s => {
                    weekDays.forEach(d => {
                        const key = this._recKey(s.id, _fmtISO(d));
                        this.records[key] = { status: 1, ghi_chu: this.records[key]?.ghi_chu || '' };
                    });
                });
                this._renderWeekTable();
            } else {
                students.forEach(s => this.records[this._recKey(s.id)] = { status: 1, ghi_chu: this.records[this._recKey(s.id)]?.ghi_chu || '' });
                this._renderStudentTable();
            }
            Toast.warning('Đánh dấu tất cả Vắng');
        });
    }

    /* ===== SUMMARY BAR ===== */
    _updateSummary(students) {
        const counts = { comat: 0, vang: 0, phep: 0 };
        students.forEach(s => {
            const status = this.records[this._recKey(s.id)]?.status ?? 0;
            if (status === 0) counts.comat++;
            else if (status === 1) counts.vang++;
            else if (status === 3) counts.phep++;
        });
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('sum-comat', counts.comat);
        set('sum-vang',  counts.vang);
        set('sum-phep',  counts.phep);
    }

    _refreshRoomBadge() {
        const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
        const students = this.students.filter(s => s[phongKey] === this.activeRoom);
        const allDone  = students.length > 0 && students.every(s => this.records[this._recKey(s.id)] !== undefined);
        const el = document.querySelector(`#room-item-${this.activeRoom} .dd-room-item-status`);
        if (el) {
            el.innerHTML = allDone
                ? '<span class="badge badge-dadiemdanh" style="font-size:0.68rem;">✓ Xong</span>'
                : '<span class="badge badge-chuadiemdanh" style="font-size:0.68rem;">● Chờ</span>';
        }
    }

    /* ===== SAVE ===== */
    _bindSaveBtn() {
        document.getElementById('btn-save-dd')?.addEventListener('click', async () => {
            const phongKey = this.loai === 'an' ? 'phong_an' : 'phong_ngu';
            const students = this.students.filter(s => s[phongKey] === this.activeRoom);
            if (!students.length) { Toast.warning('Phòng không có học sinh.'); return; }

            let records;
            if (this.weekMode) {
                const baseDate = this.date ? new Date(this.date + 'T00:00:00') : new Date();
                const monday   = _getMonday(baseDate);
                const weekDays = Array.from({length: 5}, (_, i) => _addDays(monday, i));
                records = [];
                students.forEach(s => {
                    weekDays.forEach(d => {
                        const dateStr = _fmtISO(d);
                        const key     = this._recKey(s.id, dateStr);
                        records.push({
                            ma_hs:   s.id,
                            ngay:    dateStr,
                            status:  this.records[key]?.status ?? 0,
                            ghi_chu: this.records[key]?.ghi_chu || '',
                        });
                    });
                });
            } else {
                records = students.map(s => ({
                    ma_hs:   s.id,
                    ngay:    this.date,
                    status:  this.records[this._recKey(s.id)]?.status ?? 0,
                    ghi_chu: this.records[this._recKey(s.id)]?.ghi_chu || '',
                }));
            }

            try {
                const res = await fetch('/api/diemdanh/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': _getCsrfToken(),
                    },
                    body: JSON.stringify({ loai: this.loai, records }),
                });
                const data = await res.json();
                if (res.ok && data.ok) {
                    if (this.weekMode) {
                        Toast.success(`Đã lưu ${data.saved} bản ghi điểm danh tuần – phòng ${this.activeRoom}`);
                    } else {
                        this._refreshRoomBadge();
                        Toast.success(`Đã lưu điểm danh phòng ${this.activeRoom} — ${Utils.formatDate(this.date)}`);
                    }
                } else {
                    Toast.error('Lỗi khi lưu điểm danh. Vui lòng thử lại.');
                }
            } catch(e) {
                Toast.error('Không kết nối được với máy chủ.');
            }
        });
    }
}

/* ── Lấy CSRF token từ cookie ── */
function _getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
        c = c.trim();
        if (c.startsWith(name + '=')) return decodeURIComponent(c.slice(name.length + 1));
    }
    return '';
}

/* ── Init: được gọi từ từng page template ── */
function initDiemDanhAn() {
    window.ddManager = new DiemDanhManager('an', 'phong_an');
}
function initDiemDanhNgu() {
    window.ddManager = new DiemDanhManager('ngu', 'phong_ngu');
}

// Biến toàn cục để buildAttendancePrintHTML truy cập (fallback mock)
const allStudents = MOCK_STUDENTS;

/* ============================================================
   HÀM IN DANH SÁCH ĐIỂM DANH (xuất từng phòng riêng)
   ============================================================ */

/**
 * Hiển thị dialog chọn phòng + năm học trước khi in/xuất
 * @param {string} loai  'an' | 'ngu'
 * @param {string} mode  'pdf' | 'excel'
 */
function showExportDialog(loai, mode) {
    const phongField  = loai === 'ngu' ? 'phong_ngu' : 'phong_an';
    // Lấy TẤT CẢ phòng từ ddManager (không chỉ phòng có HS)
    const allStudents = window.ddManager ? [...window.ddManager.students] : [...MOCK_STUDENTS];
    const allRooms    = window.ddManager
        ? window.ddManager.rooms.map(r => r.ma_phong).sort()
        : [...new Set(allStudents.map(s => s[phongField]))].sort();

    const dateInput = document.getElementById('dd-date');
    const baseDate  = dateInput?.value ? new Date(dateInput.value + 'T00:00:00') : new Date();
    const defaultThang = baseDate.getMonth() + 1;
    const defaultNam   = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const y = baseDate.getFullYear();
    const defaultNamHocStart = m >= 8 ? y : y - 1;

    const isAn = (loai === 'an');

    // Tạo dialog overlay
    const overlay = document.createElement('div');
    overlay.id = 'export-dialog-overlay';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;
        display:flex;align-items:center;justify-content:center;animation:fadeIn .2s;
    `;

    const roomOptions = allRooms.map(r =>
        `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;transition:background .15s;"
             onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''"
         >
            <input type="checkbox" value="${r}" checked
                style="width:16px;height:16px;accent-color:#6c5ce7;cursor:pointer;">
            <span style="font-size:.9rem;font-weight:600;color:#1a202c;">Phòng ${r}</span>
         </label>`
    ).join('');

    const accentGrad = loai === 'ngu'
        ? 'linear-gradient(135deg,#6c5ce7,#a29bfe)'
        : 'linear-gradient(135deg,#0ba360,#3cba92)';
    const accentColor = loai === 'ngu' ? '#6c5ce7' : '#0ba360';

    overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:28px 32px;width:450px;max-width:95vw;
                box-shadow:0 20px 60px rgba(0,0,0,.25);animation:slideUp .25s;max-height:92vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <div style="width:42px;height:42px;background:${accentGrad};border-radius:12px;
                        display:flex;align-items:center;justify-content:center;
                        box-shadow:0 4px 12px rgba(108,92,231,.35);flex-shrink:0">
                <i class="fas fa-${mode==='pdf'?'file-pdf':'file-excel'}" style="color:#fff;font-size:1.1rem;"></i>
            </div>
            <div>
                <div style="font-size:1.05rem;font-weight:800;color:#1a202c;">Xuất ${mode==='pdf'?'PDF':'Excel'} – Điểm danh ${loai==='ngu'?'Ngủ':'Ăn'} theo tháng</div>
                <div style="font-size:.8rem;color:#94a3b8;margin-top:2px;">In đủ 4 tuần học trong tháng</div>
            </div>
        </div>

        <!-- Năm học -->
        <div style="margin-bottom:14px;">
            <label style="font-size:.8rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Năm học</label>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                <input type="number" id="dlg-nam-hoc-start" value="${defaultNamHocStart}" min="2020" max="2100"
                    style="width:90px;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;
                           font-size:.9rem;font-weight:700;text-align:center;outline:none;"
                    onfocus="this.style.borderColor='${accentColor}'" onblur="this.style.borderColor='#e2e8f0'">
                <span style="font-size:1rem;color:#64748b;">–</span>
                <input type="number" id="dlg-nam-hoc-end" value="${defaultNamHocStart+1}" min="2020" max="2100"
                    style="width:90px;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;
                           font-size:.9rem;font-weight:700;text-align:center;outline:none;"
                    onfocus="this.style.borderColor='${accentColor}'" onblur="this.style.borderColor='#e2e8f0'">
            </div>
        </div>

        ${isAn ? `
        <!-- Tháng in (chỉ cho ĂN) -->
        <div style="margin-bottom:14px;">
            <label style="font-size:.8rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Tháng in</label>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                <input type="number" id="dlg-thang" min="1" max="12" value="${defaultThang}"
                    style="width:60px;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-weight:700;text-align:center;outline:none;"
                    onfocus="this.style.borderColor='${accentColor}'" onblur="this.style.borderColor='#e2e8f0'">
                <span style="font-size:1rem;color:#64748b;">/ năm</span>
                <input type="number" id="dlg-nam-thang" min="2020" max="2100" value="${defaultNam}"
                    style="width:90px;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-weight:700;text-align:center;outline:none;"
                    onfocus="this.style.borderColor='${accentColor}'" onblur="this.style.borderColor='#e2e8f0'">
            </div>
        </div>

        <!-- T5 dạy bù: 4 tuần (chỉ cho ĂN) -->
        <div style="margin-bottom:16px;">
            <label style="font-size:.8rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
                <i class="fas fa-calendar-plus" style="color:${accentColor};margin-right:4px;"></i>Dạy bù Thứ Năm (T5)
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;padding:10px 14px;
                        background:#f0fff8;border-radius:10px;border:1px solid rgba(11,163,96,.15);">
                ${[1,2,3,4].map(w =>
                    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.88rem;font-weight:600;' +
                    'color:#1a202c;padding:5px 10px;border-radius:8px;transition:background .15s;"' +
                    ' onmouseover="this.style.background=\'rgba(11,163,96,.1)\'" onmouseout="this.style.background=\'\'">'
                    + '<input type="checkbox" id="dlg-t5-w' + w + '" class="dlg-t5-chk"' +
                    ' style="width:14px;height:14px;accent-color:${accentColor};cursor:pointer;"> Tuần ' + w + '</label>'
                ).join('')}
            </div>
            <div style="font-size:.75rem;color:#94a3b8;margin-top:4px;">Tích vào tuần nào có lịch dạy bù Thứ Năm</div>
        </div>` : `
        <!-- T5 dạy bù: 1 tuần (chỉ cho NGỦ) -->
        <div style="margin-bottom:16px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                          font-size:.9rem;font-weight:600;color:#1a202c;">
                <input type="checkbox" id="dlg-t5-ngu"
                       style="width:16px;height:16px;accent-color:${accentColor};cursor:pointer;">
                <span><i class="fas fa-calendar-plus" style="color:${accentColor};margin-right:4px;"></i>Có dạy bù Thứ Năm (T5) tuần này</span>
            </label>
        </div>`}


        <!-- Chọn phòng -->
        <div style="margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <label style="font-size:.8rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Chọn phòng</label>
                <div style="display:flex;gap:8px;">
                    <button onclick="document.querySelectorAll('#export-dialog-overlay input[type=checkbox][value]').forEach(c=>c.checked=true)"
                        style="font-size:.75rem;color:#6c5ce7;background:none;border:none;cursor:pointer;font-weight:700;">Chọn tất cả</button>
                    <span style="color:#d1d5db">|</span>
                    <button onclick="document.querySelectorAll('#export-dialog-overlay input[type=checkbox][value]').forEach(c=>c.checked=false)"
                        style="font-size:.75rem;color:#94a3b8;background:none;border:none;cursor:pointer;font-weight:700;">Bỏ chọn</button>
                </div>
            </div>
            <div style="border:1.5px solid #e8f0fe;border-radius:12px;padding:4px;max-height:180px;overflow-y:auto;">
                ${roomOptions}
            </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="dlg-cancel" style="padding:9px 20px;border-radius:10px;border:1.5px solid #e2e8f0;
                background:#fff;color:#64748b;font-size:.88rem;font-weight:600;cursor:pointer;"
                onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Hủy</button>
            <button id="dlg-confirm" style="padding:9px 22px;border-radius:10px;border:none;
                background:${accentGrad};color:#fff;
                font-size:.88rem;font-weight:700;cursor:pointer;
                box-shadow:0 4px 12px rgba(108,92,231,.35);"
                onmouseover="this.style.opacity='.9'" onmouseout="this.style.opacity='1'">
                <i class="fas fa-${mode==='pdf'?'print':'download'}" style="margin-right:6px;"></i>Xuất ${mode==='pdf'?'PDF':'Excel'}
            </button>
        </div>
    </div>
    <style>
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    </style>`;

    document.body.appendChild(overlay);

    // Đồng bộ 2 input năm học
    document.getElementById('dlg-nam-hoc-start').addEventListener('input', e => {
        const v = parseInt(e.target.value);
        if (!isNaN(v)) document.getElementById('dlg-nam-hoc-end').value = v + 1;
    });
    document.getElementById('dlg-nam-hoc-end').addEventListener('input', e => {
        const v = parseInt(e.target.value);
        if (!isNaN(v)) document.getElementById('dlg-nam-hoc-start').value = v - 1;
    });

    // Nút Hủy
    document.getElementById('dlg-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Nút Xuất
    document.getElementById('dlg-confirm').addEventListener('click', () => {
        const checked = [...overlay.querySelectorAll('input[type=checkbox][value]:checked')].map(c => c.value);
        if (!checked.length) { alert('Vui lòng chọn ít nhất một phòng.'); return; }

        const namHocStart = parseInt(document.getElementById('dlg-nam-hoc-start').value) || defaultNamHocStart;
        const namHocEnd   = parseInt(document.getElementById('dlg-nam-hoc-end').value)   || namHocStart + 1;

        // *** ĐỌC TẤT CẢ GIÁ TRỊ TRƯỚC KHI XÓA OVERLAY ***
        let thang, namThang, includeT5PerWeek, includeT5Ngu;
        if (isAn) {
            thang            = parseInt(document.getElementById('dlg-thang')?.value)     || defaultThang;
            namThang         = parseInt(document.getElementById('dlg-nam-thang')?.value) || defaultNam;
            includeT5PerWeek = [1,2,3,4].map(w => document.getElementById(`dlg-t5-w${w}`)?.checked || false);
        } else {
            includeT5Ngu = document.getElementById('dlg-t5-ngu')?.checked || false;
        }

        overlay.remove();

        if (mode === 'pdf') {
            let css, bodies, roomBodies;
            if (isAn) {
                // ĂN: in 4 tuần theo tháng, khổ ngang
                ({ css, bodies, roomBodies } = buildAnMonthlyPrintHTML(checked, thang, namThang, namHocStart, namHocEnd, includeT5PerWeek));
            } else {
                // NGỦ: in 1 tuần như cũ
                ({ css, bodies, roomBodies } = buildAttendancePrintHTML(loai, includeT5Ngu, checked, namHocStart, namHocEnd));
            }

            const isLandscape = (loai === 'an');
            const pageMargin  = isLandscape ? '0.8cm 0.8cm 1.2cm 1cm' : '1.2cm 0.8cm 1.6cm 1.2cm';

            const extraPageCss = `
@page {
    size: A4 ${isLandscape ? 'landscape' : 'portrait'};
    margin: ${pageMargin};
}`;

            const fullHtml = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title></title><style>${css}${extraPageCss}</style></head><body>
${bodies}
<script>window.onload=()=>setTimeout(window.print,400);<\/script>
</body></html>`;

            const w = window.open('', '_blank');
            if (!w) { alert('Trình duyệt chặn popup! Vui lòng cho phép popup.'); return; }
            w.document.write(fullHtml);
            w.document.close();

        } else {
            // Excel: dùng biến đã đọc trước khi overlay bị xóa
            const includeT5 = isAn
                ? (includeT5PerWeek?.[0] || false)
                : (includeT5Ngu || false);
            exportAttendanceExcel(loai, includeT5, checked, namHocStart, namHocEnd);
        }
    });
}

/**
 * Tạo HTML cho một phòng được in riêng
 */
function buildRoomPrintHTML(loai, room, roomStudents, weekDays, weekNum, fromTo, monday, namHocStart, namHocEnd) {
    const isNgu    = loai === 'ngu';
    const title    = isNgu ? 'ĐIỂM DANH NGỦ TRƯA' : 'ĐIỂM DANH ĂN TRƯA';
    const thoiGian = isNgu ? '11g45–13g00' : '11g00–11g45';
    const moPhong  = isNgu ? '11g35 đến 11g45' : '';

    const today    = new Date();
    const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`;

    const numDays = weekDays.length;
    // NGỦ: cột ngày nhỏ hơn (chỉ tích x) → 6%; ĂN: giữ nguyên 8–9%
    const dayPct  = isNgu ? 6 : (numDays <= 4 ? 9 : 8);
    // NGỦ: fixed cols = stt(4)+msbt(6)+gt(4)+lop(6)+phong(5)+phong(5)+ghi(7) = 37%
    //       namePct = 100 - 37 - numDays*6 = 63 - numDays*6
    // NGỦ: fixed cols = stt(4)+msbt(6)+gt(4)+lop(6)+phong_ngu(5)+ghi(7) = 32% → namePct = 68-N*6
    // (Không có cột Phòng Ăn)
    const namePct = isNgu
        ? Math.max(20, 68 - numDays * dayPct)  // NGỦ: đủ 100% không bị tràn
        : Math.max(18, 56 - numDays * dayPct); // ĂN: giữ nguyên
    const numCols = (isNgu ? 7 : 8) + numDays; // NGỦ bỏ cột phòng ăn

    // Hàm lấy khối an toàn: từ trường khoi (số) hoặc parse từ lop
    const _getKhoi = s => (typeof s.khoi === "number") ? s.khoi : (parseInt(String(s.lop||"").slice(0,2)) || 0);
    const total10 = roomStudents.filter(s => _getKhoi(s) === 10).length;
    const total11 = roomStudents.filter(s => _getKhoi(s) === 11).length;
    const total12 = roomStudents.filter(s => _getKhoi(s) === 12).length;

    const dayTH = weekDays.map(d =>
        isNgu
            ? `<th class="col-day">${_DOWS[d.getDay()]}</th>`
            : `<th class="col-day">${_DOWS[d.getDay()]}<br><small>${_p2(d.getDate())}/${_p2(d.getMonth()+1)}</small></th>`
    ).join('');

    const dataRows = roomStudents.map((s, i) => {
        const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
        const dayCells = weekDays.map(() => `<td class="col-day"></td>`).join('');
        return `<tr>
            <td class="col-stt">${i+1}</td>
            <td class="col-msbt">${s.ma_so_bt}</td>
            <td class="col-ten">${s.ho_ten}</td>
            <td class="col-gt">${gt}</td>
            <td class="col-lop">${s.lop}</td>
            <td class="col-phong">${s.phong_ngu}</td>
            ${isNgu ? '' : `<td class="col-phong">${s.phong_an}</td>`}
            ${dayCells}
            <td class="col-ghichu"></td>
        </tr>`;
    }).join('');

    // Lưu ý tách thành các dòng riêng
    const thoiGianRow = isNgu
        ? `<tr><td colspan="${numCols}" style="border:none;padding:0 0 3px 0;">
              <table style="width:100%;border-collapse:collapse;"><tr>
                <td style="width:22%;border:none;"></td>
                <td style="border:none;text-align:center;font-weight:bold;font-family:'Times New Roman',Times,serif;font-size:13pt;padding:2px 8px;">Thời gian ngủ trưa: ${thoiGian}</td>
              </tr></table>
           </td></tr>`
        : '';
    const luuY1 = isNgu
        ? `Bắt đầu mở cửa phòng ngủ lúc ${moPhong}`
        : `<strong>Thời gian bán trú: ${thoiGian}</strong>`;
    const luuY2 = isNgu
        ? `Lưu ý: KHÔNG được ra ngoài trong giờ nghỉ trưa; Nên đi vệ sinh trước giờ ngủ; KHÔNG ĂN-UỐNG, KHÔNG sử dụng điện thoại trong thời gian bán trú. HS vào sau 11g45 sẽ bị ghi nhận trễ.`
        : `Lưu ý: HS phải có mặt đúng giờ, KHÔNG ăn đồ mang vào từ bên ngoài. Trang phục gọn gàng khi vào phòng ăn.`;

    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:10pt; color:#000; background:#fff; }
/* PAGE BREAK PER ROOM */
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
/* DATA TABLE (bao gồm cả header + lưu ý trong thead) */
.dt { width:100%; border-collapse:collapse; font-size:9pt; }
/* Header rows inside thead – không kẻ viền */
.dt thead tr.hdr-row td  { border:none; padding:0; }
.dt thead tr.ly-row  td  { border:none; padding:2px 4px; font-size:${isNgu ? '10pt' : '8.5pt'}; line-height:1.55; text-align:left; }
/* inner header table (tên trường + tiêu đề) */
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner td { border:none; padding:4px 8px; vertical-align:middle; }
.hdr-school { width:22%; text-align:center; font-size:9.5pt; line-height:1.8; }
.hdr-title  { text-align:center; }
.hdr-title h1 { font-size:12pt; font-weight:bold; text-transform:uppercase; letter-spacing:.3px; }
.hdr-title h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title .nh { font-size:9pt; font-weight:normal; margin-top:1px; text-align:center; }
/* Column headers */
.dt th { border:${isNgu ? '0.8px' : '1.5px'} solid #333; padding:4px 3px; text-align:center;
         background:#ececec; font-weight:bold; vertical-align:middle;
         font-size:${isNgu ? '13pt' : '8.5pt'}; line-height:1.35; color:#000; }
/* Data cells */
.dt td { border:${isNgu ? '0.8px' : '1px'} solid #555; padding:3px 4px; vertical-align:middle; color:#000; font-family:'Times New Roman',Times,serif; font-size:${isNgu ? '13pt' : '9pt'}; }
.col-stt   { width:4%;  text-align:center; }
.col-msbt  { width:${isNgu ? 6 : 7}%;  text-align:center; font-weight:bold; }
.col-ten   { width:${namePct}%; }
td.col-ten { white-space:${isNgu ? 'normal' : 'nowrap'}; overflow:${isNgu ? 'visible' : 'hidden'}; ${isNgu ? '' : 'text-overflow:ellipsis; max-width:0;'} word-break:break-word; }
.col-gt    { width:${isNgu ? 4 : 5}%;  text-align:center; }
.col-lop   { width:${isNgu ? 6 : 7}%;  text-align:center; }
.col-phong { width:${isNgu ? 5 : 6}%;  text-align:center; }
.col-day   { width:${dayPct}%; text-align:center; height:28px; }
.col-ghichu { width:${isNgu ? 7 : 9}%; }
/* FOOTER */
.ft-wrap { width:100%; margin-top:10px; font-size:9pt; display:flex; justify-content:space-between; align-items:flex-start; page-break-inside:avoid; break-inside:avoid; }
.ft-left  { flex:1; }
.ft-right { flex:1; text-align:center; }
.sig-title { font-weight:bold; margin-top:3px; }
.sig-space { height:45px; }
.sig-name  { font-weight:bold; font-style:italic; }
/* THEAD REPEAT on every page – tắt cho NGỦ vì không cần lặp lại */
.dt thead { display: ${isNgu ? 'table-row-group' : 'table-header-group'}; }
/* PAGE SETUP */
@page {
    size: A4 portrait;
    margin: 1.2cm 0.8cm 1.4cm 1.2cm;
    @top-left    { content: none; }
    @top-center  { content: none; }
    @top-right   { content: none; }
    @bottom-center { content: none; }
    /* URL và số trang sẽ được thêm động bằng JS khi in */
}
@media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    * { color:#000 !important; }
    .dt th { background:#ececec !important; }
    td.col-ten { white-space:${isNgu ? 'normal' : 'nowrap'} !important; overflow:${isNgu ? 'visible' : 'hidden'} !important; ${isNgu ? 'word-break:break-word !important;' : 'text-overflow:ellipsis !important;'} }
    .dt thead { display: ${isNgu ? 'table-row-group' : 'table-header-group'} !important; }
}`;

    const body = `
<table class="dt">
  <thead>
    <!-- HEADER: tên trường + tiêu đề – lặp lại đầu mỗi trang -->
    <tr class="hdr-row">
      <td colspan="${numCols}">
        <table class="hdr-inner">
          <tr>
            <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
            <td class="hdr-title"><h1>${title} – PHÒNG ${room}</h1></td>
          </tr>
          <tr>
            <td class="hdr-title">
              <h2>3 KHỐI</h2>
              <div class="nh">NH: ${namHocStart} – ${namHocEnd}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- LƯU Ý – cũng lặp lại đầu mỗi trang -->
    ${thoiGianRow}
    <tr class="ly-row"><td colspan="${numCols}">${luuY1}</td></tr>
    <tr class="ly-row"><td colspan="${numCols}" style="${isNgu ? 'font-size:10pt;' : ''}">${luuY2}</td></tr>
    <!-- CỘT TIÊU ĐỀ -->
    <tr>
      <th rowspan="2" class="col-stt">ST<br>T</th>
      <th rowspan="2" class="col-msbt" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" class="col-ten">HỌ VÀ TÊN</th>
      <th rowspan="2" class="col-gt">GT</th>
      <th rowspan="2" class="col-lop">LỚP</th>
      <th rowspan="2" class="col-phong">P.<br>NGỦ</th>
      ${isNgu ? '' : '<th rowspan="2" class="col-phong">P.<br>ĂN</th>'}
      <th colspan="${numDays}" style="white-space:nowrap;">Tuần ${weekNum}: ${fromTo}</th>
      <th rowspan="2" class="col-ghichu">Ghi<br>chú</th>
    </tr>
    <tr>${dayTH}</tr>
  </thead>
  <tbody>${dataRows}</tbody>
</table>

<div class="ft-wrap">
  <div class="ft-left">
    <div>Danh sách có TC: &nbsp;<strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: &nbsp;<strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: &nbsp;<strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: &nbsp;<strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right">
    <div><em>${todayStr}</em></div>
    <div class="sig-title">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space"></div>
    <div class="sig-name">${window.SYS_CONFIG?.nguoi_phu_trach || 'Người phụ trách'}</div>
  </div>
</div>`;

    return { css, body };
}




/**
 * Hàm wrapper – trả về mảng HTML (mỗi phòng 1 phần tử)
 */
function buildAttendancePrintHTML(loai, includeT5 = false, selectedRooms = null, namHocStart = null, namHocEnd = null) {
    const phongField  = loai === 'ngu' ? 'phong_ngu' : 'phong_an';
    const dateInput   = document.getElementById('dd-date');
    const baseDate    = dateInput?.value ? new Date(dateInput.value + 'T00:00:00') : new Date();
    const monday      = _getMonday(baseDate);
    const allWeekDays = Array.from({length: 7}, (_, i) => _addDays(monday, i));
    const weekDays    = allWeekDays.filter(d => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return false;
        if (dow === 4) return includeT5;
        return true;
    });

    const m = monday.getMonth();
    const y = monday.getFullYear();
    if (!namHocStart) namHocStart = m >= 8 ? y : y - 1;
    if (!namHocEnd)   namHocEnd   = namHocStart + 1;

    const startYear = new Date(namHocStart, 8, 1);
    const weekNum   = Math.max(1, Math.ceil((monday - startYear) / (7 * 86400000)));
    const fromTo    = `${_p2(monday.getDate())}/${_p2(monday.getMonth()+1)}\u2013${_p2(_addDays(monday,4).getDate())}/${_p2(_addDays(monday,4).getMonth()+1)}/${monday.getFullYear()}`;

    // Lấy dữ liệu từ ddManager (thực tế), fallback sang MOCK nếu chưa init
    const allStudents = window.ddManager ? [...window.ddManager.students] : [...MOCK_STUDENTS];
    const allRooms    = window.ddManager
        ? window.ddManager.rooms.map(r => r.ma_phong).sort()
        : [...new Set(allStudents.map(s => s[phongField]))].sort();
    const rooms       = selectedRooms ? allRooms.filter(r => selectedRooms.includes(r)) : allRooms;

    const parts = rooms.map(room => {
        const roomStudents = allStudents.filter(s => s[phongField] === room);
        return buildRoomPrintHTML(loai, room, roomStudents, weekDays, weekNum, fromTo, monday, namHocStart, namHocEnd);
    });

    if (!parts.length) return { css: '', bodies: '', roomBodies: [] };

    const css        = parts[0].css;
    const roomBodies = parts.map(p => p.body);
    const bodies     = parts.map(p => `<div class="room-block">${p.body}</div>`).join('\n');

    return { css, bodies, roomBodies };
}

/* ============================================================
   ĂN TRƯ A – XUẤT PDF HÀNG THÁNG (KHỔ NGANG)
   ============================================================ */

/* ============================================================
   IN ĐIỂM DANH ĂN – THÁNG – KHỔ NGANG – 4 TUẦN HỌC
   ============================================================ */

/**
 * Tính ngày bán trú của một tuần (T2,T3,T4,T5?,T6)
 * @param {Date}    monday   Thứ Hai đầu tuần
 * @param {boolean} incT5    Có dạy bù T5 không
 * @returns {Date[]}
 */
function _getWeekBanTruDays(monday, incT5) {
    return [0, 1, 2, 3, 4]
        .map(i => _addDays(monday, i))
        .filter(d => {
            const dow = d.getDay(); // 1=T2 2=T3 3=T4 4=T5 5=T6
            if (dow === 0 || dow === 6) return false;
            if (dow === 4) return incT5; // T5 chỉ khi dạy bù
            return true;               // T2,T3,T4,T6 luôn có
        });
}

/** ============================================================
 *  buildAnMonthlyPrintHTML – ĂN trưa – tháng – 4 tuần – khổ ngang
 *  ============================================================ */
function buildAnMonthlyPrintHTML(selectedRooms, thang, namMonth, namHocStart, namHocEnd, includeT5PerWeek = [false,false,false,false]) {
    // Lấy dữ liệu từ ddManager (thực tế), fallback sang MOCK nếu chưa init
    const allStudents = window.ddManager ? [...window.ddManager.students] : [...MOCK_STUDENTS];
    const allRooms    = window.ddManager
        ? window.ddManager.rooms.map(r => r.ma_phong).sort()
        : [...new Set(allStudents.map(s => s.phong_an))].sort();
    const rooms       = selectedRooms ? allRooms.filter(r => selectedRooms.includes(r)) : allRooms;

    // Tính 4 tuần học trong tháng
    const mondays = _getMonthSchoolWeeks(namMonth, thang);
    if (!mondays.length) return { css: '', bodies: '', roomBodies: [] };

    // Tính ngày + metadata của từng tuần
    const weeksData = mondays.map((monday, wkIdx) => {
        const incT5  = includeT5PerWeek[wkIdx] || false;
        const days   = _getWeekBanTruDays(monday, incT5);
        const wkNum  = _calcWeekNum(monday, namHocStart);
        const friday = _addDays(monday, 4);
        const label  = `Tuần ${wkNum}: ${_p2(monday.getDate())}/${_p2(monday.getMonth()+1)}–${_p2(friday.getDate())}/${_p2(friday.getMonth()+1)}`;
        return { days, wkNum, label };
    });

    const totalDays = weeksData.reduce((s, w) => s + w.days.length, 0);
    const numCols   = 6 + totalDays + 5; // fixed(6) + daysCols + sumCols(4) + ghiChu(1)

    const today    = new Date();
    const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`;
    const luuY     = `Lưu ý: HS di chuyển đến đúng vị trí/phòng ăn đã phân công; giữ gìn vệ sinh khu vực ăn và chấp hành điều động của thầy cô.`;

    // Header hàng 1: merged week labels
    const weekTH1 = weeksData.map(w =>
        `<th colspan="${w.days.length}" style="white-space:nowrap;border-left:1.5px solid #333;">${w.label}</th>`
    ).join('');

    // Header hàng 2: từng ngày
    const weekTH2 = weeksData.map(w =>
        w.days.map((d, di) =>
            `<th class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #333;"' : ''}>${d.getDate()}/${_p2(d.getMonth()+1)}<br><small>${_DOWS[d.getDay()]}</small></th>`
        ).join('')
    ).join('');

    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:8pt; color:#000; background:#fff; }
.room-block { page-break-before: always; }
.room-block:first-of-type { page-break-before: auto; }
.dt-an { width:100%; border-collapse:collapse; }
.dt-an thead tr.hdr-row-an td { border:none; padding:0; }
.dt-an thead tr.ly-row-an td  { border:none; padding:2px 4px; font-size:8pt; line-height:1.4; }
.hdr-inner-an { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner-an td { border:none; padding:3px 6px; vertical-align:middle; }
.hdr-school-an { width:20%; text-align:center; font-size:8.5pt; line-height:1.6; }
.hdr-title-an  { text-align:center; }
.hdr-title-an h1 { font-size:13pt; font-weight:bold; text-transform:uppercase; }
.hdr-title-an h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title-an .nh-an { font-size:9pt; margin-top:2px; }
.dt-an th { border:0.8px solid #333; padding:2px 2px; text-align:center;
            background:#ececec; font-weight:bold; vertical-align:middle;
            font-size:8pt; line-height:1.2; color:#000; word-break:keep-all; }
.dt-an td { border:0.8px solid #555; padding:2px 2px; vertical-align:middle; color:#000; font-size:8pt; }
.col-stt-an    { width:4mm;  text-align:center; }
.col-msbt-an   { width:8mm;  text-align:center; font-weight:bold; }
.col-ten-an    { width:40mm; }
.col-gt-an     { width:7mm;  text-align:center; }
.col-lop-an    { width:10mm; text-align:center; }
.col-phong-an  { width:9mm;  text-align:center; }
.col-day-an    { width:6mm;  text-align:center; height:20px; white-space:nowrap; }
.col-sum-an    { width:13mm; text-align:center; font-weight:bold; background:#f0fff0; }
.col-ghichu-an { width:11mm; }
.ft-wrap-an { width:100%; margin-top:8px; font-size:8.5pt; display:flex; justify-content:space-between; }
.ft-left-an  { flex:1; }
.ft-right-an { flex:1; text-align:center; }
.sig-space-an { height:38px; }
.dt-an thead { display: table-header-group; }
@page { size: A4 landscape; margin: 0.8cm 0.8cm 1.2cm 1cm; }
@media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    * { color:#000 !important; }
    .dt-an th { background:#ececec !important; }
    .col-sum-an { background:#f0fff0 !important; }
    .dt-an thead { display: table-header-group !important; }
}`;

    const parts = rooms.map(room => {
        const roomStudents = allStudents.filter(s => s.phong_an === room);
        const total10 = roomStudents.filter(s => s.khoi === 10).length;
        const total11 = roomStudents.filter(s => s.khoi === 11).length;
        const total12 = roomStudents.filter(s => s.khoi === 12).length;

        const dataRows = roomStudents.map((s, i) => {
            const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
            const dayCells = weeksData.map((w, wi) =>
                w.days.map((d, di) =>
                    `<td class="col-day-an"${di === 0 ? ' style="border-left:1.5px solid #555;"' : ''}></td>`
                ).join('')
            ).join('');
            return `<tr>
                <td class="col-stt-an">${i+1}</td>
                <td class="col-msbt-an">${s.ma_so_bt}</td>
                <td class="col-ten-an">${s.ho_ten}</td>
                <td class="col-gt-an">${gt}</td>
                <td class="col-lop-an">${s.lop}</td>
                <td class="col-phong-an">${s.phong_an}</td>
                ${dayCells}
                <td class="col-sum-an">${totalDays}</td>
                <td class="col-sum-an"></td>
                <td class="col-sum-an"></td>
                <td class="col-sum-an">${totalDays}</td>
                <td class="col-ghichu-an"></td>
            </tr>`;
        }).join('');

        const body = `
<table class="dt-an">
  <thead>
    <tr class="hdr-row-an"><td colspan="${numCols}">
      <table class="hdr-inner-an"><tr>
        <td class="hdr-school-an" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
        <td class="hdr-title-an"><h1>ĐIỂM DANH ĂN TRƯA</h1></td>
      </tr><tr>
        <td class="hdr-title-an">
          <h2>NĂM HỌC ${namHocStart} – ${namHocEnd}</h2>
          <div class="nh-an">Thời gian: 11g00–11g45 &nbsp;|&nbsp; Tháng ${thang}/${namMonth} &nbsp;|&nbsp; Phòng ăn: ${room}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr class="ly-row-an"><td colspan="${numCols}">${luuY}</td></tr>
    <tr>
      <th rowspan="2" class="col-stt-an">ST<br>T</th>
      <th rowspan="2" class="col-msbt-an" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" class="col-ten-an">HỌC SINH</th>
      <th rowspan="2" class="col-gt-an">GT</th>
      <th rowspan="2" class="col-lop-an">LỚP</th>
      <th rowspan="2" class="col-phong-an">P.<br>ĂN</th>
      ${weekTH1}
      <th rowspan="2" class="col-sum-an">TS<br>Buổi ăn</th>
      <th rowspan="2" class="col-sum-an">SB<br>Vắng ăn</th>
      <th rowspan="2" class="col-sum-an">SB Vắng<br>ăn có P</th>
      <th rowspan="2" class="col-sum-an">Buổi ăn<br>thực tế</th>
      <th rowspan="2" class="col-ghichu-an">Ghi<br>chú</th>
    </tr>
    <tr>${weekTH2}</tr>
  </thead>
  <tbody>${dataRows}</tbody>
</table>
<div class="ft-wrap-an">
  <div class="ft-left-an">
    <div>Danh sách có TC: <strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: <strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: <strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: <strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right-an">
    <div><em>${todayStr}</em></div>
    <div style="font-weight:bold;margin-top:2px;">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space-an"></div>
    <div style="font-weight:bold;font-style:italic;">${window.SYS_CONFIG?.nguoi_phu_trach || 'Người phụ trách'}</div>
  </div>
</div>`;
        return { body };
    });

    if (!parts.length) return { css: '', bodies: '', roomBodies: [] };
    const roomBodies = parts.map(p => p.body);
    const bodies     = parts.map((p, i) =>
        `<div class="room-block">${p.body}</div>`
    ).join('\n');
    return { css, bodies, roomBodies };
}


/* ============================================================
   IN ĐIỂM DANH NGỦ – THÁNG – KHỔ DỌC – 4 TUẦN HỌC
   Mỗi tuần × mỗi phòng = 1 trang riêng
   ============================================================ */
function buildNguMonthlyPrintHTML(selectedRooms, thang, namMonth, namHocStart, namHocEnd, includeT5PerWeek = [false,false,false,false]) {
    const allStudents = [...MOCK_STUDENTS];
    const allRooms    = [...new Set(allStudents.map(s => s.phong_ngu))].sort();
    const rooms       = selectedRooms ? allRooms.filter(r => selectedRooms.includes(r)) : allRooms;
    const mondays     = _getMonthSchoolWeeks(namMonth, thang);
    if (!mondays.length || !rooms.length) return { css: '', bodies: '', roomBodies: [] };

    const today    = new Date();
    const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`;

    const css = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman',Times,serif; font-size:10pt; color:#000; background:#fff; }
.dt { width:100%; border-collapse:collapse; font-size:9pt; }
.dt thead tr.hdr-row td { border:none; padding:0; }
.dt thead tr.ly-row  td { border:none; padding:2px 4px; font-size:10pt; line-height:1.55; }
.hdr-inner { width:100%; border-collapse:collapse; margin-bottom:2px; }
.hdr-inner td { border:none; padding:4px 8px; vertical-align:middle; }
.hdr-school { width:22%; text-align:center; font-size:9.5pt; line-height:1.8; }
.hdr-title  { text-align:center; }
.hdr-title h1 { font-size:12pt; font-weight:bold; text-transform:uppercase; letter-spacing:.3px; }
.hdr-title h2 { font-size:10pt; font-weight:bold; margin-top:1px; }
.hdr-title .nh { font-size:9pt; margin-top:1px; }
.dt th { border:0.8px solid #333; padding:4px 3px; text-align:center;
         background:#ececec; font-weight:bold; vertical-align:middle;
         font-size:13pt; line-height:1.35; color:#000; }
.dt td { border:0.8px solid #555; padding:3px 4px; vertical-align:middle; color:#000; font-size:13pt; }
.col-stt    { width:4%;  text-align:center; }
.col-msbt   { width:6%;  text-align:center; font-weight:bold; }
.col-gt     { width:4%;  text-align:center; }
.col-lop    { width:6%;  text-align:center; }
.col-phong  { width:5%;  text-align:center; }
.col-day    { width:6%;  text-align:center; height:28px; }
.col-ghichu { width:7%; }
.ft-wrap { width:100%; margin-top:10px; font-size:9pt; display:flex; justify-content:space-between; align-items:flex-start; page-break-inside:avoid; break-inside:avoid; }
.ft-left  { flex:1; }
.ft-right { flex:1; text-align:center; }
.sig-title { font-weight:bold; margin-top:3px; }
.sig-space { height:45px; }
.sig-name  { font-weight:bold; font-style:italic; }
.dt thead { display:table-row-group; }
@page { size: A4 portrait; margin: 1.2cm 0.8cm 1.4cm 1.2cm; }
@media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    * { color:#000 !important; }
    .dt th { background:#ececec !important; }
}`;

    const roomBodies = [];
    const bodyParts  = [];
    let   blockCount = 0; // đếm tổng số block để biết có cần page-break không

    rooms.forEach(room => {
        const roomStudents = allStudents.filter(s => s.phong_ngu === room);
        const total10 = roomStudents.filter(s => s.khoi === 10).length;
        const total11 = roomStudents.filter(s => s.khoi === 11).length;
        const total12 = roomStudents.filter(s => s.khoi === 12).length;

        const weekBlocks = mondays.map((monday, wkIdx) => {
            const incT5    = includeT5PerWeek[wkIdx] || false;
            const weekDays = _getWeekBanTruDays(monday, incT5);
            const numDays  = weekDays.length;
            const weekNum  = _calcWeekNum(monday, namHocStart);
            const friday   = _addDays(monday, 4);
            const fromTo   = `${_p2(monday.getDate())}/${_p2(monday.getMonth()+1)}–${_p2(friday.getDate())}/${_p2(friday.getMonth()+1)}/${monday.getFullYear()}`;
            const namePct  = Math.max(20, 68 - numDays * 6);
            const numCols  = 7 + numDays;
            const isLast   = wkIdx === mondays.length - 1;
            const needBreak = blockCount > 0;
            blockCount++;

            const dayTH = weekDays.map(d =>
                `<th class="col-day">${_DOWS[d.getDay()]}</th>`
            ).join('');

            const dataRows = roomStudents.map((s, i) => {
                const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
                const dayCells = weekDays.map(() => `<td class="col-day"></td>`).join('');
                return `<tr>
                    <td class="col-stt">${i+1}</td>
                    <td class="col-msbt">${s.ma_so_bt}</td>
                    <td style="width:${namePct}%">${s.ho_ten}</td>
                    <td class="col-gt">${gt}</td>
                    <td class="col-lop">${s.lop}</td>
                    <td class="col-phong">${s.phong_ngu}</td>
                    ${dayCells}
                    <td class="col-ghichu"></td>
                </tr>`;
            }).join('');

            const footerHtml = isLast ? `
<div class="ft-wrap">
  <div class="ft-left">
    <div>Danh sách có TC: &nbsp;<strong>${roomStudents.length} HS</strong></div>
    <div>&nbsp;&nbsp;Lớp 10: &nbsp;<strong>${total10} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 11: &nbsp;<strong>${total11} hs</strong></div>
    <div>&nbsp;&nbsp;Lớp 12: &nbsp;<strong>${total12} hs</strong></div>
  </div>
  <div class="ft-right">
    <div><em>${todayStr}</em></div>
    <div class="sig-title">PHỤ TRÁCH BÁN TRÚ</div>
    <div class="sig-space"></div>
    <div class="sig-name">${window.SYS_CONFIG?.nguoi_phu_trach || 'Người phụ trách'}</div>
  </div>
</div>` : '';

            return `<div${needBreak ? ' style="page-break-before:always;"' : ''}>
<table class="dt">
  <thead>
    <tr class="hdr-row"><td colspan="${numCols}">
      <table class="hdr-inner"><tr>
        <td class="hdr-school" rowspan="2">Phân hiệu THPT<br><strong>Lê Thị Hồng Gấm</strong></td>
        <td class="hdr-title"><h1>ĐIỂM DANH NGỦ TRƯA – PHÒNG ${room}</h1></td>
      </tr><tr>
        <td class="hdr-title">
          <h2>Tháng ${thang}/${namMonth} – 3 KHỐI</h2>
          <div class="nh">NH: ${namHocStart} – ${namHocEnd}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr class="ly-row"><td colspan="${numCols}" style="text-align:center;font-weight:bold;">Thời gian ngủ trưa: 11g45–13g00 &nbsp;|&nbsp; Mở cửa phòng ngủ lúc 11g35 đến 11g45</td></tr>
    <tr class="ly-row"><td colspan="${numCols}">Lưu ý: KHÔNG được ra ngoài trong giờ nghỉ trưa; Nên đi vệ sinh trước giờ ngủ; KHÔNG ĂN-UỐNG, KHÔNG sử dụng điện thoại trong thời gian bán trú. HS vào sau 11g45 sẽ bị ghi nhận trễ.</td></tr>
    <tr>
      <th rowspan="2" class="col-stt">ST<br>T</th>
      <th rowspan="2" class="col-msbt" style="color:#c00;">Mã<br>số<br>BT</th>
      <th rowspan="2" style="width:${namePct}%">HỌ VÀ TÊN</th>
      <th rowspan="2" class="col-gt">GT</th>
      <th rowspan="2" class="col-lop">LỚP</th>
      <th rowspan="2" class="col-phong">P.<br>NGỦ</th>
      <th colspan="${numDays}" style="white-space:nowrap;">Tuần ${weekNum}: ${fromTo}</th>
      <th rowspan="2" class="col-ghichu">Ghi<br>chú</th>
    </tr>
    <tr>${dayTH}</tr>
  </thead>
  <tbody>${dataRows}</tbody>
</table>
${footerHtml}
</div>`;
        });

        const roomBody = weekBlocks.join('\n');
        bodyParts.push(roomBody);
        roomBodies.push(roomBody);
    });

    return { css, bodies: bodyParts.join('\n'), roomBodies };
}


function printAttendanceSheetNgu() {
    showExportDialog('ngu', 'pdf');
}

function printAttendanceSheetAn() {
    showExportDialog('an', 'pdf');
}



/* ============================================================
   XUẤT EXCEL (.xlsx) – dùng thư viện SheetJS
   ============================================================ */
/**
 * Xuất Excel – mỗi phòng là một sheet riêng
 * @param {string}   loai          'an' | 'ngu'
 * @param {boolean}  includeT5
 * @param {string[]} selectedRooms  Danh sách phòng muốn xuất (null = tất cả)
 * @param {number}   namHocStart
 * @param {number}   namHocEnd
 */
function exportAttendanceExcel(loai, includeT5 = false, selectedRooms = null, namHocStart = null, namHocEnd = null) {
    if (typeof XLSX === 'undefined') {
        alert('Thư viện SheetJS chưa tải xong. Vui lòng thử lại sau vài giây.');
        return;
    }

    const isNgu    = loai === 'ngu';
    const title    = isNgu ? 'ĐIỂM DANH NGỦ TRƯA' : 'ĐIỂM DANH ĂN TRƯA';
    const thoiGian = isNgu ? '11g45–13g00' : '11g00–11g45';
    const phongField = isNgu ? 'phong_ngu' : 'phong_an';

    const dateInput = document.getElementById('dd-date');
    const baseDate  = dateInput?.value ? new Date(dateInput.value + 'T00:00:00') : new Date();
    const monday    = _getMonday(baseDate);

    const allWeekDays = Array.from({length: 7}, (_, i) => _addDays(monday, i));
    const weekDays = allWeekDays.filter(d => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return false;
        if (dow === 4) return includeT5;
        return true;
    });

    // Năm học
    const m = monday.getMonth();
    const y = monday.getFullYear();
    if (!namHocStart) namHocStart = m >= 8 ? y : y - 1;
    if (!namHocEnd)   namHocEnd   = namHocStart + 1;

    const startYear = new Date(namHocStart, 8, 1);
    const weekNum   = Math.max(1, Math.ceil((monday - startYear) / (7 * 86400000)));

    const allStudents = [...MOCK_STUDENTS].sort((a, b) => a.ma_so_bt - b.ma_so_bt);
    const allRooms    = [...new Set(allStudents.map(s => s[phongField]))].sort();
    const rooms       = selectedRooms ? allRooms.filter(r => selectedRooms.includes(r)) : allRooms;

    const fromDate  = `${_p2(monday.getDate())}/${_p2(monday.getMonth()+1)}`;
    const toDate    = `${_p2(_addDays(monday,4).getDate())}/${_p2(_addDays(monday,4).getMonth()+1)}/${monday.getFullYear()}`;
    const weekLabel = `Tuần ${weekNum}: ${fromDate}–${toDate}`;

    const today    = new Date();
    const todayStr = `TP Hồ Chí Minh, ngày ${today.getDate()} tháng ${today.getMonth()+1} năm ${today.getFullYear()}`;

    const dayLabels = weekDays.map(d => `${_DOWS[d.getDay()]} ${_p2(d.getDate())}/${_p2(d.getMonth()+1)}`);
    const NUM_DAYS  = weekDays.length;
    const NUM_COLS  = 7 + NUM_DAYS + 1;  // STT MSBT Tên GT Lớp PNgủ PAn + ngày + Ghichú

    const luuY = isNgu
        ? `Lưu ý: KHÔNG được ra ngoài trong giờ nghỉ trưa. Nên đi vệ sinh trước giờ ngủ. KHÔNG ĂN-UỐNG, KHÔNG sử dụng điện thoại trong thời gian bán trú. HS vào sau 11g45 sẽ bị ghi nhận trễ.`
        : `Lưu ý: HS phải có mặt đúng giờ. KHÔNG ăn đồ mang vào từ bên ngoài. Trang phục gọn gàng khi vào phòng ăn.`;

    const HR          = 7;                    // Row header đầu tiên (0-based)
    const GHI_CHU_COL = 7 + NUM_DAYS;         // Cột Ghi chú

    const wb = XLSX.utils.book_new();

    rooms.forEach(room => {
        const roomStudents = allStudents.filter(s => s[phongField] === room);
        const total10 = roomStudents.filter(s => s.khoi === 10).length;
        const total11 = roomStudents.filter(s => s.khoi === 11).length;
        const total12 = roomStudents.filter(s => s.khoi === 12).length;

        const aoa = [
            // Row 0 – Tên trường + tiêu đề
            [window.SYS_CONFIG?.ten_truong || (window.SYS_CONFIG?.ten_truong || (window.SYS_CONFIG?.ten_truong || 'PHÂN HIỆU THPT LÊ THỊ HỒNG GẤM')), '', '', `${title} – PHÒNG ${room}`, ...new Array(NUM_COLS - 4).fill('')],
            // Row 1 – Năm học
            ['', '', '', `Năm học: ${namHocStart} – ${namHocEnd}`, ...new Array(NUM_COLS - 4).fill('')],
            // Row 2 – blank
            new Array(NUM_COLS).fill(''),
            // Row 3 – thời gian
            isNgu
                ? [`Bắt đầu mở cửa phòng ngủ lúc 11g35 đến 11g45  |  Thời gian ngủ trưa: ${thoiGian}`, ...new Array(NUM_COLS - 1).fill('')]
                : [`Thời gian ăn trưa: ${thoiGian}`, ...new Array(NUM_COLS - 1).fill('')],
            // Row 4 – lưu ý
            [luuY, ...new Array(NUM_COLS - 1).fill('')],
            // Row 5 – blank
            new Array(NUM_COLS).fill(''),
            // Row 6 – blank (spacer sau HR)
            new Array(NUM_COLS).fill(''),
            // Row 7 – Header 1
            ['STT', 'Mã\nsố BT', 'HỌ VÀ TÊN', 'GT', 'LỚP', 'P.\nNGỦ', 'P.\nĂN', weekLabel, ...new Array(NUM_DAYS - 1).fill(''), 'Ghi\nchú'],
            // Row 8 – Header 2 (các ngày)
            ['', '', '', '', '', '', '', ...dayLabels, ''],
        ];

        // Dữ liệu học sinh
        roomStudents.forEach((s, i) => {
            const gt = s.gioi_tinh === 0 ? 'Nam' : 'Nữ';
            aoa.push([i + 1, s.ma_so_bt, s.ho_ten, gt, s.lop, s.phong_ngu, s.phong_an, ...new Array(NUM_DAYS).fill(''), '']);
        });

        // Footer
        aoa.push(new Array(NUM_COLS).fill(''));
        aoa.push([`Phòng ${room} – Danh sách có TC: ${roomStudents.length} HS`, '', '', '', '', '', todayStr, ...new Array(NUM_DAYS - 1).fill(''), '']);
        aoa.push([`   Lớp 10: ${total10} hs`]);
        aoa.push([`   Lớp 11: ${total11} hs`, '', '', '', '', '', 'PHỤ TRÁCH BÁN TRÚ']);
        aoa.push([`   Lớp 12: ${total12} hs`]);
        aoa.push([]);
        aoa.push(['', '', '', '', '', '', window.SYS_CONFIG?.nguoi_phu_trach || 'Người phụ trách']);

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        ws['!cols'] = [
            {wch: 5},   // STT
            {wch: 9},   // Mã BT
            {wch: 28},  // Họ tên
            {wch: 5},   // GT
            {wch: 7},   // Lớp
            {wch: 7},   // P.Ngủ
            {wch: 7},   // P.Ăn
            ...Array(NUM_DAYS).fill({wch: 9}),
            {wch: 15},  // Ghi chú
        ];

        ws['!merges'] = [
            {s:{r:0,c:0},  e:{r:0,c:2}},
            {s:{r:0,c:3},  e:{r:0,c:GHI_CHU_COL}},
            {s:{r:1,c:3},  e:{r:1,c:GHI_CHU_COL}},
            {s:{r:3,c:0},  e:{r:3,c:GHI_CHU_COL}},
            {s:{r:4,c:0},  e:{r:4,c:GHI_CHU_COL}},
            {s:{r:HR,c:0}, e:{r:HR+1,c:0}},
            {s:{r:HR,c:1}, e:{r:HR+1,c:1}},
            {s:{r:HR,c:2}, e:{r:HR+1,c:2}},
            {s:{r:HR,c:3}, e:{r:HR+1,c:3}},
            {s:{r:HR,c:4}, e:{r:HR+1,c:4}},
            {s:{r:HR,c:5}, e:{r:HR+1,c:5}},
            {s:{r:HR,c:6}, e:{r:HR+1,c:6}},
            {s:{r:HR,c:7}, e:{r:HR, c:GHI_CHU_COL-1}},
            {s:{r:HR,c:GHI_CHU_COL}, e:{r:HR+1,c:GHI_CHU_COL}},
        ];

        // Tên sheet: tối đa 31 ký tự, không có ký tự đặc biệt
        const sheetName = `Phong_${room}`.replace(/[:\\\/?*\[\]]/g, '_').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const fileTag  = isNgu ? 'DiemdanhNgu' : 'DiemdanhAn';
    const fileDate = `${_p2(monday.getDate())}${_p2(monday.getMonth()+1)}`;
    XLSX.writeFile(wb, `${fileTag}_Tuan${weekNum}_${fileDate}.xlsx`);
}


