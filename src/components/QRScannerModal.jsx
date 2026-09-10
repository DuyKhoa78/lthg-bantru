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

    // Format: MSBT: \d+
    const msbtMatch = text.match(/MSBT:\s*(\d+)/i);
    if (msbtMatch) {
        return { rawText: text, idCandidate: msbtMatch[1] };
    }

    // Pure number format
    if (/^\d+$/.test(text)) {
        return { rawText: text, idCandidate: text };
    }

    // JSON format
    try {
        const parsed = JSON.parse(text);
        if (parsed.id || parsed.ma_hs) {
            return { rawText: text, idCandidate: String(parsed.id || parsed.ma_hs) };
        }
    } catch {
        // Not JSON
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
            return sId === candidateStr || sCardId === candidateStr || String(s.ma_hs) === candidateStr;
        });
        if (!matched && candidateStr.startsWith('26') && candidateStr.length > 2) {
            const stripped = String(parseInt(candidateStr.slice(2), 10));
            matched = curRoomStudents.find(s => String(s.id) === stripped);
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
            return sId === candidateStr || sCardId === candidateStr || String(s.ma_hs) === candidateStr;
        });
        if (!otherStudent && candidateStr.startsWith('26') && candidateStr.length > 2) {
            const stripped = String(parseInt(candidateStr.slice(2), 10));
            otherStudent = curAllStudents.find(s => String(s.id) === stripped);
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

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCameraError(null);
        setToastNotice(null);

        const qrCodeId = 'zalo-qr-viewport';

        try {
            qrScanner = new Html5Qrcode(qrCodeId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false,
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true,
                },
            });
            html5QrCodeRef.current = qrScanner;

            const config = {
                fps: 15,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const size = Math.min(280, Math.max(190, Math.floor(minEdge * 0.72)));
                    return { width: size, height: size };
                },
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
            ).then(() => {
                if (isMounted) {
                    setScannerActive(true);
                    try {
                        const track = qrScanner.getRunningTrackCameraCapabilities();
                        if (track && track.torchFeature && track.torchFeature().isSupported()) {
                            setHasTorch(true);
                        }
                    } catch {
                        // Không hỗ trợ torch
                    }
                }
            }).catch(err => {
                console.error('Camera start error:', err);
                if (isMounted) {
                    setCameraError('Không thể mở camera. Vui lòng cho phép quyền truy cập máy ảnh trong cài đặt trình duyệt.');
                }
            });
        } catch (e) {
            console.error('QR Scanner init error:', e);
        }

        return () => {
            isMounted = false;
            if (qrScanner) {
                try {
                    if (qrScanner.isScanning) {
                        qrScanner.stop().catch(err => console.warn('QR stop warning:', err));
                    }
                    qrScanner.clear();
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
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ torch: nextState }]
            });
            setTorchOn(nextState);
        } catch (e) {
            console.warn('Torch toggle error:', e);
        }
    };

    if (!isOpen) return null;

    const presentCount = scannedIds.size;
    const totalCount = roomStudents.length;
    const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    return (
        <div className="zalo-scanner-fullscreen">
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
                {hasTorch ? (
                    <button
                        className={`zalo-btn-icon zalo-torch-btn ${torchOn ? 'on' : ''}`}
                        onClick={toggleTorch}
                        title="Bật/Tắt flash"
                    >
                        {torchOn ? '🔦' : '⚡'}
                    </button>
                ) : (
                    <div style={{ width: 38 }} />
                )}
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
                        Đặt mã QR thẻ bán trú vào giữa khung hình
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
            <div className="zalo-bottom-bar">
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
