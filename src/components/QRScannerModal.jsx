import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './QRScannerModal.css';

/**
 * Shared AudioContext singleton across scans
 * Prevents mobile audio engine latency/lag
 */
let sharedAudioCtx = null;

function playChime(type = 'success') {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new AudioContextClass();
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
        const ctx = sharedAudioCtx;

        if (type === 'success') {
            // Zalo-like crisp high ping (C6 -> E6)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
            osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.04);

            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.19);
        } else if (type === 'warning') {
            // Two-tone warning buzz
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, ctx.currentTime);
            osc.frequency.setValueAtTime(180, ctx.currentTime + 0.08);

            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.29);
        } else if (type === 'confirm') {
            // Double-ding confirmation
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc1.frequency.setValueAtTime(1320, ctx.currentTime + 0.06);
            osc1.frequency.setValueAtTime(1760, ctx.currentTime + 0.12);
            gain1.gain.setValueAtTime(0.3, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start();
            osc1.stop(ctx.currentTime + 0.26);
        }
    } catch (e) {
        console.warn('Audio error:', e);
    }
}

/**
 * Parses raw scanned QR string
 */
function parseStudentId(decodedText) {
    if (!decodedText) return null;
    const text = String(decodedText).trim();

    // 1. Format: MSBT: 26015 / MSBT:26015 / MSBT-26015
    const msbtMatch = text.match(/MSBT[:\s_-]*(\d+)/i);
    if (msbtMatch) {
        return { rawText: text, idCandidate: msbtMatch[1] };
    }

    // 2. Format JSON (e.g. {"id": 15})
    try {
        const parsed = JSON.parse(text);
        if (parsed.id || parsed.ma_hs) {
            return { rawText: text, idCandidate: String(parsed.id || parsed.ma_hs) };
        }
    } catch {
        // Not JSON
    }

    // 3. Format: 26xxx hoặc số nguyên bất kỳ
    const numMatch = text.match(/\b(26\d{3,4}|\d+)\b/);
    if (numMatch) {
        return { rawText: text, idCandidate: numMatch[1] };
    }

    return { rawText: text, idCandidate: text };
}

/**
 * Tìm học sinh theo ID/mã quét
 */
function findStudentByCandidate(students, candidateStr, rawText) {
    let found = students.find(s => {
        const sId = String(s.id);
        const sCardId = `26${String(s.id).padStart(3, '0')}`;
        return (
            sId === candidateStr ||
            sCardId === candidateStr ||
            (s.ma_hs && String(s.ma_hs) === candidateStr) ||
            (s.raw_id && String(s.raw_id) === candidateStr)
        );
    });

    if (!found && candidateStr.startsWith('26') && candidateStr.length > 2) {
        const stripped = String(parseInt(candidateStr.slice(2), 10));
        found = students.find(s => String(s.id) === stripped || (s.raw_id && String(s.raw_id) === stripped));
    }

    if (!found && rawText) {
        found = students.find(s => rawText.includes(String(s.id)));
    }

    return found;
}

