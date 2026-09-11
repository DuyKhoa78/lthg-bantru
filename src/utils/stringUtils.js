export const removeAccents = (str) => {
  return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D") : "";
};

export const getSortNames = (fullName) => {
  if (!fullName) return { first: '', middle: '', last: '' };
  const cleanName = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  const parts = cleanName.split(/\s+/);
  const first = parts.pop() || '';
  const last = parts.length > 0 ? parts[0] : '';
  const middle = parts.slice(1).join(' ');
  return { first, middle, last };
};

export const formatLopList = (lopList) => {
  if (!lopList || lopList.length === 0) return '';
  if (lopList.length <= 6) return lopList.join(', ');
  
  const khoiMap = {};
  lopList.forEach(lop => {
      const match = lop.match(/^(\d+)/);
      const khoi = match ? match[1] : 'Khác';
      if (!khoiMap[khoi]) khoiMap[khoi] = [];
      khoiMap[khoi].push(lop);
  });

  const parts = Object.keys(khoiMap).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
  }).map(k => {
      const list = khoiMap[k];
      if (list.length > 3) {
          return `Khối ${k} (${list.length} lớp)`;
      }
      return list.join(', ');
  });
  
  return parts.join(' | ');
};

// ── Cấu hình & Helper sắp xếp học sinh phòng ăn HT.A ───────────────
export const isHTARoom = (roomCode) => {
  if (!roomCode) return false;
  const clean = String(roomCode).replace(/[\.\s_-]/g, '').toUpperCase();
  return clean === 'HTA';
};

// Nhóm danh sách lớp theo yêu cầu:
// DS1: 11A9, 12A1, 12A3, 12A6, 12A8
// DS2: 10A9, 12A2, 12A5, 12A7
// DS3: 10A10, 12A4, 12A9, 12A10
export const HTA_DS_CONFIG = [
  { ds: 1, classes: ['11A9', '12A1', '12A3', '12A6', '12A8'] },
  { ds: 2, classes: ['10A9', '12A2', '12A5', '12A7'] },
  { ds: 3, classes: ['10A10', '12A4', '12A9', '12A10'] },
];

export const normalizeClassName = (cls) => {
  return String(cls || '').trim().toUpperCase().replace(/\s+/g, '');
};

const HTA_CLASS_ORDER_MAP = (() => {
  const map = {};
  let idx = 0;
  HTA_DS_CONFIG.forEach(group => {
    group.classes.forEach(c => {
      map[normalizeClassName(c)] = idx++;
    });
  });
  return map;
})();

export const getHTAClassOrder = (cls) => {
  const key = normalizeClassName(cls);
  return HTA_CLASS_ORDER_MAP[key] !== undefined ? HTA_CLASS_ORDER_MAP[key] : 999;
};

export const getHTAGroupNumber = (cls) => {
  const key = normalizeClassName(cls);
  // 1. Khớp chính xác theo 13 lớp quy định
  for (const group of HTA_DS_CONFIG) {
    if (group.classes.some(c => normalizeClassName(c) === key)) {
      return group.ds;
    }
  }
  // 2. Học sinh lẻ/lớp mới được add linh hoạt vào phòng HT.A:
  // - Khối 11: Xếp vào DS1 (vì DS1 là tờ có khối 11)
  if (key.startsWith('11')) return 1;
  // - Khối 10: Xếp vào DS2 hoặc DS3 (tương ứng với 10A9 ở DS2, 10A10 ở DS3)
  if (key.startsWith('10')) {
    const numMatch = key.match(/\d+A?(\d+)/i);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    return (num >= 10 || num % 2 === 0) ? 3 : 2;
  }
  // - Khối 12: Xếp theo nhóm lớp tương tự hoặc vào DS3
  if (key.startsWith('12')) {
    const numMatch = key.match(/\d+A?(\d+)/i);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    if ([1, 3, 6, 8].includes(num)) return 1;
    if ([2, 5, 7].includes(num)) return 2;
    return 3;
  }
  // Mặc định các trường hợp khác vào DS3
  return 3;
};

// Sắp xếp danh sách học sinh: Nếu là phòng HT.A thì sắp xếp theo 3 nhóm (DS1 -> DS2 -> DS3), trong mỗi nhóm sort thuần theo Mã số bán trú (MSBT)
// Các phòng khác sắp xếp theo MSBT
export const sortStudentsForRoom = (students, roomCode) => {
  if (!students || students.length === 0) return [];
  if (isHTARoom(roomCode)) {
    return [...students].sort((a, b) => {
      const gA = getHTAGroupNumber(a.lop);
      const gB = getHTAGroupNumber(b.lop);
      if (gA !== gB) return gA - gB;
      return Number(a.id) - Number(b.id);
    });
  }
  return [...students].sort((a, b) => Number(a.id) - Number(b.id));
};

// Chia danh sách học sinh theo GV / tờ in:
// Đối với phòng HT.A: chia chính xác theo 3 tờ tương ứng với DS1, DS2, DS3; trong mỗi tờ sort theo Mã bán trú
// Đối với phòng khác: chia đều theo số lượng giáo viên điểm danh
export const splitStudentsByTeachers = (students, numTeachers, roomCode) => {
  if (!students || students.length === 0) return [];
  if (isHTARoom(roomCode)) {
    const g1 = [], g2 = [], g3 = [];
    students.forEach(s => {
      const g = getHTAGroupNumber(s.lop);
      if (g === 1) g1.push(s);
      else if (g === 2) g2.push(s);
      else g3.push(s);
    });
    const sortById = (a, b) => Number(a.id) - Number(b.id);
    g1.sort(sortById);
    g2.sort(sortById);
    g3.sort(sortById);
    const groups = [g1, g2, g3].filter(g => g.length > 0);
    if (groups.length > 0) return groups;
  }

  if (!numTeachers || numTeachers <= 1) return [students];
  const sorted = [...students].sort((a, b) => Number(a.id) - Number(b.id));
  const total = sorted.length;
  const groups = [];
  let start = 0;
  for (let i = 0; i < numTeachers; i++) {
    const count = Math.floor(total / numTeachers) + (i < (total % numTeachers) ? 1 : 0);
    if (count > 0) {
      groups.push(sorted.slice(start, start + count));
      start += count;
    }
  }
  return groups.filter(g => g.length > 0);
};

