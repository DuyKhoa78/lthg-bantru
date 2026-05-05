/* ============================================================
   COMPONENTS.JS – Hệ thống Quản lý Bán trú
   Modal · Toast · DataTable · ConfirmDialog helpers
   ============================================================ */

'use strict';

/* ============================================================
   TOAST MANAGER
   ============================================================ */
const Toast = (() => {
    let container = null;

    function getContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    const icons = {
        success: 'fas fa-check-circle',
        error:   'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info:    'fas fa-info-circle',
    };
    const titles = {
        success: 'Thành công!',
        error:   'Lỗi!',
        warning: 'Cảnh báo',
        info:    'Thông tin',
    };

    function show(type = 'info', message = '', title = null) {
        const c = getContainer();
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <div class="toast-icon"><i class="${icons[type] || icons.info}"></i></div>
            <div class="toast-body">
                <div class="toast-title">${title || titles[type]}</div>
                <div class="toast-msg">${message}</div>
            </div>
            <div class="toast-progress"></div>`;
        c.appendChild(el);

        setTimeout(() => {
            el.classList.add('toast-hide');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, 3200);
    }

    return {
        success: (msg, title) => show('success', msg, title),
        error:   (msg, title) => show('error',   msg, title),
        warning: (msg, title) => show('warning', msg, title),
        info:    (msg, title) => show('info',    msg, title),
    };
})();


/* ============================================================
   MODAL MANAGER
   ============================================================ */
class Modal {
    constructor(id) {
        this.overlay = document.getElementById(id);
        if (!this.overlay) { console.warn(`Modal #${id} not found`); return; }
        this.box = this.overlay.querySelector('.modal-box');
        this._bindClose();
    }

    _bindClose() {
        // Close button
        this.overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
        // Overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('is-open')) this.close();
        });
    }

    open() {
        this.overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        this.onClose?.();
    }

    setTitle(text) {
        const el = this.overlay.querySelector('.modal-title span');
        if (el) el.textContent = text;
    }

    onClose = null; // callback hook
}


/* ============================================================
   CONFIRM DIALOG
   ============================================================ */
