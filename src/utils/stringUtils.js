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
