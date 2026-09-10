import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './QRScannerModal.css';

/**
 * Shared AudioContext singleton across scans
 * Prevents mobile browser audio engine re-init freezes
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
            // High-pitched pleasant dual-tone chime
            const osc1 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
            osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.07); // A5

            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.25);

            osc1.connect(gain);
            gain.connect(ctx.destination);

            osc1.start();
            osc1.stop(ctx.currentTime + 0.26);
        } else if (type === 'warning') {
            // Low buzz warning
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.setValueAtTime(160, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.31);
        }
    } catch (e) {
        console.warn('Audio chime error:', e);
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
    const [scannedCandidate, setScannedCandidate] = useState(null);
    const [wrongRoomAlert, setWrongRoomAlert] = useState(null);
    const [recentSuccess, setRecentSuccess] = useState(null);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    // Chế độ quét liên tục siêu tốc (Auto confirm không cần bấm nút)
    const [autoMode, setAutoMode] = useState(true);

    // Lưu trữ props mới nhất vào Ref để camera callback luôn thấy dữ liệu mới mà KHÔNG cần restart camera
    const propsRef = useRef({
        roomStudents,
        allStudents,
        currentRoomName,
        onConfirmStudent,
        scannedIds,
        autoMode,
    });
    useEffect(() => {
        propsRef.current = {
            roomStudents,
            allStudents,
            currentRoomName,
            onConfirmStudent,
            scannedIds,
            autoMode,
        };
    });

    const lastScannedTimeRef = useRef({});
    const isPausedRef = useRef(false);

    // Xử lý mã QR giải mã được
    const handleScan = useCallback((decodedText) => {
        if (!decodedText || isPausedRef.current) return;
        const now = Date.now();
        const parsed = parseStudentId(decodedText);
        if (!parsed || !parsed.idCandidate) return;

        const candidateStr = parsed.idCandidate;

        // Tránh quét lặp lại liên tục cùng 1 mã trong vòng 1.5 giây
        if (lastScannedTimeRef.current[candidateStr] && (now - lastScannedTimeRef.current[candidateStr] < 1500)) {
            return;
        }

        const {
            roomStudents: curRoomStudents,
            allStudents: curAllStudents,
            scannedIds: curScannedIds,
            autoMode: curAutoMode,
            onConfirmStudent: curOnConfirm,
            currentRoomName: curRoomName
        } = propsRef.current;

        // Tìm trong phòng hiện tại
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
            if (navigator.vibrate) navigator.vibrate([45, 30, 60]);

            // Nếu học sinh đã có mặt từ trước
            if (curScannedIds.has(matched.id)) {
                setRecentSuccess({ student: matched, alreadyDone: true });
                setTimeout(() => setRecentSuccess(null), 2000);
                return;
            }

            if (curAutoMode) {
                // Quét siêu tốc: Tự động đánh dấu Có mặt ngay lập tức, camera chạy mượt 60fps không ngắt quãng
                curOnConfirm(matched);
                setRecentSuccess({ student: matched, alreadyDone: false });
                setTimeout(() => setRecentSuccess(null), 2200);
            } else {
                // Chế độ thủ công: Tạm dừng và hiện popup xác nhận
                isPausedRef.current = true;
                setScannedCandidate(matched);
            }
            return;
        }

        // Kiểm tra học sinh có ở phòng khác không
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

        isPausedRef.current = true;
        if (otherStudent) {
            const actualRoom = otherStudent.phong_an || otherStudent.phong_ngu || 'Chưa phân phòng';
            setWrongRoomAlert({ student: otherStudent, actualRoom, reason: 'wrong_room', currentRoomName: curRoomName });
        } else {
            setWrongRoomAlert({ rawText: parsed.rawText, reason: 'not_found' });
        }
    }, []);

    // Khởi động Camera duy nhất 1 lần khi modal mở
    useEffect(() => {
        let isMounted = true;
        let qrScanner = null;

        if (!isOpen) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCameraError(null);
        setScannedCandidate(null);
        setWrongRoomAlert(null);
        isPausedRef.current = false;

        const qrCodeId = 'qr-reader-viewport';

        try {
            // Tối ưu hóa: Chỉ dò định dạng QR Code, dùng phần cứng BarcodeDetector của trình duyệt di động
            qrScanner = new Html5Qrcode(qrCodeId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false,
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true,
                },
            });
            html5QrCodeRef.current = qrScanner;

            const config = {
                fps: 10, // 10 lần quét/giây là tối ưu, video camera chạy native 30-60fps không bị nghẽn CPU
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const size = Math.max(180, Math.floor(minEdge * 0.7));
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
                    // Frame không có mã QR, bỏ qua không làm gì để giữ video mượt
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
                        // Trình duyệt không hỗ trợ toggle flash
                    }
                }
            }).catch(err => {
                console.error('Camera start error:', err);
                if (isMounted) {
                    setCameraError('Không thể mở camera. Vui lòng cho phép quyền truy cập camera trong cài đặt trình duyệt.');
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
                    console.warn('QR cleanup error:', err);
                }
            }
            setScannerActive(false);
        };
    }, [isOpen, handleScan]); // Chỉ chạy khi mở/đóng Modal, KHÔNG bị reset khi trạng thái học sinh thay đổi!

    // Xác nhận học sinh trong chế độ thủ công
    const handleConfirmManual = () => {
        if (!scannedCandidate) return;
        propsRef.current.onConfirmStudent(scannedCandidate);
        setRecentSuccess({ student: scannedCandidate, alreadyDone: false });
        setScannedCandidate(null);
        isPausedRef.current = false;
        setTimeout(() => setRecentSuccess(null), 2500);
    };

    const handleDismissCandidate = () => {
        setScannedCandidate(null);
        isPausedRef.current = false;
    };

    const handleDismissWrongRoom = () => {
        setWrongRoomAlert(null);
        isPausedRef.current = false;
    };

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
            console.warn('Torch toggle failed:', e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="qr-modal-overlay">
            <div className="qr-modal-container">
                {/* Header */}
                <div className="qr-modal-header">
                    <div className="qr-header-info">
                        <span className="qr-room-badge">📍 {currentRoomName || 'Phòng trực'}</span>
                        <h3>Quét thẻ điểm danh QR</h3>
                    </div>
                    <div className="qr-header-actions">
                        <button
                            className={`qr-mode-badge ${autoMode ? 'auto-on' : 'manual'}`}
                            onClick={() => setAutoMode(prev => !prev)}
                            title="Chạm để chuyển chế độ Quét tự động / Xác nhận thủ công"
                        >
                            {autoMode ? '⚡ Tự động: BẬT' : '✋ Xác nhận tay'}
                        </button>
                        <button className="qr-close-btn" onClick={onClose} title="Đóng camera">
                            ✕
                        </button>
                    </div>
                </div>

                {/* Camera Viewport Area */}
                <div className="qr-viewport-wrapper">
                    <div id="qr-reader-viewport" ref={scannerRef}></div>

                    {/* Laser scanning frame overlay - GPU hardware accelerated */}
                    {scannerActive && !scannedCandidate && !wrongRoomAlert && (
                        <div className="qr-scanner-overlay">
                            <div className="qr-target-box">
                                <div className="qr-corner top-left"></div>
                                <div className="qr-corner top-right"></div>
                                <div className="qr-corner bottom-left"></div>
                                <div className="qr-corner bottom-right"></div>
                                <div className="qr-scan-line"></div>
                            </div>
                            <p className="qr-scan-instruction">
                                {autoMode ? '⚡ Đưa mã QR vào khung — Máy sẽ tự động nhận diện' : 'Hướng camera vào mã QR trên thẻ bán trú'}
                            </p>
                        </div>
                    )}

                    {/* Camera error */}
                    {cameraError && (
                        <div className="qr-error-box">
                            <div className="qr-error-icon">⚠️</div>
                            <p>{cameraError}</p>
                            <button className="btn btn-primary btn-sm mt-2" onClick={onClose}>
                                Đóng lại
                            </button>
                        </div>
                    )}

                    {/* Thông báo kết quả quét siêu nhanh */}
                    {recentSuccess && (
                        <div className={`qr-toast-notice ${recentSuccess.alreadyDone ? 'info' : 'success'}`}>
                            <span className="qr-toast-icon">
                                {recentSuccess.alreadyDone ? 'ℹ️' : '✅'}
                            </span>
                            <div>
                                <strong>{recentSuccess.student.ho_ten} (Lớp {recentSuccess.student.lop})</strong>
                                <span className="qr-toast-sub">
                                    {recentSuccess.alreadyDone
                                        ? ' — Đã điểm danh trước đó'
                                        : ' — ĐÃ ĐIỂM DANH CÓ MẶT'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Xác nhận học sinh (khi tắt tự động) */}
                    {scannedCandidate && (
                        <div className="qr-confirm-card-overlay">
                            <div className="qr-confirm-card">
                                <div className="qr-card-header">
                                    <div className="qr-student-avatar">
                                        {scannedCandidate.gioi_tinh === 'Nữ' || scannedCandidate.gioi_tinh === 1 ? '👧' : '👦'}
                                    </div>
                                    <div className="qr-student-title">
                                        <h4>{scannedCandidate.ho_ten}</h4>
                                        <span className="qr-badge-class">Lớp {scannedCandidate.lop}</span>
                                    </div>
                                </div>

                                <div className="qr-student-details">
                                    <div className="qr-detail-row">
                                        <span className="label">Mã thẻ / ID:</span>
                                        <span className="value font-mono">MSBT: 26{String(scannedCandidate.id).padStart(3, '0')} (ID: #{scannedCandidate.id})</span>
                                    </div>
                                    <div className="qr-detail-row">
                                        <span className="label">Phòng phân công:</span>
                                        <span className="value text-success font-semibold">
                                            ✓ {currentRoomName} (Đúng phòng)
                                        </span>
                                    </div>
                                </div>

                                <div className="qr-card-actions">
                                    <button
                                        className="btn btn-outline-secondary btn-cancel-scan"
                                        onClick={handleDismissCandidate}
                                    >
                                        Bỏ qua
                                    </button>
                                    <button
                                        className="btn btn-success btn-confirm-presence"
                                        onClick={handleConfirmManual}
                                        autoFocus
                                    >
                                        ✓ Xác nhận Có mặt
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Cảnh báo sai phòng */}
                    {wrongRoomAlert && (
                        <div className="qr-confirm-card-overlay">
                            <div className="qr-confirm-card qr-card-warning">
                                <div className="qr-card-header">
                                    <div className="qr-warning-icon">⛔</div>
                                    <div className="qr-student-title">
                                        {wrongRoomAlert.reason === 'wrong_room' ? (
                                            <>
                                                <h4>HỌC SINH SAI PHÒNG!</h4>
                                                <span className="qr-badge-warning">{wrongRoomAlert.student.ho_ten} (Lớp {wrongRoomAlert.student.lop})</span>
                                            </>
                                        ) : (
                                            <h4>MÃ THẺ KHÔNG HỢP LỆ</h4>
                                        )}
                                    </div>
                                </div>

                                <div className="qr-student-details">
                                    {wrongRoomAlert.reason === 'wrong_room' ? (
                                        <>
                                            <p className="qr-warning-desc">
                                                Em này được xếp tại phòng <strong>{wrongRoomAlert.actualRoom}</strong>, không phải <strong>{currentRoomName}</strong>.
                                            </p>
                                            <p className="qr-warning-sub">
                                                Vui lòng hướng dẫn học sinh di chuyển về đúng phòng của mình.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="qr-warning-desc">
                                            Không tìm thấy dữ liệu học sinh với mã: <code>{wrongRoomAlert.rawText}</code>
                                        </p>
                                    )}
                                </div>

                                <div className="qr-card-actions">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={handleDismissWrongRoom}
                                    >
                                        Tiếp tục quét
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="qr-modal-footer">
                    {hasTorch && (
                        <button
                            className={`qr-tool-btn ${torchOn ? 'active' : ''}`}
                            onClick={toggleTorch}
                            title="Bật/Tắt đèn flash"
                        >
                            🔦 {torchOn ? 'Tắt flash' : 'Bật flash'}
                        </button>
                    )}
                    <div className="qr-scan-counter">
                        Đã có mặt: <strong>{scannedIds.size} / {roomStudents.length}</strong>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>
                        Xong
                    </button>
                </div>
            </div>
        </div>
    );
}