export default function QRScannerModal({
    isOpen,
    onClose,
    roomStudents = [],
    allStudents = [],
    currentRoomName = '',
    onConfirmStudent,
    scannedIds = new Set(),
}) {
    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const [scannerActive, setScannerActive] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [boxFlash, setBoxFlash] = useState(null); // 'success' | 'warning'
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hasZoom, setHasZoom] = useState(false);

    // === TRẠNG THÁI XÁC NHẬN (Zalo-style) ===
    // pendingStudent: HS đang chờ GV xác nhận (camera vẫn chạy, quét tạm dừng)
    const [pendingStudent, setPendingStudent] = useState(null);
    // pendingType: 'new' | 'already' | 'wrong_room' | 'invalid'
    const [pendingType, setPendingType] = useState(null);
    // pendingExtra: thông tin phụ (vd: phòng thật khi sai phòng, rawText khi invalid)
    const [pendingExtra, setPendingExtra] = useState(null);
    // Thông báo nhỏ tạm thời (sau khi xác nhận thành công)
    const [miniToast, setMiniToast] = useState(null);

    // Lưu trữ props mới nhất vào Ref để camera callback luôn thấy dữ liệu mới mà KHÔNG cần restart camera
    const propsRef = useRef({
        roomStudents,
        allStudents,
        currentRoomName,
        onConfirmStudent,
        scannedIds,
    });
    useEffect(() => {
        propsRef.current = {
            roomStudents,
            allStudents,
            currentRoomName,
            onConfirmStudent,
            scannedIds,
        };
    });

    const lastScannedTimeRef = useRef({});
    const isPendingRef = useRef(false);

    // === QUÉT & HIỆN THỊ THÔNG TIN (KHÔNG TỰ ĐỘNG CHỐT) ===
    // Camera + giải mã QR chạy liên tục 100%, chỉ dùng cờ ref để bỏ qua kết quả khi đang hiện thẻ
    const handleScan = useCallback((decodedText) => {
        if (!decodedText) return;
        if (isPendingRef.current) return; // Đang hiện thẻ xác nhận, bỏ qua frame này
        const now = Date.now();
        console.log('[QR SCAN DECODED]:', decodedText);

        const parsed = parseStudentId(decodedText);
        if (!parsed || !parsed.idCandidate) return;

        const candidateStr = parsed.idCandidate;

        // Tránh quét lặp lại cùng 1 thẻ trong vòng 2 giây
        if (lastScannedTimeRef.current[candidateStr] && (now - lastScannedTimeRef.current[candidateStr] < 2000)) {
            return;
        }
        lastScannedTimeRef.current[candidateStr] = now;

        const {
            roomStudents: curRoomStudents,
            allStudents: curAllStudents,
            scannedIds: curScannedIds,
            currentRoomName: curRoomName
        } = propsRef.current;

        // 1. Tìm trong phòng hiện tại
        const matched = findStudentByCandidate(curRoomStudents, candidateStr, parsed.rawText);

        if (matched) {
            playChime('success');
            if (navigator.vibrate) navigator.vibrate([40, 30, 50]);
            setBoxFlash('success');
            setTimeout(() => setBoxFlash(null), 600);

            isPendingRef.current = true; // Khóa quét trước khi set state
            if (curScannedIds.has(matched.id)) {
                setPendingStudent(matched);
                setPendingType('already');
                setPendingExtra(null);
            } else {
                setPendingStudent(matched);
                setPendingType('new');
                setPendingExtra(null);
            }
            return;
        }

        // 2. Tìm trong tất cả HS (sai phòng)
        const otherStudent = findStudentByCandidate(curAllStudents, candidateStr, parsed.rawText);

        playChime('warning');
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        setBoxFlash('warning');
        setTimeout(() => setBoxFlash(null), 600);

        isPendingRef.current = true; // Khóa quét
        if (otherStudent) {
            const actualRoom = otherStudent.phong_an || otherStudent.phong_ngu || 'Chưa phân phòng';
            setPendingStudent(otherStudent);
            setPendingType('wrong_room');
            setPendingExtra({ actualRoom, curRoomName });
        } else {
            setPendingStudent(null);
            setPendingType('invalid');
            setPendingExtra({ rawText: parsed.rawText });
        }
    }, []);

    // === XÁC NHẬN CÓ MẶT (GV bấm nút) ===
    const handleConfirm = useCallback(() => {
        if (!pendingStudent || pendingType !== 'new') return;
        const { onConfirmStudent: curOnConfirm } = propsRef.current;

        playChime('confirm');
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);

        curOnConfirm(pendingStudent);

        // Hiện mini toast xác nhận thành công ngắn gọn
        setMiniToast({
            name: pendingStudent.ho_ten,
            lop: pendingStudent.lop,
        });
        setTimeout(() => setMiniToast(null), 2000);

        // Đóng thẻ xác nhận & mở khóa quét tiếp
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        isPendingRef.current = false;
    }, [pendingStudent, pendingType]);

    // === BỎ QUA (dismiss thẻ xác nhận & quét tiếp) ===
    const handleDismiss = useCallback(() => {
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        isPendingRef.current = false;
    }, []);

    // Khởi động Camera duy nhất 1 lần khi mở modal
    useEffect(() => {
        let isMounted = true;
        let qrScanner = null;

        if (!isOpen) return;

        // Mở khóa AudioContext cho iOS/Android ngay khi bật camera
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
                    sharedAudioCtx = new AudioContextClass();
                }
                if (sharedAudioCtx.state === 'suspended') {
                    sharedAudioCtx.resume();
                }
            }
        } catch {
            // Audio unlock ignore
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCameraError(null);
        setMiniToast(null);
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        setZoomLevel(1);
        isPendingRef.current = false;

        const qrCodeId = 'zalo-qr-viewport';

        try {
            // Tắt BarcodeDetector để dùng ZXing thuần túy 100% tương thích mọi điện thoại di động
            qrScanner = new Html5Qrcode(qrCodeId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                useBarCodeDetectorIfSupported: false,
                verbose: false,
            });
            html5QrCodeRef.current = qrScanner;

            // Quét toàn bộ khung hình để bắt mã QR siêu nhạy
            const config = {
                fps: 15,
                aspectRatio: undefined,
                disableFlip: false,
            };

            qrScanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    if (isMounted) handleScan(decodedText);
                },
                () => {
                    // Frame không có QR
                }
            ).then(async () => {
                if (!isMounted) return;
                setScannerActive(true);

                // Bật lấy nét tự động liên tục
                try {
                    await qrScanner.applyVideoConstraints({
                        advanced: [
                            { focusMode: 'continuous' },
                            { exposureMode: 'continuous' },
                            { whiteBalanceMode: 'continuous' }
                        ]
                    });
                } catch (e) {
                    console.debug('Autofocus constraint not supported:', e);
                }

                // Kiểm tra khả năng Flash & Zoom
                try {
                    const trackCaps = qrScanner.getRunningTrackCameraCapabilities ? qrScanner.getRunningTrackCameraCapabilities() : null;
                    if (trackCaps && trackCaps.torchFeature && trackCaps.torchFeature().isSupported()) {
                        setHasTorch(true);
                    }
                    if (trackCaps && trackCaps.zoomFeature && trackCaps.zoomFeature().isSupported()) {
                        setHasZoom(true);
                    } else {
                        const caps = qrScanner.getRunningTrackCapabilities ? qrScanner.getRunningTrackCapabilities() : null;
                        if (caps && caps.zoom) {
                            setHasZoom(true);
                        }
                    }
                } catch (err) {
                    console.debug('Capabilities check:', err);
                }
            }).catch(err => {
                console.error('Camera start error:', err);
                if (isMounted) {
                    setCameraError('Không thể mở camera. Vui lòng cho phép quyền truy cập máy ảnh trong cài đặt trình duyệt và tải lại trang.');
                }
            });
        } catch (e) {
            console.error('QR Scanner init error:', e);
        }

        return () => {
            isMounted = false;
            isPendingRef.current = false;
            if (qrScanner) {
                try {
                    const state = qrScanner.getState ? qrScanner.getState() : null;
                    if (qrScanner.isScanning || state === 2 || state === 3) {
                        qrScanner.stop().then(() => {
                            try { qrScanner.clear(); } catch (e) { console.debug('QR clear on stop:', e); }
                        }).catch(err => console.warn('QR stop warning:', err));
                    } else {
                        try { qrScanner.clear(); } catch (e) { console.debug('QR clear idle:', e); }
                    }
                } catch (err) {
                    console.warn('QR cleanup warning:', err);
                }
            }
            setScannerActive(false);
        };
    }, [isOpen, handleScan]);

    // Bật tắt Flashlight
    const toggleTorch = async () => {
        if (!html5QrCodeRef.current || !hasTorch) return;
        try {
            const nextState = !torchOn;
            const trackCaps = html5QrCodeRef.current.getRunningTrackCameraCapabilities ? html5QrCodeRef.current.getRunningTrackCameraCapabilities() : null;
            if (trackCaps && trackCaps.torchFeature && trackCaps.torchFeature().isSupported()) {
                await trackCaps.torchFeature().apply(nextState);
            } else {
                await html5QrCodeRef.current.applyVideoConstraints({
                    advanced: [{ torch: nextState }]
                });
            }
            setTorchOn(nextState);
        } catch (e) {
            console.warn('Torch toggle error:', e);
        }
    };

    // Phóng to 2x / 1x
    const toggleZoom = async () => {
        if (!html5QrCodeRef.current) return;
        const nextZoom = zoomLevel >= 2 ? 1 : 2;
        try {
            const trackCaps = html5QrCodeRef.current.getRunningTrackCameraCapabilities ? html5QrCodeRef.current.getRunningTrackCameraCapabilities() : null;
            if (trackCaps && trackCaps.zoomFeature && trackCaps.zoomFeature().isSupported()) {
                await trackCaps.zoomFeature().apply(nextZoom);
            } else {
                await html5QrCodeRef.current.applyVideoConstraints({
                    advanced: [{ zoom: nextZoom }]
                });
            }
            setZoomLevel(nextZoom);
        } catch (e) {
            console.warn('Zoom error:', e);
        }
    };

    // Chạm vào màn hình để kích hoạt lại lấy nét
    const handleTapToFocus = async () => {
        if (!html5QrCodeRef.current) return;
        try {
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
        } catch (err) {
            console.debug('Tap to focus error:', err);
        }
    };

    if (!isOpen) return null;

    const presentCount = scannedIds.size;
    const totalCount = roomStudents.length;
    const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    // Xác định nội dung thẻ xác nhận
    const hasPending = pendingType !== null;
    const genderAvatar = (student) => {
        if (!student) return '👤';
        return student.gioi_tinh === 'Nữ' || student.gioi_tinh === 1 ? '👧' : '👦';
    };

    return (
        <div className="zalo-scanner-fullscreen" onClick={hasPending ? undefined : handleTapToFocus}>
            {/* 1. Camera Viewport */}
            <div id="zalo-qr-viewport" ref={scannerRef}></div>

            {/* 2. Top Header (Zalo style) */}
            <div className="zalo-top-bar">
                <button className="zalo-btn-icon" onClick={onClose} title="Đóng máy quét">
                    ✕
                </button>
                <div className="zalo-title-group">
                    <span className="zalo-room-pill">📍 {currentRoomName || 'Phòng trực'}</span>
                    <span className="zalo-header-title">Quét mã QR bán trú</span>
                </div>
                <div className="zalo-header-right-btns">
                    {hasZoom && (
                        <button
                            className={`zalo-btn-icon zalo-zoom-btn ${zoomLevel > 1 ? 'on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleZoom(); }}
                            title="Phóng to 2x"
                        >
                            {zoomLevel > 1 ? '2x' : '1x'}
                        </button>
                    )}
                    {hasTorch ? (
                        <button
                            className={`zalo-btn-icon zalo-torch-btn ${torchOn ? 'on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleTorch(); }}
                            title="Bật/Tắt flash"
                        >
                            {torchOn ? '🔦' : '⚡'}
                        </button>
                    ) : (
                        <div style={{ width: 40 }} />
                    )}
                </div>
            </div>

            {/* 3. Mini toast nhỏ (sau khi xác nhận thành công) */}
            {miniToast && (
                <div className="zalo-scan-toast success">
                    <div className="zalo-toast-avatar">✅</div>
                    <div className="zalo-toast-text">
                        <strong className="zalo-toast-name">{miniToast.name}</strong>
                        <span className="zalo-toast-sub">Lớp {miniToast.lop} — ĐÃ XÁC NHẬN CÓ MẶT</span>
                    </div>
                </div>
            )}

            {/* 4. Center Scanner Reticle (ẩn khi đang hiện thẻ xác nhận) */}
            {scannerActive && !hasPending && (
                <div className="zalo-center-container">
                    <div className={`zalo-reticle-box ${boxFlash || ''}`}>
                        <div className="zalo-corner tl"></div>
                        <div className="zalo-corner tr"></div>
                        <div className="zalo-corner bl"></div>
                        <div className="zalo-corner br"></div>
                        <div className="zalo-laser-line"></div>
                    </div>

                    <p className="zalo-guide-hint">
                        Đưa mã QR vào khung viền (khoảng cách 15 – 25cm)
                    </p>
                </div>
            )}

            {/* ========== 5. THẺ XÁC NHẬN HỌC SINH (Zalo-style bottom sheet) ========== */}
            {hasPending && (
                <div className="zalo-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                    <div className={`zalo-confirm-card ${pendingType}`}>

                        {/* --- HS thuộc phòng, chưa điểm danh (cần xác nhận) --- */}
                        {pendingType === 'new' && pendingStudent && (
                            <>
                                <div className="zalo-confirm-header">
                                    <div className="zalo-confirm-avatar-lg">{genderAvatar(pendingStudent)}</div>
                                    <div className="zalo-confirm-info">
                                        <h3 className="zalo-confirm-name">{pendingStudent.ho_ten}</h3>
                                        <div className="zalo-confirm-tags">
                                            <span className="zalo-tag lop">Lớp {pendingStudent.lop}</span>
                                            <span className="zalo-tag id">ID #{pendingStudent.id}</span>
                                            {pendingStudent.gioi_tinh !== null && pendingStudent.gioi_tinh !== undefined && (
                                                <span className="zalo-tag gender">
                                                    {pendingStudent.gioi_tinh === 'Nữ' || pendingStudent.gioi_tinh === 1 ? 'Nữ' : 'Nam'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="zalo-confirm-actions">
                                    <button className="zalo-confirm-btn primary" onClick={handleConfirm}>
                                        ✓ Xác nhận có mặt
                                    </button>
                                    <button className="zalo-confirm-btn secondary" onClick={handleDismiss}>
                                        Bỏ qua
                                    </button>
                                </div>
                            </>
                        )}

                        {/* --- HS đã điểm danh trước đó --- */}
                        {pendingType === 'already' && pendingStudent && (
                            <>
                                <div className="zalo-confirm-header">
                                    <div className="zalo-confirm-avatar-lg">🔄</div>
                                    <div className="zalo-confirm-info">
                                        <h3 className="zalo-confirm-name">{pendingStudent.ho_ten}</h3>
                                        <div className="zalo-confirm-tags">
                                            <span className="zalo-tag lop">Lớp {pendingStudent.lop}</span>
                                            <span className="zalo-tag id">ID #{pendingStudent.id}</span>
                                        </div>
                                        <p className="zalo-confirm-note already">Đã điểm danh trước đó</p>
                                    </div>
                                </div>
                                <div className="zalo-confirm-actions">
                                    <button className="zalo-confirm-btn secondary" onClick={handleDismiss}>
                                        Đã biết — Quét tiếp
                                    </button>
                                </div>
                            </>
                        )}

                        {/* --- Sai phòng --- */}
                        {pendingType === 'wrong_room' && pendingStudent && (
                            <>
                                <div className="zalo-confirm-header">
                                    <div className="zalo-confirm-avatar-lg">⛔</div>
                                    <div className="zalo-confirm-info">
                                        <h3 className="zalo-confirm-name">{pendingStudent.ho_ten}</h3>
                                        <div className="zalo-confirm-tags">
                                            <span className="zalo-tag lop">Lớp {pendingStudent.lop}</span>
                                            <span className="zalo-tag id">ID #{pendingStudent.id}</span>
                                        </div>
                                        <p className="zalo-confirm-note wrong">
                                            SAI PHÒNG — Thuộc {pendingExtra?.actualRoom}
                                        </p>
                                        <p className="zalo-confirm-note wrong-sub">
                                            Không thuộc {pendingExtra?.curRoomName}
                                        </p>
                                    </div>
                                </div>
                                <div className="zalo-confirm-actions">
                                    <button className="zalo-confirm-btn secondary" onClick={handleDismiss}>
                                        Đã biết — Quét tiếp
                                    </button>
                                </div>
                            </>
                        )}

                        {/* --- Mã không hợp lệ --- */}
                        {pendingType === 'invalid' && (
                            <>
                                <div className="zalo-confirm-header">
                                    <div className="zalo-confirm-avatar-lg">❓</div>
                                    <div className="zalo-confirm-info">
                                        <h3 className="zalo-confirm-name">Mã thẻ không hợp lệ</h3>
                                        <p className="zalo-confirm-note invalid">
                                            Không tìm thấy học sinh với mã: {pendingExtra?.rawText}
                                        </p>
                                    </div>
                                </div>
                                <div className="zalo-confirm-actions">
                                    <button className="zalo-confirm-btn secondary" onClick={handleDismiss}>
                                        Quét lại
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Camera error */}
            {cameraError && (
                <div className="zalo-error-popup">
                    <div className="zalo-error-icon">⚠️</div>
                    <p>{cameraError}</p>
                    <button className="btn btn-light btn-sm mt-3" onClick={onClose}>
                        Đóng lại
                    </button>
                </div>
            )}

            {/* 6. Bottom Status Bar */}
            <div className="zalo-bottom-bar" onClick={(e) => e.stopPropagation()}>
                <div className="zalo-progress-info">
                    <div className="zalo-count-text">
                        Có mặt: <strong>{presentCount} / {totalCount}</strong> em ({percent}%)
                    </div>
                    <div className="zalo-progress-track">
                        <div
                            className="zalo-progress-fill"
                            style={{ width: `${percent}%` }}
                        ></div>
                    </div>
                </div>

                <button className="zalo-finish-btn" onClick={onClose}>
                    Hoàn tất quét (Đóng)
                </button>
            </div>
        </div>
    );
}
