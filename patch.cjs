const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/nghiepvu/DiemDanhNgu.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Thêm states cauhinhNgay, extraHsList
content = content.replace(
    "const [hasSchedule, setHasSchedule] = useState(null); // null = đang tải",
    `const [hasSchedule, setHasSchedule] = useState(null); // null = đang tải\n    const [cauhinhNgay, setCauhinhNgay] = useState(null); // cấu hình ngày đặc biệt\n    const [extraHsList, setExtraHsList] = useState([]); // HS thêm tay với phòng override\n\n    // Derived: phòng tạm cho buổi ngủ\n    const phongTamNgu = cauhinhNgay?.phong_tam_ngu || null;`
);

// 2. Thêm logic cập nhật cauhinhNgay trong fetchDiemDanh
content = content.replace(
    /setHasSchedule\(res\.data\.has_schedule === true\);\s*\}\s*\}\)\s*\.catch\(console\.error\)/,
    `setHasSchedule(res.data.has_schedule === true);\n                    // Cấu hình ngày đặc biệt\n                    const cfg = res.data.cauhinh_ngay || null;\n                    setCauhinhNgay(cfg);\n                    setExtraHsList(cfg?.hs_them_vao?.length > 0 ? cfg.hs_them_vao : []);\n                }\n            })\n            .catch(console.error)`
);

// 3. Thay thế đoạn useEffect auto-select, students, roomStats cũ
const oldLogicStart = "useEffect(() => {\n        fetchDiemDanh(date);\n        setOverrides({});\n        setSaved(false);\n    }, [date, fetchDiemDanh]);";
const oldLogicEnd = "return { markedCount, unmarkedCount: phongList.length - markedCount, markedRooms };\n    }, [phongList, hsList, diemDanhDb]);";

const idxStart = content.indexOf(oldLogicStart);
const idxEnd = content.indexOf(oldLogicEnd);

