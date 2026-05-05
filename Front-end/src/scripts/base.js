/**
 * base.js – Shared UI logic cho tất cả các trang
 * Toggle sidebar dùng class trên <body> để navbar + main-content animate đồng bộ
 */
document.addEventListener('DOMContentLoaded', function () {

    /* ===== SIDEBAR TOGGLE – dùng body class ===== */
    const STORAGE_KEY = 'sidebar_hidden';
    const sidebar     = document.getElementById('sidebar');
    const btnToggle   = document.getElementById('sidebarToggle');

    if (sidebar && btnToggle) {
        // Khôi phục trạng thái saved
        if (localStorage.getItem(STORAGE_KEY) === '1') {
            document.body.classList.add('sidebar-hidden');
        }

        btnToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            document.body.classList.toggle('sidebar-hidden');
            localStorage.setItem(STORAGE_KEY,
                document.body.classList.contains('sidebar-hidden') ? '1' : '0');
        });
    }

    /* ===== PROFILE DROPDOWN ===== */
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.addEventListener('click', function (e) {
            this.classList.toggle('active');
            e.stopPropagation();
        });
        document.addEventListener('click', function () {
            dropdown.classList.remove('active');
        });
    }

    /* ===== ACTIVE MENU ITEM ===== */
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', function () {
            document.querySelectorAll('.menu li').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

});