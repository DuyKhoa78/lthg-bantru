// Bạn có thể thay đổi số liệu này bằng cách lấy từ API hoặc Database
const dailyStats = {
    totalStudents: 500,
    eatingCount: 485,
    sleepingCount: 480,
    absentCount: 15
};

function renderStats() {
    // Gán dữ liệu vào HTML bằng ID
    document.getElementById('stat-total').textContent = dailyStats.totalStudents;
    document.getElementById('stat-eating').textContent = dailyStats.eatingCount;
    document.getElementById('stat-sleeping').textContent = dailyStats.sleepingCount;
    document.getElementById('stat-absent').textContent = dailyStats.absentCount;
    // Ví dụ đổ dữ liệu
    document.getElementById('stat-absent-eat').innerText = "5";
    document.getElementById('stat-absent-sleep').innerText = "3";
}

// Chạy hàm khi trang đã load xong nội dung
window.addEventListener('DOMContentLoaded', renderStats);