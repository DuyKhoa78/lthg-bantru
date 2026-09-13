/**
 * Utility functions for QR code parsing and student matching
 */

/**
 * Trích xuất mã học sinh theo đúng quy định nghiêm ngặt:
 * 1. Định dạng chính thức: MSBT: 26xxx / MSBT 26xxx / MSBT-26xxx / HS: 26xxx / THE: 26xxx
 * 2. Định dạng JSON: {"id": ...}, {"ma_hs": ...}, {"msbt": ...}, {"student_id": ...}
 * 3. Chuỗi thuần số nguyên: ^\d{1,6}$ (ví dụ "26015" hoặc "15")
 * 4. KHÔNG tự ý lấy số bất kỳ trong đường dẫn URL hoặc đoạn văn bản dài
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

    // 3. Chuỗi toàn bộ chỉ chứa số nguyên định danh (1 đến 8 chữ số)
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
 * Tìm học sinh theo mã ứng viên (so khớp chính xác, không dùng substring)
 */
export function findStudentByCandidate(students, candidateStr) {
    if (!Array.isArray(students) || !candidateStr) return null;
    const cleanCandidate = String(candidateStr).trim();

    // 1. Khớp chính xác ID, ma_hs, hoặc raw_id
    let found = students.find(s => {
        const sId = String(s.id);
        const sCardId = `26${String(s.id).padStart(3, '0')}`;
        return (
            sId === cleanCandidate ||
            sCardId === cleanCandidate ||
            (s.ma_hs && String(s.ma_hs).trim() === cleanCandidate) ||
            (s.raw_id && String(s.raw_id).trim() === cleanCandidate)
        );
    });

    // 2. Thử bóc tiền tố 26 nếu thẻ in mã 26xxx (ví dụ: 26015 -> HS ID 15)
    if (!found && cleanCandidate.startsWith('26') && cleanCandidate.length > 2) {
        const strippedNum = parseInt(cleanCandidate.slice(2), 10);
        if (!isNaN(strippedNum)) {
            const stripped = String(strippedNum);
            found = students.find(s => String(s.id) === stripped || (s.raw_id && String(s.raw_id) === stripped));
        }
    }

    // 3. Trường hợp ngược lại: nếu học sinh trong DB lưu mã 26xxx mà quét ra số ngắn (ví dụ ID 15 -> khớp với 26015)
    if (!found && !cleanCandidate.startsWith('26')) {
        const paddedCardId = `26${cleanCandidate.padStart(3, '0')}`;
        found = students.find(s => String(s.id) === paddedCardId || (s.ma_hs && String(s.ma_hs).trim() === paddedCardId));
    }

    // 4. Tìm kiếm theo họ và tên nếu nhập thủ công
    if (!found && cleanCandidate.length >= 2 && !/^\d+$/.test(cleanCandidate)) {
        const queryNorm = cleanCandidate.toLowerCase().trim();
        found = students.find(s => {
            const name = (s.ho_ten || s.name || '').toLowerCase();
            return name.includes(queryNorm);
        });
    }

    return found || null;
}