if (idxStart !== -1 && idxEnd !== -1) {
    const endStr = oldLogicEnd;
    const fullEnd = idxEnd + endStr.length;
    
    const newLogic = `useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDiemDanh(date);
        setOverrides({});
        setSaved(false);
    }, [date, fetchDiemDanh]);

    // Helper: kiểm tra HS có được phép tham gia ngày đặc biệt không
    const isHsAllowed = useCallback((hs) => {
        if (!cauhinhNgay) return true;
        const lopList = cauhinhNgay.lop_ap_dung;
        const hsLoaiTru = cauhinhNgay.hs_loai_tru;
        const hsThemVao = cauhinhNgay.hs_them_vao;
        if (hsThemVao && hsThemVao.some(x => x.id === hs.id)) return true;
        if (lopList && lopList.length > 0 && !lopList.includes(hs.lop)) return false;
        if (hsLoaiTru && hsLoaiTru.length > 0 && hsLoaiTru.includes(hs.id)) return false;
        return true;
    }, [cauhinhNgay]);

    const getStudentsForRoom = useCallback((ma_phong) => {
        const overridedElsewhere = new Set(
            extraHsList.filter(x => x.phong_ngu && x.phong_ngu !== ma_phong).map(x => x.id)
        );
        if (phongTamNgu && ma_phong === phongTamNgu) {
            const allowed = hsList.filter(hs => isHsAllowed(hs) && !overridedElsewhere.has(hs.id));
            const extraIds = new Set(allowed.map(h => h.id));
            const extra = extraHsList.filter(x => (!x.phong_ngu || x.phong_ngu === phongTamNgu) && !extraIds.has(x.id));
            return [...allowed, ...extra];
        }
        const base = hsList.filter(hs => hs.phong_ngu === ma_phong && isHsAllowed(hs) && !overridedElsewhere.has(hs.id));
        const extraFiltered = extraHsList.filter(x => x.phong_ngu === ma_phong).filter(x => !base.find(s => s.id === x.id))
            .map(x => {
                const baseHs = hsList.find(h => h.id === x.id);
                return { ...(baseHs || {}), ...x, phong_ngu: x.phong_ngu };
            });
        return [...base, ...extraFiltered];
    }, [hsList, extraHsList, phongTamNgu, isHsAllowed]);

    const visiblePhongList = useMemo(() => {
        if (!cauhinhNgay) return phongList;
        if (phongTamNgu) {
            const overrideCodes = extraHsList.filter(x => x.phong_ngu && x.phong_ngu !== phongTamNgu).map(x => x.phong_ngu);
            const allCodes = [...new Set([phongTamNgu, ...overrideCodes])];
            const result = allCodes.map(code => phongList.find(p => p.ma_phong === code)).filter(Boolean);
            return result.length > 0 ? result : phongList;
        }
        const filtered = phongList.filter(p => getStudentsForRoom(p.ma_phong).length > 0);
        return filtered.length > 0 ? filtered : phongList;
    }, [phongList, phongTamNgu, cauhinhNgay, extraHsList, getStudentsForRoom]);

    // Auto-select phòng đầu tiên khi danh sách phòng thay đổi
    useEffect(() => {
        if (visiblePhongList.length > 0) {
            const isCurrentValid = selectedPhong && visiblePhongList.some(p => p.ma_phong === selectedPhong.ma_phong);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (!isCurrentValid) setSelectedPhong(visiblePhongList[0]);
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedPhong(null);
        }
    }, [visiblePhongList, selectedPhong]);

    // Logic hiển thị học sinh theo phòng đang chọn
    const students = useMemo(() => {
        if (!selectedPhong) return [];
        return getStudentsForRoom(selectedPhong.ma_phong).map(s => ({
            ...s,
            trang_thai: overrides[s.id] ?? (diemDanhDb[s.id] !== undefined ? STATUS_MAP[diemDanhDb[s.id]] : 'comat'),
        }));
    }, [selectedPhong, diemDanhDb, overrides, getStudentsForRoom]);

    const roomStats = useMemo(() => {
        let markedCount = 0;
        const markedRooms = new Set();
        visiblePhongList.forEach(p => {
            const hsTrongPhong = getStudentsForRoom(p.ma_phong);
            if (hsTrongPhong.length === 0) return;
            if (hsTrongPhong.every(hs => diemDanhDb[hs.id] != null)) {
                markedCount++;
                markedRooms.add(p.ma_phong);
            }
        });
        return { markedCount, unmarkedCount: visiblePhongList.length - markedCount, markedRooms };
    }, [visiblePhongList, diemDanhDb, getStudentsForRoom]);`;

    content = content.substring(0, idxStart) + newLogic + content.substring(fullEnd);
} else {
    console.error("Could not find the section to replace!");
}

// 4. Sidebar: phongList -> visiblePhongList, count -> getStudentsForRoom, và badge TẠM
content = content.replace(
    /\{phongList\.map\(p => \{\s*const count = hsList\.filter\(hs => hs\.phong_ngu === p\.ma_phong\)\.length;/g,
    `{visiblePhongList.map(p => {\n                                    const count = getStudentsForRoom(p.ma_phong).length;`
);

content = content.replace(
    /\{phongList\.length === 0 && <li/g,
    `{visiblePhongList.length === 0 && <li`
);

content = content.replace(
    /<i className="fas fa-bed" style={{ color: '#6c5ce7' }}><\/i>{p\.ma_phong}\n\s*<\/div>/g,
    `<i className="fas fa-bed" style={{ color: '#6c5ce7' }}></i>{p.ma_phong}\n                                                {phongTamNgu && p.ma_phong === phongTamNgu && (\n                                                    <span style={{ marginLeft: 4, fontSize: '0.65rem', background: '#6c5ce7', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>TẠM</span>\n                                                )}\n                                            </div>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched DiemDanhNgu.jsx");
