import { removeAccents } from './stringUtils';

/**
 * Utility functions for QR code parsing and student matching
 */

/**
 * Trích xuất mã học sinh theo đúng quy định:
 * 1. Định dạng chính thức: MSBT: 26xxx / MSBT 26xxx / MSBT-26xxx / HS: 26xxx / THE: 26xxx
 * 2. Định dạng JSON: {"id": ...}, {"ma_hs": ...}, {"msbt": ...}, {"student_id": ...}
 * 3. Chuỗi thuần số nguyên: ^\d{1,8}$ (ví dụ "26180", "180", "10", "1")
 * 4. URL có param ID/MSBT
 */
export function parseStudentId(decodedText) {
    if (!decodedText) return null;
    const text = String(decodedText).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!text) return null;

    // 1. Format thẻ học sinh chính thức: MSBT: 26015 / MSBT-26015 / MSBT:26015 / MSBT 26015 / HS: 26015 / THE: 26015
    const prefixMatch = text.match(/^(?:MSBT|HS|THE|CARD|MA|ID|STUDENT)[:\s_-]*(\d+)$/i) || text.match(/\b(?:MSBT|HS|THE|CARD|MA|ID|STUDENT)[:\s_-]*(\d+)\b/i);
    if (prefixMatch) {
        return { idCandidate: prefixMatch[1], rawText: text };
    }

    // 2. Format JSON (e.g. {"id": 15}, {"ma_hs": "26015"}, {"msbt": 26015}, {"student_id": 15})
    if (text.startsWith('{') && text.endsWith('}')) {
        try {
            const parsed = JSON.parse(text);
            const candidate = parsed.id ?? parsed.ma_hs ?? parsed.msbt ?? parsed.student_id ?? parsed.ma_so;
            if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
                return { idCandidate: String(candidate).trim(), rawText: text };
            }
        } catch {
            // Không phải JSON hợp lệ, tiếp tục kiểm tra
        }
    }

    // 3. Chuỗi toàn bộ chỉ chứa số nguyên định danh (1 đến 8 chữ số, ví dụ 1, 2, 10, 180, 26001...)
    if (/^\d{1,8}$/.test(text)) {
        return { idCandidate: text, rawText: text };
    }

    // 4. URL có tham số định danh: ví dụ ?id=26015 hoặc ?msbt=26015 hoặc /hs/26015
    const urlParamMatch = text.match(/[?&](?:id|msbt|ma_hs|hs)=([0-9a-zA-Z_-]+)/i) || text.match(/\/(?:hs|hocsinh|student|the|cards?)\/(\d+)/i);
    if (urlParamMatch) {
        return { idCandidate: urlParamMatch[1], rawText: text };
    }

    // 5. Chuỗi chứa số định dạng thẻ bán trú 26xxx (ví dụ: "Thẻ HS 26057")
    const card26Match = text.match(/\b(26\d{3,4})\b/);
    if (card26Match) {
        return { idCandidate: card26Match[1], rawText: text };
    }

    // Luôn trả về rawText để giao diện camera hiển thị phản hồi ngay lập tức cho người dùng
    return { idCandidate: null, rawText: text };
}

/**
 * So khớp học sinh khi tìm kiếm bằng Tên, Lớp hoặc Mã học sinh (kể cả số cuối 1, 2, 10, 180...)
 * - Khớp số cuối: Giáo viên nhập 1, 2, 10, 180 -> khớp học sinh có ID tương ứng (hoặc mã thẻ 26001, 26010, 26180...)
 * - Khớp mã đầy đủ: 26001, 26180, MSBT 180, MSBT: 26001...
 * - Khớp theo tên (không phân biệt dấu/hoa thường)
 * - Khớp theo lớp (10A1, 11A2...)
 */