const Confirm = (() => {
    let modal = null;
    let resolvePromise = null;

    function init() {
        const html = `
        <div class="modal-overlay" id="confirmModal">
            <div class="modal-box modal-sm">
                <div class="modal-body confirm-box">
                    <div class="confirm-icon"><i class="fas fa-trash-alt"></i></div>
                    <h3 id="confirmTitle">Xác nhận xóa</h3>
                    <p  id="confirmMsg">Bạn có chắc muốn thực hiện thao tác này không?</p>
                    <div class="confirm-actions">
                        <button class="btn btn-ghost"   id="confirmCancel">Huỷ</button>
                        <button class="btn btn-danger"  id="confirmOk">Xác nhận</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = new Modal('confirmModal');

        document.getElementById('confirmOk').addEventListener('click', () => {
            resolvePromise?.(true); resolvePromise = null; modal.close(); 
        });
        document.getElementById('confirmCancel').addEventListener('click', () => {
            resolvePromise?.(false); resolvePromise = null; modal.close(); 
        });
        modal.onClose = () => { resolvePromise?.(false); resolvePromise = null; };
    }

    function ask(title = 'Xác nhận xóa', msg = 'Bạn có chắc muốn thực hiện thao tác này không?', iconClass = 'fas fa-trash-alt', iconColor = 'var(--danger)', bgColor = 'var(--danger-light)') {
        if (!modal) init();
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMsg').textContent = msg;
        const icon = document.querySelector('#confirmModal .confirm-icon');
        if (icon) {
            icon.style.background = bgColor;
            icon.style.color = iconColor;
            icon.innerHTML = `<i class="${iconClass}"></i>`;
        }
        modal.open();
        return new Promise(res => { resolvePromise = res; });
    }

    return { ask };
})();


/* ============================================================
   DATA TABLE
   ============================================================ */
class DataTable {
    constructor(wrapperId, options = {}) {
        this.wrapper   = document.getElementById(wrapperId);
        this.options   = {
            data:        options.data        || [],
            columns:     options.columns     || [],
            pageSize:    options.pageSize    || 12,
            searchable:  options.searchable  !== false,
            sortable:    options.sortable    !== false,
            actions:     options.actions     || null,      // extra HTML buttons in toolbar
        };
        this.currentPage = 1;
        this.sortCol     = null;
        this.sortDir     = 'asc';
        this.searchTerm  = '';
        this.filteredData = [...this.options.data];
        this._render();
    }

    /* ── Public API ── */
    setData(data) {
        this.options.data = data;
        this.currentPage  = 1;
        this.applyFilter();
    }

    applyFilter(customFn = null) {
        let d = [...this.options.data];
        if (this.searchTerm) {
            const q = this.searchTerm.toLowerCase();
            d = d.filter(row => this.options.columns.some(col => {
                const v = String(col.render ? col.render(row) : (row[col.key] ?? '')).toLowerCase();
                return v.includes(q);
            }));
        }
        if (customFn) d = d.filter(customFn);
        if (this.sortCol) {
            d.sort((a, b) => {
                const va = a[this.sortCol] ?? '';
                const vb = b[this.sortCol] ?? '';
                return this.sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }
        this.filteredData = d;
        this._renderBody();
        this._renderFooter();
    }

    /* ── Private ── */
    _render() {
        const { columns, searchable, actions } = this.options;
        const headerCols = columns.map(c =>
            `<th data-key="${c.key || ''}" class="${this.options.sortable && c.key ? 'sortable' : ''}">${c.label}</th>`
        ).join('');

        this.wrapper.innerHTML = `
        <div class="datatable-wrapper">
            <div class="datatable-toolbar">
                <div class="datatable-search">
                    ${searchable ? `<i class="fas fa-search"></i><input type="text" id="dt-search-${this.wrapper.id}" placeholder="Tìm kiếm...">` : ''}
                </div>
                <div class="datatable-actions">${actions || ''}</div>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr>${headerCols}</tr></thead>
                    <tbody id="dt-body-${this.wrapper.id}"></tbody>
                </table>
            </div>
            <div class="datatable-footer" id="dt-foot-${this.wrapper.id}"></div>
        </div>`;

        // Sort headers
        if (this.options.sortable) {
            this.wrapper.querySelectorAll('th[data-key]').forEach(th => {
                th.addEventListener('click', () => {
                    const k = th.dataset.key;
                    if (!k) return;
                    if (this.sortCol === k) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
                    else { this.sortCol = k; this.sortDir = 'asc'; }
                    this.wrapper.querySelectorAll('th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
                    th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
                    this.applyFilter();
                });
            });
        }

        // Search
        const searchInput = this.wrapper.querySelector(`#dt-search-${this.wrapper.id}`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.trim();
                this.currentPage = 1;
                this.applyFilter();
            });
        }

        this.applyFilter();
    }

    _renderBody() {
        const tbody = document.getElementById(`dt-body-${this.wrapper.id}`);
        const { columns, pageSize } = this.options;
        const start = (this.currentPage - 1) * pageSize;
        const rows  = this.filteredData.slice(start, start + pageSize);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" style="padding:40px;text-align:center;color:var(--gray-500);">
                <i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;"></i>
                Không có dữ liệu</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((row, i) => {
            const cells = columns.map(col => {
                const val = col.render ? col.render(row, i + start) : (row[col.key] ?? '');
                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    }

    _renderFooter() {
        const foot = document.getElementById(`dt-foot-${this.wrapper.id}`);
        const total   = this.filteredData.length;
        const pages   = Math.ceil(total / this.options.pageSize);
        const start   = Math.min((this.currentPage - 1) * this.options.pageSize + 1, total);
        const end     = Math.min(this.currentPage * this.options.pageSize, total);

        let pagination = '';
        pagination += `<button class="page-btn" data-page="${this.currentPage - 1}" ${this.currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        const range = Math.min(pages, 5);
        let pStart = Math.max(1, this.currentPage - 2);
        let pEnd   = Math.min(pages, pStart + range - 1);
        pStart = Math.max(1, pEnd - range + 1);
        for (let p = pStart; p <= pEnd; p++) {
            pagination += `<button class="page-btn ${p === this.currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        pagination += `<button class="page-btn" data-page="${this.currentPage + 1}" ${this.currentPage >= pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;

        foot.innerHTML = `
            <span class="datatable-info">Hiển thị ${total ? start : 0}–${end} trong ${total} bản ghi</span>
            <div class="datatable-pagination">${pagination}</div>`;

        foot.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this._renderBody();
                this._renderFooter();
            });
        });
    }
}


/* ============================================================
   TAB SYSTEM
   ============================================================ */
function initTabs(containerSel = '.tab-nav') {
    document.querySelectorAll(containerSel).forEach(nav => {
        nav.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const section = nav.closest('section, div, .tab-container') || document;
                section.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                const panel = document.getElementById(target);
                if (panel) panel.classList.add('active');
            });
        });
        // Auto-activate first
        const first = nav.querySelector('.tab-btn');
        if (first && !nav.querySelector('.tab-btn.active')) first.click();
    });
}

/* ============================================================
   UTILS
   ============================================================ */
const Utils = {
    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
    },
    today() {
        return new Date().toISOString().split('T')[0];
    },
    debounce(fn, ms = 300) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },
    gioiTinhLabel(val) {
        return parseInt(val) === 0 ? '<span class="badge badge-nam">Nam</span>' : '<span class="badge badge-nu">Nữ</span>';
    },
    loaiPhongLabel(val) {
        return parseInt(val) === 0
            ? '<span class="badge badge-an"><i class="fas fa-utensils"></i> Ăn</span>'
            : '<span class="badge badge-ngu"><i class="fas fa-bed"></i> Ngủ</span>';
    },
    diemdanhLabel(val) {
        const map = {
            0: '<span class="badge badge-comat"><i class="fas fa-check"></i> Có mặt</span>',
            1: '<span class="badge badge-vang"><i class="fas fa-times"></i> Vắng</span>',
            3: '<span class="badge badge-phep"><i class="fas fa-file-alt"></i> Phép</span>',
        };
        return map[val] ?? '–';
    },
};

/* Auto-init tabs on DOM ready */
document.addEventListener('DOMContentLoaded', () => initTabs('.tab-nav'));
