import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './QRScannerModal.css';

/**
 * Sound synthesis helper using Web Audio API
 * Generates clear, offline-friendly chimes without requiring external MP3 assets
 */
function playChime(type = 'success') {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        if (type === 'success') {
            // Happy two-tone beep (high C -> E)
            const osc1 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);

            osc1.connect(gain);
            gain.connect(ctx.destination);

            osc1.start();
            osc1.stop(ctx.currentTime + 0.3);
        } else if (type === 'warning') {
            // Low buzz warning
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.36);
        }
    } catch (e) {
        console.warn('Audio chime error:', e);
    }
}

/**
 * Parses raw scanned QR string
 * Supported formats:
 * - "MSBT: 26015" -> ID: 15 (or 26015 matching)
 * - "MSBT: 15" -> ID: 15
 * - "26015" -> ID: 15 or 26015
 * - JSON { id: ... }
 */
function parseStudentId(decodedText) {
    if (!decodedText) return null;
    const text = String(decodedText).trim();

    // Regex format: MSBT: \d+
    const msbtMatch = text.match(/MSBT:\s*(\d+)/i);
    if (msbtMatch) {
        const fullNum = msbtMatch[1];
        return { rawText: text, idCandidate: fullNum };
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
    roomStudents = [], // Array of students assigned to current room
    allStudents = [], // Array of all students in school to detect wrong room
    currentRoomName = '',
    onConfirmStudent, // (student) => void
    scannedIds = new Set(), // Set of student IDs already marked Có mặt
}) {
    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const [scannerActive, setScannerActive] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [scannedCandidate, setScannedCandidate] = useState(null); // Student found in current room
    const [wrongRoomAlert, setWrongRoomAlert] = useState(null); // { student, actualRoom }
    const [recentSuccess, setRecentSuccess] = useState(null); // Last successfully confirmed student
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);

    // Stop and cleanup camera scanner
    const stopScanner = useCallback(async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            try {
                await html5QrCodeRef.current.stop();
            } catch (err) {
                console.warn('Error stopping QR scanner:', err);
            }
        }
        setScannerActive(false);
    }, []);

    // Process a decoded QR text
    const handleScanSuccess = useCallback((decodedText) => {
        if (!decodedText || scannedCandidate || wrongRoomAlert) return;

        const parsed = parseStudentId(decodedText);
        if (!parsed || !parsed.idCandidate) return;

        const candidateStr = parsed.idCandidate;
        // Search in current room's students (try exact id or id without prefix '26')
        let matchedStudent = roomStudents.find(s => {
            const sId = String(s.id);
            const sCardId = `26${String(s.id).padStart(3, '0')}`;
            return sId === candidateStr || sCardId === candidateStr || String(s.ma_hs) === candidateStr;
        });

        // Also check if candidateStr is like "26015" and s.id is 15
        if (!matchedStudent && candidateStr.startsWith('26') && candidateStr.length > 2) {
            const stripped = String(parseInt(candidateStr.slice(2), 10));
            matchedStudent = roomStudents.find(s => String(s.id) === stripped);
        }

        if (matchedStudent) {
            // Student is in this room!
            playChime('success');
            if (navigator.vibrate) navigator.vibrate([40, 40, 80]);

            // If already scanned Có mặt
            if (scannedIds.has(matchedStudent.id)) {
                setRecentSuccess({
                    student: matchedStudent,
                    alreadyDone: true,
                });
                setTimeout(() => setRecentSuccess(null), 2500);
                return;
            }

            // Pause scanning while confirming student card
            setScannedCandidate(matchedStudent);
        } else {
            // Student not in this room -> check if student is in another room
            let otherStudent = allStudents.find(s => {
                const sId = String(s.id);
                const sCardId = `26${String(s.id).padStart(3, '0')}`;
                return sId === candidateStr || sCardId === candidateStr || String(s.ma_hs) === candidateStr;
            });
            if (!otherStudent && candidateStr.startsWith('26') && candidateStr.length > 2) {
                const stripped = String(parseInt(candidateStr.slice(2), 10));
                otherStudent = allStudents.find(s => String(s.id) === stripped);
            }

            playChime('warning');
            if (navigator.vibrate) navigator.vibrate([150, 80, 150]);

            if (otherStudent) {
                const actualRoom = otherStudent.phong_an || otherStudent.phong_ngu || 'Chưa phân phòng';
                setWrongRoomAlert({
                    student: otherStudent,
                    actualRoom,
                    reason: 'wrong_room'
                });
            } else {
                setWrongRoomAlert({
                    rawText: parsed.rawText,
                    reason: 'not_found'
                });
            }
        }
    }, [roomStudents, allStudents, scannedCandidate, wrongRoomAlert, scannedIds]);

    // Start scanner when modal is opened
    useEffect(() => {
        let isMounted = true;

        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCameraError(null);
            setScannedCandidate(null);
            setWrongRoomAlert(null);

            const qrCodeId = 'qr-reader-viewport';
            const qrScanner = new Html5Qrcode(qrCodeId);
            html5QrCodeRef.current = qrScanner;

            const config = {
                fps: 15,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
            };

            // Request environment (rear) camera
            qrScanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    if (isMounted) handleScanSuccess(decodedText);
                },
                () => {
                    // QR decode frame miss, ignore
                }
            ).then(() => {
                if (isMounted) {
                    setScannerActive(true);
                    // Check if flashlight / torch is supported
                    try {
                        const track = qrScanner.getRunningTrackCameraCapabilities();
                        if (track && track.torchFeature && track.torchFeature().isSupported()) {
                            setHasTorch(true);
                        }
                    } catch {
                        // Torch capability check not supported
                    }
                }
            }).catch(err => {
                console.error('Camera start error:', err);
                if (isMounted) {
                    setCameraError('Không thể mở camera. Vui lòng cho phép quyền truy cập camera trong trình duyệt và thử lại.');
                }
            });
        }

        return () => {
            isMounted = false;
            stopScanner();
        };
    }, [isOpen, handleScanSuccess, stopScanner]);

    // Handle Teacher Confirm
    const handleConfirm = () => {
        if (!scannedCandidate) return;
        onConfirmStudent(scannedCandidate);
        setRecentSuccess({
            student: scannedCandidate,
            alreadyDone: false,
        });
        setScannedCandidate(null);
        setTimeout(() => setRecentSuccess(null), 2500);
    };

    // Toggle Torch
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
                    <button className="qr-close-btn" onClick={onClose} title="Đóng camera">
                        ✕
                    </button>
                </div>

                {/* Camera Viewport Area */}
                <div className="qr-viewport-wrapper">
                    <div id="qr-reader-viewport" ref={scannerRef}></div>

                    {/* Laser scanning line overlay */}
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
                                Hướng camera về mã QR trên thẻ bán trú của học sinh
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

                    {/* Recent Success Toast */}
                    {recentSuccess && (
                        <div className={`qr-toast-notice ${recentSuccess.alreadyDone ? 'info' : 'success'}`}>
                            <span className="qr-toast-icon">
                                {recentSuccess.alreadyDone ? 'ℹ️' : '✅'}
                            </span>
                            <div>
                                <strong>{recentSuccess.student.ho_ten}</strong>
                                <span className="qr-toast-sub">
                                    {recentSuccess.alreadyDone
                                        ? ' (Đã điểm danh trước đó)'
                                        : ' - Đã xác nhận CÓ MẶT'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Student Info Confirmation Card */}
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
                                        onClick={() => setScannedCandidate(null)}
                                    >
                                        Quét lại
                                    </button>
                                    <button
                                        className="btn btn-success btn-confirm-presence"
                                        onClick={handleConfirm}
                                        autoFocus
                                    >
                                        ✓ Xác nhận Có mặt
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Wrong Room / Not Found Alert Modal */}
                    {wrongRoomAlert && (
                        <div className="qr-confirm-card-overlay">
                            <div className="qr-confirm-card qr-card-warning">
                                <div className="qr-card-header">
                                    <div className="qr-warning-icon">⛔</div>
                                    <div className="qr-student-title">
                                        {wrongRoomAlert.reason === 'wrong_room' ? (
                                            <>
                                                <h4>SAI PHÒNG QUẢN LÝ!</h4>
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
                                                Học sinh này được phân công tại phòng <strong>{wrongRoomAlert.actualRoom}</strong>, không thuộc <strong>{currentRoomName}</strong>.
                                            </p>
                                            <p className="qr-warning-sub">
                                                Vui lòng nhắc học sinh về đúng phòng trực được phân công.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="qr-warning-desc">
                                            Không tìm thấy dữ liệu học sinh bán trú cho mã: <code>{wrongRoomAlert.rawText}</code>
                                        </p>
                                    )}
                                </div>

                                <div className="qr-card-actions">
                                    <button
                                        className="btn btn-primary w-100"
                                        onClick={() => setWrongRoomAlert(null)}
                                    >
                                        Tiếp tục quét học sinh khác
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
                            🔦 {torchOn ? 'Tắt đèn' : 'Bật đèn'}
                        </button>
                    )}
                    <div className="qr-scan-counter">
                        Đã quét Có mặt: <strong>{scannedIds.size} / {roomStudents.length}</strong> em
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>
                        Hoàn tất quét
                    </button>
                </div>
            </div>
        </div>
    );
}
