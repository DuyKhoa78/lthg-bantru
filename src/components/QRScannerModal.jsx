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
    const [toastNotice, setToastNotice] = useState(null); // Floating Zalo-style banner
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hasZoom, setHasZoom] = useState(false);

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

    // Quét liên tục như Zalo: Nhận diện và chốt tức thì, không bao giờ dừng camera cho đến khi bấm tắt
    const handleScan = useCallback((decodedText) => {
        if (!decodedText) return;
        const now = Date.now();
        console.log('[QR SCAN DECODED]:', decodedText);

        const parsed = parseStudentId(decodedText);
        if (!parsed || !parsed.idCandidate) return;

        const candidateStr = parsed.idCandidate;

        // Tránh quét lặp lại cùng 1 thẻ trong vòng 1.5 giây
        if (lastScannedTimeRef.current[candidateStr] && (now - lastScannedTimeRef.current[candidateStr] < 1500)) {
            return;
        }

        const {
            roomStudents: curRoomStudents,
            allStudents: curAllStudents,
            scannedIds: curScannedIds,
            onConfirmStudent: curOnConfirm,
            currentRoomName: curRoomName
        } = propsRef.current;

        // 1. Tìm học sinh trong phòng hiện tại
        let matched = curRoomStudents.find(s => {
            const sId = String(s.id);
            const sCardId = `26${String(s.id).padStart(3, '0')}`;
            return (
                sId === candidateStr ||
                sCardId === candidateStr ||
                (s.ma_hs && String(s.ma_hs) === candidateStr) ||
                (s.raw_id && String(s.raw_id) === candidateStr)
            );
        });

        // Nếu candidateStr dạng "26015" -> stripped là "15", so sánh với s.id
        if (!matched && candidateStr.startsWith('26') && candidateStr.length > 2) {
            const stripped = String(parseInt(candidateStr.slice(2), 10));
            matched = curRoomStudents.find(s => String(s.id) === stripped || (s.raw_id && String(s.raw_id) === stripped));
        }

        // Thử tìm theo rawText chứa id
        if (!matched) {
            matched = curRoomStudents.find(s => parsed.rawText.includes(String(s.id)));
        }

        if (matched) {
            lastScannedTimeRef.current[candidateStr] = now;
            playChime('success');
            if (navigator.vibrate) navigator.vibrate([40, 30, 50]);

            // Nháy sáng xanh khung quét
            setBoxFlash('success');
            setTimeout(() => setBoxFlash(null), 450);

            // Kiểm tra nếu đã có mặt
            if (curScannedIds.has(matched.id)) {
                setToastNotice({
                    type: 'info',
                    name: matched.ho_ten,
                    detail: `Lớp ${matched.lop} — Đã điểm danh trước đó`,
                    avatar: matched.gioi_tinh === 'Nữ' || matched.gioi_tinh === 1 ? '👧' : '👦',
                });
                setTimeout(() => setToastNotice(null), 2000);
                return;
            }

            // Tự động chốt CÓ MẶT ngay lập tức!
            curOnConfirm(matched);
            setToastNotice({
                type: 'success',
                name: matched.ho_ten,
                detail: `Lớp ${matched.lop} • ID #${matched.id} — ĐÃ CÓ MẶT`,
                avatar: matched.gioi_tinh === 'Nữ' || matched.gioi_tinh === 1 ? '👧' : '👦',
            });
            setTimeout(() => setToastNotice(null), 2500);
            return;
        }

        // 2. Tìm học sinh thuộc phòng khác (Báo sai phòng)
        let otherStudent = curAllStudents.find(s => {
            const sId = String(s.id);
            const sCardId = `26${String(s.id).padStart(3, '0')}`;
            return (
                sId === candidateStr ||
                sCardId === candidateStr ||
                (s.ma_hs && String(s.ma_hs) === candidateStr) ||
                (s.raw_id && String(s.raw_id) === candidateStr)
            );
        });
        if (!otherStudent && candidateStr.startsWith('26') && candidateStr.length > 2) {
            const stripped = String(parseInt(candidateStr.slice(2), 10));
            otherStudent = curAllStudents.find(s => String(s.id) === stripped || (s.raw_id && String(s.raw_id) === stripped));
        }
        if (!otherStudent) {
            otherStudent = curAllStudents.find(s => parsed.rawText.includes(String(s.id)));
        }

        lastScannedTimeRef.current[candidateStr] = now;
        playChime('warning');
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);

        // Nháy đỏ khung quét
        setBoxFlash('warning');
        setTimeout(() => setBoxFlash(null), 500);

        if (otherStudent) {
            const actualRoom = otherStudent.phong_an || otherStudent.phong_ngu || 'Chưa phân phòng';
            setToastNotice({
                type: 'warning',
                name: `SAI PHÒNG: ${otherStudent.ho_ten} (Lớp ${otherStudent.lop})`,
                detail: `Thuộc ${actualRoom} • Không thuộc ${curRoomName}`,
                avatar: '⛔',
            });
        } else {
            setToastNotice({
                type: 'error',
                name: 'MÃ THẺ KHÔNG HỢP LỆ',
                detail: `Không có dữ liệu HS với mã: ${parsed.rawText}`,
                avatar: '❓',
            });
        }
        setTimeout(() => setToastNotice(null), 3000);
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
        setToastNotice(null);
        setZoomLevel(1);

        const qrCodeId = 'zalo-qr-viewport';

        try {
            // Tắt BarcodeDetector để dùng ZXing thuần túy 100% tương thích mọi điện thoại di động
            qrScanner = new Html5Qrcode(qrCodeId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                useBarCodeDetectorIfSupported: false,
                verbose: false,
            });
            html5QrCodeRef.current = qrScanner;

            // Quét toàn bộ khung hình để bắt mã QR siêu nhạy tại bất kỳ góc nào,
            // không giới hạn qrbox cố định để tránh lỗi tràn kích thước (bounds error) trên màn hình nhỏ
            const config = {
                fps: 15,
                aspectRatio: undefined,
                disableFlip: false,
            };

            // Ràng buộc camera: Bắt buộc đúng 1 thuộc tính facingMode để không bị lỗi OverconstrainedError
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

                // Sau khi camera đã chạy, xin bật lấy nét tự động liên tục (autofocus)
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

                // Kiểm tra khả năng Bật Flash & Thu Phóng (Zoom)
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
            if (qrScanner) {
                try {
                    const state = qrScanner.getState ? qrScanner.getState() : null;
                    // Nếu đang scanning (state 2) hoặc paused (state 3)
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

    // Phóng to 2x / 1x (Hỗ trợ lấy nét mã QR nhỏ từ khoảng cách xa)
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

    // Chạm vào màn hình để kích hoạt lại lấy nét (Tap to focus)
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

    return (
        <div className="zalo-scanner-fullscreen" onClick={handleTapToFocus}>
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

            {/* 3. Floating Notification Dropdown (Zalo style - Không ngắt quãng camera) */}
            {toastNotice && (
                <div className={`zalo-scan-toast ${toastNotice.type}`}>
                    <div className="zalo-toast-avatar">{toastNotice.avatar}</div>
                    <div className="zalo-toast-text">
                        <strong className="zalo-toast-name">{toastNotice.name}</strong>
                        <span className="zalo-toast-sub">{toastNotice.detail}</span>
                    </div>
                </div>
            )}

            {/* 4. Center Scanner Reticle (Khung quét chính giữa màn hình như Zalo) */}
            {scannerActive && (
                <div className="zalo-center-container">
                    <div className={`zalo-reticle-box ${boxFlash || ''}`}>
                        {/* 4 Corner brackets */}
                        <div className="zalo-corner tl"></div>
                        <div className="zalo-corner tr"></div>
                        <div className="zalo-corner bl"></div>
                        <div className="zalo-corner br"></div>

                        {/* Tia laser quét chạy mượt mà lên xuống */}
                        <div className="zalo-laser-line"></div>
                    </div>

                    <p className="zalo-guide-hint">
                        Đưa mã QR vào khung viền (khoảng cách 15 – 25cm)
                    </p>
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

            {/* 5. Bottom Status Bar */}
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
