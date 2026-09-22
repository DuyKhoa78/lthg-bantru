import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { parseStudentId, findStudentByCandidate } from '../utils/qrUtils';
import './QRScannerModal.css';

/**
 * Audio Context quản lý âm thanh thông báo chuẩn Zalo (Zero latency)
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
            // Crisp high ping (C6 -> E6)
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
        if (import.meta.env.DEV) console.warn('Audio error:', e);
    }
}

/**
 * Thuật toán chọn camera sau chính (tránh camera trước, ultrawide và macro)
 */
function selectBestBackCamera(cameras) {
    if (!Array.isArray(cameras) || cameras.length === 0) return null;

    let bestCam = null;
    let highestScore = -999;

    cameras.forEach(cam => {
        const label = String(cam.label || '').toLowerCase();
        let score = 0;

        // Ưu tiên camera sau (back / rear / environment / sau)
        if (label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('sau') || label.includes('facing back')) {
            score += 30;
        }

        // Ưu tiên camera chính (main / 0 / primary / camera 0 / chính)
        if (label.includes('main') || label.includes('camera 0') || label.includes('chính') || label.includes('primary') || label.includes('1x')) {
            score += 15;
        }

        // Tránh camera góc siêu rộng (wide, ultra, 0.5x, 0.6x)
        if (label.includes('wide') || label.includes('ultra') || label.includes('0.5') || label.includes('0.6')) {
            score -= 20;
        }

        // Tránh camera macro
        if (label.includes('macro')) {
            score -= 20;
        }

        // Tránh tuyệt đối camera trước (front, user, trước, selfie)
        if (label.includes('front') || label.includes('user') || label.includes('trước') || label.includes('selfie') || label.includes('facing front')) {
            score -= 100;
        }

        if (score > highestScore) {
            highestScore = score;
            bestCam = cam;
        }
    });

    return highestScore > 0 ? bestCam : null;
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
    const sessionIdRef = useRef(0);
    const fileInputRef = useRef(null);

    const [scannerActive, setScannerActive] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [boxFlash, setBoxFlash] = useState(null); // 'success' | 'warning'
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hasZoom, setHasZoom] = useState(false);
    const [zoomLimits, setZoomLimits] = useState({ min: 1, max: 2, step: 0.1 });
    const [focusRing, setFocusRing] = useState(null);
    const [showIdleGuide, setShowIdleGuide] = useState(false);
    const [hasAutoFocus, setHasAutoFocus] = useState(true);

    // Camera Selector States (Mặc định -1 để luôn ưu tiên tự động chọn camera sau)
    const [cameras, setCameras] = useState([]);
    const [activeCamIndex, setActiveCamIndex] = useState(-1);
    const [currentCamLabel, setCurrentCamLabel] = useState('');

    // Quick Manual & File Input States
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualText, setManualText] = useState('');
    const [isScanningFile, setIsScanningFile] = useState(false);

    // === TRẠNG THÁI XÁC NHẬN (Zalo-style) ===
    const [pendingStudent, setPendingStudent] = useState(null);
    const [pendingType, setPendingType] = useState(null); // 'new' | 'already' | 'wrong_room' | 'invalid'
    const [pendingExtra, setPendingExtra] = useState(null);
    const [miniToast, setMiniToast] = useState(null);

    // Props Ref để tránh camera restart khi props thay đổi
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
    const handleScanRef = useRef(null);
    const idleTimerRef = useRef(null);

    // Reset idle guidance timer
    const resetIdleTimer = useCallback(() => {
        setShowIdleGuide(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setShowIdleGuide(true);
        }, 3500);
    }, []);

    // === QUÉT & GIẢI MÃ QR (Chạy liên tục, không ngắt camera) ===
    const handleScan = useCallback((decodedText) => {
        if (!decodedText) return;
        if (isPendingRef.current) return; // Đang hiện thẻ xác nhận, bỏ qua frame

        const now = Date.now();
        resetIdleTimer();

        // 1. Phân tích mã QR theo quy tắc
        const parsed = parseStudentId(decodedText);
        const rawText = parsed ? parsed.rawText : String(decodedText);
        const candidateStr = parsed?.idCandidate;

        // Chống quét trùng lặp trong vòng 2 giây
        const dedupeKey = candidateStr || rawText;
        if (lastScannedTimeRef.current[dedupeKey] && (now - lastScannedTimeRef.current[dedupeKey] < 2000)) {
            return;
        }
        lastScannedTimeRef.current[dedupeKey] = now;

        const {
            roomStudents: curRoomStudents,
            allStudents: curAllStudents,
            scannedIds: curScannedIds,
            currentRoomName: curRoomName
        } = propsRef.current;

        // Nếu mã QR không trích xuất được ID hợp lệ
        if (!candidateStr) {
            playChime('warning');
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setBoxFlash('warning');
            setTimeout(() => setBoxFlash(null), 600);

            isPendingRef.current = true;
            setPendingStudent(null);
            setPendingType('invalid');
            setPendingExtra({ rawText: `Đã đọc được mã: "${rawText}" (Không phải định dạng thẻ bán trú)` });
            return;
        }

        // 2. Tìm học sinh trong phòng hiện tại
        const matched = curRoomStudents && curRoomStudents.length > 0
            ? findStudentByCandidate(curRoomStudents, candidateStr)
            : null;

        if (matched) {
            playChime('success');
            if (navigator.vibrate) navigator.vibrate([40, 30, 50]);
            setBoxFlash('success');
            setTimeout(() => setBoxFlash(null), 600);

            isPendingRef.current = true;
            setPendingStudent(matched);
            setPendingType(curScannedIds.has(matched.id) ? 'already' : 'new');
            setPendingExtra(null);
            return;
        }

        // 3. Tìm trong toàn trường (Học sinh sai phòng)
        const otherStudent = curAllStudents && curAllStudents.length > 0
            ? findStudentByCandidate(curAllStudents, candidateStr)
            : null;

        playChime('warning');
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        setBoxFlash('warning');
        setTimeout(() => setBoxFlash(null), 600);

        isPendingRef.current = true;
        if (otherStudent) {
            const actualRoom = otherStudent.phong_an || otherStudent.phong_ngu || 'Chưa phân phòng';
            setPendingStudent(otherStudent);
            setPendingType('wrong_room');
            setPendingExtra({ actualRoom, curRoomName });
        } else {
            setPendingStudent(null);
            setPendingType('invalid');
            setPendingExtra({ rawText: `Mã: ${candidateStr} (Không tìm thấy học sinh này trong danh sách trường)` });
        }
    }, [resetIdleTimer]);

    useEffect(() => {
        handleScanRef.current = handleScan;
    });

    // === XÁC NHẬN CÓ MẶT (GV bấm nút xác nhận) ===
    const handleConfirm = useCallback(() => {
        if (!pendingStudent || pendingType !== 'new') return;
        const { onConfirmStudent: curOnConfirm } = propsRef.current;

        playChime('confirm');
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);

        curOnConfirm(pendingStudent);

        setMiniToast({
            name: pendingStudent.ho_ten,
            lop: pendingStudent.lop,
        });
        setTimeout(() => setMiniToast(null), 2000);

        // Mở khóa quét tiếp ngay lập tức
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        isPendingRef.current = false;
        resetIdleTimer();
    }, [pendingStudent, pendingType, resetIdleTimer]);

    // === BỎ QUA THẺ ĐANG CHỜ & TIẾP TỤC QUÉT ===
    const handleDismiss = useCallback(() => {
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        isPendingRef.current = false;
        resetIdleTimer();
    }, [resetIdleTimer]);

    // === KHỞI ĐỘNG CAMERA (Quản lý session an toàn chống leak & StrictMode) ===
    useEffect(() => {
        if (!isOpen) return;

        const currentSession = ++sessionIdRef.current;
        let qrScannerInstance = null;

        // Unlock AudioContext cho thiết bị di động
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
            // ignore
        }

        setCameraError(null);
        setMiniToast(null);
        setPendingStudent(null);
        setPendingType(null);
        setPendingExtra(null);
        setZoomLevel(1);
        setShowIdleGuide(false);
        isPendingRef.current = false;

        const qrCodeId = 'zalo-qr-viewport';

        async function initCamera() {
            try {
                qrScannerInstance = new Html5Qrcode(qrCodeId, {
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                    ],
                    useBarCodeDetectorIfSupported: true,
                    verbose: false,
                });
                html5QrCodeRef.current = qrScannerInstance;

                // 1. Lấy danh sách camera
                let availableCameras = [];
                try {
                    availableCameras = await Html5Qrcode.getCameras();
                    if (currentSession !== sessionIdRef.current) return;
                    if (Array.isArray(availableCameras) && availableCameras.length > 0) {
                        setCameras(availableCameras);
                    }
                } catch (enumErr) {
                    if (import.meta.env.DEV) console.debug('Camera enum fallback:', enumErr);
                }

                // Chọn camera mục tiêu: CỐ ĐỊNH ƯU TIÊN CAMERA SAU
                let targetCam = null;
                if (availableCameras.length > 0) {
                    if (activeCamIndex >= 0 && activeCamIndex < availableCameras.length) {
                        targetCam = availableCameras[activeCamIndex];
                    } else {
                        targetCam = selectBestBackCamera(availableCameras);
                        if (targetCam) {
                            const idx = availableCameras.findIndex(c => c.id === targetCam.id);
                            if (idx >= 0) setActiveCamIndex(idx);
                        }
                    }
                }

                // 2. Cấu hình máy quét: chỉ QR_CODE, fps 15, vùng quét 80%
                const config = {
                    fps: 15,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const boxSize = Math.max(220, Math.floor(minEdge * 0.80));
                        return { width: boxSize, height: boxSize };
                    },
                    disableFlip: false,
                };

                const onScanSuccess = (decodedText) => {
                    if (currentSession === sessionIdRef.current && handleScanRef.current) {
                        handleScanRef.current(decodedText);
                    }
                };
                const onScanError = () => {
                    // Frame không có mã QR
                };

                // Khởi động bằng Device ID + videoConstraints camera sau
                let started = false;
                if (targetCam && targetCam.id) {
                    try {
                        const camConfig = {
                            ...config,
                            videoConstraints: {
                                deviceId: { exact: targetCam.id },
                                facingMode: 'environment',
                                width: { min: 640, ideal: 1280, max: 1920 },
                                height: { min: 480, ideal: 720, max: 1080 },
                            },
                        };
                        await qrScannerInstance.start(
                            targetCam.id,
                            camConfig,
                            onScanSuccess,
                            onScanError
                        );
                        started = true;
                        setCurrentCamLabel(targetCam.label || 'Camera sau');
                    } catch (exactErr) {
                        if (import.meta.env.DEV) console.warn('Start camera by target ID failed, trying fallback:', exactErr);
                    }
                }

                if (!started) {
                    const envConfig = {
                        ...config,
                        videoConstraints: {
                            facingMode: { ideal: 'environment' },
                            width: { min: 640, ideal: 1280, max: 1920 },
                            height: { min: 480, ideal: 720, max: 1080 },
                        },
                    };
                    try {
                        await qrScannerInstance.start(
                            { facingMode: 'environment' },
                            envConfig,
                            onScanSuccess,
                            onScanError
                        );
                        started = true;
                        setCurrentCamLabel('Camera sau');
                    } catch (envErr) {
                        if (import.meta.env.DEV) console.warn('Environment camera failed, trying user camera:', envErr);
                        await qrScannerInstance.start(
                            { facingMode: 'user' },
                            config,
                            onScanSuccess,
                            onScanError
                        );
                        started = true;
                        setCurrentCamLabel('Camera trước');
                    }
                }

                if (currentSession !== sessionIdRef.current) {
                    try { await qrScannerInstance.stop(); } catch (err) { void err; }
                    return;
                }

                setScannerActive(true);
                resetIdleTimer();

                // 3. Đọc capabilities qua API chính thức và kích hoạt autofocus
                try {
                    const caps = qrScannerInstance.getRunningTrackCapabilities();
                    const settings = qrScannerInstance.getRunningTrackSettings();
                    if (import.meta.env.DEV) {
                        console.info('[QR Camera] Resolution:', settings.width, '×', settings.height);
                        console.info('[QR Camera] Capabilities:', caps);
                    }

                    // Bật autofocus liên tục + exposure + white balance qua applyVideoConstraints
                    const advancedConstraints = [];
                    let cameraHasAutoFocus = false;
                    if (caps.focusMode && caps.focusMode.includes('continuous')) {
                        advancedConstraints.push({ focusMode: 'continuous' });
                        cameraHasAutoFocus = true;
                    }
                    setHasAutoFocus(cameraHasAutoFocus);

                    if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
                        advancedConstraints.push({ exposureMode: 'continuous' });
                    }
                    if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) {
                        advancedConstraints.push({ whiteBalanceMode: 'continuous' });
                    }

                    if (advancedConstraints.length > 0) {
                        try {
                            await qrScannerInstance.applyVideoConstraints({
                                advanced: advancedConstraints,
                            });
                        } catch (constrainErr) {
                            // applyVideoConstraints validates input — fallback nếu advanced không được hỗ trợ
                            if (import.meta.env.DEV) console.debug('applyVideoConstraints advanced fallback:', constrainErr);
                        }
                    }

                    // Kiểm tra Flash
                    if (caps.torch) {
                        setHasTorch(true);
                    } else {
                        setHasTorch(false);
                        setTorchOn(false);
                    }

                    // Kiểm tra Zoom
                    if (caps.zoom) {
                        setHasZoom(true);
                        setZoomLimits({
                            min: caps.zoom.min || 1,
                            max: caps.zoom.max || 2,
                            step: caps.zoom.step || 0.1,
                        });
                        // Giữ zoom mặc định 1.0x (không ép zoom quá mức để trường nhìn rộng tự nhiên)
                        setZoomLevel(1);
                    } else {
                        setHasZoom(false);
                    }
                } catch (capErr) {
                    if (import.meta.env.DEV) console.debug('Capabilities read error (camera may not support):', capErr);
                    setHasAutoFocus(false);
                }
            } catch (err) {
                if (currentSession !== sessionIdRef.current) return;
                console.error('Camera start error:', err);
                setCameraError('Không thể mở camera. Vui lòng cấp quyền truy cập máy ảnh cho trình duyệt và thử lại.');
            }
        }

        initCamera();

        // 4. Dọn dẹp an toàn khi đóng modal hoặc unmount hoặc đổi camera
        return () => {
            isPendingRef.current = false;
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

            if (qrScannerInstance) {
                const doCleanup = async () => {
                    try {
                        const state = qrScannerInstance.getState ? qrScannerInstance.getState() : null;
                        // state 2 = SCANNING, state 3 = PAUSED
                        if (qrScannerInstance.isScanning || state === 2 || state === 3) {
                            await qrScannerInstance.stop();
                        }
                    } catch (err) {
                        void err;
                    }
                    try {
                        qrScannerInstance.clear();
                    } catch (err) {
                        void err;
                    }
                };
                doCleanup();
            }
            html5QrCodeRef.current = null;
            setScannerActive(false);
        };
    }, [isOpen, activeCamIndex, resetIdleTimer]);

    // Chuyển đổi camera
    const handleSwitchCamera = () => {
        if (cameras.length <= 1) return;
        setActiveCamIndex(prev => (prev + 1) % cameras.length);
    };

    // Bật/Tắt Flashlight qua API chính thức
    const toggleTorch = async () => {
        if (!html5QrCodeRef.current || !hasTorch) return;
        try {
            const nextState = !torchOn;
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ torch: nextState }],
            });
            setTorchOn(nextState);
        } catch (e) {
            if (import.meta.env.DEV) console.warn('Torch toggle error:', e);
        }
    };

    // Phóng to Zoom qua API chính thức
    const toggleZoom = async () => {
        if (!html5QrCodeRef.current || !hasZoom) return;
        try {
            const targetZoom = zoomLevel >= zoomLimits.max ? zoomLimits.min : Math.min(zoomLevel + 1, zoomLimits.max);
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ zoom: targetZoom }],
            });
            setZoomLevel(targetZoom);
        } catch (e) {
            if (import.meta.env.DEV) console.warn('Zoom error:', e);
        }
    };

    // Chạm vào màn hình để kích hoạt lấy nét + vòng tròn hoạt họa
    const handleTapToFocus = async (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setFocusRing({ x, y });
        setTimeout(() => setFocusRing(null), 750);

        if (!html5QrCodeRef.current) return;
        try {
            const caps = html5QrCodeRef.current.getRunningTrackCapabilities();
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                await html5QrCodeRef.current.applyVideoConstraints({
                    advanced: [{ focusMode: 'continuous' }],
                });
            }
        } catch (err) {
            if (import.meta.env.DEV) console.debug('Tap to focus error:', err);
        }
    };

    // Kích hoạt chọn file ảnh QR
    const handleTriggerFileScan = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Xử lý đọc file ảnh QR được tải lên
    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanningFile(true);
        try {
            const sandboxId = 'zalo-file-scan-sandbox';
            const fileScanner = new Html5Qrcode(sandboxId);
            const decodedText = await fileScanner.scanFile(file, false);
            try { fileScanner.clear(); } catch { /* ignore */ }

            if (decodedText) {
                handleScan(decodedText);
            } else {
                alert('Không tìm thấy mã QR trong hình ảnh vừa chọn.');
            }
        } catch (err) {
            console.warn('File scan error:', err);
            alert('Không tìm thấy mã QR trong ảnh vừa chọn. Vui lòng chọn ảnh chụp rõ nét hơn.');
        } finally {
            setIsScanningFile(false);
            if (e.target) e.target.value = '';
        }
    };

    // Xử lý tìm kiếm / nhập tay
    const handleManualSearch = (e) => {
        e.preventDefault();
        if (!manualText.trim()) return;
        const query = manualText.trim();
        handleScan(query);
        setShowManualInput(false);
        setManualText('');
    };

    if (!isOpen) return null;

    const presentCount = scannedIds.size;
    const totalCount = roomStudents.length;
    const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
    const hasPending = pendingType !== null;
    const isStudentsLoading = !roomStudents || roomStudents.length === 0;

    const genderAvatar = (student) => {
        if (!student) return '👤';
        return student.gioi_tinh === 'Nữ' || student.gioi_tinh === 1 ? '👧' : '👦';
    };

    return (
        <div className="zalo-scanner-fullscreen" onClick={hasPending ? undefined : handleTapToFocus}>
            {/* Sandbox ẩn để giải mã ảnh QR tải lên */}
            <div id="zalo-file-scan-sandbox" style={{ display: 'none' }}></div>
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelected}
            />

            {/* 1. Camera Viewport */}
            <div id="zalo-qr-viewport" ref={scannerRef}></div>

            {/* Hiệu ứng vòng tròn lấy nét khi chạm */}
            {focusRing && (
                <div
                    className="zalo-focus-ring"
                    style={{ left: `${focusRing.x}px`, top: `${focusRing.y}px` }}
                />
            )}

            {/* 2. Top Header (Zalo style) */}
            <div className="zalo-top-bar" onClick={(e) => e.stopPropagation()}>
                <button className="zalo-btn-icon" onClick={onClose} title="Đóng máy quét">
                    ✕
                </button>
                <div className="zalo-title-group">
                    <span className="zalo-room-pill">📍 {currentRoomName || 'Phòng trực'}</span>
                    <span className="zalo-header-title">Quét mã QR bán trú</span>
                </div>
                <div className="zalo-header-right-btns">
                    {cameras.length > 1 && (
                        <button
                            className="zalo-btn-icon"
                            onClick={handleSwitchCamera}
                            title="Đổi camera khác"
                        >
                            🔄
                        </button>
                    )}
                    {hasZoom && (
                        <button
                            className={`zalo-btn-icon zalo-zoom-btn ${zoomLevel > 1 ? 'on' : ''}`}
                            onClick={toggleZoom}
                            title="Chỉnh mức thu phóng"
                        >
                            {zoomLevel.toFixed(1)}x
                        </button>
                    )}
                    {hasTorch ? (
                        <button
                            className={`zalo-btn-icon zalo-torch-btn ${torchOn ? 'on' : ''}`}
                            onClick={toggleTorch}
                            title="Bật/Tắt đèn flash"
                        >
                            {torchOn ? '🔦' : '⚡'}
                        </button>
                    ) : (
                        <div style={{ width: 40 }} />
                    )}
                </div>
            </div>

            {/* Huy hiệu camera đang hoạt động */}
            {currentCamLabel && (
                <div className="zalo-cam-badge">
                    📷 {currentCamLabel}
                </div>
            )}

            {/* Thông báo đang tải học sinh nếu danh sách rỗng */}
            {isStudentsLoading && (
                <div className="zalo-loading-students-overlay">
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: '#38bdf8' }}></i>
                    <span>Đang tải dữ liệu học sinh phòng trực...</span>
                </div>
            )}

            {/* 3. Mini toast xác nhận thành công */}
            {miniToast && (
                <div className="zalo-scan-toast success">
                    <div className="zalo-toast-avatar">✅</div>
                    <div className="zalo-toast-text">
                        <strong className="zalo-toast-name">{miniToast.name}</strong>
                        <span className="zalo-toast-sub">Lớp {miniToast.lop} — ĐÃ XÁC NHẬN CÓ MẶT</span>
                    </div>
                </div>
            )}

            {/* 4. Khung quét QR chính giữa (Reticle) */}
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
                        Giữ thẻ cách camera khoảng 15 – 20 cm để bắt nét chuẩn nhất
                    </p>

                    {/* Hướng dẫn lấy nét thủ công nếu camera không hỗ trợ autofocus */}
                    {!hasAutoFocus && (
                        <p className="zalo-no-autofocus-hint">
                            📐 Camera không tự lấy nét — giữ mã QR cách 15–25 cm, từ từ thay đổi khoảng cách
                        </p>
                    )}

                    {/* Phím tắt tiện ích: Tải ảnh & Nhập tay */}
                    <div className="zalo-secondary-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="zalo-action-chip-btn"
                            onClick={handleTriggerFileScan}
                            disabled={isScanningFile}
                        >
                            {isScanningFile ? '⏳ Đang quét ảnh...' : '🖼️ Quét từ ảnh'}
                        </button>
                        <button
                            type="button"
                            className="zalo-action-chip-btn"
                            onClick={() => setShowManualInput(prev => !prev)}
                        >
                            ⌨️ Nhập mã tay
                        </button>
                    </div>

                    {showIdleGuide && (
                        <div className="zalo-idle-guidance">
                            <i className="fas fa-hand-pointer"></i>
                            <span>{hasAutoFocus ? 'Chạm màn hình để lấy nét lại' : 'Giữ mã QR cách 15–25 cm rồi từ từ đưa ra/vào'}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Ngăn nhập thủ công nhanh */}
            {showManualInput && (
                <div className="zalo-manual-input-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="zalo-manual-header">
                        <span>🔍 Nhập mã số thẻ hoặc tên học sinh</span>
                        <button
                            type="button"
                            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}
                            onClick={() => setShowManualInput(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <form onSubmit={handleManualSearch} className="zalo-manual-input-box">
                        <input
                            type="text"
                            className="zalo-manual-input"
                            placeholder="Ví dụ: 26057 hoặc Nguyễn Văn..."
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="zalo-manual-submit-btn">
                            Tìm
                        </button>
                    </form>
                </div>
            )}

            {/* 5. THẺ XÁC NHẬN HỌC SINH (Bottom Sheet Zalo-style) */}
            {hasPending && (
                <div className="zalo-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                    <div className={`zalo-confirm-card ${pendingType}`}>
                        {/* Học sinh thuộc phòng, cần xác nhận */}
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

                        {/* Học sinh đã điểm danh trước đó */}
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
                                        <p className="zalo-confirm-note already">Học sinh này đã được ghi nhận có mặt</p>
                                    </div>
                                </div>
                                <div className="zalo-confirm-actions">
                                    <button className="zalo-confirm-btn secondary" onClick={handleDismiss}>
                                        Đã biết — Quét tiếp
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Học sinh sai phòng (Chỉ cảnh báo, không tự động xác nhận) */}
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
                                            Không thuộc danh sách {pendingExtra?.curRoomName}
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

                        {/* Mã thẻ không hợp lệ */}
                        {pendingType === 'invalid' && (
                            <>
                                <div className="zalo-confirm-header">
                                    <div className="zalo-confirm-avatar-lg">❓</div>
                                    <div className="zalo-confirm-info">
                                        <h3 className="zalo-confirm-name">Kết quả quét mã</h3>
                                        <p className="zalo-confirm-note invalid">
                                            {pendingExtra?.rawText || 'Không tìm thấy học sinh'}
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

            {/* Báo lỗi Camera */}
            {cameraError && (
                <div className="zalo-error-popup">
                    <div className="zalo-error-icon">⚠️</div>
                    <p>{cameraError}</p>
                    <button className="btn btn-light btn-sm mt-3" onClick={onClose}>
                        Đóng lại
                    </button>
                </div>
            )}

            {/* 6. Thanh tiến độ đáy */}
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