export function matchStudentSearch(student, query) {
    if (!student) return false;
    if (!query || !String(query).trim()) return true;

    const rawQ = String(query).trim();
    const qLower = rawQ.toLowerCase();
    const qNoTone = removeAccents(qLower);

    // 1. So khớp họ và tên
    const name = String(student.ho_ten || student.name || '').trim();
    if (name && removeAccents(name.toLowerCase()).includes(qNoTone)) {
        return true;
    }

    // 2. So khớp theo lớp (chỉ so khớp khi từ khóa có chữ cái, ví dụ '10A1', '11A' để tránh gõ số 1 khớp toàn bộ các lớp 10, 11, 12)
    const lop = String(student.lop || '').trim().toLowerCase();
    if (/[a-z]/i.test(rawQ) && lop && lop.includes(qLower)) {
        return true;
    }

    // 3. So khớp theo mã học sinh / số cuối
    const rawId = student.raw_id !== undefined ? student.raw_id : student.id;
    if (rawId === undefined || rawId === null) return false;

    const idStr = String(rawId).trim();
    const cardId = `26${idStr.padStart(3, '0')}`;
    const cleanQ = rawQ.replace(/^(?:MSBT|HS|THE|CARD|MA|ID)[:\s_-]*/i, '').trim();

    // Khớp mã thẻ chính xác
    if (cardId.toLowerCase() === cleanQ.toLowerCase()) return true;
    if (idStr === cleanQ) return true;
    if (student.ma_hs && String(student.ma_hs).trim().toLowerCase() === cleanQ.toLowerCase()) return true;

    // Nếu query là số (VD: 1, 2, 10, 180, 01, 010...)
    if (/^\d+$/.test(cleanQ)) {
        const numQ = parseInt(cleanQ, 10);
        const numId = parseInt(idStr, 10);

        // Số ID khớp chính xác (VD: gõ 1 khớp HS 1 (26001), gõ 10 khớp HS 10 (26010), gõ 180 khớp HS 180 (26180))
        if (!isNaN(numQ) && !isNaN(numId) && numId === numQ) return true;

        // Bóc tiền tố 26 nếu thẻ in 26xxx mà gõ số cuối
        const cardTrailing = parseInt(cardId.replace(/^26/, ''), 10);
        if (!isNaN(numQ) && cardTrailing === numQ) return true;

        // Nếu query bắt đầu bằng 26 (VD: 26015 -> khớp số 15)
        if (cleanQ.startsWith('26') && cleanQ.length > 2) {
            const strippedQ = parseInt(cleanQ.slice(2), 10);
            if (!isNaN(strippedQ) && numId === strippedQ) return true;
        }

        // Hỗ trợ tìm kiếm theo số đuôi (ví dụ thẻ 26180 thì số đuôi là 180)
        if (cleanQ.length >= 2) {
            if (cardId.endsWith(cleanQ)) return true;
            if (idStr.endsWith(cleanQ)) return true;
        }
    }

    return false;
}

/**
 * Tìm học sinh theo mã ứng viên (so khớp nhanh chuẩn xác)
 */
export function findStudentByCandidate(students, candidateStr) {
    if (!Array.isArray(students) || !candidateStr) return null;
    const cleanCandidate = String(candidateStr).trim();
    if (!cleanCandidate) return null;

    // 1. Nếu candidate là số hoặc tiền tố mã (VD: 1, 2, 10, 180, 26180, MSBT 180)
    const cleanDigits = cleanCandidate.replace(/^(?:MSBT|HS|THE|CARD|MA|ID)[:\s_-]*/i, '').trim();
    if (/^\d+$/.test(cleanDigits)) {
        const numQ = parseInt(cleanDigits, 10);
        // Ưu tiên khớp chính xác ID hoặc số cuối thẻ
        const exact = students.find(s => {
            const sId = s.raw_id !== undefined ? s.raw_id : s.id;
            const cardId = `26${String(sId).padStart(3, '0')}`;
            if (String(sId) === cleanDigits || cardId === cleanDigits) return true;
            if (Number(sId) === numQ) return true;
            if (cleanDigits.startsWith('26') && cleanDigits.length > 2) {
                return Number(sId) === parseInt(cleanDigits.slice(2), 10);
            }
            return false;
        });
        if (exact) return exact;
    }

    // 2. Thử so khớp tổng quát qua matchStudentSearch
    const matched = students.find(s => matchStudentSearch(s, cleanCandidate));
    if (matched) return matched;

    return null;
}
